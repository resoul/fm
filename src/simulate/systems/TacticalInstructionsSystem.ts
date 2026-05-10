/**
 * TacticalInstructionsSystem — 3.1 / 3.2 / 3.3
 *
 * Implements three layers of tactical depth:
 *
 *   3.1 Tactical Instructions
 *       Per-team, per-phase knobs:
 *         In possession:      width (narrow/normal/wide), tempo (slow/medium/fast),
 *                             overlaps (off/on), directness (possession/direct)
 *         Out of possession:  pressLine (low/mid/high), compactness (open/medium/compact),
 *                             trapSide (none/left/right)
 *
 *   3.2 Role Behaviors
 *       Each PlayerRole maps to a distinct behaviour profile that modifies:
 *         — movement radius / leash override
 *         — press trigger threshold
 *         — forward-run eagerness
 *         — support positioning bias
 *
 *   3.3 Tactical Identity
 *       Five named playing styles that pre-set tactical instructions and
 *       apply team-wide modifiers — readable in DecisionSystem and OffBallSystem:
 *         tiki_taka     — short passing, high width, low directness, moderate press
 *         gegenpress    — high press immediately on loss, urgent transitions
 *         low_block     — drop deep, compact shape, counter on win
 *         direct_play   — long balls, high directness, target man focus
 *         balanced      — neutral defaults, adaptable
 *
 * Output:
 *   Writes ctx.tactical.instructions (TacticalInstructions per team)
 *   and ctx.tactical.roleProfiles (RoleBehaviourProfile per player).
 *   These are read by DecisionSystem, OffBallSystem, UtilityAI, MovementSystem.
 *
 * The system recomputes every tick (cheap — no spatial queries) and adapts
 * instructions dynamically (e.g. low_block drops deeper when winning by 1+).
 */

import type { SimulationContext } from "../context";
import type { SimulationSystem } from "../pipeline";
import type { Command } from "../core/Command";
import type { Player, PlayerRole, TeamSide } from "../types";

export type TacticalWidth = "narrow" | "normal" | "wide";
export type TacticalTempo = "slow" | "medium" | "fast";
export type TacticalDirectness = "possession" | "mixed" | "direct";
export type PressLine = "low" | "mid" | "high";
export type Compactness = "open" | "medium" | "compact";
export type TacticalStyle =
    | "tiki_taka"
    | "gegenpress"
    | "low_block"
    | "direct_play"
    | "balanced";

export interface TacticalInstructions {
    style: TacticalStyle;

    // In possession
    width: TacticalWidth;
    tempo: TacticalTempo;
    overlaps: boolean;
    directness: TacticalDirectness;

    // Out of possession
    pressLine: PressLine;
    compactness: Compactness;
    trapSide: "none" | "left" | "right";

    // Derived scalars (0-1) used directly by other systems
    /** 0 = very narrow, 1 = very wide */
    widthFactor: number;
    /** 0 = very slow / recycling, 1 = urgent direct play */
    tempoBias: number;
    /** 0 = deep sit, 1 = halfway press, 2 = ultra high press */
    pressLineFactor: number;
    /** 0 = open, 1 = max compact */
    compactnessFactor: number;
    /** 0 = short passing only, 1 = long ball first */
    directnessFactor: number;
}

export interface RoleBehaviourProfile {
    playerId: string;
    role: PlayerRole;
    /** Max distance from home zone before pulling back (px) */
    leashOverride: number | null;
    /** 0-1: how eagerly this role presses the ball carrier */
    pressTrigger: number;
    /** 0-1: eagerness to make forward runs */
    forwardRunBias: number;
    /** 0-1: eagerness to drop back and support */
    supportDropBias: number;
    /** Multiplier on pass target "forward" score — >1 seeks progressive passes */
    forwardPassBias: number;
    /** True if this role should overlap the winger / full-back */
    overlapsEnabled: boolean;
}

declare module "../context" {
    interface TacticalData {
        homeInstructions?: TacticalInstructions;
        awayInstructions?: TacticalInstructions;
        roleProfiles?: Map<string, RoleBehaviourProfile>;
    }
}

