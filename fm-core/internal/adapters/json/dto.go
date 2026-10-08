package json

import (
	"fmt"
	"math"

	"github.com/resoul/fm-core/internal/match/domain"
)

// PitchDTO represents pitch dimensions in JSON schema v1.
type PitchDTO struct {
	Width  *float64 `json:"width"`
	Length *float64 `json:"length"`
}

// StartingConditionDTO represents player condition in JSON schema v1.
type StartingConditionDTO struct {
	Fitness        *float64 `json:"fitness"`
	Sharpness      *float64 `json:"sharpness"`
	InitialFatigue *float64 `json:"initial_fatigue"`
}

// PlayerAttributesDTO represents player attributes on scale 1..20. Shooting/
// Aerial/WeakFoot are schema v1 only; the rest of the new fields are schema
// v2 only. mapAttributes rejects mixing the two (see decisions.md, decision 26).
type PlayerAttributesDTO struct {
	Pace         *int `json:"pace"`
	Acceleration *int `json:"acceleration"`
	Stamina      *int `json:"stamina"`
	Passing      *int `json:"passing"`
	FirstTouch   *int `json:"first_touch"`
	Dribbling    *int `json:"dribbling"`
	Tackling     *int `json:"tackling"`
	Positioning  *int `json:"positioning"`
	Decisions    *int `json:"decisions"`
	Handling     *int `json:"handling,omitempty"`
	Reflexes     *int `json:"reflexes,omitempty"`

	// Schema v1 only.
	Shooting *int `json:"shooting,omitempty"`
	Aerial   *int `json:"aerial,omitempty"`
	WeakFoot *int `json:"weak_foot,omitempty"`

	// Schema v2 only.
	Finishing      *int `json:"finishing,omitempty"`
	LongShots      *int `json:"long_shots,omitempty"`
	Crossing       *int `json:"crossing,omitempty"`
	Heading        *int `json:"heading,omitempty"`
	JumpingReach   *int `json:"jumping_reach,omitempty"`
	Left           *int `json:"left,omitempty"`
	Right          *int `json:"right,omitempty"`
	Corners        *int `json:"corners,omitempty"`
	FreeKickTaking *int `json:"free_kick_taking,omitempty"`
	PenaltyTaking  *int `json:"penalty_taking,omitempty"`
	OneOnOnes      *int `json:"one_on_ones,omitempty"`
	AerialReach    *int `json:"aerial_reach,omitempty"`
	CommandOfArea  *int `json:"command_of_area,omitempty"`
	Kicking        *int `json:"kicking,omitempty"`
	Throwing       *int `json:"throwing,omitempty"`
}

type PlayerInstructionsDTO struct {
	Pressing       *float64 `json:"pressing,omitempty"`
	CoverZone      string   `json:"cover_zone,omitempty"`
	CrossFrequency *float64 `json:"cross_frequency,omitempty"`
	AerialDuel     *float64 `json:"aerial_duel,omitempty"`
}

// PlayerInputDTO represents a player in JSON schema v1.
type PlayerInputDTO struct {
	ID                string                 `json:"id"`
	Name              string                 `json:"name"`
	Role              string                 `json:"role"`
	AllowedPositions  []string               `json:"allowed_positions,omitempty"`
	Attributes        *PlayerAttributesDTO   `json:"attributes"`
	Instructions      *PlayerInstructionsDTO `json:"instructions,omitempty"`
	StartingCondition *StartingConditionDTO  `json:"starting_condition"`
}

// StartingSlotDTO represents a starting lineup slot assignment in JSON schema v1.
type StartingSlotDTO struct {
	Slot     string   `json:"slot"`
	PlayerID string   `json:"player_id"`
	X        *float64 `json:"x,omitempty"`
	Z        *float64 `json:"z,omitempty"`
}

// TacticsInputDTO represents tactical settings in JSON schema v1.
type TacticsInputDTO struct {
	Formation  string   `json:"formation"`
	Width      *float64 `json:"width"`
	LineHeight *float64 `json:"line_height"`
	Tempo      *float64 `json:"tempo"`
	Pressing   *float64 `json:"pressing"`
}

// TeamInputDTO represents a team and its squad in JSON schema v1.
type TeamInputDTO struct {
	ID             string            `json:"id"`
	Name           string            `json:"name"`
	Tactics        *TacticsInputDTO  `json:"tactics"`
	Players        []PlayerInputDTO  `json:"players"`
	StartingLineup []StartingSlotDTO `json:"starting_lineup"`
	Bench          []string          `json:"bench"`
}

