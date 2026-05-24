import type { BallState, BallPhysicsConfig, KickParams, PresetOptions } from './types'

// ─── Constants ───────────────────────────────────────────────────────────────

export const BALL_RADIUS_M = 0.11
const STOP_THRESHOLD = 0.07  // m/s total speed

const DEFAULTS: Required<BallPhysicsConfig> = {
    gravity: 9.81,
    airDrag: 0.988,
    spinDecay: 0.992,
    magnusStrength: 0.00038,
    bounciness: 0.62,
    groundFriction: 0.80,
    trailLength: 45,
    fieldWidth: 105,
    fieldHeight: 68,
}

// ─── State factories ──────────────────────────────────────────────────────────

export function createBallState(x = 52.5, y = 34, z = 0): BallState {
    return {
        x, y, z,
        vx: 0, vy: 0, vz: 0,
        spin: 0,
        wx: 0, wy: 0, wz: 0,
        trail: [],
        isMoving: false,
        bounces: 0,
    }
}

export function kickBall(ball: BallState, params: KickParams): BallState {
    return {
        ...ball,
        vx: params.vx,
        vy: params.vy,
        vz: params.vz,
        wx: params.wx ?? 0,
        wy: params.wy ?? 0,
        wz: params.wz ?? 0,
        z: Math.max(ball.z, BALL_RADIUS_M + 0.01),
        isMoving: true,
        trail: [],
        bounces: 0,
        kickType: params.kickType,
    }
}

// ─── Physics step ─────────────────────────────────────────────────────────────
//
// Magnus effect formula:
//   F_magnus = k * (ω × v)
//
// Where ω is the spin vector (wx, wy, wz) and v is velocity (vx, vy, vz).
// Cross product ω × v:
//   x: wy*vz - wz*vy
//   y: wz*vx - wx*vz
//   z: wx*vy - wy*vx
//
// This is what bends the ball — a ball spinning clockwise (wz < 0) while
// traveling in +X gets a force pushing it in +Y (right curl), matching
// real-world freekick physics exactly.

