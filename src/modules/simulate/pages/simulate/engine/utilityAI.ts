import type { Player, AIDecision, Vec2 } from "./types";
import type { SimulationContext } from "./context";
import { distVec } from "./physics";
import { calculateXG } from "./xG";

/**
 * AIAction — a discrete behaviour a player can perform.
 * score() returns 0-1+ desirability; getDecision() returns the concrete plan.
 */
export interface AIAction {
    name: string;
    score(player: Player, ctx: SimulationContext): number;
    getDecision(player: Player, ctx: SimulationContext): AIDecision;
}

// ── Shoot ─────────────────────────────────────────────────

export class ShootAction implements AIAction {
    name = "shoot";

    score(player: Player, ctx: SimulationContext): number {
        if (!player.hasBall) return 0;

        const { width, height } = ctx.config.fieldDimensions;
        const goalX = player.team === "home" ? width : 0;
        const goalY = height / 2;

        const dist = distVec(player.pos, { x: goalX, y: goalY });
        if (dist > 170) return 0;

        let score = Math.max(0, 0.65 - dist / 160);

        // Bonus for central position
        const lateralDist = Math.abs(player.pos.y - goalY);
        score *= 1 - lateralDist / (height / 2);

        // Penalty for defenders in the way
        const nearbyDefenders = ctx.spatialHash
            .queryRadius(player.pos, 50)
            .filter(p => p.team !== player.team);
        score *= Math.pow(0.8, nearbyDefenders.length);

        // Attacking transition phase boosts shooting urgency slightly
        const tacticalState = player.team === "home"
            ? ctx.tactical.homeState
            : ctx.tactical.awayState;
        if (tacticalState.phase === "transition_attack") {
            score *= 1.15;
        }

        return score;
    }

    getDecision(player: Player, ctx: SimulationContext): AIDecision {
        const { width, height } = ctx.config.fieldDimensions;
        const goalX = player.team === "home" ? width : 0;
        const target: Vec2 = { x: goalX, y: height / 2 };

        const allPlayers = [...ctx.homeTeam.players, ...ctx.awayTeam.players];
        const xG = calculateXG(
            player,
            ctx.ball,
            ctx.config.fieldDimensions,
            allPlayers.filter(p => p.team !== player.team),
            allPlayers.find(p => p.position === "GK" && p.team !== player.team),
        );

        return { type: "shoot", target, xG };
    }
}

// ── Pass ──────────────────────────────────────────────────

export class PassAction implements AIAction {
    name = "pass";

    score(player: Player, ctx: SimulationContext): number {
        if (!player.hasBall) return 0;

        const teammates = (player.team === "home" ? ctx.homeTeam : ctx.awayTeam).players.filter(
            p => p.id !== player.id &&
                distVec(player.pos, p.pos) > 35 &&
                distVec(player.pos, p.pos) < 230,
        );

        if (teammates.length === 0) return 0;

        const pressure = ctx.spatialHash
            .queryRadius(player.pos, 46)
            .filter(p => p.team !== player.team).length;

        // Base score increased by pressure
        let score = 0.22 + pressure * 0.12;

        // Bonus if at least one passing lane to a forward teammate is open
        const openLaneToForward = this.hasOpenForwardLane(player, ctx);
        if (openLaneToForward) score += 0.18;

        return score;
    }

