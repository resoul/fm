import type { SimulationContext } from "../context";
import type { SimulationSystem } from "../pipeline";
import { distVec, normVec, subVec, scaleVec } from "../physics";
import type { Player, Vec2 } from "../types";

export class GoalkeeperSystem implements SimulationSystem {
    name = "GoalkeeperSystem";

    update(ctx: SimulationContext): void {
        const { homeTeam, awayTeam } = ctx;
        
        const homeGK = homeTeam.players.find(p => p.position === "GK");
        const awayGK = awayTeam.players.find(p => p.position === "GK");

        if (homeGK) this.updateGK(homeGK, ctx);
        if (awayGK) this.updateGK(awayGK, ctx);
    }

    private updateGK(gk: Player, ctx: SimulationContext): void {
        const { ball, config } = ctx;
        const field = config.fieldDimensions;
        const isHome = gk.team === "home";
        
        const goalX = isHome ? 0 : field.width;
        const goalCenter: Vec2 = { x: goalX, y: field.height / 2 };

        // 1. If GK has ball → Clearance
        if (gk.hasBall && gk.kickCooldown === 0) {
            this.executeClearance(gk, ctx);
            return;
        }

        const ballDist = distVec(gk.pos, ball.pos);

        // 2. Position on the "line" between ball and goal center
        const toBall = subVec(ball.pos, goalCenter);
        const distToBall = distVec(ball.pos, goalCenter);
        
        // Stay 15-40px away from goal line depending on ball distance (POSITIONING)
        const positioningBonus = (gk.attributes.positioning / 100) * 10;
        const stayDist = Math.min(60, 15 + distToBall * 0.05 + positioningBonus);
        
        const normToBall = normVec(toBall);
        const target = {
            x: goalCenter.x + normToBall.x * stayDist,
            y: goalCenter.y + normToBall.y * stayDist,
        };

        // 3. Aggressive rushing if ball is very close (RUSHING OUT attribute)
        const rushingThreshold = 80 + (gk.attributes.rushingOut / 100) * 60;
        if (ballDist < rushingThreshold && ball.ownerPlayerId === null && ball.height < 15) {
            gk.targetPos = { ...ball.pos };
            gk.state = "defending";
        } else {
            gk.targetPos = target;
            gk.state = "idle";
        }
    }

    private executeClearance(gk: Player, ctx: SimulationContext): void {
        const { ball, config, rng } = ctx;
        const targetX = gk.team === "home" ? config.fieldDimensions.width * 0.45 : config.fieldDimensions.width * 0.55;
        const targetY = config.fieldDimensions.height / 2 + rng.nextFloat(-100, 100);
        
        const dir = normVec(subVec({ x: targetX, y: targetY }, gk.pos));
        const force = 9 + (gk.attributes.kicking / 100) * 8;
        
        // Goalkeepers typically loft clearances
        const loft = 0.25;
        
        const hFactor = Math.cos(loft);
        ball.vel = scaleVec(dir, force * hFactor);
        ball.height = 0;
        ball.heightVel = force * Math.sin(loft);
        ball.state = "air";
        ball.ownerPlayerId = null;
        ball.lastTouchedBy = gk.id;
        ball.lastTouchedTeam = gk.team;
        
        gk.hasBall = false;
        gk.kickCooldown = 60;
        gk.state = "passing";
    }
}
