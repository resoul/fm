package engine

import (
	"math"
	"testing"

	"github.com/resoul/fm-core/internal/match/domain"
)

// b7RunToHalftime plays the first half of a short-profile match.
func b7RunToHalftime(t *testing.T, e *Engine) {
	t.Helper()
	for e.Phase() == domain.PhaseFirstHalf {
		b4Step(t, e)
	}
	if e.Phase() != domain.PhaseHalfTime {
		t.Fatalf("phase = %s, want halftime", e.Phase())
	}
}

// TestB7KickoffFromCentreByOutfieldPlayer: a kickoff puts the ball on the
// centre spot with an outfield player of the kicking team on it and every
// player inside their own half. Before B7 the "kickoff" handed the ball to
// the kicking team's lowest player ID -- the goalkeeper, on their own goal
// line -- which is where the first half's play then stayed.
func TestB7KickoffFromCentreByOutfieldPlayer(t *testing.T) {
	e := b4Start(t)
	if e.ball.Position.X != 0 || e.ball.Position.Z != 0 {
		t.Fatalf("kickoff ball at %+v, want centre spot", e.ball.Position)
	}
	carrier := e.playerByID(e.ball.CarrierID)
	if carrier == nil || carrier.state.TeamID != "home" || carrier.slot == "GK" {
		t.Fatalf("kickoff carrier = %+v, want a home outfield player", carrier)
	}
	if carrier.state.Position.X != 0 || carrier.state.Position.Z != 0 {
		t.Fatalf("kickoff taker stands at %+v, want centre spot", carrier.state.Position)
	}
	for _, p := range e.players {
		if !p.state.Active || p.state.ID == carrier.state.ID {
			continue
		}
		if e.attackDirection(p.state.TeamID)*p.state.Position.Z > 0 {
			t.Fatalf("player %s lined up in the opponents' half at kickoff: %+v", p.state.ID, p.state.Position)
		}
	}
}

// TestB7SecondHalfSwitchesEnds is the regression for the pre-B7 defect that
// produced ~40 goals per match, almost all in the second half and mostly by
// goalkeepers: the halftime "switch" only nudged off-ball targets, so both
// teams kept standing in the half they had defended, a few metres from the
// goal they now attacked. After ContinueSecondHalf each keeper must be in
// front of the goal their team now defends and the away team kicks off from
// the centre spot.
func TestB7SecondHalfSwitchesEnds(t *testing.T) {
	e := b4Start(t)
	b7RunToHalftime(t, e)
	if out := e.Apply(domain.MatchCommand{ID: "continue", TargetTick: e.Tick(), Type: domain.CommandContinueSecondHalf}); !out.Accepted {
		t.Fatal(out.Reason)
	}
	half := e.cfg.Pitch.LengthM / 2
	homeKeeper, awayKeeper := e.teamKeeper("home"), e.teamKeeper("away")
	// Home now attacks -Z, so its keeper defends the +Z goal.
	if homeKeeper.state.Position.Z < half-20 {
		t.Fatalf("home keeper at Z=%.1f after the switch, want near +%.1f", homeKeeper.state.Position.Z, half)
	}
	if awayKeeper.state.Position.Z > -(half - 20) {
		t.Fatalf("away keeper at Z=%.1f after the switch, want near -%.1f", awayKeeper.state.Position.Z, half)
	}
	carrier := e.playerByID(e.ball.CarrierID)
	if carrier == nil || carrier.state.TeamID != "away" || carrier.slot == "GK" {
		t.Fatalf("second-half kickoff carrier = %+v, want an away outfield player", carrier)
	}
	if e.ball.Position.X != 0 || e.ball.Position.Z != 0 {
		t.Fatalf("second-half kickoff ball at %+v, want centre spot", e.ball.Position)
	}
	for _, p := range e.players {
		if p.state.Active && p.state.ID != carrier.state.ID && e.attackDirection(p.state.TeamID)*p.state.Position.Z > 0 {
			t.Fatalf("player %s in the opponents' half at the second-half kickoff: %+v", p.state.ID, p.state.Position)
		}
	}
}

// TestB7GoalRestartsWithKickoffByConcedingTeam: a goal is followed by a
// centre-spot kickoff for the team that conceded, not by handing the ball
// to the lowest-ID opponent where they stand.
func TestB7GoalRestartsWithKickoffByConcedingTeam(t *testing.T) {
	e := b4Start(t)
	e.shotPlayerID = "h_10"
	e.scoreGoal("home")
	if e.score.Home != 1 {
		t.Fatalf("score = %+v", e.score)
	}
	carrier := e.playerByID(e.ball.CarrierID)
	if carrier == nil || carrier.state.TeamID != "away" || carrier.slot == "GK" {
		t.Fatalf("post-goal carrier = %+v, want an away outfield player", carrier)
	}
	if e.ball.Position.X != 0 || e.ball.Position.Z != 0 || e.ball.Status != "controlled" {
		t.Fatalf("post-goal ball = %+v, want controlled on the centre spot", e.ball)
	}
}

