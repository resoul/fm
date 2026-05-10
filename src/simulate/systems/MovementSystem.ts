import type { SimulationContext } from "../context";
import type { SimulationSystem } from "../pipeline";
import {
    PHYSICS, subVec, lenVec, scaleVec, normVec, addVec, clampVec
} from "../physics";
import type { FieldDimensions, Player, TeamSide, Vec2 } from "../types";
import type { Command, MovePlayerCommand, UpdatePlayerMetricsCommand } from "../core/Command";
import { getMomentumSpeedMultiplier } from "./MomentumSystem";
import { recordPositionSample, HEATMAP_SAMPLE_INTERVAL } from "../stats/PlayerMatchStats";

export class MovementSystem implements SimulationSystem {
    name = "MovementSystem";

    update(ctx: SimulationContext): Command[] {
        const allPlayers = [...ctx.homeTeam.players, ...ctx.awayTeam.players];
        const dt = ctx.dt;
        const commands: Command[] = [];

        // During dead-ball phases, ignore stale nextDecision targets.
        const DEAD_PHASES = new Set(["throwin", "goalkick", "corner", "freekick", "goal", "halftime", "fulltime"]);
        const isDeadBall = DEAD_PHASES.has(ctx.state.phase);

        for (const player of allPlayers) {
            const { width, height } = ctx.config.fieldDimensions;

            // Sanity guard: clamp targetPos to field bounds.
            if (
                player.targetPos.x < 0 || player.targetPos.x > width ||
                player.targetPos.y < 0 || player.targetPos.y > height
            ) {
                player.targetPos = {
                    x: Math.max(10, Math.min(width - 10, player.targetPos.x)),
                    y: Math.max(10, Math.min(height - 10, player.targetPos.y)),
                };
            }

            const targetOverride =
                !isDeadBall &&
                player.nextDecision?.target && isMovementDecision(player.nextDecision.type)
                    ? player.nextDecision.target
                    : undefined;

            // ── 4.2 Momentum: get speed multiplier for this player's team ──
            const momentumMult = getMomentumSpeedMultiplier(ctx, player.team as TeamSide);

            const result = this.calculateMovement(player, dt, ctx.config.fieldDimensions, targetOverride, momentumMult);

            if (result.moveCmd) commands.push(result.moveCmd);
            commands.push(result.metricsCmd);

            // ── C.1 PlayerMatchStats ──────────────────────────────────────────
            const pStats = ctx.playerStats?.get(player.id);
            if (pStats) {
                // Distance covered: magnitude of velocity * dt
                const speed = Math.sqrt(player.vel.x ** 2 + player.vel.y ** 2);
                pStats.distanceCovered += speed * dt;

                // Heatmap + avgPos: sample every HEATMAP_SAMPLE_INTERVAL ticks
                if (ctx.state.tick % HEATMAP_SAMPLE_INTERVAL === 0) {
                    recordPositionSample(
                        pStats,
                        player.pos.x, player.pos.y,
                        ctx.config.fieldDimensions.width,
                        ctx.config.fieldDimensions.height,
                    );
                    // minutesPlayed: increment by sample interval / ticks-per-minute
                    // 1 minute = config.fps * 60 ticks
                    pStats.minutesPlayed = Math.floor(ctx.state.tick / (ctx.config.fps * 60));
                }

                // Touch: player just received the ball (hasBall became true this tick)
                if (player.hasBall && player.id === ctx.ball.ownerPlayerId) {
                    // Only count if ball ownership was just claimed (cooldown just cleared)
                    // We use actionCooldown as a proxy: first tick of possession
                    if (player.actionCooldown === 0 && player.kickCooldown === 0) {
                        pStats.touches++;
                    }
                }

                // Progressive carry: player has ball and moved ≥ 10px toward opponent goal
                if (player.hasBall && result.moveCmd) {
                    const dxCarry = result.moveCmd.pos.x - player.pos.x;
                    const forwardDir = player.team === "home" ? dxCarry : -dxCarry;
                    if (forwardDir >= 10) pStats.progressiveCarries++;
                }
            }
        }

        return commands;
    }

    // ── Calculations ──────────────────────────────────────

    private getMaxSpeed(player: Player, momentumMult = 1.0): number {
        const base = PHYSICS.PLAYER_MAX_SPEED_BASE;
        // B.3: pace attribute drives top speed envelope
        const speedFactor = 0.7 + (player.attributes.pace / 100) * 0.6;
        // B.3: stamina moderates how much fatigue degrades speed
        const staminaResist = 0.4 + (player.attributes.stamina / 100) * 0.6;
        const fatiguePenalty = player.fatigue * 0.4 * staminaResist;
        const fatigueFactor = 1 - fatiguePenalty;
        return base * speedFactor * fatigueFactor * momentumMult;
    }

