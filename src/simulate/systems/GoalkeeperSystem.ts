import type { SimulationContext } from "../context";
import type { SimulationSystem } from "../pipeline";
import { distVec, normVec, subVec } from "../physics";
import type { Player, Vec2 } from "../types";
import type { Command, KickBallCommand, SetPlayerDecisionCommand, SetPlayerStateCommand } from "../core/Command";

/**
 * GoalkeeperSystem — B.4 Attribute → GoalkeeperSystem Mapping
 *
 * Attributes now wired to concrete GK decisions:
 *
 *   reflexes        → base positioning reaction speed (stayDist tightness)
 *   handling        → probability of a clean catch vs parry on shot saves
 *                     (used as a multiplier in xG save factor — see xG.ts)
 *   positioning     → how precisely GK angles toward ball threat
 *   rushingOut      → range and willingness to come for loose balls / 1v1s
 *   oneOnOnes       → extended rush range when ball-carrier is in 1v1
 *   aerialReach     → threshold distance for coming for aerial balls
 *   commandOfArea   → coverage radius for aerial claims
 *   kicking         → clearance distance and accuracy
 */
export class GoalkeeperSystem implements SimulationSystem {
    name = "GoalkeeperSystem";

    update(ctx: SimulationContext): Command[] {
        const { homeTeam, awayTeam } = ctx;
        const commands: Command[] = [];

        const homeGK = homeTeam.players.find(p => p.position === "GK");
        const awayGK = awayTeam.players.find(p => p.position === "GK");

        if (homeGK) commands.push(...this.updateGK(homeGK, ctx));
        if (awayGK) commands.push(...this.updateGK(awayGK, ctx));

        return commands;
    }

    private updateGK(gk: Player, ctx: SimulationContext): Command[] {
        const { ball, config } = ctx;
        const field = config.fieldDimensions;
        const isHome = gk.team === "home";
        const commands: Command[] = [];

        const goalX = isHome ? 0 : field.width;
        const goalCenter: Vec2 = { x: goalX, y: field.height / 2 };

        // 1. If GK has ball → Clearance / distribution
        if (gk.hasBall && gk.kickCooldown === 0) {
            return this.executeClearance(gk, ctx);
        }

        const ballDist = distVec(gk.pos, ball.pos);

        // ── B.4 Positioning line ──────────────────────────────
        // reflexes → tighter angle-to-ball tracking (faster re-centering)
        // positioning → fine-tuned stayDist calculation
        const toBall = subVec(ball.pos, goalCenter);
        const distToBall = distVec(ball.pos, goalCenter);

        const positioningQuality = gk.attributes.positioning / 100;
        const reflexQuality = gk.attributes.reflexes / 100;
        // Tighter stayDist for high-positioning GKs (they hold a better angle)
        const stayDist = Math.min(
            55 + positioningQuality * 10,
            12 + distToBall * (0.04 + reflexQuality * 0.03) + positioningQuality * 8,
        );

        const normToBall = normVec(toBall);
        const target = {
            x: goalCenter.x + normToBall.x * stayDist,
            y: goalCenter.y + normToBall.y * stayDist,
        };

        // ── B.4 Rush logic ────────────────────────────────────
        // rushingOut → base threshold for claiming loose balls
        // oneOnOnes  → additional bonus when a ball-carrier is in 1v1 danger
        const allPlayers = [...ctx.homeTeam.players, ...ctx.awayTeam.players];
        const isOneOnOne = this.detectOneOnOne(gk, ctx, allPlayers);

        const baseRushRange = 80 + (gk.attributes.rushingOut / 100) * 60;
        // oneOnOnes attribute extends rush range in 1v1 situations
        const oneOnOneBonus = isOneOnOne ? (gk.attributes.oneOnOnes / 100) * 35 : 0;
        const rushingThreshold = baseRushRange + oneOnOneBonus;

        // Aerial claim: commandOfArea + aerialReach gate coming for high balls
        const isAerialBall = ball.height > 20;
        const aerialReachRange = 40 + (gk.attributes.aerialReach / 100) * 30;
        const commandRange = 50 + (gk.attributes.commandOfArea / 100) * 40;
        const shouldClaimAerial = isAerialBall &&
            ballDist < Math.min(aerialReachRange, commandRange) &&
            ball.ownerPlayerId === null;

        const shouldRush =
            (ballDist < rushingThreshold && ball.ownerPlayerId === null && ball.height < 15) ||
            shouldClaimAerial;

        if (shouldRush) {
            gk.targetPos = { ...ball.pos };
            commands.push({
                type: "SET_PLAYER_STATE",
                playerId: gk.id,
                state: "defending",
            } as SetPlayerStateCommand);
        } else {
            gk.targetPos = target;
            commands.push({
                type: "SET_PLAYER_STATE",
                playerId: gk.id,
                state: "idle",
            } as SetPlayerStateCommand);
        }

        return commands;
    }

    /**
     * Detect a 1v1 situation: ball-carrier in the penalty area with
     * no outfield defenders between them and the GK.
     */
    private detectOneOnOne(gk: Player, ctx: SimulationContext, allPlayers: Player[]): boolean {
        const field = ctx.config.fieldDimensions;
        const isHome = gk.team === "home";
        const goalX = isHome ? 0 : field.width;

        const ballCarrier = allPlayers.find(p => p.id === ctx.ball.ownerPlayerId);
        if (!ballCarrier || ballCarrier.team === gk.team) return false;

        const carrierDistToGoal = Math.abs(ballCarrier.pos.x - goalX);
        if (carrierDistToGoal > field.penaltyAreaWidth * 1.5) return false;

        // Count own-team outfield defenders between carrier and goal
        const defenders = allPlayers.filter(p =>
            p.team === gk.team &&
            p.position !== "GK" &&
            (isHome
                ? p.pos.x < ballCarrier.pos.x
                : p.pos.x > ballCarrier.pos.x)
        );

        return defenders.length === 0;
    }

    private executeClearance(gk: Player, ctx: SimulationContext): Command[] {
        const { config, rng } = ctx;
        // B.4 kicking → clearance distance
        const kickPower = 9 + (gk.attributes.kicking / 100) * 8;
        // B.4 handling → less random scatter on distribution
        const handlingQuality = gk.attributes.handling / 100;
        const scatter = rng.nextFloat(-100, 100) * (1 - handlingQuality * 0.5);

        // High-kicking GKs can play longer, more directed clearances
        const clearanceDepth = gk.team === "home"
            ? config.fieldDimensions.width * (0.42 + handlingQuality * 0.08)
            : config.fieldDimensions.width * (0.58 - handlingQuality * 0.08);

        const target = {
            x: clearanceDepth,
            y: config.fieldDimensions.height / 2 + scatter,
        };

        return [
            {
                type: "KICK_BALL",
                playerId: gk.id,
                targetPos: target,
                force: kickPower,
            } as KickBallCommand,
            {
                type: "SET_PLAYER_DECISION",
                playerId: gk.id,
                decision: null,
                cooldown: 60,
            } as SetPlayerDecisionCommand,
            {
                type: "SET_PLAYER_STATE",
                playerId: gk.id,
                state: "passing",
            } as SetPlayerStateCommand,
        ];
    }
}