// TestB7EqualFixtureHasNoSideAsymmetry: the equal fixture's two rosters
// differ only in IDs, so swapping which one plays at home must reproduce
// the very same match (same score on the same side, same tick count, same
// event-type sequence). Any dependence on team label or on player-ID
// processing order -- such as the pre-B7 single-pass movement loop that let
// the lower-ID team react to the other team's already-updated positions --
// breaks this identity.
func TestB7EqualFixtureHasNoSideAsymmetry(t *testing.T) {
	run := func(swap bool) (domain.Score, int64, []domain.MatchEventType) {
		e := testEngine(t)
		if swap {
			input := e.input.DeepCopy()
			input.HomeTeam, input.AwayTeam = input.AwayTeam, input.HomeTeam
			var err error
			e, err = New(input, e.cfg, e.seed)
			if err != nil {
				t.Fatal(err)
			}
		}
		if out := e.Apply(domain.MatchCommand{ID: "start", Type: domain.CommandStart}); !out.Accepted {
			t.Fatal(out.Reason)
		}
		for e.Phase() != domain.PhaseFinished {
			b4Step(t, e)
			if e.Phase() == domain.PhaseHalfTime {
				if out := e.Apply(domain.MatchCommand{ID: "continue", TargetTick: e.Tick(), Type: domain.CommandContinueSecondHalf}); !out.Accepted {
					t.Fatal(out.Reason)
				}
			}
		}
		types := make([]domain.MatchEventType, len(e.events))
		for i, ev := range e.events {
			types[i] = ev.Type
		}
		return e.score, e.tick, types
	}
	score, ticks, events := run(false)
	swappedScore, swappedTicks, swappedEvents := run(true)
	if score != swappedScore || ticks != swappedTicks {
		t.Fatalf("swapping identical rosters changed the match: %+v/%d vs %+v/%d", score, ticks, swappedScore, swappedTicks)
	}
	if len(events) != len(swappedEvents) {
		t.Fatalf("event count differs: %d vs %d", len(events), len(swappedEvents))
	}
	for i := range events {
		if events[i] != swappedEvents[i] {
			t.Fatalf("event %d differs: %s vs %s", i, events[i], swappedEvents[i])
		}
	}
	shots := 0
	for _, ev := range events {
		if ev == domain.EventShot {
			shots++
		}
	}
	if shots == 0 {
		t.Fatal("short match produced no shots; the identity check exercised too little play")
	}
}

// TestB7ShapeFollowsBallAndPossession: an outfield player's off-ball target
// moves up the pitch with the ball and sits further forward when their own
// team has it than when the opponents do; the keeper's target stays within
// keeperMaxAdvanceM of their own goal line wherever the ball is.
func TestB7ShapeFollowsBallAndPossession(t *testing.T) {
	e := b4Start(t)
	cb := e.playerByID("h_3")
	keeper := e.playerByID("h_1")
	half := e.cfg.Pitch.LengthM / 2
	e.ball.Position = domain.Vec3{Z: -40}
	deep := e.shapeTarget(cb, "away")
	e.ball.Position = domain.Vec3{Z: 40}
	high := e.shapeTarget(cb, "away")
	if !(high.Z > deep.Z+20) {
		t.Fatalf("centre-back does not follow the ball up the pitch: deep=%+v high=%+v", deep, high)
	}
	inPossession := e.shapeTarget(cb, "home")
	if !(inPossession.Z > high.Z) {
		t.Fatalf("possession does not push the block up: defending=%+v attacking=%+v", high, inPossession)
	}
	for _, ballZ := range []float64{-50, 0, 50} {
		e.ball.Position = domain.Vec3{Z: ballZ}
		target := e.shapeTarget(keeper, "home")
		if advance := target.Z + half; advance > keeperMaxAdvanceM+1e-9 || advance < 0 {
			t.Fatalf("keeper target %+v is %.1f m from the goal line with the ball at Z=%.0f", target, advance, ballZ)
		}
	}
}