// MatchInputDTO is the top-level schema v1 document for match input.
type MatchInputDTO struct {
	SchemaVersion string        `json:"schema_version"`
	MatchID       string        `json:"match_id"`
	RulesProfile  string        `json:"rules_profile"`
	Pitch         *PitchDTO     `json:"pitch,omitempty"`
	HomeTeam      *TeamInputDTO `json:"home_team"`
	AwayTeam      *TeamInputDTO `json:"away_team"`
}

// ToDomain maps MatchInputDTO to domain.MatchInput and applies domain validation.
func (dto MatchInputDTO) ToDomain() (domain.MatchInput, error) {
	if dto.SchemaVersion != "v1" && dto.SchemaVersion != "v2" {
		return domain.MatchInput{}, &domain.ValidationError{
			Path:    "schema_version",
			Message: fmt.Sprintf("unsupported schema_version %q; expected \"v1\" or \"v2\"", dto.SchemaVersion),
		}
	}
	if dto.MatchID == "" {
		return domain.MatchInput{}, &domain.ValidationError{
			Path:    "match_id",
			Message: "match_id cannot be empty",
		}
	}
	if dto.RulesProfile == "" {
		return domain.MatchInput{}, &domain.ValidationError{
			Path:    "rules_profile",
			Message: "rules_profile cannot be empty",
		}
	}

	pitch := domain.PitchDimensions{
		Width:  68.0,
		Length: 105.0,
	}
	if dto.Pitch != nil {
		if dto.Pitch.Width != nil {
			pitch.Width = *dto.Pitch.Width
		}
		if dto.Pitch.Length != nil {
			pitch.Length = *dto.Pitch.Length
		}
	}

	if dto.HomeTeam == nil {
		return domain.MatchInput{}, &domain.ValidationError{
			Path:    "home_team",
			Message: "home_team is required",
		}
	}
	homeTeam, err := mapTeam("home_team", *dto.HomeTeam, dto.SchemaVersion)
	if err != nil {
		return domain.MatchInput{}, err
	}

	if dto.AwayTeam == nil {
		return domain.MatchInput{}, &domain.ValidationError{
			Path:    "away_team",
			Message: "away_team is required",
		}
	}
	awayTeam, err := mapTeam("away_team", *dto.AwayTeam, dto.SchemaVersion)
	if err != nil {
		return domain.MatchInput{}, err
	}

	matchInput := domain.MatchInput{
		SchemaVersion: dto.SchemaVersion,
		MatchID:       dto.MatchID,
		RulesProfile:  dto.RulesProfile,
		Pitch:         pitch,
		HomeTeam:      homeTeam,
		AwayTeam:      awayTeam,
	}

	if err := matchInput.Validate(); err != nil {
		return domain.MatchInput{}, err
	}

	return matchInput, nil
}

