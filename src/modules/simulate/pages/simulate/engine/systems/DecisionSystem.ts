import type { SimulationContext } from "../context";
import type { SimulationSystem } from "../pipeline";
import { UtilityAI } from "../ai";
import { BALANCE } from "../balance";
import type { Command } from "../core/Command";
import { distVec, normVec } from "../physics";
import type { AIDecision, Ball, Player, TeamTacticalState } from "../types";
import { SpaceAwareness } from "../ai/SpaceAwareness";
import { getZoneAssignment, isOutsideLeash } from "./ZoneSystem";

/**
 * DecisionSystem handles high-level AI reasoning.
 *
 * Off-ball behaviour is now driven by TeamTacticalState (computed by TacticalSystem):
 *
 *   in_possession     → spread wide, create passing options, push forward
 *   transition_attack → sprint into space immediately after winning ball
 *   out_of_possession → structured press / mark
 *   transition_defend → recover hard toward own goal
 *   set_piece         → hold formation position
 */
export class DecisionSystem implements SimulationSystem {
    name = "DecisionSystem";

    update(ctx: SimulationContext): Command[] {
        const { homeTeam, awayTeam } = ctx;
        const allPlayers = [...homeTeam.players, ...awayTeam.players];
        const commands: Command[] = [];

        // During dead-ball phases, skip all AI decisions to prevent taker from drifting
        const DEAD_PHASES = new Set(["throwin", "goalkick", "corner", "freekick", "goal", "halftime", "fulltime"]);
        if (DEAD_PHASES.has(ctx.state.phase)) return commands;

        for (const player of allPlayers) {
            if (player.actionCooldown > 0) {
                player.actionCooldown--;
                continue;
            }

            if (player.position === "GK") continue;

            const tacticalState = player.team === "home"
                ? ctx.tactical.homeState
                : ctx.tactical.awayState;

            // Off-ball players: OffBallSystem already produced a typed run decision.
            // DecisionSystem only handles ball-carrier logic (UtilityAI).
            // Exception: out_of_possession pressing/marking still comes from here
            // because OffBallSystem skips that phase (it defers to DecisionSystem).
            if (!player.hasBall) {
                const phase = tacticalState.phase;
                if (
                    phase === "in_possession" ||
                    phase === "transition_attack" ||
                    phase === "transition_defend" ||
                    phase === "set_piece"
                ) {
                    // OffBallSystem handled these — skip to avoid overwriting
                    continue;
                }
                // out_of_possession: fall through to existing pressing/marking logic
            }

            const decision = player.hasBall
                ? UtilityAI.getBestDecision(player, ctx)
                : this.getOffBallDecision(player, ctx, tacticalState, allPlayers);

            commands.push({
                type: "SET_PLAYER_DECISION",
                playerId: player.id,
                decision,
                cooldown: ctx.rng.nextInt(
                    BALANCE.ACTION_COOLDOWN_MIN,
                    BALANCE.ACTION_COOLDOWN_MAX,
                ),
            });
        }

        return commands;
    }

    // ── Off-ball dispatch ─────────────────────────────────

    private getOffBallDecision(
        player: Player,
        ctx: SimulationContext,
        state: TeamTacticalState,
        allPlayers: Player[],
    ): AIDecision | null {
        // If ball is loose everyone chases (top 4 by proximity)
        if (!ctx.ball.ownerPlayerId) {
            return this.looseBallDecision(player, ctx.ball, allPlayers);
        }

        switch (state.phase) {
            case "in_possession":
                return this.inPossessionDecision(player, ctx, allPlayers);
            case "transition_attack":
                return this.transitionAttackDecision(player, ctx, state, allPlayers);
            case "out_of_possession":
                return this.outOfPossessionDecision(player, ctx, allPlayers);
            case "transition_defend":
                return this.transitionDefendDecision(player, ctx);
            case "set_piece":
                return this.setPieceDecision(player);
            default:
                return this.outOfPossessionDecision(player, ctx, allPlayers);
        }
    }

    // ── Phase handlers ────────────────────────────────────

