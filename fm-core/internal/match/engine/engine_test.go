package engine

import (
	"errors"
	"math"
	"math/rand"
	"testing"

	jsonAdapter "github.com/resoul/fm-core/internal/adapters/json"
	"github.com/resoul/fm-core/internal/match/config"
	"github.com/resoul/fm-core/internal/match/domain"
)

func testEngine(t *testing.T) *Engine {
	t.Helper()
	input, err := jsonAdapter.LoadMatchInputFromFile("../../../fixtures/match/equal.json")
	if err != nil {
		t.Fatal(err)
	}
	e, err := New(input, config.ShortTestConfig(), 42)
	if err != nil {
		t.Fatal(err)
	}
	return e
}

func TestEngineLifecycleAndSnapshots(t *testing.T) {
	e := testEngine(t)
	if got := e.Snapshot().Phase; got != domain.PhaseNotStarted {
		t.Fatalf("initial phase = %s", got)
	}
	if out := e.Apply(domain.MatchCommand{ID: "start", TargetTick: 0, Type: domain.CommandStart}); !out.Accepted {
		t.Fatal(out.Reason)
	}
	initial := e.Snapshot()
	if len(initial.Players) != 22 {
		t.Fatalf("players = %d, want 22", len(initial.Players))
	}
	for i := 0; i < 1200; i++ {
		if _, err := e.Step(); err != nil {
			t.Fatal(err)
		}
	}
	if e.Phase() != domain.PhaseHalfTime {
		t.Fatalf("phase = %s, want halftime", e.Phase())
	}
	if e.Snapshot().Tick != 1200 {
		t.Fatalf("tick = %d, want 1200", e.Snapshot().Tick)
	}
	if out := e.Apply(domain.MatchCommand{ID: "continue", TargetTick: e.Tick(), Type: domain.CommandContinueSecondHalf}); !out.Accepted {
		t.Fatal(out.Reason)
	}
	if e.Snapshot().Period != 2 {
		t.Fatal("period did not advance")
	}
	for e.Phase() != domain.PhaseFinished {
		if _, err := e.Step(); err != nil {
			t.Fatal(err)
		}
	}
	result, err := e.Result()
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != "finished" || result.Ticks != 2400 || result.RulesProfile != "profile_a" {
		t.Fatalf("unexpected result: %+v", result)
	}
	// A goal isn't guaranteed any more in a compressed 2-minute window: B6's
	// skill-scaled shot accuracy and real GK saves make scoring meaningfully
	// rarer than the old flat-probability resolution. The shot pipeline
	// itself firing (checked next) is this test's actual concern.
	if len(result.TeamStats) != 2 || result.TeamStats[0].Shots+result.TeamStats[1].Shots == 0 {
		t.Fatalf("missing shot statistics: %+v", result.TeamStats)
	}
	for _, event := range result.Events {
		if event.Type == domain.EventGoal && event.PlayerID == "" {
			t.Fatal("goal event has no shooter")
		}
	}
	if result.Events[0].Type != domain.EventKickoff || result.Events[len(result.Events)-1].Type != domain.EventFullTime {
		t.Fatalf("unexpected events: %+v", result.Events)
	}
	initial.Players[0].Position.X = 999
	if e.Snapshot().Players[0].Position.X == 999 {
		t.Fatal("snapshot leaked mutable player state")
	}
}

func TestEnginePauseDoesNotAdvance(t *testing.T) {
	e := testEngine(t)
	if out := e.Apply(domain.MatchCommand{ID: "start", TargetTick: 0, Type: domain.CommandStart}); !out.Accepted {
		t.Fatal(out.Reason)
	}
	if out := e.Apply(domain.MatchCommand{ID: "pause", TargetTick: 0, Type: domain.CommandPause}); !out.Accepted {
		t.Fatal(out.Reason)
	}
	before := e.Snapshot()
	if _, err := e.Step(); err != ErrMatchPaused {
		t.Fatalf("step error = %v, want ErrMatchPaused", err)
	}
	after := e.Snapshot()
	if before.Tick != after.Tick || before.PeriodElapsedMs != after.PeriodElapsedMs {
		t.Fatal("paused step advanced clock")
	}
}

