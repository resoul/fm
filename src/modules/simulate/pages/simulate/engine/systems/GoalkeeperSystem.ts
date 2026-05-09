import { SimulationContext } from "../context";
import { SimulationSystem } from "../pipeline";
import { distVec, normVec, subVec } from "../physics";
import { Player, Vec2 } from "../types";
import { Command, KickBallCommand, SetPlayerDecisionCommand, SetPlayerStateCommand, MovePlayerCommand } from "../core/Command";

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

        // 1. If GK has ball → Clearance
        if (gk.hasBall && gk.kickCooldown === 0) {
            return this.executeClearance(gk, ctx);
        }

        const ballDist = distVec(gk.pos, ball.pos);

        // 2. Position on the "line" between ball and goal center
        const toBall = subVec(ball.pos, goalCenter);
        const distToBall = distVec(ball.pos, goalCenter);
        
        const positioningBonus = (gk.attributes.positioning / 100) * 10;
        const stayDist = Math.min(60, 15 + distToBall * 0.05 + positioningBonus);
        
        const normToBall = normVec(toBall);
        const target = {
            x: goalCenter.x + normToBall.x * stayDist,
            y: goalCenter.y + normToBall.y * stayDist,
        };

        // 3. Aggressive rushing if ball is very close
        const rushingThreshold = 80 + (gk.attributes.rushingOut / 100) * 60;
        if (ballDist < rushingThreshold && ball.ownerPlayerId === null && ball.height < 15) {
            // Instead of MOVE_PLAYER, we update targetPos which MovementSystem uses
            // But we can also emit a SET_PLAYER_STATE
            gk.targetPos = { ...ball.pos }; 
            commands.push({
                type: "SET_PLAYER_STATE",
                playerId: gk.id,
                state: "defending"
            } as SetPlayerStateCommand);
        } else {
            gk.targetPos = target;
            commands.push({
                type: "SET_PLAYER_STATE",
                playerId: gk.id,
                state: "idle"
            } as SetPlayerStateCommand);
        }
        
        return commands;
    }

    private executeClearance(gk: Player, ctx: SimulationContext): Command[] {
        const { config, rng } = ctx;
        const targetX = gk.team === "home" ? config.fieldDimensions.width * 0.45 : config.fieldDimensions.width * 0.55;
        const targetY = config.fieldDimensions.height / 2 + rng.nextFloat(-100, 100);
        
        const target = { x: targetX, y: targetY };
        
        return [
            {
                type: "KICK_BALL",
                playerId: gk.id,
                targetPos: target,
                force: 9 + (gk.attributes.kicking / 100) * 8
            } as KickBallCommand,
            {
                type: "SET_PLAYER_DECISION",
                playerId: gk.id,
                decision: null,
                cooldown: 60
            } as SetPlayerDecisionCommand,
            {
                type: "SET_PLAYER_STATE",
                playerId: gk.id,
                state: "passing"
            } as SetPlayerStateCommand
        ];
    }
}
