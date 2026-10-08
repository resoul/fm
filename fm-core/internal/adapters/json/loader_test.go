package json

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/resoul/fm-core/internal/match/config"
)

const minimalValidMatchJSON = `{
  "schema_version": "v1",
  "match_id": "test-match",
  "rules_profile": "profile_a",
  "pitch": {
    "width": 68.0,
    "length": 105.0
  },
  "home_team": {
    "id": "home",
    "name": "Home FC",
    "tactics": {
      "formation": "4-4-2",
      "width": 0.5,
      "line_height": 0.5,
      "tempo": 0.5,
      "pressing": 0.5
    },
    "players": [
      {
        "id": "h_1", "name": "Keeper", "role": "GK",
        "attributes": {
          "pace": 12, "acceleration": 12, "stamina": 14, "passing": 12,
          "first_touch": 12, "dribbling": 10, "tackling": 10, "shooting": 6,
          "positioning": 15, "decisions": 14, "handling": 15, "reflexes": 16
        },
        "starting_condition": {"fitness": 100, "sharpness": 90, "initial_fatigue": 0}
      },
      {"id": "h_2", "name": "LB", "role": "LB", "attributes": {"pace": 13, "acceleration": 13, "stamina": 14, "passing": 12, "first_touch": 12, "dribbling": 11, "tackling": 13, "shooting": 8, "positioning": 13, "decisions": 12}, "starting_condition": {"fitness": 100, "sharpness": 85, "initial_fatigue": 0}},
      {"id": "h_3", "name": "CB1", "role": "CB", "attributes": {"pace": 12, "acceleration": 12, "stamina": 15, "passing": 11, "first_touch": 11, "dribbling": 9, "tackling": 15, "shooting": 6, "positioning": 15, "decisions": 13}, "starting_condition": {"fitness": 100, "sharpness": 85, "initial_fatigue": 0}},
      {"id": "h_4", "name": "CB2", "role": "CB", "attributes": {"pace": 12, "acceleration": 12, "stamina": 15, "passing": 11, "first_touch": 11, "dribbling": 9, "tackling": 15, "shooting": 6, "positioning": 15, "decisions": 13}, "starting_condition": {"fitness": 100, "sharpness": 85, "initial_fatigue": 0}},
      {"id": "h_5", "name": "RB", "role": "RB", "attributes": {"pace": 13, "acceleration": 13, "stamina": 14, "passing": 12, "first_touch": 12, "dribbling": 11, "tackling": 13, "shooting": 8, "positioning": 13, "decisions": 12}, "starting_condition": {"fitness": 100, "sharpness": 85, "initial_fatigue": 0}},
      {"id": "h_6", "name": "LM", "role": "LM", "attributes": {"pace": 14, "acceleration": 14, "stamina": 14, "passing": 13, "first_touch": 14, "dribbling": 14, "tackling": 9, "shooting": 11, "positioning": 12, "decisions": 13}, "starting_condition": {"fitness": 100, "sharpness": 85, "initial_fatigue": 0}},
      {"id": "h_7", "name": "CM1", "role": "CM", "attributes": {"pace": 12, "acceleration": 12, "stamina": 16, "passing": 15, "first_touch": 14, "dribbling": 13, "tackling": 12, "shooting": 11, "positioning": 14, "decisions": 15}, "starting_condition": {"fitness": 100, "sharpness": 85, "initial_fatigue": 0}},
      {"id": "h_8", "name": "CM2", "role": "CM", "attributes": {"pace": 12, "acceleration": 12, "stamina": 16, "passing": 15, "first_touch": 14, "dribbling": 13, "tackling": 12, "shooting": 11, "positioning": 14, "decisions": 15}, "starting_condition": {"fitness": 100, "sharpness": 85, "initial_fatigue": 0}},
      {"id": "h_9", "name": "RM", "role": "RM", "attributes": {"pace": 14, "acceleration": 14, "stamina": 14, "passing": 13, "first_touch": 14, "dribbling": 14, "tackling": 9, "shooting": 11, "positioning": 12, "decisions": 13}, "starting_condition": {"fitness": 100, "sharpness": 85, "initial_fatigue": 0}},
      {"id": "h_10", "name": "ST1", "role": "ST", "attributes": {"pace": 14, "acceleration": 14, "stamina": 13, "passing": 12, "first_touch": 13, "dribbling": 13, "tackling": 7, "shooting": 15, "positioning": 14, "decisions": 13}, "starting_condition": {"fitness": 100, "sharpness": 85, "initial_fatigue": 0}},
      {"id": "h_11", "name": "ST2", "role": "ST", "attributes": {"pace": 14, "acceleration": 14, "stamina": 13, "passing": 12, "first_touch": 13, "dribbling": 13, "tackling": 7, "shooting": 15, "positioning": 14, "decisions": 13}, "starting_condition": {"fitness": 100, "sharpness": 85, "initial_fatigue": 0}}
    ],
    "starting_lineup": [
      {"slot": "GK", "player_id": "h_1"},
      {"slot": "LB", "player_id": "h_2"},
      {"slot": "CB_L", "player_id": "h_3"},
      {"slot": "CB_R", "player_id": "h_4"},
      {"slot": "RB", "player_id": "h_5"},
      {"slot": "LM", "player_id": "h_6"},
      {"slot": "CM_L", "player_id": "h_7"},
      {"slot": "CM_R", "player_id": "h_8"},
      {"slot": "RM", "player_id": "h_9"},
      {"slot": "ST_L", "player_id": "h_10"},
      {"slot": "ST_R", "player_id": "h_11"}
    ],
    "bench": []
  },
  "away_team": {
    "id": "away",
    "name": "Away FC",
    "tactics": {
      "formation": "4-4-2",
      "width": 0.5,
      "line_height": 0.5,
      "tempo": 0.5,
      "pressing": 0.5
    },
    "players": [
      {"id": "a_1", "name": "Keeper", "role": "GK", "attributes": {"pace": 12, "acceleration": 12, "stamina": 14, "passing": 12, "first_touch": 12, "dribbling": 10, "tackling": 10, "shooting": 6, "positioning": 15, "decisions": 14, "handling": 15, "reflexes": 16}, "starting_condition": {"fitness": 100, "sharpness": 90, "initial_fatigue": 0}},
      {"id": "a_2", "name": "LB", "role": "LB", "attributes": {"pace": 13, "acceleration": 13, "stamina": 14, "passing": 12, "first_touch": 12, "dribbling": 11, "tackling": 13, "shooting": 8, "positioning": 13, "decisions": 12}, "starting_condition": {"fitness": 100, "sharpness": 85, "initial_fatigue": 0}},
      {"id": "a_3", "name": "CB1", "role": "CB", "attributes": {"pace": 12, "acceleration": 12, "stamina": 15, "passing": 11, "first_touch": 11, "dribbling": 9, "tackling": 15, "shooting": 6, "positioning": 15, "decisions": 13}, "starting_condition": {"fitness": 100, "sharpness": 85, "initial_fatigue": 0}},
      {"id": "a_4", "name": "CB2", "role": "CB", "attributes": {"pace": 12, "acceleration": 12, "stamina": 15, "passing": 11, "first_touch": 11, "dribbling": 9, "tackling": 15, "shooting": 6, "positioning": 15, "decisions": 13}, "starting_condition": {"fitness": 100, "sharpness": 85, "initial_fatigue": 0}},
      {"id": "a_5", "name": "RB", "role": "RB", "attributes": {"pace": 13, "acceleration": 13, "stamina": 14, "passing": 12, "first_touch": 12, "dribbling": 11, "tackling": 13, "shooting": 8, "positioning": 13, "decisions": 12}, "starting_condition": {"fitness": 100, "sharpness": 85, "initial_fatigue": 0}},
      {"id": "a_6", "name": "LM", "role": "LM", "attributes": {"pace": 14, "acceleration": 14, "stamina": 14, "passing": 13, "first_touch": 14, "dribbling": 14, "tackling": 9, "shooting": 11, "positioning": 12, "decisions": 13}, "starting_condition": {"fitness": 100, "sharpness": 85, "initial_fatigue": 0}},
      {"id": "a_7", "name": "CM1", "role": "CM", "attributes": {"pace": 12, "acceleration": 12, "stamina": 16, "passing": 15, "first_touch": 14, "dribbling": 13, "tackling": 12, "shooting": 11, "positioning": 14, "decisions": 15}, "starting_condition": {"fitness": 100, "sharpness": 85, "initial_fatigue": 0}},
      {"id": "a_8", "name": "CM2", "role": "CM", "attributes": {"pace": 12, "acceleration": 12, "stamina": 16, "passing": 15, "first_touch": 14, "dribbling": 13, "tackling": 12, "shooting": 11, "positioning": 14, "decisions": 15}, "starting_condition": {"fitness": 100, "sharpness": 85, "initial_fatigue": 0}},
      {"id": "a_9", "name": "RM", "role": "RM", "attributes": {"pace": 14, "acceleration": 14, "stamina": 14, "passing": 13, "first_touch": 14, "dribbling": 14, "tackling": 9, "shooting": 11, "positioning": 12, "decisions": 13}, "starting_condition": {"fitness": 100, "sharpness": 85, "initial_fatigue": 0}},
      {"id": "a_10", "name": "ST1", "role": "ST", "attributes": {"pace": 14, "acceleration": 14, "stamina": 13, "passing": 12, "first_touch": 13, "dribbling": 13, "tackling": 7, "shooting": 15, "positioning": 14, "decisions": 13}, "starting_condition": {"fitness": 100, "sharpness": 85, "initial_fatigue": 0}},
      {"id": "a_11", "name": "ST2", "role": "ST", "attributes": {"pace": 14, "acceleration": 14, "stamina": 13, "passing": 12, "first_touch": 13, "dribbling": 13, "tackling": 7, "shooting": 15, "positioning": 14, "decisions": 13}, "starting_condition": {"fitness": 100, "sharpness": 85, "initial_fatigue": 0}}
    ],
    "starting_lineup": [
      {"slot": "GK", "player_id": "a_1"},
      {"slot": "LB", "player_id": "a_2"},
      {"slot": "CB_L", "player_id": "a_3"},
      {"slot": "CB_R", "player_id": "a_4"},
      {"slot": "RB", "player_id": "a_5"},
      {"slot": "LM", "player_id": "a_6"},
      {"slot": "CM_L", "player_id": "a_7"},
      {"slot": "CM_R", "player_id": "a_8"},
      {"slot": "RM", "player_id": "a_9"},
      {"slot": "ST_L", "player_id": "a_10"},
      {"slot": "ST_R", "player_id": "a_11"}
    ],
    "bench": []
  }
}`

