import type { SimulationContext } from "../context";
import type { SimulationSystem } from "../pipeline";
import { UtilityAI } from "../utilityAI";
import { BALANCE } from "../balance";
import { Command } from "../core/Command";

/**
 * DecisionSystem handles high-level AI reasoning.
 * It determines WHAT a player wants to do and returns commands.
 */
export class DecisionSystem implements SimulationSystem {
    name = "DecisionSystem";

    update(ctx: SimulationContext): Command[] {
        const { homeTeam, awayTeam } = ctx;
        const allPlayers = [...homeTeam.players, ...awayTeam.players];
        const commands: Command[] = [];

        for (const player of allPlayers) {
            // 1. Manage cooldowns
            if (player.actionCooldown > 0) {
                player.actionCooldown--;
                continue;
            }

            // 2. Goalkeepers have specialized logic
            if (player.position === "GK") continue;

            // 3. Make a decision
            const decision = UtilityAI.getBestDecision(player, ctx);
            
            // 4. Create command
            commands.push({
                type: "SET_PLAYER_DECISION",
                playerId: player.id,
                decision: decision,
                cooldown: ctx.rng.nextInt(
                    BALANCE.ACTION_COOLDOWN_MIN, 
                    BALANCE.ACTION_COOLDOWN_MAX
                )
            });
        }
        
        return commands;
    }
}
