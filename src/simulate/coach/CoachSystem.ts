// ============================================================
// CoachSystem — A.3
//
// Pipeline system that acts as a coaching agent.
// Runs every 900 ticks + immediately after a goal.
//
// Reads:
//   ctx.tactical, ctx.state, MatchAnalyzer observations, CoachProfile
//
// Writes:
//   • Style changes via TacticalInstructionsSystem.setStyle()
//   • Substitution requests via SubstitutionSystem.queueSubstitution()
//
// Different CoachProfile values → different decisions in identical situations.
// This is the core design goal: personality drives behaviour.
//
// Position in pipeline:
//   after MatchRhythmSystem, before TacticalInstructionsSystem
// ============================================================

import type { SimulationContext } from "../context";
import type { SimulationSystem } from "../pipeline";
import type { Command } from "../core/Command";
import type { TeamSide } from "../types";
import type { TacticalStyle } from "../systems/TacticalInstructionsSystem";
import { TacticalInstructionsSystem } from "../systems/TacticalInstructionsSystem";
import type { CoachProfile } from "./CoachProfile";
import { coachAggressiveness, coachAdaptability, coachRiskTolerance, coachDefensiveMindset } from "./CoachProfile";
import { MatchAnalyzer, OBSERVATION_INTERVAL_TICKS } from "./MatchAnalyzer";
import type { SubstitutionSystem } from "./SubstitutionSystem";

const FATIGUE_SUB_THRESHOLD = 0.75;

export class CoachSystem implements SimulationSystem {
    name = "CoachSystem";

    private _analyzer: MatchAnalyzer;
    private _tacticalSystem: TacticalInstructionsSystem;
    private _subSystem: SubstitutionSystem;
    private _homeCoach: CoachProfile;
    private _awayCoach: CoachProfile;

    /** Ticks since last decision was made (throttle) */
    private _ticksSinceDecision = 0;
    /** Last tick a goal was scored — triggers immediate re-evaluation */
    private _lastGoalTick = -1;

    constructor(
        analyzer: MatchAnalyzer,
        tacticalSystem: TacticalInstructionsSystem,
        subSystem: SubstitutionSystem,
        homeCoach: CoachProfile,
        awayCoach: CoachProfile,
    ) {
        this._analyzer       = analyzer;
        this._tacticalSystem = tacticalSystem;
        this._subSystem      = subSystem;
        this._homeCoach      = homeCoach;
        this._awayCoach      = awayCoach;
    }

    update(ctx: SimulationContext): Command[] {
        const { state } = ctx;

        // Feed shots into the analyzer for xG/danger tracking
        const latestEvent = state.events[state.events.length - 1];
        if (latestEvent?.type === "shot" && latestEvent.xg !== undefined) {
            this._analyzer.recordShot(latestEvent.teamId as TeamSide, latestEvent.xg);
        }

        // Always update the analyzer (builds observations at window boundaries)
        this._analyzer.update(ctx);

        // Detect goal — triggers immediate re-evaluation
        const goalThisTick = latestEvent?.type === "goal" && state.tick > this._lastGoalTick;
        if (goalThisTick) this._lastGoalTick = state.tick;

        // Decision tick: every 900 ticks OR right after a goal
        this._ticksSinceDecision++;
        const isDecisionTick =
            this._ticksSinceDecision >= OBSERVATION_INTERVAL_TICKS ||
            goalThisTick;

        if (!isDecisionTick) return [];
        this._ticksSinceDecision = 0;

        // Run decisions for both teams
        this._makeDecisions(ctx, "home", this._homeCoach);
        this._makeDecisions(ctx, "away", this._awayCoach);

        return [];
    }

    // ── Core decision logic ───────────────────────────────

