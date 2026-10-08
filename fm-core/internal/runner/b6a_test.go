package runner

import (
	"context"
	"testing"

	jsonAdapter "github.com/resoul/fm-core/internal/adapters/json"
	"github.com/resoul/fm-core/internal/coach"
	"github.com/resoul/fm-core/internal/match/config"
	"github.com/resoul/fm-core/internal/match/domain"
	"github.com/resoul/fm-core/internal/match/engine"
)

func b1Input(t *testing.T) domain.MatchInput {
	t.Helper()
	input, err := jsonAdapter.LoadMatchInputFromFile("../../fixtures/match/equal_b1.json")
	if err != nil {
		t.Fatal(err)
	}
	return input
}

func b1Config(t *testing.T) config.Config {
	t.Helper()
	cfg, err := jsonAdapter.LoadResolvedConfigFromFile("../../configs/b1_short_test.json", config.DefaultConfig())
	if err != nil {
		t.Fatal(err)
	}
	return cfg
}

// b1TinyConfig keeps profile B1's rule toggles but shrinks the half to a
// handful of ticks, matching tinyConfig's purpose: cheap for a realtime
// pacing test that must actually sleep for the match's simulated duration.
func b1TinyConfig(t *testing.T) config.Config {
	cfg := b1Config(t)
	cfg.Timing.HalfDurationMs = 200
	cfg.Timing.MaxTicksGuard = 20
	return cfg
}

// b1EventfulConfig keeps profile B1's rule toggles with a half long enough
// (5 simulated minutes) for fouls/cards/injuries/fatigue to plausibly occur
// across a seed range, while still running fast in "fast" mode (no
// wall-clock sleep).
func b1EventfulConfig(t *testing.T) config.Config {
	cfg := b1Config(t)
	cfg.Timing.HalfDurationMs = 300000
	cfg.Timing.MaxTicksGuard = 20000
	return cfg
}

// TestB6aCoachNeverProposesARejectedCommand runs a range of profile B1 seeds
// (fouls/cards/injuries enabled) with the B6a coach attached and requires
// that every ai-coach-* command it ever issues is accepted. A rejected
// coach command would mean the policy proposed something the engine did not
// actually allow (wrong window, exhausted limit, ineligible candidate) —
// exactly what docs/simulation/coach.md's acceptance criteria rule out.
func TestB6aCoachNeverProposesARejectedCommand(t *testing.T) {
	input := b1Input(t)
	cfg := b1EventfulConfig(t)
	var sawSubstitution, sawTactics bool
	for seed := int64(500); seed < 530; seed++ {
		e, err := engine.New(input, cfg, seed)
		if err != nil {
			t.Fatalf("seed %d: %v", seed, err)
		}
		matchCoach := coach.NewPolicy(input.HomeTeam.ID, input.AwayTeam.ID, coach.DefaultConfig())
		var coachOutcomes []domain.CommandOutcome
		var coachCommands []domain.MatchCommand
		hooks := Hooks{OnCommand: func(cmd domain.MatchCommand, out domain.CommandOutcome) error {
			if len(cmd.ID) > 9 && cmd.ID[:9] == "ai-coach-" {
				coachCommands = append(coachCommands, cmd)
				coachOutcomes = append(coachOutcomes, out)
			}
			return nil
		}}
		result, err := RunCommandsWithCoach(context.Background(), e, "fast", nil, hooks, matchCoach)
		if err != nil {
			t.Fatalf("seed %d: run error: %v", seed, err)
		}
		if result.Status != "finished" && result.Status != "abandoned" {
			t.Fatalf("seed %d: unexpected status %q", seed, result.Status)
		}
		for i, out := range coachOutcomes {
			if !out.Accepted {
				t.Fatalf("seed %d: coach command %q rejected: %s", seed, coachCommands[i].ID, out.Reason)
			}
			if coachCommands[i].Reason == "" {
				t.Fatalf("seed %d: coach command %q has no explanation", seed, coachCommands[i].ID)
			}
			switch coachCommands[i].Type {
			case domain.CommandSubstitute:
				sawSubstitution = true
			case domain.CommandChangeTactics:
				sawTactics = true
			}
		}
	}
	if !sawTactics {
		t.Fatal("expected at least one accepted tactics reaction across the seed range")
	}
	if !sawSubstitution {
		t.Fatal("expected at least one accepted coach substitution across the seed range")
	}
}

// TestB6aCoachFastAndRealtimeAgree checks the B6a coach does not depend on
// wall-clock pacing: fast and realtime must reach the same result for the
// same seed and scenario.
func TestB6aCoachFastAndRealtimeAgree(t *testing.T) {
	input := b1Input(t)
	cfg := b1TinyConfig(t)
	run := func(speed string) domain.MatchResult {
		e, err := engine.New(input, cfg, 501)
		if err != nil {
			t.Fatal(err)
		}
		matchCoach := coach.NewPolicy(input.HomeTeam.ID, input.AwayTeam.ID, coach.DefaultConfig())
		result, err := RunCommandsWithCoach(context.Background(), e, speed, nil, Hooks{}, matchCoach)
		if err != nil {
			t.Fatalf("%s: %v", speed, err)
		}
		return result
	}
	fast := run("fast")
	realtime := run("realtime")
	if fast.Score != realtime.Score || fast.Ticks != realtime.Ticks || len(fast.Events) != len(realtime.Events) {
		t.Fatalf("fast/realtime diverged: fast=%+v realtime=%+v", fast.Score, realtime.Score)
	}
	if len(fast.CommandOutcomes) != len(realtime.CommandOutcomes) {
		t.Fatalf("fast/realtime command outcome count diverged: %d vs %d", len(fast.CommandOutcomes), len(realtime.CommandOutcomes))
	}
}
