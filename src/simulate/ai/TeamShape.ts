/**
 * TeamShape — 2.3 Team Shape System
 *
 * Replaces static formation anchors with a dynamic shape that:
 *
 *   1. Shifts as a block toward the ball (horizontal + vertical tracking)
 *   2. Compresses or expands width/depth based on tactical phase
 *   3. Raises/lowers defensive line based on possession + chain phase
 *   4. Returns a per-player "shape target" Vec2 — the ideal position
 *      this tick given the team's collective shape.
 *
 * Used by OffBallSystem and DecisionSystem to provide a smarter
 * formation anchor instead of the static player.targetPos.
 *
 * Compactness (from plan):
 *   out_of_possession → narrow + short (compact block)
 *   in_possession / build_up → wider
 *   final_third / chance_creation → narrow again (overload area)
 *   transition → elongated (stretched shape)
 */

import type { Player, Team, Vec2 } from "../types";
import type { TeamTacticalState } from "../types";
import type { PossessionChain } from "./PossessionChain";

export interface ShapeParams {
    /** How much the block tracks ball X: 0=stays at anchor, 1=follows ball fully */
    ballTrackingX: number;
    /** How much the block tracks ball Y */
    ballTrackingY: number;
    /** Width multiplier: 1 = formation default, <1 = narrower, >1 = wider */
    widthScale: number;
    /** Depth multiplier: 1 = formation default, <1 = shorter, >1 = deeper/longer */
    depthScale: number;
    /** Defensive line shift: positive = higher up pitch (toward opponent goal) */
    lineShift: number;
}

// ── Per-player shape result ───────────────────────────────

export interface ShapeTarget {
    playerId: string;
    pos: Vec2;
}

// ── Preset shape configs ──────────────────────────────────

const SHAPE_PRESETS: Record<string, ShapeParams> = {
    // Defending deep — compact block
    compact_defense: {
        ballTrackingX: 0.28,
        ballTrackingY: 0.35,
        widthScale: 0.72,
        depthScale: 0.70,
        lineShift: -0.08,
    },
    // Pressing high — still narrow but pushed up
    high_press: {
        ballTrackingX: 0.45,
        ballTrackingY: 0.42,
        widthScale: 0.78,
        depthScale: 0.75,
        lineShift: 0.12,
    },
    // Build-up — wide, patient
    build_up: {
        ballTrackingX: 0.18,
        ballTrackingY: 0.25,
        widthScale: 1.15,
        depthScale: 0.90,
        lineShift: 0.0,
    },
    // Progression — balanced
    progression: {
        ballTrackingX: 0.30,
        ballTrackingY: 0.30,
        widthScale: 1.05,
        depthScale: 0.95,
        lineShift: 0.06,
    },
    // Final third — narrow and high
    final_third: {
        ballTrackingX: 0.40,
        ballTrackingY: 0.40,
        widthScale: 0.85,
        depthScale: 0.80,
        lineShift: 0.15,
    },
    // Chance creation — tight overload
    chance_creation: {
        ballTrackingX: 0.50,
        ballTrackingY: 0.50,
        widthScale: 0.75,
        depthScale: 0.70,
        lineShift: 0.18,
    },
    // Counter — stretched
    transition: {
        ballTrackingX: 0.55,
        ballTrackingY: 0.22,
        widthScale: 1.10,
        depthScale: 1.20,
        lineShift: 0.10,
    },
    // Goal Kick: Spread wide and deep to receive
    goal_kick_receiver: {
        ballTrackingX: 0.05,
        ballTrackingY: 0.10,
        widthScale: 1.50,  // Very wide
        depthScale: 0.60,  // Short depth
        lineShift: -0.25,  // Deep own half
    },
    // Goal Kick: Press high to block short options
    goal_kick_press: {
        ballTrackingX: 0.10,
        ballTrackingY: 0.15,
        widthScale: 0.85,
        depthScale: 0.80,
        lineShift: 0.20,   // High up the pitch
    },
};