    getDecision(player: Player, ctx: SimulationContext): AIDecision {
        const teammates = (player.team === "home" ? ctx.homeTeam : ctx.awayTeam).players.filter(
            p => p.id !== player.id,
        );

        const { width, height } = ctx.config.fieldDimensions;
        const goalX = player.team === "home" ? width : 0;
        const isHome = player.team === "home";

        // Pull spatial data once for penalty calculations
        const spaceData = ctx.tactical.spaceAwareness;
        const pressureZones = spaceData?.pressureZones ?? [];
        const defensiveLine = spaceData?.defensiveLine;

        const candidates = teammates.filter(
            p => p.id !== ctx.ball.lastTouchedBy || teammates.length <= 2,
        );
        let bestTarget = candidates[0] ?? teammates[0];
        let bestScore = -Infinity;

        for (const p of candidates.length ? candidates : teammates) {
            const distance = distVec(player.pos, p.pos);
            if (distance < 35 || distance > 230) continue;

            const forward = isHome
                ? (p.pos.x - player.pos.x) / width
                : (player.pos.x - p.pos.x) / width;
            const centrality = 1 - Math.abs(p.pos.y - height / 2) / (height / 2);
            const supportDistance = 1 - Math.abs(distance - 120) / 120;
            const goalProximity = 1 - distVec(p.pos, { x: goalX, y: height / 2 }) / width;
            const returnPassPenalty = p.id === ctx.ball.lastTouchedBy ? -0.55 : 0;

            // Passing lane quality bonus: prefer open lanes
            const laneBonus = this.laneScore(player.id, p.id, ctx);

            // Pressure zone penalty: penalise passing into opponent-dominated zones
            const pressurePenalty = this.pressurePenalty(p.pos, pressureZones, player.team);

            // Defensive line penalty: penalise through-balls behind the line
            // when no one has made a run (risky if receiver will be offside)
            const defLinePenalty = this.defensiveLinePenalty(p, isHome, defensiveLine);

            const score =
                forward * 0.35 +
                centrality * 0.12 +
                supportDistance * 0.22 +
                goalProximity * 0.18 +
                laneBonus * 0.13 +
                returnPassPenalty +
                pressurePenalty +
                defLinePenalty;

            if (score > bestScore) {
                bestScore = score;
                bestTarget = p;
            }
        }

        return { type: "pass", target: bestTarget.pos, targetPlayerId: bestTarget.id };
    }

    /**
     * Penalty for passing into a zone dominated by the opponent.
     * Returns 0 to -0.35.
     */
    private pressurePenalty(
        targetPos: Vec2,
        pressureZones: import("./ai/SpaceAwareness").PressureZone[],
        team: string,
    ): number {
        const opponentSide = team === "home" ? "away" : "home";
        let maxPressure = 0;
        for (const zone of pressureZones) {
            if (zone.dominatedBy !== opponentSide) continue;
            const d = distVec(targetPos, zone.pos);
            if (d < 50) {
                const proximity = 1 - d / 50;
                maxPressure = Math.max(maxPressure, zone.intensity * proximity);
            }
        }
        return -maxPressure * 0.35;
    }

    /**
     * Penalty for playing a through-ball beyond the opponent defensive line
     * when the receiver is behind it (likely offside / very risky).
     * Returns 0 to -0.25.
     */
    private defensiveLinePenalty(
        receiver: Player,
        isHome: boolean,
        defensiveLine: { home: number; away: number } | undefined,
    ): number {
        if (!defensiveLine) return 0;
        if (isHome && receiver.pos.x > defensiveLine.away + 20) return -0.20;
        if (!isHome && receiver.pos.x < defensiveLine.home - 20) return -0.20;
        return 0;
    }

    /** Returns true if there's at least one open lane to a teammate ahead of the ball */
    private hasOpenForwardLane(player: Player, ctx: SimulationContext): boolean {
        if (!ctx.tactical.passingLanes.length) return false;
        const isHome = player.team === "home";
        const allPlayers = [...ctx.homeTeam.players, ...ctx.awayTeam.players];

        return ctx.tactical.passingLanes.some(lane => {
            if (!lane.open || lane.from !== player.id) return false;
            const target = allPlayers.find(p => p.id === lane.to);
            if (!target) return false;
            // "Forward" means closer to opponent goal
            return isHome
                ? target.pos.x > player.pos.x
                : target.pos.x < player.pos.x;
        });
    }

    /** 0 = blocked, 0.5 = unknown, 1 = open lane */
    private laneScore(fromId: string, toId: string, ctx: SimulationContext): number {
        const lane = ctx.tactical.passingLanes.find(
            l => l.from === fromId && l.to === toId,
        );
        if (!lane) return 0.5;
        return lane.open ? 1.0 : 0.0;
    }
}

