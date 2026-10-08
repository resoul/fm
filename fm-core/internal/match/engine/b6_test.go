package engine

import (
	"math/rand"
	"testing"

	"github.com/resoul/fm-core/internal/match/domain"
)

// TestB6FinishingLongShotsSplitByDistance checks that shootingSkill picks
// Finishing inside the box-ish threshold and LongShots beyond it, replacing
// the old flat Shooting aggregate.
func TestB6FinishingLongShotsSplitByDistance(t *testing.T) {
	e := b4Start(t)
	carrier := e.playerByID("h_10")
	carrier.attributes.Finishing = 5
	carrier.attributes.LongShots = 18
	direction := e.attackDirection(carrier.state.TeamID)
	goalZ := direction * e.cfg.Pitch.LengthM / 2

	carrier.state.Position = domain.Vec3{Z: goalZ - direction*10}
	if got := e.shootingSkill(carrier); got != 5 {
		t.Fatalf("close shot skill = %d, want Finishing (5)", got)
	}
	carrier.state.Position = domain.Vec3{Z: goalZ - direction*30}
	if got := e.shootingSkill(carrier); got != 18 {
		t.Fatalf("far shot skill = %d, want LongShots (18)", got)
	}
}

// TestB6ShotAccuracyScalesWithSkill checks that startShot's wide-miss roll
// scales with shootingSkill, replacing the old flat 15% chance.
func TestB6ShotAccuracyScalesWithSkill(t *testing.T) {
	var onTarget [2]int
	for level, skill := range []int{1, 20} {
		for seed := int64(1); seed <= 60; seed++ {
			e := b4Start(t)
			e.rng = rand.New(rand.NewSource(seed))
			carrier := e.playerByID("h_10")
			carrier.attributes.Finishing = skill
			direction := e.attackDirection(carrier.state.TeamID)
			carrier.state.Position = domain.Vec3{Z: direction*e.cfg.Pitch.LengthM/2 - direction*10}
			e.ball.Position = carrier.state.Position
			e.ball.Position.Y = e.ball.Radius
			e.startShot(carrier)
			if e.shotTargetX == 0 {
				onTarget[level]++
			}
		}
	}
	if onTarget[0] >= onTarget[1] {
		t.Fatalf("shot accuracy does not scale with Finishing: low=%d high=%d (of 60 seeds)", onTarget[0], onTarget[1])
	}
}

// TestB6SaveHarderAgainstBetterFinisher checks that saveChance drops as the
// shooter's skill rises, keeper skill held fixed.
func TestB6SaveHarderAgainstBetterFinisher(t *testing.T) {
	e := b4Start(t)
	keeper := e.playerByID("a_1")
	keeper.attributes.Reflexes = 15
	keeper.attributes.Handling = 15
	low := e.saveChance(keeper, 1, false, 12)
	high := e.saveChance(keeper, 20, false, 12)
	if !(low > high) {
		t.Fatalf("save chance does not shrink against a better finisher: low-skill-shooter=%v high-skill-shooter=%v", low, high)
	}
}

