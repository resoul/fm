// ============================================================
// PLAYER AI SYSTEM — Decision making for all 22 players
// ============================================================

import type { Player, Ball, Team, FieldDimensions, AIDecision, Vec2 } from "./types";
import {
    distVec, normVec, subVec, addVec, scaleVec,
    lerpVec, rng, rngRange, rngBool, rngInt,
    PHYSICS, vec2,
} from "./physics.ts";

// ── AI Constants ──────────────────────────────────────────
const AI = {
    SHOOT_RANGE: 160,           // max distance to attempt shot
    SHOOT_RANGE_GK: 280,        // GK shoot range (clearance)
    PASS_RANGE: 220,            // max pass distance
    PASS_MIN_RANGE: 30,         // min pass distance
    TACKLE_RANGE: 16,           // range to attempt tackle
    PRESSURE_RANGE: 40,         // when defender presses carrier
    SUPPORT_DISTANCE: 80,       // ideal teammate spacing
    OFFSIDE_MARGIN: 14,
    GOAL_CHANCE_BASE: 0.55,     // base prob to shoot if in range
    PASS_CHANCE_BASE: 0.62,
    DECISION_INTERVAL_MIN: 18,  // frames between AI decisions
    DECISION_INTERVAL_MAX: 35,
    FREE_ZONE_SAMPLES: 8,       // rays to test for free zones
} as const;

// ── Helper: find player by id ─────────────────────────────
function findPlayer(teams: [Team, Team], id: string): Player | undefined {
    for (const team of teams) {
        const p = team.players.find(pl => pl.id === id);
        if (p) return p;
    }
}

// ── Helper: nearest enemy ─────────────────────────────────
function nearestEnemy(player: Player, enemies: Player[]): Player | null {
    let best: Player | null = null;
    let bestDist = Infinity;
    for (const e of enemies) {
        const d = distVec(player.pos, e.pos);
        if (d < bestDist) { bestDist = d; best = e; }
    }
    return best;
}

// ── Helper: is player in shooting position ────────────────
function isInShootingPosition(
    player: Player,
    field: FieldDimensions,
    attackingRight: boolean
): boolean {
    const goalX = attackingRight ? field.width : 0;
    const dist = Math.abs(player.pos.x - goalX);
    const maxRange = player.position === "GK" ? AI.SHOOT_RANGE_GK : AI.SHOOT_RANGE;
    return dist < maxRange;
}

// ── Helper: best pass target ─────────────────────────────
function findBestPassTarget(
    player: Player,
    teammates: Player[],
    enemies: Player[],
    field: FieldDimensions,
    attackingRight: boolean
): Player | null {
    const goalX = attackingRight ? field.width : 0;
    let best: Player | null = null;
    let bestScore = -Infinity;

    for (const tm of teammates) {
        if (tm.id === player.id) continue;
        const dist = distVec(player.pos, tm.pos);
        if (dist < AI.PASS_MIN_RANGE || dist > AI.PASS_RANGE) continue;

        // Score = forward progress toward goal - pressure on receiver
        const forward = attackingRight
            ? (tm.pos.x - player.pos.x) / field.width
            : (player.pos.x - tm.pos.x) / field.width;

        // How open is receiver?
        let minEnemyDist = Infinity;
        for (const e of enemies) {
            const ed = distVec(tm.pos, e.pos);
            if (ed < minEnemyDist) minEnemyDist = ed;
        }
        const openness = Math.min(minEnemyDist / 80, 1);

        // Prefer passes toward goal
        const goalDist = Math.abs(tm.pos.x - goalX);
        const goalProximity = 1 - goalDist / field.width;

        const score = forward * 0.4 + openness * 0.35 + goalProximity * 0.25 + rng() * 0.15;
        if (score > bestScore) { bestScore = score; best = tm; }
    }
    return best;
}

