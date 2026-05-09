import { Player, Ball, FieldDimensions, Vec2 } from "./types";
import { distVec, normVec, subVec } from "./physics";
import { BALANCE } from "./balance";

/**
 * Advanced xG Model
 * Calculates the probability (0-1) of a shot becoming a goal.
 */
export function calculateXG(
    player: Player,
    ball: Ball,
    field: FieldDimensions,
    defenders: Player[],
    goalkeeper: Player | undefined
): number {
    const attackingRight = player.team === "home";
    const goalX = attackingRight ? field.width : 0;
    const goalCenter: Vec2 = { x: goalX, y: field.height / 2 };

    // 1. Distance Factor (Exponential decay)
    const dist = distVec(player.pos, goalCenter);
    const distFactor = Math.exp(-dist / 160);

    // 2. Angle Factor
    const goalTop: Vec2 = { x: goalX, y: field.height / 2 - field.goalWidth / 2 };
    const goalBottom: Vec2 = { x: goalX, y: field.height / 2 + field.goalWidth / 2 };
    const v1 = subVec(goalTop, player.pos);
    const v2 = subVec(goalBottom, player.pos);
    const angle = Math.abs(Math.atan2(v1.y, v1.x) - Math.atan2(v2.y, v2.x));
    const angleFactor = angle / (Math.PI / 2);

    // 3. Pressure & Composure
    let pressure = 0;
    for (const d of defenders) {
        const dDist = distVec(player.pos, d.pos);
        if (dDist < 60) {
            pressure += (1 - dDist / 60);
        }
    }
    // COMPOSURE: High composure reduces the penalty of pressure
    const composureFactor = (player.attributes.composure / 100);
    const effectivePressure = pressure * (1 - composureFactor * 0.6);
    const pressureFactor = Math.max(0.1, 1 - (effectivePressure * 0.4));

    // 4. Goalkeeper Positioning & Reflexes
    let gkFactor = 1.0;
    if (goalkeeper) {
        const gkDistToGoal = distVec(goalkeeper.pos, goalCenter);
        if (gkDistToGoal > 80) gkFactor = 1.4;
        
        const toGoal = normVec(subVec(goalCenter, player.pos));
        const toGK = normVec(subVec(goalkeeper.pos, player.pos));
        const dot = toGoal.x * toGK.x + toGoal.y * toGK.y;
        if (dot > 0.97) {
            // REFLEXES: Better GKs reduce xG when in position
            const reflexFactor = (goalkeeper.attributes.reflexes / 100);
            gkFactor *= (0.45 - reflexFactor * 0.4); // Significant reduction (0.05 - 0.45)
        }
    }

    // 5. Player Technical Skill: FINISHING & TECHNIQUE
    // Finishing is key for precision, Technique for difficult/long shots
    const technicalFactor = dist < 120
        ? (0.5 + (player.attributes.finishing / 100) * 0.5)
        : (0.4 + (player.attributes.technique / 100) * 0.4 + (player.attributes.longShots / 100) * 0.2);

    // Combine
    let xG = distFactor * angleFactor * pressureFactor * gkFactor * technicalFactor * BALANCE.GLOBAL_XG_MULTIPLIER;

    // Clamp
    return Math.min(0.99, Math.max(0.01, xG));
}
