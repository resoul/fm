/**
 * PossessionChain — 4.1 Possession Chains
 *
 * Tracks the current "phase of play" for a team in possession:
 *
 *   build_up        — ball in own third, short passes, spread wide
 *   progression     — ball crossed halfway, look forward, play through lines
 *   final_third     — in opponent third, create chances, compress
 *   chance_creation — within shooting/crossing range, quick combinations
 *   transition      — just gained possession, explosive forward movement
 *
 * One ChainTracker per team, lives on TacticalData.
 * Updated each tick by TacticalSystem.
 * Read by OffBallSystem, DecisionSystem, UtilityAI for context-aware decisions.
 *
 * Why this improves football:
 *   - In build_up: players recycle possession, GK/CBs are valid pass targets
 *   - In progression: midfielders make runs, wingers stretch
 *   - In final_third: strikers make near-post/far-post runs, CM box arrivals
 *   - In chance_creation: quick 1-2 combinations, low-risk high-reward
 *   - In transition: all-out sprint into space (overlaps with transition_attack)
 *
 * ChainTracker also maintains:
 *   passesInChain   — consecutive passes without loss (resets on turnover)
 *   progressionRate — how much the ball moved forward this chain (0-1)
 *   dwellTime       — ticks the ball has been in current zone (tempo signal)
 */

import type { Player, TeamSide, Vec2 } from "../types";

// ── Chain phases ──────────────────────────────────────────

export type ChainPhase =
    | "build_up"
    | "progression"
    | "final_third"
    | "chance_creation"
    | "transition"
    | "none"; // team doesn't have the ball

export interface PossessionChain {
    phase: ChainPhase;
    /** Number of consecutive completed passes in this chain */
    passesInChain: number;
    /** 0-1: how far forward the ball has moved in this chain relative to field width */
    progressionRate: number;
    /** Ticks the ball has been stationary in current zone */
    dwellTime: number;
    /** X position where this chain started (for progression tracking) */
    chainStartX: number;
    /** True if the team should prioritise quick combinations over patient build-up */
    urgentMode: boolean;
}

// ── Thresholds (field-width relative) ────────────────────
// These are fractions [0,1] of field width.
// home attacks right (x increases), away attacks left (x decreases)

const CHANCE_CREATION_DIST_FROM_GOAL = 0.22; // within 22% of field width from goal
const FINAL_THIRD_THRESHOLD = 0.68;          // ball past 68% of field (for home)
const HALFWAY_THRESHOLD = 0.48;              // past halfway

// ── Tracker ───────────────────────────────────────────────

export class ChainTracker {
    private _chain: PossessionChain = makeEmptyChain();
    private _lastOwner: string | null = null;

    /**
     * Call once per tick, after TacticalSystem resolves possession.
     * Returns the updated chain (also mutates internal state).
     */
    update(
        side: TeamSide,
        ballPos: Vec2,
        ballOwner: Player | null,
        passCompletedThisTick: boolean,
        possessionLostThisTick: boolean,
        fieldWidth: number,
    ): PossessionChain {

        // ── Possession lost → reset ───────────────────────
        if (possessionLostThisTick || !ballOwner || ballOwner.team !== side) {
            this._chain = makeEmptyChain();
            this._lastOwner = null;
            return { ...this._chain };
        }

        // ── Pass completed → increment chain ─────────────
        if (passCompletedThisTick && this._lastOwner !== ballOwner.id) {
            this._chain.passesInChain++;
            this._lastOwner = ballOwner.id;
        }

        // ── Ball position → derive phase ──────────────────
        const isHome = side === "home";
        // Normalise ball X to [0,1] where 1 = opponent goal for this team
        const normX = isHome ? ballPos.x / fieldWidth : 1 - ballPos.x / fieldWidth;

        const distFromGoal = 1 - normX; // 0 = at opponent goal, 1 = own goal

        let phase: ChainPhase;

        if (distFromGoal <= CHANCE_CREATION_DIST_FROM_GOAL) {
            phase = "chance_creation";
        } else if (normX >= FINAL_THIRD_THRESHOLD) {
            phase = "final_third";
        } else if (normX >= HALFWAY_THRESHOLD) {
            phase = "progression";
        } else {
            phase = "build_up";
        }

        // Transition: just won the ball — override for first 60 ticks
        if (this._chain.phase === "none" && phase !== "none") {
            phase = "transition";
            this._chain.chainStartX = normX;
        }
        if (phase === "transition" && this._chain.dwellTime > 60) {
            // Transition window expired — settle into real phase
            const normXCur = isHome ? ballPos.x / fieldWidth : 1 - ballPos.x / fieldWidth;
            phase = resolvePhaseFromNorm(normXCur);
        }

        // ── Dwell time ────────────────────────────────────
        if (phase === this._chain.phase) {
            this._chain.dwellTime++;
        } else {
            this._chain.dwellTime = 0;
            this._chain.phase = phase;
        }

        // ── Progression rate ──────────────────────────────
        const startX = this._chain.chainStartX;
        this._chain.progressionRate = Math.max(0, Math.min(1, normX - startX));

        // ── Urgent mode ───────────────────────────────────
        // Quick combinations when: close to goal OR many passes in chain already
        this._chain.urgentMode =
            distFromGoal <= CHANCE_CREATION_DIST_FROM_GOAL + 0.1 ||
            this._chain.passesInChain >= 6;

        return { ...this._chain };
    }

    get current(): Readonly<PossessionChain> {
        return this._chain;
    }

    /** Signal a pass completion from outside (called by PassingSystem) */
    onPassCompleted(fromId: string) {
        this._lastOwner = fromId;
    }
}

// ── Helpers ───────────────────────────────────────────────

function makeEmptyChain(): PossessionChain {
    return {
        phase: "none",
        passesInChain: 0,
        progressionRate: 0,
        dwellTime: 0,
        chainStartX: 0.5,
        urgentMode: false,
    };
}

function resolvePhaseFromNorm(normX: number): ChainPhase {
    if (normX >= 1 - CHANCE_CREATION_DIST_FROM_GOAL) return "chance_creation";
    if (normX >= FINAL_THIRD_THRESHOLD) return "final_third";
    if (normX >= HALFWAY_THRESHOLD) return "progression";
    return "build_up";
}