// ── Style presets ─────────────────────────────────────────────────────────────

const STYLE_PRESETS: Record<TacticalStyle, Omit<TacticalInstructions,
    "widthFactor" | "tempoBias" | "pressLineFactor" | "compactnessFactor" | "directnessFactor" | "style"
>> = {
    tiki_taka: {
        width: "wide",
        tempo: "slow",
        overlaps: false,
        directness: "possession",
        pressLine: "mid",
        compactness: "medium",
        trapSide: "none",
    },
    gegenpress: {
        width: "normal",
        tempo: "fast",
        overlaps: true,
        directness: "mixed",
        pressLine: "high",
        compactness: "compact",
        trapSide: "none",
    },
    low_block: {
        width: "narrow",
        tempo: "slow",
        overlaps: false,
        directness: "direct",
        pressLine: "low",
        compactness: "compact",
        trapSide: "none",
    },
    direct_play: {
        width: "wide",
        tempo: "fast",
        overlaps: true,
        directness: "direct",
        pressLine: "mid",
        compactness: "open",
        trapSide: "none",
    },
    balanced: {
        width: "normal",
        tempo: "medium",
        overlaps: false,
        directness: "mixed",
        pressLine: "mid",
        compactness: "medium",
        trapSide: "none",
    },
};

// ── Role behaviour templates ──────────────────────────────────────────────────

type RoleTemplate = Omit<RoleBehaviourProfile, "playerId" | "role">;

const ROLE_TEMPLATES: Record<PlayerRole, RoleTemplate> = {
    GK_Sweeper:     { leashOverride: 45,  pressTrigger: 0.2, forwardRunBias: 0.1, supportDropBias: 0.1, forwardPassBias: 0.7, overlapsEnabled: false },
    GK_Defensive:   { leashOverride: 20,  pressTrigger: 0.1, forwardRunBias: 0.0, supportDropBias: 0.0, forwardPassBias: 0.5, overlapsEnabled: false },

    CB_Stopper:     { leashOverride: 10,  pressTrigger: 0.55, forwardRunBias: 0.05, supportDropBias: 0.9, forwardPassBias: 0.6, overlapsEnabled: false },
    CB_BallPlaying: { leashOverride: 16,  pressTrigger: 0.35, forwardRunBias: 0.12, supportDropBias: 0.85, forwardPassBias: 1.1, overlapsEnabled: false },

    WB_Attacking:   { leashOverride: null, pressTrigger: 0.4, forwardRunBias: 0.85, supportDropBias: 0.3, forwardPassBias: 1.15, overlapsEnabled: true },
    WB_Defensive:   { leashOverride: 25,  pressTrigger: 0.6, forwardRunBias: 0.35, supportDropBias: 0.7, forwardPassBias: 0.9, overlapsEnabled: false },

    CM_BallWinner:  { leashOverride: 18,  pressTrigger: 0.75, forwardRunBias: 0.3, supportDropBias: 0.65, forwardPassBias: 0.85, overlapsEnabled: false },
    CM_Playmaker:   { leashOverride: 20,  pressTrigger: 0.3, forwardRunBias: 0.45, supportDropBias: 0.5, forwardPassBias: 1.2, overlapsEnabled: false },
    CM_BoxToBox:    { leashOverride: null, pressTrigger: 0.55, forwardRunBias: 0.7, supportDropBias: 0.45, forwardPassBias: 1.05, overlapsEnabled: true },

    W_Winger:       { leashOverride: null, pressTrigger: 0.45, forwardRunBias: 0.8, supportDropBias: 0.2, forwardPassBias: 1.1, overlapsEnabled: false },
    W_Inverted:     { leashOverride: null, pressTrigger: 0.4, forwardRunBias: 0.75, supportDropBias: 0.15, forwardPassBias: 1.25, overlapsEnabled: false },

    ST_Poacher:     { leashOverride: 30,  pressTrigger: 0.3, forwardRunBias: 0.9, supportDropBias: 0.1, forwardPassBias: 0.8, overlapsEnabled: false },
    ST_TargetMan:   { leashOverride: 35,  pressTrigger: 0.35, forwardRunBias: 0.6, supportDropBias: 0.25, forwardPassBias: 0.75, overlapsEnabled: false },
    ST_Advanced:    { leashOverride: null, pressTrigger: 0.4, forwardRunBias: 0.85, supportDropBias: 0.2, forwardPassBias: 1.0, overlapsEnabled: true },
};

