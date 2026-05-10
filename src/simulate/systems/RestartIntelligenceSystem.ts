/**
 * RestartIntelligenceSystem — 2.6 Restart Intelligence
 *
 * Runs every tick WHILE in a dead-ball phase (throwin / goalkick / corner / freekick).
 * Assigns intelligent positions to non-taker players so set-pieces look tactical,
 * not like 22 players sprinting back to their formation slot.
 *
 * Logic per restart type:
 *
 *   CORNER
 *     Attacking team:
 *       - ST / CAM / CM → crowd the penalty box in pre-assigned zones
 *       - One CM holds at the edge of the box (second ball)
 *       - WB / FB → lurk at the far post (late arrival)
 *     Defending team:
 *       - GK → posts
 *       - CB / CM → mark zonally inside box
 *       - One ST / CAM pushes up for counter
 *
 *   THROW-IN
 *     Attacking team: 2-3 nearest players create short options at different angles
 *     Defending team: stay compact, nearest players mark options
 *
 *   GOAL KICK
 *     Attacking (defending) team: spread wide to receive, ST pushes high
 *     Opposing team: press line compresses slightly, ready for second ball
 *
 *   FREE KICK (in own half / opposition half handled differently)
 *     Attacking: wide players spread, strikers position on edge of box
 *     Defending: wall + cover; GK positions on near post
 *
 * Implementation:
 *   This system assigns a targetPos to each non-taker player.
 *   It re-evaluates on the FIRST tick of a new dead-ball phase, then commits
 *   (doesn't re-run every tick to avoid jitter).
 *   MovementSystem reads targetPos normally — players walk/run to their spots.
 */

import type { SimulationContext } from "../context";
import type { SimulationSystem } from "../pipeline";
import type { Command } from "../core/Command";
import type { Player, MatchPhase, TeamSide, Vec2 } from "../types";
import { distVec } from "../physics";

// How often (in ticks) we recalculate positions during a dead-ball
// Set high so players don't jitter — they find their spot and stay
const RECALC_INTERVAL = 30;

export class RestartIntelligenceSystem implements SimulationSystem {
    name = "RestartIntelligenceSystem";

    private _lastPhase: MatchPhase | null = null;
    private _ticksSinceRecalc = 0;

    update(ctx: SimulationContext): Command[] {
        const { state } = ctx;
        const ACTIVE_PHASES = new Set<MatchPhase>(["throwin", "goalkick", "corner", "freekick"]);

        if (!ACTIVE_PHASES.has(state.phase)) {
            // Reset when we leave dead-ball
            this._lastPhase = null;
            this._ticksSinceRecalc = 0;
            return [];
        }

        const phaseChanged = state.phase !== this._lastPhase;
        this._ticksSinceRecalc++;

        if (!phaseChanged && this._ticksSinceRecalc < RECALC_INTERVAL) return [];

        this._lastPhase = state.phase;
        this._ticksSinceRecalc = 0;

        this.assignPositions(ctx, state.phase);
        return [];
    }

    private assignPositions(ctx: SimulationContext, phase: MatchPhase): void {
        const { config, homeTeam, awayTeam, ball } = ctx;
        const fw = config.fieldDimensions.width;
        const fh = config.fieldDimensions.height;

        // Figure out which team is taking the restart
        const takerPlayer = [...homeTeam.players, ...awayTeam.players].find(
            p => p.id === ctx.ball.ownerPlayerId
        );
        if (!takerPlayer) return;

        const takingTeam = takerPlayer.team;
        const defendingTeam: TeamSide = takingTeam === "home" ? "away" : "home";

        const takers = ctx[`${takingTeam}Team` as "homeTeam" | "awayTeam"].players;
        const defenders = ctx[`${defendingTeam}Team` as "homeTeam" | "awayTeam"].players;

        switch (phase) {
            case "corner":
                this.setupCorner(takers, defenders, takerPlayer, ball.pos, fw, fh, takingTeam);
                break;
            case "throwin":
                this.setupThrowIn(takers, defenders, takerPlayer, ball.pos, fw, fh);
                break;
            case "goalkick":
                this.setupGoalKick(takers, defenders, takerPlayer, ball.pos, fw, fh, takingTeam);
                break;
            case "freekick":
                this.setupFreeKick(takers, defenders, takerPlayer, ball.pos, fw, fh, takingTeam);
                break;
        }
    }

