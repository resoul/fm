package coach

import (
	"testing"

	"github.com/resoul/fm-core/internal/match/domain"
)

func baseTactics() domain.Tactics {
	return domain.Tactics{Formation: "4-4-2", Width: 0.5, LineHeight: 0.5, Tempo: 0.5, Pressing: 0.5}
}

func baseView() domain.CoachView {
	return domain.CoachView{
		Tick: 1, Phase: domain.PhaseHalfTime, Period: 1,
		Score:      domain.Score{Home: 0, Away: 0},
		HomeTeamID: "home", AwayTeamID: "away",
		Tactics:            map[string]domain.Tactics{"home": baseTactics(), "away": baseTactics()},
		SubstitutionsUsed:  map[string]int{"home": 0, "away": 0},
		SubstitutionsLimit: 3,
		PlayerStats:        map[string]domain.PlayerStats{},
	}
}

func findTacticsCommand(commands []domain.MatchCommand, teamID string) *domain.MatchCommand {
	for i := range commands {
		if commands[i].Type == domain.CommandChangeTactics && commands[i].TeamID == teamID {
			return &commands[i]
		}
	}
	return nil
}

func findSubstituteCommand(commands []domain.MatchCommand, playerOut string) *domain.MatchCommand {
	for i := range commands {
		if commands[i].Type == domain.CommandSubstitute && commands[i].PlayerOut == playerOut {
			return &commands[i]
		}
	}
	return nil
}

func TestPolicyBoostsTrailingTeamAtHalftime(t *testing.T) {
	view := baseView()
	view.Score = domain.Score{Home: 0, Away: 1}
	p := NewPolicy("home", "away", DefaultConfig())
	commands := p.Commands(view)
	cmd := findTacticsCommand(commands, "home")
	if cmd == nil {
		t.Fatalf("commands = %+v, want a home tactics command", commands)
	}
	want := domain.Tactics{Formation: "4-4-2", Width: 0.6, LineHeight: 0.6, Tempo: 0.7, Pressing: 0.7}
	if *cmd.Tactics != want {
		t.Fatalf("tactics = %+v, want %+v", *cmd.Tactics, want)
	}
	if cmd.Reason == "" {
		t.Fatal("expected a non-empty explanation")
	}
	if findTacticsCommand(commands, "away") != nil {
		t.Fatal("leading team should not receive a tactics command")
	}
}

func TestPolicyDoesNothingWhenLevel(t *testing.T) {
	p := NewPolicy("home", "away", DefaultConfig())
	commands := p.Commands(baseView())
	if len(commands) != 0 {
		t.Fatalf("commands = %+v, want none", commands)
	}
}

func TestPolicyTrailingReasonFiresOnlyOnce(t *testing.T) {
	view := baseView()
	view.Score = domain.Score{Home: 0, Away: 1}
	p := NewPolicy("home", "away", DefaultConfig())
	first := p.Commands(view)
	if findTacticsCommand(first, "home") == nil {
		t.Fatal("expected a tactics command on the first evaluation")
	}
	// A second evaluation with the same (still trailing) situation must not
	// re-emit the same reason: this is the guard against constant tactic
	// switching required by B6a.
	second := p.Commands(view)
	if cmd := findTacticsCommand(second, "home"); cmd != nil {
		t.Fatalf("second evaluation should not repeat the trailing reason, got %+v", cmd)
	}
}