func TestLoadMatchInput_Valid(t *testing.T) {
	in, err := LoadMatchInput(strings.NewReader(minimalValidMatchJSON))
	if err != nil {
		t.Fatalf("expected valid match input, got: %v", err)
	}
	if in.MatchID != "test-match" {
		t.Errorf("MatchID = %q, want %q", in.MatchID, "test-match")
	}
	if len(in.HomeTeam.StartingLineup) != 11 {
		t.Errorf("Home lineup count = %d, want 11", len(in.HomeTeam.StartingLineup))
	}
}

func TestLoadMatchInput_UnknownField(t *testing.T) {
	badJSON := strings.Replace(minimalValidMatchJSON, `"match_id": "test-match",`, `"match_id": "test-match", "extra_field": 123,`, 1)
	_, err := LoadMatchInput(strings.NewReader(badJSON))
	if err == nil {
		t.Fatal("expected error for unknown field, got nil")
	}
	if !strings.Contains(err.Error(), "unknown field") {
		t.Errorf("error = %q, want substring 'unknown field'", err.Error())
	}
}

func TestLoadMatchInput_TrailingContent(t *testing.T) {
	badJSON := minimalValidMatchJSON + " { \"trailing\": true }"
	_, err := LoadMatchInput(strings.NewReader(badJSON))
	if err == nil {
		t.Fatal("expected error for trailing content, got nil")
	}
}

