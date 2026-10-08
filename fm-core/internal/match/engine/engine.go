package engine

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"math/rand"
	"sort"
	"strings"
	"time"

	"github.com/resoul/fm-core/internal/match/config"
	"github.com/resoul/fm-core/internal/match/domain"
)

var (
	ErrMatchNotStarted  = errors.New("match has not started")
	ErrMatchPaused      = errors.New("match is paused")
	ErrMatchFinished    = errors.New("match is finished")
	ErrMatchNotFinished = errors.New("match is not finished")
	ErrMatchAbandoned   = errors.New("match is abandoned")
)

// Version identifies behavior and state-hash semantics for replay.
const Version = "b7"

type StepOutput struct {
	Events    []domain.MatchEvent
	Snapshot  domain.MatchSnapshot
	StateHash string
}

type playerRuntime struct {
	slot         string
	slotPos      [2]float64 // normalized template position of slot (custom slots keep their explicit x/z)
	state        domain.PlayerState
	target       domain.Vec2
	speed        float64
	sharpness    float64
	attributes   domain.PlayerAttributes
	instructions domain.PlayerInstructions
	stats        domain.PlayerStats
	everPlayed   bool
	yellowCards  int
	sentOff      bool
	injury       *domain.InjuryStatus
	// tackleCooldownTicks blocks a defender from re-attempting a tackle
	// right after one (won or lost) so a close-quarters contest is a
	// sequence of distinct challenges, not a per-tick coin flip (B7).
	tackleCooldownTicks int
}

// Engine owns all mutable match state. It is intentionally synchronous.
type Engine struct {
	input    domain.MatchInput
	cfg      config.Config
	rng      *rand.Rand
	seed     int64
	rngCalls int64

	tick              int64
	phase             domain.MatchPhase
	paused            bool
	period            int
	periodElapsedMs   int
	periodAddedMs     int
	totalAddedMs      int
	score             domain.Score
	players           []playerRuntime
	ball              domain.BallState
	ballFlightTicks   int
	shotTeamID        string
	shotPlayerID      string
	shotTargetX       float64
	shotSkill         int
	shotDistanceM     float64
	passTargetID      string
	passOrigin        domain.Vec3
	teamStats         map[string]*domain.TeamStats
	substitutions     map[string]int
	events            []domain.MatchEvent
	nextEventSeq      int64
	lastCommandSeq    int64
	commandOutcomes   []domain.CommandOutcome
	stateHashEnabled  bool
	foulCooldownTicks int
	abandonReason     string

	// Scratch buffers reused across ticks. They hold no state between
	// calls (every user fully rewrites them) and are excluded from the
	// state hash; they exist only to keep the per-tick allocation count
	// flat over a 108,000-tick match.
	scratchPressers  []bool
	scratchFractions []float64
	scratchOptions   []passOption
	scratchCandidate []pressCandidate
}

type pressCandidate struct {
	index    int
	distance float64
}

func New(input domain.MatchInput, cfg config.Config, seed int64) (*Engine, error) {
	if err := input.Validate(); err != nil {
		return nil, err
	}
	if err := config.Validate(cfg); err != nil {
		return nil, err
	}
	if err := config.RequireRulesProfile(input.RulesProfile, cfg); err != nil {
		return nil, err
	}
	if cfg.Pitch.WidthM != input.Pitch.Width || cfg.Pitch.LengthM != input.Pitch.Length {
		// The match dimensions are part of the input; the resolved config must agree.
		return nil, fmt.Errorf("engine: config pitch dimensions do not match match input")
	}
	e := &Engine{
		input: input.DeepCopy(), cfg: cfg, rng: rand.New(rand.NewSource(seed)), seed: seed,
		phase: domain.PhaseNotStarted, period: 1,
		ball: domain.BallState{Position: domain.Vec3{Y: cfg.Pitch.BallRadiusM}, Radius: cfg.Pitch.BallRadiusM, Status: "dead"},
		teamStats: map[string]*domain.TeamStats{
			input.HomeTeam.ID: {TeamID: input.HomeTeam.ID}, input.AwayTeam.ID: {TeamID: input.AwayTeam.ID},
		},
		substitutions: map[string]int{input.HomeTeam.ID: 0, input.AwayTeam.ID: 0},
	}
	e.players = make([]playerRuntime, 0, 22)
	e.addTeamPlayers(input.HomeTeam, true)
	e.addTeamPlayers(input.AwayTeam, false)
	e.addBenchPlayers(input.HomeTeam)
	e.addBenchPlayers(input.AwayTeam)
	sort.Slice(e.players, func(i, j int) bool { return e.players[i].state.ID < e.players[j].state.ID })
	return e, nil
}

func (e *Engine) addTeamPlayers(team domain.TeamInput, home bool) {
	byID := make(map[string]domain.PlayerInput, len(team.Players))
	for _, p := range team.Players {
		byID[p.ID] = p
	}
	for _, slot := range team.StartingLineup {
		p := byID[slot.PlayerID]
		pos, ok := domain.StandardSlotPositions[slot.Slot]
		if !ok {
			pos = [2]float64{slot.X, slot.Z}
		}
		base := e.slotTarget(team.ID, pos)
		x, z := base.X, base.Z
		speed := e.playerSpeed(p.Attributes.Pace) * e.fitnessFactor(p.StartingCondition.Fitness)
		e.players = append(e.players, playerRuntime{
			slot: slot.Slot, slotPos: pos, state: domain.PlayerState{ID: p.ID, TeamID: team.ID, Position: domain.Vec3{X: x, Y: 0, Z: z}, Active: true, Fatigue: p.StartingCondition.InitialFatigue}, attributes: p.Attributes, instructions: p.Instructions,
			target: domain.Vec2{X: x, Z: z}, speed: speed, sharpness: p.StartingCondition.Sharpness / 100,
			stats: domain.PlayerStats{PlayerID: p.ID, TeamID: team.ID}, everPlayed: true,
		})
	}
}

func (e *Engine) addBenchPlayers(team domain.TeamInput) {
	byID := make(map[string]domain.PlayerInput, len(team.Players))
	for _, p := range team.Players {
		byID[p.ID] = p
	}
	for _, id := range team.Bench {
		p := byID[id]
		e.players = append(e.players, playerRuntime{
			speed: e.playerSpeed(p.Attributes.Pace) * e.fitnessFactor(p.StartingCondition.Fitness), sharpness: p.StartingCondition.Sharpness / 100,
			state: domain.PlayerState{ID: p.ID, TeamID: team.ID, Active: false, Fatigue: p.StartingCondition.InitialFatigue}, attributes: p.Attributes, instructions: p.Instructions, stats: domain.PlayerStats{PlayerID: p.ID, TeamID: team.ID},
		})
	}
}

// fitnessFactor is the independent starting-readiness ceiling from
// StartingCondition.Fitness (0..100), baked once into a player's top speed
// at construction. It is distinct from fatigueSpeedFactor, which erodes
// speed over the match from accumulated Fatigue driven by Stamina: Fitness
// sets the ceiling, Stamina/Fatigue erode it, and neither restates the other.
func (e *Engine) fitnessFactor(fitness float64) float64 { return 0.85 + 0.15*fitness/100 }

// slotTarget converts a normalized slot position (X across [-1,1], Z along
// [-1,1], see StandardSlotPositions) into a world-space off-ball target for
// teamID, oriented by its current attack direction. Width scales the
// lateral spread around the template's center; LineHeight shifts the whole
// shape toward (high) or away from (deep) the team's attacking goal. Both
// are neutral at their 0.5 default, so a match that never changes tactics
// sees the same shape the plain template would have produced.
func (e *Engine) slotTarget(teamID string, pos [2]float64) domain.Vec2 {
	tactics, _ := e.Tactics(teamID)
	direction := e.attackDirection(teamID)
	widthFactor := 1.0 + 0.6*(tactics.Width-0.5)
	lineShift := direction * (tactics.LineHeight - 0.5) * 12
	return domain.Vec2{
		X: direction * pos[0] * widthFactor * e.cfg.Pitch.WidthM / 2,
		Z: direction*pos[1]*e.cfg.Pitch.LengthM/2 + lineShift,
	}
}

// recomputeOffBallTargets re-derives every active, template-slotted
// player's off-ball target after a tactics change, so a live Width/
// LineHeight change is visible immediately rather than only at the next
// kickoff/substitution. A player currently pressing has their target
// overridden again on the very next movePlayers tick regardless.
func (e *Engine) recomputeOffBallTargets(teamID string) {
	for i := range e.players {
		p := &e.players[i]
		if p.state.TeamID != teamID || !p.state.Active || p.slot == "" {
			continue
		}
		p.target = e.slotTarget(teamID, p.slotPos)
	}
}

func (e *Engine) Apply(cmd domain.MatchCommand) (out domain.CommandOutcome) {
	out = domain.CommandOutcome{CommandID: cmd.ID}
	if e.phase == domain.PhaseFinished || e.phase == domain.PhaseAbandoned {
		out.Reason = "match is terminal"
		return out
	}
	defer func() { e.commandOutcomes = append(e.commandOutcomes, out) }()
	if cmd.TargetTick != e.tick {
		out.Reason = fmt.Sprintf("target_tick %d does not match current tick %d", cmd.TargetTick, e.tick)
		return out
	}
	if !strings.HasPrefix(cmd.ID, "auto-") && cmd.Sequence > 0 && cmd.Sequence <= e.lastCommandSeq {
		out.Reason = fmt.Sprintf("sequence %d is not greater than previous sequence %d", cmd.Sequence, e.lastCommandSeq)
		return out
	}
	switch cmd.Type {
	case domain.CommandStart:
		if e.phase != domain.PhaseNotStarted {
			out.Reason = "match already started"
			return out
		}
		e.phase, e.paused = domain.PhaseFirstHalf, false
		e.emit(domain.EventKickoff)
		e.kickoff(e.input.HomeTeam.ID)
	case domain.CommandPause:
		if e.phase != domain.PhaseFirstHalf && e.phase != domain.PhaseSecondHalf || e.paused {
			out.Reason = "match is not running"
			return out
		}
		e.paused = true
	case domain.CommandResume:
		if !e.paused || (e.phase != domain.PhaseFirstHalf && e.phase != domain.PhaseSecondHalf) {
			out.Reason = "match is not paused"
			return out
		}
		e.paused = false
	case domain.CommandContinueSecondHalf:
		if e.phase != domain.PhaseHalfTime {
			out.Reason = "match is not at halftime"
			return out
		}
		e.period, e.periodElapsedMs, e.phase, e.paused = 2, 0, domain.PhaseSecondHalf, false
		e.emit(domain.EventKickoff)
		// Teams swap ends: attackDirection already flips with period, and
		// kickoff lines everyone up on their new side. Before B7 only the
		// off-ball targets were nudged, so both teams kept standing in the
		// half they had just defended, next to the goal they now attacked.
		e.kickoff(e.input.AwayTeam.ID)
	case domain.CommandChangeTactics:
		if cmd.Tactics == nil {
			out.Reason = "tactics payload is required"
			return out
		}
		if err := cmd.Tactics.Validate(cmd.TeamID); err != nil {
			out.Reason = err.Error()
			return out
		}
		if cmd.TeamID == e.input.HomeTeam.ID {
			e.input.HomeTeam.Tactics = *cmd.Tactics
		} else if cmd.TeamID == e.input.AwayTeam.ID {
			e.input.AwayTeam.Tactics = *cmd.Tactics
		} else {
			out.Reason = "unknown team_id"
			return out
		}
		e.recomputeOffBallTargets(cmd.TeamID)
		e.emitWith(domain.EventTacticsChange, "", cmd.TeamID, "")
	case domain.CommandSubstitute:
		if e.phase != domain.PhaseHalfTime {
			out.Reason = "substitution is allowed only at halftime in profile A"
			return out
		}
		if err := e.substitute(cmd); err != nil {
			out.Reason = err.Error()
			return out
		}
		e.emitWith(domain.EventSubstitution, cmd.PlayerOut, cmd.TeamID, cmd.PlayerIn)
	default:
		out.Reason = fmt.Sprintf("unsupported command %q", cmd.Type)
		return out
	}
	out.Accepted = true
	if !strings.HasPrefix(cmd.ID, "auto-") && cmd.Sequence > 0 {
		e.lastCommandSeq = cmd.Sequence
	}
	return out
}

