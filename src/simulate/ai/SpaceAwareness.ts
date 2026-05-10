/**
 * SpaceAwareness — per-tick spatial intelligence layer.
 *
 * Computes three structures added to TacticalData each tick:
 *
 *   freeSpaceMap    — grid(16×10) of 0-1 free-space scores (1 = totally free)
 *   pressureZones   — list of hot zones where opponents cluster
 *   dangerousZones  — opponent-controlled corridors toward our goal
 *
 * Also exposes static helpers used by OffBallSystem:
 *   findBestRunTarget()  — best empty spot for a specific run type
 *   laneIsClear()        — checks if a corridor is free of opponents
 *   spaceScore()         — 0-1 score for a specific position
 */

import { distVec, normVec, dotVec, subVec } from "../physics";
import type { SimulationContext } from "../context";
import type { Player, Vec2, TeamSide } from "../types";

// ── Grid constants ────────────────────────────────────────
const GRID_COLS = 16;
const GRID_ROWS = 10;

// Influence radius in field units — how far a player "claims" space
const PLAYER_INFLUENCE_RADIUS = 55;
// Minimum corridor width (units) for a lane to be considered "clear"
const LANE_CLEAR_THRESHOLD = 14;

// ── Public types ──────────────────────────────────────────

export interface PressureZone {
    /** Centre of the zone */
    pos: Vec2;
    /** 0-1 intensity (1 = maximum congestion) */
    intensity: number;
    /** Which team dominates this zone */
    dominatedBy: TeamSide | "contested";
}

export interface SpaceAwarenessData {
    /** GRID_COLS × GRID_ROWS matrix, value 0-1 (1 = completely free) */
    freeSpaceMap: number[][];
    /** Zones of heavy opponent presence — used to avoid sending runners into traffic */
    pressureZones: PressureZone[];
    /** Grid-cell positions that lead toward the opponent goal (useful for through-ball targets) */
    dangerousZones: Vec2[];
    /**
     * Defensive line X for each team — the X position of the second-deepest
     * outfield defender (last man). Runners behind this line are in behind.
     * home: home team's defensive line X (low X = deep)
     * away: away team's defensive line X (high X = deep)
     */
    defensiveLine: { home: number; away: number };
}

// ── Main class ────────────────────────────────────────────

export class SpaceAwareness {

    /**
     * Rebuild spatial data for this tick.
     * Called once per tick by TacticalSystem before DecisionSystem runs.
     */
    static compute(ctx: SimulationContext): SpaceAwarenessData {
        const { width, height } = ctx.config.fieldDimensions;
        const allPlayers = [...ctx.homeTeam.players, ...ctx.awayTeam.players];

        const colStep = width / GRID_COLS;
        const rowStep = height / GRID_ROWS;

        // ── Free space map ────────────────────────────────
        // For each cell: how much player-influence is present?
        // high influence → low free space.
        const freeSpaceMap: number[][] = [];

        for (let col = 0; col < GRID_COLS; col++) {
            freeSpaceMap.push([]);
            for (let row = 0; row < GRID_ROWS; row++) {
                const cell: Vec2 = {
                    x: (col + 0.5) * colStep,
                    y: (row + 0.5) * rowStep,
                };

                let totalInfluence = 0;
                for (const p of allPlayers) {
                    const d = distVec(p.pos, cell);
                    if (d < PLAYER_INFLUENCE_RADIUS) {
                        // Gaussian-style falloff: close = high influence
                        totalInfluence += 1 - (d / PLAYER_INFLUENCE_RADIUS) ** 2;
                    }
                }

                // Clamp 0-1 and invert so 1 = free
                freeSpaceMap[col].push(Math.max(0, 1 - Math.min(1, totalInfluence * 0.35)));
            }
        }

        // ── Pressure zones ────────────────────────────────
        // Find cells with > 0.55 combined opponent influence
        const pressureZones: PressureZone[] = [];

        for (let col = 0; col < GRID_COLS; col++) {
            for (let row = 0; row < GRID_ROWS; row++) {
                const cell: Vec2 = {
                    x: (col + 0.5) * colStep,
                    y: (row + 0.5) * rowStep,
                };

                let homeInfluence = 0;
                let awayInfluence = 0;

                for (const p of allPlayers) {
                    const d = distVec(p.pos, cell);
                    if (d < PLAYER_INFLUENCE_RADIUS) {
                        const infl = 1 - (d / PLAYER_INFLUENCE_RADIUS) ** 2;
                        if (p.team === "home") homeInfluence += infl;
                        else awayInfluence += infl;
                    }
                }

                const total = homeInfluence + awayInfluence;
                if (total < 0.5) continue;

                const intensity = Math.min(1, total * 0.4);
                let dominatedBy: TeamSide | "contested";
                const ratio = homeInfluence / (total + 0.001);
                if (ratio > 0.65) dominatedBy = "home";
                else if (ratio < 0.35) dominatedBy = "away";
                else dominatedBy = "contested";

                pressureZones.push({ pos: cell, intensity, dominatedBy });
            }
        }

        // ── Defensive line ────────────────────────────────
        // The defensive line is the X position of the second-deepest
        // outfield defender (last man / offside trap line).
        // For home: smallest X among outfield defenders (own goal = x=0).
        // For away: largest X among outfield defenders (own goal = x=width).
        const homeDefenders = ctx.homeTeam.players.filter(
            p => p.position !== "GK" && (p.position === "CB" || p.position === "LB" || p.position === "RB"),
        );
        const awayDefenders = ctx.awayTeam.players.filter(
            p => p.position !== "GK" && (p.position === "CB" || p.position === "LB" || p.position === "RB"),
        );

        // Sort home defenders ascending by X (closest to own goal first)
        const homeDefLineX = homeDefenders.length >= 2
            ? [...homeDefenders].sort((a, b) => a.pos.x - b.pos.x)[1].pos.x  // second deepest
            : homeDefenders[0]?.pos.x ?? width * 0.25;

        // Sort away defenders descending by X (closest to own goal first)
        const awayDefLineX = awayDefenders.length >= 2
            ? [...awayDefenders].sort((a, b) => b.pos.x - a.pos.x)[1].pos.x
            : awayDefenders[0]?.pos.x ?? width * 0.75;

        const defensiveLine = { home: homeDefLineX, away: awayDefLineX };

        // ── Dangerous zones ───────────────────────────────
        // Cells that are:
        //   1. Beyond the opponent's defensive line (in behind)
        //   2. Free (free space > 0.55)
        //   3. Within a useful lateral band (not too wide)
        const dangerousZones: Vec2[] = [];
        const centerY = height / 2;

        for (let col = 0; col < GRID_COLS; col++) {
            for (let row = 0; row < GRID_ROWS; row++) {
                const cellX = (col + 0.5) * colStep;
                const cellY = (row + 0.5) * rowStep;

                // For home team attacking: behind away's defensive line
                const isHomeDangerous = cellX > awayDefLineX - 15;
                // For away team attacking: behind home's defensive line
                const isAwayDangerous = cellX < homeDefLineX + 15;

                if (!isHomeDangerous && !isAwayDangerous) continue;
                if (freeSpaceMap[col][row] < 0.55) continue;

                // Prefer areas within penalty box width and not too close to touchline
                const lateralDist = Math.abs(cellY - centerY) / (height / 2);
                if (lateralDist > 0.72) continue;

                dangerousZones.push({ x: cellX, y: cellY });
            }
        }

        return { freeSpaceMap, pressureZones, dangerousZones, defensiveLine };
    }

