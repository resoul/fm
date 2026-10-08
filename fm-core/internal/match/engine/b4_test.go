package engine

import (
	"math"
	"math/rand"
	"reflect"
	"testing"

	"github.com/resoul/fm-core/internal/match/domain"
)

func b4Start(t *testing.T) *Engine {
	t.Helper()
	e := testEngine(t)
	if out := e.Apply(domain.MatchCommand{ID: "start", Type: domain.CommandStart}); !out.Accepted {
		t.Fatal(out)
	}
	return e
}

func b4Step(t *testing.T, e *Engine) StepOutput {
	t.Helper()
	out, err := e.Step()
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func TestB4CrossResolvesThroughStep(t *testing.T) {
	for _, defended := range []bool{false, true} {
		t.Run(map[bool]string{false: "receive", true: "duel"}[defended], func(t *testing.T) {
			e := b4Start(t)
			for i := range e.players {
				p := &e.players[i]
				p.speed = 0
				p.state.Position = domain.Vec3{X: -25, Z: -40}
			}
			carrier := e.playerByID("h_10")
			carrier.state.Position = domain.Vec3{X: 25, Z: 20}
			target := e.playerByID("h_11")
			target.state.Position = domain.Vec3{X: 22, Z: 26}
			if defended {
				defender := e.playerByID("a_10")
				defender.state.Position = target.state.Position
				target.instructions.AerialDuel = 0
				defender.instructions.AerialDuel = 1
			}
			e.ball.Position = carrier.state.Position
			carrier.attributes.Crossing = 20
			e.startCross(carrier, e.teamStats["home"], carrier.attributes.Crossing)
			if e.passTargetID != target.state.ID {
				t.Fatalf("unexpected target %s", e.passTargetID)
			}
			for i := 0; i < 200 && e.ball.Status == "crossing"; i++ {
				b4Step(t, e)
			}
			want := target
			if defended {
				want = e.playerByID("a_10")
			}
			if e.ball.CarrierID != want.state.ID {
				t.Fatalf("cross not resolved: %+v", e.ball)
			}
			if e.ball.Position.X != want.state.Position.X || e.ball.Position.Z != want.state.Position.Z || e.ball.Position.Y != e.ball.Radius {
				t.Fatal("controlled ball not at receiver")
			}
			if carrier.stats.Passes != 1 || carrier.stats.Crosses != 1 || e.teamStats["home"].Passes != 1 {
				t.Fatal("cross must count as pass attempt")
			}
			if !defended && (carrier.stats.CompletedPasses != 1 || e.teamStats["home"].SuccessfulCrosses != 1) {
				t.Fatal("missing completed cross")
			}
			if defended && (carrier.stats.CompletedPasses != 0 || want.stats.WonAerialDuels != 1) {
				t.Fatal("lost cross credited as completed")
			}
		})
	}
}

func TestB4SubstitutionAfterInjuryAndDismissal(t *testing.T) {
	for _, reason := range []string{"normal", "injury", "red"} {
		t.Run(reason, func(t *testing.T) {
			e := b4Start(t)
			out := e.playerByID("h_10")
			if reason == "injury" {
				e.injurePlayer(out)
			}
			if reason == "red" {
				e.issueCard(out)
				e.issueCard(out)
			}
			for e.phase != domain.PhaseHalfTime {
				b4Step(t, e)
			}
			cmd := domain.MatchCommand{ID: "sub", TargetTick: e.tick, Type: domain.CommandSubstitute, TeamID: "home", PlayerOut: "h_10", PlayerIn: "h_16", Slot: "ST_L"}
			result := e.Apply(cmd)
			if reason == "red" {
				if result.Accepted {
					t.Fatal("replaced dismissed player")
				}
				return
			}
			if !result.Accepted {
				t.Fatal(result.Reason)
			}
			p := e.playerByID("h_16")
			if p.speed <= 0 || p.slot != "ST_L" || p.target == (domain.Vec2{}) || out.sentOff {
				t.Fatal("replacement not initialized or injury treated as red")
			}
			cmd.PlayerIn = "h_15"
			if e.Apply(cmd).Accepted {
				t.Fatal("replaced same player twice")
			}
			if !e.Apply(domain.MatchCommand{ID: "continue", TargetTick: e.tick, Type: domain.CommandContinueSecondHalf}).Accepted {
				t.Fatal("continue rejected")
			}
			before := p.state.Position
			b4Step(t, e)
			if p.state.Position == before || p.stats.DistanceM <= 0 || p.state.MinutesOnPit <= 0 {
				t.Fatal("replacement did not move/participate")
			}
		})
	}
}

func TestB4ApplyRejectsInvalidTacticsAndTerminalMutation(t *testing.T) {
	for _, field := range []string{"formation", "width", "line", "tempo", "pressing"} {
		for _, value := range []float64{-1, 2, math.NaN(), math.Inf(1)} {
			e := b4Start(t)
			tactics := e.input.HomeTeam.Tactics
			switch field {
			case "formation":
				tactics.Formation = ""
			case "width":
				tactics.Width = value
			case "line":
				tactics.LineHeight = value
			case "tempo":
				tactics.Tempo = value
			case "pressing":
				tactics.Pressing = value
			}
			before := e.StateHash()
			if e.Apply(domain.MatchCommand{ID: "bad", Type: domain.CommandChangeTactics, TeamID: "home", Tactics: &tactics}).Accepted {
				t.Fatal("invalid tactics accepted")
			}
			if e.StateHash() != before {
				t.Fatal("rejection mutated state/RNG")
			}
			b4Step(t, e)
		}
	}
	for _, phase := range []domain.MatchPhase{domain.PhaseFinished, domain.PhaseAbandoned} {
		e := b4Start(t)
		e.phase = phase
		before := e.StateHash()
		result, _ := e.Result()
		for _, kind := range []domain.CommandType{domain.CommandStart, domain.CommandPause, domain.CommandResume, domain.CommandContinueSecondHalf, domain.CommandChangeTactics, domain.CommandSubstitute} {
			tactics := e.input.HomeTeam.Tactics
			tactics.Tempo = 0
			if e.Apply(domain.MatchCommand{ID: "terminal", Type: kind, TeamID: "home", Tactics: &tactics}).Accepted {
				t.Fatal("terminal command accepted")
			}
		}
		after, _ := e.Result()
		if e.StateHash() != before || !reflect.DeepEqual(result, after) {
			t.Fatal("terminal match mutated")
		}
	}
}

func TestB4ZeroInstructions(t *testing.T) {
	e := b4Start(t)
	carrier := e.playerByID("h_10")
	target := e.playerByID("h_11")
	carrier.instructions.CrossFrequency = 0
	if e.crossDecisionRate(carrier, target, 0) != 0 {
		t.Fatal("zero crossing replaced by default")
	}
	defender := e.playerByID("a_10")
	defender.state.Position = carrier.state.Position
	defender.instructions.Pressing = 0
	e.ball.CarrierID = carrier.state.ID
	if e.shouldPress(defender, "home") {
		t.Fatal("zero pressing replaced by default")
	}
	b4Step(t, e)
}

func TestB4ShotOutcomesThroughStep(t *testing.T) {
	outcomes := map[string]bool{}
	for seed := int64(1); seed <= 40; seed++ {
		for _, missing := range []bool{false, true} {
			e := b4Start(t)
			e.rng = rand.New(rand.NewSource(seed))
			for i := range e.players {
				e.players[i].speed = 0
				e.players[i].state.Position = domain.Vec3{X: 25, Z: -30}
			}
			if missing {
				e.issueCard(e.playerByID("a_1"))
				e.issueCard(e.playerByID("a_1"))
			}
			shooter := e.playerByID("h_10")
			shooter.state.Position = domain.Vec3{Z: 50}
			e.ball.Position = shooter.state.Position
			e.ball.Position.Y = e.ball.Radius
			e.startShot(shooter)
			if e.teamStats["home"].ShotsOnTarget != 0 {
				t.Fatal("shot classified before resolution")
			}
			for e.ball.Status == "flying" {
				b4Step(t, e)
			}
			stats := e.teamStats["home"]
			saves := 0
			for _, event := range e.events {
				if event.Type == domain.EventSave {
					saves++
					if event.PlayerID != "a_1" || event.TeamID != "away" || event.TargetPlayerID != shooter.state.ID {
						t.Fatal("save attributed incorrectly")
					}
				}
			}
			if e.playerByID("a_1").stats.Saves != saves {
				t.Fatal("missing keeper stats")
			}
			if missing && saves != 0 {
				t.Fatal("phantom keeper save")
			}
			if stats.Shots != 1 || stats.ShotsOnTarget != stats.Goals+saves {
				t.Fatalf("inconsistent stats: %+v saves=%d", stats, saves)
			}
			if stats.Goals > 0 {
				outcomes["goal"] = true
			}
			if saves > 0 {
				outcomes["save"] = true
			}
			if stats.ShotsOnTarget == 0 {
				outcomes["miss"] = true
			}
		}
	}
	if len(outcomes) != 3 {
		t.Fatalf("uncovered outcomes: %v", outcomes)
	}
}

func TestB4KeeperSkillsAffectResolution(t *testing.T) {
	saves := [2]int{}
	for seed := int64(1); seed <= 100; seed++ {
		for level, skill := range []int{1, 20} {
			e := b4Start(t)
			keeper := e.playerByID("a_1")
			keeper.attributes.Handling = skill
			keeper.attributes.Reflexes = skill
			e.rng = rand.New(rand.NewSource(seed))
			e.shotTeamID = "home"
			e.shotPlayerID = "h_10"
			e.teamStats["home"].Shots = 1
			e.ball.Status = "flying"
			e.ball.CarrierID = ""
			e.ball.Position = domain.Vec3{Z: 52.4, Y: e.ball.Radius}
			e.ball.Velocity = domain.Vec3{Z: 20}
			e.ballFlightTicks = 1
			b4Step(t, e)
			saves[level] += keeper.stats.Saves
		}
	}
	if saves[1] <= saves[0] {
		t.Fatalf("skills have no effect: %v", saves)
	}
}

func TestB4HashIncludesHiddenPlayerState(t *testing.T) {
	for _, mutate := range []func(*Engine){func(e *Engine) { e.players[0].slot = "" }, func(e *Engine) { e.players[0].target.X++ }, func(e *Engine) { e.players[0].sentOff = true }, func(e *Engine) { e.players[0].stats.Saves++ }, func(e *Engine) { e.input.HomeTeam.Tactics.Width = 0 }} {
		e := testEngine(t)
		before := e.StateHash()
		mutate(e)
		if e.StateHash() == before {
			t.Fatal("hidden state omitted from hash")
		}
	}
}

func TestB4BlockedShotIsNotOnTarget(t *testing.T) {
	e := b4Start(t)
	for i := range e.players {
		e.players[i].speed = 0
		e.players[i].state.Position = domain.Vec3{X: 25, Z: -30}
	}
	shooter := e.playerByID("h_10")
	shooter.state.Position = domain.Vec3{Z: 0}
	e.ball.Position = shooter.state.Position
	e.ball.Position.Y = e.ball.Radius
	e.startShot(shooter)
	defender := e.playerByID("a_10")
	defender.state.Position = domain.Vec3{X: e.ball.Velocity.X * 0.025, Z: e.ball.Velocity.Z * 0.025}
	b4Step(t, e)
	if e.ball.CarrierID != defender.state.ID || e.teamStats["home"].ShotsOnTarget != 0 || e.teamStats["home"].Shots != 1 {
		t.Fatal("blocked shot counted on target")
	}
}

func TestB4PenaltySaveBelongsToKeeper(t *testing.T) {
	outcomes := map[domain.MatchEventType]bool{}
	for seed := int64(1); seed <= 60; seed++ {
		e := b4Start(t)
		e.rng = rand.New(rand.NewSource(seed))
		e.takePenalty("home")
		keeper := e.playerByID("a_1")
		saves := 0
		for _, event := range e.events {
			switch event.Type {
			case domain.EventGoal, domain.EventGoalKick:
				outcomes[event.Type] = true
			case domain.EventSave:
				outcomes[event.Type] = true
				saves++
				if event.PlayerID != keeper.state.ID || event.TeamID != "away" || event.TargetPlayerID == "" {
					t.Fatal("penalty save attributed to taker")
				}
			}
		}
		if saves != keeper.stats.Saves || e.teamStats["home"].ShotsOnTarget != e.score.Home+saves {
			t.Fatal("penalty stats inconsistent")
		}
		b4Step(t, e)
	}
	if len(outcomes) != 3 {
		t.Fatalf("missing penalty outcomes: %v", outcomes)
	}
}

func TestB4SubstituteGoalkeeperOwnsSaveRole(t *testing.T) {
	e := b4Start(t)
	for e.phase != domain.PhaseHalfTime {
		b4Step(t, e)
	}
	// The fixture's reserve GK is h_12.
	cmd := domain.MatchCommand{ID: "gk", TargetTick: e.tick, Type: domain.CommandSubstitute, TeamID: "home", PlayerOut: "h_1", PlayerIn: "h_16", Slot: "GK"}
	if e.Apply(cmd).Accepted {
		t.Fatal("outfield player accepted as GK")
	}
	cmd.PlayerIn = "h_12"
	if out := e.Apply(cmd); !out.Accepted {
		t.Fatal(out.Reason)
	}
	if keeper := e.defendingKeeper("away"); keeper == nil || keeper.state.ID != "h_12" {
		t.Fatal("reserve GK did not acquire role")
	}
}