// ── System ────────────────────────────────────────────────────────────────────

export class TacticalInstructionsSystem implements SimulationSystem {
    name = "TacticalInstructionsSystem";

    // Cached style per team — can be overridden by the user later
    private _homeStyle: TacticalStyle = "balanced";
    private _awayStyle: TacticalStyle = "balanced";

    /** Call this externally (e.g. from PreMatch) to set team styles */
    setStyle(team: TeamSide, style: TacticalStyle) {
        if (team === "home") this._homeStyle = style;
        else this._awayStyle = style;
    }

    update(ctx: SimulationContext): Command[] {
        const homeScore = ctx.homeTeam.score;
        const awayScore = ctx.awayTeam.score;
        const minute = ctx.state.minute;

        ctx.tactical.homeInstructions = this.buildInstructions(this._homeStyle, homeScore, awayScore, minute);
        ctx.tactical.awayInstructions = this.buildInstructions(this._awayStyle, awayScore, homeScore, minute);

        // 4.3 Apply MatchRhythmSystem modifiers (runs before this in pipeline)
        const rhythmMods = (ctx.tactical as any)?.rhythmModifiers;
        if (rhythmMods) {
            this._applyRhythmModifiers(ctx.tactical.homeInstructions, rhythmMods.home);
            this._applyRhythmModifiers(ctx.tactical.awayInstructions, rhythmMods.away);
        }

        ctx.tactical.roleProfiles = this.buildRoleProfiles(
            ctx,
            ctx.tactical.homeInstructions,
            ctx.tactical.awayInstructions,
        );

        return [];
    }

    private _applyRhythmModifiers(inst: TacticalInstructions, mod: { tempoDelta: number; directnessDelta: number; pressLineDelta: number; timeWasteFactor: number } | undefined): void {
        if (!mod) return;
        const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
        inst.tempoBias = clamp(inst.tempoBias + mod.tempoDelta, 0, 1);
        inst.directnessFactor = clamp(inst.directnessFactor + mod.directnessDelta, 0, 1);
        inst.pressLineFactor = clamp(inst.pressLineFactor + mod.pressLineDelta, 0, 2);
        // Time-waste: push tempo very low and directness very low
        if (mod.timeWasteFactor > 0) {
            inst.tempoBias = clamp(inst.tempoBias - mod.timeWasteFactor * 0.3, 0, 1);
            inst.directnessFactor = clamp(inst.directnessFactor - mod.timeWasteFactor * 0.25, 0, 1);
        }
    }

    // ── Instructions builder ──────────────────────────────────────────────────