// ── Helper: find free zone to move into ──────────────────
function findFreeZone(
    player: Player,
    enemies: Player[],
    teammates: Player[],
    field: FieldDimensions,
    attackingRight: boolean
): Vec2 {
    const goalX = attackingRight ? field.width : 0;
    let bestPos = player.targetPos;
    let bestScore = -Infinity;

    const samples = AI.FREE_ZONE_SAMPLES;
    const spread = 80 + rng() * 60;

    for (let i = 0; i < samples; i++) {
        const angle = (i / samples) * Math.PI * 2;
        const candidate: Vec2 = {
            x: Math.max(20, Math.min(field.width - 20, player.pos.x + Math.cos(angle) * spread)),
            y: Math.max(20, Math.min(field.height - 20, player.pos.y + Math.sin(angle) * spread)),
        };

        // Score the candidate position
        let minEnemyDist = Infinity;
        for (const e of enemies) {
            const d = distVec(candidate, e.pos);
            if (d < minEnemyDist) minEnemyDist = d;
        }
        let minTeamDist = Infinity;
        for (const t of teammates) {
            if (t.id === player.id) continue;
            const d = distVec(candidate, t.pos);
            if (d < minTeamDist) minTeamDist = d;
        }

        const openness = Math.min(minEnemyDist / 50, 1);
        const spread_score = Math.min(minTeamDist / AI.SUPPORT_DISTANCE, 1);
        const forward = attackingRight
            ? (candidate.x - player.pos.x) / field.width
            : (player.pos.x - candidate.x) / field.width;

        const score = openness * 0.4 + spread_score * 0.3 + forward * 0.3;
        if (score > bestScore) { bestScore = score; bestPos = candidate; }
    }

    return bestPos;
}

// ── Helper: defensive position ────────────────────────────
function getDefensivePosition(
    player: Player,
    ball: Ball,
    field: FieldDimensions,
    attackingRight: boolean
): Vec2 {
    const slots = getFormationSlot(player, field, attackingRight);
    // Shift toward ball when defending
    const toBall = subVec(ball.pos, slots);
    const shift = Math.min(distVec(slots, ball.pos) * 0.35, 60);
    return addVec(slots, scaleVec(normVec(toBall), shift));
}

// ── Approximate formation home position ───────────────────
function getFormationSlot(player: Player, field: FieldDimensions, attackingRight: boolean): Vec2 {
    // Use player's initial target as formation anchor
    return { ...player.targetPos };
}

// ── Goalkeeper AI ─────────────────────────────────────────
function goalkeeperAI(
    player: Player,
    ball: Ball,
    enemies: Player[],
    field: FieldDimensions,
    attackingRight: boolean
): AIDecision {
    const goalX = attackingRight ? 0 : field.width;
    const goalCenterY = field.height / 2;
    const ballDist = distVec(player.pos, ball.pos);

    // GK has ball → kick upfield
    if (player.hasBall || ball.ownerPlayerId === player.id) {
        const targetX = attackingRight ? field.width * 0.45 : field.width * 0.55;
        return {
            action: "clearance",
            targetPos: { x: targetX, y: goalCenterY + rngRange(-40, 40) },
            force: 14,
        };
    }

    // Ball coming toward goal → intercept
    if (ballDist < 120) {
        const interceptY = Math.max(
            goalCenterY - field.goalWidth / 2 + 10,
            Math.min(goalCenterY + field.goalWidth / 2 - 10, ball.pos.y)
        );
        return {
            action: "move",
            targetPos: { x: goalX + (attackingRight ? 18 : -18), y: interceptY },
        };
    }

    // Default: position between ball and goal
    const guardX = goalX + (attackingRight ? 22 : -22);
    const guardY = goalCenterY + (ball.pos.y - goalCenterY) * 0.4;
    return {
        action: "move",
        targetPos: { x: guardX, y: Math.max(goalCenterY - 40, Math.min(goalCenterY + 40, guardY)) },
    };
}

