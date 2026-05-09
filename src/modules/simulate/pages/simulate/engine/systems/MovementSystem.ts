import { SimulationContext } from "../context";
import { SimulationSystem } from "../pipeline";
import { 
    PHYSICS, subVec, lenVec, scaleVec, normVec, addVec, clampVec 
} from "../physics";
import { Player } from "../types";
import { Command, MovePlayerCommand } from "../core/Command";

export class MovementSystem implements SimulationSystem {
    name = "MovementSystem";

    update(ctx: SimulationContext): Command[] {
        const allPlayers = [...ctx.homeTeam.players, ...ctx.awayTeam.players];
        const dt = ctx.dt;
        const commands: Command[] = [];

        for (const player of allPlayers) {
            const moveCmd = this.calculateMovement(player, dt, ctx.config.fieldDimensions);
            if (moveCmd) commands.push(moveCmd);
            
            // Still mutating fatigue and cooldowns for now as they are internal metrics
            this.updateFatigue(player);
            if (player.kickCooldown > 0) player.kickCooldown--;
            if (player.actionCooldown > 0) player.actionCooldown--;
        }
        
        return commands;
    }

    private getMaxSpeed(player: Player): number {
        const base = PHYSICS.PLAYER_MAX_SPEED_BASE;
        const speedFactor = 0.6 + (player.attributes.pace / 100) * 0.4;
        const fatigueFactor = 1 - player.fatigue * 0.4;
        return base * speedFactor * fatigueFactor;
    }

    private calculateMovement(player: Player, dt: number, field: any): MovePlayerCommand | null {
        const diff = subVec(player.targetPos, player.pos);
        const dist = lenVec(diff);

        if (dist < 1.5) {
            player.vel = scaleVec(player.vel, PHYSICS.PLAYER_FRICTION);
            if (lenVec(player.vel) < 0.1) player.vel = { x: 0, y: 0 };
            return null;
        }

        const maxSpd = this.getMaxSpeed(player) * (player.hasBall ? PHYSICS.PLAYER_DRIBBLE_SPEED_FACTOR : 1);
        const dir = normVec(diff);
        const desiredVel = scaleVec(dir, maxSpd);
        
        const accBase = PHYSICS.PLAYER_ACCELERATION;
        const accFactor = (0.5 + (player.attributes.acceleration / 100) * 0.5);
        const agilityFactor = (0.7 + (player.attributes.agility / 100) * 0.3);
        const finalAcc = accBase * accFactor * agilityFactor;

        player.vel = {
            x: player.vel.x + (desiredVel.x - player.vel.x) * finalAcc,
            y: player.vel.y + (desiredVel.y - player.vel.y) * finalAcc,
        };
        
        player.vel = clampVec(player.vel, maxSpd);
        const newPos = addVec(player.pos, scaleVec(player.vel, dt));

        // Clamp
        const margin = 8;
        newPos.x = Math.max(margin, Math.min(field.width - margin, newPos.x));
        newPos.y = Math.max(margin, Math.min(field.height - margin, newPos.y));

        return {
            type: "MOVE_PLAYER",
            playerId: player.id,
            pos: newPos
        };
    }

    private updateFatigue(player: Player): void {
        const effort = lenVec(player.vel) / PHYSICS.PLAYER_MAX_SPEED_BASE;
        const staminaFactor = 0.4 + (player.attributes.stamina / 100) * 0.6;
        const fatigueRate = 0.0001 * effort / staminaFactor;
        const naturalFitnessFactor = 0.5 + (player.attributes.naturalFitness / 100) * 0.5;
        const recoveryRate = 0.00004 * naturalFitnessFactor;
        
        if (effort > 0.1) {
            player.fatigue = Math.min(1, player.fatigue + fatigueRate);
        } else {
            player.fatigue = Math.max(0, player.fatigue - recoveryRate);
        }
    }
}