    /**
     * in_possession: spread out and move into free space.
     * Now uses SpaceAwareness freeSpaceMap to find genuine open zones
     * instead of purely formula-based anchor offsets.
     */
    private inPossessionDecision(
        player: Player,
        ctx: SimulationContext,
        allPlayers: Player[],
    ): AIDecision {
        const { width, height } = ctx.config.fieldDimensions;
        const isHome = player.team === "home";
        const forwardDir = isHome ? 1 : -1;
        const owner = allPlayers.find(p => p.id === ctx.ball.ownerPlayerId);
        const opponents = allPlayers.filter(p => p.team !== player.team);

        // If SpaceAwareness is available, find the best open zone
        if (ctx.tactical.spaceAwareness) {
            const { freeSpaceMap } = ctx.tactical.spaceAwareness;

            // Bias: forward and slightly away from current Y (spread)
            const lateralBias = player.pos.y < height / 2 ? -0.25 : 0.25;
            const bias = normVec({ x: forwardDir * 0.75, y: lateralBias });

            const spaceTarget = SpaceAwareness.findBestRunTarget(
                player.pos, bias,
                30, 110,
                opponents, freeSpaceMap,
                width, height,
            );

            if (spaceTarget) {
                return { type: "move", target: spaceTarget };
            }
        }

        // Fallback: original formula-based positioning
        const forwardBias = isHome ? width * 0.28 : -width * 0.28;
        let lateralShift = 0;
        if (owner) {
            const dy = player.targetPos.y - owner.pos.y;
            lateralShift = Math.sign(dy) * Math.min(Math.abs(dy) * 0.4, height * 0.12);
        }
        const targetX = clampField(player.targetPos.x + forwardBias, 24, width - 24);
        const targetY = clampField(player.targetPos.y + lateralShift, 20, height - 20);
        return { type: "move", target: { x: targetX, y: targetY } };
    }

    /**
     * transition_attack: sprint into the best free zone behind the defensive line.
     * Uses SpaceAwareness dangerousZones and freeSpaceMap for smarter targeting.
     * Urgency fades as ticksSincePossessionChange grows.
     */
    private transitionAttackDecision(
        player: Player,
        ctx: SimulationContext,
        state: TeamTacticalState,
        allPlayers: Player[],
    ): AIDecision {
        const { width, height } = ctx.config.fieldDimensions;
        const isHome = player.team === "home";
        const forwardDir = isHome ? 1 : -1;
        const urgency = Math.max(0, 1 - state.ticksSincePossessionChange / 90);
        const opponents = allPlayers.filter(p => p.team !== player.team);

        // Try to use a dangerous zone (free space behind defensive line)
        if (ctx.tactical.spaceAwareness && urgency > 0.2) {
            const { dangerousZones, freeSpaceMap } = ctx.tactical.spaceAwareness;

            const candidates = dangerousZones.filter(z => {
                const isForward = isHome ? z.x > player.pos.x : z.x < player.pos.x;
                const dist = distVec(player.pos, z);
                return isForward && dist > 35 && dist < 200;
            });

            if (candidates.length > 0) {
                const oppGoalX = isHome ? width : 0;
                // Pick closest to goal that is reasonably free
                candidates.sort((a, b) =>
                    distVec(a, { x: oppGoalX, y: height / 2 }) -
                    distVec(b, { x: oppGoalX, y: height / 2 })
                );
                const best = candidates[0];
                // Validate lane to this zone isn't completely cut off
                const ballOwner = allPlayers.find(p => p.id === ctx.ball.ownerPlayerId);
                if (!ballOwner || SpaceAwareness.laneIsClear(player.pos, best, opponents)) {
                    return { type: "move", target: best };
                }
            }

            // No dangerous zone — find best open space using freeSpaceMap
            const bias = normVec({ x: forwardDir * (0.7 + urgency * 0.3), y: 0 });
            const spaceTarget = SpaceAwareness.findBestRunTarget(
                player.pos, bias,
                40, 150,
                opponents, freeSpaceMap,
                width, height,
            );
            if (spaceTarget) {
                return { type: "move", target: spaceTarget };
            }
        }

        // Fallback: original formula
        const sprintDepth = isHome
            ? width * (0.25 + urgency * 0.25)
            : -width * (0.25 + urgency * 0.25);
        const targetX = clampField(player.targetPos.x + sprintDepth, 30, width - 30);
        const wideSpread = isHome ? 1 : -1;
        const lateralOpen = player.targetPos.y + wideSpread * height * 0.08 * urgency;
        const targetY = clampField(lateralOpen, 20, height - 20);
        return { type: "move", target: { x: targetX, y: targetY } };
    }