func TestShotOutsideGoalBecomesGoalKick(t *testing.T) {
	e := testEngine(t)
	if out := e.Apply(domain.MatchCommand{ID: "start", TargetTick: 0, Type: domain.CommandStart}); !out.Accepted {
		t.Fatal(out.Reason)
	}
	e.shotTeamID, e.shotPlayerID = "home", "h_10"
	e.ball = domain.BallState{
		Position: domain.Vec3{X: e.cfg.Pitch.GoalWidthM, Y: e.cfg.Pitch.BallRadiusM, Z: e.cfg.Pitch.LengthM/2 - 0.1},
		Velocity: domain.Vec3{Z: 10}, Radius: e.cfg.Pitch.BallRadiusM, Status: "flying",
	}
	e.ballFlightTicks = 1
	before := len(e.events)
	e.advanceBall()
	foundGoalKick := false
	for _, ev := range e.events[before:] {
		if ev.Type == domain.EventGoalKick {
			foundGoalKick = true
		}
	}
	if !foundGoalKick {
		t.Fatalf("events = %+v, want a goal_kick", e.events[before:])
	}
	// takeGoalKick (B6 slice 2) may leave the ball "controlled" (no
	// reachable teammate to deliver to) or already "passing" (delivered) --
	// either way play has restarted, unlike "dead"/"flying".
	if e.ball.Status != "controlled" && e.ball.Status != "passing" {
		t.Fatalf("goal kick did not restart play: %+v", e.ball)
	}
}

func TestFastBallCanBeInterceptedAcrossSegment(t *testing.T) {
	e := testEngine(t)
	if out := e.Apply(domain.MatchCommand{ID: "start", TargetTick: 0, Type: domain.CommandStart}); !out.Accepted {
		t.Fatal(out.Reason)
	}
	defender := e.playerByID("a_1")
	defender.state.Position = domain.Vec3{X: 0, Z: 0}
	e.shotTeamID, e.shotPlayerID = "home", "h_10"
	e.ball = domain.BallState{Position: domain.Vec3{X: 0, Z: -1, Y: e.cfg.Pitch.BallRadiusM}, Velocity: domain.Vec3{Z: 40}, Radius: e.cfg.Pitch.BallRadiusM, Status: "flying"}
	e.ballFlightTicks = 10
	e.advanceBall()
	if e.events[len(e.events)-1].Type != domain.EventInterception {
		t.Fatalf("last event = %s, want interception", e.events[len(e.events)-1].Type)
	}
	if e.ball.CarrierID != "a_1" {
		t.Fatalf("carrier = %q, want a_1", e.ball.CarrierID)
	}
}

func TestSavedShotCreatesCorner(t *testing.T) {
	for seed := int64(1); seed < 100; seed++ {
		e := testEngine(t)
		if out := e.Apply(domain.MatchCommand{ID: "start", TargetTick: 0, Type: domain.CommandStart}); !out.Accepted {
			t.Fatal(out.Reason)
		}
		e.rng = rand.New(rand.NewSource(seed))
		e.shotTeamID, e.shotPlayerID = "home", "h_10"
		e.ball = domain.BallState{Position: domain.Vec3{X: 0, Z: e.cfg.Pitch.LengthM/2 - 0.1, Y: e.cfg.Pitch.BallRadiusM}, Velocity: domain.Vec3{Z: 10}, Radius: e.cfg.Pitch.BallRadiusM, Status: "flying"}
		e.ballFlightTicks = 1
		before := len(e.events)
		e.advanceBall()
		corner := false
		for _, ev := range e.events[before:] {
			if ev.Type == domain.EventCorner {
				corner = true
			}
		}
		if corner {
			// takeCorner (B6 slice 2) always follows EventCorner with an
			// actual delivery attempt via startCross: "crossing" (in
			// flight, no carrier yet) on a successful delivery, or
			// "controlled" (handed to the defending team) if the delivery
			// itself went wayward.
			if e.ball.Status != "crossing" && e.ball.Status != "controlled" {
				t.Fatalf("corner left the ball in an unexpected state: %+v", e.ball)
			}
			return
		}
	}
	t.Fatal("no deterministic seed produced the save branch")
}