func (e *Engine) substitute(cmd domain.MatchCommand) error {
	if e.substitutions[cmd.TeamID] >= e.cfg.Rules.SubstitutionsLimit {
		return fmt.Errorf("substitution limit reached for team %q", cmd.TeamID)
	}
	if _, ok := domain.StandardSlotPositions[cmd.Slot]; !ok {
		return fmt.Errorf("unknown substitution slot %q", cmd.Slot)
	}
	var outPlayer, inPlayer *playerRuntime
	for i := range e.players {
		p := &e.players[i]
		if p.state.ID == cmd.PlayerOut {
			outPlayer = p
		}
		if p.state.ID == cmd.PlayerIn {
			inPlayer = p
		}
	}
	if outPlayer == nil || inPlayer == nil || outPlayer.state.TeamID != cmd.TeamID || inPlayer.state.TeamID != cmd.TeamID {
		return fmt.Errorf("players must belong to team_id")
	}
	if outPlayer.sentOff || outPlayer.slot == "" || (!outPlayer.state.Active && outPlayer.injury == nil) {
		return fmt.Errorf("player_out_id is not on the field")
	}
	if inPlayer.state.Active || inPlayer.everPlayed {
		return fmt.Errorf("player_in_id is not an unused bench player")
	}
	if cmd.Slot == "" {
		return fmt.Errorf("slot is required")
	}
	for _, p := range e.players {
		if p.state.TeamID == cmd.TeamID && p.state.ID != outPlayer.state.ID && p.slot == cmd.Slot {
			return fmt.Errorf("substitution slot is occupied")
		}
	}
	team := e.input.HomeTeam
	if cmd.TeamID == e.input.AwayTeam.ID {
		team = e.input.AwayTeam
	}
	for _, p := range team.Players {
		if p.ID == cmd.PlayerIn && ((cmd.Slot == "GK" && !p.CanPlayGK()) || (cmd.Slot != "GK" && p.Role.IsGK() && len(p.AllowedPositions) == 0)) {
			return fmt.Errorf("player_in_id cannot play substitution slot")
		}
	}
	inPlayer.slot, outPlayer.slot = cmd.Slot, ""
	inPlayer.slotPos = domain.StandardSlotPositions[cmd.Slot]
	inPlayer.target = e.slotTarget(cmd.TeamID, inPlayer.slotPos)
	inPlayer.state.Position = outPlayer.state.Position
	inPlayer.state.Velocity = domain.Vec3{}
	inPlayer.state.Active, inPlayer.everPlayed = true, true
	outPlayer.state.Active = false
	e.substitutions[cmd.TeamID]++
	if e.ball.CarrierID == outPlayer.state.ID {
		e.giveBallToNearest(e.opponentTeam(cmd.TeamID))
	}
	return nil
}

// lineUp puts every active slotted player on their template position for
// the current attack direction, inside their own half: the standard
// pre-kickoff shape. Bench players are untouched.
func (e *Engine) lineUp() {
	for i := range e.players {
		p := &e.players[i]
		if !p.state.Active || p.slot == "" {
			continue
		}
		direction := e.attackDirection(p.state.TeamID)
		pos := e.slotTarget(p.state.TeamID, p.slotPos)
		if direction*pos.Z > -1 {
			pos.Z = -direction
		}
		p.state.Position = domain.Vec3{X: pos.X, Y: 0, Z: pos.Z}
		p.state.Velocity = domain.Vec3{}
		p.target = pos
	}
}

// kickoff restarts play from the centre spot: both teams line up, the
// kicking team's outfield player closest to the centre steps onto the spot
// and takes the ball. Used for the start of each half and after a goal.
// Before B7 a "kickoff" handed the ball to the kicking team's lowest player
// ID wherever they stood -- the goalkeeper, on their own goal line.
func (e *Engine) kickoff(teamID string) {
	e.lineUp()
	e.ball.Position = domain.Vec3{Y: e.ball.Radius}
	e.ball.Velocity = domain.Vec3{}
	e.ball.Status, e.ball.CarrierID = "controlled", ""
	e.shotTeamID = teamID
	var taker *playerRuntime
	best := math.MaxFloat64
	for i := range e.players {
		p := &e.players[i]
		if p.state.TeamID != teamID || !p.state.Active || p.slot == "GK" {
			continue
		}
		d := math.Hypot(p.state.Position.X, p.state.Position.Z)
		if d < best {
			best, taker = d, p
		}
	}
	if taker == nil {
		e.giveBallToNearest(teamID)
		return
	}
	taker.state.Position = domain.Vec3{}
	e.ball.CarrierID = taker.state.ID
}

func (e *Engine) Step() (StepOutput, error) {
	if e.phase == domain.PhaseNotStarted {
		return StepOutput{}, ErrMatchNotStarted
	}
	if e.phase == domain.PhaseFinished {
		return StepOutput{}, ErrMatchFinished
	}
	if e.phase == domain.PhaseAbandoned {
		return StepOutput{}, ErrMatchAbandoned
	}
	if e.phase == domain.PhaseHalfTime {
		return StepOutput{}, ErrMatchPaused
	}
	if e.paused {
		return StepOutput{}, ErrMatchPaused
	}
	if e.tick >= int64(e.cfg.Timing.MaxTicksGuard) {
		return StepOutput{}, fmt.Errorf("maximum tick guard %d exceeded", e.cfg.Timing.MaxTicksGuard)
	}
	previousEvents := len(e.events)
	e.tick++
	e.periodElapsedMs += e.cfg.Timing.StepMs
	if e.foulCooldownTicks > 0 {
		e.foulCooldownTicks--
	}
	e.movePlayers()
	if e.periodElapsedMs < e.periodDuration() {
		e.playBall()
	}
	if err := e.ValidateInvariants(); err != nil {
		return StepOutput{}, err
	}
	if e.phase == domain.PhaseAbandoned {
		// A red card or injury processed by movePlayers/playBall above already
		// dropped a team below minActivePlayers this tick; do not also run the
		// normal halftime/fulltime transition on top of it.
	} else if e.periodElapsedMs >= e.periodDuration() {
		if e.period == 1 {
			e.phase = domain.PhaseHalfTime
			e.emit(domain.EventHalfTime)
		} else {
			e.phase = domain.PhaseFinished
			e.emit(domain.EventFullTime)
		}
	}
	snapshot := e.Snapshot()
	stateHash := ""
	if e.stateHashEnabled {
		stateHash = e.StateHash()
	}
	return StepOutput{Events: append([]domain.MatchEvent(nil), e.events[previousEvents:]...), Snapshot: snapshot, StateHash: stateHash}, nil
}

func (e *Engine) periodDuration() int {
	d := e.cfg.Timing.HalfDurationMs
	if e.cfg.Timing.AddedTimeMode == "fixed_per_half" {
		if e.period == 1 {
			d += e.cfg.Timing.FixedAddedTimeHalf1Ms
		} else {
			d += e.cfg.Timing.FixedAddedTimeHalf2Ms
		}
	}
	if e.cfg.Timing.AddedTimeMode == "tracked_delays" {
		d += e.periodAddedMs
	}
	return d
}

func (e *Engine) movePlayers() {
	dt := float64(e.cfg.Timing.StepMs) / 1000
	carrierTeam := e.ballTeamID()
	pressers := e.selectPressers(carrierTeam)
	// Phase 1: every player picks a target from the same start-of-tick
	// state (positions nobody has updated yet), in stable ID order. Targets
	// are re-derived every tick from the ball and the team shape, so
	// pressing is a transient override rather than a permanent retarget
	// (before B7 a player who once pressed kept the old ball position as
	// their target for the rest of the match). Deciding and moving in one
	// pass would let the lower-ID team see the other team's positions from
	// a tick earlier -- a systematic, ID-order-dependent asymmetry.
	if cap(e.scratchFractions) < len(e.players) {
		e.scratchFractions = make([]float64, len(e.players))
	}
	speedFractions := e.scratchFractions[:len(e.players)]
	for i := range e.players {
		p := &e.players[i]
		if !p.state.Active {
			continue
		}
		speedFractions[i] = offBallSpeedFraction
		switch {
		case e.ball.CarrierID == p.state.ID && e.ball.Status == "controlled":
			p.target, speedFractions[i] = e.carrierTarget(p)
		case pressers[i]:
			p.target.X, p.target.Z = e.ball.Position.X, e.ball.Position.Z
			speedFractions[i] = 1
		default:
			p.target = e.shapeTarget(p, carrierTeam)
		}
	}
	// Phase 2: apply movement.
	for i := range e.players {
		p := &e.players[i]
		if !p.state.Active {
			continue
		}
		if p.tackleCooldownTicks > 0 {
			p.tackleCooldownTicks--
		}
		speedFraction := speedFractions[i]
		dx, dz := p.target.X-p.state.Position.X, p.target.Z-p.state.Position.Z
		d := math.Hypot(dx, dz)
		effectiveSpeed := p.speed * e.fatigueSpeedFactor(p) * speedFraction
		if speedFraction == offBallSpeedFraction {
			// Off the ball a player closes on a moving shape target
			// proportionally, so a shape that shifts a metre with every
			// pass yields a walk, not a full-speed sprint every tick.
			effectiveSpeed = math.Min(effectiveSpeed, d*offBallClosingRate)
		}
		if d > 0 {
			// Acceleration ramps the usable speed toward effectiveSpeed instead
			// of snapping to it, using the previous tick's velocity as the
			// starting point; config already declared PlayerMin/MaxAccelMps2
			// for this and nothing consumed them before this change.
			prevSpeed := math.Hypot(p.state.Velocity.X, p.state.Velocity.Z)
			rampedSpeed := effectiveSpeed
			maxDelta := e.playerAccel(p.attributes.Acceleration) * dt
			if prevSpeed < effectiveSpeed {
				rampedSpeed = math.Min(effectiveSpeed, prevSpeed+maxDelta)
			} else if prevSpeed > effectiveSpeed {
				rampedSpeed = math.Max(effectiveSpeed, prevSpeed-maxDelta)
			}
			distance := math.Min(d, rampedSpeed*dt)
			p.state.Position.X += dx / d * distance
			p.state.Position.Z += dz / d * distance
			p.state.DistanceM += distance
			p.stats.DistanceM += distance
			p.state.Velocity.X, p.state.Velocity.Z = dx/d*rampedSpeed, dz/d*rampedSpeed
			p.state.Facing = math.Atan2(dx, dz)
		} else {
			p.state.Velocity = domain.Vec3{}
		}
		p.state.MinutesOnPit += dt / 60
		// Load-driven fatigue: a baseline for being on the pitch plus a
		// quadratic term in actual running speed, scaled by Stamina. A
		// pure time ramp (pre-B7) saturated every player at 100 well
		// before full time regardless of what they did.
		load := math.Hypot(p.state.Velocity.X, p.state.Velocity.Z) / e.cfg.Physics.PlayerMaxSpeedMps
		staminaFactor := 1 + float64(20-p.attributes.Stamina)/20*0.6
		fatigueRate := (0.004 + 0.012*load*load) * staminaFactor
		p.state.Fatigue = math.Min(100, p.state.Fatigue+dt*fatigueRate)
		if e.cfg.Rules.InjuriesEnabled && p.state.Fatigue >= 95 && e.randomFloat() < 0.0005 {
			e.injurePlayer(p)
		}
	}
}

// giveBallToNearest hands a ball with no owner to teamID's active player
// closest to where the ball currently is (ties by ID). It is the fallback
// for possession lost to a substitution, dismissal, injury or a missing
// keeper -- not a kickoff.
func (e *Engine) giveBallToNearest(teamID string) {
	e.ball.Velocity = domain.Vec3{}
	e.ball.Status = "controlled"
	e.ball.CarrierID = ""
	var nearest *playerRuntime
	best := math.MaxFloat64
	for i := range e.players {
		p := &e.players[i]
		if p.state.TeamID != teamID || !p.state.Active {
			continue
		}
		d := math.Hypot(p.state.Position.X-e.ball.Position.X, p.state.Position.Z-e.ball.Position.Z)
		if d < best {
			best, nearest = d, p
		}
	}
	if nearest == nil {
		return
	}
	e.ball.CarrierID = nearest.state.ID
	e.ball.Position = nearest.state.Position
	e.ball.Position.Y = e.ball.Radius
}

func (e *Engine) playBall() {
	if e.ball.Status == "flying" || e.ball.Status == "passing" || e.ball.Status == "crossing" {
		e.advanceBall()
		return
	}
	carrier := e.playerByID(e.ball.CarrierID)
	if carrier == nil {
		e.giveBallToNearest(e.input.HomeTeam.ID)
		carrier = e.playerByID(e.ball.CarrierID)
	}
	if carrier == nil {
		return
	}
	e.ball.Position = carrier.state.Position
	e.ball.Position.Y = e.ball.Radius
	e.ball.Velocity = carrier.state.Velocity
	team := e.teamStats[carrier.state.TeamID]
	team.ControlledPossessionMs += e.cfg.Timing.StepMs
	if e.maybeFoul(carrier) {
		return
	}
	if e.maybeTackle(carrier) {
		return
	}
	pressure := e.pressureOn(carrier)
	dt := float64(e.cfg.Timing.StepMs) / 1000
	goalDistance := e.distanceToGoal(carrier)
	if carrier.slot == "GK" {
		// Keepers distribute; they never dribble or shoot from open play.
		if target := e.nextTeammateBiased(carrier.state.TeamID, carrier.state.ID, openPlayForwardWeight+0.03*float64(carrier.attributes.Kicking)); target != nil && e.randomFloat() < dt*keeperDistributionRate {
			e.startPass(carrier, team)
		}
		return
	}
	if goalDistance < shotRangeM && e.randomFloat() < dt*e.shotDecisionRate(carrier, pressure, goalDistance) {
		e.startShot(carrier)
	} else if target := e.nextTeammate(carrier.state.TeamID, carrier.state.ID); target != nil && e.isCrossingPosition(carrier) && e.randomFloat() < dt*e.crossDecisionRate(carrier, target, pressure) {
		e.startCross(carrier, team, carrier.attributes.Crossing)
	} else if target := e.nextTeammate(carrier.state.TeamID, carrier.state.ID); target != nil && e.randomFloat() < dt*e.passDecisionRate(carrier, target, pressure) {
		e.startPass(carrier, team)
	}
}