    /**
     * out_of_possession: organised press toward ball + mark nearest opponent.
     * Now zone-aware: each player defends their assigned zone first,
     * then presses from that anchored position.
     */
    private outOfPossessionDecision(
        player: Player,
        ctx: SimulationContext,
        allPlayers: Player[],
    ): AIDecision {
        const { width, height } = ctx.config.fieldDimensions;
        const tacticalState = player.team === "home"
            ? ctx.tactical.homeState
            : ctx.tactical.awayState;

        const owner = allPlayers.find(p => p.id === ctx.ball.ownerPlayerId)!;
        const opponents = allPlayers.filter(p => p.team !== player.team && p.position !== "GK");
        const ownTeam = allPlayers.filter(p => p.team === player.team && p.position !== "GK");

        // Zone anchor: player's assigned zone centre (if ZoneSystem has run)
        const zoneAsgn = getZoneAssignment(ctx, player.id);
        const zoneAnchor = zoneAsgn?.zoneCentreWorld ?? player.targetPos;
        const cellW = ctx.tactical.zoneData?.cellWidth ?? width / 6;
        const cellH = ctx.tactical.zoneData?.cellHeight ?? height / 5;

        // Top 2 pressers go directly toward ball carrier
        const pressers = [...ownTeam]
            .sort((a, b) => distVec(a.pos, owner.pos) - distVec(b.pos, owner.pos))
            .slice(0, 2);

        if (pressers.some(p => p.id === player.id)) {
            const pressIndex = pressers.findIndex(p => p.id === player.id);
            const sideAngle = pressIndex === 0 ? 0 : (player.team === "home" ? -0.55 : 0.55);
            return {
                type: "defend",
                target: {
                    x: clampField(owner.pos.x + Math.cos(sideAngle) * 16, 10, width - 10),
                    y: clampField(owner.pos.y + Math.sin(sideAngle) * 20, 10, height - 10),
                },
            };
        }

        // Zone-aware: if player is outside their leash zone, recover first
        if (zoneAsgn && ctx.tactical.zoneData &&
            isOutsideLeash(player, zoneAsgn, cellW, cellH)) {
            return {
                type: "defend",
                target: {
                    x: clampField(zoneAnchor.x, 10, width - 10),
                    y: clampField(zoneAnchor.y, 10, height - 10),
                },
            };
        }

        // Mark nearest unmarked opponent within zone reach
        const isHome = player.team === "home";
        const ownGoalX = isHome ? 0 : width;

        const markTarget = opponents
            .filter(opp => opp.id !== owner.id)
            // Only mark opponents who are in or near my zone (±1.5 cells)
            .filter(opp =>
                Math.abs(opp.pos.x - zoneAnchor.x) < cellW * 2.5 &&
                Math.abs(opp.pos.y - zoneAnchor.y) < cellH * 2.5
            )
            .sort((a, b) => distVec(a.pos, player.pos) - distVec(b.pos, player.pos))[0];

        if (markTarget) {
            const pressurePull = tacticalState.pressureIntensity * 0.3;
            return {
                type: "defend",
                target: {
                    x: clampField(
                        zoneAnchor.x * (0.35 - pressurePull) +
                        markTarget.pos.x * 0.35 +
                        ownGoalX * (0.3 + pressurePull),
                        10, width - 10,
                    ),
                    y: clampField(
                        zoneAnchor.y * 0.5 + markTarget.pos.y * 0.5,
                        10, height - 10,
                    ),
                },
            };
        }

        // Fallback: hold zone anchor, biased toward own goal
        return {
            type: "defend",
            target: {
                x: clampField(zoneAnchor.x * 0.6 + ownGoalX * 0.4, 10, width - 10),
                y: clampField(zoneAnchor.y, 10, height - 10),
            },
        };
    }

    /**
     * transition_defend: hard sprint back to own half.
     * Now zone-aware: recover to zone anchor, not just formation targetPos.
     */
    private transitionDefendDecision(
        player: Player,
        ctx: SimulationContext,
    ): AIDecision {
        const { width, height } = ctx.config.fieldDimensions;
        const isHome = player.team === "home";

        const zoneAsgn = getZoneAssignment(ctx, player.id);
        const anchor = zoneAsgn?.zoneCentreWorld ?? player.targetPos;

        // Sprint to zone anchor, biased heavily between ball and own goal
        const ownGoalX = isHome ? width * 0.18 : width * 0.82;
        const ballX = ctx.ball.pos.x;
        const recoveryX = isHome
            ? Math.min(anchor.x, (ballX + ownGoalX) / 2)
            : Math.max(anchor.x, (ballX + ownGoalX) / 2);

        return {
            type: "defend",
            target: {
                x: clampField(recoveryX, 15, width - 15),
                y: clampField(anchor.y, 15, height - 15),
            },
        };
    }

    /**
     * set_piece: hold formation anchor tightly.
     */
    private setPieceDecision(player: Player): AIDecision
    {
        return {
            type: "reposition",
            target: { ...player.targetPos },
        };
    }

    /**
     * Loose ball: top 4 closest players chase, rest drift toward anchor.
     */
    private looseBallDecision(
        player: Player,
        ball: Ball,
        allPlayers: Player[],
    ): AIDecision {
        const chasers = allPlayers
            .filter(p => p.position !== "GK")
            .sort((a, b) => distVec(a.pos, ball.pos) - distVec(b.pos, ball.pos))
            .slice(0, 4);

        if (chasers.some(c => c.id === player.id)) {
            return { type: "move", target: { ...ball.pos } };
        }

        return {
            type: "reposition",
            target: {
                x: player.targetPos.x * 0.85 + ball.pos.x * 0.15,
                y: player.targetPos.y * 0.85 + ball.pos.y * 0.15,
            },
        };
    }
}

// ── Utility ───────────────────────────────────────────────

function clampField(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}