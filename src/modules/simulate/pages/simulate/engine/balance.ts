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
} as const;