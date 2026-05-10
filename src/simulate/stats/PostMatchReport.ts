// ============================================================
// PostMatchReport — D.1
//
// Assembles the complete analytical record of a finished match
// into one immutable object.  Produced once at fulltime by
// calling buildPostMatchReport().
//
// Dependencies:
//   C.1  PlayerMatchStats    — per-player accumulators
//   C.4  PlayerRating        — rating field on each PlayerMatchStats
//   A.2  MatchAnalyzer       — tactical observations per 15-min window
//
// Usage (inside the "fulltime" phase handler, after finaliseStats):
//
//   import { buildPostMatchReport } from "./stats/PostMatchReport";
//
//   const report = buildPostMatchReport({
//       homeTeam:          sim.world.homeTeam,
//       awayTeam:          sim.world.awayTeam,
//       state:             sim.world.state,
//       playerStats:       sim.playerStats,
//       observations:      sim.analyzer.getObservations(),
//   });
//
//   // report is fully serialisable (JSON.stringify safe)
// ============================================================

import type { Team, TeamSide, MatchEvent, TeamStats, PlayerPosition } from "../types";
import type { MatchState } from "../types";
import type { PlayerMatchStats } from "./PlayerMatchStats";
import type { MatchObservation } from "../coach/MatchAnalyzer";

// ── Public report shape ───────────────────────────────────

/** Minimal player identity needed for display, without the full Player runtime object */
export interface ReportPlayer {
    id: string;
    name: string;
    number: number;
    position: PlayerPosition;
    /** profileId if available (links back to Club.squad) */
    profileId?: string;
}

/** Team-level summary section */
export interface TeamReport {
    id: TeamSide;
    name: string;
    color: string;
    score: number;
    formation: string;

    /** Aggregate team stats (shots, possession, xG …) */
    stats: TeamStats;

    /** Full per-player stats, indexed by playerId */
    playerStats: Record<string, PlayerMatchStats>;

    /** Player identity map for display (name, number, position) */
    players: Record<string, ReportPlayer>;

    /** Derived: top-3 performers by rating, descending */
    topPerformers: Array<{ id: string; name: string; rating: number }>;

    /** Derived: Player-of-the-Match for this team */
    playerOfMatch: ReportPlayer & { rating: number };

    /** Derived: team xG vs actual goals (quality of finishing) */
    xGOverperformance: number;     // goals − xG  (positive = overperformed)
}

/** Key match event with enriched context for display */
export interface ReportEvent {
    id: string;
    type: MatchEvent["type"];
    minute: number;
    second: number;
    teamId: TeamSide | null;
    playerId: string | null;
    playerName: string | null;
    description: string;
    xg?: number;
}

/** Aggregated 15-minute tactical window for display */
export interface TacticalWindow {
    /** Match minute at start of window */
    minute: number;
    home: {
        possession: number;        // 0–1
        xGDelta: number;
        pressingSuccess: number;   // 0–1
        passCompletion: number;    // 0–1
    };
    away: {
        possession: number;
        xGDelta: number;
        pressingSuccess: number;
        passCompletion: number;
    };
}

/** Narrative headline generated from match data */
export interface MatchNarrative {
    /** e.g. "Dominant home win", "Late comeback", "Goalless stalemate" */
    headline: string;
    /** 2–3 sentence summary of the key story */
    summary: string;
    /** Notable individual moments (max 3) */
    highlights: string[];
}

/** The complete post-match report — fully serialisable */
export interface PostMatchReport {
    /** ISO timestamp of report generation */
    generatedAt: string;

    // ── Result ─────────────────────────────────────────────
    homeScore: number;
    awayScore: number;
    /** "home" | "away" | "draw" */
    winner: TeamSide | "draw";
    /** Total match ticks elapsed */
    totalTicks: number;
    /** Match duration in minutes (may be > 90 with stoppage) */
    durationMinutes: number;

    // ── Teams ──────────────────────────────────────────────
    home: TeamReport;
    away: TeamReport;

    // ── Timeline ──────────────────────────────────────────
    /** All match events in chronological order */
    events: ReportEvent[];
    /** Goal events only, for quick scoreline display */
    goals: ReportEvent[];

    // ── Tactical ──────────────────────────────────────────
    /** One entry per 15-min observation window */
    tacticalWindows: TacticalWindow[];

    // ── Narrative ─────────────────────────────────────────
    narrative: MatchNarrative;
}