func (e *Engine) fatigueSpeedFactor(p *playerRuntime) float64 {
	return math.Max(0.7, 1.0-0.3*p.state.Fatigue/100)
}

const (
	// offBallSpeedFraction caps off-ball shape movement at a cruise below
	// top speed; pressing and dribbling use the full effective speed.
	offBallSpeedFraction = 0.65
	// offBallClosingRate (1/s) makes off-ball speed proportional to the
	// remaining distance to the shape target.
	offBallClosingRate = 0.5
	// shapeFollowZ/shapeFollowX are how far the team block shifts along and
	// across the pitch per metre of ball displacement from the centre; the
	// team in possession follows a little harder along the pitch.
	shapeFollowZ             = 0.4
	shapeFollowZInPossession = 0.5
	shapeFollowX             = 0.25
	// shapePossessionBiasM pushes the block up in possession and drops it
	// when defending; wideAttackBiasM is the extra push for LM/RM.
	shapePossessionBiasM = 6.0
	wideAttackBiasM      = 6.0
	wideAttackOutwardM   = 6.0
	midfieldAttackBiasM  = 4.0
	// keeperMaxAdvanceM is how far from the goal line the keeper's shape
	// target may be.
	keeperMaxAdvanceM = 14.0
	// shapeAnchorScale compresses the kickoff template toward the halfway
	// line for the open-play block (see shapeAnchor).
	shapeAnchorScale = 0.7
	// spaceRadiusM is how close an opponent may be before an in-possession
	// off-ball player drifts away to find space.
	spaceRadiusM = 5.0
)

// shapeAnchor is slotTarget with the template's along-pitch spread
// compressed toward the halfway line (shapeAnchorScale): the kickoff
// template keeps every outfield line inside its own half, whereas a team in
// open play holds a block around the centre and lets the ball drag it.
// Width and LineHeight apply exactly as in slotTarget.
func (e *Engine) shapeAnchor(teamID string, pos [2]float64) domain.Vec2 {
	tactics, _ := e.Tactics(teamID)
	direction := e.attackDirection(teamID)
	widthFactor := 1.0 + 0.6*(tactics.Width-0.5)
	lineShift := direction * (tactics.LineHeight - 0.5) * 12
	return domain.Vec2{
		X: direction * pos[0] * widthFactor * e.cfg.Pitch.WidthM / 2,
		Z: direction*pos[1]*shapeAnchorScale*e.cfg.Pitch.LengthM/2 + lineShift,
	}
}

// shapeTarget is a player's off-ball position for this tick: the tactical
// slot (Width/LineHeight applied by slotTarget) shifted with the ball so the
// team moves as a block, pushed up or dropped depending on possession, and
// clamped to the pitch. The keeper follows the ball only marginally and
// stays within keeperMaxAdvanceM of their own goal line.
func (e *Engine) shapeTarget(p *playerRuntime, carrierTeam string) domain.Vec2 {
	if p.slot == "" {
		return p.target
	}
	teamID := p.state.TeamID
	base := e.shapeAnchor(teamID, p.slotPos)
	direction := e.attackDirection(teamID)
	half, width := e.cfg.Pitch.LengthM/2, e.cfg.Pitch.WidthM/2
	ballX, ballZ := e.ball.Position.X, e.ball.Position.Z
	if p.slot == "GK" {
		z := base.Z + 0.1*ballZ
		x := base.X + 0.15*ballX
		ownGoalZ := -direction * half
		if direction*(z-ownGoalZ) > keeperMaxAdvanceM {
			z = ownGoalZ + direction*keeperMaxAdvanceM
		}
		return domain.Vec2{X: x, Z: z}
	}
	bias, follow, outward := -shapePossessionBiasM, shapeFollowZ, 0.0
	if carrierTeam == teamID {
		bias, follow = shapePossessionBiasM, shapeFollowZInPossession
		switch p.slot {
		case "LM", "RM":
			// Wide midfielders get higher and wider than the block in
			// possession so they are actually open, in a crossing
			// position, when found -- otherwise the opposing full-back's
			// mirrored slot sits right on top of them.
			bias += wideAttackBiasM
			outward = wideAttackOutwardM
		case "LB", "RB":
			outward = wideAttackOutwardM / 2
		case "CM_L", "CM_R":
			// Central midfielders arrive late in the box rather than
			// holding twenty metres behind the strikers.
			bias += midfieldAttackBiasM
		}
	}
	z := base.Z + follow*ballZ + direction*bias
	x := base.X + shapeFollowX*ballX
	if base.X != 0 {
		x += math.Copysign(outward, base.X)
	}
	if carrierTeam == teamID {
		// Finding space: an attacker whose nearest opponent is inside
		// spaceRadiusM drifts directly away from them, so the block does
		// not stand interleaved with the defenders it wants to play past.
		if opponent, distance := e.nearestActiveOpponent(p); opponent != nil && distance < spaceRadiusM {
			awayX, awayZ := p.state.Position.X-opponent.state.Position.X, p.state.Position.Z-opponent.state.Position.Z
			if distance > 0 {
				x += awayX / distance * (spaceRadiusM - distance)
				z += awayZ / distance * (spaceRadiusM - distance)
			}
		}
	}
	z = math.Max(-(half - 3), math.Min(half-3, z))
	x = math.Max(-(width - 2), math.Min(width-2, x))
	return domain.Vec2{X: x, Z: z}
}

// carrierTarget is where the ball carrier runs: outfield players drive at
// the opponents' goal, at a dribbling pace set by Dribbling; the keeper does
// not dribble and holds their shape position instead.
func (e *Engine) carrierTarget(p *playerRuntime) (domain.Vec2, float64) {
	if p.slot == "GK" {
		return e.shapeTarget(p, p.state.TeamID), offBallSpeedFraction
	}
	direction := e.attackDirection(p.state.TeamID)
	goalZ := direction * e.cfg.Pitch.LengthM / 2
	dx, dz := -p.state.Position.X, goalZ-p.state.Position.Z
	if e.isCrossingPosition(p) && direction*p.state.Position.Z < e.cfg.Pitch.LengthM/2-12 {
		// A wide carrier in the attacking third keeps the width and drives
		// down the line toward the byline zone rather than cutting inside.
		dx = 0
	}
	d := math.Hypot(dx, dz)
	if d == 0 {
		return domain.Vec2{X: p.state.Position.X, Z: p.state.Position.Z}, 0
	}
	const lookAheadM = 8.0
	target := domain.Vec2{X: p.state.Position.X + dx/d*lookAheadM, Z: p.state.Position.Z + dz/d*lookAheadM}
	// Pressure slows the dribble: a crowded carrier shields and looks for
	// a pass rather than running through the defenders.
	return target, (0.45 + 0.30*float64(p.attributes.Dribbling)/20) * (1 - 0.6*e.pressureOn(p))
}

// selectPressers picks which opponents of carrierTeam actually close the
// ball down this tick: the eligible ones (shouldPress) nearest to the ball,
// at most round(2*Pressing) of them (never fewer than one), ties by ID. The rest hold shape, so a
// press is a coordinated small group rather than the whole block collapsing
// onto the ball.
func (e *Engine) selectPressers(carrierTeam string) []bool {
	if cap(e.scratchPressers) < len(e.players) {
		e.scratchPressers = make([]bool, len(e.players))
	}
	pressers := e.scratchPressers[:len(e.players)]
	for i := range pressers {
		pressers[i] = false
	}
	if carrierTeam == "" || e.ball.CarrierID == "" {
		return pressers
	}
	defending := e.opponentTeam(carrierTeam)
	limit := int(math.Max(1, math.Round(2*e.teamPressing(defending))))
	candidates := e.scratchCandidate[:0]
	for i := range e.players {
		p := &e.players[i]
		if !p.state.Active || p.state.TeamID != defending || !e.shouldPress(p, carrierTeam) {
			continue
		}
		candidates = append(candidates, pressCandidate{i, math.Hypot(p.state.Position.X-e.ball.Position.X, p.state.Position.Z-e.ball.Position.Z)})
	}
	// e.players is sorted by ID, so the index tie-break is the ID tie-break.
	sort.Slice(candidates, func(i, j int) bool {
		if candidates[i].distance != candidates[j].distance {
			return candidates[i].distance < candidates[j].distance
		}
		return candidates[i].index < candidates[j].index
	})
	for i := 0; i < len(candidates) && i < limit; i++ {
		pressers[candidates[i].index] = true
	}
	e.scratchCandidate = candidates
	return pressers
}

func (e *Engine) shouldPress(p *playerRuntime, carrierTeam string) bool {
	intensity := e.teamPressing(p.state.TeamID) * e.instructionFactor(p.instructions.Pressing)
	if intensity <= 0 || carrierTeam == "" {
		return false
	}
	if !e.coverZoneMatches(p) {
		return false
	}
	if p.slot == "GK" && !e.inOwnPenaltyArea(p.state.TeamID, e.ball.Position) {
		return false
	}
	// e.ball.Position is only mutated inside playBall, which runs after
	// movePlayers finishes for this tick, so it is a stable snapshot of where
	// the carrier was at the start of the tick. Re-deriving the carrier's
	// position live via e.playerByID(e.ball.CarrierID) here would instead
	// depend on movePlayers' processing order: whether the carrier's ID
	// happens to sort before this defender's in e.players.
	distance := math.Hypot(p.state.Position.X-e.ball.Position.X, p.state.Position.Z-e.ball.Position.Z)
	// A better-positioned defender anticipates the press and effectively
	// closes down a larger radius at the same intensity/instruction.
	return distance <= (8+10*intensity)*e.positioningFactor(p)
}

func (e *Engine) positioningFactor(p *playerRuntime) float64 {
	return 0.85 + 0.15*float64(p.attributes.Positioning)/20
}

func (e *Engine) coverZoneMatches(p *playerRuntime) bool {
	zone := p.instructions.CoverZone
	if zone == "" || zone == "auto" {
		return true
	}
	third := e.cfg.Pitch.WidthM / 6
	switch zone {
	case "left":
		return p.state.Position.X < -third
	case "right":
		return p.state.Position.X > third
	case "center":
		return math.Abs(p.state.Position.X) <= third
	default:
		return true
	}
}

func (e *Engine) playerSpeed(pace int) float64 {
	return e.cfg.Physics.PlayerMinSpeedMps + float64(pace-1)/19*(e.cfg.Physics.PlayerMaxSpeedMps-e.cfg.Physics.PlayerMinSpeedMps)
}

func (e *Engine) playerAccel(acceleration int) float64 {
	return e.cfg.Physics.PlayerMinAccelMps2 + float64(acceleration-1)/19*(e.cfg.Physics.PlayerMaxAccelMps2-e.cfg.Physics.PlayerMinAccelMps2)
}

func (e *Engine) instructionFactor(value float64) float64 { return 2 * value }

func (e *Engine) isCrossingPosition(p *playerRuntime) bool {
	wide := math.Abs(p.state.Position.X) > e.cfg.Pitch.WidthM*0.22
	advanced := e.attackDirection(p.state.TeamID)*p.state.Position.Z > e.cfg.Pitch.LengthM*0.08
	return wide && advanced
}

func (e *Engine) crossDecisionRate(carrier, target *playerRuntime, pressure float64) float64 {
	frequency := carrier.instructions.CrossFrequency
	quality := float64(carrier.attributes.Crossing) / 20
	dampenedPressure := pressure * (1 - 0.4*e.composure(carrier))
	return (0.40 + 0.60*quality) * frequency * (1 - 0.45*dampenedPressure) * e.fatigueSpeedFactor(carrier) * e.sharpnessFactor(carrier)
}

// composure is how much Decisions dampens the pressure term in the
// decision-rate formulas: a calmer, better decision-maker is penalized (or,
// for passDecisionRate's panic-pass term, inflated) less by the same
// measured pressure, rather than having a different baseline accuracy.
func (e *Engine) composure(p *playerRuntime) float64 {
	return float64(p.attributes.Decisions) / 20
}