func mapTeam(prefix string, dto TeamInputDTO, version string) (domain.TeamInput, error) {
	if dto.ID == "" {
		return domain.TeamInput{}, &domain.ValidationError{
			Path:    prefix + ".id",
			Message: "team ID cannot be empty",
		}
	}
	if dto.Name == "" {
		return domain.TeamInput{}, &domain.ValidationError{
			Path:     prefix + ".name",
			EntityID: dto.ID,
			Message:  "team name cannot be empty",
		}
	}
	if dto.Tactics == nil {
		return domain.TeamInput{}, &domain.ValidationError{
			Path:     prefix + ".tactics",
			EntityID: dto.ID,
			Message:  "team tactics are required",
		}
	}

	tactics, err := mapTactics(prefix+".tactics", dto.ID, *dto.Tactics)
	if err != nil {
		return domain.TeamInput{}, err
	}

	players := make([]domain.PlayerInput, len(dto.Players))
	for i, pDTO := range dto.Players {
		player, err := mapPlayer(fmt.Sprintf("%s.players[%d]", prefix, i), pDTO, version)
		if err != nil {
			return domain.TeamInput{}, err
		}
		players[i] = player
	}

	lineup := make([]domain.StartingSlot, len(dto.StartingLineup))
	for i, sDTO := range dto.StartingLineup {
		slotPath := fmt.Sprintf("%s.starting_lineup[%d]", prefix, i)
		if sDTO.Slot == "" {
			return domain.TeamInput{}, &domain.ValidationError{
				Path:    slotPath + ".slot",
				Message: "slot name cannot be empty",
			}
		}
		if sDTO.PlayerID == "" {
			return domain.TeamInput{}, &domain.ValidationError{
				Path:    slotPath + ".player_id",
				Message: "player_id cannot be empty",
			}
		}

		var x, z float64
		if sDTO.X != nil && sDTO.Z != nil {
			x = *sDTO.X
			z = *sDTO.Z
		} else if stdPos, exists := domain.StandardSlotPositions[sDTO.Slot]; exists {
			x = stdPos[0]
			z = stdPos[1]
		} else {
			return domain.TeamInput{}, &domain.ValidationError{
				Path:     slotPath,
				EntityID: sDTO.Slot,
				Message:  fmt.Sprintf("unknown slot %q requires explicit x and z coordinates", sDTO.Slot),
			}
		}

		lineup[i] = domain.StartingSlot{
			Slot:     sDTO.Slot,
			PlayerID: sDTO.PlayerID,
			X:        x,
			Z:        z,
		}
	}

	bench := make([]string, len(dto.Bench))
	copy(bench, dto.Bench)

	return domain.TeamInput{
		ID:             dto.ID,
		Name:           dto.Name,
		Tactics:        tactics,
		Players:        players,
		StartingLineup: lineup,
		Bench:          bench,
	}, nil
}

func mapTactics(prefix string, teamID string, dto TacticsInputDTO) (domain.Tactics, error) {
	if dto.Formation == "" {
		return domain.Tactics{}, &domain.ValidationError{
			Path:     prefix + ".formation",
			EntityID: teamID,
			Message:  "tactics formation cannot be empty",
		}
	}
	if dto.Width == nil {
		return domain.Tactics{}, &domain.ValidationError{
			Path:     prefix + ".width",
			EntityID: teamID,
			Message:  "tactics width is required",
		}
	}
	if dto.LineHeight == nil {
		return domain.Tactics{}, &domain.ValidationError{
			Path:     prefix + ".line_height",
			EntityID: teamID,
			Message:  "tactics line_height is required",
		}
	}
	if dto.Tempo == nil {
		return domain.Tactics{}, &domain.ValidationError{
			Path:     prefix + ".tempo",
			EntityID: teamID,
			Message:  "tactics tempo is required",
		}
	}
	if dto.Pressing == nil {
		return domain.Tactics{}, &domain.ValidationError{
			Path:     prefix + ".pressing",
			EntityID: teamID,
			Message:  "tactics pressing is required",
		}
	}

	return domain.Tactics{
		Formation:  dto.Formation,
		Width:      *dto.Width,
		LineHeight: *dto.LineHeight,
		Tempo:      *dto.Tempo,
		Pressing:   *dto.Pressing,
	}, nil
}