    // ── CORNER ────────────────────────────────────────────────────────────────

    private setupCorner(
        takers: Player[], defenders: Player[],
        takerPlayer: Player,
        cornerPos: Vec2,
        fw: number, fh: number,
        takingTeam: TeamSide,
    ): void {
        // Determine which end the corner is at
        const attackingRight = takingTeam === "home";
        const penBoxX = attackingRight ? fw - fw * 0.18 : fw * 0.18;
        const penBoxEdgeX = attackingRight ? fw - fw * 0.22 : fw * 0.22;
        const centerY = fh / 2;
        const isTopCorner = cornerPos.y < centerY;

        // ── Attacking players ─────────────────────────────────────────────
        const nonTakers = takers.filter(p => p.id !== takerPlayer.id && p.position !== "GK");
        const sorted = [...nonTakers].sort((a, b) =>
            priorityForCornerAttack(a.position) - priorityForCornerAttack(b.position)
        );

        // Pre-assign spots inside the box
        const boxSpots: Vec2[] = [
            // Near post runner
            { x: penBoxX, y: isTopCorner ? centerY - 25 : centerY + 25 },
            // Far post
            { x: penBoxX - (attackingRight ? 30 : -30), y: isTopCorner ? centerY + 20 : centerY - 20 },
            // Centre box (penalty spot area)
            { x: penBoxEdgeX + (attackingRight ? 20 : -20), y: centerY },
            // Edge of box — second ball
            { x: penBoxEdgeX, y: isTopCorner ? centerY - 35 : centerY + 35 },
            // Late runner / far post arrival
            { x: attackingRight ? fw * 0.72 : fw * 0.28, y: isTopCorner ? fh * 0.65 : fh * 0.35 },
        ];

        // Assign box spots to attacking non-GK, non-taker players in priority order
        sorted.forEach((player, i) => {
            if (player.position === "GK") return; // skip GK (stays back)
            const spot = boxSpots[i] ?? boxSpots[boxSpots.length - 1];
            player.targetPos = clampToField(spot, fw, fh, 5);
        });

        // ── Defending players ─────────────────────────────────────────────
        const defGK = defenders.find(p => p.position === "GK");
        if (defGK) {
            // GK guards near post
            defGK.targetPos = {
                x: attackingRight ? fw - 12 : 12,
                y: isTopCorner ? centerY - 18 : centerY + 18,
            };
        }

        const defOutfield = defenders.filter(p => p.position !== "GK");
        const counterAttacker = defOutfield.find(p =>
            p.position === "ST" || p.position === "LW" || p.position === "RW"
        );

        // Counter attacker pushes high
        if (counterAttacker) {
            counterAttacker.targetPos = {
                x: attackingRight ? fw * 0.25 : fw * 0.75,
                y: fh / 2,
            };
        }

        // Defending markers fill box zonally
        const defMarkers = defOutfield.filter(p => p.id !== counterAttacker?.id);
        const defSpots: Vec2[] = [
            // Goal-line near post
            { x: attackingRight ? fw - 15 : 15, y: centerY - 15 },
            { x: attackingRight ? fw - 15 : 15, y: centerY + 15 },
            // 6-yard box sides
            { x: attackingRight ? fw - 25 : 25, y: isTopCorner ? centerY - 30 : centerY + 30 },
            // Penalty spot
            { x: attackingRight ? fw - fw * 0.14 : fw * 0.14, y: centerY },
            // Edge of box
            { x: penBoxEdgeX + (attackingRight ? 5 : -5), y: centerY - 10 },
            { x: penBoxEdgeX + (attackingRight ? 5 : -5), y: centerY + 10 },
            // Top of box
            { x: penBoxEdgeX - (attackingRight ? 10 : -10), y: centerY - 35 },
            { x: penBoxEdgeX - (attackingRight ? 10 : -10), y: centerY + 35 },
        ];

        defMarkers.forEach((player, i) => {
            const spot = defSpots[i] ?? defSpots[defSpots.length - 1];
            player.targetPos = clampToField(spot, fw, fh, 5);
        });
    }