// TestB6SaveOutcomeThreeWays checks that resolveSaveOutcome produces all
// three outcomes (keeper's-team hold, corner-to-attacker, loose rebound)
// over enough seeds, and that a clean hold never also emits EventCorner.
func TestB6SaveOutcomeThreeWays(t *testing.T) {
	// A single engine/RNG stream is reused across trials rather than
	// reseeding per trial: a fresh math/rand source's very first Float64()
	// draw is not well distributed across nearby small seeds, so reseeding
	// per trial and reading only one draw each risks never sampling a
	// narrow outcome band by chance, independent of whether the code path
	// is reachable.
	e := b4Start(t)
	keeper := e.playerByID("a_1")
	direction := e.attackDirection("home")
	// A dedicated player sits exactly on the rebound spot, closer to it
	// than the keeper (who defaults to near the goal line), so a genuine
	// loose-ball rebound is unambiguously distinguishable from the keeper
	// simply holding the ball -- the keeper would otherwise often be the
	// nearest player to their own rebound too, conflating the two outcomes.
	reboundSpot := domain.Vec3{Y: e.ball.Radius, Z: direction * (e.cfg.Pitch.LengthM/2 - 3)}
	rebounder := e.playerByID("a_10")
	rebounder.state.Position = reboundSpot
	outcomes := map[string]bool{}
	for i := 0; i < 400; i++ {
		// A "hold" now goes through takeGoalKick, which can deliver a pass
		// from the keeper (shotTeamID/shotPlayerID then track the keeper,
		// not the original shot) -- reset both every trial so one trial's
		// hold outcome can't be mistaken for a corner in the next.
		e.shotTeamID, e.shotPlayerID = "home", "h_10"
		e.ball.CarrierID = ""
		before := len(e.events)
		e.resolveSaveOutcome(keeper, direction)
		corner := false
		for _, ev := range e.events[before:] {
			if ev.Type == domain.EventCorner {
				corner = true
			}
		}
		switch {
		case corner:
			// A wayward corner delivery is itself followed by the keeper's
			// goal kick (B7), so shotPlayerID may legitimately be the keeper
			// here; the corner event is what identifies this outcome.
			outcomes["corner"] = true
		case e.ball.CarrierID == rebounder.state.ID:
			outcomes["rebound"] = true
		case e.shotPlayerID == keeper.state.ID && e.shotTeamID == keeper.state.TeamID:
			// takeGoalKick delivered a pass from the keeper.
			outcomes["hold"] = true
		case e.ball.CarrierID == keeper.state.ID:
			// takeGoalKick found no reachable teammate; ball stayed with
			// the keeper instead of being delivered.
			outcomes["hold"] = true
		default:
			t.Fatalf("unexpected outcome: carrier=%q shotPlayerID=%q shotTeamID=%q", e.ball.CarrierID, e.shotPlayerID, e.shotTeamID)
		}
	}
	if len(outcomes) != 3 {
		t.Fatalf("not all three save outcomes were observed over 400 trials: %v", outcomes)
	}
}

// TestB6HeadingJumpingReachDuel checks that a cross duel far from goal
// (outfield defender, not the keeper) is decided by Heading/JumpingReach,
// replacing the old flat Aerial aggregate. It also regression-guards that a
// target far from goal is contested by the nearest outfield defender, not
// the goalkeeper.
func TestB6HeadingJumpingReachDuel(t *testing.T) {
	var attackerWins [2]int
	for level, heading := range []int{1, 20} {
		for seed := int64(1); seed <= 30; seed++ {
			e := b4Start(t)
			e.rng = rand.New(rand.NewSource(seed))
			for i := range e.players {
				p := &e.players[i]
				p.speed = 0
				p.state.Position = domain.Vec3{X: -60, Z: -60}
			}
			carrier := e.playerByID("h_10")
			carrier.state.Position = domain.Vec3{X: 20, Z: 20}
			carrier.attributes.Crossing = 20
			target := e.playerByID("h_11")
			target.state.Position = domain.Vec3{X: 22, Z: 26}
			target.attributes.Heading = heading
			target.attributes.JumpingReach = heading
			defender := e.playerByID("a_10")
			defender.state.Position = target.state.Position
			defender.attributes.Heading = 20
			defender.attributes.JumpingReach = 20
			e.ball.Position = carrier.state.Position
			e.startCross(carrier, e.teamStats["home"], carrier.attributes.Crossing)
			for i := 0; i < 200 && e.ball.Status == "crossing"; i++ {
				b4Step(t, e)
			}
			switch e.ball.CarrierID {
			case target.state.ID:
				attackerWins[level]++
			case defender.state.ID:
				// defender win, nothing to tally
			default:
				// A wayward delivery (startCross's own skill-scaled chance,
				// deliberately kept nonzero even at Crossing=20) never
				// reached the duel at all; not a defender win, not counted.
			}
		}
	}
	if attackerWins[0] >= attackerWins[1] {
		t.Fatalf("heading/jumping_reach has no measurable effect on the aerial duel: low=%d high=%d (of 30 seeds each)", attackerWins[0], attackerWins[1])
	}
}

