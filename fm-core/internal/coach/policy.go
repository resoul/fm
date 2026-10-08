// Package coach contains deterministic command-producing match assistants.
// It deliberately has no dependency on engine internals or RNG: a Policy
// reads only a domain.CoachView and returns ordinary domain.MatchCommand
// values for the runner to assign a target tick/sequence to, apply through
// the same Engine.Apply path as a user command, and record. See
// docs/simulation/coach.md for the accepted model and acceptance criteria.
package coach

import (
	"fmt"
	"strings"

	"github.com/resoul/fm-core/internal/match/domain"
)

// Config tunes Policy thresholds. All values are compared against facts
// already present in a CoachView (score, time, fatigue, cards, injuries,
// pass-completion sample) — never against RNG or future outcomes.
type Config struct {
	// ReevaluationIntervalTicks is the periodic cadence, in game ticks, at
	// which the policy reconsiders tactics outside of a significant event
	// or halftime. It is independent of step duration/pacing by design
	// (AGENTS.md: game time is fixed ticks).
	ReevaluationIntervalTicks int64
	// LateGameThresholdMs is how much elapsed second-half time counts as
	// "late" for the leading/trailing late-game reasons.
	LateGameThresholdMs int
	// FatigueSubstituteThreshold is the Fatigue (0..100) at/above which an
	// on-pitch outfield player becomes a fatigue-substitution candidate.
	FatigueSubstituteThreshold float64
	// MaxFatigueSubsPerTeam bounds how many fatigue-driven substitutions one
	// team can receive in a match, independent of the engine substitution
	// limit, so the policy does not spend the whole bench on fatigue alone.
	MaxFatigueSubsPerTeam int
	// LowPassCompletionThreshold and MinPassSample gate the "observably
	// ineffective" substitution reason: a player needs at least
	// MinPassSample attempted passes before a low completion rate is
	// treated as a signal rather than noise.
	LowPassCompletionThreshold float64
	MinPassSample              int
}

// DefaultConfig returns reasonable, documented thresholds.
func DefaultConfig() Config {
	return Config{
		ReevaluationIntervalTicks:  1200,
		LateGameThresholdMs:        15 * 60 * 1000,
		FatigueSubstituteThreshold: 88,
		MaxFatigueSubsPerTeam:      2,
		LowPassCompletionThreshold: 0.40,
		MinPassSample:              6,
	}
}

// teamReasons remembers which one-shot tactical reasons have already fired
// for a team this match, and how many fatigue/ineffectiveness substitutions
// it has received. Each reason fires at most once per team per match; this
// is the guard against constant tactic switching required by B6a. It is
// mutable Policy-local bookkeeping, not engine state: it never affects RNG
// or the simulated outcome, only which ordinary commands the policy offers.
type teamReasons struct {
	trailing, losingLate, leadingLate, ownRedCard, opponentRedCard bool
	fatigueSubs, ineffectiveSubs                                   int
}

// Policy is the B6a in-match coach: halftime substitutions plus reactive
// tactical adjustments through both halves and the interval, all through
// the same command path a user would use. It extends the B2 halftime-only
// policy (docs/architecture/decisions.md, decision 22/28) rather than
// replacing its intent.
type Policy struct {
	homeID, awayID string
	cfg            Config
	reasons        map[string]*teamReasons
}

// NewPolicy constructs a Policy for a specific match's two team IDs.
func NewPolicy(homeID, awayID string, cfg Config) *Policy {
	return &Policy{
		homeID: homeID, awayID: awayID, cfg: cfg,
		reasons: map[string]*teamReasons{homeID: {}, awayID: {}},
	}
}

// Commands implements runner.Coach. It is safe to call once per tick; it
// internally decides, from view.Tick/RecentEvents/Phase, whether this call
// is actually due to produce anything.
func (p *Policy) Commands(view domain.CoachView) []domain.MatchCommand {
	if view.Phase != domain.PhaseFirstHalf && view.Phase != domain.PhaseSecondHalf && view.Phase != domain.PhaseHalfTime {
		return nil
	}
	var commands []domain.MatchCommand
	due := view.Phase == domain.PhaseHalfTime ||
		containsSignificant(view.RecentEvents) ||
		(p.cfg.ReevaluationIntervalTicks > 0 && view.Tick%p.cfg.ReevaluationIntervalTicks == 0)
	if due {
		for _, teamID := range []string{p.homeID, p.awayID} {
			if cmd, ok := p.tacticsCommand(view, teamID); ok {
				commands = append(commands, cmd)
			}
		}
	}
	// Profile A/B1 only allow Substitute at halftime (engine.Apply); the
	// policy must not offer a substitution it knows will be rejected.
	if view.Phase == domain.PhaseHalfTime {
		commands = append(commands, p.substitutionCommands(view)...)
	}
	return commands
}

