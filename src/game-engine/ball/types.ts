export type BallState = {
    // World position in meters
    x: number
    y: number
    z: number
    // Velocity in m/s
    vx: number
    vy: number
    vz: number
    // Visual rotation angle (radians) — pentagon spin animation
    spin: number
    // Magnus spin vector (rad/s) — physically curves the ball in flight
    // wx: topspin(+) / backspin(-)  → deflects in Y/Z
    // wy: sidespin                   → deflects in X/Z
    // wz: curl left(+) / right(-)   → main freekick curl axis
    wx: number
    wy: number
    wz: number
    // Trail
    trail: Array<{ x: number; y: number; z: number }>
    // Status
    isMoving: boolean
    bounces: number
    kickType?: KickType
}

export type KickParams = {
    vx: number
    vy: number
    vz: number
    // Magnus spin in rad/s — omit for straight ball
    wx?: number
    wy?: number
    wz?: number
    kickType?: KickType
}

export type KickType =
    | 'pass'
    | 'lob'
    | 'shot'
    | 'chip'
    | 'freekick_curl'
    | 'freekick_knuckleball'
    | 'freekick_topspin'
    | 'corner_inswing'
    | 'corner_outswing'
    | 'volley'
    | 'header'
    | 'rabona'
    | 'trivela'

export type BallPhysicsConfig = {
    gravity?: number         // m/s², default 9.81
    airDrag?: number         // velocity drag per frame, default 0.988
    spinDecay?: number       // Magnus spin decay per frame, default 0.992
    magnusStrength?: number  // Magnus force scale factor, default 0.00035
    bounciness?: number      // 0–1, default 0.62
    groundFriction?: number  // horizontal damping on bounce, default 0.80
    trailLength?: number     // default 45
    fieldWidth?: number      // meters, default 105
    fieldHeight?: number     // meters, default 68
}

export type PresetOptions = {
    power: number          // 0–20 player skill
    directionRad: number   // radians from +X axis
    side?: 'left' | 'right'
    noise?: number         // 0–1 imprecision
}