func TestLoadConfigOverrides_Valid(t *testing.T) {
	cfgJSON := `{
		"profile_name": "custom",
		"timing": {
			"step_ms": 25,
			"max_ticks_guard": 300000
		}
	}`
	overrides, err := LoadConfigOverrides(strings.NewReader(cfgJSON))
	if err != nil {
		t.Fatalf("failed to parse config overrides: %v", err)
	}
	merged, err := config.Merge(config.DefaultConfig(), overrides)
	if err != nil {
		t.Fatalf("failed to merge config: %v", err)
	}
	if merged.Timing.StepMs != 25 {
		t.Errorf("merged step_ms = %d, want 25", merged.Timing.StepMs)
	}
	if merged.Pitch.WidthM != 68.0 {
		t.Errorf("merged pitch.width = %v, want 68.0", merged.Pitch.WidthM)
	}
}

func TestLoadConfigOverrides_UnknownField(t *testing.T) {
	badJSON := `{
		"unknown_key": "bad"
	}`
	_, err := LoadConfigOverrides(strings.NewReader(badJSON))
	if err == nil {
		t.Fatal("expected error for unknown config field, got nil")
	}
	if !strings.Contains(err.Error(), "unknown field") {
		t.Errorf("error = %q, want substring 'unknown field'", err.Error())
	}
}