func containsSignificant(events []domain.MatchEvent) bool {
	for _, ev := range events {
		switch ev.Type {
		case domain.EventRedCard, domain.EventInjury, domain.EventGoal:
			return true
		}
	}
	return false
}

func hasRedCardFor(events []domain.MatchEvent, teamID string) bool {
	for _, ev := range events {
		if ev.Type == domain.EventRedCard && ev.TeamID == teamID {
			return true
		}
	}
	return false
}

func (p *Policy) opponent(teamID string) string {
	if teamID == p.homeID {
		return p.awayID
	}
	return p.homeID
}

func teamBehind(score domain.Score, teamID, homeID string) bool {
	if teamID == homeID {
		return score.Home < score.Away
	}
	return score.Away < score.Home
}

func teamAhead(score domain.Score, teamID, homeID string) bool {
	if teamID == homeID {
		return score.Home > score.Away
	}
	return score.Away > score.Home
}

// tacticsCommand composes every newly-triggered one-shot reason for teamID
// into a single ChangeTactics command, so one evaluation never emits more
// than one tactics command per team. Reasons already fired this match are
// skipped, which is what keeps the policy from re-adjusting the same team
// every reevaluation tick.
func (p *Policy) tacticsCommand(view domain.CoachView, teamID string) (domain.MatchCommand, bool) {
	current, ok := view.Tactics[teamID]
	if !ok {
		return domain.MatchCommand{}, false
	}
	reasons := p.reasons[teamID]
	next := current
	var texts []string

	if !reasons.trailing && teamBehind(view.Score, teamID, p.homeID) {
		next.Width = capUnit(next.Width + 0.10)
		next.LineHeight = capUnit(next.LineHeight + 0.10)
		next.Tempo = capUnit(next.Tempo + 0.20)
		next.Pressing = capUnit(next.Pressing + 0.20)
		reasons.trailing = true
		texts = append(texts, "trailing on the scoreboard: raising width/line_height/tempo/pressing to chase the game")
	}
	if !reasons.losingLate && teamBehind(view.Score, teamID, p.homeID) &&
		view.Period == 2 && view.PeriodElapsedMs >= p.cfg.LateGameThresholdMs {
		next.LineHeight = capUnit(next.LineHeight + 0.10)
		next.Pressing = capUnit(next.Pressing + 0.10)
		reasons.losingLate = true
		texts = append(texts, "still trailing late in the second half: pushing the line even higher")
	}
	if !reasons.leadingLate && teamAhead(view.Score, teamID, p.homeID) &&
		view.Period == 2 && view.PeriodElapsedMs >= p.cfg.LateGameThresholdMs {
		next.LineHeight = capUnit(next.LineHeight - 0.15)
		next.Tempo = capUnit(next.Tempo - 0.10)
		reasons.leadingLate = true
		texts = append(texts, "protecting a lead late in the second half: dropping the line and slowing tempo")
	}
	if !reasons.ownRedCard && hasRedCardFor(view.RecentEvents, teamID) {
		next.Width = capUnit(next.Width - 0.15)
		next.LineHeight = capUnit(next.LineHeight - 0.15)
		next.Tempo = capUnit(next.Tempo - 0.10)
		next.Pressing = capUnit(next.Pressing - 0.10)
		reasons.ownRedCard = true
		texts = append(texts, "reduced to ten (or fewer) players: compacting width/line_height to cover the gap left by the sending-off")
	}
	if !reasons.opponentRedCard && hasRedCardFor(view.RecentEvents, p.opponent(teamID)) {
		next.Width = capUnit(next.Width + 0.05)
		next.Pressing = capUnit(next.Pressing + 0.05)
		reasons.opponentRedCard = true
		texts = append(texts, "opponent reduced to ten (or fewer) players: pressing a little higher to use the extra man")
	}
	if len(texts) == 0 {
		return domain.MatchCommand{}, false
	}
	return domain.MatchCommand{
		ID:      fmt.Sprintf("ai-coach-tactics-%s-t%d", teamID, view.Tick),
		Type:    domain.CommandChangeTactics,
		TeamID:  teamID,
		Tactics: &next,
		Reason:  strings.Join(texts, "; "),
	}, true
}