func mapPlayer(prefix string, dto PlayerInputDTO, version string) (domain.PlayerInput, error) {
	if dto.ID == "" {
		return domain.PlayerInput{}, &domain.ValidationError{
			Path:    prefix + ".id",
			Message: "player ID cannot be empty",
		}
	}
	if dto.Name == "" {
		return domain.PlayerInput{}, &domain.ValidationError{
			Path:     prefix + ".name",
			EntityID: dto.ID,
			Message:  "player name cannot be empty",
		}
	}
	role := domain.Role(dto.Role)
	if !role.IsValid() {
		return domain.PlayerInput{}, &domain.ValidationError{
			Path:     prefix + ".role",
			EntityID: dto.ID,
			Message:  fmt.Sprintf("invalid player role %q", dto.Role),
		}
	}

	allowed := make([]domain.Role, len(dto.AllowedPositions))
	for j, posStr := range dto.AllowedPositions {
		pos := domain.Role(posStr)
		if !pos.IsValid() {
			return domain.PlayerInput{}, &domain.ValidationError{
				Path:     fmt.Sprintf("%s.allowed_positions[%d]", prefix, j),
				EntityID: dto.ID,
				Message:  fmt.Sprintf("invalid allowed position %q", posStr),
			}
		}
		allowed[j] = pos
	}

	if dto.Attributes == nil {
		return domain.PlayerInput{}, &domain.ValidationError{
			Path:     prefix + ".attributes",
			EntityID: dto.ID,
			Message:  "player attributes are required",
		}
	}
	attr, err := mapAttributes(prefix+".attributes", dto.ID, *dto.Attributes, version)
	if err != nil {
		return domain.PlayerInput{}, err
	}

	if dto.StartingCondition == nil {
		return domain.PlayerInput{}, &domain.ValidationError{
			Path:     prefix + ".starting_condition",
			EntityID: dto.ID,
			Message:  "player starting_condition is required",
		}
	}
	cond, err := mapCondition(prefix+".starting_condition", dto.ID, *dto.StartingCondition)
	if err != nil {
		return domain.PlayerInput{}, err
	}

	instructions := domain.PlayerInstructions{Pressing: 0.5, CoverZone: "auto", CrossFrequency: 0.5, AerialDuel: 0.5}
	if dto.Instructions != nil {
		if dto.Instructions.Pressing != nil {
			instructions.Pressing = *dto.Instructions.Pressing
		}
		if dto.Instructions.CoverZone != "" {
			instructions.CoverZone = dto.Instructions.CoverZone
		}
		if dto.Instructions.CrossFrequency != nil {
			instructions.CrossFrequency = *dto.Instructions.CrossFrequency
		}
		if dto.Instructions.AerialDuel != nil {
			instructions.AerialDuel = *dto.Instructions.AerialDuel
		}
	}
	return domain.PlayerInput{
		ID:                dto.ID,
		Name:              dto.Name,
		Role:              role,
		AllowedPositions:  allowed,
		Attributes:        attr,
		Instructions:      instructions,
		StartingCondition: cond,
	}, nil
}

