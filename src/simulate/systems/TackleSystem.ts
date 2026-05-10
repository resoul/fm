import type { SimulationContext } from "../context";
import type { SimulationSystem } from "../pipeline";
import { addVec, distVec, normVec, scaleVec, subVec } from "../physics";
import { BALANCE } from "../balance";
import type { Command, SetPlayerDecisionCommand, UpdateBallCommand } from "../core/Command";
import type { Player } from "../types";

let eventCounter = 5000;
function mkEventId() { return `evt_${++eventCounter}`; }

// After a successful tackle the tackler needs recovery time before acting again.
// At 60 fps: 120 ticks = 2 s, 180 ticks = 3 s.
const TACKLE_SUCCESS_COOLDOWN = 150; // ~2.5 s — long enough to prevent repeat spam
const TACKLE_FAIL_COOLDOWN    = BALANCE.TACKLE_COOLDOWN; // already 50 ticks

export class TackleSystem implements SimulationSystem {
    name = "TackleSystem";

    update(ctx: SimulationContext): Command[] {
        const { homeTeam, awayTeam, ball } = ctx;

        const DEAD_PHASES = new Set(["throwin", "goalkick", "corner", "freekick", "goal", "halftime", "fulltime"]);
        if (DEAD_PHASES.has(ctx.state.phase)) return [];

        if (!ball.ownerPlayerId) return [];

        const allPlayers = [...homeTeam.players, ...awayTeam.players];
        const owner = allPlayers.find(p => p.id === ball.ownerPlayerId);
        if (!owner) return [];

        const opponents = owner.team === "home" ? awayTeam.players : homeTeam.players;

        for (const opp of opponents) {
            // Guard: must be close enough, no kick cooldown, AND no action cooldown
            // (actionCooldown acts as the universal lock — set to TACKLE_SUCCESS_COOLDOWN on success)
            if (
                distVec(opp.pos, owner.pos) < BALANCE.TACKLE_RANGE + 8 &&
                opp.kickCooldown === 0 &&
                opp.actionCooldown === 0
            ) {
                return this.executeTackle(opp, owner, ctx);
            }
        }

        return [];
    }

    private executeTackle(tackler: Player, owner: Player, ctx: SimulationContext): Command[] {
        const { rng, state } = ctx;
        const commands: Command[] = [];

        const tackleSkill  = (tackler.attributes.tackling * 0.7 + tackler.attributes.strength  * 0.3) / 100;
        const retainSkill  = (owner.attributes.strength  * 0.6 + owner.attributes.balance      * 0.4) / 100;
        const successProb  = Math.max(0.05, Math.min(0.85, 0.4 + (tackleSkill - retainSkill) * 0.4));

        if (rng.next() < successProb) {
            // ── Successful tackle ──────────────────────────
            const awayFromOwner  = normVec(subVec(tackler.pos, owner.pos));
            const looseDirection = normVec({
                x: awayFromOwner.x + rng.nextFloat(-0.45, 0.45),
                y: awayFromOwner.y + rng.nextFloat(-0.45, 0.45),
            });

            commands.push({
                type: "UPDATE_BALL",
                pos: addVec(tackler.pos, scaleVec(looseDirection, 10)),
                vel: scaleVec(looseDirection, 2.2),   // slightly more separation
                height: 0,
                heightVel: 0,
                ownerPlayerId:   null,
                lastTouchedBy:   tackler.id,
                lastTouchedTeam: tackler.team,
            } as UpdateBallCommand);

            // Long recovery — prevents same tackler from immediately re-tackling
            commands.push({
                type: "SET_PLAYER_DECISION",
                playerId: tackler.id,
                decision: null,
                cooldown: TACKLE_SUCCESS_COOLDOWN,
            } as SetPlayerDecisionCommand);

            // Also freeze the previous owner briefly so they can't instantly reclaim
            commands.push({
                type: "SET_PLAYER_DECISION",
                playerId: owner.id,
                decision: null,
                cooldown: 40,
            } as SetPlayerDecisionCommand);

            ctx.events.emit({
                id: mkEventId(),
                type: "tackle",
                minute: state.minute,
                second: state.second,
                teamId:     tackler.team,
                playerId:   tackler.id,
                playerName: tackler.name,
                description: `${tackler.name} wins the ball with a tackle!`,
                pos: { ...tackler.pos },
            });

            // ── C.1 Successful tackle stats ───────────────
            const tStats = ctx.playerStats?.get(tackler.id);
            if (tStats) { tStats.tacklesWon++; tStats.duelsWon++; }
            const oStats = ctx.playerStats?.get(owner.id);
            if (oStats) oStats.duelsLost++;

        } else {
            // ── Failed tackle ──────────────────────────────
            commands.push({
                type: "SET_PLAYER_DECISION",
                playerId: tackler.id,
                decision: null,
                cooldown: TACKLE_FAIL_COOLDOWN,
            } as SetPlayerDecisionCommand);

            // ── C.1 Failed tackle stats ───────────────────
            const tStatsFail = ctx.playerStats?.get(tackler.id);
            if (tStatsFail) tStatsFail.duelsLost++;
            const oStatsFail = ctx.playerStats?.get(owner.id);
            if (oStatsFail) oStatsFail.duelsWon++;
        }

        return commands;
    }
}