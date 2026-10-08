package domain

import (
	"fmt"
	"strings"
	"testing"
)

func createValidTeam(teamID, teamName string, idOffset int) TeamInput {
	players := make([]PlayerInput, 16)
	// 1 GK + 15 outfielders
	players[0] = PlayerInput{
		ID:   fmt.Sprintf("p_%d", idOffset+1),
		Name: fmt.Sprintf("Player %d (GK)", idOffset+1),
		Role: RoleGK,
		Attributes: PlayerAttributes{
			Pace: 12, Acceleration: 12, Stamina: 14, Passing: 11,
			FirstTouch: 11, Dribbling: 9, Tackling: 10,
			Positioning: 15, Decisions: 14,
			Finishing: 6, LongShots: 6, Crossing: 8, Heading: 12, JumpingReach: 12,
			Left: 10, Right: 15, Corners: 8, FreeKickTaking: 6, PenaltyTaking: 6,
			Handling: 15, Reflexes: 16, OneOnOnes: 15, AerialReach: 14, CommandOfArea: 14,
			Kicking: 12, Throwing: 12,
		},
		StartingCondition: StartingCondition{Fitness: 100, Sharpness: 90, InitialFatigue: 0},
	}

	roles := []Role{
		RoleLB, RoleCB, RoleCB, RoleRB,
		RoleLM, RoleCM, RoleCM, RoleRM,
		RoleST, RoleST,
		// Bench (5 subs)
		RoleGK, RoleCB, RoleCM, RoleLW, RoleST,
	}

	for i := 1; i < 16; i++ {
		role := roles[i-1]
		players[i] = PlayerInput{
			ID:   fmt.Sprintf("p_%d", idOffset+i+1),
			Name: fmt.Sprintf("Player %d (%s)", idOffset+i+1, role),
			Role: role,
			Attributes: PlayerAttributes{
				Pace: 13, Acceleration: 13, Stamina: 14, Passing: 13,
				FirstTouch: 13, Dribbling: 12, Tackling: 12,
				Positioning: 13, Decisions: 13,
				Finishing: 12, LongShots: 12, Crossing: 12, Heading: 12, JumpingReach: 12,
				Left: 10, Right: 15, Corners: 8, FreeKickTaking: 8, PenaltyTaking: 8,
				Handling: 5, Reflexes: 5, OneOnOnes: 5, AerialReach: 5, CommandOfArea: 5,
				Kicking: 5, Throwing: 5,
			},
			StartingCondition: StartingCondition{Fitness: 100, Sharpness: 85, InitialFatigue: 0},
		}
	}

	slots := []string{"GK", "LB", "CB_L", "CB_R", "RB", "LM", "CM_L", "CM_R", "RM", "ST_L", "ST_R"}
	lineup := make([]StartingSlot, 11)
	for i, slot := range slots {
		pos := StandardSlotPositions[slot]
		lineup[i] = StartingSlot{
			Slot:     slot,
			PlayerID: players[i].ID,
			X:        pos[0],
			Z:        pos[1],
		}
	}

	bench := make([]string, 5)
	for i := 0; i < 5; i++ {
		bench[i] = players[11+i].ID
	}

	return TeamInput{
		ID:             teamID,
		Name:           teamName,
		Tactics:        Tactics{Formation: "4-4-2", Width: 0.5, LineHeight: 0.5, Tempo: 0.5, Pressing: 0.5},
		Players:        players,
		StartingLineup: lineup,
		Bench:          bench,
	}
}

func createValidMatchInput() MatchInput {
	return MatchInput{
		SchemaVersion: "v1",
		MatchID:       "match-valid",
		RulesProfile:  "profile_a",
		Pitch:         PitchDimensions{Width: 68.0, Length: 105.0},
		HomeTeam:      createValidTeam("home", "Home FC", 0),
		AwayTeam:      createValidTeam("away", "Away FC", 100),
	}
}

func TestMatchInput_Valid(t *testing.T) {
	input := createValidMatchInput()
	if err := input.Validate(); err != nil {
		t.Fatalf("expected valid MatchInput, got: %v", err)
	}
}

func TestMatchInput_DeepCopy(t *testing.T) {
	input := createValidMatchInput()
	copied := input.DeepCopy()

	// Mutate copy
	copied.MatchID = "mutated"
	copied.HomeTeam.Players[0].Name = "Mutated Name"
	copied.HomeTeam.Bench[0] = "mutated_bench"

	if input.MatchID == "mutated" {
		t.Errorf("DeepCopy failed: original MatchID was mutated")
	}
	if input.HomeTeam.Players[0].Name == "Mutated Name" {
		t.Errorf("DeepCopy failed: original Player was mutated")
	}
	if input.HomeTeam.Bench[0] == "mutated_bench" {
		t.Errorf("DeepCopy failed: original Bench was mutated")
	}
}