// TestB6GoalkeeperClaimsCrossNearGoal checks that a cross target close to
// the defending goal is contested by the goalkeeper (AerialReach/
// CommandOfArea), not the nearest outfield defender, closing the gap where
// the keeper never appeared in the aerial-duel block.
func TestB6GoalkeeperClaimsCrossNearGoal(t *testing.T) {
	var attackerWins [2]int
	for level, aerialReach := range []int{1, 20} {
		for seed := int64(1); seed <= 30; seed++ {
			e := b4Start(t)
			e.rng = rand.New(rand.NewSource(seed))
			for i := range e.players {
				p := &e.players[i]
				p.speed = 0
				p.state.Position = domain.Vec3{X: -60, Z: -60}
			}
			carrier := e.playerByID("h_10")
			carrier.attributes.Crossing = 20
			direction := e.attackDirection("home")
			nearGoalZ := direction*e.cfg.Pitch.LengthM/2 - direction*5
			carrier.state.Position = domain.Vec3{Z: nearGoalZ - direction*10}
			target := e.playerByID("h_11")
			target.state.Position = domain.Vec3{X: 3, Z: nearGoalZ}
			target.attributes.Heading = 10
			target.attributes.JumpingReach = 10
			keeper := e.playerByID("a_1")
			keeper.state.Position = target.state.Position
			keeper.attributes.AerialReach = aerialReach
			keeper.attributes.CommandOfArea = aerialReach
			// A strong outfield defender is also right there; if the code
			// mistakenly used them instead of the keeper, the outcome
			// would track their (fixed, high) skill, not aerialReach.
			outfield := e.playerByID("a_10")
			outfield.state.Position = target.state.Position
			outfield.attributes.Heading = 20
			outfield.attributes.JumpingReach = 20
			e.ball.Position = carrier.state.Position
			e.startCross(carrier, e.teamStats["home"], carrier.attributes.Crossing)
			for i := 0; i < 200 && e.ball.Status == "crossing"; i++ {
				b4Step(t, e)
			}
			switch e.ball.CarrierID {
			case target.state.ID:
				attackerWins[level]++
			case keeper.state.ID:
				// keeper win, nothing to tally
			default:
				// A wayward delivery never reached the duel; not counted.
			}
		}
	}
	// Lower keeper skill (level 0) should let the attacker win more often,
	// not less -- a weaker keeper is a worse defender of the duel.
	if attackerWins[0] <= attackerWins[1] {
		t.Fatalf("goalkeeper aerial_reach/command_of_area has no measurable effect near goal: low-keeper-skill attacker wins=%d high-keeper-skill attacker wins=%d (of 30 seeds each)", attackerWins[0], attackerWins[1])
	}
}

// TestB6FootFactorSymmetric checks that both halves of the pitch now read
// their own explicit foot rating -- previously only the left half was ever
// penalized, the right half unconditionally returned 1.
func TestB6FootFactorSymmetric(t *testing.T) {
	e := b4Start(t)
	p := e.playerByID("h_10")
	p.state.Position = domain.Vec3{X: 10}
	p.attributes.Right = 1
	rightLow := e.footFactor(p)
	p.attributes.Right = 20
	rightHigh := e.footFactor(p)
	if !(rightHigh > rightLow) {
		t.Fatalf("right-side foot factor does not scale with Right: low=%v high=%v", rightLow, rightHigh)
	}

	p.state.Position = domain.Vec3{X: -10}
	p.attributes.Left = 1
	leftLow := e.footFactor(p)
	p.attributes.Left = 20
	leftHigh := e.footFactor(p)
	if !(leftHigh > leftLow) {
		t.Fatalf("left-side foot factor does not scale with Left: low=%v high=%v", leftLow, leftHigh)
	}
}