// ── Score / fatigue context ───────────────────────────────

export interface ShapeContext {
    /** Goal difference from THIS team's perspective (positive = winning) */
    goalDiff: number;
    /** Average fatigue of outfield players, 0-1 */
    avgFatigue: number;
    /** Ticks since last possession change (for lerp smoothing) */
    ticksSincePossessionChange: number;
}

// ── Main class ────────────────────────────────────────────

export class TeamShape {

    /**
     * Compute shape targets for all outfield players this tick.
     *
     * @param team         The team to compute shape for
     * @param ballPos      Current ball position
     * @param tacticalState Current tactical phase
     * @param chain        Current possession chain (or null if out of possession)
     * @param fieldWidth   Field dimensions
     * @param fieldHeight
     * @param shapeCtx     Score + fatigue context for dynamic adjustment
     */
    static computeTargets(
        team: Team,
        ballPos: Vec2,
        tacticalState: TeamTacticalState,
        chain: PossessionChain | null,
        fieldWidth: number,
        fieldHeight: number,
        shapeCtx?: ShapeContext,
    ): ShapeTarget[] {
        const isHome = team.id === "home";
        const baseParams = this.resolveParams(tacticalState, chain);
        const params = shapeCtx
            ? this.applyContextModifiers(baseParams, shapeCtx)
            : baseParams;
        const outfield = team.players.filter(p => p.position !== "GK");

        if (outfield.length === 0) return [];

        // ── Formation centroid (average of static anchors) ─
        const anchorCentroid = centroidOf(outfield.map(p => p.targetPos));

        // ── Ball-tracking offset ──────────────────────────
        const ballOffsetX = (ballPos.x - anchorCentroid.x) * params.ballTrackingX;
        const ballOffsetY = (ballPos.y - anchorCentroid.y) * params.ballTrackingY;

        // ── Defensive line shift (toward opponent goal) ───
        const lineShiftX = isHome
            ? fieldWidth * params.lineShift
            : -fieldWidth * params.lineShift;

        // ── Compute per-player shape target ──────────────
        const results: ShapeTarget[] = [];

        for (const player of outfield) {
            // Displacement from formation centroid
            const dx = (player.targetPos.x - anchorCentroid.x) * params.depthScale;
            const dy = (player.targetPos.y - anchorCentroid.y) * params.widthScale;

            // New position: centroid + ball offset + line shift + scaled displacement
            const rawX = anchorCentroid.x + dx + ballOffsetX + lineShiftX;
            const rawY = anchorCentroid.y + dy + ballOffsetY;

            const margin = 18;
            results.push({
                playerId: player.id,
                pos: {
                    x: Math.max(margin, Math.min(fieldWidth - margin, rawX)),
                    y: Math.max(margin, Math.min(fieldHeight - margin, rawY)),
                },
            });
        }

        return results;
    }

    /**
     * Get the shape target for a specific player.
     * Returns player.targetPos if player isn't in computed targets.
     */
    static getTarget(
        player: Player,
        targets: ShapeTarget[],
    ): Vec2 {
        return targets.find(t => t.playerId === player.id)?.pos ?? player.targetPos;
    }

    // ── Param resolution ──────────────────────────────────

