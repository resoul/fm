import { SimulationContext } from "../context";
import { SimulationSystem } from "../pipeline";
import { 
    PHYSICS, subVec, lenVec, scaleVec, normVec, addVec, clampVec, distVec 
} from "../physics";
import { Player } from "../types";

export class MovementSystem implements SimulationSystem {
    name = "MovementSystem";

    update(ctx: SimulationContext): void {
        const allPlayers = [...ctx.homeTeam.players, ...ctx.awayTeam.players];
        const dt = ctx.dt;

        for (const player of allPlayers) {
            this.moveToward(player, dt);
            this.updateFatigue(player);
            this.clampToField(player, ctx.config.fieldDimensions);
            
            if (player.kickCooldown > 0) {
                player.kickCooldown--;
            }
            if (player.actionCooldown > 0) {
                player.actionCooldown--;
            }
        }
    }

    private getMaxSpeed(player: Player): number {
        const base = PHYSICS.PLAYER_MAX_SPEED_BASE;
        // PACE determines top speed
        const speedFactor = 0.6 + (player.attributes.pace / 100) * 0.4;
        const fatigueFactor = 1 - player.fatigue * 0.4;
        return base * speedFactor * fatigueFactor;
    }

    private moveToward(player: Player, dt: number): void {
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
        
        // ACCELERATION determines how quickly we reach max speed
        // AGILITY affects turning (responsiveness to direction change)
        const accBase = PHYSICS.PLAYER_ACCELERATION;
        const accFactor = (0.5 + (player.attributes.acceleration / 100) * 0.5);
        const agilityFactor = (0.7 + (player.attributes.agility / 100) * 0.3);
        
        const finalAcc = accBase * accFactor * agilityFactor;

        player.vel = {
            x: player.vel.x + (desiredVel.x - player.vel.x) * finalAcc,
            y: player.vel.y + (desiredVel.y - player.vel.y) * finalAcc,
        };
        
        player.vel = clampVec(player.vel, maxSpd);
        player.pos = addVec(player.pos, scaleVec(player.vel, dt));
    }

    private updateFatigue(player: Player): void {
        const effort = lenVec(player.vel) / PHYSICS.PLAYER_MAX_SPEED_BASE;
        
        // STAMINA: determines how quickly player gets tired
        const staminaFactor = 0.4 + (player.attributes.stamina / 100) * 0.6;
        const fatigueRate = 0.0001 * effort / staminaFactor;
        
        // NATURAL FITNESS: determines how quickly player recovers when not moving
        const naturalFitnessFactor = 0.5 + (player.attributes.naturalFitness / 100) * 0.5;
        const recoveryRate = 0.00004 * naturalFitnessFactor;
        
        if (effort > 0.1) {
            player.fatigue = Math.min(1, player.fatigue + fatigueRate);
        } else {
            player.fatigue = Math.max(0, player.fatigue - recoveryRate);
        }
    }

    private clampToField(player: Player, field: any, margin = 8): void {
        player.pos.x = Math.max(margin, Math.min(field.width - margin, player.pos.x));
        player.pos.y = Math.max(margin, Math.min(field.height - margin, player.pos.y));
        player.targetPos.x = Math.max(margin, Math.min(field.width - margin, player.targetPos.x));
        player.targetPos.y = Math.max(margin, Math.min(field.height - margin, player.targetPos.y));
    }
}
