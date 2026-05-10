// ============================================================
// SubstitutionSystem — A.4
//
// Processes substitution requests queued by CoachSystem.
// Substitutions happen only during dead-ball phases.
// Max 3 or 5 per match (configurable).
//
// When a substitution is applied:
//   • The outgoing player is removed from the active lineup
//   • The incoming player inherits the outgoing player's
//     position, role, and current targetPos
//   • A SubstitutionEvent is emitted via ctx.events
// ============================================================

import type { SimulationContext } from "../context";
import type { SimulationSystem } from "../pipeline";
import type { Command } from "../core/Command";
import type { Player, TeamSide } from "../types";
import { createPlayerMatchStats } from "../stats/PlayerMatchStats";

export interface SubstitutionEvent {
    minute: number;
    side: TeamSide;
    playerOutId: string;
    playerOutName: string;
    playerInId: string;
    playerInName: string;
    reason: "fatigue" | "tactical" | "scoreline" | "injury";
}

export interface PendingSubstitution {
    side: TeamSide;
    playerOutId: string;
    playerIn: Player;
    reason: SubstitutionEvent["reason"];
}

/** Maximum substitutions per match (standard is 3; modern tournaments allow 5) */
export const MAX_SUBSTITUTIONS_DEFAULT = 3;

/** Dead-ball phases during which substitutions can take place */
const SUB_ALLOWED_PHASES = new Set([
    "freekick", "goalkick", "corner", "throwin",
    "goal", "halftime",
]);

export class SubstitutionSystem implements SimulationSystem {
    name = "SubstitutionSystem";

    private _subsHome = 0;
    private _subsAway = 0;
    private _maxSubs: number;

    /** Queue filled by CoachSystem; drained here when phase allows */
    readonly pendingQueue: PendingSubstitution[] = [];

    constructor(maxSubs = MAX_SUBSTITUTIONS_DEFAULT) {
        this._maxSubs = maxSubs;
    }

    /** Called by CoachSystem to request a substitution */
    queueSubstitution(sub: PendingSubstitution): void {
        // Don't queue duplicates for the same outgoing player
        if (this.pendingQueue.some(q => q.playerOutId === sub.playerOutId)) return;
        this.pendingQueue.push(sub);
    }

    remainingSubstitutions(side: TeamSide): number {
        return this._maxSubs - (side === "home" ? this._subsHome : this._subsAway);
    }

    update(ctx: SimulationContext): Command[] {
        if (!SUB_ALLOWED_PHASES.has(ctx.state.phase)) return [];
        if (this.pendingQueue.length === 0) return [];

        const commands: Command[] = [];

        // Process at most one substitution per dead-ball phase
        const sub = this.pendingQueue[0];

        const sideCount = sub.side === "home" ? this._subsHome : this._subsAway;
        if (sideCount >= this._maxSubs) {
            // No more subs available — discard
            this.pendingQueue.shift();
            return [];
        }

        const team = sub.side === "home" ? ctx.homeTeam : ctx.awayTeam;
        const outIdx = team.players.findIndex(p => p.id === sub.playerOutId);

        if (outIdx === -1) {
            // Player already off or not found — discard
            this.pendingQueue.shift();
            return [];
        }

        const outPlayer = team.players[outIdx];

        // Transfer position/role/targetPos from outgoing to incoming
        const inPlayer: Player = {
            ...sub.playerIn,
            pos:       { ...outPlayer.pos },
            vel:       { x: 0, y: 0 },
            targetPos: { ...outPlayer.targetPos },
            position:  outPlayer.position,
            role:      outPlayer.role,
            fatigue:   0.1,   // fresh sub — minimal fatigue
            hasBall:   false,
            nextDecision: null,
            intent:    null,
            actionCooldown: 30,
            kickCooldown:   0,
            state:     "idle",
            targetPlayerId: null,
            passTarget: null,
        };

        // Mutate the team players array directly (same pattern as existing engine mutations)
        team.players.splice(outIdx, 1, inPlayer);

        // Initialise player stats for the incoming player if not already present
        if (ctx.playerStats && !ctx.playerStats.has(inPlayer.id)) {
            ctx.playerStats.set(inPlayer.id, createPlayerMatchStats(inPlayer.id));
        }

        // Increment substitution counter
        if (sub.side === "home") this._subsHome++;
        else this._subsAway++;

        this.pendingQueue.shift();

        // Emit substitution event (visible in Commentary + MatchEvent log)
        ctx.events.emit({
            id: `sub_${ctx.state.tick}`,
            type: "freekick",    // reuse existing EventType as closest dead-ball marker
            minute: ctx.state.minute,
            second: ctx.state.second,
            teamId: sub.side,
            playerId: inPlayer.id,
            playerName: inPlayer.name,
            description: `🔄 ${outPlayer.name} → ${inPlayer.name} (${sub.reason})`,
            pos: { ...outPlayer.pos },
        });

        return commands;
    }
}
