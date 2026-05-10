// ============================================================
// FormFatigueModel — B.5
//
// Bridges intra-match fatigue with inter-match PlayerProfile
// state.  Intended to be called once after every match in a
// league / multi-match context.
//
// TWO CONCERNS:
//
//  1. Intra-match fatigue cognitive penalties
//     Applied directly inside existing systems via player.fatigue:
//       • fatigue > 0.6  → pace / stamina speed penalty (-10 %)
//         (already in MovementSystem via staminaResist calculation)
//       • fatigue > 0.8  → decisions / composure penalty (-15 %)
//         UtilityAI reads this via computeEffectiveAttribute()
//
//  2. Inter-match persistence
//     applyPostMatchFatigue() → mutates PlayerProfile.fitness / form
//     applyPreMatchModifiers() → reads profile and returns a *copy*
//       of PlayerAttributes with fitness/form adjustments applied,
//       so the engine snapshot never mutates the canonical profile.
// ============================================================

import type { PlayerAttributes, PlayerProfile } from "../types";

// ── Intra-match cognitive thresholds ─────────────────────
//
// These are read by UtilityAI via computeEffectiveAttribute().
// They are pure constants — no state required.

export const FATIGUE_THRESHOLDS = {
    /** Above this level → mild speed / stamina degradation */
    MILD:    0.6,
    /** Above this level → decisions + composure degraded */
    SEVERE:  0.8,
    /** Speed penalty at MILD threshold */
    MILD_SPEED_PENALTY:     0.10,
    /** Cognitive penalty (decisions / composure) at SEVERE threshold */
    SEVERE_COGNITIVE_PENALTY: 0.15,
} as const;

/**
 * Returns an attribute value adjusted for current intra-match fatigue.
 *
 * Call this in UtilityAI / DecisionSystem wherever you want the live
 * effective value of a mental attribute rather than the raw profile value.
 *
 * Example:
 *   const effectiveComposure = computeEffectiveAttribute(player.fatigue, player.attributes.composure);
 */
export function computeEffectiveAttribute(
    fatigue: number,
    baseValue: number,
    attributeType: "physical" | "mental" = "mental",
): number {
    if (attributeType === "physical") {
        // Physical attributes: mild penalty above 0.6
        if (fatigue > FATIGUE_THRESHOLDS.MILD) {
            const excess = (fatigue - FATIGUE_THRESHOLDS.MILD) / (1 - FATIGUE_THRESHOLDS.MILD);
            return baseValue * (1 - excess * FATIGUE_THRESHOLDS.MILD_SPEED_PENALTY);
        }
        return baseValue;
    }

    // Mental attributes: cognitive penalty above 0.8
    if (fatigue > FATIGUE_THRESHOLDS.SEVERE) {
        const excess = (fatigue - FATIGUE_THRESHOLDS.SEVERE) / (1 - FATIGUE_THRESHOLDS.SEVERE);
        return baseValue * (1 - excess * FATIGUE_THRESHOLDS.SEVERE_COGNITIVE_PENALTY);
    }
    return baseValue;
}

// ── Inter-match persistence ───────────────────────────────

export interface MatchFatigueRecord {
    playerId: string;
    /** Final fatigue value at fulltime (0–1) */
    fatigueAtFullTime: number;
    /** Player match rating (0–10) from PostMatchReport */
    matchRating: number;
    /** Minutes played */
    minutesPlayed: number;
}

/**
 * Apply post-match consequences to a player's persistent profile.
 *
 * Called once per player after fulltime by the league simulation layer.
 * Mutates `profile` in place.
 *
 * Fitness model:
 *   - Higher naturalFitness → faster recovery (less fitness loss)
 *   - High fatigue match → more fitness drop
 *   - Resting (< 45 min played) → smaller penalty
 *
 * Form model:
 *   - Sliding weighted average of last 5 match ratings
 *   - Stored as 0–100 (rating * 10)
 */
export function applyPostMatchFatigue(
    profile: PlayerProfile,
    record: MatchFatigueRecord,
    recentRatings: number[], // last N ratings (0-10), newest last
): void {
    // ── Fitness drop ──
    const naturalFitnessBonus = profile.attributes.naturalFitness / 100 * 0.4;
    const recoveryFactor = 0.6 + naturalFitnessBonus;       // 0.6–1.0
    const fatigueImpact = record.fatigueAtFullTime * 40;     // 0–40 points
    const minuteFactor = record.minutesPlayed / 90;          // 0–1
    const fitnessDrop = fatigueImpact * minuteFactor * (1 - recoveryFactor * 0.5);

    profile.fitness = Math.max(20, profile.fitness - fitnessDrop);
    profile.matchesPlayed++;

    // ── Form sliding average ──
    const ratingNorm = record.matchRating * 10;              // 0–100
    const history = [...recentRatings.slice(-4), ratingNorm]; // keep last 5

    // Exponential weighting: recent matches matter more
    const weights = history.map((_, i) => Math.pow(1.4, i));
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const weightedForm = history.reduce((acc, r, i) => acc + r * weights[i], 0) / totalWeight;

    profile.form = Math.round(Math.max(0, Math.min(100, weightedForm)));

    // ── Career stats ──
    // Goals and assists are managed by the league stats layer —
    // no mutation here to keep this module pure to fitness/form.
}

/**
 * Compute a modified copy of PlayerAttributes reflecting pre-match
 * fitness and form.  Returns a new object; never mutates the profile.
 *
 * Rules (per plan B.5):
 *   fitness < 60 → all attributes × (0.85 + fitness/100 × 0.15)
 *   form > 75    → composure +3, decisions +2 (capped at 99)
 *
 * The engine should use this copy when initialising Player.attributes
 * at match start, so every system automatically benefits.
 */
export function applyPreMatchModifiers(profile: PlayerProfile): PlayerAttributes {
    const attrs: PlayerAttributes = { ...profile.attributes };

    // ── Fitness penalty ──
    if (profile.fitness < 60) {
        const fitnessFactor = 0.85 + (profile.fitness / 100) * 0.15;
        // Apply to all numeric attribute keys
        for (const key of Object.keys(attrs) as (keyof PlayerAttributes)[]) {
            (attrs as unknown as Record<string, number>)[key] =
                Math.round((attrs[key] as number) * fitnessFactor);
        }
    }

    // ── Form bonus ──
    if (profile.form > 75) {
        attrs.composure  = Math.min(99, attrs.composure  + 3);
        attrs.decisions  = Math.min(99, attrs.decisions  + 2);
    }

    return attrs;
}

/**
 * Simulate one rest day of recovery between matches.
 * Intended to be called N times (N = days of rest) by league scheduler.
 *
 * Recovery rate is gated by naturalFitness:
 *   high naturalFitness → recovers to ~100 in 5 days
 *   low  naturalFitness → takes ~10 days
 */
export function applyRestDay(profile: PlayerProfile): void {
    const naturalFitnessBonus = profile.attributes.naturalFitness / 100;
    const dailyRecovery = 8 + naturalFitnessBonus * 12;   // 8–20 per day
    profile.fitness = Math.min(100, profile.fitness + dailyRecovery);
}