// ── Builder input ─────────────────────────────────────────

export interface PostMatchReportInput {
    homeTeam: Team;
    awayTeam: Team;
    state: MatchState;
    playerStats: Map<string, PlayerMatchStats>;
    observations: readonly MatchObservation[];
}

// ── Internal helpers ──────────────────────────────────────

function buildReportPlayers(team: Team): Record<string, ReportPlayer> {
    const out: Record<string, ReportPlayer> = {};
    for (const p of team.players) {
        out[p.id] = {
            id: p.id,
            name: p.name,
            number: p.number,
            position: p.position,
            profileId: p.profileId,
        };
    }
    return out;
}

function buildTeamReport(
    team: Team,
    playerStats: Map<string, PlayerMatchStats>,
): TeamReport {
    const playerStatsRecord: Record<string, PlayerMatchStats> = {};
    for (const p of team.players) {
        const s = playerStats.get(p.id);
        if (s) playerStatsRecord[p.id] = s;
    }

    const players = buildReportPlayers(team);

    // Sort players by rating descending
    const sorted = team.players
        .map(p => ({ p, rating: playerStats.get(p.id)?.rating ?? 0 }))
        .sort((a, b) => b.rating - a.rating);

    const topPerformers = sorted.slice(0, 3).map(({ p, rating }) => ({
        id: p.id,
        name: p.name,
        rating,
    }));

    const best = sorted[0];
    const playerOfMatch: TeamReport["playerOfMatch"] = {
        ...players[best.p.id],
        rating: best.rating,
    };

    // xG overperformance: goals − cumulative xG
    const totalXG = [...team.players]
        .map(p => playerStats.get(p.id)?.xG ?? 0)
        .reduce((sum, x) => sum + x, 0);
    const xGOverperformance = parseFloat((team.score - totalXG).toFixed(2));

    return {
        id: team.id,
        name: team.name,
        color: team.color,
        score: team.score,
        formation: team.formation,
        stats: { ...team.stats },
        playerStats: playerStatsRecord,
        players,
        topPerformers,
        playerOfMatch,
        xGOverperformance,
    };
}

function buildEvents(state: MatchState): ReportEvent[] {
    return state.events.map(e => ({
        id: e.id,
        type: e.type,
        minute: e.minute,
        second: e.second,
        teamId: e.teamId,
        playerId: e.playerId,
        playerName: e.playerName,
        description: e.description,
        xg: e.xg,
    }));
}

function buildTacticalWindows(
    observations: readonly MatchObservation[],
): TacticalWindow[] {
    // Observations arrive alternating home/away per window.
    // Group by minute (same minute = same window).
    const minuteMap = new Map<number, { home?: MatchObservation; away?: MatchObservation }>();

    for (const obs of observations) {
        const bucket = minuteMap.get(obs.minute) ?? {};
        if (obs.side === "home") bucket.home = obs;
        else                      bucket.away = obs;
        minuteMap.set(obs.minute, bucket);
    }

    const windows: TacticalWindow[] = [];
    for (const [minute, bucket] of [...minuteMap.entries()].sort((a, b) => a[0] - b[0])) {
        const h = bucket.home;
        const a = bucket.away;
        windows.push({
            minute,
            home: {
                possession:      h?.possessionShare      ?? 0.5,
                xGDelta:         h?.xGDelta              ?? 0,
                pressingSuccess: h?.pressingSuccessRate   ?? 0,
                passCompletion:  h?.passCompletionRate    ?? 0,
            },
            away: {
                possession:      a?.possessionShare      ?? 0.5,
                xGDelta:         a?.xGDelta              ?? 0,
                pressingSuccess: a?.pressingSuccessRate   ?? 0,
                passCompletion:  a?.passCompletionRate    ?? 0,
            },
        });
    }
    return windows;
}

// ── Narrative generator ───────────────────────────────────

