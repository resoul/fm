package domain

import (
	"sort"
)

// Role represents a player's tactical role / position on the pitch.
type Role string

const (
	RoleGK Role = "GK"
	RoleLB Role = "LB"
	RoleCB Role = "CB"
	RoleRB Role = "RB"
	RoleDM Role = "DM"
	RoleCM Role = "CM"
	RoleAM Role = "AM"
	RoleLM Role = "LM"
	RoleRM Role = "RM"
	RoleLW Role = "LW"
	RoleRW Role = "RW"
	RoleST Role = "ST"
)

// ValidRoles contains all valid roles in the domain.
var ValidRoles = map[Role]bool{
	RoleGK: true,
	RoleLB: true,
	RoleCB: true,
	RoleRB: true,
	RoleDM: true,
	RoleCM: true,
	RoleAM: true,
	RoleLM: true,
	RoleRM: true,
	RoleLW: true,
	RoleRW: true,
	RoleST: true,
}

// IsGK reports whether the role is a goalkeeper.
func (r Role) IsGK() bool {
	return r == RoleGK
}

// IsValid reports whether the role is recognized.
func (r Role) IsValid() bool {
	return ValidRoles[r]
}

// PlayerAttributes holds skills and physical capabilities on a scale of 1 to 20.
// Schema v2 (see MatchInput.SchemaVersion): Shooting/Aerial/WeakFoot from v1
// are replaced by the named groups below; decisions.md documents the v1->v2
// migration table used when loading a v1 input.
type PlayerAttributes struct {
	// Outfield attributes (1..20)
	Pace           int // Sprint speed (meters per second derived in config)
	Acceleration   int // Rate of speed change (m/s^2 derived in config)
	Stamina        int // Resistance to fatigue over time and actions
	Passing        int // Short and medium pass precision
	FirstTouch     int // Ball control upon receiving
	Dribbling      int // Ball retention while moving with ball
	Tackling       int // Ability to dispossess an opponent safely
	Positioning    int // Tactical defensive and offensive awareness
	Decisions      int // Choice quality and reaction time under pressure
	Finishing      int // Close-range shot precision
	LongShots      int // Shot precision from distance
	Crossing       int // Delivery quality of crosses into the box
	Heading        int // Aerial duel/heading contest skill
	JumpingReach   int // Physical reach/leap enabling an aerial contest
	Left           int // Left-foot proficiency
	Right          int // Right-foot proficiency
	Corners        int // Corner-delivery quality
	FreeKickTaking int // Direct free-kick shot quality
	PenaltyTaking  int // Penalty conversion skill

	// Goalkeeper-specific attributes (1..20; required for GK, ignored or 0 for pure outfielders)
	Handling      int // Catching and holding onto shots
	Reflexes      int // Reaction speed to shots and close-range attempts
	OneOnOnes     int // Close-range one-on-one save ability
	AerialReach   int // Reach for crosses and high balls
	CommandOfArea int // Claiming/organizing decisiveness in the box
	Kicking       int // Goal-kick distribution range/accuracy
	Throwing      int // Throw distribution accuracy
}

// PlayerInstructions are individual tactical settings. Values are normalized
// to 0..1; zero is explicit. JSON defaults are resolved by the adapter.
type PlayerInstructions struct {
	Pressing       float64 `json:"pressing"`
	CoverZone      string  `json:"cover_zone"`
	CrossFrequency float64 `json:"cross_frequency"`
	AerialDuel     float64 `json:"aerial_duel"`
}

// StartingCondition represents pre-match fitness and fatigue on a 0..100 scale.
type StartingCondition struct {
	Fitness        float64 // Physical readiness and condition (0..100)
	Sharpness      float64 // Match sharpness and rhythm (0..100)
	InitialFatigue float64 // Pre-existing fatigue entering the match (0..100)
}

// Tactics defines team-level tactical settings normalized to 0.0..1.0.
type Tactics struct {
	Formation  string  // Name of formation, e.g. "4-4-2"
	Width      float64 // Normalized pitch width usage: 0 (narrow) .. 1 (wide)
	LineHeight float64 // Normalized defensive line height: 0 (deep) .. 1 (high)
	Tempo      float64 // Normalized speed of play: 0 (slow) .. 1 (fast)
	Pressing   float64 // Normalized pressing intensity: 0 (passive) .. 1 (aggressive)
}