func TestFixtures(t *testing.T) {
	fixtures := []string{
		"../../../fixtures/match/equal.json",
		"../../../fixtures/match/favorite.json",
		"../../../fixtures/match/tired.json",
	}

	for _, path := range fixtures {
		t.Run(path, func(t *testing.T) {
			matchInput, err := LoadMatchInputFromFile(path)
			if err != nil {
				t.Fatalf("LoadMatchInputFromFile(%q) failed: %v", path, err)
			}
			if err := matchInput.Validate(); err != nil {
				t.Fatalf("matchInput.Validate() failed for %q: %v", path, err)
			}
		})
	}
}

func TestNegativeTestdata(t *testing.T) {
	negatives := []string{
		"../../../testdata/match/invalid_json.json",
		"../../../testdata/match/unknown_field.json",
		"../../../testdata/match/unknown_version.json",
		"../../../testdata/match/duplicate_team_id.json",
		"../../../testdata/match/duplicate_player_id.json",
		"../../../testdata/match/missing_gk.json",
		"../../../testdata/match/multiple_gk.json",
		"../../../testdata/match/not_11_players.json",
		"../../../testdata/match/missing_condition.json",
		"../../../testdata/match/invalid_attribute.json",
		"../../../testdata/match/invalid_slot.json",
		"../../../testdata/match/slot_role_mismatch.json",
	}

	for _, path := range negatives {
		t.Run(path, func(t *testing.T) {
			_, err := LoadMatchInputFromFile(path)
			if err == nil {
				t.Fatalf("expected error for negative testdata %q, got nil", path)
			}
		})
	}
}

func TestB4InstructionDefaultsPreserveExplicitZero(t *testing.T) {
	raw, err := os.ReadFile("../../../fixtures/match/equal.json")
	if err != nil {
		t.Fatal(err)
	}
	var dto MatchInputDTO
	if err = json.Unmarshal(raw, &dto); err != nil {
		t.Fatal(err)
	}
	zero := 0.0
	dto.HomeTeam.Players[0].Instructions = nil
	dto.HomeTeam.Players[1].Instructions = &PlayerInstructionsDTO{Pressing: &zero, CrossFrequency: &zero, AerialDuel: &zero}
	input, err := dto.ToDomain()
	if err != nil {
		t.Fatal(err)
	}
	omitted, explicit := input.HomeTeam.Players[0].Instructions, input.HomeTeam.Players[1].Instructions
	if omitted.Pressing != 0.5 || omitted.CrossFrequency != 0.5 || omitted.AerialDuel != 0.5 {
		t.Fatal("missing defaults")
	}
	if explicit.Pressing != 0 || explicit.CrossFrequency != 0 || explicit.AerialDuel != 0 {
		t.Fatal("zero replaced by default")
	}
}