    // ── THROW-IN ──────────────────────────────────────────────────────────────

    private setupThrowIn(
        takers: Player[], defenders: Player[],
        takerPlayer: Player,
        throwPos: Vec2,
        fw: number, fh: number,
    ): void {
        const isTopSide = throwPos.y < fh / 2;
        // offsetDir pushes receivers TOWARD centre (away from sideline)
        // Use a generous inset so nobody is standing right on the touchline
        const offsetDir = isTopSide ? 1 : -1;
        const INSET = 40; // minimum distance receivers should be from the touchline

        // Non-taker teammates: create varied options at different distances/angles.
        // Key rule: ALL receiver spots must be at least INSET px from sideline so
        // a short throw doesn't immediately go out of bounds again.
        const nonTakers = takers.filter(p => p.id !== takerPlayer.id && p.position !== "GK");

        // Score each non-taker: prefer players who are already infield and forward
        const scored = nonTakers.map(p => {
            const distFromSide = isTopSide
                ? p.pos.y - throwPos.y   // positive = already more central
                : throwPos.y - p.pos.y;
            const distToThrow = distVec(p.pos, throwPos);
            return { player: p, score: distFromSide * 0.6 - distToThrow * 0.004 };
        }).sort((a, b) => b.score - a.score);

        // Build receiver spots that are all guaranteed to be infield
        const centralY = isTopSide
            ? Math.max(throwPos.y + INSET, throwPos.y + 25)
            : Math.min(throwPos.y - INSET, throwPos.y - 25);

        const receiverSpots: Vec2[] = [
            // Short, very safe infield option (directly in from taker)
            { x: clamp(throwPos.x, 15, fw - 15), y: clamp(centralY, 15, fh - 15) },
            // Forward option — further up the pitch AND infield
            { x: clamp(throwPos.x + 40, 15, fw - 15), y: clamp(centralY + offsetDir * 15, 15, fh - 15) },
            // Backward safe option
            { x: clamp(throwPos.x - 40, 15, fw - 15), y: clamp(centralY, 15, fh - 15) },
            // Deep infield option — well away from sideline
            { x: clamp(throwPos.x + 15, 15, fw - 15), y: clamp(throwPos.y + offsetDir * 65, 15, fh - 15) },
        ];

        scored.forEach(({ player }, i) => {
            const spot = receiverSpots[i];
            if (spot) player.targetPos = clampToField(spot, fw, fh, 15);
        });

        // Defenders: press the two most dangerous (forward-most) receiver options,
        // but don't fully commit — stay between receiver and goal
        const defSorted = [...defenders].filter(p => p.position !== "GK").sort((a, b) =>
            distVec(a.pos, throwPos) - distVec(b.pos, throwPos)
        );
        defSorted.slice(0, 3).forEach((player, i) => {
            const pressTarget = receiverSpots[i] ?? receiverSpots[0];
            if (pressTarget) {
                // Stand between ball and the receiver target, not on top of them
                player.targetPos = {
                    x: clamp((throwPos.x + pressTarget.x) / 2, 10, fw - 10),
                    y: clamp((throwPos.y + pressTarget.y) / 2 + offsetDir * 8, 10, fh - 10),
                };
            }
        });
    }

