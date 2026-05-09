import type { SimulationContext } from "../context";
import type { SimulationSystem } from "../pipeline";
import { distVec } from "../physics";
import { BALANCE } from "../balance";
import { Command, SetPlayerDecisionCommand, KickBallCommand } from "../core/Command";
import { Player } from "../types";

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
            
            if (dist < BALANCE.TACKLE_RANGE && opp.kickCooldown === 0) {
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
            // Tackle success - emit loose ball command via KICK_BALL with low force
            const dir = { x: rng.nextFloat(-1, 1), y: rng.nextFloat(-1, 1) };
            
            commands.push({
                type: "KICK_BALL",
                playerId: tackler.id,
                targetPos: { x: tackler.pos.x + dir.x * 50, y: tackler.pos.y + dir.y * 50 },
                force: 0.5
            } as KickBallCommand);

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