// ── With Ball AI ──────────────────────────────────────────
function withBallAI(
    player: Player,
    ball: Ball,
    teammates: Player[],
    enemies: Player[],
    field: FieldDimensions,
    attackingRight: boolean
): AIDecision {
    const pressureLevel = enemies.filter(e => distVec(player.pos, e.pos) < AI.PRESSURE_RANGE).length;
    const inShooting = isInShootingPosition(player, field, attackingRight);

    // Under heavy pressure → pass immediately
    if (pressureLevel >= 2 && rng() < 0.75) {
        const target = findBestPassTarget(player, teammates, enemies, field, attackingRight);
        if (target) return { action: "pass", targetPlayerId: target.id };
    }

    // Shooting opportunity
    if (inShooting) {
        const shootProb = AI.GOAL_CHANCE_BASE * (player.attributes.shooting / 80);
        if (pressureLevel === 0 && rng() < shootProb + 0.15) {
            return { action: "shoot" };
        } else if (rng() < shootProb - pressureLevel * 0.15) {
            return { action: "shoot" };
        }
    }

    // Try to pass
    if (rng() < AI.PASS_CHANCE_BASE) {
        const target = findBestPassTarget(player, teammates, enemies, field, attackingRight);
        if (target) return { action: "pass", targetPlayerId: target.id };
    }

    // Dribble toward goal
    const goalX = attackingRight ? field.width : 0;
    const toGoal = normVec({ x: goalX - player.pos.x, y: field.height / 2 - player.pos.y });
    return {
        action: "dribble",
        targetPos: addVec(player.pos, scaleVec(toGoal, 40)),
    };
}

// ── Without Ball — outfield ───────────────────────────────
function withoutBallAI(
    player: Player,
    ball: Ball,
    teammates: Player[],
    enemies: Player[],
    field: FieldDimensions,
    attackingRight: boolean
): AIDecision {
    const ballOwnerEnemy = enemies.find(e => e.hasBall);
    const ballOwnerTeam = teammates.find(t => t.hasBall);
    const ballDist = distVec(player.pos, ball.pos);
    const noBallOwner = ball.ownerPlayerId === null;

    // Chase loose ball if close enough
    if (noBallOwner && ballDist < 100 + rng() * 50) {
        return { action: "move", targetPos: { ...ball.pos } };
    }

    // Defending: press ball carrier or mark enemy
    if (ballOwnerEnemy) {
        const isDef = ["GK", "CB", "LB", "RB"].includes(player.position);
        const isMid = ["CM", "LM", "RM", "CAM"].includes(player.position);

        if (isDef || isMid) {
            const defPos = getDefensivePosition(player, ball, field, attackingRight);
            const distToCarrier = distVec(player.pos, ballOwnerEnemy.pos);

            // Close enough to tackle
            if (distToCarrier < AI.PRESSURE_RANGE * 1.8 && (isDef || rng() < 0.5)) {
                if (distToCarrier < AI.TACKLE_RANGE * 1.5) {
                    return { action: "defend", targetPlayerId: ballOwnerEnemy.id };
                }
                return { action: "move", targetPos: ballOwnerEnemy.pos };
            }
            return { action: "move", targetPos: defPos };
        }
    }

    // Attacking: find free zone or make run
    if (ballOwnerTeam) {
        // Only forward players make runs
        const isForward = ["ST", "LW", "RW", "CAM"].includes(player.position);
        if (isForward || rng() < 0.3) {
            const freeZone = findFreeZone(player, enemies, teammates, field, attackingRight);
            return { action: "move", targetPos: freeZone };
        }
    }

    // Default: return to formation position with slight drift
    const slot = getFormationSlot(player, field, attackingRight);
    const drift: Vec2 = {
        x: slot.x + rngRange(-15, 15),
        y: slot.y + rngRange(-15, 15),
    };
    return { action: "reposition", targetPos: drift };
}

// ── MAIN AI UPDATE ────────────────────────────────────────
export function updatePlayerAI(
    player: Player,
    ball: Ball,
    ownTeam: Team,
    enemyTeam: Team,
    field: FieldDimensions,
): AIDecision | null {
    // Cooldown: only decide every N frames
    if (player.actionCooldown > 0) {
        player.actionCooldown--;
        return null;
    }
    player.actionCooldown = rngInt(AI.DECISION_INTERVAL_MIN, AI.DECISION_INTERVAL_MAX);

    const teammates = ownTeam.players.filter(p => p.id !== player.id);
    const enemies = enemyTeam.players;
    const attackingRight = ownTeam.id === "home";

    if (player.position === "GK") {
        return goalkeeperAI(player, ball, enemies, field, attackingRight);
    }

    if (player.hasBall || ball.ownerPlayerId === player.id) {
        return withBallAI(player, ball, teammates, enemies, field, attackingRight);
    }

    return withoutBallAI(player, ball, teammates, enemies, field, attackingRight);
}

export { AI, findBestPassTarget, isInShootingPosition };