    private calculateMovement(
        player: Player,
        dt: number,
        field: FieldDimensions,
        targetOverride?: Vec2,
        momentumMult = 1.0,
    ): { moveCmd: MovePlayerCommand | null; metricsCmd: UpdatePlayerMetricsCommand } {
        const target = targetOverride ?? player.targetPos;
        const diff = subVec(target, player.pos);
        const dist = lenVec(diff);

        // ── B.3 Fatigue delta ──
        const effort = lenVec(player.vel) / PHYSICS.PLAYER_MAX_SPEED_BASE;
        // stamina → base fatigue rate (higher stamina = slower fatigue accumulation)
        const staminaFactor = 0.4 + (player.attributes.stamina / 100) * 0.6;
        const fatigueRate = 0.0001 * effort / staminaFactor;
        const naturalFitnessFactor = 0.5 + (player.attributes.naturalFitness / 100) * 0.5;
        const recoveryRate = 0.00004 * naturalFitnessFactor;
        const newFatigue = effort > 0.1
            ? Math.min(1, player.fatigue + fatigueRate)
            : Math.max(0, player.fatigue - recoveryRate);

        // B.3 Fatigue cognitive penalties:
        // At fatigue > 0.6 → decisions & composure effectively degraded in utilityAI
        // (we store no extra field; UtilityAI reads player.fatigue directly)
        // At fatigue > 0.8 → apply an implicit perception slowdown via extended cooldown
        // This is handled in DecisionSystem naturally (confidence degrades faster).

        // ── Kick cooldown ──
        const newKickCooldown = Math.max(0, player.kickCooldown - 1);

        // ── Velocity update ──
        let newVel: Vec2;

        if (dist < 1.5) {
            const fricted = scaleVec(player.vel, PHYSICS.PLAYER_FRICTION);
            newVel = lenVec(fricted) < 0.1 ? { x: 0, y: 0 } : fricted;

            return {
                moveCmd: null,
                metricsCmd: {
                    type: "UPDATE_PLAYER_METRICS",
                    playerId: player.id,
                    vel: newVel,
                    fatigue: newFatigue,
                    kickCooldown: newKickCooldown,
                },
            };
        }

        const maxSpd =
            this.getMaxSpeed(player, momentumMult) * (player.hasBall ? PHYSICS.PLAYER_DRIBBLE_SPEED_FACTOR : 1);
        const dir = normVec(diff);
        const desiredVel = scaleVec(dir, maxSpd);

        // B.3 acceleration attribute → ramp-up rate
        const accBase = PHYSICS.PLAYER_ACCELERATION;
        const accFactor = 0.5 + (player.attributes.acceleration / 100) * 0.5;

        // B.3 Turning inertia: agility controls how quickly velocity direction changes.
        // We compute the angle between current velocity and desired velocity.
        // Low agility = small max turn rate → player "slides" before redirecting.
        const currentSpeed = lenVec(player.vel);
        let turnFactor = 1.0;
        if (currentSpeed > 0.5) {
            const curDir = normVec(player.vel);
            const dot = curDir.x * dir.x + curDir.y * dir.y; // -1..1
            const alignment = (dot + 1) / 2;                  // 0..1 (0=U-turn, 1=same dir)
            // High agility → turnFactor stays near 1 even on direction change
            // Low agility → turnFactor drops to ~0.4 on a sharp turn
            const agilityTurn = 0.4 + (player.attributes.agility / 100) * 0.6;
            turnFactor = alignment + (1 - alignment) * agilityTurn;
        }
        const agilityFactor = 0.7 + (player.attributes.agility / 100) * 0.3;
        const finalAcc = accBase * accFactor * agilityFactor * turnFactor;

        newVel = clampVec(
            {
                x: player.vel.x + (desiredVel.x - player.vel.x) * finalAcc,
                y: player.vel.y + (desiredVel.y - player.vel.y) * finalAcc,
            },
            maxSpd,
        );

        const rawPos = addVec(player.pos, scaleVec(newVel, dt));
        const margin = 8;
        const newPos: Vec2 = {
            x: Math.max(margin, Math.min(field.width - margin, rawPos.x)),
            y: Math.max(margin, Math.min(field.height - margin, rawPos.y)),
        };

        return {
            moveCmd: {
                type: "MOVE_PLAYER",
                playerId: player.id,
                pos: newPos,
            },
            metricsCmd: {
                type: "UPDATE_PLAYER_METRICS",
                playerId: player.id,
                vel: newVel,
                fatigue: newFatigue,
                kickCooldown: newKickCooldown,
            },
        };
    }
}

function isMovementDecision(type: string): boolean {
    return type === "move" || type === "defend" || type === "dribble" || type === "reposition";
}