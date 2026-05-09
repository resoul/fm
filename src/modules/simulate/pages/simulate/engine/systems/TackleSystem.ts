import type { SimulationContext } from "../context";
import type { SimulationSystem } from "../pipeline";
import { distVec } from "../physics";
import { BALANCE } from "../balance";

let eventCounter = 5000;
function mkEventId() { return `evt_${++eventCounter}`; }

export class TackleSystem implements SimulationSystem {
    name = "TackleSystem";

    update(ctx: SimulationContext): void {
        const { homeTeam, awayTeam, ball } = ctx;
        
        // Only check if ball has an owner
        if (!ball.ownerPlayerId) return;

        const owner = [...homeTeam.players, ...awayTeam.players].find(p => p.id === ball.ownerPlayerId);
        if (!owner) return;

        const opponents = owner.team === "home" ? awayTeam.players : homeTeam.players;

        for (const opp of opponents) {
            const dist = distVec(opp.pos, owner.pos);
            
            // Check for tackle attempt range
            if (dist < BALANCE.TACKLE_RANGE && opp.kickCooldown === 0) {
                this.executeTackle(opp, owner, ctx);
                break; 
            }
        }
    }

    private executeTackle(tackler: any, owner: any, ctx: SimulationContext): void {
        const { rng, events, ball, state } = ctx;
        
        // TACKLING vs STRENGTH/BALANCE
        const tackleSkill = (tackler.attributes.tackling * 0.7 + tackler.attributes.strength * 0.3) / 100;
        const retainSkill = (owner.attributes.strength * 0.6 + owner.attributes.balance * 0.4) / 100;
        
        const successProb = 0.4 + (tackleSkill - retainSkill) * 0.4;
        
        if (rng.next() < successProb) {
            // Tackle success
            owner.hasBall = false;
            ball.ownerPlayerId = null;
            ball.lastTouchedBy = tackler.id;
            ball.lastTouchedTeam = tackler.team;
            
            // Ball gets knocked loose
            const dir = { x: rng.nextFloat(-1, 1), y: rng.nextFloat(-1, 1) };
            ball.vel = { x: dir.x * 3, y: dir.y * 3 };

            events.emit({
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

            tackler.kickCooldown = 25;
        } else {
            // Tackle fail (cooldown for tackler)
            tackler.kickCooldown = BALANCE.TACKLE_COOLDOWN;
        }
    }
}