// StandardSlotPositions maps standard 11 tactical slot names to normalized coordinates (X across [-1, 1], Z along [-1, 1]).
var StandardSlotPositions = map[string][2]float64{
	"GK":   {0.0, -0.90},
	"LB":   {-0.65, -0.60},
	"CB_L": {-0.22, -0.65},
	"CB_R": {0.22, -0.65},
	"RB":   {0.65, -0.60},
	"LM":   {-0.65, -0.15},
	"CM_L": {-0.22, -0.20},
	"CM_R": {0.22, -0.20},
	"RM":   {0.65, -0.15},
	"ST_L": {-0.25, 0.35},
	"ST_R": {0.25, 0.35},
}

// StartingSlot binds a starting player to a tactical slot on the pitch.
type StartingSlot struct {
	Slot     string  // Slot identifier (e.g. "GK", "LB", "CB_L", "CB_R", "RB", "LM", "CM_L", "CM_R", "RM", "ST_L", "ST_R")
	PlayerID string  // ID of the starting player
	X        float64 // Normalized X coordinate across pitch [-1.0, 1.0]
	Z        float64 // Normalized Z coordinate along pitch [-1.0, 1.0]
}

// IsGK reports whether this slot is designated for a goalkeeper.
func (s StartingSlot) IsGK() bool {
	return s.Slot == "GK"
}

// PlayerInput defines immutable input data for a single player.
type PlayerInput struct {
	ID                string
	Name              string
	Role              Role
	AllowedPositions  []Role
	Attributes        PlayerAttributes
	Instructions      PlayerInstructions
	StartingCondition StartingCondition
}

// CanPlayGK reports whether the player is eligible to play in goal.
func (p PlayerInput) CanPlayGK() bool {
	if p.Role.IsGK() {
		return true
	}
	for _, pos := range p.AllowedPositions {
		if pos.IsGK() {
			return true
		}
	}
	return false
}

// DeepCopy creates an isolated copy of PlayerInput.
func (p PlayerInput) DeepCopy() PlayerInput {
	copyAllowed := make([]Role, len(p.AllowedPositions))
	copy(copyAllowed, p.AllowedPositions)
	return PlayerInput{
		ID:                p.ID,
		Name:              p.Name,
		Role:              p.Role,
		AllowedPositions:  copyAllowed,
		Attributes:        p.Attributes,
		Instructions:      p.Instructions,
		StartingCondition: p.StartingCondition,
	}
}

// TeamInput defines immutable input data for a team in a match.
type TeamInput struct {
	ID             string
	Name           string
	Tactics        Tactics
	Players        []PlayerInput  // All available squad players
	StartingLineup []StartingSlot // Exactly 11 starting slots
	Bench          []string       // IDs of bench players (substitutes)
}

// DeepCopy creates an isolated copy of TeamInput.
func (t TeamInput) DeepCopy() TeamInput {
	playersCopy := make([]PlayerInput, len(t.Players))
	for i, p := range t.Players {
		playersCopy[i] = p.DeepCopy()
	}
	lineupCopy := make([]StartingSlot, len(t.StartingLineup))
	copy(lineupCopy, t.StartingLineup)
	benchCopy := make([]string, len(t.Bench))
	copy(benchCopy, t.Bench)

	return TeamInput{
		ID:             t.ID,
		Name:           t.Name,
		Tactics:        t.Tactics,
		Players:        playersCopy,
		StartingLineup: lineupCopy,
		Bench:          benchCopy,
	}
}

// OrderedPlayers returns all players in the squad sorted deterministically by ID.
func (t TeamInput) OrderedPlayers() []PlayerInput {
	res := make([]PlayerInput, len(t.Players))
	for i, p := range t.Players {
		res[i] = p.DeepCopy()
	}
	sort.Slice(res, func(i, j int) bool {
		return res[i].ID < res[j].ID
	})
	return res
}

// PitchDimensions defines physical dimensions of the pitch in meters.
type PitchDimensions struct {
	Width  float64 // Width in meters (Y coordinate is 0 on pitch plane; across pitch is X)
	Length float64 // Length in meters (along pitch is Z, goals at ±Length/2)
}

// MatchInput is the root immutable input for simulating one match.
type MatchInput struct {
	SchemaVersion string          // Expected "v1"
	MatchID       string          // Unique match identifier
	RulesProfile  string          // e.g. "profile_a"
	Pitch         PitchDimensions // Pitch dimensions in meters
	HomeTeam      TeamInput       // Home team configuration and squad
	AwayTeam      TeamInput       // Away team configuration and squad
}

// DeepCopy creates an isolated copy of MatchInput.
func (m MatchInput) DeepCopy() MatchInput {
	return MatchInput{
		SchemaVersion: m.SchemaVersion,
		MatchID:       m.MatchID,
		RulesProfile:  m.RulesProfile,
		Pitch:         m.Pitch,
		HomeTeam:      m.HomeTeam.DeepCopy(),
		AwayTeam:      m.AwayTeam.DeepCopy(),
	}
}

