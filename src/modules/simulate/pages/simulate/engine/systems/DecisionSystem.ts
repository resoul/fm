import type { SimulationContext } from "../context";
import type { SimulationSystem } from "../pipeline";
import { UtilityAI } from "../utilityAI";
import { BALANCE } from "../balance";

/**
 * DecisionSystem handles high-level AI reasoning.
 * It determines WHAT a player wants to do and stores it in player.nextDecision.
 */
export class DecisionSystem implements SimulationSystem {
    name = "DecisionSystem";

    update(ctx: SimulationContext): void {
        const { homeTeam, awayTeam } = ctx;
        const allPlayers = [...homeTeam.players, ...awayTeam.players];

        for (const player of allPlayers) {
            // 1. Manage cooldowns
            if (player.actionCooldown > 0) {
                player.actionCooldown--;
                continue;
            }

            // 2. Goalkeepers have specialized logic (handled by GoalkeeperSystem)
            if (player.position === "GK") continue;

            // 3. Make a decision
            const decision = UtilityAI.getBestDecision(player, ctx);
            player.nextDecision = decision;

            // 4. Set cooldown for next decision
            player.actionCooldown = ctx.rng.nextInt(
                BALANCE.ACTION_COOLDOWN_MIN, 
                BALANCE.ACTION_COOLDOWN_MAX
            );
        }
    }
}
