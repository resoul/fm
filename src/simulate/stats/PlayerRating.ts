// ============================================================
// PlayerRating — C.4
//
// Computes a 0–10 match rating for each player from their
// accumulated PlayerMatchStats.
//
// Usage (call once at fulltime, after finaliseStats()):
//
//   import { rateAllPlayers } from "./PlayerRating";
//   rateAllPlayers(ctx.playerStats, homeTeam.players, awayTeam.players);
//   // stats.rating is now populated for every player
//
// Design goals
// ────────────
// • Baseline 6.0 for everyone who played — not 0.
// • Weighted by role: GKs aren't punished for 0 shots; strikers
//   aren't punished for 0 tackles.
// • Capped contributions per stat so one hat-trick doesn't push
//   everyone else to 3.0.
// • Clamps final output to [3.0, 10.0].
// ============================================================

import type { PlayerMatchStats } from "./PlayerMatchStats";
import type { PlayerPosition } from "../types";

// ── Weight profiles by role bucket ───────────────────────

type RoleBucket = "gk" | "defender" | "midfielder" | "attacker";

interface WeightProfile {
    goals:             number;
    assists:           number;
    xG:                number;
    xA:                number;
    shots:             number;
    shotsOnTarget:     number;
    keyPasses:         number;
    chancesCreated:    number;
    passAccuracy:      number;  // 0–100 scale
    progressivePasses: number;
    progressiveCarries:number;
    tackles:           number;
    interceptions:     number;
    duelsWon:          number;
    duelsLost:         number;  // negative
    pressingActions:   number;
    distanceCovered:   number;
    // GK-specific (mapped from standard fields)
    saves:             number;  // = shotsOnTarget conceded - goals conceded (approximated)
}

const PROFILES: Record<RoleBucket, WeightProfile> = {
    gk: {
        goals:             0.6,
        assists:           0.2,
        xG:                0.0,
        xA:                0.1,
        shots:             0.0,
        shotsOnTarget:     0.0,
        keyPasses:         0.1,
        chancesCreated:    0.1,
        passAccuracy:      0.015,
        progressivePasses: 0.03,
        progressiveCarries:0.01,
        tackles:           0.15,
        interceptions:     0.15,
        duelsWon:          0.12,
        duelsLost:        -0.12,
        pressingActions:   0.02,
        distanceCovered:   0.0002,
        saves:             0.55,  // primary stat for GK
    },
    defender: {
        goals:             0.7,
        assists:           0.4,
        xG:                0.1,
        xA:                0.2,
        shots:             0.04,
        shotsOnTarget:     0.06,
        keyPasses:         0.12,
        chancesCreated:    0.15,
        passAccuracy:      0.018,
        progressivePasses: 0.05,
        progressiveCarries:0.04,
        tackles:           0.28,
        interceptions:     0.30,
        duelsWon:          0.22,
        duelsLost:        -0.18,
        pressingActions:   0.06,
        distanceCovered:   0.0003,
        saves:             0.0,
    },
    midfielder: {
        goals:             0.6,
        assists:           0.55,
        xG:                0.25,
        xA:                0.30,
        shots:             0.07,
        shotsOnTarget:     0.10,
        keyPasses:         0.22,
        chancesCreated:    0.25,
        passAccuracy:      0.020,
        progressivePasses: 0.09,
        progressiveCarries:0.07,
        tackles:           0.18,
        interceptions:     0.18,
        duelsWon:          0.14,
        duelsLost:        -0.12,
        pressingActions:   0.08,
        distanceCovered:   0.0004,
        saves:             0.0,
    },
    attacker: {
        goals:             0.90,
        assists:           0.60,
        xG:                0.40,
        xA:                0.25,
        shots:             0.09,
        shotsOnTarget:     0.14,
        keyPasses:         0.18,
        chancesCreated:    0.20,
        passAccuracy:      0.010,
        progressivePasses: 0.06,
        progressiveCarries:0.10,
        tackles:           0.08,
        interceptions:     0.08,
        duelsWon:          0.10,
        duelsLost:        -0.08,
        pressingActions:   0.07,
        distanceCovered:   0.0003,
        saves:             0.0,
    },
};

// ── Role mapping ──────────────────────────────────────────

function getBucket(position: PlayerPosition): RoleBucket {
    if (position === "GK")                                       return "gk";
    if (["CB", "LB", "RB", "LWB", "RWB"].includes(position))   return "defender";
    if (["ST", "CF", "LW", "RW", "SS"].includes(position))      return "attacker";
    return "midfielder";
}

// ── Stat contribution helpers ─────────────────────────────

/** Cap a raw value contribution to avoid one outlier dominating */
function capped(value: number, cap: number): number {
    return Math.min(value, cap);
}

/**
 * Compute a score delta (positive or negative) from a single stat.
 * Each multiplier is applied to the capped raw stat value.
 */
function contribution(value: number, weight: number, cap: number): number {
    return capped(value, cap) * weight;
}

// ── Core rating function ──────────────────────────────────

/**
 * Compute a 0–10 rating for one player.
 * Caller should ensure `finaliseStats(stats)` has been called first
 * (so passAccuracy is computed).
 *
 * The `saves` field is not tracked directly on PlayerMatchStats; it is
 * approximated here as `shotsOnTarget` for GKs (i.e. each shot-on-target
 * they faced that did NOT become a goal counts as a save — which requires
 * the caller to pass in goals conceded).  If you have a dedicated saves
 * counter, wire it in separately.
 */