// sharpnessFactor is the independent execution-quality multiplier from
// StartingCondition.Sharpness. It is applied at its own call sites, never
// alongside fatigueSpeedFactor's own multiplication, so match rhythm and
// physical fatigue never double-penalize the same action.
func (e *Engine) sharpnessFactor(p *playerRuntime) float64 {
	return 0.7 + 0.3*p.sharpness
}

// pressureOn measures how closed down the carrier is, 0..1: opponents
// within pressureRadiusM each contribute linearly with proximity (one
// defender at half the radius is 0.5), scaled by their team's Pressing
// around a neutral 1.0 at Pressing=0.5. The pre-B7 10 m radius saturated at
// 1.0 for practically every carrier once the block followed the ball, which
// made pressure useless as a discriminator.
func (e *Engine) pressureOn(carrier *playerRuntime) float64 {
	pressure := 0.0
	for i := range e.players {
		p := &e.players[i]
		if !p.state.Active || p.state.TeamID == carrier.state.TeamID {
			continue
		}
		distance := math.Hypot(p.state.Position.X-carrier.state.Position.X, p.state.Position.Z-carrier.state.Position.Z)
		if distance < pressureRadiusM {
			pressure += (pressureRadiusM - distance) / pressureRadiusM * (0.7 + 0.6*e.teamPressing(p.state.TeamID))
		}
	}
	return math.Min(1, pressure)
}

const pressureRadiusM = 5.0

func (e *Engine) distanceToGoal(p *playerRuntime) float64 {
	goalZ := e.attackDirection(p.state.TeamID) * e.cfg.Pitch.LengthM / 2
	return math.Hypot(p.state.Position.X, goalZ-p.state.Position.Z)
}

// shotRangeM is the furthest distance from goal at which a carrier
// considers shooting; keeperDistributionRate (1/s) is how quickly a keeper
// in possession releases the ball.
const (
	shotRangeM             = 32.0
	keeperDistributionRate = 0.8
)

func (e *Engine) shotDecisionRate(carrier *playerRuntime, pressure, goalDistance float64) float64 {
	proximity := math.Pow(math.Max(0, 1-goalDistance/shotRangeM), 1.2)
	quality := float64(e.shootingSkill(carrier)) / 20
	dampenedPressure := pressure * (1 - 0.4*e.composure(carrier))
	return (0.022 + 0.047*quality) * proximity * e.shotAngleFactor(carrier) * (1 - 0.4*dampenedPressure) * e.fatigueSpeedFactor(carrier) * e.footFactor(carrier) * e.sharpnessFactor(carrier)
}

// shotAngleFactor discounts shots from wide of the goal: 1 in front of goal,
// ~0.5 sixteen metres to the side.
func (e *Engine) shotAngleFactor(p *playerRuntime) float64 {
	wide := p.state.Position.X / 16
	return 1 / (1 + wide*wide)
}

// shootingSkill splits the old aggregate Shooting into a distance-based
// choice between Finishing (close range, inside the box) and LongShots
// (further out), per decision 26.
func (e *Engine) shootingSkill(p *playerRuntime) int {
	if e.distanceToGoal(p) < 16 {
		return p.attributes.Finishing
	}
	return p.attributes.LongShots
}

func (e *Engine) passDecisionRate(carrier, target *playerRuntime, pressure float64) float64 {
	tempo := e.teamTempo(carrier.state.TeamID)
	quality := float64(carrier.attributes.Passing) / 20
	open := math.Min(1, e.nearestOpponentDistance(target)/12)
	distance := math.Hypot(target.state.Position.X-carrier.state.Position.X, target.state.Position.Z-carrier.state.Position.Z)
	distanceFactor := math.Max(0.25, 1-distance/35)
	dampenedPressure := pressure * (1 - 0.4*e.composure(carrier))
	return (0.28 + 0.35*quality + 0.12*tempo) * (0.6 + 1.0*dampenedPressure) * (0.5 + 0.5*open) * distanceFactor * e.fatigueSpeedFactor(carrier) * e.footFactor(carrier) * e.sharpnessFactor(carrier)
}

// footFactor picks the foot a player on this side of the pitch would
// naturally use and scales by its explicit rating. Both halves are now
// symmetric -- previously only the left half was ever penalized (the right
// half unconditionally returned 1), an asymmetry from having only a single
// derived WeakFoot scalar rather than explicit Left/Right ratings (fixed as
// part of decision 26, not left as a silent gap). Which specific foot a
// given pass/shot angle would actually use, rather than which half of the
// pitch the player stands on, stays a further nuance for a later B6 slice.
func (e *Engine) footFactor(p *playerRuntime) float64 {
	skill := p.attributes.Right
	if p.state.Position.X < 0 {
		skill = p.attributes.Left
	}
	return 0.65 + 0.0175*float64(skill)
}

func (e *Engine) teamTempo(teamID string) float64 {
	if teamID == e.input.HomeTeam.ID {
		return e.input.HomeTeam.Tactics.Tempo
	}
	return e.input.AwayTeam.Tactics.Tempo
}

func (e *Engine) nearestOpponentDistance(player *playerRuntime) float64 {
	nearest := math.MaxFloat64
	for i := range e.players {
		other := &e.players[i]
		if !other.state.Active || other.state.TeamID == player.state.TeamID {
			continue
		}
		distance := math.Hypot(other.state.Position.X-player.state.Position.X, other.state.Position.Z-player.state.Position.Z)
		if distance < nearest {
			nearest = distance
		}
	}
	return nearest
}

func (e *Engine) startPass(carrier *playerRuntime, team *domain.TeamStats) {
	target := e.pickPassTarget(carrier.state.TeamID, carrier.state.ID)
	if target == nil {
		return
	}
	e.startPassTo(carrier, team, target)
}

// startPassTo plays a pass from carrier to an already chosen target.
func (e *Engine) startPassTo(carrier *playerRuntime, team *domain.TeamStats, target *playerRuntime) {
	dx, dz := target.state.Position.X-e.ball.Position.X, target.state.Position.Z-e.ball.Position.Z
	distance := math.Hypot(dx, dz)
	if distance == 0 {
		return
	}
	if e.cfg.Rules.OffsideEnabled && e.isOffside(carrier, target) {
		e.emitWith(domain.EventOffside, target.state.ID, target.state.TeamID, carrier.state.ID)
		e.restartAfterFoul(e.opponentTeam(target.state.TeamID), false, target.state.Position)
		return
	}
	e.ball.Status, e.ball.CarrierID = "passing", ""
	e.ball.Velocity = domain.Vec3{X: dx / distance * 22, Z: dz / distance * 22}
	e.ballFlightTicks = int(math.Ceil(distance / (22 * float64(e.cfg.Timing.StepMs) / 1000)))
	e.shotTeamID, e.shotPlayerID, e.passTargetID, e.passOrigin = carrier.state.TeamID, carrier.state.ID, target.state.ID, e.ball.Position
	team.Passes++
	carrier.stats.Passes++
	e.emitWith(domain.EventPass, carrier.state.ID, carrier.state.TeamID, target.state.ID)
}

// startCross delivers a ball into the box, either from open play or from a
// corner (takeCorner passes the taker's Corners rating instead of the
// carrier's Crossing). deliverySkill is the delivery *execution* quality --
// distinct from crossDecisionRate's Crossing-based *decision* to cross at
// all -- and can send a poor delivery out of play before it ever reaches
// anyone, mirroring startShot's skill-scaled miss chance.
func (e *Engine) startCross(carrier *playerRuntime, team *domain.TeamStats, deliverySkill int) {
	target := e.nextTeammate(carrier.state.TeamID, carrier.state.ID)
	if target == nil {
		return
	}
	dx, dz := target.state.Position.X-e.ball.Position.X, target.state.Position.Z-e.ball.Position.Z
	distance := math.Hypot(dx, dz)
	if distance == 0 {
		return
	}
	team.Passes++
	carrier.stats.Passes++
	team.Crosses++
	carrier.stats.Crosses++
	e.emitWith(domain.EventCross, carrier.state.ID, carrier.state.TeamID, target.state.ID)
	waywardChance := math.Max(0.03, 0.30-0.012*float64(deliverySkill))
	if e.randomFloat() < waywardChance {
		e.ball.Status, e.ball.Velocity = "dead", domain.Vec3{}
		e.emitWith(domain.EventGoalKick, carrier.state.ID, carrier.state.TeamID, "")
		e.takeGoalKick(e.opponentTeam(carrier.state.TeamID))
		return
	}
	e.ball.Status, e.ball.CarrierID = "crossing", ""
	e.ball.Velocity = domain.Vec3{X: dx / distance * 18, Y: 5.5, Z: dz / distance * 18}
	e.ballFlightTicks = int(math.Ceil(distance / (18 * float64(e.cfg.Timing.StepMs) / 1000)))
	e.shotTeamID, e.shotPlayerID, e.passTargetID, e.passOrigin = carrier.state.TeamID, carrier.state.ID, target.state.ID, e.ball.Position
}

func (e *Engine) maybeFoul(carrier *playerRuntime) bool {
	if !e.cfg.Rules.FoulsEnabled || e.foulCooldownTicks > 0 {
		return false
	}
	pressure := e.pressureOn(carrier)
	chance := foulChancePerTick * pressure
	if e.inPenaltyArea(carrier) {
		// Defenders challenge more carefully in their own box.
		chance *= boxFoulFactor
	}
	if pressure == 0 || e.randomFloat() >= chance {
		return false
	}
	var fouler *playerRuntime
	best := math.MaxFloat64
	for i := range e.players {
		p := &e.players[i]
		if !p.state.Active || p.state.TeamID == carrier.state.TeamID {
			continue
		}
		d := math.Hypot(p.state.Position.X-carrier.state.Position.X, p.state.Position.Z-carrier.state.Position.Z)
		if d < best {
			best, fouler = d, p
		}
	}
	if fouler == nil {
		return false
	}
	spot := carrier.state.Position
	e.emitWith(domain.EventFoul, fouler.state.ID, fouler.state.TeamID, carrier.state.ID)
	if e.cfg.Rules.CardsEnabled && e.randomFloat() < cardedFoulShare {
		e.issueCard(fouler)
	}
	if e.cfg.Rules.InjuriesEnabled && e.randomFloat() < foulInjuryChance {
		e.injurePlayer(carrier)
	}
	e.restartAfterFoul(carrier.state.TeamID, e.inPenaltyArea(carrier), spot)
	return true
}

// Foul model (profile B1). foulChancePerTick at full pressure gives roughly
// 20-30 fouls per match; before B7 the rate was 0.003 with every foul
// carded and 6% injuring, which sent off several players and abandoned
// every full match once the B7 shape kept carriers under real pressure.
const (
	foulChancePerTick = 0.0004
	boxFoulFactor     = 0.04
	cardedFoulShare   = 0.2
	foulInjuryChance  = 0.02
)

const (
	tackleRangeM = 2.5
	// tackleAttemptRate (1/s) at zero distance; scaled down linearly with
	// distance inside tackleRangeM.
	tackleAttemptRate = 0.15
	// openPlayForwardWeight is nextTeammate's default preference for a
	// further-forward pass target (see nextTeammateBiased).
	openPlayForwardWeight = 0.3
)

// maybeTackle resolves a close-quarters challenge for the ball: a defender
// within tackleRangeM of the carrier can dispossess them, contested by the
// carrier's Dribbling against the defender's Tackling using the same
// win-probability shape as the aerial and reception duels. It runs after
// maybeFoul (a foul this tick pre-empts a tackle attempt) and before the
// carrier's own shot/cross/pass decision.
func (e *Engine) maybeTackle(carrier *playerRuntime) bool {
	if carrier.slot == "GK" {
		// A keeper in possession holds the ball in hand; the contest is
		// their distribution, not a tackle.
		return false
	}
	defender, distance := e.nearestActiveOpponent(carrier)
	if defender == nil || distance > tackleRangeM || defender.tackleCooldownTicks > 0 {
		return false
	}
	dt := float64(e.cfg.Timing.StepMs) / 1000
	proximity := 1 - distance/tackleRangeM
	if e.randomFloat() >= dt*tackleAttemptRate*proximity {
		return false
	}
	attacking := float64(carrier.attributes.Dribbling)
	defending := float64(defender.attributes.Tackling)
	if e.randomFloat() < attacking/(attacking+defending+1) {
		// The carrier's Dribbling share of the contest wins them the ball;
		// the beaten defender needs a moment before the next challenge.
		defender.tackleCooldownTicks = e.ticksFor(2000)
		return false
	}
	defender.tackleCooldownTicks = e.ticksFor(1000)
	// The dispossessed player is off balance: no instant counter-tackle.
	carrier.tackleCooldownTicks = e.ticksFor(1500)
	e.ball.Status, e.ball.CarrierID = "controlled", defender.state.ID
	e.ball.Velocity = domain.Vec3{}
	e.ball.Position = defender.state.Position
	e.ball.Position.Y = e.ball.Radius
	e.emitWith(domain.EventInterception, defender.state.ID, defender.state.TeamID, carrier.state.ID)
	return true
}

