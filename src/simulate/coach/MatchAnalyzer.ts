// ============================================================
// MatchAnalyzer — A.2
//
// Computes tactical observations every ~900 ticks (≈ 15 match
// minutes at 60fps). Observations are the raw input feed that
// CoachSystem reads to make substitution / style decisions.
//
// Stored on the MatchAnalyzer instance; CoachSystem receives
// the latest snapshot via getObservations().
// ============================================================

import type { SimulationContext } from "../context";
import type { TeamSide } from "../types";

export interface MatchObservation {
    /** Match minute at which this observation was recorded */
    minute: number;
    side: TeamSide;
    /** Fraction of press attempts that led to possession recovery in this window */
    pressingSuccessRate: number;
    /** xG this team − xG opponent over the window */
    xGDelta: number;
    /** Possession share in the window (0–1) */
    possessionShare: number;
    /** Average pressure on the ball-carrier this team faced */
    avgPressureUnder: number;
    /** Fraction of attacks that entered the opponent's final third */
    dangerZoneAccess: number;
    /** Average ticks for a transition from attack to defence (rough proxy) */
    transitionSpeed: number;
    /** Pass completion rate in the window */
    passCompletionRate: number;
}

// Snapshot of cumulative raw metrics used to compute a window delta
interface WindowSnapshot {
    tick: number;
    xG: number;
    passes: number;
    passesCompleted: number;
    possessionTicks: number;
    pressingActions: number;          // C.1 stat
    interceptions: number;            // rough press-success proxy
    dangerEntries: number;            // approximated from xG > 0.08 shots
}

function zeroSnapshot(tick: number, ctx: SimulationContext, side: TeamSide): WindowSnapshot {
    const team = side === "home" ? ctx.homeTeam : ctx.awayTeam;
    const stats = team.stats;
    // Aggregate pressing + interceptions from player stats
    let pressingActions = 0;
    let interceptions   = 0;
    for (const p of team.players) {
        const ps = ctx.playerStats?.get(p.id);
        if (ps) { pressingActions += ps.pressingActions; interceptions += ps.interceptions; }
    }
    return {
        tick,
        xG: stats.xg,
        passes: stats.passes,
        passesCompleted: Math.round(stats.passAccuracy / 100 * stats.passes),
        possessionTicks: ctx.state.stats.possessionTick[side],
        pressingActions,
        interceptions,
        dangerEntries: 0, // accumulated separately via xG shots > threshold
    };
}

export const OBSERVATION_INTERVAL_TICKS = 900; // ~15 min at 60fps
const DANGER_XG_THRESHOLD = 0.08;

export class MatchAnalyzer {
    private _homeSnapshot: WindowSnapshot | null = null;
    private _awaySnapshot:  WindowSnapshot | null = null;
    private _observations: MatchObservation[] = [];
    /** xG of shots fired in current window per side */
    private _windowXGHome = 0;
    private _windowXGAway = 0;
    /** Danger entries (shots above threshold) per side in window */
    private _dangerHome = 0;
    private _dangerAway = 0;

    /** Called by CoachSystem after a shot event to track danger-zone access */
    recordShot(side: TeamSide, xg: number): void {
        if (xg >= DANGER_XG_THRESHOLD) {
            if (side === "home") this._dangerHome++;
            else                  this._dangerAway++;
        }
        if (side === "home") this._windowXGHome += xg;
        else                  this._windowXGAway += xg;
    }

    /**
     * Called once per tick from CoachSystem.update().
     * Builds an observation when the window expires.
     */
    update(ctx: SimulationContext): void {
        const tick = ctx.state.tick;
        if (tick === 0) return;

        // Initialise snapshots on first call
        if (!this._homeSnapshot) {
            this._homeSnapshot = zeroSnapshot(tick, ctx, "home");
            this._awaySnapshot  = zeroSnapshot(tick, ctx, "away");
            return;
        }

        if (tick % OBSERVATION_INTERVAL_TICKS !== 0) return;

        // Build observations for both sides
        this._buildObservation(ctx, "home");
        this._buildObservation(ctx, "away");

        // Reset window accumulators
        this._homeSnapshot = zeroSnapshot(tick, ctx, "home");
        this._awaySnapshot  = zeroSnapshot(tick, ctx, "away");
        this._windowXGHome  = 0;
        this._windowXGAway  = 0;
        this._dangerHome    = 0;
        this._dangerAway    = 0;
    }

