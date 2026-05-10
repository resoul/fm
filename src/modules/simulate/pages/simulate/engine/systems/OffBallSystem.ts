/**
 * OffBallSystem — 2.1 Off-ball Intelligence
 *
 * Runs each tick AFTER TacticalSystem (which populates SpaceAwareness data).
 * For every off-ball outfield player it decides which run type to make
 * and stores a typed OffBallIntent on the player via a new command.
 *
 * Run types:
 *   support_run      — move into a passing angle, moderate depth
 *   overlap_run      — wide player sprints beyond ball carrier's line
 *   underlap_run     — wide player cuts inside to create pocket
 *   third_man_run    — blind run into depth to receive layoff
 *   defensive_recovery — sprint back goal-side (used in transition_defend)
 *   hold_shape       — stay in formation anchor (set piece / no useful run)
 *
 * The run target is stored in player.offBallTarget (see types.ts extension).
 * MovementSystem already reads player.nextDecision.target, so we emit a
 * SET_PLAYER_DECISION command of type "move" / "defend" with the run target.
 * This integrates cleanly with the existing pipeline — no new resolver needed.
 *
 * Priority rules (evaluated in order, first match wins):
 *   1. set_piece             → hold_shape
 *   2. transition_defend     → defensive_recovery
 *   3. hasBall               → skip (UtilityAI handles ball carriers)
 *   4. GK                    → skip
 *   5. transition_attack     → third_man_run or overlap
 *   6. in_possession         → role-based: support / overlap / underlap / third_man
 *   7. out_of_possession     → handled by existing DecisionSystem (no override)
 */

import type { SimulationContext } from "../context";
import type { SimulationSystem } from "../pipeline";
import type { Command } from "../core/Command";
import type { Player, Vec2, PlayerRole, TeamTacticalState } from "../types";
import { distVec, normVec } from "../physics";
import { SpaceAwareness } from "../ai/SpaceAwareness";
import { TeamShape } from "../ai/TeamShape";
import { getZoneAssignment, isOutsideLeash } from "./ZoneSystem";

// ── Run type ──────────────────────────────────────────────

export type OffBallRunType =
    | "support_run"
    | "overlap_run"
    | "underlap_run"
    | "third_man_run"
    | "defensive_recovery"
    | "hold_shape";

// How many ticks a run commitment persists before re-evaluating
const RUN_COMMIT_TICKS = 18;

// ── Roles that tend to make wide overlapping runs
const OVERLAP_ROLES: Set<PlayerRole> = new Set([
    "WB_Attacking", "WB_Defensive", "W_Winger",
]);

// ── Roles that cut inside (underlap)
const UNDERLAP_ROLES: Set<PlayerRole> = new Set([
    "W_Inverted", "CM_Playmaker", "CM_BoxToBox",
]);

// ── Roles that make third-man / blind runs into depth
const DEPTH_ROLES: Set<PlayerRole> = new Set([
    "ST_Poacher", "ST_Advanced", "ST_TargetMan",
    "CM_BoxToBox",
]);

// ── Main system ───────────────────────────────────────────

export class OffBallSystem implements SimulationSystem {
    name = "OffBallSystem";

    // Per-player run commit state: playerId → { type, target, ticksLeft }
    private _commits: Map<string, { type: OffBallRunType; target: Vec2; ticksLeft: number }> = new Map();

