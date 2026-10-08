package engine

import (
	"math/rand"
	"testing"

	jsonAdapter "github.com/resoul/fm-core/internal/adapters/json"
	"github.com/resoul/fm-core/internal/match/config"
	"github.com/resoul/fm-core/internal/match/domain"
)

// TestB5AccelerationRampsSpeed checks that a player starting from rest does
// not snap to effectiveSpeed in a single tick: distance covered is bounded
// by Acceleration (via config PlayerMin/MaxAccelMps2, previously declared
// but unread), and a higher Acceleration covers more ground in that first
// tick than a lower one.
func TestB5AccelerationRampsSpeed(t *testing.T) {
	var distances [2]float64
	for level, accel := range []int{1, 20} {
		e := b4Start(t)
		p := e.playerByID("h_10")
		p.attributes.Acceleration = accel
		p.state.Velocity = domain.Vec3{}
		before := p.stats.DistanceM
		b4Step(t, e)
		distances[level] = e.playerByID("h_10").stats.DistanceM - before
	}
	if distances[0] <= 0 || distances[1] <= 0 {
		t.Fatalf("player did not move from rest: low=%v high=%v", distances[0], distances[1])
	}
	if distances[0] >= distances[1] {
		t.Fatalf("acceleration has no ramp effect: low=%v high=%v", distances[0], distances[1])
	}
	e := b4Start(t)
	p := e.playerByID("h_10")
	fullStepDistance := p.speed * e.fatigueSpeedFactor(p) * float64(e.cfg.Timing.StepMs) / 1000
	if distances[1] >= fullStepDistance {
		t.Fatalf("high-accel player reached full speed instantly: %v >= %v", distances[1], fullStepDistance)
	}
}

// TestB5FitnessSetsIndependentSpeedCeiling checks that Fitness changes a
// player's baked-in speed ceiling at construction, independently of the
// ongoing Fatigue-driven slowdown (fatigueSpeedFactor), so the two never
// apply the same penalty twice.
func TestB5FitnessSetsIndependentSpeedCeiling(t *testing.T) {
	var speeds [2]float64
	var fatigueFactors [2]float64
	for level, fitness := range []float64{0, 100} {
		input, err := jsonAdapter.LoadMatchInputFromFile("../../../fixtures/match/equal.json")
		if err != nil {
			t.Fatal(err)
		}
		for i := range input.HomeTeam.Players {
			if input.HomeTeam.Players[i].ID == "h_10" {
				input.HomeTeam.Players[i].StartingCondition.Fitness = fitness
			}
		}
		e, err := New(input, config.ShortTestConfig(), 42)
		if err != nil {
			t.Fatal(err)
		}
		p := e.playerByID("h_10")
		speeds[level] = p.speed
		p.state.Fatigue = 40
		fatigueFactors[level] = e.fatigueSpeedFactor(p)
	}
	if speeds[0] >= speeds[1] {
		t.Fatalf("fitness has no effect on speed ceiling: low=%v high=%v", speeds[0], speeds[1])
	}
	if fatigueFactors[0] != fatigueFactors[1] {
		t.Fatalf("fatigue slowdown differs by fitness level, double counting: %v vs %v", fatigueFactors[0], fatigueFactors[1])
	}
}

// TestB5SharpnessAffectsDecisionQuality checks that Sharpness moves the
// pass/shot/cross decision-rate formulas at a call site distinct from
// fatigueSpeedFactor.
func TestB5SharpnessAffectsDecisionQuality(t *testing.T) {
	e := b4Start(t)
	carrier := e.playerByID("h_10")
	target := e.playerByID("h_11")
	if got := e.sharpnessFactor(carrier); got < 0.7 || got > 1.0 {
		t.Fatalf("sharpnessFactor out of documented range: %v", got)
	}
	carrier.sharpness = 0
	lowPass := e.passDecisionRate(carrier, target, 0.3)
	lowShot := e.shotDecisionRate(carrier, 0.3, 20)
	lowCross := e.crossDecisionRate(carrier, target, 0.3)
	carrier.sharpness = 1
	highPass := e.passDecisionRate(carrier, target, 0.3)
	highShot := e.shotDecisionRate(carrier, 0.3, 20)
	highCross := e.crossDecisionRate(carrier, target, 0.3)
	if highPass <= lowPass || highShot <= lowShot || highCross <= lowCross {
		t.Fatalf("sharpness has no effect: pass %v/%v shot %v/%v cross %v/%v", lowPass, highPass, lowShot, highShot, lowCross, highCross)
	}
}