    private _buildObservation(ctx: SimulationContext, side: TeamSide): void {
        const prev = side === "home" ? this._homeSnapshot! : this._awaySnapshot!;
        const oppSide: TeamSide = side === "home" ? "away" : "home";

        const curXG    = (side === "home" ? ctx.homeTeam : ctx.awayTeam).stats.xg;
        const oppXG    = (oppSide === "home" ? ctx.homeTeam : ctx.awayTeam).stats.xg;
        const prevOppXG = (oppSide === "home" ? this._homeSnapshot! : this._awaySnapshot!).xG;

        const curPoss  = ctx.state.stats.possessionTick[side];
        const oppPoss  = ctx.state.stats.possessionTick[oppSide];
        const totalPoss = curPoss + oppPoss;

        const curPasses  = (side === "home" ? ctx.homeTeam : ctx.awayTeam).stats.passes;
        const prevPasses = prev.passes;
        const windowPasses = Math.max(1, curPasses - prevPasses);

        // Pass completion in window (approximate — uses current accuracy as proxy)
        const teamStats = (side === "home" ? ctx.homeTeam : ctx.awayTeam).stats;
        const passAccuracy = teamStats.passAccuracy / 100;

        // Pressing success: interceptions / pressing actions in window
        let curPressing     = 0;
        let curInterceptions = 0;
        for (const p of (side === "home" ? ctx.homeTeam : ctx.awayTeam).players) {
            const ps = ctx.playerStats?.get(p.id);
            if (ps) { curPressing += ps.pressingActions; curInterceptions += ps.interceptions; }
        }
        const winPressing     = Math.max(1, curPressing     - prev.pressingActions);
        const winInterceptions = curInterceptions - prev.interceptions;
        const pressingSuccessRate = Math.min(1, winInterceptions / winPressing);

        // Danger zone: shots with xG > threshold as fraction of total attacks
        // Use window xG shots as attack count proxy
        const dangerEntries = side === "home" ? this._dangerHome : this._dangerAway;
        const windowShots   = side === "home" ? this._windowXGHome : this._windowXGAway;
        const dangerZoneAccess = windowShots > 0 ? Math.min(1, dangerEntries / Math.max(1, windowShots)) : 0;

        // xGDelta: own team xG minus opponent xG in this window
        const xGDelta = (curXG - prev.xG) - (oppXG - prevOppXG);

        // TransitionSpeed: rough proxy — not directly measurable without event timestamps
        // Use possession ticks change as an inverse (fast team = many possession changes)
        const possessionChanges = Math.max(1, (curPoss - prev.possessionTicks) / 30);
        const transitionSpeed = 900 / possessionChanges;

        const obs: MatchObservation = {
            minute: ctx.state.minute,
            side,
            pressingSuccessRate,
            xGDelta,
            possessionShare: totalPoss > 0 ? (curPoss - prev.possessionTicks) / (totalPoss - prev.possessionTicks - ((ctx.state.stats.possessionTick[oppSide]) - prev.possessionTicks) + curPoss - prev.possessionTicks) : 0.5,
            avgPressureUnder: (side === "home" ? ctx.tactical.homeState : ctx.tactical.awayState).pressureIntensity,
            dangerZoneAccess,
            transitionSpeed,
            passCompletionRate: passAccuracy,
        };

        // Keep at most 6 observations (one per 15-min window in a 90-min match)
        this._observations.push(obs);
        if (this._observations.length > 12) {
            this._observations = this._observations.slice(-12);
        }
    }

    /** Returns all observations, newest last */
    getObservations(): readonly MatchObservation[] {
        return this._observations;
    }

    /**
     * Returns the latest observation for a given side, or null if no
     * observations have been recorded yet.
     */
    getLatest(side: TeamSide): MatchObservation | null {
        for (let i = this._observations.length - 1; i >= 0; i--) {
            if (this._observations[i].side === side) return this._observations[i];
        }
        return null;
    }

    /**
     * Returns the last N observations for a given side.
     * Useful for CoachSystem to check trends over multiple windows.
     */
    getRecent(side: TeamSide, n = 2): MatchObservation[] {
        return this._observations
            .filter(o => o.side === side)
            .slice(-n);
    }
}