    update(ctx: SimulationContext): Command[] {
        const commands: Command[] = [];

        // Skip off-ball AI during dead-ball phases to keep taker in place
        const DEAD_PHASES = new Set(["throwin", "goalkick", "corner", "freekick", "goal", "halftime", "fulltime"]);
        if (DEAD_PHASES.has(ctx.state.phase)) return commands;

        const allPlayers = [...ctx.homeTeam.players, ...ctx.awayTeam.players];

        // Ensure spaceAwareness is populated this tick
        if (!ctx.tactical.spaceAwareness) {
            ctx.tactical.spaceAwareness = SpaceAwareness.compute(ctx);
        }

        const { freeSpaceMap } = ctx.tactical.spaceAwareness;

        for (const player of allPlayers) {
            // Skip ball carriers (handled by UtilityAI) and goalkeepers
            if (player.hasBall || player.position === "GK") continue;

            const tacticalState = player.team === "home"
                ? ctx.tactical.homeState
                : ctx.tactical.awayState;

            // Resolve the dynamic shape anchor for this player (2.3)
            const shapeTargets = player.team === "home"
                ? ctx.tactical.homeShapeTargets
                : ctx.tactical.awayShapeTargets;
            const shapeAnchor = TeamShape.getTarget(player, shapeTargets ?? []);

            // out_of_possession — DecisionSystem already handles pressing/marking
            if (
                tacticalState.phase === "out_of_possession" &&
                tacticalState.ticksSincePossessionChange > 30
            ) continue;

            // set_piece — hold shape anchor, no dynamic runs
            if (tacticalState.phase === "set_piece") {
                commands.push(makeHoldShapeCommand(player, shapeAnchor));
                this._commits.delete(player.id);
                continue;
            }

            // ── Zone leash check ─────────────────────────
            // If ZoneSystem has run this tick, check whether the player has
            // wandered outside their leash. If so, override everything with
            // hold_shape pointing at their zone centre. This prevents shape
            // collapse when players chase the ball too aggressively.
            const zoneData = ctx.tactical.zoneData;
            if (zoneData) {
                const za = getZoneAssignment(ctx, player.id);
                if (za && isOutsideLeash(player, za, zoneData.cellWidth, zoneData.cellHeight)) {
                    this._commits.delete(player.id);
                    commands.push(makeHoldShapeCommand(player, za.zoneCentreWorld));
                    continue;
                }
            }

            // ── Post-restart repositioning phase ─────────
            // After a dead-ball restart (kickoff / set piece), give players
            // a short window to reposition to their zone before any dynamic
            // run logic fires. This prevents immediate shape collapse after goals.
            if (
                tacticalState.ticksSincePossessionChange < 20 &&
                (ctx.state.phase === "playing") &&
                zoneData
            ) {
                const za = getZoneAssignment(ctx, player.id);
                if (za) {
                    this._commits.delete(player.id);
                    commands.push(makeHoldShapeCommand(player, za.zoneCentreWorld));
                    continue;
                }
            }

            // ── Check if player is committed to a run ────
            const existing = this._commits.get(player.id);
            if (existing && existing.ticksLeft > 0) {
                existing.ticksLeft--;
                commands.push(makeMoveCommand(player, existing.target, tacticalState));
                continue;
            }

            // ── Compute a new run ────────────────────────
            const ballOwner = allPlayers.find(p => p.id === ctx.ball.ownerPlayerId) ?? null;
            const teammates = allPlayers.filter(
                p => p.team === player.team && p.id !== player.id && !p.hasBall,
            );
            const opponents = allPlayers.filter(p => p.team !== player.team);
            const chain = player.team === "home" ? ctx.tactical.homeChain : ctx.tactical.awayChain;

            const runResult = this.chooseRun(
                player, ballOwner, teammates, opponents,
                tacticalState, freeSpaceMap, shapeAnchor, chain ?? null, ctx,
            );

            if (runResult) {
                this._commits.set(player.id, {
                    type: runResult.type,
                    target: runResult.target,
                    ticksLeft: RUN_COMMIT_TICKS,
                });
                commands.push(makeMoveCommand(player, runResult.target, tacticalState));
            }
        }

        return commands;
    }

    // ── Run selector ──────────────────────────────────────

    private chooseRun(
        player: Player,
        ballOwner: Player | null,
        teammates: Player[],
        opponents: Player[],
        state: TeamTacticalState,
        freeSpaceMap: number[][],
        shapeAnchor: Vec2,
        chain: import("../ai/PossessionChain").PossessionChain | null,
        ctx: SimulationContext,
    ): { type: OffBallRunType; target: Vec2 } | null {
        const { width, height } = ctx.config.fieldDimensions;
        const isHome = player.team === "home";
        const forwardDir = isHome ? 1 : -1;
        const ownGoalX = isHome ? 0 : width;

        // ── 1. transition_defend → recovery ──────────────
        if (state.phase === "transition_defend") {
            const zoneData = ctx.tactical.zoneData;
            const za = zoneData ? getZoneAssignment(ctx, player.id) : null;
            return defenseRecovery(
                player, ctx.ball.pos, ownGoalX, width, height,
                za?.zoneCentreWorld.y,
            );
        }

        // ── 2. No ball owner nearby → support to open zone ─
        if (!ballOwner) {
            return this.supportRun(player, opponents, freeSpaceMap, forwardDir, ctx);
        }

        const distToBall = distVec(player.pos, ballOwner.pos);

        // ── 3. transition_attack → third_man or overlap ──
        if (state.phase === "transition_attack") {
            const urgency = Math.max(0, 1 - state.ticksSincePossessionChange / 90);

            if (DEPTH_ROLES.has(player.role)) {
                return this.thirdManRun(player, ballOwner, opponents, freeSpaceMap, forwardDir, urgency, ctx);
            }
            if (OVERLAP_ROLES.has(player.role)) {
                return this.overlapRun(player, ballOwner, opponents, freeSpaceMap, forwardDir, ctx);
            }
            // Others: sprint into space in forward direction
            return this.supportRun(player, opponents, freeSpaceMap, forwardDir, ctx);
        }

        // ── 4. in_possession → role-based ────────────────

        // Only players within a useful range make active runs
        if (distToBall > 200) {
            return this.holdAnchor(shapeAnchor);
        }

        // Prevent clustering: if 2+ teammates already very close to ball, don't pile in
        const nearBallTeammates = teammates.filter(
            t => distVec(t.pos, ballOwner.pos) < 50,
        ).length;
        if (nearBallTeammates >= 2 && distToBall < 60) {
            return this.supportRun(player, opponents, freeSpaceMap, forwardDir, ctx);
        }

        // Chain-aware urgency: more urgent in chance_creation
        const chainUrgency = chain?.phase === "chance_creation" ? 0.85
            : chain?.phase === "final_third" ? 0.6
                : 0.5;

        if (DEPTH_ROLES.has(player.role)) {
            return this.thirdManRun(player, ballOwner, opponents, freeSpaceMap, forwardDir, chainUrgency, ctx);
        }
        if (OVERLAP_ROLES.has(player.role)) {
            return this.overlapRun(player, ballOwner, opponents, freeSpaceMap, forwardDir, ctx);
        }
        if (UNDERLAP_ROLES.has(player.role)) {
            return this.underlapRun(player, ballOwner, opponents, freeSpaceMap, forwardDir, ctx);
        }
        // Default: weighted support run
        return this.supportRun(player, opponents, freeSpaceMap, forwardDir, ctx);
    }