func TestInvariantsDetectScoreEventMismatch(t *testing.T) {
	e := testEngine(t)
	e.score.Home = 1
	if err := e.ValidateInvariants(); err == nil {
		t.Fatal("expected score/goal event mismatch to be rejected")
	}
}

func TestHalftimeTacticsAndSubstitution(t *testing.T) {
	e := testEngine(t)
	if out := e.Apply(domain.MatchCommand{ID: "start", TargetTick: 0, Sequence: 1, Type: domain.CommandStart}); !out.Accepted {
		t.Fatal(out.Reason)
	}
	for e.Phase() != domain.PhaseHalfTime {
		if _, err := e.Step(); err != nil {
			t.Fatal(err)
		}
	}
	tactics := domain.Tactics{Formation: "4-3-3", Width: 0.7, LineHeight: 0.6, Tempo: 0.7, Pressing: 0.8}
	if out := e.Apply(domain.MatchCommand{ID: "tactics", TargetTick: e.Tick(), Sequence: 2, Type: domain.CommandChangeTactics, TeamID: "home", Tactics: &tactics}); !out.Accepted {
		t.Fatal(out.Reason)
	}
	if out := e.Apply(domain.MatchCommand{ID: "sub", TargetTick: e.Tick(), Sequence: 3, Type: domain.CommandSubstitute, TeamID: "home", PlayerOut: "h_10", PlayerIn: "h_16", Slot: "ST_L"}); !out.Accepted {
		t.Fatal(out.Reason)
	}
	if e.playerByID("h_10").state.Active || !e.playerByID("h_16").state.Active {
		t.Fatal("substitution did not change active players")
	}
	if e.input.HomeTeam.Tactics.Formation != "4-3-3" {
		t.Fatal("tactics command was not applied")
	}
}

func TestPassTargetPrefersOpenForwardTeammate(t *testing.T) {
	e := testEngine(t)
	carrier := e.playerByID("h_10")
	carrier.state.Position = domain.Vec3{X: 0, Z: 0}
	for i := range e.players {
		if e.players[i].state.TeamID == carrier.state.TeamID && e.players[i].state.ID != carrier.state.ID {
			e.players[i].state.Position = domain.Vec3{X: 0, Z: 0}
		}
	}
	forward := e.playerByID("h_11")
	forward.state.Position = domain.Vec3{X: 0, Z: 12}
	openWide := e.playerByID("h_9")
	openWide.state.Position = domain.Vec3{X: 8, Z: 2}
	// Make the nominally closer/earlier candidate unavailable by pressure.
	e.playerByID("a_10").state.Position = domain.Vec3{X: 8, Z: 2}
	e.playerByID("a_11").state.Position = domain.Vec3{X: -20, Z: -20}
	if got := e.nextTeammate(carrier.state.TeamID, carrier.state.ID); got != forward {
		t.Fatalf("pass target = %v, want open forward teammate %v", got.state.ID, forward.state.ID)
	}
}

