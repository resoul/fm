package recording

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"

	jsonAdapter "github.com/resoul/fm-core/internal/adapters/json"
	"github.com/resoul/fm-core/internal/match/config"
	"github.com/resoul/fm-core/internal/match/domain"
	"github.com/resoul/fm-core/internal/match/engine"
	"github.com/resoul/fm-core/internal/runner"
)

const schemaVersion = "v1"

type Manifest struct {
	SchemaVersion string `json:"schema_version"`
	EngineVersion string `json:"engine_version"`
	RNG           string `json:"rng"`
	Seed          int64  `json:"seed"`
	InputSHA256   string `json:"input_sha256"`
	ConfigSHA256  string `json:"config_sha256"`
	StepMs        int    `json:"step_ms"`
}

type commandRecord struct {
	Command domain.MatchCommand   `json:"command"`
	Outcome domain.CommandOutcome `json:"outcome"`
}
type completion struct {
	Status   string `json:"status"`
	LastTick int64  `json:"last_tick"`
	Reason   string `json:"reason,omitempty"`
}

type Writer struct {
	dir                                 string
	commands, states, events, checksums *bufio.Writer
	files                               []*os.File
}

func NewWriter(dir string, input []byte, cfg config.Config, seed int64) (*Writer, error) {
	if _, err := os.Stat(dir); err == nil {
		entries, readErr := os.ReadDir(dir)
		if readErr != nil {
			return nil, readErr
		}
		if len(entries) > 0 {
			return nil, fmt.Errorf("recording directory %q is not empty", dir)
		}
	} else if !os.IsNotExist(err) {
		return nil, err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	configBytes, err := config.CanonicalJSON(cfg)
	if err != nil {
		return nil, err
	}
	if err := os.WriteFile(filepath.Join(dir, "input.json"), input, 0o644); err != nil {
		return nil, err
	}
	if err := os.WriteFile(filepath.Join(dir, "config.json"), configBytes, 0o644); err != nil {
		return nil, err
	}
	manifest := Manifest{SchemaVersion: schemaVersion, EngineVersion: engine.Version, RNG: "math/rand-go1", Seed: seed, InputSHA256: hash(input), ConfigSHA256: hash(configBytes), StepMs: cfg.Timing.StepMs}
	manifestBytes, _ := json.MarshalIndent(manifest, "", "  ")
	if err := os.WriteFile(filepath.Join(dir, "manifest.json"), manifestBytes, 0o644); err != nil {
		return nil, err
	}
	w := &Writer{dir: dir}
	for _, name := range []string{"commands.ndjson", "states.ndjson", "events.ndjson", "checksums.ndjson"} {
		f, err := os.Create(filepath.Join(dir, name))
		if err != nil {
			w.Close()
			return nil, err
		}
		w.files = append(w.files, f)
		b := bufio.NewWriter(f)
		switch name {
		case "commands.ndjson":
			w.commands = b
		case "states.ndjson":
			w.states = b
		case "events.ndjson":
			w.events = b
		case "checksums.ndjson":
			w.checksums = b
		}
	}
	return w, nil
}

func (w *Writer) Command(cmd domain.MatchCommand, outcome domain.CommandOutcome) error {
	return writeLine(w.commands, commandRecord{Command: cmd, Outcome: outcome})
}
func (w *Writer) Step(step engine.StepOutput) error {
	if err := writeLine(w.states, step.Snapshot); err != nil {
		return err
	}
	for _, event := range step.Events {
		if err := writeLine(w.events, event); err != nil {
			return err
		}
	}
	return writeLine(w.checksums, map[string]string{"tick": fmt.Sprint(step.Snapshot.Tick), "sha256": step.StateHash})
}
func (w *Writer) Finish(result domain.MatchResult) error {
	b, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(w.dir, "result.json"), b, 0o644); err != nil {
		return err
	}
	if err := writeJSONFile(filepath.Join(w.dir, "completion.json"), completion{Status: result.Status, LastTick: result.Ticks}); err != nil {
		return err
	}
	return w.Close()
}
func (w *Writer) Abort(status string, tick int64, reason string) error {
	_ = writeJSONFile(filepath.Join(w.dir, "completion.json"), completion{Status: status, LastTick: tick, Reason: reason})
	return w.Close()
}
func (w *Writer) Close() error {
	for _, b := range []*bufio.Writer{w.commands, w.states, w.events, w.checksums} {
		if b != nil {
			if err := b.Flush(); err != nil {
				return err
			}
		}
	}
	for _, f := range w.files {
		if err := f.Close(); err != nil {
			return err
		}
	}
	return nil
}