export function computeRating(
    stats: PlayerMatchStats,
    position: PlayerPosition,
    /** Only used for GKs: goals scored against them this match */
    goalsConceded = 0,
): number {
    const w = PROFILES[getBucket(position)];

    // Base: every player who took part starts at 6.0
    let score = 6.0;

    // ── Attacking contributions ───────────────────────────
    score += contribution(stats.goals,             w.goals,             3)   * 1.0;
    score += contribution(stats.assists,           w.assists,           3)   * 1.0;
    score += contribution(stats.xG,                w.xG,                3.0) * 1.0;
    score += contribution(stats.xA,                w.xA,                2.5) * 1.0;
    score += contribution(stats.shots,             w.shots,             8)   * 1.0;
    score += contribution(stats.shotsOnTarget,     w.shotsOnTarget,     6)   * 1.0;
    score += contribution(stats.keyPasses,         w.keyPasses,         6)   * 1.0;
    score += contribution(stats.chancesCreated,    w.chancesCreated,    4)   * 1.0;

    // ── Passing / progression ─────────────────────────────
    // passAccuracy is 0–100; normalise to 0–1 delta around a 75% baseline
    const passAccDelta = (stats.passAccuracy - 75) / 100;   // −0.75 to +0.25
    score += passAccDelta * w.passAccuracy * 100;            // re-scale

    score += contribution(stats.progressivePasses,  w.progressivePasses,  12) * 1.0;
    score += contribution(stats.progressiveCarries, w.progressiveCarries, 10) * 1.0;

    // ── Defensive contributions ───────────────────────────
    score += contribution(stats.tacklesWon,         w.tackles,          8) * 1.0;
    score += contribution(stats.interceptions,      w.interceptions,    8) * 1.0;
    score += contribution(stats.duelsWon,           w.duelsWon,        12) * 1.0;
    score -= contribution(stats.duelsLost,         -w.duelsLost,       10) * 1.0;  // weight is negative, make positive

    // ── Pressing ──────────────────────────────────────────
    score += contribution(stats.pressingActions,    w.pressingActions,  15) * 1.0;

    // ── Work rate ─────────────────────────────────────────
    score += contribution(stats.distanceCovered,    w.distanceCovered, 12000) * 1.0;

    // ── GK: saves ─────────────────────────────────────────
    if (getBucket(position) === "gk") {
        // Saves = shots on target faced − goals conceded.
        // shotsOnTarget on a GK's stats counts shots they encountered.
        const saves = Math.max(0, stats.shotsOnTarget - goalsConceded);
        score += capped(saves, 8) * w.saves;

        // Clean sheet bonus
        if (goalsConceded === 0) score += 0.5;

        // Goal penalty (slight, separate from saves)
        score -= Math.min(goalsConceded, 5) * 0.20;
    }

    // ── Minutes played scaling ────────────────────────────
    // Sub who played 20 minutes should not easily outscore 90-min starter.
    // Scale everything toward 6.0 baseline for partial appearances.
    const minuteFactor = Math.min(1, stats.minutesPlayed / 60);
    score = 6.0 + (score - 6.0) * minuteFactor;

    // ── Clamp ─────────────────────────────────────────────
    return Math.round(Math.max(3.0, Math.min(10.0, score)) * 10) / 10;
}

// ── Batch helper ──────────────────────────────────────────

export interface PlayerRef {
    id: string;
    position: PlayerPosition;
}

/**
 * Rate all players in a match and write `rating` back into their stats.
 *
 * @param playerStats  ctx.playerStats (mutated in-place)
 * @param homePlayers  minimal player refs from homeTeam.players
 * @param awayPlayers  minimal player refs from awayTeam.players
 * @param homeGoalsConceded  goals scored by away team
 * @param awayGoalsConceded  goals scored by home team
 */
export function rateAllPlayers(
    playerStats: Map<string, PlayerMatchStats>,
    homePlayers: PlayerRef[],
    awayPlayers: PlayerRef[],
    homeGoalsConceded = 0,
    awayGoalsConceded = 0,
): void {
    for (const p of homePlayers) {
        const stats = playerStats.get(p.id);
        if (!stats) continue;
        stats.rating = computeRating(stats, p.position, homeGoalsConceded);
    }
    for (const p of awayPlayers) {
        const stats = playerStats.get(p.id);
        if (!stats) continue;
        stats.rating = computeRating(stats, p.position, awayGoalsConceded);
    }
}

// ── Convenience: best XI by rating ───────────────────────

/**
 * Return the top-N rated players from a given stats map + player list,
 * sorted descending by rating.  Useful for post-match report headlines.
 */
export function topRatedPlayers(
    playerStats: Map<string, PlayerMatchStats>,
    players: PlayerRef[],
    n = 3,
): Array<{ id: string; position: PlayerPosition; rating: number }> {
    return players
        .map(p => ({
            id: p.id,
            position: p.position,
            rating: playerStats.get(p.id)?.rating ?? 0,
        }))
        .sort((a, b) => b.rating - a.rating)
        .slice(0, n);
}