// TestB5DecisionsDampensPressurePenalty checks that Decisions reduces how
// much measured pressure changes the decision-rate formulas (less penalty
// for shot/cross, less panic-inflation for pass), and has no effect at all
// when there is no pressure to dampen.
func TestB5DecisionsDampensPressurePenalty(t *testing.T) {
	e := b4Start(t)
	carrier := e.playerByID("h_10")
	target := e.playerByID("h_11")
	const pressure = 0.8
	carrier.attributes.Decisions = 1
	lowShot := e.shotDecisionRate(carrier, pressure, 20)
	lowCross := e.crossDecisionRate(carrier, target, pressure)
	lowPass := e.passDecisionRate(carrier, target, pressure)
	carrier.attributes.Decisions = 20
	highShot := e.shotDecisionRate(carrier, pressure, 20)
	highCross := e.crossDecisionRate(carrier, target, pressure)
	highPass := e.passDecisionRate(carrier, target, pressure)
	if highShot <= lowShot || highCross <= lowCross {
		t.Fatalf("decisions does not dampen shot/cross pressure penalty: shot %v/%v cross %v/%v", lowShot, highShot, lowCross, highCross)
	}
	if highPass >= lowPass {
		t.Fatalf("decisions does not dampen pass panic inflation: pass %v/%v", lowPass, highPass)
	}
	carrier.attributes.Decisions = 1
	zeroLow := e.passDecisionRate(carrier, target, 0)
	carrier.attributes.Decisions = 20
	zeroHigh := e.passDecisionRate(carrier, target, 0)
	if zeroLow != zeroHigh {
		t.Fatalf("decisions changed the zero-pressure rate, not just the pressure term: %v vs %v", zeroLow, zeroHigh)
	}
}

// TestB5PositioningTightensMarking checks that a defender's Positioning
// scales the effective press radius used by shouldPress.
func TestB5PositioningTightensMarking(t *testing.T) {
	e := b4Start(t)
	carrier := e.playerByID("h_10")
	defender := e.playerByID("a_10")
	e.ball.CarrierID = carrier.state.ID
	e.ball.Position = carrier.state.Position
	e.input.AwayTeam.Tactics.Pressing = 1
	defender.instructions.Pressing = 1
	intensity := e.teamPressing("away") * e.instructionFactor(defender.instructions.Pressing)
	baseRadius := 8 + 10*intensity
	defender.state.Position = domain.Vec3{X: carrier.state.Position.X, Z: carrier.state.Position.Z + baseRadius*0.95}
	defender.attributes.Positioning = 1
	lowPress := e.shouldPress(defender, "home")
	defender.attributes.Positioning = 20
	highPress := e.shouldPress(defender, "home")
	if lowPress || !highPress {
		t.Fatalf("positioning did not change the marking radius: low=%v high=%v (base radius=%v distance=%v)", lowPress, highPress, baseRadius, baseRadius*0.95)
	}
}