// substitutionCommands is only called at halftime (the only window the
// engine accepts CommandSubstitute in Profile A/B1). It prioritizes an
// injured player, then the most fatigued player, then the most measurably
// ineffective player, always requiring a role-compatible unused bench
// player and remaining substitution budget before proposing anything.
func (p *Policy) substitutionCommands(view domain.CoachView) []domain.MatchCommand {
	var commands []domain.MatchCommand
	for _, teamID := range []string{p.homeID, p.awayID} {
		remaining := view.SubstitutionsLimit - view.SubstitutionsUsed[teamID]
		if remaining <= 0 {
			continue
		}
		used := map[string]bool{}
		reasons := p.reasons[teamID]

		for _, player := range view.TeamPlayers(teamID) {
			if remaining <= 0 {
				break
			}
			if !player.EverPlayed || player.OnPitch || !player.Injured || player.Slot == "" {
				continue
			}
			candidate, ok := benchCandidate(view, teamID, player.Slot, used)
			if !ok {
				continue
			}
			used[candidate.PlayerID] = true
			commands = append(commands, substituteCommand(teamID, player, candidate,
				fmt.Sprintf("player %s is injured and can no longer continue: bringing on %s", player.PlayerID, candidate.PlayerID)))
			remaining--
		}

		if remaining > 0 && reasons.fatigueSubs < p.cfg.MaxFatigueSubsPerTeam {
			if player, ok := mostFatigued(view, teamID, used, p.cfg.FatigueSubstituteThreshold); ok {
				if candidate, ok := benchCandidate(view, teamID, player.Slot, used); ok {
					used[candidate.PlayerID] = true
					commands = append(commands, substituteCommand(teamID, player, candidate,
						fmt.Sprintf("fatigue %.0f for %s is at/above the %.0f threshold: bringing on fresh legs %s",
							player.Fatigue, player.PlayerID, p.cfg.FatigueSubstituteThreshold, candidate.PlayerID)))
					remaining--
					reasons.fatigueSubs++
				}
			}
		}

		if remaining > 0 && reasons.ineffectiveSubs < 1 {
			if player, rate, ok := leastEffective(view, teamID, used, p.cfg.MinPassSample, p.cfg.LowPassCompletionThreshold); ok {
				if candidate, ok := benchCandidate(view, teamID, player.Slot, used); ok {
					used[candidate.PlayerID] = true
					commands = append(commands, substituteCommand(teamID, player, candidate,
						fmt.Sprintf("pass completion %.0f%% for %s over the observed sample is below the %.0f%% threshold: bringing on %s",
							rate*100, player.PlayerID, p.cfg.LowPassCompletionThreshold*100, candidate.PlayerID)))
					remaining--
					reasons.ineffectiveSubs++
				}
			}
		}
	}
	return commands
}

func substituteCommand(teamID string, out, in domain.PlayerCondition, reason string) domain.MatchCommand {
	return domain.MatchCommand{
		ID:        fmt.Sprintf("ai-coach-sub-%s-%s", teamID, out.PlayerID),
		Type:      domain.CommandSubstitute,
		TeamID:    teamID,
		PlayerOut: out.PlayerID,
		PlayerIn:  in.PlayerID,
		Slot:      out.Slot,
		Reason:    reason,
	}
}

// benchCandidate returns the first (stable ID order) unused bench player of
// teamID eligible to play slot, matching exactly the role compatibility
// engine.substitute enforces, so the policy never proposes a substitution
// the engine would reject for role mismatch.
func benchCandidate(view domain.CoachView, teamID, slot string, used map[string]bool) (domain.PlayerCondition, bool) {
	for _, p := range view.TeamPlayers(teamID) {
		if p.OnPitch || p.EverPlayed || used[p.PlayerID] {
			continue
		}
		if slot == "GK" {
			if !p.CanPlayGK() {
				continue
			}
		} else if p.Role.IsGK() && len(p.AllowedPositions) == 0 {
			continue
		}
		return p, true
	}
	return domain.PlayerCondition{}, false
}

func mostFatigued(view domain.CoachView, teamID string, used map[string]bool, threshold float64) (domain.PlayerCondition, bool) {
	var best domain.PlayerCondition
	found := false
	for _, p := range view.TeamPlayers(teamID) {
		if !p.OnPitch || p.SentOff || p.Injured || p.Slot == "" || used[p.PlayerID] {
			continue
		}
		if p.Fatigue < threshold {
			continue
		}
		if !found || p.Fatigue > best.Fatigue {
			best, found = p, true
		}
	}
	return best, found
}

func leastEffective(view domain.CoachView, teamID string, used map[string]bool, minSample int, threshold float64) (domain.PlayerCondition, float64, bool) {
	var worst domain.PlayerCondition
	worstRate := 1.0
	found := false
	for _, p := range view.TeamPlayers(teamID) {
		if !p.OnPitch || p.SentOff || p.Injured || p.Slot == "" || used[p.PlayerID] || p.Role.IsGK() {
			continue
		}
		stats, ok := view.PlayerStats[p.PlayerID]
		if !ok || stats.Passes < minSample {
			continue
		}
		rate := float64(stats.CompletedPasses) / float64(stats.Passes)
		if rate >= threshold {
			continue
		}
		if !found || rate < worstRate {
			worst, worstRate, found = p, rate, true
		}
	}
	return worst, worstRate, found
}

func capUnit(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}