// ── Dribble ───────────────────────────────────────────────

export class DribbleAction implements AIAction {
    name = "dribble";

    score(player: Player, ctx: SimulationContext): number {
        if (!player.hasBall) return 0;

        const pressure = ctx.spatialHash
            .queryRadius(player.pos, 38)
            .filter(p => p.team !== player.team).length;

        const tacticalState = player.team === "home"
            ? ctx.tactical.homeState
            : ctx.tactical.awayState;

        // In transition attack, dribbling into space is very desirable
        if (tacticalState.phase === "transition_attack") {
            return pressure === 0 ? 0.52 : 0.24;
        }

        // Under pressure: dribbling is risky, prefer pass
        // No pressure: comfortable carry forward
        return pressure > 0 ? 0.18 : 0.36;
    }

    getDecision(player: Player, ctx: SimulationContext): AIDecision {
        const { width, height } = ctx.config.fieldDimensions;
        const direction = player.team === "home" ? 1 : -1;

        const tacticalState = player.team === "home"
            ? ctx.tactical.homeState
            : ctx.tactical.awayState;

        // In transition: sprint further ahead
        const runDepth = tacticalState.phase === "transition_attack" ? 80 : 60;

        const targetX = Math.max(24, Math.min(width - 24, player.pos.x + direction * runDepth));
        const targetY = Math.max(
            24,
            Math.min(height - 24, player.pos.y + ctx.rng.nextFloat(-28, 28)),
        );

        return { type: "dribble", target: { x: targetX, y: targetY } };
    }
}

// ── Hold ──────────────────────────────────────────────────

/**
 * HoldAction: player retains the ball and shields it.
 * Useful when under light pressure with no good pass/shot option,
 * or when teammates are making runs (in_possession phase with low urgency).
 */
export class HoldAction implements AIAction {
    name = "hold";

    score(player: Player, ctx: SimulationContext): number {
        if (!player.hasBall) return 0;

        const pressure = ctx.spatialHash
            .queryRadius(player.pos, 46)
            .filter(p => p.team !== player.team).length;

        // Only hold when under 1-2 defenders — more means too risky
        if (pressure === 0 || pressure > 2) return 0;

        const tacticalState = player.team === "home"
            ? ctx.tactical.homeState
            : ctx.tactical.awayState;

        // Hold makes most sense when team is building up possession
        if (tacticalState.phase !== "in_possession") return 0;

        // Player must have decent composure and strength to shield effectively
        const shieldAbility =
            (player.attributes.composure * 0.6 + player.attributes.strength * 0.4) / 100;

        // Base score: shielding ability minus pressure intensity
        return Math.max(0, shieldAbility * 0.35 - tacticalState.pressureIntensity * 0.15);
    }

    getDecision(player: Player, ctx: SimulationContext): AIDecision {
        const { width, height } = ctx.config.fieldDimensions;
        // Shield: drift slightly sideways to body-block nearest defender
        const defenders = ctx.spatialHash
            .queryRadius(player.pos, 46)
            .filter(p => p.team !== player.team);

        if (defenders.length > 0) {
            const nearest = defenders[0];
            // Move slightly away from the defender while staying on field
            const awayX = player.pos.x + (player.pos.x - nearest.pos.x) * 0.2;
            const awayY = player.pos.y + (player.pos.y - nearest.pos.y) * 0.2;
            return {
                type: "move",
                target: {
                    x: Math.max(20, Math.min(width - 20, awayX)),
                    y: Math.max(20, Math.min(height - 20, awayY)),
                },
            };
        }

        // No defenders close — just hold position
        return { type: "move", target: { ...player.pos } };
    }
}

// ── Registry & Orchestrator ───────────────────────────────

export class UtilityAI {
    private static actions: AIAction[] = [
        new ShootAction(),
        new PassAction(),
        new DribbleAction(),
        new HoldAction(),
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

    /** Register a custom action — allows external extension without modifying core */
    static registerAction(action: AIAction): void {
        this.actions.push(action);
    }
}