package recording

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	jsonAdapter "github.com/resoul/fm-core/internal/adapters/json"
	"github.com/resoul/fm-core/internal/match/config"
	"github.com/resoul/fm-core/internal/match/domain"
	"github.com/resoul/fm-core/internal/match/engine"
	"github.com/resoul/fm-core/internal/runner"
)

func testInputBytes(t *testing.T) []byte {
	t.Helper()
	b, err := os.ReadFile("../../fixtures/match/equal.json")
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func tinyConfig() config.Config {
	cfg := config.ShortTestConfig()
	cfg.Timing.HalfDurationMs = 200
	cfg.Timing.MaxTicksGuard = 20
	return cfg
}

// recordMatch runs a full tiny match through a Writer exactly the way
// cmd/fm-cli's `run --record` does, and returns the directory it wrote to.
func recordMatch(t *testing.T, dir string, seed int64) domain.MatchResult {
	t.Helper()
	inputBytes := testInputBytes(t)
	input, err := jsonAdapter.LoadMatchInput(strings.NewReader(string(inputBytes)))
	if err != nil {
		t.Fatal(err)
	}
	cfg := tinyConfig()
	e, err := engine.New(input, cfg, seed)
	if err != nil {
		t.Fatal(err)
	}
	w, err := NewWriter(dir, inputBytes, cfg, seed)
	if err != nil {
		t.Fatal(err)
	}
	hooks := runner.Hooks{OnCommand: w.Command, OnStep: w.Step}
	result, err := runner.RunCommandsWithHooks(context.Background(), e, "fast", nil, hooks)
	if err != nil {
		t.Fatal(err)
	}
	if err := w.Finish(result); err != nil {
		t.Fatal(err)
	}
	return result
}

func TestWriterAndVerifyRoundTrip(t *testing.T) {
	dir := t.TempDir()
	result := recordMatch(t, dir, 42)
	if result.Status != "finished" {
		t.Fatalf("status = %q, want finished", result.Status)
	}
	if err := Verify(dir); err != nil {
		t.Fatalf("Verify() = %v, want nil for an untouched recording", err)
	}
}

type replayCoach struct{}

func (replayCoach) Commands(view domain.CoachView) []domain.MatchCommand {
	if view.Phase != domain.PhaseHalfTime {
		return nil
	}
	updated := view.Tactics["home"]
	updated.Tempo = 0.8
	return []domain.MatchCommand{{ID: "ai-coach-home-half-time", Type: domain.CommandChangeTactics, TeamID: "home", Tactics: &updated}}
}

func TestWriterAndVerifyRoundTripWithCoachCommand(t *testing.T) {
	dir := t.TempDir()
	inputBytes := testInputBytes(t)
	input, err := jsonAdapter.LoadMatchInput(strings.NewReader(string(inputBytes)))
	if err != nil {
		t.Fatal(err)
	}
	cfg := tinyConfig()
	e, err := engine.New(input, cfg, 51)
	if err != nil {
		t.Fatal(err)
	}
	w, err := NewWriter(dir, inputBytes, cfg, 51)
	if err != nil {
		t.Fatal(err)
	}
	result, err := runner.RunCommandsWithCoach(context.Background(), e, "fast", nil, runner.Hooks{OnCommand: w.Command, OnStep: w.Step}, replayCoach{})
	if err != nil {
		t.Fatal(err)
	}
	if err := w.Finish(result); err != nil {
		t.Fatal(err)
	}
	commands, err := readCommands(filepath.Join(dir, "commands.ndjson"))
	if err != nil {
		t.Fatal(err)
	}
	if len(commands) != 1 || commands[0].ID != "ai-coach-home-half-time" || commands[0].Sequence == 0 {
		t.Fatalf("recorded commands = %+v, want explicit AI command", commands)
	}
	if err := Verify(dir); err != nil {
		t.Fatalf("Verify() with recorded AI command = %v", err)
	}
}

// TestWriterFinishRecordsActualResultStatus guards against completion.json
// hardcoding "finished" regardless of what the engine actually produced: a
// B1 match that ends in domain.PhaseAbandoned (too few players left on one
// side) returns MatchResult.Status == "abandoned", and the recording must
// say so too, not silently relabel it as a normal finish.
func TestWriterFinishRecordsActualResultStatus(t *testing.T) {
	dir := t.TempDir()
	inputBytes := testInputBytes(t)
	w, err := NewWriter(dir, inputBytes, tinyConfig(), 1)
	if err != nil {
		t.Fatal(err)
	}
	abandoned := domain.MatchResult{Status: "abandoned", MatchID: "m", RulesProfile: "profile_b1", Ticks: 3, AbandonReason: "team \"away\" has 6 active players (< 7 required)"}
	if err := w.Finish(abandoned); err != nil {
		t.Fatal(err)
	}
	var completion completion
	b, err := os.ReadFile(filepath.Join(dir, "completion.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(b, &completion); err != nil {
		t.Fatal(err)
	}
	if completion.Status != "abandoned" {
		t.Fatalf("completion.status = %q, want abandoned (matching the recorded result)", completion.Status)
	}
}

func TestNewWriterRejectsNonEmptyDirectory(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "stray.txt"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := NewWriter(dir, testInputBytes(t), tinyConfig(), 1); err == nil {
		t.Fatal("expected error for a non-empty recording directory, got nil")
	}
}

func TestVerifyDetectsCorruptedChecksum(t *testing.T) {
	dir := t.TempDir()
	recordMatch(t, dir, 42)

	path := filepath.Join(dir, "checksums.ndjson")
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	corrupted := strings.Replace(string(b), "\"sha256\":\"", "\"sha256\":\"ff", 1)
	if corrupted == string(b) {
		t.Fatal("failed to corrupt checksums.ndjson; test fixture format changed")
	}
	if err := os.WriteFile(path, []byte(corrupted), 0o644); err != nil {
		t.Fatal(err)
	}

	err = Verify(dir)
	if err == nil {
		t.Fatal("expected Verify to detect the corrupted checksum, got nil")
	}
	if !strings.Contains(err.Error(), "checksum mismatch at tick") {
		t.Fatalf("err = %v, want it to name the first diverging tick", err)
	}
}

func TestVerifyDetectsInputTampering(t *testing.T) {
	dir := t.TempDir()
	recordMatch(t, dir, 42)

	path := filepath.Join(dir, "input.json")
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, append(b, ' '), 0o644); err != nil {
		t.Fatal(err)
	}

	err = Verify(dir)
	if err == nil || !strings.Contains(err.Error(), "input hash mismatch") {
		t.Fatalf("err = %v, want input hash mismatch", err)
	}
}

func TestVerifyDetectsUnsupportedVersion(t *testing.T) {
	dir := t.TempDir()
	recordMatch(t, dir, 42)

	path := filepath.Join(dir, "manifest.json")
	var manifest Manifest
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(b, &manifest); err != nil {
		t.Fatal(err)
	}
	manifest.SchemaVersion = "v99"
	out, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, out, 0o644); err != nil {
		t.Fatal(err)
	}

	err = Verify(dir)
	if err == nil || !strings.Contains(err.Error(), "unsupported recording version") {
		t.Fatalf("err = %v, want unsupported recording version", err)
	}
}