// AllPlayersOrdered returns all players from both teams in deterministic order (home sorted by ID, then away sorted by ID).
func (m MatchInput) AllPlayersOrdered() []PlayerInput {
	home := m.HomeTeam.OrderedPlayers()
	away := m.AwayTeam.OrderedPlayers()
	res := make([]PlayerInput, 0, len(home)+len(away))
	res = append(res, home...)
	res = append(res, away...)
	return res
}

// --- Minimal runtime domain types (used for A2+ scaffold) ---

// MatchPhase represents discrete match lifecycle stages.
type MatchPhase string

const (
	PhaseNotStarted MatchPhase = "not_started"
	PhaseFirstHalf  MatchPhase = "first_half"
	PhaseHalfTime   MatchPhase = "halftime"
	PhaseSecondHalf MatchPhase = "second_half"
	PhaseFinished   MatchPhase = "finished"
	// PhaseAbandoned is terminal, like PhaseFinished, but reached when a team
	// drops below the minimum number of players to continue (profile B1:
	// red cards and/or injuries), rather than by completing both halves.
	PhaseAbandoned MatchPhase = "abandoned"
)

// Phase is an alias for MatchPhase for brevity.
type Phase = MatchPhase

// Vec2 represents 2D coordinates on the pitch plane in meters.
type Vec2 struct {
	X float64 // Across pitch in meters
	Z float64 // Along pitch in meters
}

// Vec3 represents 3D coordinates in meters (X across, Y height, Z along).
type Vec3 struct {
	X float64 // Across pitch in meters
	Y float64 // Height above pitch plane in meters (y = ball_radius when resting on ground)
	Z float64 // Along pitch in meters
}

// PlayerState is the mutable, observable state of a player during a match.
type PlayerState struct {
	ID           string  `json:"id"`
	TeamID       string  `json:"team_id"`
	Position     Vec3    `json:"position"`
	Velocity     Vec3    `json:"velocity"`
	Facing       float64 `json:"facing"`
	Active       bool    `json:"active"`
	Fatigue      float64 `json:"fatigue"`
	MinutesOnPit float64 `json:"minutes_on_pitch"`
	DistanceM    float64 `json:"distance_m"`
}

// BallState is the observable state of the ball.
type BallState struct {
	Position  Vec3    `json:"position"`
	Velocity  Vec3    `json:"velocity"`
	Radius    float64 `json:"radius"`
	CarrierID string  `json:"carrier_id,omitempty"`
	Status    string  `json:"status"`
}

type Score struct {
	Home int `json:"home"`
	Away int `json:"away"`
}

type MatchEventType string

const (
	EventKickoff        MatchEventType = "kickoff"
	EventHalfTime       MatchEventType = "halftime"
	EventFullTime       MatchEventType = "fulltime"
	EventPass           MatchEventType = "pass"
	EventCross          MatchEventType = "cross"
	EventAerialDuel     MatchEventType = "aerial_duel"
	EventReceive        MatchEventType = "receive"
	EventShot           MatchEventType = "shot"
	EventSave           MatchEventType = "save"
	EventGoal           MatchEventType = "goal"
	EventThrowIn        MatchEventType = "throw_in"
	EventInterception   MatchEventType = "interception"
	EventGoalKick       MatchEventType = "goal_kick"
	EventCorner         MatchEventType = "corner"
	EventOffside        MatchEventType = "offside"
	EventFoul           MatchEventType = "foul"
	EventYellowCard     MatchEventType = "yellow_card"
	EventRedCard        MatchEventType = "red_card"
	EventFreeKick       MatchEventType = "free_kick"
	EventPenalty        MatchEventType = "penalty"
	EventTacticsChange  MatchEventType = "tactics_change"
	EventSubstitution   MatchEventType = "substitution"
	EventInjury         MatchEventType = "injury"
	EventMatchAbandoned MatchEventType = "match_abandoned"
)

type MatchEvent struct {
	Sequence        int64          `json:"sequence"`
	Tick            int64          `json:"tick"`
	Period          int            `json:"period"`
	PeriodElapsedMs int            `json:"period_elapsed_ms"`
	Type            MatchEventType `json:"type"`
	PlayerID        string         `json:"player_id,omitempty"`
	TeamID          string         `json:"team_id,omitempty"`
	TargetPlayerID  string         `json:"target_player_id,omitempty"`
}

