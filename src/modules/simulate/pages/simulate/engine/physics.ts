import type { Ball, Player, Vec2, FieldDimensions } from "./types.ts";

// ── Constants ─────────────────────────────────────────────
export const PHYSICS = {
    BALL_FRICTION: 0.985,        // per-frame velocity decay
    BALL_AIR_FRICTION: 0.995,    // less friction in air
    BALL_BOUNCE_DECAY: 0.55,     // energy lost on bounce
    BALL_GRAVITY: 0.18,          // downward acceleration
    BALL_MIN_SPEED: 0.05,        // stop threshold
    BALL_RADIUS: 6,
    PLAYER_RADIUS: 9,
    PLAYER_MAX_SPEED_BASE: 4.2,  // pixels/frame at speed=100
    PLAYER_ACCELERATION: 0.22,
    PLAYER_DRIBBLE_SPEED_FACTOR: 0.72,
    PLAYER_FRICTION: 0.82,       // player decel when no input
    CONTROL_RANGE: 18,           // px: player can pick up ball
    DRIBBLE_DISTANCE: 14,        // ball offset from player
    KICK_MIN_FORCE: 4,
    KICK_MAX_FORCE: 18,
} as const;

// ── Vec2 helpers ──────────────────────────────────────────
export function vec2(x: number, y: number): Vec2 { return { x, y }; }
export function addVec(a: Vec2, b: Vec2): Vec2 { return { x: a.x + b.x, y: a.y + b.y }; }
export function subVec(a: Vec2, b: Vec2): Vec2 { return { x: a.x - b.x, y: a.y - b.y }; }
export function scaleVec(v: Vec2, s: number): Vec2 { return { x: v.x * s, y: v.y * s }; }
export function lenVec(v: Vec2): number { return Math.sqrt(v.x * v.x + v.y * v.y); }
export function distVec(a: Vec2, b: Vec2): number { return lenVec(subVec(a, b)); }
export function normVec(v: Vec2): Vec2 {
    const l = lenVec(v);
    if (l < 0.0001) return { x: 0, y: 0 };
    return { x: v.x / l, y: v.y / l };
}
export function lerpVec(a: Vec2, b: Vec2, t: number): Vec2 {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
export function dotVec(a: Vec2, b: Vec2): number { return a.x * b.x + a.y * b.y; }
export function perpVec(v: Vec2): Vec2 { return { x: -v.y, y: v.x }; }
export function clampVec(v: Vec2, maxLen: number): Vec2 {
    const l = lenVec(v);
    if (l > maxLen) return scaleVec(normVec(v), maxLen);
    return v;
}

// ── RNG ───────────────────────────────────────────────────
let _seed = Date.now();
export function rng(): number {
    _seed = (_seed * 1664525 + 1013904223) & 0xffffffff;
    return ((_seed >>> 0) / 0xffffffff);
}
export function rngRange(min: number, max: number): number {
    return min + rng() * (max - min);
}
export function rngInt(min: number, max: number): number {
    return Math.floor(rngRange(min, max + 1));
}
export function rngBool(probability = 0.5): boolean {
    return rng() < probability;
}

// ── Ball Physics ──────────────────────────────────────────
export class BallPhysics {
    constructor(private field: FieldDimensions) {}

    update(ball: Ball): void {
        // If owned, skip free physics
        if (ball.ownerPlayerId !== null) return;

        // Apply gravity when airborne
        if (ball.height > 0) {
            ball.heightVel -= PHYSICS.BALL_GRAVITY;
            ball.height += ball.heightVel;
            if (ball.height <= 0) {
                ball.height = 0;
                ball.heightVel = -ball.heightVel * PHYSICS.BALL_BOUNCE_DECAY;
                if (Math.abs(ball.heightVel) < 0.3) {
                    ball.heightVel = 0;
                    ball.state = "rolling";
                } else {
                    ball.state = "air";
                }
                // Slow ground speed on bounce
                ball.vel = scaleVec(ball.vel, 0.8);
            }
        }

        // Apply friction
        const friction = ball.height > 0 ? PHYSICS.BALL_AIR_FRICTION : PHYSICS.BALL_FRICTION;
        ball.vel = scaleVec(ball.vel, friction);

        // Stop micro-movement
        if (lenVec(ball.vel) < PHYSICS.BALL_MIN_SPEED) {
            ball.vel = { x: 0, y: 0 };
            ball.state = "ground";
        }

        // Move ball
        ball.pos = addVec(ball.pos, ball.vel);

        // Wall bounces (side lines)
        const margin = PHYSICS.BALL_RADIUS;
        const fw = this.field.width;
        const fh = this.field.height;

        // Side line bounce
        if (ball.pos.y < margin) {
            ball.pos.y = margin;
            ball.vel.y = Math.abs(ball.vel.y) * 0.6;
        } else if (ball.pos.y > fh - margin) {
            ball.pos.y = fh - margin;
            ball.vel.y = -Math.abs(ball.vel.y) * 0.6;
        }

        // Goal line handling — goals scored in MatchEngine
        // Clamp x loosely so ball doesn't escape far
        const goalHalf = this.field.goalWidth / 2;
        const goalLeft = fh / 2 - goalHalf;
        const goalRight = fh / 2 + goalHalf;

        if (ball.pos.x < -this.field.goalDepth) {
            ball.pos.x = -this.field.goalDepth;
            ball.vel.x = Math.abs(ball.vel.x) * 0.3;
        }
        if (ball.pos.x > fw + this.field.goalDepth) {
            ball.pos.x = fw + this.field.goalDepth;
            ball.vel.x = -Math.abs(ball.vel.x) * 0.3;
        }
    }

    /** Kick ball with given direction and force */
    kick(ball: Ball, direction: Vec2, force: number, loftAngle = 0): void {
        const dir = normVec(direction);
        ball.vel = scaleVec(dir, force);
        ball.ownerPlayerId = null;
        ball.height = 0;
        ball.heightVel = force * Math.sin(loftAngle);
        ball.state = loftAngle > 0 ? "air" : "rolling";
        // Reduce x/y by cos factor when lofted
        if (loftAngle > 0) {
            const hFactor = Math.cos(loftAngle);
            ball.vel = scaleVec(dir, force * hFactor);
        }
    }

    /** Add random deviation to pass/shot (inaccuracy) */
    addInaccuracy(direction: Vec2, inaccuracyAngle: number): Vec2 {
        const angle = Math.atan2(direction.y, direction.x);
        const deviation = rngRange(-inaccuracyAngle, inaccuracyAngle);
        const newAngle = angle + deviation;
        return { x: Math.cos(newAngle), y: Math.sin(newAngle) };
    }

    /** Check if position is inside goal */
    isGoal(pos: Vec2, field: FieldDimensions): TeamSide | null {
        const goalHalfW = field.goalWidth / 2;
        const centerY = field.height / 2;
        const inGoalY = pos.y > centerY - goalHalfW && pos.y < centerY + goalHalfW;

        if (pos.x < 0 && inGoalY) return "away";  // ball in left goal = away scores
        if (pos.x > field.width && inGoalY) return "home"; // ball in right goal = home scores
        return null;
    }

    /** Prediction: where will the ball be in N frames? */
    predictPosition(ball: Ball, frames: number): Vec2 {
        if (ball.ownerPlayerId !== null) return { ...ball.pos };
        let pos = { ...ball.pos };
        let vel = { ...ball.vel };
        for (let i = 0; i < frames; i++) {
            vel = scaleVec(vel, PHYSICS.BALL_FRICTION);
            pos = addVec(pos, vel);
        }
        return pos;
    }
}

// ── Player Movement Physics ───────────────────────────────
export class PlayerPhysics {
    getMaxSpeed(player: Player): number {
        const base = PHYSICS.PLAYER_MAX_SPEED_BASE;
        const speedFactor = 0.6 + (player.attributes.speed / 100) * 0.4;
        const fatigueFactor = 1 - player.fatigue * 0.35;
        return base * speedFactor * fatigueFactor;
    }

    /** Move player toward target with smooth acceleration */
    moveToward(player: Player, dt = 1): void {
        const diff = subVec(player.targetPos, player.pos);
        const dist = lenVec(diff);

        if (dist < 1.5) {
            player.vel = scaleVec(player.vel, PHYSICS.PLAYER_FRICTION);
            if (lenVec(player.vel) < 0.1) player.vel = { x: 0, y: 0 };
            return;
        }

        const maxSpd = this.getMaxSpeed(player) * (player.hasBall ? PHYSICS.PLAYER_DRIBBLE_SPEED_FACTOR : 1);
        const dir = normVec(diff);
        const desiredVel = scaleVec(dir, maxSpd);
        // Smooth acceleration
        const acc = PHYSICS.PLAYER_ACCELERATION;
        player.vel = {
            x: player.vel.x + (desiredVel.x - player.vel.x) * acc,
            y: player.vel.y + (desiredVel.y - player.vel.y) * acc,
        };
        player.vel = clampVec(player.vel, maxSpd);
        player.pos = addVec(player.pos, scaleVec(player.vel, dt));
    }

    /** Update fatigue over time */
    updateFatigue(player: Player): void {
        const effort = lenVec(player.vel) / PHYSICS.PLAYER_MAX_SPEED_BASE;
        const staminaFactor = 0.3 + (player.attributes.stamina / 100) * 0.7;
        const fatigueRate = 0.0001 * effort / staminaFactor;
        const recoveryRate = 0.00005 * staminaFactor;
        if (effort > 0.1) {
            player.fatigue = Math.min(1, player.fatigue + fatigueRate);
        } else {
            player.fatigue = Math.max(0, player.fatigue - recoveryRate);
        }
    }

    /** Keep player within valid field zones */
    clampToField(player: Player, field: FieldDimensions, margin = 8): void {
        player.pos.x = Math.max(margin, Math.min(field.width - margin, player.pos.x));
        player.pos.y = Math.max(margin, Math.min(field.height - margin, player.pos.y));
        player.targetPos.x = Math.max(margin, Math.min(field.width - margin, player.targetPos.x));
        player.targetPos.y = Math.max(margin, Math.min(field.height - margin, player.targetPos.y));
    }
}