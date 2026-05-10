// ============================================================
// PlayerMatchStats — C.1
//
// Per-player statistics accumulated during a match.
// Stored in SimulationContext as ctx.playerStats (Map<playerId, PlayerMatchStats>).
//
// Incremented by:
//   MovementSystem   → distanceCovered, heatmapBuckets, touches
//   PassingSystem    → passesAttempted, passesCompleted, chancesCreated, keyPasses, xA
//   ShootingSystem   → shots, shotsOnTarget, xG
//   RefereeSystem    → goals, assists
//   TackleSystem     → duelsWon, duelsLost, tacklesWon, interceptions
//   OffBallSystem    → pressingActions
//
// rating is computed post-match by PlayerRating.ts (C.4).
// ============================================================

export interface PlayerMatchStats {
    playerId: string;

    // ── Time ─────────────────────────────────────────────
    minutesPlayed: number;

    // ── Ball contact ─────────────────────────────────────
    touches: number;

    // ── Passing ──────────────────────────────────────────
    passesAttempted: number;
    passesCompleted: number;
    /** Computed from passesAttempted/Completed at report time */
    passAccuracy: number;
    /** Passes that led directly to a shot */
    chancesCreated: number;
    /** Passes where the resulting shot had xG > 0.1 */
    keyPasses: number;
    /** Cumulative xG of shots taken after this player's passes */
    xA: number;

    // ── Shooting ─────────────────────────────────────────
    shots: number;
    shotsOnTarget: number;
    goals: number;
    assists: number;
    xG: number;

    // ── Progression ──────────────────────────────────────
    /** Ball carries that advanced the player ≥ 10px toward opponent goal */
    progressiveCarries: number;
    /** Passes that advanced the ball ≥ 20px toward opponent goal */
    progressivePasses: number;
    /** Total distance moved (px, accumulated by MovementSystem) */
    distanceCovered: number;

    // ── Duels ─────────────────────────────────────────────
    duelsWon: number;
    duelsLost: number;
    tacklesWon: number;
    interceptions: number;

    // ── Pressing ─────────────────────────────────────────
    /** Attempts to win ball in high/mid block */
    pressingActions: number;

    // ── Positioning ───────────────────────────────────────
    /**
     * 10×7 bucket grid.  Each bucket accumulates a count every 30 ticks
     * when the player is in that sector of the field.
     * Row 0 = own goal end, Row 9 = opponent goal end.
     * Col 0 = left touchline, Col 6 = right touchline.
     */
    heatmapBuckets: number[][];
    avgPosX: number;
    avgPosY: number;
    /** Internal sample count for rolling average */
    _posSamples: number;

    // ── Discipline ────────────────────────────────────────
    yellowCards: number;
    redCards: number;

    // ── Rating ────────────────────────────────────────────
    /** 0–10, populated by PlayerRating after fulltime */
    rating: number;
}

// ── Heatmap dimensions ────────────────────────────────────
export const HEATMAP_COLS = 10;
export const HEATMAP_ROWS = 7;
/** Ticks between heatmap position samples */
export const HEATMAP_SAMPLE_INTERVAL = 30;

/** Create a zeroed PlayerMatchStats for a given player id */
export function createPlayerMatchStats(playerId: string): PlayerMatchStats {
    const buckets: number[][] = Array.from({ length: HEATMAP_COLS }, () =>
        new Array(HEATMAP_ROWS).fill(0)
    );
    return {
        playerId,
        minutesPlayed: 0,
        touches: 0,
        passesAttempted: 0,
        passesCompleted: 0,
        passAccuracy: 0,
        chancesCreated: 0,
        keyPasses: 0,
        xA: 0,
        shots: 0,
        shotsOnTarget: 0,
        goals: 0,
        assists: 0,
        xG: 0,
        progressiveCarries: 0,
        progressivePasses: 0,
        distanceCovered: 0,
        duelsWon: 0,
        duelsLost: 0,
        tacklesWon: 0,
        interceptions: 0,
        pressingActions: 0,
        heatmapBuckets: buckets,
        avgPosX: 0,
        avgPosY: 0,
        _posSamples: 0,
        yellowCards: 0,
        redCards: 0,
        rating: 0,
    };
}

/**
 * Initialise ctx.playerStats from both teams at match start.
 * Call once from MatchSimulator before the first step().
 */
export function initPlayerStats(
    homePlayers: { id: string }[],
    awayPlayers: { id: string }[],
): Map<string, PlayerMatchStats> {
    const map = new Map<string, PlayerMatchStats>();
    for (const p of [...homePlayers, ...awayPlayers]) {
        map.set(p.id, createPlayerMatchStats(p.id));
    }
    return map;
}

// ── Helpers called from individual systems ────────────────

/**
 * Record a heatmap position sample and update the rolling average.
 * Should be called every HEATMAP_SAMPLE_INTERVAL ticks per player.
 *
 * @param stats  mutable PlayerMatchStats for this player
 * @param posX   player's current x position (0 = own goal end)
 * @param posY   player's current y position
 * @param fieldW field width  (to normalise into bucket columns)
 * @param fieldH field height (to normalise into bucket rows)
 */
export function recordPositionSample(
    stats: PlayerMatchStats,
    posX: number,
    posY: number,
    fieldW: number,
    fieldH: number,
): void {
    // Bucket index
    const col = Math.min(HEATMAP_COLS - 1, Math.floor((posX / fieldW) * HEATMAP_COLS));
    const row = Math.min(HEATMAP_ROWS - 1, Math.floor((posY / fieldH) * HEATMAP_ROWS));
    stats.heatmapBuckets[col][row]++;

    // Rolling average
    stats._posSamples++;
    const n = stats._posSamples;
    stats.avgPosX = stats.avgPosX + (posX - stats.avgPosX) / n;
    stats.avgPosY = stats.avgPosY + (posY - stats.avgPosY) / n;
}

/**
 * Finalise computed fields before handing stats to PostMatchReport.
 * Call once at fulltime.
 */
export function finaliseStats(stats: PlayerMatchStats): void {
    stats.passAccuracy = stats.passesAttempted > 0
        ? Math.round((stats.passesCompleted / stats.passesAttempted) * 100)
        : 0;
}