func Verify(dir string) error {
	input, err := os.ReadFile(filepath.Join(dir, "input.json"))
	if err != nil {
		return err
	}
	var cfg config.Config
	if err := readJSON(filepath.Join(dir, "config.json"), &cfg); err != nil {
		return err
	}
	var manifest Manifest
	if err := readJSON(filepath.Join(dir, "manifest.json"), &manifest); err != nil {
		return err
	}
	if manifest.SchemaVersion != schemaVersion || manifest.EngineVersion != engine.Version || manifest.RNG != "math/rand-go1" {
		return fmt.Errorf("replay: unsupported recording version")
	}
	if hash(input) != manifest.InputSHA256 {
		return fmt.Errorf("replay: input hash mismatch")
	}
	configBytes, _ := config.CanonicalJSON(cfg)
	if hash(configBytes) != manifest.ConfigSHA256 {
		return fmt.Errorf("replay: config hash mismatch")
	}
	matchInput, err := jsonAdapter.LoadMatchInput(bytesReader(input))
	if err != nil {
		return err
	}
	commands, err := readCommands(filepath.Join(dir, "commands.ndjson"))
	if err != nil {
		return err
	}
	e, err := engine.New(matchInput, cfg, manifest.Seed)
	if err != nil {
		return err
	}
	expected, err := readChecksums(filepath.Join(dir, "checksums.ndjson"))
	if err != nil {
		return err
	}
	index := 0
	result, err := runner.RunCommandsWithHooks(context.Background(), e, "fast", commands, runner.Hooks{OnStep: func(step engine.StepOutput) error {
		if index >= len(expected) {
			return fmt.Errorf("replay: unexpected checksum at tick %d", step.Snapshot.Tick)
		}
		actual := step.StateHash
		if actual != expected[index].Hash {
			return fmt.Errorf("replay: checksum mismatch at tick %d", step.Snapshot.Tick)
		}
		index++
		return nil
	}})
	if err != nil {
		return err
	}
	if index != len(expected) {
		return fmt.Errorf("replay: checksum count mismatch")
	}
	var recorded domain.MatchResult
	if err := readJSON(filepath.Join(dir, "result.json"), &recorded); err != nil {
		return err
	}
	got, _ := json.Marshal(result)
	want, _ := json.Marshal(recorded)
	if string(got) != string(want) {
		return fmt.Errorf("replay: result mismatch")
	}
	return nil
}

type checksum struct {
	Tick string `json:"tick"`
	Hash string `json:"sha256"`
}

func readCommands(path string) ([]domain.MatchCommand, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	s := bufio.NewScanner(f)
	var result []domain.MatchCommand
	for s.Scan() {
		var r commandRecord
		if err := json.Unmarshal(s.Bytes(), &r); err != nil {
			return nil, err
		}
		if len(r.Command.ID) > 5 && r.Command.ID[:5] == "auto-" {
			continue
		}
		result = append(result, r.Command)
	}
	return result, s.Err()
}
func readChecksums(path string) ([]checksum, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	s := bufio.NewScanner(f)
	var result []checksum
	for s.Scan() {
		var c checksum
		if err := json.Unmarshal(s.Bytes(), &c); err != nil {
			return nil, err
		}
		result = append(result, c)
	}
	return result, s.Err()
}
func writeLine(w *bufio.Writer, value any) error {
	b, err := json.Marshal(value)
	if err != nil {
		return err
	}
	_, err = w.Write(append(b, '\n'))
	return err
}
func writeJSONFile(path string, value any) error {
	b, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0o644)
}
func readJSON(path string, value any) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, value)
}
func hash(b []byte) string           { sum := sha256.Sum256(b); return hex.EncodeToString(sum[:]) }
func bytesReader(b []byte) io.Reader { return &byteReader{b: b} }

type byteReader struct{ b []byte }

func (r *byteReader) Read(p []byte) (int, error) {
	if len(r.b) == 0 {
		return 0, io.EOF
	}
	n := copy(p, r.b)
	r.b = r.b[n:]
	return n, nil
}