// TestB5FirstTouchReceptionDuel checks that a normal pass reception,
// contested by a defender within duel range, is decided by the receiver's
// FirstTouch against the defender's Positioning: raising FirstTouch (with
// the defender's Positioning fixed) must measurably raise how often the
// attacker keeps the ball, across the same seed set.
func TestB5FirstTouchReceptionDuel(t *testing.T) {
	var attackerWins [2]int
	for level, firstTouch := range []int{1, 20} {
		for seed := int64(1); seed <= 30; seed++ {
			e := b4Start(t)
			e.rng = rand.New(rand.NewSource(seed))
			for i := range e.players {
				p := &e.players[i]
				p.speed = 0
				p.state.Position = domain.Vec3{X: -25, Z: -40}
			}
			carrier := e.playerByID("h_10")
			carrier.state.Position = domain.Vec3{X: 0, Z: 0}
			target := e.playerByID("h_11")
			target.state.Position = domain.Vec3{X: 0, Z: 12}
			target.attributes.FirstTouch = firstTouch
			defender := e.playerByID("a_10")
			defender.state.Position = target.state.Position
			defender.attributes.Positioning = 20
			e.ball.Position = carrier.state.Position
			e.startPassTo(carrier, e.teamStats["home"], target)
			for i := 0; i < 200 && e.ball.Status == "passing"; i++ {
				b4Step(t, e)
			}
			switch e.ball.CarrierID {
			case target.state.ID:
				attackerWins[level]++
			case defender.state.ID:
				// defender win, nothing to tally
			default:
				t.Fatalf("pass resolved to neither target nor defender: %+v", e.ball)
			}
		}
	}
	if attackerWins[0] >= attackerWins[1] {
		t.Fatalf("first touch has no measurable effect on the reception duel: low-FirstTouch wins=%d high-FirstTouch wins=%d (of 30 seeds each)", attackerWins[0], attackerWins[1])
	}
}

// TestB5FirstTouchNoDuelWithoutNearbyDefender is a regression guard: when no
// defender is within duel range, a normal pass reception is exactly as
// deterministic as before this slice (no RNG branch taken, no behavior
// change for the common open-pitch case).
func TestB5FirstTouchNoDuelWithoutNearbyDefender(t *testing.T) {
	e := b4Start(t)
	for i := range e.players {
		p := &e.players[i]
		p.speed = 0
		p.state.Position = domain.Vec3{X: -25, Z: -40}
	}
	carrier := e.playerByID("h_10")
	carrier.state.Position = domain.Vec3{X: 0, Z: 0}
	target := e.playerByID("h_11")
	target.state.Position = domain.Vec3{X: 0, Z: 12}
	target.attributes.FirstTouch = 1
	e.ball.Position = carrier.state.Position
	e.startPassTo(carrier, e.teamStats["home"], target)
	for i := 0; i < 200 && e.ball.Status == "passing"; i++ {
		b4Step(t, e)
	}
	if e.ball.CarrierID != target.state.ID {
		t.Fatalf("clean reception without a nearby defender was contested: %+v", e.ball)
	}
	if e.teamStats["home"].SuccessfulPasses != 1 || carrier.stats.CompletedPasses != 1 {
		t.Fatal("missing completed pass stats for an uncontested reception")
	}
	if carrier.stats.Passes != 1 || e.teamStats["home"].Passes != 1 {
		t.Fatal("pass attempt not counted")
	}
}

// TestB5TacticsWidthLineHeightShapeTargets checks that a live ChangeTactics
// command with new Width/LineHeight visibly reshapes off-ball targets
// immediately, instead of only at the next kickoff/substitution.
func TestB5TacticsWidthLineHeightShapeTargets(t *testing.T) {
	e := b4Start(t)
	target := e.playerByID("h_11")
	before := target.target
	slot := target.slot
	tactics := e.input.HomeTeam.Tactics
	tactics.Width = 1.0
	tactics.LineHeight = 1.0
	if out := e.Apply(domain.MatchCommand{ID: "tactics", TargetTick: e.tick, Type: domain.CommandChangeTactics, TeamID: "home", Tactics: &tactics}); !out.Accepted {
		t.Fatal(out.Reason)
	}
	after := e.playerByID("h_11").target
	if after == before {
		t.Fatal("width/line_height change did not move the off-ball target")
	}
	pos := domain.StandardSlotPositions[slot]
	want := e.slotTarget("home", pos)
	if after != want {
		t.Fatalf("target = %+v, want %+v", after, want)
	}
}

// isolateCarrierForBallTests deactivates every other home player and parks
// everyone far from the carrier/defender, so that inside playBall the only
// possible actions for the carrier are the tackle contest (maybeTackle) or
// nothing: nextTeammate returns nil (no valid pass/cross target) and the
// carrier's goalDistance stays above the shot-decision threshold. This
// isolates the tackle contest from unrelated pass/shot RNG draws.
func isolateCarrierForBallTests(e *Engine, carrierID, defenderID string) (*playerRuntime, *playerRuntime) {
	for i := range e.players {
		p := &e.players[i]
		p.speed = 0
		p.state.Position = domain.Vec3{X: -60, Z: -60}
		if p.state.TeamID == "home" {
			p.state.Active = false
		}
	}
	carrier := e.playerByID(carrierID)
	carrier.state.Active = true
	carrier.state.Position = domain.Vec3{X: 0, Z: 0}
	defender := e.playerByID(defenderID)
	e.ball.CarrierID = carrier.state.ID
	e.ball.Status = "controlled"
	e.ball.Position = carrier.state.Position
	return carrier, defender
}

