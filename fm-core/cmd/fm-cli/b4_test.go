package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	jsonAdapter "github.com/resoul/fm-core/internal/adapters/json"
	"github.com/resoul/fm-core/internal/match/domain"
)

func TestB4CLIRecordingAndReplay(t *testing.T) {
	for _, scenario := range []string{"crosses", "zero", "injury"} {
		t.Run(scenario, func(t *testing.T) {
			dir := t.TempDir()
			raw, err := os.ReadFile("fixtures/match/equal.json")
			if err != nil {
				t.Fatal(err)
			}
			var dto jsonAdapter.MatchInputDTO
			if err = json.Unmarshal(raw, &dto); err != nil {
				t.Fatal(err)
			}
			zero, one, fatigue := 0.0, 1.0, 99.0
			for _, team := range []*jsonAdapter.TeamInputDTO{dto.HomeTeam, dto.AwayTeam} {
				for i := range team.Players {
					p := &team.Players[i]
					frequency := &one
					if scenario != "crosses" {
						frequency = &zero
					}
					p.Instructions = &jsonAdapter.PlayerInstructionsDTO{Pressing: &zero, CrossFrequency: frequency, AerialDuel: &one}
					if scenario == "injury" && p.ID == "h_10" {
						p.StartingCondition.InitialFatigue = &fatigue
					}
				}
				if scenario == "crosses" {
					for i := range team.StartingLineup {
						slot := &team.StartingLineup[i]
						if slot.Slot != "GK" && slot.Slot != "ST_L" && slot.Slot != "ST_R" {
							x := 0.75
							slot.X = &x
							slot.Slot = "wing_" + slot.Slot
							z := 0.28
							slot.Z = &z
						}
					}
				}
			}
			cfg := `{"timing":{"half_duration_ms":60000,"added_time_mode":"none","max_ticks_guard":5000}}`
			if scenario == "injury" {
				dto.RulesProfile = "profile_b1"
				cfg = `{"timing":{"half_duration_ms":60000,"added_time_mode":"none","max_ticks_guard":5000},"rules":{"injuries_enabled":true}}`
			}
			raw, err = json.Marshal(dto)
			if err != nil {
				t.Fatal(err)
			}
			input := filepath.Join(dir, "input.json")
			config := filepath.Join(dir, "config.json")
			record := filepath.Join(dir, "record")
			if err = os.WriteFile(input, raw, 0600); err != nil {
				t.Fatal(err)
			}
			if err = os.WriteFile(config, []byte(cfg), 0600); err != nil {
				t.Fatal(err)
			}
			seed := "3"
			switch scenario {
			case "crosses":
				seed = "2"
			case "injury":
				// A seed whose fatigue-driven injury roll for h_10 lands
				// before halftime under the B7 RNG consumption order.
				seed = "6"
			}
			var stdout, stderr bytes.Buffer
			if code := run([]string{"run", "--input", input, "--config", config, "--seed", seed, "--commands", "fixtures/commands/halftime.json", "--format", "json", "--record", record}, &stdout, &stderr); code != 0 {
				t.Fatalf("run exit=%d: %s", code, &stderr)
			}
			var result domain.MatchResult
			if err = json.Unmarshal(stdout.Bytes(), &result); err != nil {
				t.Fatal(err)
			}
			if result.Status != "finished" {
				t.Fatal(result.Status)
			}
			saves, crosses, openPlayCrosses, receives, injured := 0, 0, 0, 0, false
			crossInFlight, cornerPending := false, false
			for _, event := range result.Events {
				switch event.Type {
				case domain.EventCorner:
					// A corner always delivers via startCross regardless of
					// cross_frequency (B6 slice 2): the resulting EventCross
					// isn't an open-play decision and doesn't count as one.
					cornerPending = true
				case domain.EventCross:
					crosses++
					if !cornerPending {
						openPlayCrosses++
					}
					cornerPending = false
					crossInFlight = true
				case domain.EventReceive:
					if crossInFlight {
						receives++
					}
				case domain.EventPass, domain.EventShot, domain.EventInterception:
					crossInFlight = false
				case domain.EventSave:
					saves++
					if event.PlayerID != "h_1" && event.PlayerID != "a_1" {
						t.Fatalf("save by non-GK: %+v", event)
					}
					if event.TargetPlayerID == "" || event.PlayerID[0] == event.TargetPlayerID[0] {
						t.Fatal("invalid save attribution")
					}
				case domain.EventInjury:
					if event.PlayerID == "h_10" && event.Tick <= 1200 {
						injured = true
					}
				}
			}
			if scenario == "crosses" && (crosses == 0 || receives == 0) {
				t.Fatalf("no resolved cross: crosses=%d receives=%d", crosses, receives)
			}
			if scenario == "zero" && openPlayCrosses != 0 {
				t.Fatal("zero instruction produced an open-play cross")
			}
			if scenario == "injury" && !injured {
				t.Fatal("seed did not injure outgoing player before halftime")
			}
			playerSaves := 0
			subMoved := false
			for _, p := range result.PlayerStats {
				playerSaves += p.Saves
				if p.PlayerID == "h_16" && p.DistanceM > 0 && p.Minutes > 0 {
					subMoved = true
				}
				if p.CompletedPasses > p.Passes {
					t.Fatal("invalid pass totals")
				}
			}
			if saves != playerSaves || !subMoved {
				t.Fatalf("stats mismatch saves=%d/%d subMoved=%v", saves, playerSaves, subMoved)
			}
			onTarget, goals := 0, 0
			for _, stats := range result.TeamStats {
				onTarget += stats.ShotsOnTarget
				goals += stats.Goals
				if stats.ShotsOnTarget > stats.Shots || stats.Goals > stats.ShotsOnTarget || stats.SuccessfulPasses > stats.Passes {
					t.Fatal("invalid team totals")
				}
			}
			if onTarget != goals+saves {
				t.Fatal("shots on target must equal goals plus saves")
			}
			stdout.Reset()
			stderr.Reset()
			if code := run([]string{"replay", "--record", record, "--verify"}, &stdout, &stderr); code != 0 {
				t.Fatalf("replay exit=%d: %s", code, &stderr)
			}
		})
	}
}
