package main

import (
	"bytes"
	"encoding/json"
	"path/filepath"
	"testing"

	"github.com/resoul/fm-core/internal/match/domain"
)

// TestB6CLIShotSaveAndReplay is an integration check for the full B6 engine
// wiring: slice 1 (Finishing/LongShots split, the three-way save outcome,
// Heading/JumpingReach + goalkeeper cross claims, symmetric foot skills,
// PenaltyTaking) plus slice 2 (real corner/free-kick/goal-kick/throw-in
// restarts, cross delivery quality). A full match still finishes, replay
// verifies, and the invariants that hold across all three save outcomes --
// a save always increments Saves exactly once, regardless of which of the
// three outcomes follows it, so ShotsOnTarget == Goals + total Saves must
// still hold -- are checked directly, since the old "a save is always a
// corner" shortcut is gone. Every corner is also checked to actually
// deliver (an EventCross or EventGoalKick immediately follows it), not just
// hand the ball to the nearest attacker as a label.
func TestB6CLIShotSaveAndReplay(t *testing.T) {
	dir := t.TempDir()
	record := filepath.Join(dir, "record")
	var stdout, stderr bytes.Buffer
	if code := run([]string{"run", "--input", "fixtures/match/equal.json", "--config", "configs/short_test.json", "--seed", "11", "--commands", "fixtures/commands/halftime.json", "--format", "json", "--record", record}, &stdout, &stderr); code != 0 {
		t.Fatalf("run exit=%d: %s", code, &stderr)
	}
	var result domain.MatchResult
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Status != "finished" {
		t.Fatal(result.Status)
	}

	saves, corners := 0, 0
	for i, event := range result.Events {
		switch event.Type {
		case domain.EventSave:
			saves++
		case domain.EventCorner:
			corners++
			if i+1 >= len(result.Events) {
				t.Fatal("corner was the last event of the match -- no delivery followed")
			}
			next := result.Events[i+1].Type
			if next != domain.EventCross && next != domain.EventGoalKick {
				t.Fatalf("corner at event %d not followed by a delivery attempt (cross or wayward goal_kick): next=%s", i, next)
			}
		}
	}
	onTarget, goals := 0, 0
	for _, stats := range result.TeamStats {
		onTarget += stats.ShotsOnTarget
		goals += stats.Goals
		if stats.ShotsOnTarget > stats.Shots || stats.Goals > stats.ShotsOnTarget || stats.SuccessfulPasses > stats.Passes || stats.SuccessfulCrosses > stats.Crosses {
			t.Fatalf("invalid team totals: %+v", stats)
		}
	}
	if onTarget != goals+saves {
		t.Fatalf("shots on target (%d) must equal goals (%d) plus saves (%d) regardless of save outcome type", onTarget, goals, saves)
	}
	// Not every save is a corner any more (a clean catch or a rebound
	// aren't); a corner-per-save count is a regression to the old
	// always-a-corner shortcut.
	if saves > 0 && corners >= saves {
		t.Fatalf("every save resolved to a corner (%d saves, %d corners) -- three-way split regression", saves, corners)
	}
	playerSaves := 0
	for _, p := range result.PlayerStats {
		playerSaves += p.Saves
		if p.CompletedPasses > p.Passes {
			t.Fatalf("invalid player pass totals: %+v", p)
		}
	}
	if playerSaves != saves {
		t.Fatalf("player Saves total (%d) does not match Save events (%d)", playerSaves, saves)
	}

	stdout.Reset()
	stderr.Reset()
	if code := run([]string{"replay", "--record", record, "--verify"}, &stdout, &stderr); code != 0 {
		t.Fatalf("replay exit=%d: %s", code, &stderr)
	}
}