function buildNarrative(
    home: TeamReport,
    away: TeamReport,
    goals: ReportEvent[],
): MatchNarrative {
    const hScore = home.score;
    const aScore = away.score;
    const diff   = Math.abs(hScore - aScore);
    const winner = hScore > aScore ? home : aScore > hScore ? away : null;

    // ── Headline ─────────────────────────────────────────
    let headline: string;
    if (!winner) {
        if (hScore === 0) headline = "Goalless stalemate";
        else              headline = `${hScore}-all draw`;
    } else if (diff >= 3) {
        headline = `Dominant ${winner.name} victory`;
    } else if (diff === 1) {
        // Check if it was a late winner (last goal after 80')
        const lastGoal = goals[goals.length - 1];
        if (lastGoal && lastGoal.minute >= 80 && lastGoal.teamId === winner.id) {
            headline = `${winner.name} snatch it late`;
        } else {
            headline = `Narrow ${winner.name} win`;
        }
    } else {
        headline = `${winner.name} edge out ${winner.id === "home" ? away.name : home.name}`;
    }

    // ── Summary ──────────────────────────────────────────
    const homeXGStr  = (home.stats.xg ?? 0).toFixed(2);
    const awayXGStr  = (away.stats.xg ?? 0).toFixed(2);
    const homePoss   = Math.round((home.stats.possession ?? 0.5) * 100);
    const awayPoss   = 100 - homePoss;

    let summary: string;
    if (!winner) {
        summary = `${home.name} and ${away.name} shared the spoils in a ${hScore}-${aScore} draw. `
            + `${home.name} had ${homePoss}% possession and generated ${homeXGStr} xG, `
            + `while ${away.name} produced ${awayXGStr} xG from ${awayPoss}% of the ball.`;
    } else {
        const loser = winner.id === "home" ? away : home;
        summary = `${winner.name} defeated ${loser.name} ${hScore}-${aScore}. `
            + `${home.name} controlled ${homePoss}% of possession and created ${homeXGStr} xG; `
            + `${away.name} mustered ${awayXGStr} xG. `;
        // xG narrative
        if (winner.xGOverperformance > 0.5) {
            summary += `${winner.name} were clinical, outscoring their xG by ${winner.xGOverperformance.toFixed(2)}.`;
        } else if (winner.xGOverperformance < -0.5) {
            summary += `${winner.name} rode their luck slightly, underperforming their xG by ${Math.abs(winner.xGOverperformance).toFixed(2)}.`;
        }
    }

    // ── Highlights ───────────────────────────────────────
    const highlights: string[] = [];

    // Goal moments
    for (const g of goals.slice(0, 2)) {
        if (g.playerName) {
            highlights.push(
                `${g.playerName} (${g.minute}') ${g.xg ? `[xG: ${g.xg.toFixed(2)}]` : ""}`.trim()
            );
        }
    }

    // Player of the match (highest overall rating across both teams)
    const bestOverall = [home.playerOfMatch, away.playerOfMatch]
        .sort((a, b) => b.rating - a.rating)[0];
    if (bestOverall) {
        highlights.push(
            `${bestOverall.name} — Player of the Match (${bestOverall.rating.toFixed(1)})`
        );
    }

    return { headline, summary, highlights };
}

// ── Main builder ─────────────────────────────────────────

/**
 * Build a fully-populated PostMatchReport.
 *
 * Call once at fulltime, after:
 *   1. finaliseStats(stats) has been called for every player
 *   2. rateAllPlayers() has populated stats.rating
 */
export function buildPostMatchReport(input: PostMatchReportInput): PostMatchReport {
    const { homeTeam, awayTeam, state, playerStats, observations } = input;

    const home = buildTeamReport(homeTeam, playerStats);
    const away = buildTeamReport(awayTeam, playerStats);

    const events  = buildEvents(state);
    const goals   = events.filter(e => e.type === "goal");

    const winner: TeamSide | "draw" =
        homeTeam.score > awayTeam.score ? "home" :
            awayTeam.score > homeTeam.score ? "away" :
                "draw";

    const tacticalWindows = buildTacticalWindows(observations);
    const narrative       = buildNarrative(home, away, goals);

    return {
        generatedAt: new Date().toISOString(),
        homeScore: homeTeam.score,
        awayScore: awayTeam.score,
        winner,
        totalTicks: state.tick,
        durationMinutes: state.minute,
        home,
        away,
        events,
        goals,
        tacticalWindows,
        narrative,
    };
}

// ── Convenience: serialise / deserialise ──────────────────

/** Serialise to JSON string (report is already plain-data safe) */
export function serialiseReport(report: PostMatchReport): string {
    return JSON.stringify(report, null, 2);
}

/** Deserialise from JSON string */
export function deserialiseReport(json: string): PostMatchReport {
    return JSON.parse(json) as PostMatchReport;
}