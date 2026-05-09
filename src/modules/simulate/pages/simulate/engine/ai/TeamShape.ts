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

import type { Player, Team, Vec2, TeamSide } from "../types";
import type { TeamTacticalState, TeamTacticalPhase } from "../types";
import type { PossessionChain, ChainPhase } from "./PossessionChain";
import { distVec } from "../physics";

// ── Shape parameters ──────────────────────────────────────

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
};

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
     */
    static computeTargets(
        team: Team,
        ballPos: Vec2,
        tacticalState: TeamTacticalState,
        chain: PossessionChain | null,
        fieldWidth: number,
        fieldHeight: number,
    ): ShapeTarget[] {
        const isHome = team.id === "home";
        const params = this.resolveParams(tacticalState, chain);
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
}

// ── Utility ───────────────────────────────────────────────

function centroidOf(positions: Vec2[]): Vec2 {
    if (positions.length === 0) return { x: 0, y: 0 };
    const sum = positions.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / positions.length, y: sum.y / positions.length };
}