func TestTeamInput_OrderedPlayers(t *testing.T) {
	team := createValidTeam("home", "Home FC", 0)
	ordered := team.OrderedPlayers()
	for i := 1; i < len(ordered); i++ {
		if ordered[i-1].ID >= ordered[i].ID {
			t.Errorf("OrderedPlayers not strictly sorted: %s >= %s", ordered[i-1].ID, ordered[i].ID)
		}
	}
}

func TestMatchInput_ValidationErrors(t *testing.T) {
	tests := []struct {
		name        string
		modify      func(m *MatchInput)
		errContains string
	}{
		{
			name:        "bad schema version",
			modify:      func(m *MatchInput) { m.SchemaVersion = "v3" },
			errContains: "unsupported schema version",
		},
		{
			name:        "empty match ID",
			modify:      func(m *MatchInput) { m.MatchID = "" },
			errContains: "match_id cannot be empty",
		},
		{
			name:        "unsupported rules profile",
			modify:      func(m *MatchInput) { m.RulesProfile = "custom" },
			errContains: "unsupported rules profile",
		},
		{
			name:        "pitch width too narrow",
			modify:      func(m *MatchInput) { m.Pitch.Width = 30.0 },
			errContains: "pitch.width",
		},
		{
			name:        "pitch length too short",
			modify:      func(m *MatchInput) { m.Pitch.Length = 50.0 },
			errContains: "pitch.length",
		},
		{
			name:        "duplicate team IDs",
			modify:      func(m *MatchInput) { m.AwayTeam.ID = m.HomeTeam.ID },
			errContains: "duplicate team ID",
		},
		{
			name: "duplicate player across teams",
			modify: func(m *MatchInput) {
				m.AwayTeam.Players[0].ID = m.HomeTeam.Players[0].ID
				m.AwayTeam.StartingLineup[0].PlayerID = m.HomeTeam.Players[0].ID
			},
			errContains: "exists in both home and away teams",
		},
		{
			name: "missing GK in starting lineup",
			modify: func(m *MatchInput) {
				m.HomeTeam.Players[0].Role = RoleCB
				m.HomeTeam.StartingLineup[0].Slot = "CB_EXTRA"
			},
			errContains: "must have exactly 1 goalkeeper",
		},
		{
			name:        "non-GK player assigned to GK slot",
			modify:      func(m *MatchInput) { m.HomeTeam.StartingLineup[0].PlayerID = m.HomeTeam.Players[1].ID },
			errContains: "cannot play as goalkeeper",
		},
		{
			name: "duplicate player in lineup",
			modify: func(m *MatchInput) {
				m.HomeTeam.StartingLineup[1].PlayerID = m.HomeTeam.StartingLineup[0].PlayerID
			},
			errContains: "assigned multiple times",
		},
		{
			name: "starting player also on bench",
			modify: func(m *MatchInput) {
				m.HomeTeam.Bench[0] = m.HomeTeam.StartingLineup[0].PlayerID
			},
			errContains: "both in starting lineup and on bench",
		},
		{
			name: "attribute out of range (>20)",
			modify: func(m *MatchInput) {
				m.HomeTeam.Players[1].Attributes.Passing = 25
			},
			errContains: "must be between 1 and 20",
		},
		{
			name: "attribute out of range (<1)",
			modify: func(m *MatchInput) {
				m.HomeTeam.Players[1].Attributes.Passing = 0
			},
			errContains: "must be between 1 and 20",
		},
		{
			name: "condition fitness out of range",
			modify: func(m *MatchInput) {
				m.HomeTeam.Players[0].StartingCondition.Fitness = 120.0
			},
			errContains: "fitness",
		},
		{
			name: "tactics width out of range",
			modify: func(m *MatchInput) {
				m.HomeTeam.Tactics.Width = 1.5
			},
			errContains: "width",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			input := createValidMatchInput()
			tt.modify(&input)
			err := input.Validate()
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tt.errContains)
			}
			if !strings.Contains(err.Error(), tt.errContains) {
				t.Errorf("error = %q, want substring %q", err.Error(), tt.errContains)
			}
		})
	}
}

// TestB6GKAttributesRequired checks that each of the five new B6 GK-only
// fields (OneOnOnes/AerialReach/CommandOfArea/Kicking/Throwing) is actually
// enforced by validateAttributes' isGK check, the same way Handling/Reflexes
// already were.
func TestB6GKAttributesRequired(t *testing.T) {
	for _, clear := range []func(*PlayerAttributes){
		func(a *PlayerAttributes) { a.OneOnOnes = 0 },
		func(a *PlayerAttributes) { a.AerialReach = 0 },
		func(a *PlayerAttributes) { a.CommandOfArea = 0 },
		func(a *PlayerAttributes) { a.Kicking = 0 },
		func(a *PlayerAttributes) { a.Throwing = 0 },
	} {
		input := createValidMatchInput()
		clear(&input.HomeTeam.Players[0].Attributes)
		if err := input.Validate(); err == nil {
			t.Fatal("expected error for missing required GK attribute")
		}
	}
}