func TestPolicyReactsToOwnRedCardMidMatch(t *testing.T) {
	view := baseView()
	view.Phase = domain.PhaseFirstHalf
	view.Tick = 777 // not an interval boundary
	view.RecentEvents = []domain.MatchEvent{{Sequence: 1, Type: domain.EventRedCard, TeamID: "home"}}
	p := NewPolicy("home", "away", DefaultConfig())
	commands := p.Commands(view)
	cmd := findTacticsCommand(commands, "home")
	if cmd == nil {
		t.Fatalf("commands = %+v, want a home tactics command reacting to its own red card", commands)
	}
	if cmd.Tactics.Width >= 0.5 || cmd.Tactics.LineHeight >= 0.5 {
		t.Fatalf("expected a compacted (narrower/deeper) shape, got %+v", *cmd.Tactics)
	}
	// A substitution must never be offered outside halftime, even reacting
	// to a significant event (engine.Apply only allows Substitute at
	// halftime in profile A/B1).
	for _, c := range commands {
		if c.Type == domain.CommandSubstitute {
			t.Fatalf("unexpected substitution outside halftime: %+v", c)
		}
	}
}

func TestPolicyReactsToOpponentRedCard(t *testing.T) {
	view := baseView()
	view.Phase = domain.PhaseSecondHalf
	view.Tick = 555
	view.RecentEvents = []domain.MatchEvent{{Sequence: 1, Type: domain.EventRedCard, TeamID: "away"}}
	p := NewPolicy("home", "away", DefaultConfig())
	commands := p.Commands(view)
	cmd := findTacticsCommand(commands, "home")
	if cmd == nil {
		t.Fatalf("commands = %+v, want home to react to the opponent's red card", commands)
	}
	if cmd.Tactics.Width <= 0.5 || cmd.Tactics.Pressing <= 0.5 {
		t.Fatalf("expected a more attacking shape, got %+v", *cmd.Tactics)
	}
}

func TestPolicyPeriodicIntervalReevaluatesMidMatch(t *testing.T) {
	cfg := DefaultConfig()
	cfg.ReevaluationIntervalTicks = 100
	view := baseView()
	view.Phase = domain.PhaseFirstHalf
	view.Tick = 200 // an interval boundary, no significant events
	view.Score = domain.Score{Home: 0, Away: 1}
	p := NewPolicy("home", "away", cfg)
	commands := p.Commands(view)
	if findTacticsCommand(commands, "home") == nil {
		t.Fatalf("commands = %+v, want a periodic re-evaluation to catch the trailing team", commands)
	}
}

func TestPolicyDoesNotEvaluateOffIntervalWithoutEvent(t *testing.T) {
	cfg := DefaultConfig()
	cfg.ReevaluationIntervalTicks = 100
	view := baseView()
	view.Phase = domain.PhaseFirstHalf
	view.Tick = 250 // not on the interval boundary
	view.Score = domain.Score{Home: 0, Away: 1}
	p := NewPolicy("home", "away", cfg)
	if commands := p.Commands(view); len(commands) != 0 {
		t.Fatalf("commands = %+v, want none off the reevaluation interval", commands)
	}
}

func TestPolicyLeadingLateCompactsTactics(t *testing.T) {
	cfg := DefaultConfig()
	view := baseView()
	view.Phase = domain.PhaseSecondHalf
	view.Period = 2
	view.PeriodElapsedMs = cfg.LateGameThresholdMs
	view.Score = domain.Score{Home: 1, Away: 0}
	view.Tick = cfg.ReevaluationIntervalTicks
	p := NewPolicy("home", "away", cfg)
	cmd := findTacticsCommand(p.Commands(view), "home")
	if cmd == nil {
		t.Fatalf("expected home to manage a late lead")
	}
	if cmd.Tactics.LineHeight >= 0.5 || cmd.Tactics.Tempo >= 0.5 {
		t.Fatalf("expected a deeper, slower shape protecting the lead, got %+v", *cmd.Tactics)
	}
}

func teamPlayer(id, teamID string, role domain.Role, onPitch bool, slot string) domain.PlayerCondition {
	return domain.PlayerCondition{PlayerID: id, TeamID: teamID, Role: role, Slot: slot, OnPitch: onPitch, EverPlayed: onPitch}
}