type TeamStats struct {
	TeamID                 string  `json:"team_id"`
	Goals                  int     `json:"goals"`
	Shots                  int     `json:"shots"`
	ShotsOnTarget          int     `json:"shots_on_target"`
	Passes                 int     `json:"passes"`
	SuccessfulPasses       int     `json:"successful_passes"`
	Crosses                int     `json:"crosses"`
	SuccessfulCrosses      int     `json:"successful_crosses"`
	ExpectedGoals          float64 `json:"expected_goals"`
	ControlledPossessionMs int     `json:"controlled_possession_ms"`
}

type PlayerStats struct {
	PlayerID        string  `json:"player_id"`
	TeamID          string  `json:"team_id"`
	Minutes         float64 `json:"minutes"`
	DistanceM       float64 `json:"distance_m"`
	Passes          int     `json:"passes"`
	CompletedPasses int     `json:"completed_passes"`
	Crosses         int     `json:"crosses"`
	AerialDuels     int     `json:"aerial_duels"`
	WonAerialDuels  int     `json:"won_aerial_duels"`
	Shots           int     `json:"shots"`
	ExpectedGoals   float64 `json:"expected_goals"`
	Goals           int     `json:"goals"`
	Saves           int     `json:"saves"`
}

// InjuryStatus is a post-match handoff to an external squad-management
// system. The match engine does not advance recovery or own a calendar.
type InjuryStatus struct {
	Reason                string `json:"reason"`
	EstimatedRecoveryDays int    `json:"estimated_recovery_days"`
}

// PostMatchPlayerChange contains match-derived information an external career
// or squad layer may persist. Rating is nil for a player who did not play;
// this avoids presenting a fabricated zero rating for unused substitutes.
type PostMatchPlayerChange struct {
	PlayerID string        `json:"player_id"`
	TeamID   string        `json:"team_id"`
	Rating   *float64      `json:"rating,omitempty"`
	Injury   *InjuryStatus `json:"injury,omitempty"`
}

type MatchSnapshot struct {
	Tick            int64         `json:"tick"`
	Phase           MatchPhase    `json:"phase"`
	Period          int           `json:"period"`
	PeriodElapsedMs int           `json:"period_elapsed_ms"`
	AddedTimeMs     int           `json:"added_time_ms"`
	Score           Score         `json:"score"`
	Players         []PlayerState `json:"players"`
	Ball            BallState     `json:"ball"`
	LastEventSeq    int64         `json:"last_event_seq"`
	AbandonReason   string        `json:"abandon_reason,omitempty"`
}

type MatchResult struct {
	Status           string                  `json:"status"`
	MatchID          string                  `json:"match_id"`
	RulesProfile     string                  `json:"rules_profile"`
	Score            Score                   `json:"score"`
	Ticks            int64                   `json:"ticks"`
	DurationMs       int                     `json:"duration_ms"`
	AddedTimeMs      int                     `json:"added_time_ms"`
	AbandonReason    string                  `json:"abandon_reason,omitempty"`
	Events           []MatchEvent            `json:"events"`
	TeamStats        []TeamStats             `json:"team_stats"`
	PlayerStats      []PlayerStats           `json:"player_stats"`
	PostMatchChanges []PostMatchPlayerChange `json:"post_match_changes"`
	CommandOutcomes  []CommandOutcome        `json:"command_outcomes"`
}

type CommandType string

const (
	CommandStart              CommandType = "start"
	CommandPause              CommandType = "pause"
	CommandResume             CommandType = "resume"
	CommandContinueSecondHalf CommandType = "continue_second_half"
	CommandChangeTactics      CommandType = "change_tactics"
	CommandSubstitute         CommandType = "substitute"
)

type MatchCommand struct {
	ID         string      `json:"command_id"`
	TargetTick int64       `json:"target_tick"`
	Sequence   int64       `json:"sequence"`
	Type       CommandType `json:"type"`
	TeamID     string      `json:"team_id,omitempty"`
	PlayerOut  string      `json:"player_out_id,omitempty"`
	PlayerIn   string      `json:"player_in_id,omitempty"`
	Slot       string      `json:"slot,omitempty"`
	Tactics    *Tactics    `json:"tactics,omitempty"`
	// Reason is an optional human-readable explanation. It is populated only
	// by a coach policy (internal/coach) for CLI diagnostics and the
	// recorded command log; user/scenario commands leave it empty. It never
	// affects validation, application or the state hash.
	Reason string `json:"reason,omitempty"`
}

type CommandOutcome struct {
	CommandID string `json:"command_id"`
	Accepted  bool   `json:"accepted"`
	Reason    string `json:"reason,omitempty"`
}
