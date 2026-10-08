package domain

import (
	"fmt"
	"math"
)

// ValidationError represents a diagnostic validation failure with location and context.
type ValidationError struct {
	Path     string
	EntityID string
	Message  string
}

func (e *ValidationError) Error() string {
	if e.EntityID != "" && e.Path != "" {
		return fmt.Sprintf("%s (id: %q): %s", e.Path, e.EntityID, e.Message)
	}
	if e.Path != "" {
		return fmt.Sprintf("%s: %s", e.Path, e.Message)
	}
	return e.Message
}

func isFinite(f float64) bool {
	return !math.IsNaN(f) && !math.IsInf(f, 0)
}

// Validate checks all domain invariants on MatchInput before match initialization.
func (m *MatchInput) Validate() error {
	if m.SchemaVersion != "v1" && m.SchemaVersion != "v2" {
		return &ValidationError{
			Path:    "schema_version",
			Message: fmt.Sprintf("unsupported schema version %q; expected \"v1\" or \"v2\"", m.SchemaVersion),
		}
	}
	if m.MatchID == "" {
		return &ValidationError{
			Path:    "match_id",
			Message: "match_id cannot be empty",
		}
	}
	if m.RulesProfile == "" {
		return &ValidationError{
			Path:    "rules_profile",
			Message: "rules_profile cannot be empty",
		}
	}
	if m.RulesProfile != "profile_a" && m.RulesProfile != "profile_b1" {
		return &ValidationError{
			Path:    "rules_profile",
			Message: fmt.Sprintf("unsupported rules profile %q; expected %q or %q", m.RulesProfile, "profile_a", "profile_b1"),
		}
	}

	// Validate pitch dimensions
	if !isFinite(m.Pitch.Width) || m.Pitch.Width < 45.0 || m.Pitch.Width > 90.0 {
		return &ValidationError{
			Path:    "pitch.width",
			Message: fmt.Sprintf("pitch width %v is out of range [45.0, 90.0] meters", m.Pitch.Width),
		}
	}
	if !isFinite(m.Pitch.Length) || m.Pitch.Length < 90.0 || m.Pitch.Length > 120.0 {
		return &ValidationError{
			Path:    "pitch.length",
			Message: fmt.Sprintf("pitch length %v is out of range [90.0, 120.0] meters", m.Pitch.Length),
		}
	}

	// Team IDs
	if m.HomeTeam.ID == "" {
		return &ValidationError{
			Path:    "home_team.id",
			Message: "team ID cannot be empty",
		}
	}
	if m.AwayTeam.ID == "" {
		return &ValidationError{
			Path:    "away_team.id",
			Message: "team ID cannot be empty",
		}
	}
	if m.HomeTeam.ID == m.AwayTeam.ID {
		return &ValidationError{
			Path:     "away_team.id",
			EntityID: m.AwayTeam.ID,
			Message:  fmt.Sprintf("duplicate team ID: home and away teams have identical ID %q", m.HomeTeam.ID),
		}
	}

	// Validate Home Team
	if err := validateTeam("home_team", &m.HomeTeam); err != nil {
		return err
	}

	// Validate Away Team
	if err := validateTeam("away_team", &m.AwayTeam); err != nil {
		return err
	}

	// Check cross-team player ID uniqueness
	homePlayerIDs := make(map[string]bool, len(m.HomeTeam.Players))
	for _, p := range m.HomeTeam.Players {
		homePlayerIDs[p.ID] = true
	}
	for _, p := range m.AwayTeam.Players {
		if homePlayerIDs[p.ID] {
			return &ValidationError{
				Path:     "away_team.players",
				EntityID: p.ID,
				Message:  fmt.Sprintf("player ID %q exists in both home and away teams", p.ID),
			}
		}
	}

	return nil
}

