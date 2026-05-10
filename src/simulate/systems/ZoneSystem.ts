/**
 * ZoneSystem — Field Zone Grid
 *
 * Divides the field into a COLS × ROWS grid of zones.
 * Each outfield player is assigned a "home zone" based on their
 * formation position and tactical phase. This zone defines:
 *
 *   1. Where the player should DEFEND when out_of_possession
 *   2. How far they can deviate from their zone before returning
 *   3. Which zones are "their" territory for pressing decisions
 *
 * Grid layout (for a 720×480 field, 6 cols × 5 rows):
 *   col 0 = own goal third (home),  col 5 = opponent goal third (home)
 *   row 0 = top touchline,          row 4 = bottom touchline
 *
 * Zone responsibilities:
 *   GK:  always zone col 0 (or col COLS-1 for away)
 *   CB:  cols 1-2
 *   WB/LB/RB: col 1-2, wide rows
 *   CM:  cols 2-3
 *   CAM: col 3-4
 *   ST/LW/RW: cols 4-5
 *
 * During in_possession, players push 1 zone forward.
 * During out_of_possession, players drop 1 zone back.
 *
 * The ZoneSystem is purely advisory — it writes zoneTarget into
 * tactical data which OffBallSystem / DecisionSystem can read.
 * It does NOT move players directly.
 */

import type { SimulationContext } from "../context";
import type { SimulationSystem } from "../pipeline";
import type { Command } from "../core/Command";
import type { Player, PlayerPosition, Vec2 } from "../types";

// ── Grid dimensions ────────────────────────────────────────
export const ZONE_COLS = 6;   // along the length of the pitch
export const ZONE_ROWS = 5;   // across the width of the pitch

// How many zones a player can stray from their home zone before
// the system "pulls" them back (used by OffBallSystem hold_shape)
export const ZONE_LEASH_COLS = 2;
export const ZONE_LEASH_ROWS = 1;

// ── Zone assignment per position ──────────────────────────
// [colHome, rowBias]
// colHome: 0 = own goal line, COLS-1 = opponent goal line
// rowBias: -1 = top/left, 0 = centre, 1 = bottom/right
interface ZoneTemplate {
    col: number;   // 0-based from OWN goal (home perspective)
    row: number;   // 0-based from top touchline; -1 = use player's default Y
}

const POSITION_ZONE: Record<PlayerPosition, ZoneTemplate> = {
    GK:  { col: 0,   row: -1 },
    CB:  { col: 1,   row: -1 },
    LB:  { col: 1,   row: 0  },
    RB:  { col: 1,   row: ZONE_ROWS - 1 },
    CM:  { col: 2,   row: -1 },
    LM:  { col: 2,   row: 0  },
    RM:  { col: 2,   row: ZONE_ROWS - 1 },
    CAM: { col: 3,   row: -1 },
    LW:  { col: 4,   row: 0  },
    RW:  { col: 4,   row: ZONE_ROWS - 1 },
    ST:  { col: 4,   row: -1 },
};

// Phase shift in columns (positive = push forward toward opponent goal)
const PHASE_COL_SHIFT: Record<string, number> = {
    in_possession:     1,
    transition_attack: 2,
    out_of_possession: -1,
    transition_defend: -2,
    set_piece:          0,
};

// ── Zone data attached to tactical ────────────────────────
export interface ZoneAssignment {
    playerId: string;
    homeZoneCol: number;   // natural column (home perspective)
    homeZoneRow: number;   // natural row
    activeZoneCol: number; // after phase shift
    activeZoneRow: number;
    zoneCentreWorld: Vec2; // world coords of zone centre
}

export interface ZoneData {
    assignments: ZoneAssignment[];
    cellWidth:  number;
    cellHeight: number;
}

// Extend TacticalData via module augmentation in context
declare module "../context" {
    interface TacticalData {
        zoneData?: ZoneData;
    }
}

// ── System ────────────────────────────────────────────────

export class ZoneSystem implements SimulationSystem {
    name = "ZoneSystem";

    update(ctx: SimulationContext): Command[] {
        const { homeTeam, awayTeam, config } = ctx;
        const { width, height } = config.fieldDimensions;

        const cellW = width  / ZONE_COLS;
        const cellH = height / ZONE_ROWS;

        const assignments: ZoneAssignment[] = [];

        for (const team of [homeTeam, awayTeam]) {
            const isHome = team.id === "home";
            const tacticalState = isHome
                ? ctx.tactical.homeState
                : ctx.tactical.awayState;

            const phaseShift = PHASE_COL_SHIFT[tacticalState.phase] ?? 0;

            for (const player of team.players) {
                const template = POSITION_ZONE[player.position] ?? { col: 2, row: -1 };

                // For home team col 0 = left (own goal),
                // for away team flip: col 0 = right (their goal on right side of screen)
                const homeCol = clamp(template.col + phaseShift, 0, ZONE_COLS - 1);

                // Flip column for away team so they defend the right side
                const activeCol = isHome
                    ? homeCol
                    : (ZONE_COLS - 1 - homeCol);

                // Row: if row == -1, derive from formation targetPos
                let activeRow: number;
                if (template.row === -1) {
                    activeRow = Math.floor((player.targetPos.y / height) * ZONE_ROWS);
                } else {
                    activeRow = template.row;
                }
                activeRow = clamp(activeRow, 0, ZONE_ROWS - 1);

                const homeZoneRow = template.row === -1
                    ? Math.floor((player.targetPos.y / height) * ZONE_ROWS)
                    : template.row;

                const zoneCX = (activeCol + 0.5) * cellW;
                const zoneCY = (activeRow + 0.5) * cellH;

                assignments.push({
                    playerId: player.id,
                    homeZoneCol: clamp(template.col, 0, ZONE_COLS - 1),
                    homeZoneRow: clamp(homeZoneRow, 0, ZONE_ROWS - 1),
                    activeZoneCol: activeCol,
                    activeZoneRow: activeRow,
                    zoneCentreWorld: { x: zoneCX, y: zoneCY },
                });
            }
        }

        ctx.tactical.zoneData = { assignments, cellWidth: cellW, cellHeight: cellH };
        return [];
    }
}

// ── Helpers ────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
}

/**
 * Get the zone assignment for a player (by id).
 * Returns null if ZoneSystem hasn't run yet.
 */
export function getZoneAssignment(
    ctx: SimulationContext,
    playerId: string,
): ZoneAssignment | null {
    return ctx.tactical.zoneData?.assignments.find(a => a.playerId === playerId) ?? null;
}

/**
 * Returns the world-space centre of a zone cell.
 */
export function zoneCentre(
    col: number,
    row: number,
    cellWidth: number,
    cellHeight: number,
): Vec2 {
    return {
        x: (col + 0.5) * cellWidth,
        y: (row + 0.5) * cellHeight,
    };
}

/**
 * Checks if a player has wandered outside their leash zone.
 * Returns true when they should snap back to their zone centre.
 */
export function isOutsideLeash(
    player: Player,
    assignment: ZoneAssignment,
    cellWidth: number,
    cellHeight: number,
): boolean {
    const currentCol = Math.floor(player.pos.x / cellWidth);
    const currentRow = Math.floor(player.pos.y / cellHeight);
    return (
        Math.abs(currentCol - assignment.activeZoneCol) > ZONE_LEASH_COLS ||
        Math.abs(currentRow - assignment.activeZoneRow) > ZONE_LEASH_ROWS
    );
}