func TestCrossEmitsAerialDuelAndMetrics(t *testing.T) {
	e := testEngine(t)
	if out := e.Apply(domain.MatchCommand{ID: "start", TargetTick: 0, Type: domain.CommandStart}); !out.Accepted {
		t.Fatal(out.Reason)
	}
	carrier := e.playerByID("h_6")
	target := e.playerByID("h_10")
	carrier.state.Position = domain.Vec3{X: 24, Z: 20}
	target.state.Position = domain.Vec3{X: 4, Z: 30}
	carrier.attributes.Crossing = 20
	e.ball = domain.BallState{Position: carrier.state.Position, Radius: e.cfg.Pitch.BallRadiusM, Status: "controlled", CarrierID: carrier.state.ID}
	e.startCross(carrier, e.teamStats["home"], carrier.attributes.Crossing)
	if e.events[len(e.events)-1].Type != domain.EventCross {
		t.Fatalf("last event = %s, want cross", e.events[len(e.events)-1].Type)
	}
	target = e.playerByID(e.events[len(e.events)-1].TargetPlayerID)
	for i := range e.players {
		if e.players[i].state.TeamID == "away" {
			e.players[i].state.Position = target.state.Position
		}
	}
	e.ballFlightTicks = 0
	e.advanceBall()
	if target.stats.AerialDuels != 1 {
		t.Fatalf("aerial duel stats = target %d", target.stats.AerialDuels)
	}
	found := false
	for _, event := range e.events {
		if event.Type == domain.EventAerialDuel {
			found = true
			break
		}
	}
	if !found || e.teamStats["home"].Crosses != 1 {
		t.Fatalf("cross/duel events or metrics missing: %+v", e.events)
	}
}

func TestPressingUsesSeveralNearbyDefenders(t *testing.T) {
	e := testEngine(t)
	carrier := e.playerByID("h_10")
	carrier.state.Position = domain.Vec3{X: 0, Z: 0}
	e.ball.CarrierID = carrier.state.ID
	first := e.playerByID("a_10")
	second := e.playerByID("a_11")
	first.state.Position = domain.Vec3{X: 2, Z: 0}
	second.state.Position = domain.Vec3{X: -3, Z: 0}
	e.input.AwayTeam.Tactics.Pressing = 0.8
	if !e.shouldPress(first, carrier.state.TeamID) || !e.shouldPress(second, carrier.state.TeamID) {
		t.Fatal("nearby defenders did not both contribute to pressing")
	}
}

func TestFatigueChangesMovementFactor(t *testing.T) {
	e := testEngine(t)
	fresh := e.playerByID("h_10")
	tired := e.playerByID("h_11")
	fresh.state.Fatigue = 0
	tired.state.Fatigue = 80
	if got, want := e.fatigueSpeedFactor(tired), e.fatigueSpeedFactor(fresh); got >= want {
		t.Fatalf("tired speed factor = %v, fresh = %v", got, want)
	}
}

func TestOffsidePassProducesRestartWhenEnabled(t *testing.T) {
	e := testEngine(t)
	e.cfg.Rules.OffsideEnabled = true
	carrier := e.playerByID("h_10")
	carrier.state.Position = domain.Vec3{X: 0, Z: 0}
	e.ball = domain.BallState{Position: carrier.state.Position, Radius: e.cfg.Pitch.BallRadiusM, Status: "controlled", CarrierID: carrier.state.ID}
	for i := range e.players {
		if e.players[i].state.TeamID == "home" && e.players[i].state.ID != carrier.state.ID {
			e.players[i].state.Position = domain.Vec3{X: 0, Z: 0}
		}
		if e.players[i].state.TeamID == "away" {
			e.players[i].state.Position.Z = 10
		}
	}
	target := e.playerByID("h_11")
	target.state.Position = domain.Vec3{X: 0, Z: 30}
	e.startPassTo(carrier, e.teamStats["home"], target)
	if len(e.events) < 2 || e.events[len(e.events)-2].Type != domain.EventOffside || e.events[len(e.events)-1].Type != domain.EventFreeKick {
		t.Fatalf("offside did not produce an offside/free-kick restart: %+v", e.events)
	}
	if e.ball.CarrierID == "" || e.playerByID(e.ball.CarrierID).state.TeamID != "away" {
		t.Fatalf("restart carrier team = %q, want away", e.ball.CarrierID)
	}
}

