package domain

// PlayerCondition is the coach-observable state of one squad player: enough
// to judge availability, role fit and workload without exposing engine
// internals, spatial state or skill attributes a coach policy is not
// documented to use (docs/simulation/coach.md).
type PlayerCondition struct {
	PlayerID         string
	TeamID           string
	Role             Role
	AllowedPositions []Role
	Slot             string // "" when the player does not currently hold a pitch slot
	OnPitch          bool
	EverPlayed       bool
	Fatigue          float64
	MinutesOnPit     float64
	YellowCards      int
	SentOff          bool
	Injured          bool
}

// CanPlayGK reports whether this player is eligible to play in goal.
func (c PlayerCondition) CanPlayGK() bool {
	if c.Role.IsGK() {
		return true
	}
	for _, pos := range c.AllowedPositions {
		if pos.IsGK() {
			return true
		}
	}
	return false
}

// CoachView is the read-only, independent representation of the match a
// coach policy observes (internal/coach). It intentionally omits RNG state,
// spatial positions/velocities and raw skill attributes: policy decisions
// are documented to use score/time, fatigue, cards, injuries, bench
// availability/roles and stats-derived effectiveness only.
type CoachView struct {
	Tick            int64
	Phase           MatchPhase
	Period          int
	PeriodElapsedMs int
	Score           Score

	HomeTeamID string
	AwayTeamID string

	// Tactics and SubstitutionsUsed are keyed by team ID; a policy only ever
	// looks values up by a known team ID, never ranges over the map, so
	// iteration order cannot affect a decision.
	Tactics            map[string]Tactics
	SubstitutionsUsed  map[string]int
	SubstitutionsLimit int

	// Players is every squad player (both teams), in the engine's stable
	// ID-sorted order.
	Players []PlayerCondition
	// PlayerStats is keyed by player ID; looked up, never ranged over.
	PlayerStats map[string]PlayerStats

	// RecentEvents holds only events strictly after the sequence the policy
	// observed last time (see LastEventSeq), so the same event is never
	// re-offered to the policy.
	RecentEvents []MatchEvent
	LastEventSeq int64
}

// TeamPlayers returns teamID's players from Players, preserving the stable
// ID order.
func (v CoachView) TeamPlayers(teamID string) []PlayerCondition {
	res := make([]PlayerCondition, 0, 16)
	for _, p := range v.Players {
		if p.TeamID == teamID {
			res = append(res, p)
		}
	}
	return res
}
