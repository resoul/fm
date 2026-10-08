package runner

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	jsonAdapter "github.com/resoul/fm-core/internal/adapters/json"
	"github.com/resoul/fm-core/internal/match/config"
	"github.com/resoul/fm-core/internal/match/domain"
	"github.com/resoul/fm-core/internal/match/engine"
)

func testInput(t *testing.T) domain.MatchInput {
	t.Helper()
	input, err := jsonAdapter.LoadMatchInputFromFile("../../fixtures/match/equal.json")
	if err != nil {
		t.Fatal(err)
	}
	return input
}

// tinyConfig keeps a full two-half match at a handful of ticks so realtime
// pacing tests do not have to sleep for real match-length durations.
func tinyConfig() config.Config {
	cfg := config.ShortTestConfig()
	cfg.Timing.HalfDurationMs = 200
	cfg.Timing.MaxTicksGuard = 20
	return cfg
}

func newTestEngine(t *testing.T, cfg config.Config, seed int64) *engine.Engine {
	t.Helper()
	e, err := engine.New(testInput(t), cfg, seed)
	if err != nil {
		t.Fatal(err)
	}
	return e
}

func TestRunCompletesMatch(t *testing.T) {
	e := newTestEngine(t, tinyConfig(), 7)
	result, err := Run(context.Background(), e, "fast")
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != "finished" {
		t.Fatalf("status = %q, want finished", result.Status)
	}
	if result.Ticks != 8 {
		t.Fatalf("ticks = %d, want 8 (2 halves * 200ms / 50ms)", result.Ticks)
	}
}

// Realtime pacing must only slow down wall-clock delivery, never change the
// number or order of engine steps or the resulting outcome (AGENTS.md:
// "изменение FPS/pacing не меняет число шагов").
func TestRunRealtimePacingDoesNotChangeOutcome(t *testing.T) {
	fastResult, err := Run(context.Background(), newTestEngine(t, tinyConfig(), 11), "fast")
	if err != nil {
		t.Fatal(err)
	}

	started := time.Now()
	realtimeResult, err := Run(context.Background(), newTestEngine(t, tinyConfig(), 11), "realtime")
	if err != nil {
		t.Fatal(err)
	}
	if elapsed := time.Since(started); elapsed <= 0 {
		t.Fatal("realtime run reported zero elapsed time")
	}

	if fastResult.Ticks != realtimeResult.Ticks {
		t.Fatalf("ticks differ: fast=%d realtime=%d", fastResult.Ticks, realtimeResult.Ticks)
	}
	if fastResult.Score != realtimeResult.Score {
		t.Fatalf("score differs: fast=%+v realtime=%+v", fastResult.Score, realtimeResult.Score)
	}
	if len(fastResult.Events) != len(realtimeResult.Events) {
		t.Fatalf("event count differs: fast=%d realtime=%d", len(fastResult.Events), len(realtimeResult.Events))
	}
}

func TestRunCancelledContextStopsImmediately(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	e := newTestEngine(t, tinyConfig(), 3)
	_, err := Run(ctx, e, "fast")
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v, want context.Canceled", err)
	}
	if e.Tick() != 0 {
		t.Fatalf("tick = %d, want 0 (no step executed before cancellation was observed)", e.Tick())
	}
}

func TestRunRejectedCommandDoesNotAdvanceState(t *testing.T) {
	e := newTestEngine(t, tinyConfig(), 5)
	// Substitutions are only accepted on an allowed stoppage; tick 0 right
	// after kickoff is not one, so the engine must reject it.
	commands := []domain.MatchCommand{
		{ID: "sub", TargetTick: 0, Sequence: 1, Type: domain.CommandSubstitute, TeamID: "home", PlayerOut: "h_10", PlayerIn: "h_16", Slot: "ST_L"},
	}
	_, err := RunCommands(context.Background(), e, "fast", commands)
	if err == nil {
		t.Fatal("expected rejection error, got nil")
	}
	if e.Tick() != 0 {
		t.Fatalf("tick = %d, want 0: a rejected command must not mutate engine state", e.Tick())
	}
}

