import type { SimulationContext } from "../context";
import type { SimulationSystem } from "../pipeline";
import { UtilityAI } from "../ai";
import { BALANCE } from "../balance";
import type { Command } from "../core/Command";
import { distVec, normVec } from "../physics";
import type { AIDecision, Ball, Player, PlayerIntent, TeamTacticalState } from "../types";
import { SpaceAwareness } from "../ai/SpaceAwareness";
import { getZoneAssignment, isOutsideLeash } from "./ZoneSystem";

// ── Intent timing constants ───────────────────────────────
//
// High decisions (80+) → commitTick = ~10 ticks, reevaluate = ~21 ticks
// Low  decisions (40-) → commitTick = ~15 ticks, reevaluate = ~33 ticks
//
// Formula: linear interpolation across the 0-100 decisions range.
// These are intentionally tight so hesitation is perceptible but not
// game-breaking.  Tune in balance.ts if needed.

function computeIntentTimings(decisions: number): { commitTicks: number; reevalTicks: number } {
    // decisions in 0-100 range; clamp for safety
    const d = Math.max(0, Math.min(100, decisions));
    const commitTicks = Math.round(15 - d * 0.05);       // 10–15 ticks
    const reevalTicks  = Math.round(33 - d * 0.12);      // 21–33 ticks
    return { commitTicks, reevalTicks };
}