export function stepBall(ball: BallState, dt: number, cfg: BallPhysicsConfig = {}): BallState {
    const {
        gravity, airDrag, spinDecay, magnusStrength,
        bounciness, groundFriction, trailLength, fieldWidth, fieldHeight,
    } = { ...DEFAULTS, ...cfg }

    if (!ball.isMoving) return ball

    const safeDt = Math.min(dt, 0.05)

    let { vx, vy, vz, wx, wy, wz } = ball

    // ── Magnus force (ω × v) ──────────────────────────────────────────────────
    // Applied every frame proportional to dt and spin magnitude
    const magnusX = (wy * vz - wz * vy) * magnusStrength * safeDt * 60
    const magnusY = (wz * vx - wx * vz) * magnusStrength * safeDt * 60
    const magnusZ = (wx * vy - wy * vx) * magnusStrength * safeDt * 60

    vx += magnusX
    vy += magnusY
    vz += magnusZ

    // ── Gravity ───────────────────────────────────────────────────────────────
    vz -= gravity * safeDt

    // ── Air drag ──────────────────────────────────────────────────────────────
    const drag = Math.pow(airDrag, safeDt * 60)
    vx *= drag
    vy *= drag
    vz *= drag

    // ── Spin decay (spin fades as ball travels through air) ──────────────────
    const sd = Math.pow(spinDecay, safeDt * 60)
    wx *= sd
    wy *= sd
    wz *= sd

    // ── Integrate position ────────────────────────────────────────────────────
    let x = ball.x + vx * safeDt
    let y = ball.y + vy * safeDt
    let z = ball.z + vz * safeDt

    // ── Visual spin angle (just for pentagon animation) ───────────────────────
    const speed2d = Math.sqrt(vx * vx + vy * vy)
    const spin = ball.spin + speed2d * safeDt * 3.5

    let bounces = ball.bounces

    // ── Ground collision ──────────────────────────────────────────────────────
    if (z <= BALL_RADIUS_M && vz < 0) {
        z = BALL_RADIUS_M
        vz = -vz * bounciness
        vx *= groundFriction
        vy *= groundFriction
        // Sidespin partially transfers to ground roll
        wx *= 0.4
        wy *= 0.4
        wz *= 0.6
        if (Math.abs(vz) < 0.25) vz = 0
        bounces++
    }

    // ── Field boundary ────────────────────────────────────────────────────────
    if (x < BALL_RADIUS_M)               { x = BALL_RADIUS_M;              vx =  Math.abs(vx) * 0.4 }
    if (x > fieldWidth - BALL_RADIUS_M)  { x = fieldWidth - BALL_RADIUS_M; vx = -Math.abs(vx) * 0.4 }
    if (y < BALL_RADIUS_M)               { y = BALL_RADIUS_M;              vy =  Math.abs(vy) * 0.4 }
    if (y > fieldHeight - BALL_RADIUS_M) { y = fieldHeight - BALL_RADIUS_M; vy = -Math.abs(vy) * 0.4 }

    // ── Stop condition ────────────────────────────────────────────────────────
    const totalSpeed = Math.sqrt(vx * vx + vy * vy + vz * vz)
    const isMoving = totalSpeed > STOP_THRESHOLD || z > BALL_RADIUS_M + 0.05

    const trail = [...ball.trail, { x, y, z }].slice(-trailLength)

    return {
        x, y, z, vx, vy, vz,
        wx, wy, wz,
        spin, trail, isMoving, bounces,
        kickType: ball.kickType,
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jitter(amount: number): number {
    return (Math.random() - 0.5) * 2 * amount
}

// Convert 0–20 power to m/s in a given range
function powerToSpeed(power: number, min: number, max: number): number {
    return min + (power / 20) * (max - min)
}

// ─── Kick presets ─────────────────────────────────────────────────────────────

/** Short or long ground pass, driven along the surface */
export function makePassKick({ power, directionRad, noise = 0.05 }: PresetOptions): KickParams {
    const spd = powerToSpeed(power, 4, 22)
    const dir = directionRad + jitter(noise * 0.08)
    return {
        vx: spd * Math.cos(dir),
        vy: spd * Math.sin(dir),
        vz: 0.5 + jitter(0.15),
        wx: -30,  // slight topspin — keeps ball on ground faster
        kickType: 'pass',
    }
}

/** High lofted ball / switch of play */
export function makeLobKick({ power, directionRad, noise = 0.04 }: PresetOptions): KickParams {
    const spd = powerToSpeed(power, 8, 24)
    const launch = 0.55 + jitter(noise * 0.1)  // ~32°
    const dir = directionRad + jitter(noise * 0.06)
    return {
        vx: spd * Math.cos(launch) * Math.cos(dir),
        vy: spd * Math.cos(launch) * Math.sin(dir),
        vz: spd * Math.sin(launch),
        wx: 15,   // mild topspin — drops faster at end of arc
        kickType: 'lob',
    }
}

/** Driven shot — low flat trajectory */
export function makeShotKick({ power, directionRad, noise = 0.06, side = 'right' }: PresetOptions): KickParams {
    const spd = powerToSpeed(power, 12, 34)
    const launch = 0.10 + Math.random() * 0.10
    const dir = directionRad + jitter(noise * 0.07)
    const curl = side === 'right' ? -8 : 8  // slight natural curl from instep
    return {
        vx: spd * Math.cos(launch) * Math.cos(dir),
        vy: spd * Math.cos(launch) * Math.sin(dir),
        vz: spd * Math.sin(launch),
        wz: curl + jitter(3),
        kickType: 'shot',
    }
}

/** Steep chip — lobbed over a keeper */
export function makeChipKick({ power, directionRad, noise = 0.05 }: PresetOptions): KickParams {
    const spd = powerToSpeed(power, 5, 16)
    const launch = 0.85 + jitter(noise * 0.05)  // ~48° — very steep
    const dir = directionRad + jitter(noise * 0.06)
    return {
        vx: spd * Math.cos(launch) * Math.cos(dir),
        vy: spd * Math.cos(launch) * Math.sin(dir),
        vz: spd * Math.sin(launch),
        wx: -20,  // backspin — ball "sits down" on landing
        kickType: 'chip',
    }
}

/**
 * Freekick curl — classic Beckham/Roberto Carlos style.
 * Ball rises, then bends dramatically around the wall.
 *
 * wz is the main curl axis. Positive = bends left (from shooter POV),
 * negative = bends right.
 *
 * side: 'right' foot → natural curl is left-to-right (wz < 0 for +X travel)
 *       'left'  foot → natural curl is right-to-left (wz > 0)
 */
export function makeFreekickCurl({ power, directionRad, side = 'right', noise = 0.03 }: PresetOptions): KickParams {
    const spd = powerToSpeed(power, 18, 30)
    const launch = 0.28 + jitter(noise * 0.05)  // ~16° — rises over wall
    const dir = directionRad + jitter(noise * 0.04)

    // Strong sidespin — this is what bends the ball
    const curlBase = side === 'right' ? -120 : 120
    const wz = curlBase + jitter(15)

    // Slight topspin adds a late dip
    const wx = 25 + jitter(5)

    return {
        vx: spd * Math.cos(launch) * Math.cos(dir),
        vy: spd * Math.cos(launch) * Math.sin(dir),
        vz: spd * Math.sin(launch),
        wx,
        wz,
        kickType: 'freekick_curl',
    }
}

/**
 * Knuckleball freekick — almost no spin, unpredictable swerve.
 * Think Cristiano Ronaldo. The ball moves erratically because
 * we add oscillating noise each frame (simulated here with tiny random spin).
 */
export function makeFreekickKnuckleball({ power, directionRad, noise = 0.02 }: PresetOptions): KickParams {
    const spd = powerToSpeed(power, 22, 33)
    const launch = 0.18 + jitter(noise * 0.04)
    const dir = directionRad + jitter(noise * 0.03)

    // Very low spin — the knuckleball effect
    // We add tiny random wz/wy to simulate air pressure instability
    const wz = jitter(12)
    const wy = jitter(8)

    return {
        vx: spd * Math.cos(launch) * Math.cos(dir),
        vy: spd * Math.cos(launch) * Math.sin(dir),
        vz: spd * Math.sin(launch),
        wz,
        wy,
        kickType: 'freekick_knuckleball',
    }
}

/**
 * Freekick topspin — dipping drive.
 * Strong topspin (wx > 0) makes the ball dip sharply under the crossbar.
 * Used for low driven freekicks that dip late.
 */
export function makeFreekickTopspin({ power, directionRad, side = 'right', noise = 0.03 }: PresetOptions): KickParams {
    const spd = powerToSpeed(power, 20, 32)
    const launch = 0.22 + jitter(noise * 0.04)
    const dir = directionRad + jitter(noise * 0.035)
    const wx = 90 + jitter(10)   // heavy topspin = heavy dip
    const curl = side === 'right' ? -25 : 25  // small curl — mostly topspin

    return {
        vx: spd * Math.cos(launch) * Math.cos(dir),
        vy: spd * Math.cos(launch) * Math.sin(dir),
        vz: spd * Math.sin(launch),
        wx,
        wz: curl,
        kickType: 'freekick_topspin',
    }
}

/**
 * Corner inswinger — ball curls toward the goal mouth.
 * Taken from left corner → curls right (wz < 0 moving in +X).
 * Taken from right corner → curls left (wz > 0 moving in +X).
 */
export function makeCornerInswing({ power, directionRad, side = 'left', noise = 0.04 }: PresetOptions): KickParams {
    const spd = powerToSpeed(power, 14, 22)
    const launch = 0.40 + jitter(noise * 0.05)
    const dir = directionRad + jitter(noise * 0.05)
    const wz = side === 'left' ? -80 : 80   // inswing = toward goal
    const wx = 10

    return {
        vx: spd * Math.cos(launch) * Math.cos(dir),
        vy: spd * Math.cos(launch) * Math.sin(dir),
        vz: spd * Math.sin(launch),
        wx,
        wz,
        kickType: 'corner_inswing',
    }
}

/**
 * Corner outswinger — ball curls away from keeper, toward the far post.
 * Harder to catch, designed for a flick-on at the near post.
 */
export function makeCornerOutswing({ power, directionRad, side = 'left', noise = 0.04 }: PresetOptions): KickParams {
    const spd = powerToSpeed(power, 14, 22)
    const launch = 0.42 + jitter(noise * 0.05)
    const dir = directionRad + jitter(noise * 0.05)
    const wz = side === 'left' ? 80 : -80   // outswing = away from keeper
    const wx = 10

    return {
        vx: spd * Math.cos(launch) * Math.cos(dir),
        vy: spd * Math.cos(launch) * Math.sin(dir),
        vz: spd * Math.sin(launch),
        wx,
        wz,
        kickType: 'corner_outswing',
    }
}

/**
 * Volley — explosive contact with a ball already in the air.
 * Low launch angle, very high speed, heavy topspin drives it down.
 */
export function makeVolleyKick({ power, directionRad, noise = 0.08 }: PresetOptions): KickParams {
    const spd = powerToSpeed(power, 15, 36)
    const launch = 0.05 + jitter(noise * 0.1)
    const dir = directionRad + jitter(noise * 0.1)
    const wx = 60 + jitter(15)   // drives ball down sharply

    return {
        vx: spd * Math.cos(launch) * Math.cos(dir),
        vy: spd * Math.cos(launch) * Math.sin(dir),
        vz: spd * Math.sin(launch),
        wx,
        kickType: 'volley',
    }
}

/**
 * Header — low speed, steep angle, mostly vertical momentum converted.
 * Slight topspin from downward head motion.
 */
export function makeHeaderKick({ power, directionRad, noise = 0.10 }: PresetOptions): KickParams {
    const spd = powerToSpeed(power, 4, 14)
    const launch = 0.15 + jitter(noise * 0.1)
    const dir = directionRad + jitter(noise * 0.12)

    return {
        vx: spd * Math.cos(launch) * Math.cos(dir),
        vy: spd * Math.cos(launch) * Math.sin(dir),
        vz: spd * Math.sin(launch) - 2,  // usually slightly downward
        wx: 20,
        kickType: 'header',
    }
}

/**
 * Rabona — cross-legged kick.
 * Produces a heavy outswinging curl in the opposite direction to the kicking foot.
 * Mechanically same as freekick curl but opposite wz and high noise (harder to control).
 */
export function makeRabonaKick({ power, directionRad, side = 'right', noise = 0.12 }: PresetOptions): KickParams {
    const spd = powerToSpeed(power, 10, 22)
    const launch = 0.35 + jitter(noise * 0.1)
    const dir = directionRad + jitter(noise * 0.1)
    // Opposite curl to natural foot direction
    const wz = side === 'right' ? 100 : -100

    return {
        vx: spd * Math.cos(launch) * Math.cos(dir),
        vy: spd * Math.cos(launch) * Math.sin(dir),
        vz: spd * Math.sin(launch),
        wz,
        wx: 15,
        kickType: 'rabona',
    }
}

/**
 * Trivela (outside of the boot) — used by Quaresma, Di Maria.
 * Opposite curl to instep: right foot → curls right.
 * Medium speed, distinctive rising trajectory.
 */
export function makeTrivelaKick({ power, directionRad, side = 'right', noise = 0.08 }: PresetOptions): KickParams {
    const spd = powerToSpeed(power, 12, 24)
    const launch = 0.30 + jitter(noise * 0.08)
    const dir = directionRad + jitter(noise * 0.07)
    // Opposite to instep curl
    const wz = side === 'right' ? 95 : -95

    return {
        vx: spd * Math.cos(launch) * Math.cos(dir),
        vy: spd * Math.cos(launch) * Math.sin(dir),
        vz: spd * Math.sin(launch),
        wz,
        wx: -10,  // slight backspin — ball "floats" a bit
        kickType: 'trivela',
    }
}