    // ── Run implementations ───────────────────────────────

    /**
     * support_run — player finds a passing angle at medium depth.
     * Prefers positions with free space 20-80 units ahead.
     */
    private supportRun(
        player: Player,
        opponents: Player[],
        freeSpaceMap: number[][],
        forwardDir: number,
        ctx: SimulationContext,
    ): { type: OffBallRunType; target: Vec2 } | null {
        const { width, height } = ctx.config.fieldDimensions;

        // Bias: slightly forward and toward open space
        const bias = normVec({ x: forwardDir * 0.7, y: (player.pos.y < height / 2 ? 0.3 : -0.3) });

        const target = SpaceAwareness.findBestRunTarget(
            player.pos, bias,
            25, 90,
            opponents, freeSpaceMap,
            width, height,
        );

        if (!target) {
            // Prefer zone centre if ZoneSystem has data, else fall back to formation targetPos
            const zoneData = ctx.tactical.zoneData;
            const za = zoneData ? getZoneAssignment(ctx, player.id) : null;
            const anchor = za ? za.zoneCentreWorld : player.targetPos;
            return this.holdAnchor(anchor);
        }
        return { type: "support_run", target };
    }

    /**
     * overlap_run — wide player bursts beyond the ball carrier's line.
     * Targets a zone behind and to the outside of the ball owner.
     */
    private overlapRun(
        player: Player,
        ballOwner: Player,
        opponents: Player[],
        freeSpaceMap: number[][],
        forwardDir: number,
        ctx: SimulationContext,
    ): { type: OffBallRunType; target: Vec2 } | null {
        const { width, height } = ctx.config.fieldDimensions;

        // "Outside" means toward the closer touchline
        const outsideDir = player.pos.y < height / 2 ? -1 : 1;

        // Sprint beyond the ball owner's X, stay wide
        const runX = ballOwner.pos.x + forwardDir * 60;
        const runY = player.pos.y + outsideDir * 20;

        const candidate: Vec2 = {
            x: Math.max(20, Math.min(width - 20, runX)),
            y: Math.max(15, Math.min(height - 15, runY)),
        };

        // Validate: must be reasonably free
        if (SpaceAwareness.spaceScore(candidate, opponents) < 0.35) {
            // Try a slightly deeper variant
            const deeper: Vec2 = {
                x: Math.max(20, Math.min(width - 20, runX + forwardDir * 25)),
                y: candidate.y,
            };
            if (SpaceAwareness.spaceScore(deeper, opponents) < 0.35) {
                return this.supportRun(player, opponents, freeSpaceMap, forwardDir, ctx);
            }
            return { type: "overlap_run", target: deeper };
        }

        return { type: "overlap_run", target: candidate };
    }

