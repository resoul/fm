package recording

import (
	"context"
	"os"
	"strings"
	"testing"

	jsonAdapter "github.com/resoul/fm-core/internal/adapters/json"
	"github.com/resoul/fm-core/internal/coach"
	"github.com/resoul/fm-core/internal/match/config"
	"github.com/resoul/fm-core/internal/match/engine"
	"github.com/resoul/fm-core/internal/runner"
)

func b1EventfulConfig(t *testing.T) config.Config {
	t.Helper()
	cfg, err := jsonAdapter.LoadResolvedConfigFromFile("../../configs/b1_short_test.json", config.DefaultConfig())
	if err != nil {
		t.Fatal(err)
	}
	cfg.Timing.HalfDurationMs = 300000
	cfg.Timing.MaxTicksGuard = 20000
	return cfg
}

// TestB6aPolicyRecordingReplaysWithoutRerunningTheCoach records a full match
// with the real B6a coach.Policy (not a test double) attached and requires
// that replay verification passes: replay applies the recorded commands
// (including every coach-issued one) without invoking the policy again, so
// a match with the coach enabled must be exactly as replayable as one
// without it (docs/simulation/coach.md acceptance).
func TestB6aPolicyRecordingReplaysWithoutRerunningTheCoach(t *testing.T) {
	dir := t.TempDir()
	inputBytes, err := os.ReadFile("../../fixtures/match/equal_b1.json")
	if err != nil {
		t.Fatal(err)
	}
	input, err := jsonAdapter.LoadMatchInput(strings.NewReader(string(inputBytes)))
	if err != nil {
		t.Fatal(err)
	}
	cfg := b1EventfulConfig(t)
	// Seed 519 makes the coach substitute at halftime under the B7 model
	// (seed 509 did before B7; the RNG stream is consumed differently now).
	const seed = int64(519)
	e, err := engine.New(input, cfg, seed)
	if err != nil {
		t.Fatal(err)
	}
	w, err := NewWriter(dir, inputBytes, cfg, seed)
	if err != nil {
		t.Fatal(err)
	}
	matchCoach := coach.NewPolicy(input.HomeTeam.ID, input.AwayTeam.ID, coach.DefaultConfig())
	result, err := runner.RunCommandsWithCoach(context.Background(), e, "fast", nil, runner.Hooks{OnCommand: w.Command, OnStep: w.Step}, matchCoach)
	if err != nil {
		t.Fatal(err)
	}
	if err := w.Finish(result); err != nil {
		t.Fatal(err)
	}
	commands, err := readCommands(dir + "/commands.ndjson")
	if err != nil {
		t.Fatal(err)
	}
	sawCoachCommand := false
	for _, c := range commands {
		if strings.HasPrefix(c.ID, "ai-coach-") {
			sawCoachCommand = true
		}
	}
	if !sawCoachCommand {
		t.Fatal("expected at least one recorded ai-coach-* command for this seed")
	}
	if err := Verify(dir); err != nil {
		t.Fatalf("Verify() with the real B6a coach = %v", err)
	}
}
