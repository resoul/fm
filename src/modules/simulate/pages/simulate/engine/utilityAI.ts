import type { Player, AIDecision, Vec2 } from "./types";
import type { SimulationContext } from "./context";
import { distVec } from "./physics";
import { calculateXG } from "./xG";

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
        if (dist > 170) return 0;

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

        const teammates = (player.team === "home" ? ctx.homeTeam : ctx.awayTeam).players
            .filter(p => p.id !== player.id && distVec(player.pos, p.pos) > 35 && distVec(player.pos, p.pos) < 230);

        const pressure = ctx.spatialHash.queryRadius(player.pos, 46)
            .filter(p => p.team !== player.team).length;

        return teammates.length > 0 ? 0.22 + pressure * 0.12 : 0;
    }

    getDecision(player: Player, ctx: SimulationContext): AIDecision {
        const teammates = (player.team === "home" ? ctx.homeTeam : ctx.awayTeam).players
            .filter(p => p.id !== player.id);

        const { width, height } = ctx.config.fieldDimensions;
        const goalX = player.team === "home" ? width : 0;
        const candidates = teammates.filter(p => p.id !== ctx.ball.lastTouchedBy || teammates.length <= 2);
        let bestTarget = candidates[0] ?? teammates[0];
        let bestScore = -Infinity;

        for (const p of candidates.length ? candidates : teammates) {
            const distance = distVec(player.pos, p.pos);
            if (distance < 35 || distance > 230) continue;

            const forward = player.team === "home"
                ? (p.pos.x - player.pos.x) / width
                : (player.pos.x - p.pos.x) / width;
            const centrality = 1 - Math.abs(p.pos.y - height / 2) / (height / 2);
            const supportDistance = 1 - Math.abs(distance - 120) / 120;
            const goalProximity = 1 - distVec(p.pos, { x: goalX, y: height / 2 }) / width;
            const returnPassPenalty = p.id === ctx.ball.lastTouchedBy ? -0.55 : 0;
            const score = forward * 0.4 + centrality * 0.15 + supportDistance * 0.25 + goalProximity * 0.2 + returnPassPenalty;

            if (score > bestScore) {
                bestScore = score;
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
        const pressure = ctx.spatialHash.queryRadius(player.pos, 38)
            .filter(p => p.team !== player.team).length;
        return pressure > 0 ? 0.2 : 0.36;
    }

    getDecision(player: Player, ctx: SimulationContext): AIDecision {
        const { width, height } = ctx.config.fieldDimensions;
        const direction = player.team === "home" ? 1 : -1;
        const targetX = Math.max(24, Math.min(width - 24, player.pos.x + direction * 60));
        const targetY = Math.max(24, Math.min(height - 24, player.pos.y + ctx.rng.nextFloat(-28, 28)));
        return { type: "dribble", target: { x: targetX, y: targetY } };
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