// TestB6PenaltyTakerUsesPenaltyTaking checks that bestPenaltyTaker picks by
// PenaltyTaking, diverging from Finishing/LongShots.
func TestB6PenaltyTakerUsesPenaltyTaking(t *testing.T) {
	e := b4Start(t)
	h10 := e.playerByID("h_10")
	h11 := e.playerByID("h_11")
	h10.attributes.Finishing, h10.attributes.LongShots, h10.attributes.PenaltyTaking = 20, 20, 1
	h11.attributes.Finishing, h11.attributes.LongShots, h11.attributes.PenaltyTaking = 1, 1, 20
	taker := e.bestPenaltyTaker("home")
	if taker == nil || taker.state.ID != h11.state.ID {
		t.Fatalf("penalty taker not selected by PenaltyTaking: got %+v, want h_11", taker)
	}
}

// TestB6CornerTakenFromArcByBestCornerTaker checks that a corner places the
// ball at the actual corner arc (not wherever the attacking team's nearest
// player happens to stand) and is taken by the team's highest-Corners
// player, not the nearest one.
func TestB6CornerTakenFromArcByBestCornerTaker(t *testing.T) {
	e := b4Start(t)
	h10 := e.playerByID("h_10")
	h11 := e.playerByID("h_11")
	h10.attributes.Corners = 1
	h11.attributes.Corners = 20
	h10.state.Position = domain.Vec3{X: 0, Z: 0}
	e.shotPlayerID = "h_10"
	direction := e.attackDirection("home")
	e.takeCorner("home", 1)
	want := domain.Vec3{X: 1 * e.cfg.Pitch.WidthM / 2, Y: 0, Z: direction * e.cfg.Pitch.LengthM / 2}
	if h11.state.Position != want {
		t.Fatalf("corner taker position = %+v, want %+v", h11.state.Position, want)
	}
	if h10.state.Position == want {
		t.Fatal("the nearest player moved to the arc instead of the best Corners player")
	}
}

// TestB6CrossWaywardChanceScalesWithSkill checks that startCross's delivery
// succeeds (reaches "crossing" status) more often at high deliverySkill
// than low, replacing the old zero-skill-dependency delivery.
func TestB6CrossWaywardChanceScalesWithSkill(t *testing.T) {
	var delivered [2]int
	for level, skill := range []int{1, 20} {
		for seed := int64(1); seed <= 60; seed++ {
			e := b4Start(t)
			e.rng = rand.New(rand.NewSource(seed))
			carrier := e.playerByID("h_10")
			target := e.playerByID("h_11")
			carrier.state.Position = domain.Vec3{X: 20, Z: 20}
			target.state.Position = domain.Vec3{X: 22, Z: 26}
			e.ball.Position = carrier.state.Position
			e.startCross(carrier, e.teamStats["home"], skill)
			if e.ball.Status == "crossing" {
				delivered[level]++
			}
		}
	}
	if delivered[0] >= delivered[1] {
		t.Fatalf("cross delivery success does not scale with skill: low=%d high=%d (of 60 seeds)", delivered[0], delivered[1])
	}
}