func TestTrackedDelayExtendsPeriodAndResult(t *testing.T) {
	e := testEngine(t)
	e.cfg.Timing.AddedTimeMode = "tracked_delays"
	e.restartAfterFoul("home", false, domain.Vec3{})
	if e.periodAddedMs != 1000 || e.totalAddedMs != 1000 {
		t.Fatalf("tracked delay = (%d,%d), want 1000ms", e.periodAddedMs, e.totalAddedMs)
	}
	if got := e.periodDuration(); got != e.cfg.Timing.HalfDurationMs+1000 {
		t.Fatalf("period duration = %d, want %d", got, e.cfg.Timing.HalfDurationMs+1000)
	}
}

func TestFreeKickRestartsAtFoulSpotNotTeammatePosition(t *testing.T) {
	e := testEngine(t)
	if out := e.Apply(domain.MatchCommand{ID: "start", TargetTick: 0, Type: domain.CommandStart}); !out.Accepted {
		t.Fatal(out.Reason)
	}
	// Every home player sits far from the foul spot, so the old
	// setKickoffCarrier-based restart (which just grabbed the first active
	// teammate's current position) would have placed the ball nowhere near
	// here. restartAt must use the spot itself.
	for i := range e.players {
		if e.players[i].state.TeamID == "home" {
			e.players[i].state.Position = domain.Vec3{X: -30, Z: -40}
		}
	}
	spot := domain.Vec3{X: 12, Z: 5}
	e.restartAt("home", spot)
	if math.Hypot(e.ball.Position.X-spot.X, e.ball.Position.Z-spot.Z) > 0.01 {
		t.Fatalf("ball restarted at %+v, want at foul spot %+v", e.ball.Position, spot)
	}
	if e.ball.CarrierID == "" || e.playerByID(e.ball.CarrierID).state.TeamID != "home" {
		t.Fatalf("restart carrier team = %q, want home", e.ball.CarrierID)
	}
}

func TestPenaltyResolvesImmediatelyWithoutDefenderInterference(t *testing.T) {
	sawGoal, sawSave := false, false
	for seed := int64(1); seed < 200 && (!sawGoal || !sawSave); seed++ {
		e := testEngine(t)
		if out := e.Apply(domain.MatchCommand{ID: "start", TargetTick: 0, Type: domain.CommandStart}); !out.Accepted {
			t.Fatal(out.Reason)
		}
		e.rng = rand.New(rand.NewSource(seed))
		// Park a defender exactly on the penalty spot: if the penalty went
		// through the normal shot/advanceBall pipeline this would intercept
		// it, which a real penalty can never allow.
		direction := e.attackDirection("home")
		spot := domain.Vec3{Y: e.cfg.Pitch.BallRadiusM, Z: direction * (e.cfg.Pitch.LengthM/2 - 11)}
		e.playerByID("a_1").state.Position = spot
		before := e.teamStats["home"].Shots
		eventsBefore := len(e.events)
		e.takePenalty("home")
		if e.teamStats["home"].Shots != before+1 {
			t.Fatalf("penalty did not register as a shot")
		}
		// The penalty itself must be resolved before takePenalty returns:
		// the only ball allowed in flight afterwards is the keeper's own
		// goal-kick distribution following a save (B7), never the kick.
		if e.ball.Status == "flying" || (e.ball.Status == "passing" && e.shotPlayerID != "a_1") {
			t.Fatalf("penalty left the ball in-flight; it must resolve immediately, status=%q", e.ball.Status)
		}
		resolved := false
		for _, ev := range e.events[eventsBefore:] {
			switch ev.Type {
			case domain.EventGoal:
				sawGoal, resolved = true, true
			case domain.EventSave:
				sawSave, resolved = true, true
			}
		}
		if !resolved {
			t.Fatalf("no goal or save event after penalty: %+v", e.events[eventsBefore:])
		}
	}
	if !sawGoal || !sawSave {
		t.Fatalf("did not observe both penalty outcomes within 200 seeds (goal=%v save=%v)", sawGoal, sawSave)
	}
}