func (e *Engine) issueCard(player *playerRuntime) {
	if player.yellowCards == 0 {
		player.yellowCards++
		e.emitWith(domain.EventYellowCard, player.state.ID, player.state.TeamID, "")
		return
	}
	e.emitWith(domain.EventRedCard, player.state.ID, player.state.TeamID, "")
	player.sentOff = true
	e.standDown(player)
}

// injurePlayer leaves a replaceable slot until the next halftime window.
func (e *Engine) injurePlayer(player *playerRuntime) {
	if player.injury != nil {
		return
	}
	days := 7 + int(math.Round(player.state.Fatigue/20))
	player.injury = &domain.InjuryStatus{Reason: "match_injury", EstimatedRecoveryDays: days}
	e.emitWith(domain.EventInjury, player.state.ID, player.state.TeamID, "")
	e.standDown(player)
}

// standDown permanently removes an active player from the pitch (red card or
// injury) and checks whether either team has fallen below the minimum number
// of players to continue.
func (e *Engine) standDown(player *playerRuntime) {
	player.state.Active = false
	player.state.Velocity = domain.Vec3{}
	if e.ball.CarrierID == player.state.ID {
		e.giveBallToNearest(e.opponentTeam(player.state.TeamID))
	}
	e.checkAbandonment()
}

const minActivePlayers = 7

// ticksFor converts a duration in milliseconds into whole ticks (rounded up).
func (e *Engine) ticksFor(ms int) int {
	return int(math.Ceil(float64(ms) / float64(e.cfg.Timing.StepMs)))
}

func (e *Engine) activeCount(teamID string) int {
	count := 0
	for i := range e.players {
		if e.players[i].state.TeamID == teamID && e.players[i].state.Active {
			count++
		}
	}
	return count
}

// checkAbandonment enforces Law 3's minimum of seven players per side: if a
// team drops below that (red cards and/or injuries), the match cannot
// continue and is marked abandoned rather than allowed to run to a fake
// full-time. It is a no-op once the match is already over.
func (e *Engine) checkAbandonment() {
	if e.phase == domain.PhaseFinished || e.phase == domain.PhaseAbandoned {
		return
	}
	for _, team := range []domain.TeamInput{e.input.HomeTeam, e.input.AwayTeam} {
		if count := e.activeCount(team.ID); count < minActivePlayers {
			e.abandonReason = fmt.Sprintf("team %q has %d active players (< %d required)", team.ID, count, minActivePlayers)
			e.phase = domain.PhaseAbandoned
			e.emitWith(domain.EventMatchAbandoned, "", team.ID, "")
			return
		}
	}
}

func (e *Engine) restartAfterFoul(teamID string, penalty bool, spot domain.Vec3) {
	if e.cfg.Timing.AddedTimeMode == "tracked_delays" {
		e.periodAddedMs += 1000
		e.totalAddedMs += 1000
	}
	e.foulCooldownTicks = e.ticksFor(1000)
	if penalty {
		e.takePenalty(teamID)
		return
	}
	e.emitWith(domain.EventFreeKick, "", teamID, "")
	e.takeFreeKick(teamID, spot)
}

// restartAt places a dead ball at the actual restart location (the spot of
// the foul/offside, not an arbitrary teammate's current position) and hands
// it to the nearest active player of the restarting team, which is the part
// of "правильные рестарты" that free kicks and offside restarts share. What
// the team then does with it (dribble, pass, shoot) flows through the normal
// open-play decision logic in playBall — this engine has no set-piece
// wall/goalkeeper model for open-play free kicks near goal; only penalties
// (takePenalty) get a dedicated, uncontested resolution, since defenders are
// legally not allowed to contest those before the kick.
func (e *Engine) restartAt(teamID string, spot domain.Vec3) {
	e.ball.Position = spot
	e.ball.Position.Y = e.ball.Radius
	e.ball.Velocity = domain.Vec3{}
	e.ball.Status = "controlled"
	e.ball.CarrierID = ""
	var nearest *playerRuntime
	best := math.MaxFloat64
	for i := range e.players {
		p := &e.players[i]
		if p.state.TeamID != teamID || !p.state.Active {
			continue
		}
		d := math.Hypot(p.state.Position.X-spot.X, p.state.Position.Z-spot.Z)
		if d < best {
			best, nearest = d, p
		}
	}
	if nearest != nil {
		e.ball.CarrierID = nearest.state.ID
		// The taker walks over to the restart spot; otherwise playBall would
		// immediately resync the ball to wherever they already were on its
		// very next call, undoing the point of restarting at the foul spot.
		nearest.state.Position = spot
		nearest.state.Position.Y = 0
	}
}

// takePenalty resolves a penalty kick immediately and unconditionally as its
// own restart type: unlike a free kick, no defender may legally contest the
// ball before the kick, so this bypasses pressure/interception and the
// open-play decision pipeline entirely. The team's best PenaltyTaking player
// takes it, with a conversion chance grounded in that dedicated attribute
// rather than the general Finishing/LongShots split used for open-play shots.
func (e *Engine) takePenalty(teamID string) {
	e.emitWith(domain.EventPenalty, "", teamID, "")
	direction := e.attackDirection(teamID)
	spot := domain.Vec3{Y: e.cfg.Pitch.BallRadiusM, Z: direction * (e.cfg.Pitch.LengthM/2 - 11)}
	taker := e.bestPenaltyTaker(teamID)
	if taker == nil {
		// No eligible taker; should not happen while the team still clears
		// minActivePlayers, but never crash — leave a normal dead-ball
		// restart at the penalty spot instead of a contested kick.
		e.restartAt(teamID, spot)
		return
	}
	e.ball.Position = spot
	e.ball.Velocity = domain.Vec3{}
	e.ball.Status, e.ball.CarrierID = "controlled", taker.state.ID
	quality := float64(taker.attributes.PenaltyTaking) / 20
	accuracy := math.Min(0.98, 0.80+0.15*quality)
	taker.stats.Shots++
	e.teamStats[teamID].Shots++
	e.recordExpectedGoals(taker, 0.76)
	e.emitWith(domain.EventShot, taker.state.ID, teamID, "")
	e.shotPlayerID, e.shotTeamID = taker.state.ID, teamID
	if e.randomFloat() >= accuracy {
		e.emitWith(domain.EventGoalKick, taker.state.ID, teamID, "")
		e.takeGoalKick(e.opponentTeam(teamID))
		return
	}
	e.teamStats[teamID].ShotsOnTarget++
	// A penalty is the archetypal one-on-one: always contested with OneOnOnes,
	// regardless of the general open-play close-range distance threshold.
	if keeper := e.defendingKeeper(teamID); keeper != nil && e.randomFloat() < e.penaltySaveChance(keeper, taker.attributes.PenaltyTaking) {
		e.recordSave(keeper, taker.state.ID)
		e.takeGoalKick(e.opponentTeam(teamID))
		return
	}
	e.scoreGoal(teamID)
}

// bestByAttribute returns teamID's active player with the highest value of
// attr, breaking ties by lowest ID for reproducibility -- the shared shape
// behind bestPenaltyTaker/bestCornerTaker/bestFreeKickTaker.
func (e *Engine) bestByAttribute(teamID string, attr func(*playerRuntime) int) *playerRuntime {
	var best *playerRuntime
	bestValue := -1
	for i := range e.players {
		p := &e.players[i]
		if p.state.TeamID != teamID || !p.state.Active {
			continue
		}
		if v := attr(p); v > bestValue || (v == bestValue && (best == nil || p.state.ID < best.state.ID)) {
			best, bestValue = p, attr(p)
		}
	}
	return best
}

func (e *Engine) bestPenaltyTaker(teamID string) *playerRuntime {
	return e.bestByAttribute(teamID, func(p *playerRuntime) int { return p.attributes.PenaltyTaking })
}

func (e *Engine) bestCornerTaker(teamID string) *playerRuntime {
	return e.bestByAttribute(teamID, func(p *playerRuntime) int { return p.attributes.Corners })
}

func (e *Engine) bestFreeKickTaker(teamID string) *playerRuntime {
	return e.bestByAttribute(teamID, func(p *playerRuntime) int { return p.attributes.FreeKickTaking })
}

// inPenaltyArea reports whether player stands inside the penalty area they
// attack. The pre-B7 form subtracted LengthM/2 before applying direction,
// which for a team attacking -Z was true everywhere on the pitch.
func (e *Engine) inPenaltyArea(player *playerRuntime) bool {
	direction := e.attackDirection(player.state.TeamID)
	return direction*player.state.Position.Z >= e.cfg.Pitch.LengthM/2-16.5 && math.Abs(player.state.Position.X) <= 20.16
}

// inOwnPenaltyArea reports whether point lies inside teamID's own box.
func (e *Engine) inOwnPenaltyArea(teamID string, point domain.Vec3) bool {
	direction := e.attackDirection(teamID)
	return -direction*point.Z >= e.cfg.Pitch.LengthM/2-16.5 && math.Abs(point.X) <= 20.16
}

func (e *Engine) isOffside(carrier, target *playerRuntime) bool {
	direction := e.attackDirection(carrier.state.TeamID)
	ballProgress := direction * e.ball.Position.Z
	targetProgress := direction * target.state.Position.Z
	if targetProgress <= ballProgress {
		return false
	}
	defenderProgress := make([]float64, 0, 11)
	for i := range e.players {
		p := &e.players[i]
		if p.state.Active && p.state.TeamID != carrier.state.TeamID {
			defenderProgress = append(defenderProgress, direction*p.state.Position.Z)
		}
	}
	sort.Float64s(defenderProgress)
	if len(defenderProgress) < 2 {
		return false
	}
	return targetProgress > defenderProgress[len(defenderProgress)-2]+0.1
}

func (e *Engine) startShot(carrier *playerRuntime) {
	direction := e.attackDirection(carrier.state.TeamID)
	skill := e.shootingSkill(carrier)
	goalDistance := e.distanceToGoal(carrier)
	// Off-target chance grows with distance and pressure and falls with
	// the shooter's skill. Blocked shots are not modelled separately, so
	// "off target" also stands in for them; B7 calibrates this to roughly
	// 40-50% of shots on target rather than the pre-B7 ~85%.
	missChance := math.Max(0.10, math.Min(0.85, 0.44+0.014*(goalDistance-12)-0.014*float64(skill-10)+0.10*e.pressureOn(carrier)))
	e.shotTargetX = 0
	if e.randomFloat() < missChance {
		sign := 1.0
		if e.randomIntn(2) != 0 {
			sign = -1
		}
		e.shotTargetX = (e.cfg.Pitch.GoalWidthM/2 + 1) * sign
	}
	target := domain.Vec3{X: e.shotTargetX, Y: e.ball.Radius, Z: direction * e.cfg.Pitch.LengthM / 2}
	dx, dz := target.X-e.ball.Position.X, target.Z-e.ball.Position.Z
	distance := math.Hypot(dx, dz)
	if distance == 0 {
		return
	}
	speed := e.cfg.Physics.BallMaxSpeedMps
	e.ball.Status, e.ball.CarrierID = "flying", ""
	e.ball.Velocity = domain.Vec3{X: dx / distance * speed, Y: 0, Z: dz / distance * speed}
	e.ballFlightTicks = int(math.Ceil(distance / (speed * float64(e.cfg.Timing.StepMs) / 1000)))
	e.shotTeamID, e.shotPlayerID = carrier.state.TeamID, carrier.state.ID
	// Stored for saveChance's resolution later in advanceBall, once flight
	// ticks have elapsed and the shooter may have moved or been substituted
	// off -- the same reasoning as B5's shouldPress fix: decide from a
	// snapshot taken now, not a possibly-stale live lookup later.
	e.shotSkill, e.shotDistanceM = skill, e.distanceToGoal(carrier)
	e.teamStats[carrier.state.TeamID].Shots++
	carrier.stats.Shots++
	e.recordExpectedGoals(carrier, e.openPlayXG(carrier))
	e.emitWith(domain.EventShot, carrier.state.ID, carrier.state.TeamID, "")
}

// openPlayXG estimates the chance at the instant a shot is created. The
// later ball-flight/save RNG resolves the shot and never changes this value.
// The B7 form decays with distance (≈0.12 at 10 m, ≈0.045 at 20 m, ≈0.016
// at 30 m in front of goal), discounts wide angles and pressure, and lets the
// shooter's skill scale it moderately. It is a chance-quality heuristic that
// deliberately ignores the actual keeper; the B7 baseline records how the
// summed xG compares with realised goals.
func (e *Engine) openPlayXG(shooter *playerRuntime) float64 {
	distance := e.distanceToGoal(shooter)
	shooting := float64(e.shootingSkill(shooter)) / 20
	pressure := e.pressureOn(shooter)
	xg := 0.20 * math.Exp(-0.10*(distance-5)) * e.shotAngleFactor(shooter) * (1 - 0.3*pressure) * (0.75 + 0.5*shooting)
	return math.Max(0.01, math.Min(0.65, xg))
}