func TestVerifyDiagnosesAbortedRecording(t *testing.T) {
	dir := t.TempDir()
	input, err := jsonAdapter.LoadMatchInput(strings.NewReader(string(testInputBytes(t))))
	if err != nil {
		t.Fatal(err)
	}
	cfg := tinyConfig()
	e, err := engine.New(input, cfg, 1)
	if err != nil {
		t.Fatal(err)
	}
	w, err := NewWriter(dir, testInputBytes(t), cfg, 1)
	if err != nil {
		t.Fatal(err)
	}
	// Advance a couple of ticks through the writer, then abort instead of
	// finishing: this must leave no result.json/completion "finished",
	// and Verify must diagnose the recording as incomplete rather than
	// silently accepting it or panicking.
	e.EnableStateHash()
	if out := e.Apply(domain.MatchCommand{ID: "start", TargetTick: 0, Type: domain.CommandStart}); !out.Accepted {
		t.Fatal(out.Reason)
	}
	for i := 0; i < 2; i++ {
		step, err := e.Step()
		if err != nil {
			t.Fatal(err)
		}
		if err := w.Step(step); err != nil {
			t.Fatal(err)
		}
	}
	if err := w.Abort("cancelled", e.Tick(), "test abort"); err != nil {
		t.Fatal(err)
	}

	var completion completion
	completionBytes, err := os.ReadFile(filepath.Join(dir, "completion.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(completionBytes, &completion); err != nil {
		t.Fatal(err)
	}
	if completion.Status != "cancelled" {
		t.Fatalf("completion status = %q, want cancelled", completion.Status)
	}

	if err := Verify(dir); err == nil {
		t.Fatal("expected Verify to fail on a recording with no result.json, got nil")
	}
}

func TestVerifyMissingDirectory(t *testing.T) {
	if err := Verify(filepath.Join(t.TempDir(), "does-not-exist")); err == nil {
		t.Fatal("expected error for a missing recording directory, got nil")
	}
}

func TestB4RejectsLegacyEngineRecording(t *testing.T) {
	dir := t.TempDir()
	recordMatch(t, dir, 42)
	path := filepath.Join(dir, "manifest.json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var manifest Manifest
	if err = json.Unmarshal(data, &manifest); err != nil {
		t.Fatal(err)
	}
	if manifest.EngineVersion != engine.Version {
		t.Fatal("writer omitted current model version")
	}
	manifest.EngineVersion = "a4"
	data, err = json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
	if err = Verify(dir); err == nil || !strings.Contains(err.Error(), "unsupported recording version") {
		t.Fatalf("legacy replay: %v", err)
	}
}
