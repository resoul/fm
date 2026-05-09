import { Player, AIDecision, Vec2 } from "./types";
import { SimulationContext } from "./context";
import { distVec, PHYSICS } from "./physics";
import { calculateXG } from "./xg";

/**
 * AIAction defines a discrete behavior that a player can perform.
 * This allows for easy scaling of AI logic (e.g. adding 'DribbleAction', 'ClearAction').
 */
export interface AIAction {
    name: string;
    /** Calculates a score (0-1+) for how desirable this action is */
    score(player: Player, ctx: SimulationContext): number;
    /** Returns the decision data to be executed later */
    getDecision(player: Player, ctx: SimulationContext): AIDecision;
}

// ── Shoot Action ──────────────────────────────────────────
export class ShootAction implements AIAction {
    name = "shoot";

    score(player: Player, ctx: SimulationContext): number {
        if (!player.hasBall) return 0;
        
        const { width, height } = ctx.config.fieldDimensions;
        const goalX = player.team === "home" ? width : 0;
        const goalY = height / 2;
        
        const dist = distVec(player.pos, { x: goalX, y: goalY });
        if (dist > 200) return 0;

        // Base score decreases with distance
        let score = Math.max(0, 0.65 - dist / 160);
        
        // Bonus for being central
        const lateralDist = Math.abs(player.pos.y - goalY);
        score *= (1 - lateralDist / (height / 2));

        // Penalty for defenders in the way (using Spatial Hash)
        const nearbyDefenders = ctx.spatialHash.queryRadius(player.pos, 50)
            .filter(p => p.team !== player.team);
        score *= Math.pow(0.8, nearbyDefenders.length);

        return score;
    }

    getDecision(player: Player, ctx: SimulationContext): AIDecision {
        const { width, height } = ctx.config.fieldDimensions;
        const goalX = player.team === "home" ? width : 0;
        const target: Vec2 = { x: goalX, y: height / 2 };
        
        const xG = calculateXG(
            player, 
            ctx.ball, 
            ctx.config.fieldDimensions, 
            ctx.awayTeam.players, // Simplified defender list for now
            [...ctx.homeTeam.players, ...ctx.awayTeam.players].find(p => p.position === "GK" && p.team !== player.team)
        );

        return { type: "shoot", target, xG };
    }
}

// ── Pass Action ───────────────────────────────────────────
export class PassAction implements AIAction {
    name = "pass";

    score(player: Player, ctx: SimulationContext): number {
        if (!player.hasBall) return 0;
        
        // If team is leading late, pass more (placeholder logic)
        const scoreBonus = 0.4;
        return scoreBonus;
    }

    getDecision(player: Player, ctx: SimulationContext): AIDecision {
        const teammates = (player.team === "home" ? ctx.homeTeam : ctx.awayTeam).players
            .filter(p => p.id !== player.id);
        
        // Find teammate closest to goal
        const { width } = ctx.config.fieldDimensions;
        const goalX = player.team === "home" ? width : 0;
        
        let bestTarget = teammates[0];
        let minDistToGoal = distVec(teammates[0].pos, { x: goalX, y: ctx.config.fieldDimensions.height / 2 });

        for (const p of teammates) {
            const d = distVec(p.pos, { x: goalX, y: ctx.config.fieldDimensions.height / 2 });
            if (d < minDistToGoal) {
                minDistToGoal = d;
                bestTarget = p;
            }
        }

        return { type: "pass", target: bestTarget.pos, targetPlayerId: bestTarget.id };
    }
}

// ── Dribble Action ────────────────────────────────────────
export class DribbleAction implements AIAction {
    name = "dribble";

    score(player: Player, ctx: SimulationContext): number {
        if (!player.hasBall) return 0;
        return 0.3; // Always a fallback
    }

    getDecision(player: Player, ctx: SimulationContext): AIDecision {
        const { width, height } = ctx.config.fieldDimensions;
        const goalX = player.team === "home" ? width : 0;
        return { type: "dribble", target: { x: goalX, y: height / 2 } };
    }
}

/**
 * UtilityAI Registry and Orchestrator
 */
export class UtilityAI {
    private static actions: AIAction[] = [
        new ShootAction(),
        new PassAction(),
        new DribbleAction()
    ];

    static getBestDecision(player: Player, ctx: SimulationContext): AIDecision | null {
        let bestAction: AIAction | null = null;
        let highestScore = -1;

        for (const action of this.actions) {
            const score = action.score(player, ctx);
            if (score > highestScore && score > 0) {
                highestScore = score;
                bestAction = action;
            }
        }

        return bestAction ? bestAction.getDecision(player, ctx) : null;
    }
}
