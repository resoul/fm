/**
 * ZoneSystem — Field Zone Grid  (F.1 + F.2 revision)
 *
 * F.1: FORMATION_ZONES — per-slot zone templates for each formation.
 *   Instead of POSITION_ZONE (all CBs → col 1 regardless of formation),
 *   each slot index maps to a precise (col, row) cell that reflects the
 *   actual shape:  3-5-2 wide CBs get col 1 but wider rows; 4-3-3 CMs
 *   sit in different columns; etc.
 *
 * F.2: Dynamic leash by role and workRate.
 *   ROLE_LEASH provides base (cols, rows) per PlayerRole.
 *   workRate expands the leash: effectiveCols = base + round((workRate/100)*1.5).
 *   isOutsideLeash() now accepts assignment.leash instead of the global constant.
 *
 * isSecondHalf: ZoneSystem reads ctx.state.isSecondHalf (set by RefereeSystem
 *   at halftime) to flip the column perspective so teams always defend their
 *   own goal regardless of which physical half they're in.
 *
 * Grid layout (for a 720×480 field, 6 cols × 5 rows):
 *   col 0 = own goal third (home),  col 5 = opponent goal third (home)
 *   row 0 = top touchline,          row 4 = bottom touchline
 *
 * The ZoneSystem is purely advisory — it writes zoneData into tactical
 * context which OffBallSystem / DecisionSystem read.
 * It does NOT move players directly.
 */

import type { SimulationContext } from "../context";
import type { SimulationSystem } from "../pipeline";
import type { Command } from "../core/Command";
import type { Player, PlayerRole, Vec2 } from "../types";

// ── Grid dimensions ────────────────────────────────────────
export const ZONE_COLS = 6;
export const ZONE_ROWS = 5;

// ── Zone template ──────────────────────────────────────────
// col: 0 = own goal end, COLS-1 = opponent goal end (home perspective)
// row: 0 = top touchline, ROWS-1 = bottom touchline
//      -1 = derive from player's formation targetPos Y
interface ZoneTemplate {
    col: number;
    row: number;
}

// ── F.1: FORMATION_ZONES ──────────────────────────────────
// Index = slotIdx from teamFactory.FORMATIONS (same slot order).
// col/row in HOME perspective (col 0 = own goal, COLS-1 = opponent goal).
// row = -1 means "derive from formation ry (targetPos.y)".
//
// 4-3-3  slots: GK CB CB LB RB CM CM CM LW ST RW
// 4-4-2  slots: GK CB CB LB RB LM CM CM RM ST ST
// 4-2-3-1 slots: GK CB CB LB RB CM CM LW CAM RW ST
// 3-5-2  slots: GK CB CB CB LM CM CM CM RM ST ST

