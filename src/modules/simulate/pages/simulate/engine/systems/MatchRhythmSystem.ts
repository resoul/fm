/**
 * MatchRhythmSystem — 4.3 Match Rhythm
 *
 * Per-tick tempo control that creates realistic match flow:
 *
 *   WINNING TEAM:
 *     - Slows tempo gradually (recycling possession, backward passes)
 *     - Drops directness (prefers safe short passes)
 *     - Reduces pressing intensity (protect the lead)
 *     - In final 10 min: maximum time-wasting
 *
 *   LOSING TEAM:
 *     - Raises tempo automatically (urgency)
 *     - Increases directness (long balls, direct play)
 *     - Raises press line (hunting for the ball)
 *     - In final 10 min: maximum urgency
 *
 *   NEUTRAL / DRAW:
 *     - Lets base style control tempo
 *     - Slight urgency increase after 75 min (both teams push)
 *
 * Writes `ctx.tactical.rhythmModifiers` — a TempoModifier per team.
 * Read by TacticalInstructionsSystem (already reads tempoBias) and
 * OffBallSystem (forwardRunBias, supportDropBias).
 */

import type { SimulationContext } from "../context";
import type { SimulationSystem } from "../pipeline";
import type { Command } from "../core/Command";
import type { TeamSide } from "../types";

export interface TempoModifier {
    /** Additive delta on tempoBias [-0.4, +0.4] */
    tempoDelta: number;
    /** Additive delta on directnessFactor [-0.3, +0.3] */
    directnessDelta: number;
    /** Additive delta on pressLineFactor [-0.5, +0.5] */
    pressLineDelta: number;
    /** 0 = normal, 1 = max time-waste (triggers backward-pass preference) */
    timeWasteFactor: number;
    /** Descriptive state for debug/commentary */
    state: "normal" | "protecting_lead" | "chasing_game" | "desperate" | "time_wasting";
}

export class MatchRhythmSystem implements SimulationSystem {
    name = "MatchRhythmSystem";

    update(ctx: SimulationContext): Command[] {
        const minute = ctx.state.minute;
        const homeScore = ctx.homeTeam.score;
        const awayScore = ctx.awayTeam.score;

        const homeRhythm = this._computeRhythm("home", homeScore, awayScore, minute);
        const awayRhythm = this._computeRhythm("away", awayScore, homeScore, minute);

        // Attach to tactical data (extend if needed)
        if (ctx.tactical) {
            (ctx.tactical as any).rhythmModifiers = {
                home: homeRhythm,
                away: awayRhythm,
            };
        }

        return [];
    }

    private _computeRhythm(
        _side: TeamSide,
        ownScore: number,
        oppScore: number,
        minute: number,
    ): TempoModifier {
        const scoreDiff = ownScore - oppScore;
        const isLateGame = minute >= 70;
        const isFinalMinutes = minute >= 80;
        const isCrunchTime = minute >= 85;

        // ── Desperate chasing ───────────────────────────────
        if (scoreDiff <= -2 && isFinalMinutes) {
            return {
                tempoDelta: +0.4,
                directnessDelta: +0.3,
                pressLineDelta: +0.4,
                timeWasteFactor: 0,
                state: "desperate",
            };
        }

        if (scoreDiff < 0 && isCrunchTime) {
            return {
                tempoDelta: +0.35,
                directnessDelta: +0.25,
                pressLineDelta: +0.3,
                timeWasteFactor: 0,
                state: "desperate",
            };
        }

        if (scoreDiff < 0 && isLateGame) {
            const urgency = Math.min((minute - 70) / 20, 1);
            return {
                tempoDelta: 0.15 + urgency * 0.2,
                directnessDelta: 0.1 + urgency * 0.15,
                pressLineDelta: 0.15 + urgency * 0.2,
                timeWasteFactor: 0,
                state: "chasing_game",
            };
        }

        if (scoreDiff < 0) {
            return {
                tempoDelta: +0.1,
                directnessDelta: +0.08,
                pressLineDelta: +0.1,
                timeWasteFactor: 0,
                state: "chasing_game",
            };
        }

        // ── Protecting lead ─────────────────────────────────
        if (scoreDiff >= 1 && isCrunchTime) {
            return {
                tempoDelta: -0.35,
                directnessDelta: -0.3,
                pressLineDelta: -0.3,
                timeWasteFactor: 0.8,
                state: "time_wasting",
            };
        }

        if (scoreDiff >= 1 && isFinalMinutes) {
            return {
                tempoDelta: -0.25,
                directnessDelta: -0.2,
                pressLineDelta: -0.2,
                timeWasteFactor: 0.5,
                state: "time_wasting",
            };
        }

        if (scoreDiff >= 1 && isLateGame) {
            const conservation = Math.min((minute - 70) / 15, 1);
            return {
                tempoDelta: -(0.1 + conservation * 0.2),
                directnessDelta: -(0.1 + conservation * 0.15),
                pressLineDelta: -(0.1 + conservation * 0.1),
                timeWasteFactor: conservation * 0.4,
                state: "protecting_lead",
            };
        }

        if (scoreDiff >= 2) {
            // Comfortable lead — already managing even early
            return {
                tempoDelta: -0.1,
                directnessDelta: -0.1,
                pressLineDelta: -0.1,
                timeWasteFactor: 0,
                state: "protecting_lead",
            };
        }

        // ── Neutral / draw ──────────────────────────────────
        if (isLateGame && scoreDiff === 0) {
            const pushFactor = Math.min((minute - 70) / 20, 1) * 0.15;
            return {
                tempoDelta: pushFactor,
                directnessDelta: pushFactor * 0.5,
                pressLineDelta: pushFactor,
                timeWasteFactor: 0,
                state: "normal",
            };
        }

        return {
            tempoDelta: 0,
            directnessDelta: 0,
            pressLineDelta: 0,
            timeWasteFactor: 0,
            state: "normal",
        };
    }
}