/**
 * DecisionSystem handles high-level AI reasoning.
 *
 * B.1 Intent Architecture:
 *   Before forming a new decision the system checks player.intent:
 *
 *   - If tick < intent.commitTick  → player is locked, skip re-evaluation.
 *     The existing nextDecision is kept. This creates the "opinionated" lag
 *     where players react a fraction of a second after the situation changes.
 *
 *   - If tick < intent.reevaluateAt → the player may update their *target*
 *     (e.g. track a moving teammate) but will not switch action type.
 *
 *   - If intent.confidence < 0.15 → the player hesitates: intent is cleared
 *     but no new decision is formed this tick (the cooldown absorbs it).
 *
 *   commitTick and reevaluateAt are scaled by the `decisions` attribute:
 *   high-decisions players commit sooner and re-evaluate faster.
 *
 * Off-ball behaviour is driven by TeamTacticalState (computed by TacticalSystem):
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
        const DEAD_PHASES = new Set(["throwin", "goalkick", "corner", "freekick", "goal", "halftime", "fulltime", "kickoff", "offside"]);
        const isDeadPhase = DEAD_PHASES.has(ctx.state.phase);
        const restartTakerId = ctx.state.restartTakerId;
        const tick = ctx.state.tick;

        for (const player of allPlayers) {
            // D.4: Expelled players never receive decisions
            if (player.isExpelled) continue;

            if (player.actionCooldown > 0) {
                player.actionCooldown--;
                // ── Intent: degrade confidence while cooling down ──────
                if (player.intent) {
                    player.intent.confidence = Math.max(0, player.intent.confidence - 0.02);
                }
                continue;
            }

            // Skip all AI during dead ball EXCEPT for the player taking the restart OR anyone who has the ball
            if (isDeadPhase && player.id !== restartTakerId && !player.hasBall) continue;

            // Skip GK unless they have the ball or are taking a restart
            if (player.position === "GK" && !player.hasBall && player.id !== restartTakerId) continue;

            const tacticalState = player.team === "home"
                ? ctx.tactical.homeState
                : ctx.tactical.awayState;

            // ── B.1 Intent lock check ─────────────────────────────────
            if (player.intent) {
                const intent = player.intent;

                // Hard lock: decision committed, cannot override until commitTick
                if (tick < intent.commitTick) {
                    // Still degrade confidence if context has shifted badly
                    this.updateIntentConfidence(player, intent, ctx);
                    continue;
                }

                // Low confidence: hesitate — clear intent, but don't form a new one yet
                if (intent.confidence < 0.15) {
                    player.intent = null;
                    // Small extra cooldown simulates the moment of indecision
                    commands.push({
                        type: "SET_PLAYER_DECISION",
                        playerId: player.id,
                        decision: null,
                        cooldown: Math.round(ctx.rng.nextInt(8, 18) * (1 - player.attributes.decisions / 100 * 0.5)),
                    });
                    continue;
                }

                // Soft window: intent type is locked but target may drift (e.g. tracking a run)
                if (tick < intent.reevaluateAt) {
                    this.updateIntentConfidence(player, intent, ctx);
                    // If the intent has a moving target (pass to a teammate), refresh target pos
                    if (intent.targetPlayerId) {
                        const targetPlayer = allPlayers.find(p => p.id === intent.targetPlayerId);
                        if (targetPlayer) {
                            intent.target = { ...targetPlayer.pos };
                        }
                    }
                    continue;
                }

                // Past reevaluateAt: clear intent, fall through to fresh decision
                player.intent = null;
            }

            // D.1: Process decisions for everyone without an active intent

            const decision = player.hasBall
                ? UtilityAI.getBestDecision(player, ctx)
                : this.getOffBallDecision(player, ctx, tacticalState, allPlayers);

            const isMovement = decision && (decision.type === "dribble" || decision.type === "move" || decision.type === "reposition");
            const cooldown = isMovement 
                ? ctx.rng.nextInt(2, 5) // Very frequent adjustments for movement
                : ctx.rng.nextInt(
                    BALANCE.ACTION_COOLDOWN_MIN,
                    BALANCE.ACTION_COOLDOWN_MAX,
                );

            // ── B.1 Form new intent ───────────────────────────────────
            if (decision) {
                // ── A.6 Concentration decay: late-game players commit slower ─
                const minuteFactor = Math.max(0, (ctx.state.minute - 70) / 20);
                const concentrationPenalty = minuteFactor * (1 - (player.attributes.concentration ?? 50) / 100) * 0.2;
                const effectiveDecisions = Math.max(0, player.attributes.decisions * (1 - concentrationPenalty));
                const { commitTicks, reevalTicks } = computeIntentTimings(effectiveDecisions);
                const newIntent: PlayerIntent = {
                    type: decision.type,
                    target: decision.target ? { ...decision.target } : undefined,
                    targetPlayerId: decision.targetPlayerId,
                    confidence: 1.0,
                    commitTick: tick + commitTicks,
                    reevaluateAt: tick + reevalTicks,
                    formedAtTick: tick,
                };
                player.intent = newIntent;
            }

            commands.push({
                type: "SET_PLAYER_DECISION",
                playerId: player.id,
                decision,
                cooldown,
            });
        }

        return commands;
    }

    // ── Intent confidence degradation ─────────────────────
    //
    // Confidence drops when the situation has materially changed since
    // the intent was formed.  We check two lightweight proxies:
    //   1. Ball moved far (possession changed / ball travelled)
    //   2. A defender appeared nearby since formedAtTick
    //
    // This avoids expensive per-tick diff but still catches major shifts.

    private updateIntentConfidence(
        player: Player,
        intent: PlayerIntent,
        ctx: SimulationContext,
    ): void {
        // If player won the ball unexpectedly → intent is stale, drop confidence fast
        if (player.hasBall && intent.type !== "shoot" && intent.type !== "pass" && intent.type !== "dribble") {
            intent.confidence = Math.max(0, intent.confidence - 0.25);
            return;
        }

        // If player lost the ball while intending to shoot/pass → stale
        if (!player.hasBall && (intent.type === "shoot" || intent.type === "pass")) {
            intent.confidence = Math.max(0, intent.confidence - 0.4);
            return;
        }

        // Nearby defenders change: count pressure
        const nearbyOpponents = ctx.spatialHash
            .queryRadius(player.pos, 50)
            .filter(p => p.team !== player.team).length;

        // Each nearby defender erodes confidence slightly
        intent.confidence = Math.max(0, intent.confidence - nearbyOpponents * 0.03);

        // Natural decay
        intent.confidence = Math.max(0, intent.confidence - 0.008);
    }

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

            const teammates = allPlayers.filter(p => p.team === player.team && p.id !== player.id);
            const spaceTarget = SpaceAwareness.findBestRunTarget(
                player.pos, bias,
                30, 110,
                opponents, teammates, player.targetPos, freeSpaceMap,
                width, height,
            );

            if (spaceTarget) {
                // Offside clamp: don't make a standard run behind the line
                const line = isHome ? ctx.tactical.homeDefensiveLine : ctx.tactical.awayDefensiveLine;
                if (isHome) spaceTarget.x = Math.min(spaceTarget.x, line - 5);
                else spaceTarget.x = Math.max(spaceTarget.x, line + 5);

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
        
        // Offside fallback clamp
        const line = isHome ? ctx.tactical.homeDefensiveLine : ctx.tactical.awayDefensiveLine;
        const clampedX = isHome ? Math.min(targetX, line - 5) : Math.max(targetX, line + 5);
        
        return { type: "move", target: { x: clampedX, y: targetY } };
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
            const teammates = allPlayers.filter(p => p.team === player.team && p.id !== player.id);
            const spaceTarget = SpaceAwareness.findBestRunTarget(
                player.pos, bias,
                40, 150,
                opponents, teammates, player.targetPos, freeSpaceMap,
                width, height,
            );
            if (spaceTarget) {
                // Offside clamp for transition
                const line = isHome ? ctx.tactical.homeDefensiveLine : ctx.tactical.awayDefensiveLine;
                // In transition we can be slightly more aggressive (right on the line)
                const clampedX = isHome ? Math.min(spaceTarget.x, line - 2) : Math.max(spaceTarget.x, line + 2);
                return { type: "move", target: { ...spaceTarget, x: clampedX } };
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

        // ── A.2 Press wave: pressCount scales with workRate + gegenpress style ──
        const inst = player.team === "home"
            ? ctx.tactical.homeInstructions
            : ctx.tactical.awayInstructions;
        const avgWorkRate = ownTeam.reduce((s, p) => s + p.attributes.workRate, 0) / (ownTeam.length || 1);
        const pressCount = 2
            + (avgWorkRate > 70 ? 1 : 0)
            + (inst?.style === "gegenpress" ? 1 : 0);

        // ── A.2 Press start distance scales with individual aggression ─────────
        const pressStartDist = 60 + (player.attributes.aggression / 100) * 40;

        const pressers = [...ownTeam]
            .sort((a, b) => distVec(a.pos, owner.pos) - distVec(b.pos, owner.pos))
            .slice(0, pressCount);

        const distToOwner = distVec(player.pos, owner.pos);

        if (pressers.some(p => p.id === player.id) && distToOwner <= pressStartDist) {
            const pressIndex = pressers.findIndex(p => p.id === player.id);
            const sideAngle = pressIndex === 0 ? 0 : (player.team === "home" ? -0.55 : 0.55);

            // ── C.1 pressingActions ───────────────────────────────────────────
            // Count as a pressing action only when close enough to be applying
            // real pressure (within 2× tackle range + a chase buffer)
            const pressDist = distToOwner;
            if (pressDist < 80) {
                const pStat = ctx.playerStats?.get(player.id);
                if (pStat) pStat.pressingActions++;
            }

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

            // ── A.3 Anticipation → intercept bias ─────────────────────────────
            // High anticipation: player moves toward where the pass is going,
            // not just where the opponent is now.
            const interceptBias = player.attributes.anticipation / 100;
            // Predicted pass target: midpoint between markTarget and nearest own teammate
            const nearestOwnMate = ownTeam
                .filter(p => p.id !== player.id)
                .sort((a, b) => distVec(a.pos, markTarget.pos) - distVec(b.pos, markTarget.pos))[0];
            const predictedPassTarget = nearestOwnMate
                ? { x: (markTarget.pos.x + nearestOwnMate.pos.x) / 2, y: (markTarget.pos.y + nearestOwnMate.pos.y) / 2 }
                : markTarget.pos;

            const markX = markTarget.pos.x * (1 - interceptBias) + predictedPassTarget.x * interceptBias;
            const markY = markTarget.pos.y * (1 - interceptBias) + predictedPassTarget.y * interceptBias;

            return {
                type: "defend",
                target: {
                    x: clampField(
                        zoneAnchor.x * (0.70 - pressurePull) +
                        markX * 0.20 +
                        ownGoalX * (0.10 + pressurePull),
                        10, width - 10,
                    ),
                    y: clampField(
                        zoneAnchor.y * 0.85 + markY * 0.15,
                        10, height - 10,
                    ),
                },
            };
        }

        // Fallback: hold zone anchor, biased toward own goal
        return {
            type: "defend",
            target: {
                x: clampField(zoneAnchor.x * 0.85 + ownGoalX * 0.15, 10, width - 10),
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