    private static resolveParams(
        state: TeamTacticalState,
        chain: PossessionChain | null,
    ): ShapeParams {
        const phase = state.phase;

        // Out of possession: compactness driven by pressure intensity
        if (phase === "out_of_possession" || phase === "transition_defend") {
            return state.pressureIntensity > 0.5
                ? SHAPE_PRESETS.compact_defense
                : SHAPE_PRESETS.high_press;
        }

        if (phase === "set_piece") {
            if (state.matchPhase === "goalkick") {
                // If it's our goalkick, spread wide. If opponent's, press high.
                const ballOwner = chain !== null; // If we have a chain, we are the ones with the ball
                return ballOwner ? SHAPE_PRESETS.goal_kick_receiver : SHAPE_PRESETS.goal_kick_press;
            }
            return SHAPE_PRESETS.compact_defense;
        }

        if (phase === "transition_attack") {
            return SHAPE_PRESETS.transition;
        }

        // In possession: chain phase determines shape
        const chainPhase = chain?.phase ?? "build_up";
        switch (chainPhase) {
            case "transition":      return SHAPE_PRESETS.transition;
            case "build_up":        return SHAPE_PRESETS.build_up;
            case "progression":     return SHAPE_PRESETS.progression;
            case "final_third":     return SHAPE_PRESETS.final_third;
            case "chance_creation": return SHAPE_PRESETS.chance_creation;
            default:                return SHAPE_PRESETS.progression;
        }
    }

    /**
     * Apply score and fatigue modifiers on top of the base shape params.
     *
     * Score logic:
     *   Losing by 1 → slightly wider + higher line (chasing)
     *   Losing by 2+ → aggressively wider + much higher line
     *   Winning by 1 → slightly narrower + lower line (protecting)
     *   Winning by 2+ → compact low block
     *
     * Fatigue logic:
     *   High avg fatigue → narrower width, lower line, less ball tracking
     *   (tired teams naturally drop deeper and compress)
     */
    private static applyContextModifiers(base: ShapeParams, ctx: ShapeContext): ShapeParams
    {
        const { goalDiff, avgFatigue } = ctx;

        // ── Score modifier ────────────────────────────────
        // Clamped to ±2 goals for meaningful effect
        const diff = Math.max(-2, Math.min(2, goalDiff));

        let widthDelta  = 0;
        let depthDelta  = 0;
        let lineDelta   = 0;
        let trackingDelta = 0;

        if (diff < 0) {
            // Losing: push forward, stretch shape to create chances
            const urgency = Math.abs(diff) / 2; // 0.5 for -1, 1.0 for -2
            widthDelta    =  0.12 * urgency;   // wider
            depthDelta    =  0.08 * urgency;   // longer vertically
            lineDelta     =  0.08 * urgency;   // higher defensive line
            trackingDelta =  0.10 * urgency;   // track ball more aggressively
        } else if (diff > 0) {
            // Winning: protect lead, drop into shape
            const comfort = Math.min(diff / 2, 1);
            widthDelta    = -0.10 * comfort;   // narrower
            depthDelta    = -0.06 * comfort;   // shorter / more compact
            lineDelta     = -0.06 * comfort;   // lower defensive line
            trackingDelta = -0.06 * comfort;   // less aggressive tracking
        }

        // ── Fatigue modifier ──────────────────────────────
        // Tired teams (avgFatigue > 0.5) automatically drop and compress
        const fatigueFactor = Math.max(0, avgFatigue - 0.5) * 2; // 0-1 from 50-100% fatigue
        widthDelta    -= 0.08 * fatigueFactor;
        lineDelta     -= 0.05 * fatigueFactor;
        trackingDelta -= 0.06 * fatigueFactor;

        return {
            ballTrackingX: clamp(base.ballTrackingX + trackingDelta, 0.05, 0.70),
            ballTrackingY: clamp(base.ballTrackingY + trackingDelta * 0.7, 0.05, 0.60),
            widthScale:    clamp(base.widthScale    + widthDelta,    0.55, 1.35),
            depthScale:    clamp(base.depthScale    + depthDelta,    0.55, 1.35),
            lineShift:     clamp(base.lineShift     + lineDelta,    -0.15, 0.25),
        };
    }
}
// ── Utility ───────────────────────────────────────────────

function centroidOf(positions: Vec2[]): Vec2 {
    if (positions.length === 0) return { x: 0, y: 0 };
    const sum = positions.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / positions.length, y: sum.y / positions.length };
}

function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
}