// TestB7PressingIsTransient: a defender who closes down the carrier this
// tick goes back to their shape target as soon as the ball is no longer in
// range, instead of keeping the stale ball position as a permanent target
// (the pre-B7 behaviour that let the whole team drift out of shape).
func TestB7PressingIsTransient(t *testing.T) {
	e := b4Start(t)
	defender := e.playerByID("a_10")
	carrier := e.playerByID("h_10")
	for i := range e.players {
		e.players[i].speed = 0
	}
	e.ball.CarrierID, e.ball.Status = carrier.state.ID, "controlled"
	carrier.state.Position = domain.Vec3{X: 0, Z: 0}
	defender.state.Position = domain.Vec3{X: 3, Z: 0}
	e.ball.Position = carrier.state.Position
	e.movePlayers()
	if defender.target.X != 0 || defender.target.Z != 0 {
		t.Fatalf("nearby defender did not press the ball: target=%+v", defender.target)
	}
	carrier.state.Position = domain.Vec3{X: 0, Z: -45}
	e.ball.Position = carrier.state.Position
	e.movePlayers()
	if defender.target.X == 0 && defender.target.Z == -45 {
		t.Fatal("defender kept pressing a ball far out of range")
	}
	if want := e.shapeTarget(defender, "home"); defender.target != want {
		t.Fatalf("defender target = %+v, want shape target %+v", defender.target, want)
	}
}

// TestB7TackleCooldownSeparatesChallenges: after any tackle attempt the
// defender cannot attempt another one for a while, and a dispossessed
// carrier cannot instantly tackle the ball straight back.
func TestB7TackleCooldownSeparatesChallenges(t *testing.T) {
	e := b4Start(t)
	carrier, defender := isolateCarrierForBallTests(e, "h_10", "a_10")
	defender.state.Position = carrier.state.Position
	defender.attributes.Tackling = 20
	carrier.attributes.Dribbling = 1
	attempted := false
	for i := 0; i < 400 && !attempted; i++ {
		before := defender.tackleCooldownTicks
		e.maybeTackle(carrier)
		if defender.tackleCooldownTicks > before {
			attempted = true
		}
	}
	if !attempted {
		t.Fatal("no tackle attempt in 400 ticks at zero distance")
	}
	if e.ball.CarrierID == defender.state.ID {
		if carrier.tackleCooldownTicks == 0 {
			t.Fatal("dispossessed carrier has no cooldown before tackling back")
		}
	}
	// While the cooldown runs, the same defender never attempts again.
	if e.ball.CarrierID == carrier.state.ID {
		cooldown := defender.tackleCooldownTicks
		for i := 0; i < cooldown; i++ {
			if e.maybeTackle(carrier) {
				t.Fatal("defender tackled again inside their cooldown")
			}
		}
	}
}

// TestB7InPenaltyAreaIsDirectionSymmetric: the pre-B7 formula subtracted
// half the pitch before applying the attack direction, so for a team
// attacking -Z every point on the pitch counted as "inside the box" (and
// every foul on its carrier became a penalty).
func TestB7InPenaltyAreaIsDirectionSymmetric(t *testing.T) {
	e := b4Start(t)
	half := e.cfg.Pitch.LengthM / 2
	for _, teamID := range []string{"home", "away"} {
		direction := e.attackDirection(teamID)
		p := &playerRuntime{state: domain.PlayerState{TeamID: teamID}}
		p.state.Position = domain.Vec3{}
		if e.inPenaltyArea(p) {
			t.Fatalf("%s: centre spot counted as inside the box", teamID)
		}
		p.state.Position = domain.Vec3{Z: direction * (half - 5)}
		if !e.inPenaltyArea(p) {
			t.Fatalf("%s: 5 m from the attacked goal not inside the box", teamID)
		}
		p.state.Position = domain.Vec3{Z: -direction * (half - 5)}
		if e.inPenaltyArea(p) {
			t.Fatalf("%s: own box counted as the attacked box", teamID)
		}
		if !e.inOwnPenaltyArea(teamID, p.state.Position) {
			t.Fatalf("%s: own box not recognised", teamID)
		}
	}
}