func TestPolicySubstitutesInjuredPlayerAtHalftime(t *testing.T) {
	view := baseView()
	injured := teamPlayer("h1", "home", domain.RoleCB, false, "CB_L")
	injured.EverPlayed, injured.Injured = true, true
	bench := teamPlayer("h12", "home", domain.RoleCB, false, "")
	bench.EverPlayed = false
	view.Players = []domain.PlayerCondition{injured, bench}

	p := NewPolicy("home", "away", DefaultConfig())
	commands := p.Commands(view)
	cmd := findSubstituteCommand(commands, "h1")
	if cmd == nil {
		t.Fatalf("commands = %+v, want a substitution for the injured player", commands)
	}
	if cmd.PlayerIn != "h12" || cmd.Slot != "CB_L" || cmd.Reason == "" {
		t.Fatalf("unexpected substitute command: %+v", *cmd)
	}
}

func TestPolicyDoesNotSubstituteOutsideHalftimeEvenIfInjured(t *testing.T) {
	view := baseView()
	view.Phase = domain.PhaseSecondHalf
	view.Tick = 999
	injured := teamPlayer("h1", "home", domain.RoleCB, false, "CB_L")
	injured.EverPlayed, injured.Injured = true, true
	bench := teamPlayer("h12", "home", domain.RoleCB, false, "")
	bench.EverPlayed = false
	view.Players = []domain.PlayerCondition{injured, bench}
	view.RecentEvents = []domain.MatchEvent{{Sequence: 1, Type: domain.EventInjury, TeamID: "home", PlayerID: "h1"}}

	p := NewPolicy("home", "away", DefaultConfig())
	commands := p.Commands(view)
	if cmd := findSubstituteCommand(commands, "h1"); cmd != nil {
		t.Fatalf("substitution must wait for halftime, got %+v", *cmd)
	}
}

func TestPolicyNoEligibleBenchCandidateProposesNothing(t *testing.T) {
	view := baseView()
	injured := teamPlayer("h1", "home", domain.RoleGK, false, "GK")
	injured.EverPlayed, injured.Injured = true, true
	// Only outfield bench players available: none can play GK.
	bench := teamPlayer("h12", "home", domain.RoleCB, false, "")
	bench.EverPlayed = false
	view.Players = []domain.PlayerCondition{injured, bench}

	p := NewPolicy("home", "away", DefaultConfig())
	commands := p.Commands(view)
	if cmd := findSubstituteCommand(commands, "h1"); cmd != nil {
		t.Fatalf("no GK-eligible bench candidate exists, got %+v", *cmd)
	}
}

func TestPolicyGKSubstitutionRequiresCanPlayGK(t *testing.T) {
	view := baseView()
	injured := teamPlayer("h1", "home", domain.RoleGK, false, "GK")
	injured.EverPlayed, injured.Injured = true, true
	notGK := teamPlayer("h10", "home", domain.RoleCB, false, "")
	notGK.EverPlayed = false
	canGK := teamPlayer("h11", "home", domain.RoleCB, false, "")
	canGK.EverPlayed, canGK.AllowedPositions = false, []domain.Role{domain.RoleGK}
	view.Players = []domain.PlayerCondition{injured, notGK, canGK}

	p := NewPolicy("home", "away", DefaultConfig())
	cmd := findSubstituteCommand(p.Commands(view), "h1")
	if cmd == nil {
		t.Fatal("expected a substitution using the GK-capable bench player")
	}
	if cmd.PlayerIn != "h11" {
		t.Fatalf("player_in = %q, want h11 (the only GK-capable candidate)", cmd.PlayerIn)
	}
}

func TestPolicyRespectsSubstitutionLimit(t *testing.T) {
	view := baseView()
	view.SubstitutionsUsed["home"] = view.SubstitutionsLimit
	injured := teamPlayer("h1", "home", domain.RoleCB, false, "CB_L")
	injured.EverPlayed, injured.Injured = true, true
	bench := teamPlayer("h12", "home", domain.RoleCB, false, "")
	bench.EverPlayed = false
	view.Players = []domain.PlayerCondition{injured, bench}

	p := NewPolicy("home", "away", DefaultConfig())
	if cmd := findSubstituteCommand(p.Commands(view), "h1"); cmd != nil {
		t.Fatalf("substitution limit exhausted, got %+v", *cmd)
	}
}

