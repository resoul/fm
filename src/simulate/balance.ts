/**
 * MATCH BALANCE CONFIGURATION
 * These constants control the "feel" and realism of the game.
 * They are separated from pure physics to allow for easier tuning.
 *
 * ── WHY PASSES WERE TOO FAST ──────────────────────────────
 * Previous: ACTION_COOLDOWN_MIN = 90 ticks applied only to the PASSER.
 * The RECEIVER had NO cooldown, so could instantly re-pass on ball pickup.
 * Result: 3-4 passes in 5 seconds (unrealistic — in real football a
 * short pass takes ~1.5-2 seconds including control + decision time).
 *
 * Fix:
 *   PASS_RECEIVER_CONTROL_MIN/MAX — cooldown added to receiver when ball
 *   arrives, simulating "first touch + look up" time.
 *
 * Realistic pass sequence at 60fps:
 *   passer decision:     90-150 ticks (1.5-2.5s)
 *   ball flight:         15-30  ticks (0.25-0.5s)
 *   receiver control:    45-80  ticks (0.75-1.3s)
 *   ─────────────────────────────────────────────
 *   total per pass:      150-260 ticks (~2.5-4.3s) ✓
 *
 * ── ERROR MODEL (4.4) ─────────────────────────────────────
 * Passes and shots are now inexact. The actual kick target is offset
 * by a random vector whose magnitude depends on:
 *   - skill attribute (passing / finishing / longShots)
 *   - nearby defenders (pressure)
 *   - player fatigue
 *   - distance (longer = larger absolute error window)
 *
 * Tuning guide:
 *   PASS_ERROR_MAX_RADIUS    — increase for sloppier passes overall
 *   PASS_ERROR_PRESSURE_*    — increase to punish playing under pressure
 *   SHOT_ERROR_MAX_RADIUS    — increase for more off-target shots
 *   *_WILD_THRESHOLD         — raise the bar for "wild" label in events
 */
export const BALANCE = {
    // Movement
    PLAYER_MAX_SPEED_BASE: 5.8,
    PLAYER_ACCELERATION: 0.35,
    PLAYER_DRIBBLE_SPEED_FACTOR: 0.75,
    PLAYER_FRICTION: 0.82,

    // Physicality
    CONTROL_RANGE: 18,
    TACKLE_RANGE: 22,
    TACKLE_COOLDOWN: 50,

    // Kicking
    KICK_MIN_FORCE: 4,
    KICK_MAX_FORCE: 18,
    PASS_FORCE_BASE: 7,        // Slightly lower: ball takes longer to arrive
    SHOT_FORCE_BASE: 12,

    // ── Timing (at 60fps: 60 ticks = 1 second) ──────────
    GOAL_PAUSE_TICKS: 300,     // 5 seconds

    // Passer decision cooldown: how long before PASSER can act again
    ACTION_COOLDOWN_MIN: 90,   // 1.5 seconds minimum
    ACTION_COOLDOWN_MAX: 150,  // 2.5 seconds (was 180 = too long, caused hold spam)

    // RECEIVER first touch: critical fix for pass spam.
    // Applied to the receiver when they pick up the ball.
    // Simulates: trap → look up → evaluate options.
    PASS_RECEIVER_CONTROL_MIN: 45,  // 0.75s (clean first touch, alert player)
    PASS_RECEIVER_CONTROL_MAX: 80,  // 1.3s  (needs extra touch, under pressure)

    // Attributes impact
    SPEED_ATTR_FACTOR: 0.02,
    FINISHING_FORCE_FACTOR: 0.06,

    // Realism Multipliers
    GLOBAL_XG_MULTIPLIER: 0.45, // Boosted for more goals

    // ── Zone system ──────────────────────────────────────
    // How strongly players blend their movement toward zone centre
    // 0 = ignore zones entirely, 1 = snap instantly
    ZONE_PULL_STRENGTH: 0.35,

    // Out-of-possession: players beyond their leash get speed boost
    ZONE_RECOVERY_SPEED_BOOST: 1.25,

    // ── Error Model — Passing (4.4) ───────────────────────
    //
    // Max positional offset (px) for a completely inaccurate pass (skill=0,
    // under full pressure, exhausted). Real passes by good players land ~3-8px
    // off target; bad players under pressure can miss by 20-35px.
    PASS_ERROR_MAX_RADIUS: 35,

    // How much each nearby defender adds to the inaccuracy (0..1 scale)
    PASS_ERROR_PRESSURE_FACTOR: 0.12,

    // How much full fatigue adds to inaccuracy
    PASS_ERROR_FATIGUE_FACTOR: 0.15,

    // Distance normalisation: at this distance the error radius is doubled
    PASS_ERROR_DISTANCE_NORM: 200,
    // How aggressively distance scales error (0 = no scaling, 1 = linear)
    PASS_ERROR_DISTANCE_SCALE: 0.5,

    // Thresholds for labelling a pass as poor or wild in event descriptions
    // (in world units / px)
    PASS_ERROR_POOR_THRESHOLD: 10,  // "loose pass" label
    PASS_ERROR_WILD_THRESHOLD: 22,  // "wayward pass" label — receiver cooldown skipped

    // ── Error Model — Shooting (4.4) ──────────────────────
    //
    // Larger than pass error: a shot aimed at the top-left corner can
    // realistically sail just wide or just over.
    SHOT_ERROR_MAX_RADIUS: 55,

    SHOT_ERROR_PRESSURE_FACTOR: 0.15,
    SHOT_ERROR_FATIGUE_FACTOR: 0.12,

    // Long shots (outside ~60px from goal) receive extra error
    SHOT_ERROR_LONG_SHOT_FACTOR: 1.4,

    // Thresholds for labelling shot quality in event descriptions
    SHOT_ERROR_TAME_THRESHOLD: 12,  // "straight at keeper"
    SHOT_ERROR_WILD_THRESHOLD: 30,  // "blazes it wide"
} as const;