func TestInjuryStandsPlayerDownAndCanAbandonMatch(t *testing.T) {
	e := testEngine(t)
	if out := e.Apply(domain.MatchCommand{ID: "start", TargetTick: 0, Type: domain.CommandStart}); !out.Accepted {
		t.Fatal(out.Reason)
	}
	victim := e.playerByID("h_1")
	e.injurePlayer(victim)
	if victim.state.Active {
		t.Fatal("injured player is still marked active")
	}
	if e.events[len(e.events)-1].Type != domain.EventInjury {
		t.Fatalf("last event = %s, want injury", e.events[len(e.events)-1].Type)
	}
	if e.phase == domain.PhaseAbandoned {
		t.Fatal("one injury should not abandon an 11-a-side match")
	}
	if victim.injury == nil || victim.injury.Reason != "match_injury" || victim.injury.EstimatedRecoveryDays < 7 {
		t.Fatalf("injury handoff = %+v, want match injury with recovery estimate", victim.injury)
	}

	// Stand down enough additional home players to drop below the Law 3
	// minimum of 7 active players; the match must abandon rather than
	// pretend to run a normal fulltime with too few players on the pitch.
	standDownMore := 4 // 11 - 1 (already injured) - 4 = 6 active, below the 7 minimum.
	for i := range e.players {
		if standDownMore == 0 {
			break
		}
		p := &e.players[i]
		if p.state.TeamID == "home" && p.state.Active {
			e.standDown(p)
			standDownMore--
		}
	}
	if e.phase != domain.PhaseAbandoned {
		t.Fatalf("phase = %s, want abandoned once home dropped below %d active players", e.phase, minActivePlayers)
	}
	if e.abandonReason == "" {
		t.Fatal("abandoned match has no abandon reason")
	}
	if _, err := e.Step(); !errors.Is(err, ErrMatchAbandoned) {
		t.Fatalf("Step() after abandonment = %v, want ErrMatchAbandoned", err)
	}
	result, err := e.Result()
	if err != nil {
		t.Fatalf("Result() after abandonment: %v", err)
	}
	if result.Status != "abandoned" || result.AbandonReason == "" {
		t.Fatalf("result = %+v, want status=abandoned with a reason", result)
	}
}

func TestShotRecordsExpectedGoalsAtCreation(t *testing.T) {
	e := testEngine(t)
	if out := e.Apply(domain.MatchCommand{ID: "start", TargetTick: 0, Type: domain.CommandStart}); !out.Accepted {
		t.Fatal(out.Reason)
	}
	shooter := e.playerByID("h_10")
	shooter.state.Position = domain.Vec3{X: 0, Z: 30}
	e.ball = domain.BallState{Position: shooter.state.Position, Radius: e.cfg.Pitch.BallRadiusM, Status: "controlled", CarrierID: shooter.state.ID}
	e.startShot(shooter)
	if shooter.stats.ExpectedGoals <= 0 || shooter.stats.ExpectedGoals > 0.65 {
		t.Fatalf("player xG = %v, want (0, 0.65]", shooter.stats.ExpectedGoals)
	}
	if got := e.teamStats["home"].ExpectedGoals; got != shooter.stats.ExpectedGoals {
		t.Fatalf("team xG = %v, want player xG %v", got, shooter.stats.ExpectedGoals)
	}
}

func TestPostMatchChangeHasRatingAndInjuryWithoutFabricatingBenchRating(t *testing.T) {
	e := testEngine(t)
	starter := e.playerByID("h_10")
	starter.state.MinutesOnPit = 90
	starter.stats = domain.PlayerStats{PlayerID: starter.state.ID, TeamID: starter.state.TeamID, Goals: 1, Shots: 2, Passes: 5, CompletedPasses: 5}
	injured := e.playerByID("h_11")
	injured.state.MinutesOnPit = 30
	e.injurePlayer(injured)
	e.phase = domain.PhaseFinished
	result, err := e.Result()
	if err != nil {
		t.Fatal(err)
	}
	changes := make(map[string]domain.PostMatchPlayerChange, len(result.PostMatchChanges))
	for _, change := range result.PostMatchChanges {
		changes[change.PlayerID] = change
	}
	if changes[starter.state.ID].Rating == nil || *changes[starter.state.ID].Rating <= 6 {
		t.Fatalf("starter rating = %+v, want rating above base", changes[starter.state.ID].Rating)
	}
	if changes[injured.state.ID].Injury == nil || changes[injured.state.ID].Injury.EstimatedRecoveryDays < 7 {
		t.Fatalf("injury change = %+v, want recovery handoff", changes[injured.state.ID])
	}
	if changes["h_16"].Rating != nil {
		t.Fatalf("unused substitute rating = %+v, want nil", changes["h_16"].Rating)
	}
}