func (e *Engine) recordExpectedGoals(player *playerRuntime, xg float64) {
	player.stats.ExpectedGoals += xg
	e.teamStats[player.state.TeamID].ExpectedGoals += xg
}

func (e *Engine) advanceBall() {
	dt := float64(e.cfg.Timing.StepMs) / 1000
	previous := e.ball.Position
	e.ball.Position.X += e.ball.Velocity.X * dt
	e.ball.Position.Y += e.ball.Velocity.Y * dt
	e.ball.Position.Z += e.ball.Velocity.Z * dt
	e.ballFlightTicks--
	if (e.ball.Status == "passing" || e.ball.Status == "crossing") && e.ballFlightTicks <= 0 {
		if target := e.playerByID(e.passTargetID); target != nil && target.state.Active {
			if e.ball.Status == "crossing" {
				defender := e.nearestOpponent(target)
				keeperClaim := false
				// distanceToGoal(target) is the distance to the goal
				// target's team attacks, i.e. exactly the defending goal:
				// a cross landing this close to it is a claimable ball,
				// and the keeper (if present) contests instead of the
				// nearest outfield defender.
				if e.distanceToGoal(target) < 10 {
					if keeper := e.defendingKeeper(target.state.TeamID); keeper != nil {
						defender, keeperClaim = keeper, true
					}
				}
				target.stats.AerialDuels++
				if defender != nil {
					defender.stats.AerialDuels++
					e.emitWith(domain.EventAerialDuel, target.state.ID, target.state.TeamID, defender.state.ID)
				}
				attacking := float64(target.attributes.Heading) * (0.7 + 0.3*float64(target.attributes.JumpingReach)/20) * target.instructions.AerialDuel
				defending := 0.0
				if defender != nil {
					if keeperClaim {
						defending = float64(defender.attributes.AerialReach) * (0.7 + 0.3*float64(defender.attributes.CommandOfArea)/20)
					} else {
						defending = float64(defender.attributes.Heading) * (0.7 + 0.3*float64(defender.attributes.JumpingReach)/20) * defender.instructions.AerialDuel
					}
				}
				if defender != nil && e.randomFloat() >= attacking/(attacking+defending+1) {
					defender.stats.WonAerialDuels++
					e.ball.Status, e.ball.CarrierID = "controlled", defender.state.ID
					e.ball.Velocity = domain.Vec3{}
					e.ball.Position = defender.state.Position
					e.ball.Position.Y = e.ball.Radius
					e.emitWith(domain.EventInterception, defender.state.ID, defender.state.TeamID, target.state.ID)
					return
				}
				target.stats.WonAerialDuels++
				e.teamStats[target.state.TeamID].SuccessfulCrosses++
			} else if defender := e.nearestOpponent(target); defender != nil {
				// First touch under pressure: a defender close enough to
				// contest the reception (same radius as the aerial duel) can
				// win a loose ball before the attacker registers a clean
				// pass. No dedicated stat exists for this, mirroring plain
				// interceptions below, which also carry no counter beyond
				// the event.
				attacking := float64(target.attributes.FirstTouch)
				defending := float64(defender.attributes.Positioning)
				_, defenderDistance := e.nearestActiveOpponent(target)
				loseChance := 0.5 * defending / (attacking + defending) * math.Max(0, 1-defenderDistance/4)
				if e.randomFloat() < loseChance {
					e.ball.Status, e.ball.CarrierID = "controlled", defender.state.ID
					e.ball.Velocity = domain.Vec3{}
					e.ball.Position = defender.state.Position
					e.ball.Position.Y = e.ball.Radius
					e.emitWith(domain.EventInterception, defender.state.ID, defender.state.TeamID, target.state.ID)
					return
				}
			}
			e.ball.Status, e.ball.CarrierID = "controlled", target.state.ID
			e.ball.Velocity = domain.Vec3{}
			e.ball.Position = target.state.Position
			e.ball.Position.Y = e.ball.Radius
			e.teamStats[target.state.TeamID].SuccessfulPasses++
			if passer := e.playerByID(e.shotPlayerID); passer != nil {
				passer.stats.CompletedPasses++
			}
			e.emitWith(domain.EventReceive, target.state.ID, target.state.TeamID, e.shotPlayerID)
			return
		}
	}
	if p := e.interceptingPlayer(previous, e.ball.Position); p != nil && e.ballFlightTicks > 3 {
		e.ball.Status, e.ball.CarrierID = "controlled", p.state.ID
		e.ball.Velocity = domain.Vec3{}
		e.ball.Position = p.state.Position
		e.ball.Position.Y = e.ball.Radius
		e.emitWith(domain.EventInterception, p.state.ID, p.state.TeamID, "")
		return
	}
	direction := e.attackDirection(e.shotTeamID)
	goalLine := direction * e.cfg.Pitch.LengthM / 2
	if (direction > 0 && e.ball.Position.Z >= goalLine) || (direction < 0 && e.ball.Position.Z <= goalLine) || e.ballFlightTicks <= 0 {
		if e.ball.Status != "flying" || math.Abs(e.ball.Position.X) > e.cfg.Pitch.GoalWidthM/2 || e.ball.Position.Y > e.cfg.Pitch.GoalHeightM {
			wasShot := e.ball.Status == "flying"
			e.ball.Status, e.ball.Velocity = "dead", domain.Vec3{}
			if wasShot && e.randomFloat() < deflectedShotCornerChance {
				// Blocks and deflections are not modelled as contacts, so
				// a share of off-target shots leaves via a defender for a
				// corner instead of a goal kick.
				side := 1.0
				if e.ball.Position.X < 0 {
					side = -1
				}
				e.takeCorner(e.shotTeamID, side)
				return
			}
			e.emitWith(domain.EventGoalKick, e.shotPlayerID, e.shotTeamID, "")
			e.takeGoalKick(e.opponentTeam(e.shotTeamID))
			return
		}
		e.teamStats[e.shotTeamID].ShotsOnTarget++
		if keeper := e.defendingKeeper(e.shotTeamID); keeper != nil && e.randomFloat() < e.saveChance(keeper, e.shotSkill, e.shotDistanceM < 8, e.shotDistanceM) {
			e.recordSave(keeper, e.shotPlayerID)
			e.resolveSaveOutcome(keeper, direction)
			return
		}
		e.scoreGoal(e.shotTeamID)
		return
	}
	if math.Abs(e.ball.Position.X) > e.cfg.Pitch.WidthM/2 {
		spot := e.ball.Position
		e.ball.Status, e.ball.Velocity = "dead", domain.Vec3{}
		e.emitWith(domain.EventThrowIn, e.shotPlayerID, e.shotTeamID, "")
		e.takeThrowIn(e.opponentTeam(e.shotTeamID), spot)
	}
}

func (e *Engine) nearestOpponent(player *playerRuntime) *playerRuntime {
	nearest, best := e.nearestActiveOpponent(player)
	if best > 4 {
		return nil
	}
	return nearest
}

// nearestActiveOpponent returns the closest active opponent to player and
// the distance to them (math.MaxFloat64 if none are active), with no radius
// cutoff applied. Callers with their own radius (nearestOpponent's 4 m duel
// radius, maybeTackle's tighter tackle radius) apply it themselves.
func (e *Engine) nearestActiveOpponent(player *playerRuntime) (*playerRuntime, float64) {
	var nearest *playerRuntime
	best := math.MaxFloat64
	for i := range e.players {
		candidate := &e.players[i]
		if !candidate.state.Active || candidate.state.TeamID == player.state.TeamID {
			continue
		}
		distance := math.Hypot(candidate.state.Position.X-player.state.Position.X, candidate.state.Position.Z-player.state.Position.Z)
		if distance < best {
			best, nearest = distance, candidate
		}
	}
	return nearest, best
}

func (e *Engine) ballTeamID() string {
	if e.ball.CarrierID == "" {
		return e.shotTeamID
	}
	if p := e.playerByID(e.ball.CarrierID); p != nil {
		return p.state.TeamID
	}
	return ""
}

func (e *Engine) teamPressing(teamID string) float64 {
	if teamID == e.input.HomeTeam.ID {
		return e.input.HomeTeam.Tactics.Pressing
	}
	return e.input.AwayTeam.Tactics.Pressing
}

// interceptingPlayer finds an opponent on the ball's path this tick. The
// first passReleaseM of a pass are uncontestable -- the passer plays around
// a defender standing on top of them -- and a poorer passer leaves a wider
// interception window along the rest of the flight. Shots keep the tight
// 0.8 m window (a block).
func (e *Engine) interceptingPlayer(previous, current domain.Vec3) *playerRuntime {
	opponent := e.opponentTeam(e.shotTeamID)
	radius := 0.8
	if e.ball.Status == "passing" || e.ball.Status == "crossing" {
		if passer := e.playerByID(e.shotPlayerID); passer != nil {
			radius += 1.2 * (1 - float64(passer.attributes.Passing)/20)
		}
		if math.Hypot(current.X-e.passOrigin.X, current.Z-e.passOrigin.Z) < passReleaseM {
			return nil
		}
	}
	for i := range e.players {
		p := &e.players[i]
		if p.state.TeamID != opponent || !p.state.Active {
			continue
		}
		if pointSegmentDistance(p.state.Position, previous, current) <= radius {
			return p
		}
	}
	return nil
}

// passReleaseM is the length of the initial stretch of a pass that cannot be
// intercepted; deflectedShotCornerChance is the share of off-target shots
// that go out via a defender for a corner.
const (
	passReleaseM              = 2.5
	deflectedShotCornerChance = 0.35
)

func pointSegmentDistance(point, start, end domain.Vec3) float64 {
	dx, dz := end.X-start.X, end.Z-start.Z
	lengthSquared := dx*dx + dz*dz
	if lengthSquared == 0 {
		return math.Hypot(point.X-start.X, point.Z-start.Z)
	}
	t := ((point.X-start.X)*dx + (point.Z-start.Z)*dz) / lengthSquared
	if t < 0 {
		t = 0
	} else if t > 1 {
		t = 1
	}
	return math.Hypot(point.X-(start.X+t*dx), point.Z-(start.Z+t*dz))
}

func (e *Engine) scoreGoal(teamID string) {
	if teamID == e.input.HomeTeam.ID {
		e.score.Home++
	} else {
		e.score.Away++
	}
	e.teamStats[teamID].Goals++
	if p := e.playerByID(e.shotPlayerID); p != nil {
		p.stats.Goals++
	}
	e.emitWith(domain.EventGoal, e.shotPlayerID, teamID, "")
	e.ball.Status, e.ball.Velocity = "dead", domain.Vec3{}
	e.kickoff(e.opponentTeam(teamID))
}

func (e *Engine) playerByID(id string) *playerRuntime {
	for i := range e.players {
		if e.players[i].state.ID == id {
			return &e.players[i]
		}
	}
	return nil
}
func (e *Engine) nextTeammate(teamID, currentID string) *playerRuntime {
	return e.nextTeammateBiased(teamID, currentID, openPlayForwardWeight)
}

// nextTeammateBiased generalizes nextTeammate's forward-progress weight into
// a parameter: openPlayForwardWeight (nextTeammate's default) is what every
// open-play caller uses. A higher weight prefers a further-forward teammate
// more strongly, used by goal-kick/throw-in distribution to make a stronger
// Kicking/Throwing measurably more willing to go long. Openness is capped at
// openCapM so a keeper standing alone forty metres back does not outscore
// every forward option (B7).
func (e *Engine) nextTeammateBiased(teamID, currentID string, forwardWeight float64) *playerRuntime {
	ranked := e.rankedTeammates(teamID, currentID, forwardWeight)
	if len(ranked) == 0 {
		return nil
	}
	return ranked[0].player
}

type passOption struct {
	player *playerRuntime
	score  float64
}

// rankedTeammates scores every active teammate as a pass option and returns
// them best first. Openness (distance to the nearest opponent, capped at
// openCapM), forward progress (clamped, weighted by forwardWeight), a
// preferred pass length and a blocked-lane penalty make up the score.
// Iteration is stable and ties break by ID, so ranking never consumes RNG.
func (e *Engine) rankedTeammates(teamID, currentID string, forwardWeight float64) []passOption {
	carrier := e.playerByID(currentID)
	direction := e.attackDirection(teamID)
	// A distribution restart with a stronger forward weight (goal kick,
	// throw-in) also looks further: its progress cap and preferred length
	// scale with the weight, so a strong Kicking is measurably longer.
	scale := forwardWeight / openPlayForwardWeight
	progressCap, preferred := progressCapM*scale, preferredPassM*scale
	// The returned slice aliases a scratch buffer: it is valid until the
	// next ranking call, which every caller consumes it before.
	options := e.scratchOptions[:0]
	for i := range e.players {
		candidate := &e.players[i]
		if candidate.state.TeamID != teamID || candidate.state.ID == currentID || !candidate.state.Active {
			continue
		}
		open := e.nearestOpponentDistance(candidate)
		progress, passDistance, lanePenalty := 0.0, 0.0, 0.0
		if carrier != nil {
			progress = math.Max(-progressCap, math.Min(progressCap, direction*(candidate.state.Position.Z-carrier.state.Position.Z)))
			passDistance = math.Hypot(candidate.state.Position.X-carrier.state.Position.X, candidate.state.Position.Z-carrier.state.Position.Z)
			if e.laneBlocked(carrier, candidate) {
				lanePenalty = blockedLanePenalty
			}
		}
		score := math.Min(open, openCapM) + progress*forwardWeight - math.Abs(passDistance-preferred)*0.25 - lanePenalty
		options = append(options, passOption{candidate, score})
	}
	sort.Slice(options, func(i, j int) bool {
		if options[i].score != options[j].score {
			return options[i].score > options[j].score
		}
		return options[i].player.state.ID < options[j].player.state.ID
	})
	e.scratchOptions = options
	return options
}