func validateTeam(teamPrefix string, t *TeamInput) error {
	if t.Name == "" {
		return &ValidationError{
			Path:     teamPrefix + ".name",
			EntityID: t.ID,
			Message:  "team name cannot be empty",
		}
	}

	if err := t.Tactics.Validate(t.ID); err != nil {
		return err
	}

	// Squad size
	if len(t.Players) < 11 {
		return &ValidationError{
			Path:     teamPrefix + ".players",
			EntityID: t.ID,
			Message:  fmt.Sprintf("squad must have at least 11 players, found %d", len(t.Players)),
		}
	}

	// Player roster validation
	playerMap := make(map[string]PlayerInput, len(t.Players))
	for i, p := range t.Players {
		path := fmt.Sprintf("%s.players[%d]", teamPrefix, i)
		if p.ID == "" {
			return &ValidationError{
				Path:    path + ".id",
				Message: "player ID cannot be empty",
			}
		}
		if _, exists := playerMap[p.ID]; exists {
			return &ValidationError{
				Path:     path,
				EntityID: p.ID,
				Message:  fmt.Sprintf("duplicate player ID %q within team %q", p.ID, t.ID),
			}
		}
		if p.Name == "" {
			return &ValidationError{
				Path:     path + ".name",
				EntityID: p.ID,
				Message:  "player name cannot be empty",
			}
		}
		if !p.Role.IsValid() {
			return &ValidationError{
				Path:     path + ".role",
				EntityID: p.ID,
				Message:  fmt.Sprintf("unsupported or invalid role %q", p.Role),
			}
		}
		for j, pos := range p.AllowedPositions {
			if !pos.IsValid() {
				return &ValidationError{
					Path:     fmt.Sprintf("%s.allowed_positions[%d]", path, j),
					EntityID: p.ID,
					Message:  fmt.Sprintf("invalid allowed position %q", pos),
				}
			}
		}

		// Validate attributes (1..20)
		if err := validateAttributes(path+".attributes", p.ID, p.Attributes, p.CanPlayGK()); err != nil {
			return err
		}
		if err := validateInstructions(path+".instructions", p.ID, p.Instructions); err != nil {
			return err
		}

		// Validate starting condition (0..100)
		if err := validateCondition(path+".starting_condition", p.ID, p.StartingCondition); err != nil {
			return err
		}

		playerMap[p.ID] = p
	}

	// Validate StartingLineup
	if len(t.StartingLineup) != 11 {
		return &ValidationError{
			Path:     teamPrefix + ".starting_lineup",
			EntityID: t.ID,
			Message:  fmt.Sprintf("starting lineup must contain exactly 11 slots, found %d", len(t.StartingLineup)),
		}
	}

	startingPlayerIDs := make(map[string]bool, 11)
	slotNames := make(map[string]bool, 11)
	gkCount := 0

	for i, slot := range t.StartingLineup {
		slotPath := fmt.Sprintf("%s.starting_lineup[%d]", teamPrefix, i)
		if slot.Slot == "" {
			return &ValidationError{
				Path:    slotPath + ".slot",
				Message: "starting slot name cannot be empty",
			}
		}
		if slotNames[slot.Slot] {
			return &ValidationError{
				Path:    slotPath + ".slot",
				Message: fmt.Sprintf("duplicate slot %q in starting lineup", slot.Slot),
			}
		}
		slotNames[slot.Slot] = true

		// Check player exists in roster
		player, exists := playerMap[slot.PlayerID]
		if !exists {
			return &ValidationError{
				Path:     slotPath + ".player_id",
				EntityID: slot.PlayerID,
				Message:  fmt.Sprintf("player %q in slot %q does not exist in team roster", slot.PlayerID, slot.Slot),
			}
		}

		// Check player not assigned twice in lineup
		if startingPlayerIDs[slot.PlayerID] {
			return &ValidationError{
				Path:     slotPath + ".player_id",
				EntityID: slot.PlayerID,
				Message:  fmt.Sprintf("player %q assigned multiple times in starting lineup", slot.PlayerID),
			}
		}
		startingPlayerIDs[slot.PlayerID] = true

		// Slot coordinates validation
		if !isFinite(slot.X) || slot.X < -1.0 || slot.X > 1.0 {
			return &ValidationError{
				Path:     slotPath + ".x",
				EntityID: slot.PlayerID,
				Message:  fmt.Sprintf("slot X coordinate %v is out of normalized range [-1.0, 1.0]", slot.X),
			}
		}
		if !isFinite(slot.Z) || slot.Z < -1.0 || slot.Z > 1.0 {
			return &ValidationError{
				Path:     slotPath + ".z",
				EntityID: slot.PlayerID,
				Message:  fmt.Sprintf("slot Z coordinate %v is out of normalized range [-1.0, 1.0]", slot.Z),
			}
		}

		// Goalkeeper validation
		if slot.IsGK() {
			gkCount++
			if !player.CanPlayGK() {
				return &ValidationError{
					Path:     slotPath,
					EntityID: slot.PlayerID,
					Message:  fmt.Sprintf("player %q assigned to GK slot cannot play as goalkeeper (role: %s)", player.ID, player.Role),
				}
			}
		} else {
			// Outfield slot: a pure GK cannot play in an outfield slot
			if player.Role.IsGK() && len(player.AllowedPositions) == 0 {
				return &ValidationError{
					Path:     slotPath,
					EntityID: slot.PlayerID,
					Message:  fmt.Sprintf("pure goalkeeper %q assigned to outfield slot %q", player.ID, slot.Slot),
				}
			}
		}
	}

	if gkCount != 1 {
		return &ValidationError{
			Path:     teamPrefix + ".starting_lineup",
			EntityID: t.ID,
			Message:  fmt.Sprintf("starting lineup must have exactly 1 goalkeeper, found %d", gkCount),
		}
	}

	// Validate Bench
	benchPlayerIDs := make(map[string]bool, len(t.Bench))
	for i, benchID := range t.Bench {
		benchPath := fmt.Sprintf("%s.bench[%d]", teamPrefix, i)
		if benchID == "" {
			return &ValidationError{
				Path:    benchPath,
				Message: "bench player ID cannot be empty",
			}
		}
		if benchPlayerIDs[benchID] {
			return &ValidationError{
				Path:     benchPath,
				EntityID: benchID,
				Message:  fmt.Sprintf("duplicate player ID %q on bench", benchID),
			}
		}
		benchPlayerIDs[benchID] = true

		if _, exists := playerMap[benchID]; !exists {
			return &ValidationError{
				Path:     benchPath,
				EntityID: benchID,
				Message:  fmt.Sprintf("bench player %q does not exist in team roster", benchID),
			}
		}
		if startingPlayerIDs[benchID] {
			return &ValidationError{
				Path:     benchPath,
				EntityID: benchID,
				Message:  fmt.Sprintf("player %q is both in starting lineup and on bench", benchID),
			}
		}
	}

	return nil
}