export const FORMATION_ZONES: Record<string, ZoneTemplate[]> = {
    "4-3-3": [
        { col: 0, row: -1 },  // 0  GK
        { col: 1, row:  1 },  // 1  CB left-of-centre
        { col: 1, row:  3 },  // 2  CB right-of-centre
        { col: 1, row:  0 },  // 3  LB (left flank)
        { col: 1, row:  4 },  // 4  RB (right flank)
        { col: 2, row:  1 },  // 5  CM left
        { col: 2, row: -1 },  // 6  CM centre
        { col: 2, row:  3 },  // 7  CM right
        { col: 4, row:  0 },  // 8  LW
        { col: 4, row: -1 },  // 9  ST
        { col: 4, row:  4 },  // 10 RW
    ],
    "4-4-2": [
        { col: 0, row: -1 },  // 0  GK
        { col: 1, row:  1 },  // 1  CB
        { col: 1, row:  3 },  // 2  CB
        { col: 1, row:  0 },  // 3  LB
        { col: 1, row:  4 },  // 4  RB
        { col: 2, row:  0 },  // 5  LM (wide left)
        { col: 2, row:  1 },  // 6  CM left-centre
        { col: 2, row:  3 },  // 7  CM right-centre
        { col: 2, row:  4 },  // 8  RM (wide right)
        { col: 4, row:  1 },  // 9  ST left
        { col: 4, row:  3 },  // 10 ST right
    ],
    "4-2-3-1": [
        { col: 0, row: -1 },  // 0  GK
        { col: 1, row:  1 },  // 1  CB
        { col: 1, row:  3 },  // 2  CB
        { col: 1, row:  0 },  // 3  LB
        { col: 1, row:  4 },  // 4  RB
        { col: 2, row:  1 },  // 5  DM/CM left
        { col: 2, row:  3 },  // 6  DM/CM right
        { col: 3, row:  0 },  // 7  LW
        { col: 3, row: -1 },  // 8  CAM
        { col: 3, row:  4 },  // 9  RW
        { col: 4, row: -1 },  // 10 ST
    ],
    "3-5-2": [
        { col: 0, row: -1 },  // 0  GK
        { col: 1, row:  0 },  // 1  CB left  (spread wide vs 4-back)
        { col: 1, row:  2 },  // 2  CB centre
        { col: 1, row:  4 },  // 3  CB right (spread wide)
        { col: 3, row:  0 },  // 4  LM/WB — pushes high on left flank
        { col: 2, row:  1 },  // 5  CM left
        { col: 2, row: -1 },  // 6  CM centre
        { col: 2, row:  3 },  // 7  CM right
        { col: 3, row:  4 },  // 8  RM/WB — pushes high on right flank
        { col: 4, row:  1 },  // 9  ST left
        { col: 4, row:  3 },  // 10 ST right
    ],
};

const FALLBACK_ZONE: ZoneTemplate = { col: 2, row: -1 };

// ── F.2: Dynamic leash per role ───────────────────────────
interface LeashTemplate { cols: number; rows: number; }

const ROLE_LEASH: Record<PlayerRole, LeashTemplate> = {
    GK_Sweeper:      { cols: 1, rows: 1 },
    GK_Defensive:    { cols: 1, rows: 1 },
    CB_Stopper:      { cols: 1, rows: 1 },
    CB_BallPlaying:  { cols: 1, rows: 1 },
    WB_Attacking:    { cols: 2, rows: 2 },
    WB_Defensive:    { cols: 1, rows: 1 },
    CM_BallWinner:   { cols: 1, rows: 1 },
    CM_Playmaker:    { cols: 2, rows: 1 },
    CM_BoxToBox:     { cols: 2, rows: 2 },
    W_Winger:        { cols: 2, rows: 2 },
    W_Inverted:      { cols: 2, rows: 2 },
    ST_Poacher:      { cols: 2, rows: 2 },
    ST_TargetMan:    { cols: 1, rows: 1 },
    ST_Advanced:     { cols: 2, rows: 2 },
};

// Phase shift in columns (positive = push toward opponent goal)
const PHASE_COL_SHIFT: Record<string, number> = {
    in_possession:     2,
    transition_attack: 3,
    out_of_possession: -1,
    transition_defend: -2,
    set_piece:          0,
};

const ATTACKING_ROLES = new Set<PlayerRole>([
    "ST_Poacher", "ST_Advanced", "ST_TargetMan",
    "W_Winger", "W_Inverted", "WB_Attacking",
]);

// ── Zone data attached to tactical ────────────────────────
export interface ZoneAssignment {
    playerId: string;
    homeZoneCol: number;   // home perspective col (before phase shift)
    homeZoneRow: number;
    activeZoneCol: number; // after phase shift + side flip
    activeZoneRow: number;
    zoneCentreWorld: Vec2;
    /** Effective leash — includes workRate expansion (F.2) */
    leash: LeashTemplate;
}

export interface ZoneData {
    assignments: ZoneAssignment[];
    cellWidth:  number;
    cellHeight: number;
}

declare module "../context" {
    interface TacticalData {
        zoneData?: ZoneData;
    }
}

// ── System ────────────────────────────────────────────────

export class ZoneSystem implements SimulationSystem {
    name = "ZoneSystem";

