import type { SimulationContext } from "../context";
import type { SimulationSystem } from "../pipeline";
import { addVec, distVec, normVec, scaleVec, subVec } from "../physics";
import { BALANCE } from "../balance";
import type { Command, SetPlayerDecisionCommand, UpdateBallCommand } from "../core/Command";
import type { Player } from "../types";

let eventCounter = 5000;
function mkEventId() { return `evt_${++eventCounter}`; }

export class TackleSystem implements SimulationSystem {
    name = "TackleSystem";

    update(ctx: SimulationContext): Command[] {
        const { homeTeam, awayTeam, ball } = ctx;
        const commands: Command[] = [];
        
        if (!ball.ownerPlayerId) return [];

        const owner = [...homeTeam.players, ...awayTeam.players].find(p => p.id === ball.ownerPlayerId);
        if (!owner) return [];

        const opponents = owner.team === "home" ? awayTeam.players : homeTeam.players;

        for (const opp of opponents) {
            const dist = distVec(opp.pos, owner.pos);
            
            if (dist < BALANCE.TACKLE_RANGE + 8 && opp.kickCooldown === 0) {
                commands.push(...this.executeTackle(opp, owner, ctx));
                break; 
            }
        }
        
        return commands;
    }

    private executeTackle(tackler: Player, owner: Player, ctx: SimulationContext): Command[] {
        const { rng, state } = ctx;
        const commands: Command[] = [];
        
        const tackleSkill = (tackler.attributes.tackling * 0.7 + tackler.attributes.strength * 0.3) / 100;
        const retainSkill = (owner.attributes.strength * 0.6 + owner.attributes.balance * 0.4) / 100;
        const successProb = 0.4 + (tackleSkill - retainSkill) * 0.4;
        
        if (rng.next() < successProb) {
            const awayFromOwner = normVec(subVec(tackler.pos, owner.pos));
            const looseDirection = normVec({
                x: awayFromOwner.x + rng.nextFloat(-0.45, 0.45),
                y: awayFromOwner.y + rng.nextFloat(-0.45, 0.45),
            });
            const loosePos = addVec(tackler.pos, scaleVec(looseDirection, 10));
            
            commands.push({
                type: "UPDATE_BALL",
                pos: loosePos,
                vel: scaleVec(looseDirection, 1.8),
                height: 0,
                heightVel: 0,
                ownerPlayerId: null,
                lastTouchedBy: tackler.id,
                lastTouchedTeam: tackler.team,
            } as UpdateBallCommand);

            commands.push({
                type: "SET_PLAYER_DECISION",
                playerId: tackler.id,
                decision: null,
                cooldown: 25
            } as SetPlayerDecisionCommand);

            ctx.events.emit({
                id: mkEventId(),
                type: "tackle",
                minute: state.minute,
                second: state.second,
                teamId: tackler.team,
                playerId: tackler.id,
                playerName: tackler.name,
                description: `${tackler.name} wins the ball with a tackle!`,
                pos: { ...tackler.pos }
            });
        } else {
            commands.push({
                type: "SET_PLAYER_DECISION",
                playerId: tackler.id,
                decision: null,
                cooldown: BALANCE.TACKLE_COOLDOWN
            } as SetPlayerDecisionCommand);
        }
        
        return commands;
    }
}
