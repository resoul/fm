import { SimulationContext } from "../context";
import { SimulationSystem } from "../pipeline";
import { 
    PHYSICS, scaleVec, lenVec, addVec, normVec, distVec 
} from "../physics";

export class PhysicsSystem implements SimulationSystem {
    name = "PhysicsSystem";

    update(ctx: SimulationContext): void {
        const { ball, config } = ctx;
        const field = config.fieldDimensions;

        // 1. Update ball free movement
        this.updateBallPhysics(ctx);

        // 2. Handle ball pickup
        this.handleBallPickup(ctx);

        // 3. Handle dribbling (ball follows owner)
        this.handleDribble(ctx);
    }

    private updateBallPhysics(ctx: SimulationContext): void {
        const { ball, config } = ctx;
        const field = config.fieldDimensions;

        // If owned, skip free physics
        if (ball.ownerPlayerId !== null) return;

        // Apply gravity when airborne
        if (ball.height > 0) {
            ball.heightVel -= PHYSICS.BALL_GRAVITY;
            ball.height += ball.heightVel;
            if (ball.height <= 0) {
                ball.height = 0;
                ball.heightVel = -ball.heightVel * PHYSICS.BALL_BOUNCE_DECAY;
                if (Math.abs(ball.heightVel) < 0.3) {
                    ball.heightVel = 0;
                    ball.state = "rolling";
                } else {
                    ball.state = "air";
                }
                // Slow ground speed on bounce
                ball.vel = scaleVec(ball.vel, 0.8);
            }
        }

        // Apply friction
        const friction = ball.height > 0 ? PHYSICS.BALL_AIR_FRICTION : PHYSICS.BALL_FRICTION;
        ball.vel = scaleVec(ball.vel, friction);

        // Stop micro-movement
        if (lenVec(ball.vel) < PHYSICS.BALL_MIN_SPEED) {
            ball.vel = { x: 0, y: 0 };
            ball.state = "ground";
        }

        // Move ball
        ball.pos = addVec(ball.pos, ball.vel);

        // Clamping to extreme limits just to keep the ball from flying to infinity
        const fw = field.width;
        const fh = field.height;
        const limit = 100;

        if (ball.pos.x < -limit) ball.pos.x = -limit;
        if (ball.pos.x > fw + limit) ball.pos.x = fw + limit;
        if (ball.pos.y < -limit) ball.pos.y = -limit;
        if (ball.pos.y > fh + limit) ball.pos.y = fh + limit;
    }

    private handleBallPickup(ctx: SimulationContext): void {
        const { ball, homeTeam, awayTeam } = ctx;
        if (ball.ownerPlayerId !== null) return;

        const allPlayers = [...homeTeam.players, ...awayTeam.players];
        let closest: any = null;
        let closestDist = PHYSICS.CONTROL_RANGE;

        for (const p of allPlayers) {
            if (p.kickCooldown > 8) continue;
            const d = distVec(p.pos, ball.pos);
            if (d < closestDist) { 
                closestDist = d; 
                closest = p; 
            }
        }

        if (closest) {
            for (const p of allPlayers) p.hasBall = false;
            closest.hasBall = true;
            ball.ownerPlayerId = closest.id;
            ball.lastTouchedBy = closest.id;
            ball.lastTouchedTeam = closest.team;
            ball.vel = { x: 0, y: 0 };
        }
    }

    private handleDribble(ctx: SimulationContext): void {
        const { ball, homeTeam, awayTeam } = ctx;
        if (!ball.ownerPlayerId) return;

        const owner = [...homeTeam.players, ...awayTeam.players].find(p => p.id === ball.ownerPlayerId);
        if (!owner) return;

        owner.hasBall = true;
        const offset = normVec(owner.vel);
        const dribOff = distVec({ x: 0, y: 0 }, owner.vel) > 0.1
            ? scaleVec(offset, PHYSICS.DRIBBLE_DISTANCE)
            : { x: 0, y: 0 };

        ball.pos = addVec(owner.pos, dribOff);
        ball.vel = { x: 0, y: 0 };
    }
}
