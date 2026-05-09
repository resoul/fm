/**
 * MomentumSystem — 4.2 Match Momentum
 *
 * After a goal, the scoring team gets a confidence spike and the
 * conceding team enters a brief panic/shock state. This is applied
 * by modifying pressureIntensity in tactical states and a new
 * `momentumBoost` field written to TacticalData.
 *
 * Effects:
 *
 *   SCORING TEAM (confidence spike, ~90 seconds = 5400 ticks):
 *   — pressureIntensity += CONFIDENCE_PRESS_BONUS (presses harder)
 *   — MovementSystem speed boost: MOMENTUM_SPEED_BONUS multiplied on max speed
 *     (not applied here — written to ctx.tactical.momentum for MovementSystem to read)
 *   — OffBallSystem: more forward runs (transitional urgency stays elevated)
 *
 *   CONCEDING TEAM (shock, ~30 seconds = 1800 ticks):
 *   — pressureIntensity -= SHOCK_PRESS_PENALTY (presses less, disorganised)
 *   — Defensive line drops (defensiveLineX clamped lower)
 *   — Then transitions into normal state
 *
 * Implementation:
 * — This system runs AFTER TacticalSystem so it can modify the
 *   already-computed tactical states.
 * — It listens to ctx.state.events for new "goal" events.
 * — All effects decay linearly over their duration.
 *
 * Context extension:
 *   ctx.tactical.momentum: MomentumData
 */

import type { SimulationContext } from "../context";
import type { SimulationSystem } from "../pipeline";
import type { Command } from "../core/Command";
import type { TeamSide } from "../types";

// ── Tuning constants ──────────────────────────────────────

// How long the scoring team stays boosted (ticks at 60fps)
const CONFIDENCE_DURATION_TICKS = 5400;   // ~90 seconds

// How long the conceding team is in shock (ticks at 60fps)
const SHOCK_DURATION_TICKS = 1800;        // ~30 seconds

// Peak bonus to pressureIntensity for the scoring team (+0 to +0.3)
const CONFIDENCE_PRESS_BONUS = 0.3;

// Peak penalty to pressureIntensity for the conceding team (0 to -0.25)
const SHOCK_PRESS_PENALTY = 0.25;

// Defensive line pull-back for conceding team (drops by this fraction)
const SHOCK_DEFENSIVE_LINE_DROP = 0.15;

// Speed boost factor for the scoring team (read by MovementSystem)
export const MOMENTUM_SPEED_BONUS = 0.12;  // +12% max speed at peak

// ── Types ─────────────────────────────────────────────────

export interface TeamMomentum {
    /** >0 = confidence spike (scored), <0 = shock (conceded).  Range -1..1 */
    value: number;
    /** Ticks remaining for this momentum state. 0 = expired */
    ticksLeft: number;
    /** Which direction this momentum applies: +1 = scored, -1 = conceded */
    direction: 1 | -1;
}

export interface MomentumData {
    home: TeamMomentum;
    away: TeamMomentum;
    /** Last goal tick we reacted to (prevent double-trigger) */
    lastGoalTick: number;
}

// Extend TacticalData
declare module "../context" {
    interface TacticalData {
        momentum?: MomentumData;
    }
}

const DEFAULT_MOMENTUM: TeamMomentum = { value: 0, ticksLeft: 0, direction: 1 };

export class MomentumSystem implements SimulationSystem {
    name = "MomentumSystem";

    update(ctx: SimulationContext): Command[] {
        // Ensure momentum data exists
        if (!ctx.tactical.momentum) {
            ctx.tactical.momentum = {
                home: { ...DEFAULT_MOMENTUM },
                away: { ...DEFAULT_MOMENTUM },
                lastGoalTick: -1,
            };
        }

        const m = ctx.tactical.momentum;

        // ── 1. Detect new goal this tick ──────────────────
        // We look at recent events for a "goal" type that we haven't reacted to.
        // Using state.tick as the discriminator.
        const recentGoal = ctx.state.events
            .slice()
            .reverse()
            .find(e => e.type === "goal" && ctx.state.tick - m.lastGoalTick > 10);

        if (recentGoal && recentGoal.teamId !== null) {
            const scoringTeam = recentGoal.teamId as TeamSide;
            const concedingTeam: TeamSide = scoringTeam === "home" ? "away" : "home";

            m.lastGoalTick = ctx.state.tick;

            // Scoring team: confidence spike
            m[scoringTeam] = {
                value: 1.0,
                ticksLeft: CONFIDENCE_DURATION_TICKS,
                direction: 1,
            };

            // Conceding team: shock
            m[concedingTeam] = {
                value: -1.0,
                ticksLeft: SHOCK_DURATION_TICKS,
                direction: -1,
            };
        }

        // ── 2. Decay momentum each tick ───────────────────
        for (const side of ["home", "away"] as TeamSide[]) {
            const teamM = m[side];
            if (teamM.ticksLeft > 0) {
                teamM.ticksLeft--;
                const duration = teamM.direction > 0
                    ? CONFIDENCE_DURATION_TICKS
                    : SHOCK_DURATION_TICKS;
                // Linear decay from peak to 0
                teamM.value = teamM.direction * (teamM.ticksLeft / duration);
            } else {
                teamM.value = 0;
            }
        }

        // ── 3. Apply effects to tactical states ───────────
        // TacticalSystem has already computed states; we overlay the momentum effects.
        this.applyMomentumToState(ctx, "home", m.home);
        this.applyMomentumToState(ctx, "away", m.away);

        return [];
    }

    private applyMomentumToState(
        ctx: SimulationContext,
        side: TeamSide,
        teamM: TeamMomentum,
    ): void {
        if (teamM.ticksLeft === 0) return;

        const state = side === "home" ? ctx.tactical.homeState : ctx.tactical.awayState;

        if (teamM.direction > 0) {
            // Confidence: press harder, push up
            const boost = teamM.value * CONFIDENCE_PRESS_BONUS;
            (state as any).pressureIntensity = Math.min(1, state.pressureIntensity + boost);
        } else {
            // Shock: press less, drop defensive line
            const penalty = Math.abs(teamM.value) * SHOCK_PRESS_PENALTY;
            (state as any).pressureIntensity = Math.max(0, state.pressureIntensity - penalty);

            const lineDrop = Math.abs(teamM.value) * SHOCK_DEFENSIVE_LINE_DROP;
            (state as any).defensiveLineX = Math.max(0.1, state.defensiveLineX - lineDrop);
        }
    }
}

/**
 * Helper for MovementSystem: get the current momentum speed multiplier for a team.
 * Returns a value 1.0..1+MOMENTUM_SPEED_BONUS.
 * Confidence gives a speed boost; shock gives a slight penalty.
 */
export function getMomentumSpeedMultiplier(ctx: SimulationContext, side: TeamSide): number {
    const m = ctx.tactical.momentum;
    if (!m) return 1.0;

    const teamM = m[side];
    if (teamM.ticksLeft === 0) return 1.0;

    if (teamM.direction > 0) {
        // Confidence: +12% at peak, decaying to 0
        return 1.0 + teamM.value * MOMENTUM_SPEED_BONUS;
    } else {
        // Shock: -5% at peak, decaying to 0
        return Math.max(0.92, 1.0 + teamM.value * 0.05);
    }
}