func TestPolicySubstitutesMostFatiguedPlayer(t *testing.T) {
	view := baseView()
	tired := teamPlayer("h1", "home", domain.RoleCM, true, "CM_L")
	tired.Fatigue = 95
	fine := teamPlayer("h2", "home", domain.RoleCM, true, "CM_R")
	fine.Fatigue = 30
	bench := teamPlayer("h12", "home", domain.RoleCM, false, "")
	bench.EverPlayed = false
	view.Players = []domain.PlayerCondition{tired, fine, bench}

	p := NewPolicy("home", "away", DefaultConfig())
	cmd := findSubstituteCommand(p.Commands(view), "h1")
	if cmd == nil {
		t.Fatal("expected the most fatigued player to be substituted")
	}
	if cmd.PlayerIn != "h12" {
		t.Fatalf("player_in = %q, want h12", cmd.PlayerIn)
	}
}

func TestPolicySubstitutesIneffectivePlayerBySampledPassCompletion(t *testing.T) {
	view := baseView()
	poor := teamPlayer("h1", "home", domain.RoleCM, true, "CM_L")
	view.PlayerStats["h1"] = domain.PlayerStats{PlayerID: "h1", Passes: 10, CompletedPasses: 2}
	tooFewAttempts := teamPlayer("h2", "home", domain.RoleCM, true, "CM_R")
	view.PlayerStats["h2"] = domain.PlayerStats{PlayerID: "h2", Passes: 1, CompletedPasses: 0}
	bench1 := teamPlayer("h12", "home", domain.RoleCM, false, "")
	bench1.EverPlayed = false
	bench2 := teamPlayer("h13", "home", domain.RoleCM, false, "")
	bench2.EverPlayed = false
	view.Players = []domain.PlayerCondition{poor, tooFewAttempts, bench1, bench2}

	p := NewPolicy("home", "away", DefaultConfig())
	commands := p.Commands(view)
	if cmd := findSubstituteCommand(commands, "h1"); cmd == nil {
		t.Fatal("expected the observably ineffective player (sufficient sample) to be substituted")
	}
	// h2's sample is below MinPassSample: it must be filtered out even
	// though a second bench candidate (h13) remains available.
	if cmd := findSubstituteCommand(commands, "h2"); cmd != nil {
		t.Fatalf("a player below the minimum sample size must not be substituted for ineffectiveness, got %+v", *cmd)
	}
}

func TestPolicySkipsUsedBenchCandidateAcrossPriorities(t *testing.T) {
	view := baseView()
	injured := teamPlayer("h1", "home", domain.RoleCM, false, "CM_L")
	injured.EverPlayed, injured.Injured = true, true
	tired := teamPlayer("h2", "home", domain.RoleCM, true, "CM_R")
	tired.Fatigue = 95
	// Only one eligible bench candidate for both open slots' role.
	onlyBench := teamPlayer("h12", "home", domain.RoleCM, false, "")
	onlyBench.EverPlayed = false
	view.Players = []domain.PlayerCondition{injured, tired, onlyBench}

	p := NewPolicy("home", "away", DefaultConfig())
	commands := p.Commands(view)
	injurySub := findSubstituteCommand(commands, "h1")
	fatigueSub := findSubstituteCommand(commands, "h2")
	if injurySub == nil || injurySub.PlayerIn != "h12" {
		t.Fatalf("expected the injury substitution to claim the only bench candidate, got %+v", commands)
	}
	if fatigueSub != nil {
		t.Fatalf("no bench candidate left for the fatigue substitution, got %+v", *fatigueSub)
	}
}
