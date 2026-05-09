import type { SimulationContext } from "../context";
import type { SimulationSystem } from "../pipeline";
import {
    PHYSICS, subVec, lenVec, scaleVec, normVec, addVec, clampVec
} from "../physics";
import type { FieldDimensions, Player, Vec2 } from "../types";
import type { Command, MovePlayerCommand, UpdatePlayerMetricsCommand } from "../core/Command";

export class MovementSystem implements SimulationSystem {
    name = "MovementSystem";

    update(ctx: SimulationContext): Command[] {
        const allPlayers = [...ctx.homeTeam.players, ...ctx.awayTeam.players];
        const dt = ctx.dt;
        const commands: Command[] = [];

        // During dead-ball phases, ignore stale nextDecision targets.
        // Players must walk to their formation targetPos, not chase a pre-restart decision.
        const DEAD_PHASES = new Set(["throwin", "goalkick", "corner", "freekick", "goal", "halftime", "fulltime"]);
        const isDeadBall = DEAD_PHASES.has(ctx.state.phase);

        for (const player of allPlayers) {
            const targetOverride =
                !isDeadBall &&
                player.nextDecision?.target && isMovementDecision(player.nextDecision.type)
                    ? player.nextDecision.target
                    : undefined;

            const result = this.calculateMovement(player, dt, ctx.config.fieldDimensions, targetOverride);

            if (result.moveCmd) commands.push(result.moveCmd);
            commands.push(result.metricsCmd);
        }

        return commands;
    }

    // ── Calculations ──────────────────────────────────────

    private getMaxSpeed(player: Player): number {
        const base = PHYSICS.PLAYER_MAX_SPEED_BASE;
        const speedFactor = 0.6 + (player.attributes.pace / 100) * 0.4;
        // fatigue is read from player state (written last tick by resolver)
        const fatigueFactor = 1 - player.fatigue * 0.4;
        return base * speedFactor * fatigueFactor;
    }

    private calculateMovement(
        player: Player,
        dt: number,
        field: FieldDimensions,
        targetOverride?: Vec2,
    ): { moveCmd: MovePlayerCommand | null; metricsCmd: UpdatePlayerMetricsCommand } {
        const target = targetOverride ?? player.targetPos;
        const diff = subVec(target, player.pos);
        const dist = lenVec(diff);

        // ── Fatigue delta (pure computation, no mutation) ──
        const effort = lenVec(player.vel) / PHYSICS.PLAYER_MAX_SPEED_BASE;
        const staminaFactor = 0.4 + (player.attributes.stamina / 100) * 0.6;
        const fatigueRate = 0.0001 * effort / staminaFactor;
        const naturalFitnessFactor = 0.5 + (player.attributes.naturalFitness / 100) * 0.5;
        const recoveryRate = 0.00004 * naturalFitnessFactor;
        const newFatigue = effort > 0.1
            ? Math.min(1, player.fatigue + fatigueRate)
            : Math.max(0, player.fatigue - recoveryRate);

        // ── Kick cooldown ──────────────────────────────────
        const newKickCooldown = Math.max(0, player.kickCooldown - 1);

        // ── Velocity update ────────────────────────────────
        let newVel: Vec2;

        if (dist < 1.5) {
            // Player is at target — apply friction to coast to stop
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
            this.getMaxSpeed(player) * (player.hasBall ? PHYSICS.PLAYER_DRIBBLE_SPEED_FACTOR : 1);
        const dir = normVec(diff);
        const desiredVel = scaleVec(dir, maxSpd);

        const accBase = PHYSICS.PLAYER_ACCELERATION;
        const accFactor = 0.5 + (player.attributes.acceleration / 100) * 0.5;
        const agilityFactor = 0.7 + (player.attributes.agility / 100) * 0.3;
        const finalAcc = accBase * accFactor * agilityFactor;

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