    private buildInstructions(
        style: TacticalStyle,
        ownScore: number,
        oppScore: number,
        minute: number,
    ): TacticalInstructions {
        const preset = STYLE_PRESETS[style];
        const inst = { ...preset, style };

        // ── Dynamic adaptation to match situation ─────────────────────────
        const scoreDiff = ownScore - oppScore;
        const lateGame = minute > 70;

        if (style === "low_block") {
            // If losing, abandon the block slightly — push higher
            if (scoreDiff < 0) {
                inst.pressLine = "mid";
                inst.directness = "mixed";
            }
            // If winning comfortably late, drop even deeper
            if (scoreDiff >= 2 && lateGame) {
                inst.pressLine = "low";
                inst.compactness = "compact";
            }
        }

        if (style === "gegenpress") {
            // If losing by 2+ late, urgency maxes out
            if (scoreDiff <= -2 && lateGame) {
                inst.pressLine = "high";
                inst.tempo = "fast";
                inst.directness = "direct";
            }
        }

        if (style === "tiki_taka") {
            // If losing with <15 minutes left, raise tempo
            if (scoreDiff < 0 && lateGame) {
                inst.tempo = "medium";
                inst.directness = "mixed";
            }
        }

        // ── Derive scalars ─────────────────────────────────────────────────
        const widthFactor = inst.width === "narrow" ? 0.25
            : inst.width === "normal" ? 0.55
            : 0.85;

        const tempoBias = inst.tempo === "slow" ? 0.2
            : inst.tempo === "medium" ? 0.5
            : 0.85;

        const pressLineFactor = inst.pressLine === "low" ? 0.2
            : inst.pressLine === "mid" ? 0.6
            : 0.95;

        const compactnessFactor = inst.compactness === "open" ? 0.2
            : inst.compactness === "medium" ? 0.55
            : 0.88;

        const directnessFactor = inst.directness === "possession" ? 0.15
            : inst.directness === "mixed" ? 0.5
            : 0.85;

        return {
            ...inst,
            widthFactor,
            tempoBias,
            pressLineFactor,
            compactnessFactor,
            directnessFactor,
        };
    }

    // ── Role profiles ─────────────────────────────────────────────────────────

    private buildRoleProfiles(
        ctx: SimulationContext,
        homeInst: TacticalInstructions,
        awayInst: TacticalInstructions,
    ): Map<string, RoleBehaviourProfile> {
        const profiles = new Map<string, RoleBehaviourProfile>();
        const allPlayers = [...ctx.homeTeam.players, ...ctx.awayTeam.players];

        for (const player of allPlayers) {
            const inst = player.team === "home" ? homeInst : awayInst;
            const template = ROLE_TEMPLATES[player.role] ?? ROLE_TEMPLATES["CM_BoxToBox"];
            const profile = this.applyInstructionsToRole(player, template, inst);
            profiles.set(player.id, profile);
        }

        return profiles;
    }

    private applyInstructionsToRole(
        player: Player,
        template: RoleTemplate,
        inst: TacticalInstructions,
    ): RoleBehaviourProfile {
        let { leashOverride, pressTrigger, forwardRunBias, supportDropBias, forwardPassBias, overlapsEnabled } = template;

        // Width instructions stretch the leash for wide roles
        if (player.position === "LW" || player.position === "RW" || player.position === "LB" || player.position === "RB") {
            if (inst.width === "wide" && leashOverride !== null) leashOverride = leashOverride * 1.3;
            if (inst.width === "narrow" && leashOverride !== null) leashOverride = leashOverride * 0.75;
        }

        // Tempo raises forward run eagerness globally
        forwardRunBias = clamp(forwardRunBias + (inst.tempoBias - 0.5) * 0.25, 0, 1);

        // Press line: high press = all players press more
        pressTrigger = clamp(pressTrigger + (inst.pressLineFactor - 0.5) * 0.3, 0, 1);

        // Directness: direct play = forward pass bias up, support drop bias down
        forwardPassBias = clamp(forwardPassBias + (inst.directnessFactor - 0.5) * 0.4, 0.5, 2.0);
        supportDropBias = clamp(supportDropBias - (inst.directnessFactor - 0.5) * 0.2, 0, 1);

        // Overlaps: only enabled if instructions allow AND role supports it
        overlapsEnabled = overlapsEnabled && inst.overlaps;

        return {
            playerId: player.id,
            role: player.role,
            leashOverride,
            pressTrigger,
            forwardRunBias,
            supportDropBias,
            forwardPassBias,
            overlapsEnabled,
        };
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
}

// ── Convenience accessor ──────────────────────────────────────────────────────

export function getRoleProfile(ctx: SimulationContext, playerId: string): RoleBehaviourProfile | undefined {
    return ctx.tactical.roleProfiles?.get(playerId);
}

export function getTeamInstructions(ctx: SimulationContext, side: TeamSide): TacticalInstructions | undefined {
    return side === "home" ? ctx.tactical.homeInstructions : ctx.tactical.awayInstructions;
}