// mapAttributes builds the final (always schema-v2-shaped) domain
// PlayerAttributes. Schema v1 input is migrated per the table in
// decisions.md (decision 26): old aggregates approximate the new named
// groups, they are never restored data. Schema v2 input supplies the new
// fields directly. Either version rejects fields that belong only to the
// other, so a payload can't silently mix v1 aggregates with v2 groups.
func mapAttributes(prefix string, playerID string, dto PlayerAttributesDTO, version string) (domain.PlayerAttributes, error) {
	required := []struct {
		name string
		val  *int
	}{
		{"pace", dto.Pace},
		{"acceleration", dto.Acceleration},
		{"stamina", dto.Stamina},
		{"passing", dto.Passing},
		{"first_touch", dto.FirstTouch},
		{"dribbling", dto.Dribbling},
		{"tackling", dto.Tackling},
		{"positioning", dto.Positioning},
		{"decisions", dto.Decisions},
	}
	for _, r := range required {
		if r.val == nil {
			return domain.PlayerAttributes{}, &domain.ValidationError{
				Path:     fmt.Sprintf("%s.%s", prefix, r.name),
				EntityID: playerID,
				Message:  fmt.Sprintf("missing required attribute %q", r.name),
			}
		}
	}

	attr := domain.PlayerAttributes{
		Pace: *dto.Pace, Acceleration: *dto.Acceleration, Stamina: *dto.Stamina,
		Passing: *dto.Passing, FirstTouch: *dto.FirstTouch, Dribbling: *dto.Dribbling,
		Tackling: *dto.Tackling, Positioning: *dto.Positioning, Decisions: *dto.Decisions,
	}
	if dto.Handling != nil {
		attr.Handling = *dto.Handling
	}
	if dto.Reflexes != nil {
		attr.Reflexes = *dto.Reflexes
	}

	v2Fields := []*int{dto.Finishing, dto.LongShots, dto.Crossing, dto.Heading, dto.JumpingReach,
		dto.Left, dto.Right, dto.Corners, dto.FreeKickTaking, dto.PenaltyTaking,
		dto.OneOnOnes, dto.AerialReach, dto.CommandOfArea, dto.Kicking, dto.Throwing}

	switch version {
	case "v1":
		if dto.Shooting == nil {
			return domain.PlayerAttributes{}, &domain.ValidationError{
				Path: prefix + ".shooting", EntityID: playerID, Message: `missing required attribute "shooting"`,
			}
		}
		for _, v := range v2Fields {
			if v != nil {
				return domain.PlayerAttributes{}, &domain.ValidationError{
					Path: prefix, EntityID: playerID,
					Message: "schema v1 does not support v2-only attribute fields (finishing/long_shots/crossing/heading/jumping_reach/left/right/corners/free_kick_taking/penalty_taking/one_on_ones/aerial_reach/command_of_area/kicking/throwing); use schema_version \"v2\"",
				}
			}
		}
		aerial, weakFoot := 10, 3
		if dto.Aerial != nil {
			aerial = *dto.Aerial
		}
		if dto.WeakFoot != nil {
			weakFoot = *dto.WeakFoot
		}
		// v1->v2 migration table (decision 26): an approximation, not a
		// restoration of skill the v1 input never captured.
		attr.Finishing, attr.LongShots = *dto.Shooting, *dto.Shooting
		attr.FreeKickTaking, attr.PenaltyTaking = *dto.Shooting, *dto.Shooting
		attr.Crossing, attr.Kicking, attr.Throwing, attr.Corners = *dto.Passing, *dto.Passing, *dto.Passing, *dto.Passing
		attr.Heading, attr.JumpingReach = aerial, aerial
		attr.Right = 20
		attr.Left = 1 + int(math.Round(float64(weakFoot-1)*19.0/4.0))
		attr.OneOnOnes = attr.Reflexes
		attr.AerialReach, attr.CommandOfArea = attr.Handling, attr.Handling
	case "v2":
		if dto.Shooting != nil || dto.Aerial != nil || dto.WeakFoot != nil {
			return domain.PlayerAttributes{}, &domain.ValidationError{
				Path: prefix, EntityID: playerID,
				Message: "schema v2 does not support v1-only attribute fields (shooting/aerial/weak_foot); use finishing/long_shots, heading/jumping_reach, left/right instead",
			}
		}
		v2Required := []struct {
			name string
			val  *int
		}{
			{"finishing", dto.Finishing}, {"long_shots", dto.LongShots}, {"crossing", dto.Crossing},
			{"heading", dto.Heading}, {"jumping_reach", dto.JumpingReach}, {"left", dto.Left}, {"right", dto.Right},
			{"corners", dto.Corners}, {"free_kick_taking", dto.FreeKickTaking}, {"penalty_taking", dto.PenaltyTaking},
		}
		for _, r := range v2Required {
			if r.val == nil {
				return domain.PlayerAttributes{}, &domain.ValidationError{
					Path:     fmt.Sprintf("%s.%s", prefix, r.name),
					EntityID: playerID,
					Message:  fmt.Sprintf("missing required attribute %q", r.name),
				}
			}
		}
		attr.Finishing, attr.LongShots, attr.Crossing = *dto.Finishing, *dto.LongShots, *dto.Crossing
		attr.Heading, attr.JumpingReach = *dto.Heading, *dto.JumpingReach
		attr.Left, attr.Right = *dto.Left, *dto.Right
		attr.Corners, attr.FreeKickTaking, attr.PenaltyTaking = *dto.Corners, *dto.FreeKickTaking, *dto.PenaltyTaking
		if dto.OneOnOnes != nil {
			attr.OneOnOnes = *dto.OneOnOnes
		}
		if dto.AerialReach != nil {
			attr.AerialReach = *dto.AerialReach
		}
		if dto.CommandOfArea != nil {
			attr.CommandOfArea = *dto.CommandOfArea
		}
		if dto.Kicking != nil {
			attr.Kicking = *dto.Kicking
		}
		if dto.Throwing != nil {
			attr.Throwing = *dto.Throwing
		}
	}

	return attr, nil
}

func mapCondition(prefix string, playerID string, dto StartingConditionDTO) (domain.StartingCondition, error) {
	if dto.Fitness == nil {
		return domain.StartingCondition{}, &domain.ValidationError{
			Path:     prefix + ".fitness",
			EntityID: playerID,
			Message:  "missing required condition fitness",
		}
	}
	if dto.Sharpness == nil {
		return domain.StartingCondition{}, &domain.ValidationError{
			Path:     prefix + ".sharpness",
			EntityID: playerID,
			Message:  "missing required condition sharpness",
		}
	}
	if dto.InitialFatigue == nil {
		return domain.StartingCondition{}, &domain.ValidationError{
			Path:     prefix + ".initial_fatigue",
			EntityID: playerID,
			Message:  "missing required condition initial_fatigue",
		}
	}

	return domain.StartingCondition{
		Fitness:        *dto.Fitness,
		Sharpness:      *dto.Sharpness,
		InitialFatigue: *dto.InitialFatigue,
	}, nil
}