    /**
     * underlap_run — inverted winger / inside CM cuts into the half-space.
     * Runs between the fullback and centre-back channel.
     */
    private underlapRun(
        player: Player,
        ballOwner: Player,
        opponents: Player[],
        freeSpaceMap: number[][],
        forwardDir: number,
        ctx: SimulationContext,
    ): { type: OffBallRunType; target: Vec2 } | null {
        const { width, height } = ctx.config.fieldDimensions;
        const centerY = height / 2;

        // Half-space: between touchline and centre
        const halfSpaceY = player.pos.y < centerY
            ? centerY - height * 0.18
            : centerY + height * 0.18;

        const runX = ballOwner.pos.x + forwardDir * 45;
        const candidate: Vec2 = {
            x: Math.max(20, Math.min(width - 20, runX)),
            y: Math.max(15, Math.min(height - 15, halfSpaceY)),
        };

        if (SpaceAwareness.spaceScore(candidate, opponents) < 0.3) {
            return this.supportRun(player, opponents, freeSpaceMap, forwardDir, ctx);
        }

        return { type: "underlap_run", target: candidate };
    }

    /**
     * third_man_run — striker / box-to-box makes a blind diagonal run
     * into depth behind the defensive line, expecting a layoff.
     * Uses dangerousZones from SpaceAwareness if available.
     */
    private thirdManRun(
        player: Player,
        ballOwner: Player,
        _opponents: Player[],
        freeSpaceMap: number[][],
        forwardDir: number,
        urgency: number,
        ctx: SimulationContext,
    ): { type: OffBallRunType; target: Vec2 } | null {
        const { width, height } = ctx.config.fieldDimensions;
        const dangerous = ctx.tactical.spaceAwareness?.dangerousZones ?? [];

        // Pick the highest-quality dangerous zone aligned with our attack direction
        const candidates = dangerous.filter(z => {
            const isForward = forwardDir > 0 ? z.x > ballOwner.pos.x : z.x < ballOwner.pos.x;
            const dist = distVec(player.pos, z);
            return isForward && dist > 30 && dist < 180;
        });

        if (candidates.length > 0) {
            // Sort by: closest to goal + free space score
            const oppGoalX = forwardDir > 0 ? width : 0;
            candidates.sort((a, b) => {
                const col = (z: Vec2) => Math.min(15, Math.floor((z.x / width) * 16));
                const row = (z: Vec2) => Math.min(9, Math.floor((z.y / height) * 10));
                const spaceA = freeSpaceMap[col(a)]?.[row(a)] ?? 0;
                const spaceB = freeSpaceMap[col(b)]?.[row(b)] ?? 0;
                const scoreA = (1 - distVec(a, { x: oppGoalX, y: height / 2 }) / width) + spaceA;
                const scoreB = (1 - distVec(b, { x: oppGoalX, y: height / 2 }) / width) + spaceB;
                return scoreB - scoreA;
            });
            return { type: "third_man_run", target: candidates[0] };
        }

        // Fallback: diagonal run behind defensive line
        const runDepth = 70 + urgency * 50;
        const diagonal = height * 0.15 * (player.pos.y < height / 2 ? 1 : -1);

        const target: Vec2 = {
            x: Math.max(20, Math.min(width - 20, player.pos.x + forwardDir * runDepth)),
            y: Math.max(15, Math.min(height - 15, player.pos.y + diagonal)),
        };

        return { type: "third_man_run", target };
    }

    /** Stay near dynamic shape anchor */
    private holdAnchor(shapeAnchor: Vec2): { type: OffBallRunType; target: Vec2 } {
        return { type: "hold_shape", target: { ...shapeAnchor } };
    }
}

// ── Helpers ───────────────────────────────────────────────

function defenseRecovery(
    player: Player,
    ballPos: Vec2,
    ownGoalX: number,
    width: number,
    height: number,
    zoneAnchorY?: number,
): { type: OffBallRunType; target: Vec2 } {
    const recoveryX = (ballPos.x + ownGoalX) * 0.5;
    // Use zone anchor Y if available — keeps lateral shape during recovery
    const recoveryY = zoneAnchorY ?? player.targetPos.y;
    return {
        type: "defensive_recovery",
        target: {
            x: Math.max(15, Math.min(width - 15, recoveryX)),
            y: Math.max(15, Math.min(height - 15, recoveryY)),
        },
    };
}

function makeHoldShapeCommand(player: Player, shapeAnchor: Vec2): Command {
    return {
        type: "SET_PLAYER_DECISION",
        playerId: player.id,
        decision: { type: "reposition", target: { ...shapeAnchor } },
        cooldown: 12,
    };
}

function makeMoveCommand(
    player: Player,
    target: Vec2,
    state: TeamTacticalState,
): Command {
    const decisionType =
        state.phase === "transition_defend" || state.phase === "out_of_possession"
            ? "defend"
            : "move";
    return {
        type: "SET_PLAYER_DECISION",
        playerId: player.id,
        decision: { type: decisionType, target },
        cooldown: RUN_COMMIT_TICKS,
    };
}