    // ── Static helpers ────────────────────────────────────

    /**
     * Find the best free-space position for a runner, given:
     * - their starting position
     * - a direction bias (normalised Vec2)
     * - minimum distance to travel
     * - maximum distance to consider
     * - list of opponents (to avoid)
     * - the freeSpaceMap
     * - field dimensions
     */
    static findBestRunTarget(
        from: Vec2,
        directionBias: Vec2,
        minDist: number,
        maxDist: number,
        opponents: Player[],
        freeSpaceMap: number[][],
        fieldWidth: number,
        fieldHeight: number,
    ): Vec2 | null {
        const colStep = fieldWidth / GRID_COLS;
        const rowStep = fieldHeight / GRID_ROWS;

        let bestScore = -1;
        let bestPos: Vec2 | null = null;

        for (let col = 0; col < GRID_COLS; col++) {
            for (let row = 0; row < GRID_ROWS; row++) {
                const cell: Vec2 = {
                    x: (col + 0.5) * colStep,
                    y: (row + 0.5) * rowStep,
                };

                const d = distVec(from, cell);
                if (d < minDist || d > maxDist) continue;

                // Direction alignment: how much does this cell match the intended run?
                const toCell = normVec(subVec(cell, from));
                const alignment = dotVec(toCell, directionBias); // -1 to 1
                if (alignment < 0.1) continue; // wrong direction

                // Penalise cells too close to any opponent
                let opponentPenalty = 0;
                for (const opp of opponents) {
                    const od = distVec(opp.pos, cell);
                    if (od < 30) opponentPenalty += (30 - od) / 30;
                }

                const spaceScore = freeSpaceMap[col][row];
                const score = spaceScore * 0.55 + alignment * 0.35 - opponentPenalty * 0.2;

                if (score > bestScore) {
                    bestScore = score;
                    bestPos = cell;
                }
            }
        }

        return bestScore > 0.25 ? bestPos : null;
    }

    /**
     * Returns true if the corridor between `from` and `to` has
     * no opponent within LANE_CLEAR_THRESHOLD units of the line.
     */
    static laneIsClear(from: Vec2, to: Vec2, opponents: Player[]): boolean {
        for (const opp of opponents) {
            if (distToSegment(opp.pos, from, to) < LANE_CLEAR_THRESHOLD) return false;
        }
        return true;
    }

    /**
     * 0-1 space score for a single position based on opponent density.
     */
    static spaceScore(pos: Vec2, opponents: Player[]): number {
        let pressure = 0;
        for (const opp of opponents) {
            const d = distVec(opp.pos, pos);
            if (d < PLAYER_INFLUENCE_RADIUS) {
                pressure += 1 - (d / PLAYER_INFLUENCE_RADIUS) ** 2;
            }
        }
        return Math.max(0, 1 - Math.min(1, pressure * 0.5));
    }
}

// ── Internal geometry ─────────────────────────────────────

function distToSegment(p: Vec2, v: Vec2, w: Vec2): number {
    const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
    if (l2 === 0) return distVec(p, v);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return distVec(p, {
        x: v.x + t * (w.x - v.x),
        y: v.y + t * (w.y - v.y),
    });
}