// TestB5TacklingDribblingContest checks that raising the carrier's Dribbling
// (with the defender's Tackling fixed at the opposite extreme) measurably
// raises how often the carrier keeps the ball in a sustained close-quarters
// tackle contest, across the same seed set.
func TestB5TacklingDribblingContest(t *testing.T) {
	var attackerRetains [2]int
	const ticks = 80
	for level, dribbling := range []int{1, 20} {
		for seed := int64(1); seed <= 30; seed++ {
			e := b4Start(t)
			e.rng = rand.New(rand.NewSource(seed))
			carrier, defender := isolateCarrierForBallTests(e, "h_10", "a_10")
			carrier.attributes.Dribbling = dribbling
			defender.state.Position = carrier.state.Position
			defender.attributes.Tackling = 20
			retained := true
			for i := 0; i < ticks; i++ {
				b4Step(t, e)
				if e.ball.CarrierID != carrier.state.ID {
					retained = e.ball.CarrierID == "" // "" would mean a pass/shot fired despite isolation; treat as a test-setup bug, not a retain
					break
				}
			}
			if retained {
				attackerRetains[level]++
			}
		}
	}
	if attackerRetains[0] >= attackerRetains[1] {
		t.Fatalf("dribbling has no measurable effect on the tackle contest: low-Dribbling retains=%d high-Dribbling retains=%d (of 30 seeds each)", attackerRetains[0], attackerRetains[1])
	}
}

// TestB5NoTackleBeyondRange is a regression guard: a defender just outside
// tackleRangeM never triggers a tackle attempt, no matter how long they
// stand there (deterministic, no RNG branch taken).
func TestB5NoTackleBeyondRange(t *testing.T) {
	e := b4Start(t)
	carrier, defender := isolateCarrierForBallTests(e, "h_10", "a_10")
	carrier.attributes.Dribbling = 1
	defender.state.Position = domain.Vec3{X: 0, Z: tackleRangeM + 0.5}
	defender.attributes.Tackling = 20
	for i := 0; i < 100; i++ {
		b4Step(t, e)
		if e.ball.CarrierID != carrier.state.ID {
			t.Fatalf("ball changed possession beyond tackleRangeM at tick %d: carrier now %q", i, e.ball.CarrierID)
		}
	}
}

// TestB5ShouldPressUsesFrozenBallPosition proves the tick-order fix: it sets
// e.ball.Position (the frozen per-tick value) near the defender, but the
// carrier's own live PlayerState.Position far away, simulating "the carrier
// already moved earlier in this tick's movePlayers loop". shouldPress must
// follow the frozen ball position, not re-derive the carrier's live
// position -- this test fails against the pre-fix code.
func TestB5ShouldPressUsesFrozenBallPosition(t *testing.T) {
	e := b4Start(t)
	carrier := e.playerByID("h_10")
	defender := e.playerByID("a_10")
	e.ball.CarrierID = carrier.state.ID
	e.input.AwayTeam.Tactics.Pressing = 1
	defender.instructions.Pressing = 1
	defender.attributes.Positioning = 20
	intensity := e.teamPressing("away") * e.instructionFactor(defender.instructions.Pressing)
	radius := (8 + 10*intensity) * e.positioningFactor(defender)
	e.ball.Position = domain.Vec3{X: 0, Z: 0}
	defender.state.Position = domain.Vec3{X: 0, Z: radius * 0.9}
	carrier.state.Position = domain.Vec3{X: 500, Z: 500}
	if !e.shouldPress(defender, "home") {
		t.Fatal("shouldPress ignored the frozen ball position and used the carrier's live (already-moved) position instead")
	}
}
