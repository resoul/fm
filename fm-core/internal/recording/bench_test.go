package recording

import (
	"context"
	"os"
	"path/filepath"
	"strconv"
	"testing"

	jsonAdapter "github.com/resoul/fm-core/internal/adapters/json"
	"github.com/resoul/fm-core/internal/match/config"
	"github.com/resoul/fm-core/internal/match/engine"
	"github.com/resoul/fm-core/internal/runner"
)

// BenchmarkFullMatchWithRecording measures a complete match recorded to disk
// (as `run --record` does) so the streamed recording's CPU/allocation cost
// can be compared against BenchmarkFullMatch in internal/match/engine. Run
// with:
//
//	go test ./internal/recording/... -run '^$' -bench BenchmarkFullMatchWithRecording -benchmem
//
// Recording size for a single run is reported separately (see
// docs/performance-baseline.md), since du(1) on the resulting directory is
// more meaningful than per-iteration allocation counts.
func BenchmarkFullMatchWithRecording(b *testing.B) {
	inputBytes, err := os.ReadFile("../../fixtures/match/equal.json")
	if err != nil {
		b.Fatal(err)
	}
	input, err := jsonAdapter.LoadMatchInputFromFile("../../fixtures/match/equal.json")
	if err != nil {
		b.Fatal(err)
	}
	cfg := config.DefaultConfig()
	root := b.TempDir()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		e, err := engine.New(input, cfg, int64(i))
		if err != nil {
			b.Fatal(err)
		}
		dir := filepath.Join(root, strconv.Itoa(i))
		w, err := NewWriter(dir, inputBytes, cfg, int64(i))
		if err != nil {
			b.Fatal(err)
		}
		hooks := runner.Hooks{OnCommand: w.Command, OnStep: w.Step}
		result, err := runner.RunCommandsWithHooks(context.Background(), e, "fast", nil, hooks)
		if err != nil {
			b.Fatal(err)
		}
		if err := w.Finish(result); err != nil {
			b.Fatal(err)
		}
	}
}