func validateInstructions(path, playerID string, instructions PlayerInstructions) error {
	checks := []struct {
		name  string
		value float64
	}{
		{"pressing", instructions.Pressing}, {"cross_frequency", instructions.CrossFrequency}, {"aerial_duel", instructions.AerialDuel},
	}
	for _, check := range checks {
		if !isFinite(check.value) || check.value < 0 || check.value > 1 {
			return &ValidationError{Path: path + "." + check.name, EntityID: playerID, Message: fmt.Sprintf("instruction %s is out of normalized range [0, 1]: %v", check.name, check.value)}
		}
	}
	if instructions.CoverZone != "" && instructions.CoverZone != "auto" && instructions.CoverZone != "left" && instructions.CoverZone != "center" && instructions.CoverZone != "right" {
		return &ValidationError{Path: path + ".cover_zone", EntityID: playerID, Message: fmt.Sprintf("unsupported cover zone %q", instructions.CoverZone)}
	}
	return nil
}

// validateAttributes checks the final (post-migration) v2 attribute shape.
// mapAttributes always produces a fully-populated PlayerAttributes -- whether
// the original JSON was schema v1 (migrated) or v2 (direct) -- so this check
// is itself schema-version-agnostic; it never sees the removed v1 aggregate
// fields (Shooting/Aerial/WeakFoot).
func validateAttributes(path string, playerID string, attr PlayerAttributes, isGK bool) error {
	checks := []struct {
		name string
		val  int
	}{
		{"pace", attr.Pace},
		{"acceleration", attr.Acceleration},
		{"stamina", attr.Stamina},
		{"passing", attr.Passing},
		{"first_touch", attr.FirstTouch},
		{"dribbling", attr.Dribbling},
		{"tackling", attr.Tackling},
		{"positioning", attr.Positioning},
		{"decisions", attr.Decisions},
		{"finishing", attr.Finishing},
		{"long_shots", attr.LongShots},
		{"crossing", attr.Crossing},
		{"heading", attr.Heading},
		{"jumping_reach", attr.JumpingReach},
		{"left", attr.Left},
		{"right", attr.Right},
		{"corners", attr.Corners},
		{"free_kick_taking", attr.FreeKickTaking},
		{"penalty_taking", attr.PenaltyTaking},
	}
	for _, c := range checks {
		if c.val < 1 || c.val > 20 {
			return &ValidationError{
				Path:     fmt.Sprintf("%s.%s", path, c.name),
				EntityID: playerID,
				Message:  fmt.Sprintf("attribute %s has value %d; must be between 1 and 20", c.name, c.val),
			}
		}
	}

	if isGK {
		gkChecks := []struct {
			name string
			val  int
		}{
			{"handling", attr.Handling},
			{"reflexes", attr.Reflexes},
			{"one_on_ones", attr.OneOnOnes},
			{"aerial_reach", attr.AerialReach},
			{"command_of_area", attr.CommandOfArea},
			{"kicking", attr.Kicking},
			{"throwing", attr.Throwing},
		}
		for _, c := range gkChecks {
			if c.val < 1 || c.val > 20 {
				return &ValidationError{
					Path:     fmt.Sprintf("%s.%s", path, c.name),
					EntityID: playerID,
					Message:  fmt.Sprintf("GK attribute %s has value %d; must be between 1 and 20", c.name, c.val),
				}
			}
		}
	}
	return nil
}