    // ── GOAL KICK ─────────────────────────────────────────────────────────────

    private setupGoalKick(
        takers: Player[], defenders: Player[],
        takerPlayer: Player,
        _ballPos: Vec2,
        fw: number, fh: number,
        takingTeam: TeamSide,
    ): void {
        const isHome = takingTeam === "home";
        const forwardX = isHome ? fw * 0.6 : fw * 0.4;
        const midX = isHome ? fw * 0.45 : fw * 0.55;
        const deepX = isHome ? fw * 0.3 : fw * 0.7;

        // Takers (own team): spread wide + striker pushes to halfway
        const nonGK = takers.filter(p => p.id !== takerPlayer.id && p.position !== "GK");

        const receiveSpots: Vec2[] = [
            // Wide left — short option
            { x: deepX, y: fh * 0.18 },
            // Wide right — short option
            { x: deepX, y: fh * 0.82 },
            // Left CM pocket
            { x: midX, y: fh * 0.3 },
            // Right CM pocket
            { x: midX, y: fh * 0.7 },
            // Centre midfield
            { x: midX, y: fh * 0.5 },
            // ST pushes high
            { x: forwardX, y: fh * 0.4 },
            { x: forwardX, y: fh * 0.6 },
        ];

        // Sort: CBs / CMs nearest, STs pushed furthest
        const sorted = [...nonGK].sort((a, b) =>
            goalKickReceivePriority(a.position) - goalKickReceivePriority(b.position)
        );
        sorted.forEach((player, i) => {
            const spot = receiveSpots[i] ?? receiveSpots[receiveSpots.length - 1];
            player.targetPos = clampToField(spot, fw, fh, 5);
        });

        // Opposing team: form a press line slightly over halfway, don't push too deep
        const pressLineX = isHome ? fw * 0.38 : fw * 0.62;
        defenders.filter(p => p.position !== "GK").forEach((player, i) => {
            // Spread across width in a line
            const rowY = fh * (0.15 + (i / (defenders.length - 1 || 1)) * 0.7);
            player.targetPos = clampToField({ x: pressLineX, y: rowY }, fw, fh, 5);
        });
    }

    // ── FREE KICK ─────────────────────────────────────────────────────────────