func TestRatingDoesNotDoubleCountFatigue(t *testing.T) {
	e := testEngine(t)
	first := e.playerByID("h_10")
	second := e.playerByID("h_11")
	for _, player := range []*playerRuntime{first, second} {
		player.state.MinutesOnPit = 90
		player.stats = domain.PlayerStats{PlayerID: player.state.ID, TeamID: player.state.TeamID, Passes: 4, CompletedPasses: 4, Shots: 1}
	}
	first.state.Fatigue, second.state.Fatigue = 0, 100
	firstChange, secondChange := e.postMatchChange(first), e.postMatchChange(second)
	if firstChange.Rating == nil || secondChange.Rating == nil || *firstChange.Rating != *secondChange.Rating {
		t.Fatalf("fatigue changed rating: fresh=%v tired=%v", firstChange.Rating, secondChange.Rating)
	}
}

func TestSendingOffTheGoalkeeperDoesNotBreakTheEngine(t *testing.T) {
	e := testEngine(t)
	if out := e.Apply(domain.MatchCommand{ID: "start", TargetTick: 0, Type: domain.CommandStart}); !out.Accepted {
		t.Fatal(out.Reason)
	}
	var gkID string
	for _, slot := range e.input.HomeTeam.StartingLineup {
		if slot.Slot == "GK" {
			gkID = slot.PlayerID
		}
	}
	if gkID == "" {
		t.Fatal("fixture has no home GK slot")
	}
	gk := e.playerByID(gkID)
	e.issueCard(gk) // yellow
	e.issueCard(gk) // second yellow -> red -> standDown
	if gk.state.Active {
		t.Fatal("sent-off goalkeeper is still active")
	}
	if e.phase == domain.PhaseAbandoned {
		t.Fatal("losing only the goalkeeper should not abandon an 11-a-side match")
	}
	// This engine has no goalkeeper-specific mechanic (saves are a flat
	// probability regardless of who is "in goal" — see advanceBall), so
	// "rebuild after a GK red card" means the match keeps running correctly
	// with an outfield player covering, not a role-reassignment mechanic
	// that nothing in gameplay would consume yet.
	for i := 0; i < 50; i++ {
		if _, err := e.Step(); err != nil {
			t.Fatalf("step %d after GK red card: %v", i, err)
		}
	}
	if err := e.ValidateInvariants(); err != nil {
		t.Fatalf("invariants after GK red card: %v", err)
	}
}

func TestProfileARejectsB1RuleToggles(t *testing.T) {
	input, err := jsonAdapter.LoadMatchInputFromFile("../../../fixtures/match/equal.json")
	if err != nil {
		t.Fatal(err)
	}
	cfg := config.ShortTestConfig()
	cfg.Rules.FoulsEnabled = true
	if _, err := New(input, cfg, 1); err == nil {
		t.Fatal("expected profile_a + fouls_enabled to be rejected")
	}
}

func TestProfileB1AllowsRuleToggles(t *testing.T) {
	input, err := jsonAdapter.LoadMatchInputFromFile("../../../fixtures/match/equal_b1.json")
	if err != nil {
		t.Fatal(err)
	}
	cfg := config.ShortTestConfig()
	cfg.Rules.OffsideEnabled, cfg.Rules.FoulsEnabled, cfg.Rules.CardsEnabled, cfg.Rules.InjuriesEnabled = true, true, true, true
	if _, err := New(input, cfg, 1); err != nil {
		t.Fatalf("profile_b1 should allow B1 rule toggles: %v", err)
	}
}
