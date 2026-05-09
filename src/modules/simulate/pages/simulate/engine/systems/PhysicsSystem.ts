import type { SimulationContext } from "../context";
import type { SimulationSystem } from "../pipeline";
import { 
    PHYSICS, scaleVec, lenVec, addVec, normVec, distVec 
} from "../physics";
import type { Command, UpdateBallCommand } from "../core/Command";
import type { Ball, FieldDimensions, Player, Team } from "../types";

export class PhysicsSystem implements SimulationSystem {
    name = "PhysicsSystem";

    update(ctx: SimulationContext): Command[] {
        const { ball, config, homeTeam, awayTeam } = ctx;
        const field = config.fieldDimensions;
        
        let newBall = { ...ball };
        const commands: Command[] = [];

        // 1. Update ball free movement
        this.updateBallPhysics(newBall, field);

        // 2. Handle ball pickup
        const pickup = this.handleBallPickup(newBall, homeTeam, awayTeam);
        if (pickup) {
            newBall = { ...newBall, ...pickup };
        }

        // 3. Handle dribbling
        const dribble = this.handleDribble(newBall, homeTeam, awayTeam);
        if (dribble) {
            newBall = { ...newBall, ...dribble };
        }

        commands.push({
            type: "UPDATE_BALL",
            ...newBall
        } as UpdateBallCommand);

        return commands;
    }

    private updateBallPhysics(ball: Ball, field: FieldDimensions): void {
        if (ball.ownerPlayerId !== null) return;

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
                ball.vel = scaleVec(ball.vel, 0.8);
            }
        }

        const friction = ball.height > 0 ? PHYSICS.BALL_AIR_FRICTION : PHYSICS.BALL_FRICTION;
        ball.vel = scaleVec(ball.vel, friction);

        if (lenVec(ball.vel) < PHYSICS.BALL_MIN_SPEED) {
            ball.vel = { x: 0, y: 0 };
            ball.state = "ground";
        }

        ball.pos = addVec(ball.pos, ball.vel);
        
        const fw = field.width;
        const fh = field.height;
        const limit = 100;
        if (ball.pos.x < -limit) ball.pos.x = -limit;
        if (ball.pos.x > fw + limit) ball.pos.x = fw + limit;
        if (ball.pos.y < -limit) ball.pos.y = -limit;
        if (ball.pos.y > fh + limit) ball.pos.y = fh + limit;
    }

    private handleBallPickup(ball: Ball, homeTeam: Team, awayTeam: Team): Partial<Ball> | null {
        if (ball.ownerPlayerId !== null) return null;

        const allPlayers = [...homeTeam.players, ...awayTeam.players];
        let closest: Player | null = null;
        let closestDist: number = PHYSICS.CONTROL_RANGE;

        const ballSpeed = lenVec(ball.vel);
        for (const p of allPlayers) {
            if (p.kickCooldown > 12) continue;
            if (ball.lastTouchedBy === p.id && ballSpeed > 1.2) continue;
            const d = distVec(p.pos, ball.pos);
            if (d < closestDist) { 
                closestDist = d; 
                closest = p; 
            }
        }

        if (closest) {
            return {
                ownerPlayerId: closest.id,
                lastTouchedBy: closest.id,
                lastTouchedTeam: closest.team,
                vel: { x: 0, y: 0 }
            };
        }
        return null;
    }

    private handleDribble(ball: Ball, homeTeam: Team, awayTeam: Team): Partial<Ball> | null {
        if (!ball.ownerPlayerId) return null;

        const owner = [...homeTeam.players, ...awayTeam.players].find(p => p.id === ball.ownerPlayerId);
        if (!owner) return null;

        const offset = normVec(owner.vel);
        const dribOff = distVec({ x: 0, y: 0 }, owner.vel) > 0.1
            ? scaleVec(offset, PHYSICS.DRIBBLE_DISTANCE)
            : { x: 0, y: 0 };

        return {
            pos: addVec(owner.pos, dribOff),
            vel: { x: 0, y: 0 }
        };
    }
}