// TestB7KeeperDistributesInsteadOfShooting: over a short match no keeper
// ever shoots, and a keeper in possession releases the ball with a pass.
func TestB7KeeperDistributesInsteadOfShooting(t *testing.T) {
	e := b4Start(t)
	keeper := e.playerByID("h_1")
	for e.Phase() != domain.PhaseFinished {
		b4Step(t, e)
		if e.Phase() == domain.PhaseHalfTime {
			if out := e.Apply(domain.MatchCommand{ID: "continue", TargetTick: e.Tick(), Type: domain.CommandContinueSecondHalf}); !out.Accepted {
				t.Fatal(out.Reason)
			}
		}
	}
	for _, ev := range e.events {
		if ev.Type == domain.EventShot && (ev.PlayerID == "h_1" || ev.PlayerID == "a_1") {
			t.Fatalf("goalkeeper took a shot: %+v", ev)
		}
	}
	if keeper.stats.Shots != 0 {
		t.Fatalf("keeper shots = %d", keeper.stats.Shots)
	}
	// Direct check of the distribution path: a keeper carrying the ball
	// with the whole pitch to choose from eventually passes.
	e2 := b4Start(t)
	k := e2.playerByID("h_1")
	e2.ball.CarrierID, e2.ball.Status = k.state.ID, "controlled"
	e2.ball.Position = k.state.Position
	passed := false
	for i := 0; i < 400 && !passed; i++ {
		e2.playBall()
		passed = e2.ball.Status == "passing" && e2.shotPlayerID == k.state.ID
	}
	if !passed {
		t.Fatal("keeper in possession never distributed the ball")
	}
}

// TestB7DistributionScalesWithForwardWeight guards rankedTeammates' scaled
// progress cap: a distribution restart with a strong forward weight prefers
// a target further up the pitch than open play would.
func TestB7DistributionScalesWithForwardWeight(t *testing.T) {
	e := b4Start(t)
	for i := range e.players {
		e.players[i].speed = 0
	}
	keeper := e.playerByID("h_1")
	direction := e.attackDirection("home")
	progress := func(weight float64) float64 {
		target := e.nextTeammateBiased("home", keeper.state.ID, weight)
		return direction * (target.state.Position.Z - keeper.state.Position.Z)
	}
	if short, long := progress(openPlayForwardWeight), progress(openPlayForwardWeight+0.6); !(long > short) {
		t.Fatalf("stronger forward weight does not go longer: %.1f vs %.1f", short, long)
	}
}

// TestB7PassTargetVarietyStaysWithinTopOptions: pickPassTarget only ever
// returns one of the three best-ranked options and does use more than the
// single best one across a run of draws.
func TestB7PassTargetVarietyStaysWithinTopOptions(t *testing.T) {
	e := b4Start(t)
	carrier := e.playerByID(e.ball.CarrierID)
	ranked := e.rankedTeammates(carrier.state.TeamID, carrier.state.ID, openPlayForwardWeight)
	allowed := map[string]bool{}
	for i := 0; i < 3 && i < len(ranked); i++ {
		allowed[ranked[i].player.state.ID] = true
	}
	seen := map[string]bool{}
	for i := 0; i < 200; i++ {
		target := e.pickPassTarget(carrier.state.TeamID, carrier.state.ID)
		if !allowed[target.state.ID] {
			t.Fatalf("pass target %s is outside the top three options", target.state.ID)
		}
		seen[target.state.ID] = true
	}
	if len(seen) < 2 {
		t.Fatal("pass target selection never varied over 200 draws")
	}
}

// TestB7OffBallSpeedIsBounded: a player far from a shape target still never
// exceeds the off-ball cruise fraction of their effective speed, and a
// player already near it barely moves (proportional closing), so a shape
// that shifts every tick produces walking, not perpetual sprinting.
func TestB7OffBallSpeedIsBounded(t *testing.T) {
	e := b4Start(t)
	p := e.playerByID("a_5")
	e.ball.CarrierID, e.ball.Status = "h_10", "controlled"
	e.ball.Position = domain.Vec3{X: 0, Z: 0}
	p.state.Position = domain.Vec3{X: 30, Z: -50}
	// Already cruising at the off-ball limit, so the acceleration ramp
	// cannot mask a higher target speed.
	p.state.Velocity = domain.Vec3{X: 0, Z: p.speed * offBallSpeedFraction}
	p.attributes.Acceleration = 20
	before := p.state.Position
	e.movePlayers()
	moved := math.Hypot(p.state.Position.X-before.X, p.state.Position.Z-before.Z)
	dt := float64(e.cfg.Timing.StepMs) / 1000
	if limit := p.speed * offBallSpeedFraction * dt; moved > limit+1e-9 {
		t.Fatalf("off-ball player moved %.3f m in one tick, above the cruise limit %.3f", moved, limit)
	}
	p.state.Position = domain.Vec3{X: p.target.X + 0.5, Z: p.target.Z}
	p.state.Velocity = domain.Vec3{}
	before = p.state.Position
	e.movePlayers()
	if moved := math.Hypot(p.state.Position.X-before.X, p.state.Position.Z-before.Z); moved > 0.5*offBallClosingRate*dt+1e-9 {
		t.Fatalf("player 0.5 m from target moved %.3f m, want proportional closing", moved)
	}
}