func TestRunLateCommandErrors(t *testing.T) {
	e := newTestEngine(t, tinyConfig(), 9)
	commands := []domain.MatchCommand{
		{ID: "late", TargetTick: -1, Sequence: 1, Type: domain.CommandPause},
	}
	_, err := RunCommands(context.Background(), e, "fast", commands)
	if err == nil {
		t.Fatal("expected late command error, got nil")
	}
}

func TestRunDuplicateCommandSequenceErrors(t *testing.T) {
	e := newTestEngine(t, tinyConfig(), 13)
	commands := []domain.MatchCommand{
		{ID: "a", TargetTick: 1, Sequence: 1, Type: domain.CommandPause},
		{ID: "b", TargetTick: 1, Sequence: 1, Type: domain.CommandResume},
	}
	_, err := RunCommands(context.Background(), e, "fast", commands)
	if err == nil {
		t.Fatal("expected duplicate sequence error, got nil")
	}
}

func TestRunCommandSequenceMustBeGloballyMonotonic(t *testing.T) {
	e := newTestEngine(t, tinyConfig(), 15)
	commands := []domain.MatchCommand{
		{ID: "later", TargetTick: 2, Sequence: 2, Type: domain.CommandPause},
		{ID: "earlier", TargetTick: 3, Sequence: 1, Type: domain.CommandResume},
	}
	_, err := RunCommands(context.Background(), e, "fast", commands)
	if err == nil || !strings.Contains(err.Error(), "globally monotonic") {
		t.Fatalf("err = %v, want globally-monotonic sequence error", err)
	}
}

func TestRunOnStepHookErrorAborts(t *testing.T) {
	e := newTestEngine(t, tinyConfig(), 17)
	wantErr := errors.New("boom")
	_, err := RunCommandsWithHooks(context.Background(), e, "fast", nil, Hooks{
		OnStep: func(engine.StepOutput) error { return wantErr },
	})
	if !errors.Is(err, wantErr) {
		t.Fatalf("err = %v, want %v", err, wantErr)
	}
}

func TestRunOnCommandHookErrorAborts(t *testing.T) {
	e := newTestEngine(t, tinyConfig(), 19)
	wantErr := errors.New("boom")
	_, err := RunCommandsWithHooks(context.Background(), e, "fast", nil, Hooks{
		OnCommand: func(domain.MatchCommand, domain.CommandOutcome) error { return wantErr },
	})
	if !errors.Is(err, wantErr) {
		t.Fatalf("err = %v, want %v", err, wantErr)
	}
}

func TestRunUnsupportedSpeedErrors(t *testing.T) {
	e := newTestEngine(t, tinyConfig(), 23)
	if _, err := Run(context.Background(), e, "turbo"); err == nil {
		t.Fatal("expected unsupported speed error, got nil")
	}
}

type halftimeTestCoach struct{}

func (halftimeTestCoach) Commands(view domain.CoachView) []domain.MatchCommand {
	if view.Phase != domain.PhaseHalfTime {
		return nil
	}
	adjusted := view.Tactics["home"]
	adjusted.Tempo = 0.8
	return []domain.MatchCommand{{ID: "ai-coach-home-half-time", Type: domain.CommandChangeTactics, TeamID: "home", Tactics: &adjusted}}
}

func TestCoachCommandsAreExplicitlySequencedAndObservedByHooks(t *testing.T) {
	e := newTestEngine(t, tinyConfig(), 29)
	var recorded []domain.MatchCommand
	_, err := RunCommandsWithCoach(context.Background(), e, "fast", nil, Hooks{
		OnCommand: func(command domain.MatchCommand, outcome domain.CommandOutcome) error {
			if strings.HasPrefix(command.ID, "ai-coach-") {
				if !outcome.Accepted {
					t.Fatalf("coach command rejected: %s", outcome.Reason)
				}
				recorded = append(recorded, command)
			}
			return nil
		},
	}, halftimeTestCoach{})
	if err != nil {
		t.Fatal(err)
	}
	if len(recorded) != 1 {
		t.Fatalf("recorded coach commands = %+v, want one", recorded)
	}
	if recorded[0].TargetTick != 4 || recorded[0].Sequence != 1 {
		t.Fatalf("coach command ordering = tick %d sequence %d, want tick 4 sequence 1", recorded[0].TargetTick, recorded[0].Sequence)
	}
}