// pickPassTarget chooses the actual recipient of a pass among the top
// ranked options with fixed weights, so play is not funnelled through the
// single best-scoring teammate every time (pre-B7 the two strikers could
// exchange 400 passes a match). It spends exactly one RNG draw and is only
// called when a pass is really being played.
func (e *Engine) pickPassTarget(teamID, currentID string) *playerRuntime {
	ranked := e.rankedTeammates(teamID, currentID, openPlayForwardWeight)
	if len(ranked) == 0 {
		return nil
	}
	roll := e.randomFloat()
	switch {
	case roll < 0.55 || len(ranked) < 2:
		return ranked[0].player
	case roll < 0.85 || len(ranked) < 3:
		return ranked[1].player
	default:
		return ranked[2].player
	}
}

// laneBlocked reports whether an opponent stands on the pass lane from
// carrier to candidate (within laneBlockM of the segment), ignoring the
// release zone right next to the carrier that startPass also exempts.
func (e *Engine) laneBlocked(carrier, candidate *playerRuntime) bool {
	start, end := carrier.state.Position, candidate.state.Position
	for i := range e.players {
		p := &e.players[i]
		if !p.state.Active || p.state.TeamID == carrier.state.TeamID {
			continue
		}
		if math.Hypot(p.state.Position.X-start.X, p.state.Position.Z-start.Z) < passReleaseM {
			continue
		}
		if pointSegmentDistance(p.state.Position, start, end) <= laneBlockM {
			return true
		}
	}
	return false
}

const (
	openCapM           = 10.0
	progressCapM       = 15.0
	preferredPassM     = 14.0
	laneBlockM         = 1.5
	blockedLanePenalty = 6.0
)

func (e *Engine) opponentTeam(teamID string) string {
	if teamID == e.input.HomeTeam.ID {
		return e.input.AwayTeam.ID
	}
	return e.input.HomeTeam.ID
}
func (e *Engine) attackDirection(teamID string) float64 {
	home := teamID == e.input.HomeTeam.ID
	if (home && e.period == 1) || (!home && e.period == 2) {
		return 1
	}
	return -1
}

func (e *Engine) emit(t domain.MatchEventType) {
	e.emitWith(t, "", "", "")
}

func (e *Engine) emitWith(t domain.MatchEventType, playerID, teamID, targetPlayerID string) {
	e.nextEventSeq++
	e.events = append(e.events, domain.MatchEvent{Sequence: e.nextEventSeq, Tick: e.tick, Period: e.period, PeriodElapsedMs: e.periodElapsedMs, Type: t, PlayerID: playerID, TeamID: teamID, TargetPlayerID: targetPlayerID})
}

func (e *Engine) Snapshot() domain.MatchSnapshot {
	players := make([]domain.PlayerState, 0, 22)
	for i := range e.players {
		if e.players[i].state.Active {
			players = append(players, e.players[i].state)
		}
	}
	return domain.MatchSnapshot{Tick: e.tick, Phase: e.phase, Period: e.period, PeriodElapsedMs: e.periodElapsedMs, AddedTimeMs: e.periodAddedMs, Score: e.score, Players: players, Ball: e.ball, LastEventSeq: e.nextEventSeq, AbandonReason: e.abandonReason}
}

func (e *Engine) Result() (domain.MatchResult, error) {
	if e.phase != domain.PhaseFinished && e.phase != domain.PhaseAbandoned {
		return domain.MatchResult{}, ErrMatchNotFinished
	}
	if err := e.ValidateInvariants(); err != nil {
		return domain.MatchResult{}, err
	}
	events := append([]domain.MatchEvent(nil), e.events...)
	teamStats := make([]domain.TeamStats, 0, len(e.teamStats))
	for _, id := range []string{e.input.HomeTeam.ID, e.input.AwayTeam.ID} {
		teamStats = append(teamStats, *e.teamStats[id])
	}
	playerStats := make([]domain.PlayerStats, 0, len(e.players))
	postMatchChanges := make([]domain.PostMatchPlayerChange, 0, len(e.players))
	for i := range e.players {
		s := e.players[i].stats
		s.Minutes = e.players[i].state.MinutesOnPit
		playerStats = append(playerStats, s)
		postMatchChanges = append(postMatchChanges, e.postMatchChange(&e.players[i]))
	}
	commandOutcomes := append([]domain.CommandOutcome(nil), e.commandOutcomes...)
	status, durationMs := "finished", 2*e.cfg.Timing.HalfDurationMs+e.totalAddedMs
	if e.phase == domain.PhaseAbandoned {
		status, durationMs = "abandoned", int(e.tick)*e.cfg.Timing.StepMs
	}
	return domain.MatchResult{Status: status, MatchID: e.input.MatchID, RulesProfile: e.input.RulesProfile, Score: e.score, Ticks: e.tick, DurationMs: durationMs, AddedTimeMs: e.totalAddedMs, AbandonReason: e.abandonReason, Events: events, TeamStats: teamStats, PlayerStats: playerStats, PostMatchChanges: postMatchChanges, CommandOutcomes: commandOutcomes}, nil
}

// postMatchChange deliberately scores only match facts. Age, morale and
// fatigue are not inputs to this rating, so no latent or double-counted
// modifier is exported to a future career layer.
func (e *Engine) postMatchChange(player *playerRuntime) domain.PostMatchPlayerChange {
	change := domain.PostMatchPlayerChange{PlayerID: player.state.ID, TeamID: player.state.TeamID}
	if player.state.MinutesOnPit > 0 {
		rating := 6.0 +
			0.80*float64(player.stats.Goals) +
			0.04*float64(player.stats.CompletedPasses) +
			0.10*float64(player.stats.Shots) +
			0.15*float64(player.stats.WonAerialDuels) +
			0.35*float64(player.stats.Saves) -
			0.25*float64(player.yellowCards)
		if player.sentOff && player.injury == nil {
			rating -= 0.75
		}
		rating = math.Max(1, math.Min(10, rating))
		change.Rating = &rating
	}
	if player.injury != nil {
		injury := *player.injury
		change.Injury = &injury
	}
	return change
}

func (e *Engine) Phase() domain.MatchPhase { return e.phase }

// IsPaused reports the explicit user pause state. Halftime is represented by
// PhaseHalfTime and is intentionally not treated as a user pause.
func (e *Engine) IsPaused() bool { return e.paused }

// Tactics returns an isolated copy of the current tactics for teamID.  It is
// intentionally a read-only observation point for runners such as the AI
// coach; tactical decisions remain ordinary commands applied by the engine.
func (e *Engine) Tactics(teamID string) (domain.Tactics, bool) {
	if teamID == e.input.HomeTeam.ID {
		return e.input.HomeTeam.Tactics, true
	}
	if teamID == e.input.AwayTeam.ID {
		return e.input.AwayTeam.Tactics, true
	}
	return domain.Tactics{}, false
}

// CoachView returns a read-only observation of the match for a coach policy
// (internal/coach). sinceEventSeq should be the LastEventSeq of the
// previous view this same policy observed (0 on the first call); only
// events with a strictly greater sequence are included in RecentEvents, so
// a policy never sees the same event twice. It never mutates engine state.
func (e *Engine) CoachView(sinceEventSeq int64) domain.CoachView {
	home, away := e.input.HomeTeam, e.input.AwayTeam
	playerInput := func(teamID, id string) domain.PlayerInput {
		team := home
		if teamID == away.ID {
			team = away
		}
		for _, cand := range team.Players {
			if cand.ID == id {
				return cand
			}
		}
		return domain.PlayerInput{}
	}
	players := make([]domain.PlayerCondition, 0, len(e.players))
	stats := make(map[string]domain.PlayerStats, len(e.players))
	for i := range e.players {
		p := &e.players[i]
		input := playerInput(p.state.TeamID, p.state.ID)
		players = append(players, domain.PlayerCondition{
			PlayerID: p.state.ID, TeamID: p.state.TeamID, Role: input.Role,
			AllowedPositions: append([]domain.Role(nil), input.AllowedPositions...),
			Slot:             p.slot, OnPitch: p.state.Active, EverPlayed: p.everPlayed,
			Fatigue: p.state.Fatigue, MinutesOnPit: p.state.MinutesOnPit,
			YellowCards: p.yellowCards, SentOff: p.sentOff, Injured: p.injury != nil,
		})
		stats[p.state.ID] = p.stats
	}
	var recent []domain.MatchEvent
	for _, ev := range e.events {
		if ev.Sequence > sinceEventSeq {
			recent = append(recent, ev)
		}
	}
	return domain.CoachView{
		Tick: e.tick, Phase: e.phase, Period: e.period, PeriodElapsedMs: e.periodElapsedMs, Score: e.score,
		HomeTeamID: home.ID, AwayTeamID: away.ID,
		Tactics:            map[string]domain.Tactics{home.ID: home.Tactics, away.ID: away.Tactics},
		SubstitutionsUsed:  map[string]int{home.ID: e.substitutions[home.ID], away.ID: e.substitutions[away.ID]},
		SubstitutionsLimit: e.cfg.Rules.SubstitutionsLimit,
		Players:            players,
		PlayerStats:        stats,
		RecentEvents:       recent,
		LastEventSeq:       e.nextEventSeq,
	}
}

func (e *Engine) HomeTeamID() string { return e.input.HomeTeam.ID }

func (e *Engine) AwayTeamID() string { return e.input.AwayTeam.ID }
func (e *Engine) Tick() int64        { return e.tick }
func (e *Engine) StepDuration() time.Duration {
	return time.Duration(e.cfg.Timing.StepMs) * time.Millisecond
}

func (e *Engine) EnableStateHash() { e.stateHashEnabled = true }

// ValidateInvariants checks consistency that must hold after every completed tick.
func (e *Engine) ValidateInvariants() error {
	if e.tick < 0 || e.period < 1 || e.period > 2 || e.periodElapsedMs < 0 {
		return fmt.Errorf("engine invariant: invalid clock state")
	}
	if e.score.Home < 0 || e.score.Away < 0 {
		return fmt.Errorf("engine invariant: negative score")
	}
	goalHome, goalAway := 0, 0
	for _, event := range e.events {
		if event.Type == domain.EventGoal {
			if event.TeamID == e.input.HomeTeam.ID {
				goalHome++
			} else if event.TeamID == e.input.AwayTeam.ID {
				goalAway++
			} else {
				return fmt.Errorf("engine invariant: goal has unknown team %q", event.TeamID)
			}
		}
	}
	if goalHome != e.score.Home || goalAway != e.score.Away {
		return fmt.Errorf("engine invariant: score %d-%d disagrees with goal events %d-%d", e.score.Home, e.score.Away, goalHome, goalAway)
	}
	for _, p := range e.players {
		if !finite(p.state.Position.X) || !finite(p.state.Position.Y) || !finite(p.state.Position.Z) || !finite(p.state.Fatigue) || !finite(p.state.MinutesOnPit) || !finite(p.state.DistanceM) {
			return fmt.Errorf("engine invariant: non-finite player state %q", p.state.ID)
		}
		if p.state.Fatigue < 0 || p.state.Fatigue > 100 || p.state.MinutesOnPit < 0 || p.state.DistanceM < 0 {
			return fmt.Errorf("engine invariant: invalid player state %q", p.state.ID)
		}
	}
	if !finite(e.ball.Position.X) || !finite(e.ball.Position.Y) || !finite(e.ball.Position.Z) || !finite(e.ball.Velocity.X) || !finite(e.ball.Velocity.Y) || !finite(e.ball.Velocity.Z) {
		return fmt.Errorf("engine invariant: non-finite ball state")
	}
	for _, stats := range e.teamStats {
		if stats.Goals > stats.ShotsOnTarget || stats.ShotsOnTarget > stats.Shots || stats.SuccessfulPasses > stats.Passes || stats.SuccessfulCrosses > stats.Crosses || stats.ExpectedGoals < 0 || math.IsNaN(stats.ExpectedGoals) || math.IsInf(stats.ExpectedGoals, 0) {
			return fmt.Errorf("engine invariant: invalid team statistics for %q", stats.TeamID)
		}
	}
	for i := range e.players {
		stats := e.players[i].stats
		if stats.CompletedPasses > stats.Passes || stats.ExpectedGoals < 0 || math.IsNaN(stats.ExpectedGoals) || math.IsInf(stats.ExpectedGoals, 0) {
			return fmt.Errorf("engine invariant: invalid player statistics for %q", stats.PlayerID)
		}
	}
	return nil
}

