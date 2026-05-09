/**
 * MATCH BALANCE CONFIGURATION
 * These constants control the "feel" and realism of the game.
 * They are separated from pure physics to allow for easier tuning.
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
    PASS_FORCE_BASE: 8,
    SHOT_FORCE_BASE: 12,
    
    // Timing
    GOAL_PAUSE_TICKS: 300,     // 5 seconds
    ACTION_COOLDOWN_MIN: 90,   // 1.5 seconds
    ACTION_COOLDOWN_MAX: 180,  // 3 seconds
    
    // Attributes impact
    SPEED_ATTR_FACTOR: 0.02,   
    FINISHING_FORCE_FACTOR: 0.06,
    
    // Realism Multipliers
    GLOBAL_XG_MULTIPLIER: 0.45, // Boosted for more goals
} as const;
