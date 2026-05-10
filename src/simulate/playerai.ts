import type { AIDecision, Ball, FieldDimensions, Player, Vec2 } from "./types";
import { distVec } from "./physics";

export function getGoalkeeperDecision(
    player: Player,
    ball: Ball,
    field: FieldDimensions,
): AIDecision {
    const goalX = player.team === "home" ? 0 : field.width;
    const goalCenterY = field.height / 2;

    if (player.hasBall || ball.ownerPlayerId === player.id) {
        return {
            type: "clearance",
            target: { x: field.width / 2, y: goalCenterY },
            force: 14,
        };
    }

    return {
        type: "move",
        target: {
            x: goalX + (player.team === "home" ? 24 : -24),
            y: goalCenterY + (ball.pos.y - goalCenterY) * 0.45,
        },
    };
}

export function getSupportRunTarget(
    player: Player,
    teammates: readonly Player[],
    opponents: readonly Player[],
    field: FieldDimensions,
): Vec2 {
    const attackingRight = player.team === "home";
    const forwardX = attackingRight ? 60 : -60;
    const baseTarget = {
        x: Math.max(20, Math.min(field.width - 20, player.pos.x + forwardX)),
        y: Math.max(20, Math.min(field.height - 20, player.pos.y)),
    };

    const crowded = [...teammates, ...opponents].some(other =>
        other.id !== player.id && distVec(other.pos, baseTarget) < 24,
    );

    return crowded
        ? { ...baseTarget, y: Math.max(20, Math.min(field.height - 20, baseTarget.y + 36)) }
        : baseTarget;
}