func finite(value float64) bool { return !math.IsNaN(value) && !math.IsInf(value, 0) }

func (e *Engine) randomFloat() float64 { e.rngCalls++; return e.rng.Float64() }
func (e *Engine) randomIntn(n int) int { e.rngCalls++; return e.rng.Intn(n) }

// StateHash includes observable state and hidden data that affects the next step.
func (e *Engine) StateHash() string {
	// playerRuntime has private fields, so encoding it directly produces {}.
	type hashPlayer struct {
		State               domain.PlayerState
		Slot                string
		Target              domain.Vec2
		Speed               float64
		Sharpness           float64
		Attributes          domain.PlayerAttributes
		Instructions        domain.PlayerInstructions
		Stats               domain.PlayerStats
		EverPlayed, SentOff bool
		YellowCards         int
		Injury              *domain.InjuryStatus
		TackleCooldownTicks int
	}
	players := make([]hashPlayer, len(e.players))
	for i, p := range e.players {
		players[i] = hashPlayer{p.state, p.slot, p.target, p.speed, p.sharpness, p.attributes, p.instructions, p.stats, p.everPlayed, p.sentOff, p.yellowCards, p.injury, p.tackleCooldownTicks}
	}
	type hashState struct {
		Snapshot                                       domain.MatchSnapshot
		Players                                        []hashPlayer
		Input                                          domain.MatchInput
		Config                                         config.Config
		Paused                                         bool
		TeamStats                                      map[string]*domain.TeamStats
		Substitutions                                  map[string]int
		Seed, RNGCalls                                 int64
		BallFlightTicks                                int
		ShotTeamID, ShotPlayerID, PassTargetID         string
		PassOrigin                                     domain.Vec3
		ShotSkill                                      int
		ShotDistanceM                                  float64
		LastCommandSeq                                 int64
		PeriodAddedMs, TotalAddedMs, FoulCooldownTicks int
	}
	b, _ := json.Marshal(hashState{Snapshot: e.Snapshot(), Players: players, Input: e.input, Config: e.cfg, Paused: e.paused, TeamStats: e.teamStats, Substitutions: e.substitutions, Seed: e.seed, RNGCalls: e.rngCalls, BallFlightTicks: e.ballFlightTicks, ShotTeamID: e.shotTeamID, ShotPlayerID: e.shotPlayerID, PassTargetID: e.passTargetID, PassOrigin: e.passOrigin, ShotSkill: e.shotSkill, ShotDistanceM: e.shotDistanceM, LastCommandSeq: e.lastCommandSeq, PeriodAddedMs: e.periodAddedMs, TotalAddedMs: e.totalAddedMs, FoulCooldownTicks: e.foulCooldownTicks})
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

func (e *Engine) defendingKeeper(attackingTeam string) *playerRuntime {
	return e.teamKeeper(e.opponentTeam(attackingTeam))
}

// teamKeeper returns teamID's own active goalkeeper, if any.
func (e *Engine) teamKeeper(teamID string) *playerRuntime {
	for i := range e.players {
		p := &e.players[i]
		if p.state.TeamID == teamID && p.state.Active && p.slot == "GK" {
			return p
		}
	}
	return nil
}

// saveChance is a bounded skill-based resolver, not a spatial reach model.
// closeRange (a genuine one-on-one, e.g. inside ~8m in open play, or always
// for a penalty) swaps the general Reflexes/Handling blend for
// Reflexes/OneOnOnes. shooterSkill (the shootingSkill used to create the
// shot, or PenaltyTaking for a penalty) makes a clinical finisher harder to
// save against, not just a matter of keeper skill in isolation.
func (e *Engine) saveChance(keeper *playerRuntime, shooterSkill int, closeRange bool, distanceM float64) float64 {
	blend := keeper.attributes.Handling
	if closeRange {
		blend = keeper.attributes.OneOnOnes
	}
	base := 0.60 + 0.30*(float64(keeper.attributes.Reflexes+blend)/40)
	base -= 0.12 * float64(shooterSkill) / 20
	base += 0.010 * (distanceM - 12)
	return math.Max(0.25, math.Min(0.92, base))
}

// penaltySaveChance is the keeper's chance against an on-target penalty:
// far lower than an open-play save, grounded in Reflexes/OneOnOnes against
// the taker's PenaltyTaking, so ~70-80% of penalties are converted.
func (e *Engine) penaltySaveChance(keeper *playerRuntime, penaltyTaking int) float64 {
	base := 0.18 + 0.15*(float64(keeper.attributes.Reflexes+keeper.attributes.OneOnOnes)/40)
	base -= 0.10 * float64(penaltyTaking) / 20
	return math.Max(0.05, math.Min(0.40, base))
}

func (e *Engine) recordSave(keeper *playerRuntime, shooterID string) {
	keeper.stats.Saves++
	e.emitWith(domain.EventSave, keeper.state.ID, keeper.state.TeamID, shooterID)
}

// nearestToSpot returns the closest active player of either team to spot,
// for a loose ball with no possession owner yet (e.g. a parried rebound).
func (e *Engine) nearestToSpot(spot domain.Vec3) *playerRuntime {
	var nearest *playerRuntime
	best := math.MaxFloat64
	for i := range e.players {
		p := &e.players[i]
		if !p.state.Active {
			continue
		}
		d := math.Hypot(p.state.Position.X-spot.X, p.state.Position.Z-spot.Z)
		if d < best {
			best, nearest = d, p
		}
	}
	return nearest
}

// resolveSaveOutcome splits a save into three outcomes instead of always
// sending the ball to a corner: a clean catch (Handling/CommandOfArea)
// keeps it with the keeper's team; otherwise it is parried either behind
// for a corner (attacking team keeps it, today's prior behavior) or into
// play as a short loose-ball rebound that either team's nearest active
// player can react to.
func (e *Engine) resolveSaveOutcome(keeper *playerRuntime, direction float64) {
	side := 1.0
	if e.ball.Position.X < 0 {
		side = -1
	}
	holdChance := 0.35 + 0.35*float64(keeper.attributes.Handling+keeper.attributes.CommandOfArea)/80
	roll := e.randomFloat()
	switch {
	case roll < holdChance:
		e.takeGoalKick(keeper.state.TeamID)
	case roll < holdChance+0.35:
		e.ball.Status, e.ball.Velocity = "dead", domain.Vec3{}
		e.takeCorner(e.shotTeamID, side)
	default:
		spot := domain.Vec3{Y: e.ball.Radius, Z: direction * (e.cfg.Pitch.LengthM/2 - 3)}
		e.ball.Status, e.ball.Velocity, e.ball.CarrierID = "controlled", domain.Vec3{}, ""
		e.ball.Position = spot
		if nearest := e.nearestToSpot(spot); nearest != nil {
			e.ball.CarrierID = nearest.state.ID
			nearest.state.Position = spot
			nearest.state.Position.Y = 0
		}
	}
}

// takeCorner places the ball at the actual corner arc (not wherever the
// attacking team's nearest player happens to stand) and delivers it via the
// team's best Corners player, reusing startCross -- a corner is a cross
// that starts from the flag instead of open play, and already resolves
// through the aerial-duel/goalkeeper-claim code for a ball dropping in the
// box, which is exactly the right mechanism for it.
func (e *Engine) takeCorner(attackingTeam string, side float64) {
	e.emitWith(domain.EventCorner, e.shotPlayerID, attackingTeam, "")
	direction := e.attackDirection(attackingTeam)
	spot := domain.Vec3{X: side * e.cfg.Pitch.WidthM / 2, Y: e.ball.Radius, Z: direction * e.cfg.Pitch.LengthM / 2}
	taker := e.bestCornerTaker(attackingTeam)
	if taker == nil {
		e.restartAt(attackingTeam, spot)
		return
	}
	taker.state.Position = spot
	taker.state.Position.Y = 0
	e.ball.Position = spot
	e.ball.CarrierID = taker.state.ID
	e.ball.Status = "controlled"
	e.startCross(taker, e.teamStats[attackingTeam], taker.attributes.Corners)
}

// takeFreeKick prefers the team's best FreeKickTaking player over the
// nearest one when the restart is within shooting range of goal; beyond
// that range it falls back to restartAt's plain nearest-player pickup
// unchanged -- a free kick deep in a team's own half isn't a "pick your
// specialist" moment the way one on the edge of the box is. Reached for
// both real fouls and offside restarts via restartAfterFoul: an offside
// restart is essentially always far from the offside team's own attacking
// goal, so the distance gate self-selects without needing to distinguish
// the caller.
func (e *Engine) takeFreeKick(teamID string, spot domain.Vec3) {
	direction := e.attackDirection(teamID)
	goalDistance := math.Hypot(spot.X, direction*e.cfg.Pitch.LengthM/2-spot.Z)
	if goalDistance < 30 {
		if taker := e.bestFreeKickTaker(teamID); taker != nil {
			taker.state.Position = spot
			taker.state.Position.Y = 0
			e.ball.Position = spot
			e.ball.Position.Y = e.ball.Radius
			e.ball.Velocity = domain.Vec3{}
			e.ball.Status, e.ball.CarrierID = "controlled", taker.state.ID
			return
		}
	}
	e.restartAt(teamID, spot)
}

// takeGoalKick gives the team's own keeper the restart (not whichever
// player happens to sort first by ID) and delivers a pass to a teammate
// chosen with a Kicking-scaled forward bias -- a stronger kicker is
// measurably more willing to go long. Falls back to a plain handoff if the
// team has no keeper on the pitch (sent off/injured with no replacement) or
// no reachable teammate.
func (e *Engine) takeGoalKick(teamID string) {
	keeper := e.teamKeeper(teamID)
	if keeper == nil {
		e.giveBallToNearest(teamID)
		return
	}
	e.ball.Position = keeper.state.Position
	e.ball.Position.Y = e.ball.Radius
	e.ball.Velocity = domain.Vec3{}
	e.ball.Status, e.ball.CarrierID = "controlled", keeper.state.ID
	target := e.nextTeammateBiased(teamID, keeper.state.ID, openPlayForwardWeight+0.03*float64(keeper.attributes.Kicking))
	if target == nil {
		return
	}
	dx, dz := target.state.Position.X-e.ball.Position.X, target.state.Position.Z-e.ball.Position.Z
	distance := math.Hypot(dx, dz)
	if distance == 0 {
		return
	}
	const speed = 22.0
	e.ball.Status, e.ball.CarrierID = "passing", ""
	e.ball.Velocity = domain.Vec3{X: dx / distance * speed, Z: dz / distance * speed}
	e.ballFlightTicks = int(math.Ceil(distance / (speed * float64(e.cfg.Timing.StepMs) / 1000)))
	e.shotTeamID, e.shotPlayerID, e.passTargetID, e.passOrigin = teamID, keeper.state.ID, target.state.ID, e.ball.Position
	e.teamStats[teamID].Passes++
	keeper.stats.Passes++
	e.emitWith(domain.EventPass, keeper.state.ID, teamID, target.state.ID)
}

// takeThrowIn hands the ball to the nearest active player of teamID to spot
// (restartAt's existing pickup -- realistic, a throw is taken by whoever is
// there, not by summoning the best thrower) and then delivers it with a
// Throwing-scaled forward bias, instead of the ball simply materializing
// with no distribution at all.
func (e *Engine) takeThrowIn(teamID string, spot domain.Vec3) {
	e.restartAt(teamID, spot)
	thrower := e.playerByID(e.ball.CarrierID)
	if thrower == nil {
		return
	}
	target := e.nextTeammateBiased(teamID, thrower.state.ID, openPlayForwardWeight+0.03*float64(thrower.attributes.Throwing))
	if target == nil {
		return
	}
	dx, dz := target.state.Position.X-spot.X, target.state.Position.Z-spot.Z
	distance := math.Hypot(dx, dz)
	if distance == 0 {
		return
	}
	const speed = 14.0
	e.ball.Status, e.ball.CarrierID = "passing", ""
	e.ball.Velocity = domain.Vec3{X: dx / distance * speed, Z: dz / distance * speed}
	e.ballFlightTicks = int(math.Ceil(distance / (speed * float64(e.cfg.Timing.StepMs) / 1000)))
	e.shotTeamID, e.shotPlayerID, e.passTargetID, e.passOrigin = teamID, thrower.state.ID, target.state.ID, e.ball.Position
	e.teamStats[teamID].Passes++
	thrower.stats.Passes++
	e.emitWith(domain.EventPass, thrower.state.ID, teamID, target.state.ID)
}