// TestB6FreeKickPrefersBestTakerInRange checks that a free kick within
// shooting range of goal is taken by the team's best FreeKickTaking player
// instead of the nearest one, and that beyond that range restartAt's plain
// nearest-player pickup is unchanged.
func TestB6FreeKickPrefersBestTakerInRange(t *testing.T) {
	e := b4Start(t)
	h10 := e.playerByID("h_10")
	h11 := e.playerByID("h_11")
	h10.attributes.FreeKickTaking = 1
	h11.attributes.FreeKickTaking = 20
	direction := e.attackDirection("home")

	inRange := domain.Vec3{X: 0, Z: direction * (e.cfg.Pitch.LengthM/2 - 20)}
	h10.state.Position = inRange
	h11.state.Position = domain.Vec3{X: 30, Z: 0}
	e.takeFreeKick("home", inRange)
	if e.ball.CarrierID != h11.state.ID {
		t.Fatalf("free kick in range did not prefer the best FreeKickTaking player: carrier=%q", e.ball.CarrierID)
	}

	beyondRange := domain.Vec3{X: 0, Z: 0}
	h10.state.Position = beyondRange
	e.takeFreeKick("home", beyondRange)
	if e.ball.CarrierID != h10.state.ID {
		t.Fatalf("free kick beyond range should use restartAt's nearest-player pickup: carrier=%q", e.ball.CarrierID)
	}
}

// TestB6GoalKickDistributionScalesWithKicking checks that takeGoalKick's
// delivery target progresses further forward for a higher-Kicking keeper,
// replacing the old "materializes at whoever sorts first, no distribution
// at all" behavior.
func TestB6GoalKickDistributionScalesWithKicking(t *testing.T) {
	var progress [2]float64
	for level, kicking := range []int{1, 20} {
		e := b4Start(t)
		for i := range e.players {
			e.players[i].speed = 0
		}
		keeper := e.playerByID("h_1")
		keeper.attributes.Kicking = kicking
		e.takeGoalKick("home")
		target := e.playerByID(e.passTargetID)
		if target == nil {
			t.Fatalf("no delivery target selected for kicking=%d", kicking)
		}
		direction := e.attackDirection("home")
		progress[level] = direction * (target.state.Position.Z - keeper.state.Position.Z)
	}
	if !(progress[1] > progress[0]) {
		t.Fatalf("goal kick target does not progress further forward with higher Kicking: low=%v high=%v", progress[0], progress[1])
	}
}

// TestB6ThrowInDistributionScalesWithThrowing mirrors the goal-kick test
// for takeThrowIn.
func TestB6ThrowInDistributionScalesWithThrowing(t *testing.T) {
	var progress [2]float64
	for level, throwing := range []int{1, 20} {
		e := b4Start(t)
		for i := range e.players {
			e.players[i].speed = 0
		}
		thrower := e.playerByID("h_2")
		thrower.attributes.Throwing = throwing
		spot := domain.Vec3{X: e.cfg.Pitch.WidthM / 2, Z: 0}
		thrower.state.Position = spot
		e.takeThrowIn("home", spot)
		target := e.playerByID(e.passTargetID)
		if target == nil {
			t.Fatalf("no delivery target selected for throwing=%d", throwing)
		}
		direction := e.attackDirection("home")
		progress[level] = direction * (target.state.Position.Z - spot.Z)
	}
	if !(progress[1] > progress[0]) {
		t.Fatalf("throw-in target does not progress further forward with higher Throwing: low=%v high=%v", progress[0], progress[1])
	}
}

// TestB6NextTeammateUnchangedForOpenPlay is a regression guard for the
// nextTeammate/nextTeammateBiased refactor: nextTeammate must still pick
// exactly what nextTeammateBiased(..., openPlayForwardWeight) picks, for
// every existing open-play caller.
func TestB6NextTeammateUnchangedForOpenPlay(t *testing.T) {
	e := b4Start(t)
	carrier := e.playerByID("h_10")
	got := e.nextTeammate(carrier.state.TeamID, carrier.state.ID)
	want := e.nextTeammateBiased(carrier.state.TeamID, carrier.state.ID, openPlayForwardWeight)
	if got == nil || want == nil || got.state.ID != want.state.ID {
		t.Fatalf("nextTeammate diverged from nextTeammateBiased(..., openPlayForwardWeight): got=%v want=%v", got, want)
	}
}
