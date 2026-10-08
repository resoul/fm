package main

import (
	"bytes"
	"encoding/json"
	"path/filepath"
	"testing"

	"github.com/resoul/fm-core/internal/match/domain"
)

// TestB5CLITacticsShapeAndReplay is an integration check for the full B5
// engine wiring (Acceleration/Fitness/Sharpness/Decisions/Positioning/
// FirstTouch/Width/LineHeight from slice 1, plus the Tackling/Dribbling
// contest and the shouldPress tick-order fix from slice 2): a full match
// with the existing halftime width/line_height change
// (fixtures/commands/halftime.json) must still finish, keep every existing
// invariant -- the tackle contest is probabilistic so its occurrence isn't
// asserted here, only that nothing it touches (interception events,
// possession/stat invariants) breaks -- and its recording must replay
// verify cleanly.
func TestB5CLITacticsShapeAndReplay(t *testing.T) {
	dir := t.TempDir()
	record := filepath.Join(dir, "record")
	var stdout, stderr bytes.Buffer
	if code := run([]string{"run", "--input", "fixtures/match/equal.json", "--config", "configs/short_test.json", "--seed", "7", "--commands", "fixtures/commands/halftime.json", "--format", "json", "--record", record}, &stdout, &stderr); code != 0 {
		t.Fatalf("run exit=%d: %s", code, &stderr)
	}
	var result domain.MatchResult
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Status != "finished" {
		t.Fatal(result.Status)
	}
	tacticsChanged, subMoved := false, false
	for _, event := range result.Events {
		if event.Type == domain.EventTacticsChange && event.TeamID == "home" {
			tacticsChanged = true
		}
	}
	if !tacticsChanged {
		t.Fatal("expected a home tactics_change event at halftime")
	}
	for _, stats := range result.TeamStats {
		if stats.ShotsOnTarget > stats.Shots || stats.Goals > stats.ShotsOnTarget || stats.SuccessfulPasses > stats.Passes || stats.SuccessfulCrosses > stats.Crosses {
			t.Fatalf("invalid team totals: %+v", stats)
		}
	}
	for _, p := range result.PlayerStats {
		if p.CompletedPasses > p.Passes {
			t.Fatalf("invalid player pass totals: %+v", p)
		}
		if p.PlayerID == "h_16" && p.DistanceM > 0 && p.Minutes > 0 {
			subMoved = true
		}
	}
	if !subMoved {
		t.Fatal("substitute did not move/participate (fitness-scaled speed regression)")
	}
	stdout.Reset()
	stderr.Reset()
	if code := run([]string{"replay", "--record", record, "--verify"}, &stdout, &stderr); code != 0 {
		t.Fatalf("replay exit=%d: %s", code, &stderr)
	}
}