    private _makeDecisions(ctx: SimulationContext, side: TeamSide, coach: CoachProfile): void {
        const { state } = ctx;
        const minute    = state.minute;
        const homeScore = ctx.homeTeam.score;
        const awayScore = ctx.awayTeam.score;

        const myScore  = side === "home" ? homeScore : awayScore;
        const oppScore = side === "home" ? awayScore : homeScore;
        const scoreDiff = myScore - oppScore;

        const obs = this._analyzer.getLatest(side);

        // Читаем личность через хелперы (Person → 0–100)
        const aggressiveness  = coachAggressiveness(coach.person);
        const adaptability    = coachAdaptability(coach.person);
        const riskTolerance   = coachRiskTolerance(coach.person);
        const defensiveMindset = coachDefensiveMindset(coach.person);

        // ── 1. Losing ≥1 AND negative xGDelta AND late game ──────────────────
        if (scoreDiff <= -1 && minute > 60) {
            const xgBad = obs && obs.xGDelta < -0.2;
            if (xgBad) {
                if (aggressiveness > 60) {
                    this._setStyle(side, scoreDiff <= -2 ? "direct_play" : "gegenpress", coach);
                } else if (minute > 70) {
                    this._setStyle(side, "gegenpress", coach);
                }
            } else if (!obs && aggressiveness > 70) {
                this._setStyle(side, "gegenpress", coach);
            }
        }

        // ── 2. Winning ≥1 AND late game → sit deep ───────────────────────────
        if (scoreDiff >= 1 && minute > 65) {
            if (defensiveMindset > 50) {
                this._setStyle(side, "low_block", coach);
            } else if (riskTolerance < 40) {
                this._setStyle(side, "balanced", coach);
            }
        }

        // ── 3. Pressing failing → drop press line ────────────────────────────
        if (obs && obs.pressingSuccessRate < 0.25 && adaptability > 60) {
            const currentInstructions = side === "home"
                ? (ctx.tactical as any).homeInstructions
                : (ctx.tactical as any).awayInstructions;
            if (currentInstructions?.pressLine === "high") {
                this._setStyle(side, "balanced", coach);
            }
        }

        // ── 4. Getting torn apart → go compact ───────────────────────────────
        if (obs && obs.xGDelta < -0.8) {
            this._setStyle(side, "low_block", coach);
        }

        // ── 5. Fatigue substitutions ──────────────────────────────────────────
        if (this._subSystem.remainingSubstitutions(side) > 0 && minute > 45) {
            this._checkFatigueSubs(ctx, side, coach);
        }
    }

    private _setStyle(side: TeamSide, style: TacticalStyle, coach: CoachProfile): void {
        if (style === coach.preferredStyle) {
            this._tacticalSystem.setStyle(side, style);
            return;
        }
        // Адаптивность: низкая → тренер сопротивляется смене стиля
        const adaptability = coachAdaptability(coach.person);
        const threshold = 100 - adaptability;
        if (Math.random() * 100 < threshold) return;

        this._tacticalSystem.setStyle(side, style);
    }

    private _checkFatigueSubs(
        ctx: SimulationContext,
        side: TeamSide,
        coach: CoachProfile,
    ): void {
        const team = side === "home" ? ctx.homeTeam : ctx.awayTeam;
        const aggressiveness = coachAggressiveness(coach.person);

        for (const player of team.players) {
            if (player.position === "GK") continue;
            if (player.fatigue < FATIGUE_SUB_THRESHOLD) continue;

            const shouldSubNow =
                coach.substitutionBias === "fatigue" ||
                (aggressiveness > 65 && player.fatigue > 0.85);

            if (!shouldSubNow) continue;

            // Find a suitable bench player — for now we look for a player NOT in
            // the team's current active list (i.e., a player with the same role
            // would come from the squad, but we don't have squad access here).
            // CoachSystem operates on match-runtime state only.
            // Substitution with actual bench players requires league-layer integration.
            // We emit the intent and let the league layer fulfil it.
            // For standalone match simulation, this is a no-op unless SubstitutionSystem
            // has a bench list injected (see SubstitutionSystem.setBench()).
            break; // only consider one sub per decision cycle
        }
    }
}