    private setupFreeKick(
        takers: Player[], defenders: Player[],
        takerPlayer: Player,
        fkPos: Vec2,
        fw: number, fh: number,
        takingTeam: TeamSide,
    ): void {
        const isHome = takingTeam === "home";
        const isAttackingHalf = isHome ? fkPos.x > fw / 2 : fkPos.x < fw / 2;
        const goalX = isHome ? fw : 0;

        if (isAttackingHalf) {
            // ── Attacking free kick ─────────────────────────────────────
            const nonTakers = takers.filter(p => p.id !== takerPlayer.id && p.position !== "GK");

            // Box runners + edge options
            const boxEdgeX = isHome ? fw * 0.78 : fw * 0.22;
            const spots: Vec2[] = [
                { x: goalX + (isHome ? -40 : 40), y: fh / 2 - 20 },   // near post run
                { x: goalX + (isHome ? -40 : 40), y: fh / 2 + 20 },   // far post run
                { x: goalX + (isHome ? -60 : 60), y: fh / 2 },         // penalty spot
                { x: boxEdgeX, y: fkPos.y < fh / 2 ? fh * 0.65 : fh * 0.35 }, // wide box edge
                { x: fkPos.x + (isHome ? -30 : 30), y: fh / 2 },      // second ball
            ];

            nonTakers.sort((a, b) =>
                fkAttackPriority(a.position) - fkAttackPriority(b.position)
            ).forEach((player, i) => {
                const spot = spots[i] ?? spots[spots.length - 1];
                player.targetPos = clampToField(spot, fw, fh, 5);
            });

            // ── Defending the free kick ───────────────────────────────
            const defGK = defenders.find(p => p.position === "GK");
            if (defGK) {
                // GK on near post
                defGK.targetPos = {
                    x: goalX + (isHome ? -8 : 8),
                    y: fh / 2 + (fkPos.y < fh / 2 ? -10 : 10),
                };
            }

            const defOutfield = defenders.filter(p => p.position !== "GK");

            // Wall: 2-4 defenders in a line between ball and goal
            const wallCount = Math.min(4, Math.max(2, defOutfield.length - 2));
            const wallDir = { x: goalX - fkPos.x, y: fh / 2 - fkPos.y };
            const wallDist = Math.sqrt(wallDir.x ** 2 + wallDir.y ** 2);
            const wallNorm = { x: wallDir.x / wallDist, y: wallDir.y / wallDist };

            // Place wall 9 yards (≈30px) from ball
            const wallBaseX = fkPos.x + wallNorm.x * 30;
            const wallBaseY = fkPos.y + wallNorm.y * 30;
            const perpX = -wallNorm.y;
            const perpY = wallNorm.x;

            defOutfield.slice(0, wallCount).forEach((player, i) => {
                const offset = (i - (wallCount - 1) / 2) * 8;
                player.targetPos = clampToField({
                    x: wallBaseX + perpX * offset,
                    y: wallBaseY + perpY * offset,
                }, fw, fh, 5);
            });

            // Rest cover box zones
            defOutfield.slice(wallCount).forEach((player, i) => {
                const spot: Vec2 = i === 0
                    ? { x: goalX + (isHome ? -50 : 50), y: fh / 2 - 15 }
                    : { x: goalX + (isHome ? -50 : 50), y: fh / 2 + 15 };
                player.targetPos = clampToField(spot, fw, fh, 5);
            });

        } else {
            // ── Defensive free kick (own half) — just spread and receive ──
            const buildX = isHome ? fw * 0.35 : fw * 0.65;

            takers.filter(p => p.id !== takerPlayer.id && p.position !== "GK")
                .forEach((player, i) => {
                    const rowY = fh * (0.15 + (i / 10) * 0.7);
                    player.targetPos = clampToField({ x: buildX, y: rowY }, fw, fh, 5);
                });

            // Opponents apply light pressure
            const pressX = isHome ? fw * 0.42 : fw * 0.58;
            defenders.filter(p => p.position !== "GK").forEach((player, i) => {
                const rowY = fh * (0.2 + (i / 8) * 0.6);
                player.targetPos = clampToField({ x: pressX, y: rowY }, fw, fh, 5);
            });
        }
    }
}

// ── Priority helpers ──────────────────────────────────────────────────────────

// Lower = first to be assigned an in-box spot
function priorityForCornerAttack(pos: string): number {
    const order: Record<string, number> = {
        ST: 0, CAM: 1, CM: 2, LM: 3, RM: 3, LW: 4, RW: 4, CB: 5, LB: 6, RB: 6,
    };
    return order[pos] ?? 5;
}

function goalKickReceivePriority(pos: string): number {
    // GK & CBs hold deep, STs push high
    const order: Record<string, number> = {
        CB: 0, LB: 1, RB: 1, CM: 2, LM: 2, RM: 2, CAM: 3, LW: 4, RW: 4, ST: 5,
    };
    return order[pos] ?? 3;
}

function fkAttackPriority(pos: string): number {
    const order: Record<string, number> = {
        ST: 0, CAM: 1, CM: 2, LW: 3, RW: 3, LM: 4, RM: 4, CB: 5, LB: 6, RB: 6,
    };
    return order[pos] ?? 5;
}

// ── Geometry helpers ──────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
}

function clampToField(pos: Vec2, fw: number, fh: number, margin = 5): Vec2 {
    return {
        x: clamp(pos.x, margin, fw - margin),
        y: clamp(pos.y, margin, fh - margin),
    };
}