    update(ctx: SimulationContext): Command[] {
        const { homeTeam, awayTeam, config, state } = ctx;
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

            // F.0 + isSecondHalf: determine which physical side this team attacks toward.
            // 1st half: home attacks left→right (col increases = toward away goal).
            //           away attacks right→left (col must be flipped).
            // 2nd half: sides swap, so home now attacks right→left.
            //
            // perspectiveIsLeft = true  → col 0 is on the LEFT side of the screen
            //                             (team attacks right, no flip needed)
            // perspectiveIsLeft = false → col 0 is on the RIGHT side of the screen
            //                             (team attacks left, flip cols)
            const perspectiveIsLeft = isHome !== state.isSecondHalf;

            const formationZones = FORMATION_ZONES[team.formation] ?? null;

            for (const player of team.players) {
                // F.1: slot-specific zone takes priority over generic POSITION_ZONE
                const template: ZoneTemplate =
                    (formationZones && player.slotIdx < formationZones.length)
                        ? formationZones[player.slotIdx]
                        : FALLBACK_ZONE;

                // Phase shift in home-perspective columns
                const shiftedCol = clamp(template.col + phaseShift, 0, ZONE_COLS - 1);

                // Convert home-perspective col to screen col
                const activeCol = perspectiveIsLeft
                    ? shiftedCol
                    : (ZONE_COLS - 1 - shiftedCol);

                // Row derivation
                let activeRow: number;
                if (template.row === -1) {
                    // Derive from formation targetPos.y — already in screen space
                    activeRow = Math.floor((player.targetPos.y / height) * ZONE_ROWS);
                } else {
                    // Static row: mirror for teams attacking left
                    activeRow = perspectiveIsLeft
                        ? template.row
                        : (ZONE_ROWS - 1 - template.row);
                }
                activeRow = clamp(activeRow, 0, ZONE_ROWS - 1);

                const homeZoneRow = template.row === -1
                    ? clamp(Math.floor((player.targetPos.y / height) * ZONE_ROWS), 0, ZONE_ROWS - 1)
                    : template.row;

                const zoneCX = (activeCol + 0.5) * cellW;
                const zoneCY = (activeRow + 0.5) * cellH;

                // F.2: dynamic leash (role base + workRate expansion)
                const leash = computeLeash(player, tacticalState.phase);

                assignments.push({
                    playerId: player.id,
                    homeZoneCol: clamp(template.col, 0, ZONE_COLS - 1),
                    homeZoneRow: clamp(homeZoneRow,  0, ZONE_ROWS - 1),
                    activeZoneCol: activeCol,
                    activeZoneRow: activeRow,
                    zoneCentreWorld: { x: zoneCX, y: zoneCY },
                    leash,
                });
            }
        }

        ctx.tactical.zoneData = { assignments, cellWidth: cellW, cellHeight: cellH };
        return [];
    }
}

// ── F.2: dynamic leash computation ────────────────────────
function computeLeash(player: Player, phase: string): LeashTemplate {
    const base = ROLE_LEASH[player.role] ?? { cols: 2, rows: 1 };
    const workRateBonus = Math.round((player.attributes.workRate / 100) * 1.5);
    const attackBonus = (
        ATTACKING_ROLES.has(player.role) &&
        (phase === "in_possession" || phase === "transition_attack")
    ) ? 2 : 0;

    return {
        cols: clamp(base.cols + workRateBonus + attackBonus, 1, ZONE_COLS - 1),
        rows: clamp(base.rows,                               1, ZONE_ROWS - 1),
    };
}

// ── Helpers ────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
}

/**
 * Get the zone assignment for a player (by id).
 * Returns null if ZoneSystem hasn't run yet this tick.
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
 * F.2: isOutsideLeash now uses assignment.leash (dynamic per player)
 * instead of the old global ZONE_LEASH_COLS / ZONE_LEASH_ROWS constants.
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
        Math.abs(currentCol - assignment.activeZoneCol) > assignment.leash.cols ||
        Math.abs(currentRow - assignment.activeZoneRow) > assignment.leash.rows
    );
}

// Legacy exports — kept so old callers don't break if they import these constants
export const ZONE_LEASH_COLS = 2;
export const ZONE_LEASH_ROWS = 1;