func validateCondition(path string, playerID string, cond StartingCondition) error {
	if !isFinite(cond.Fitness) || cond.Fitness < 0.0 || cond.Fitness > 100.0 {
		return &ValidationError{
			Path:     path + ".fitness",
			EntityID: playerID,
			Message:  fmt.Sprintf("fitness %v is out of range [0.0, 100.0]", cond.Fitness),
		}
	}
	if !isFinite(cond.Sharpness) || cond.Sharpness < 0.0 || cond.Sharpness > 100.0 {
		return &ValidationError{
			Path:     path + ".sharpness",
			EntityID: playerID,
			Message:  fmt.Sprintf("sharpness %v is out of range [0.0, 100.0]", cond.Sharpness),
		}
	}
	if !isFinite(cond.InitialFatigue) || cond.InitialFatigue < 0.0 || cond.InitialFatigue > 100.0 {
		return &ValidationError{
			Path:     path + ".initial_fatigue",
			EntityID: playerID,
			Message:  fmt.Sprintf("initial_fatigue %v is out of range [0.0, 100.0]", cond.InitialFatigue),
		}
	}
	return nil
}

// Validate checks tactics at both input and command boundaries.
func (t Tactics) Validate(teamID string) error {
	if t.Formation == "" {
		return &ValidationError{
			Path:     "tactics.formation",
			EntityID: teamID,
			Message:  "formation name cannot be empty",
		}
	}
	if !isFinite(t.Width) || t.Width < 0.0 || t.Width > 1.0 {
		return &ValidationError{
			Path:     "tactics.width",
			EntityID: teamID,
			Message:  fmt.Sprintf("width %v is out of normalized range [0.0, 1.0]", t.Width),
		}
	}
	if !isFinite(t.LineHeight) || t.LineHeight < 0.0 || t.LineHeight > 1.0 {
		return &ValidationError{
			Path:     "tactics.line_height",
			EntityID: teamID,
			Message:  fmt.Sprintf("line_height %v is out of normalized range [0.0, 1.0]", t.LineHeight),
		}
	}
	if !isFinite(t.Tempo) || t.Tempo < 0.0 || t.Tempo > 1.0 {
		return &ValidationError{
			Path:     "tactics.tempo",
			EntityID: teamID,
			Message:  fmt.Sprintf("tempo %v is out of normalized range [0.0, 1.0]", t.Tempo),
		}
	}
	if !isFinite(t.Pressing) || t.Pressing < 0.0 || t.Pressing > 1.0 {
		return &ValidationError{
			Path:     "tactics.pressing",
			EntityID: teamID,
			Message:  fmt.Sprintf("pressing %v is out of normalized range [0.0, 1.0]", t.Pressing),
		}
	}

	return nil
}
