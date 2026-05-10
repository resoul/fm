import type { SimulationContext } from "../context";
import type { SimulationSystem } from "../pipeline";
import type { Command, UpdateBallCommand, SetPlayerDecisionCommand } from "../core/Command";
import { distVec } from "../physics";
import type { Ball, Player } from "../types";

// ── AerialSystem ──────────────────────────────────────────────────────────────
//
// A.4 — heading / jumpingReach → aerial duel
//
// Runs AFTER PassingSystem and BEFORE PhysicsSystem so that high balls never
// silently fall to the nearest player via PhysicsSystem's flat pickup logic.
//
// Trigger condition:
//   - ball.height > AERIAL_HEIGHT_THRESHOLD (20px world units)
//   - ball has no current owner (loose in the air)
//   - at least two outfield players are within AERIAL_CONTEST_RADIUS (30px)
//
// When two rivals contest:
//   winProb = (jumpingReach×0.6 + heading×0.4) normalised across both players.
//   The winner heads the ball toward their attack direction with a random
//   lateral spread; the loser gets a cooldown.
//
// When only one team's player is within range they win uncontested but still
// pay a small heading cooldown (heading the ball is never instant).
//
// The system emits an UPDATE_BALL command that sets ownerPlayerId = null and
// kicks the ball in the winner's direction — PhysicsSystem then handles the
// resulting ground ball normally next tick.

const AERIAL_HEIGHT_THRESHOLD = 20;  // world-unit height to trigger aerial logic
const AERIAL_CONTEST_RADIUS   = 30;  // px — players within this range can contest
const AERIAL_COOLDOWN_WIN     = 12;  // ticks — winner cooldown after heading
const AERIAL_COOLDOWN_LOSE    = 22;  // ticks — loser stumbles out of contest

function aerialStrength(p: Player): number {
    return p.attributes.jumpingReach * 0.6 + p.attributes.heading * 0.4;
}

export class AerialSystem implements SimulationSystem {
    name = "AerialSystem";

    // Track which ticks we already resolved an aerial for, to avoid double-firing
    // on the same ball arc. Reset when ball height drops to ground.
    private _lastAerialTick = -1;

    update(ctx: SimulationContext): Command[] {
        const { ball, state } = ctx;

        // Only act on high, unowned balls
        if (ball.height < AERIAL_HEIGHT_THRESHOLD) return [];
        if (ball.ownerPlayerId !== null) return [];

        // Dead-ball phases — no aerial contests
        const DEAD_PHASES = new Set(["throwin", "goalkick", "corner", "freekick", "goal", "halftime", "fulltime"]);
        if (DEAD_PHASES.has(state.phase)) return [];

        // Debounce: resolve once per distinct aerial arc (not every tick)
        if (ctx.state.tick === this._lastAerialTick) return [];

        const allPlayers = [...ctx.homeTeam.players, ...ctx.awayTeam.players];

        // Find outfield players within contest radius of the ball
        const contestants = allPlayers.filter(p =>
            p.position !== "GK" &&
            !p.isExpelled &&
            p.kickCooldown <= 5 &&
            distVec(p.pos, ball.pos) < AERIAL_CONTEST_RADIUS
        );

        if (contestants.length === 0) return [];

        this._lastAerialTick = ctx.state.tick;

        const commands: Command[] = [];

        // ── Uncontested aerial ────────────────────────────────────────────────
        if (contestants.length === 1) {
            const winner = contestants[0];
            commands.push(...this.resolveUncontested(winner, ball, ctx));
            return commands;
        }

        // ── Find the strongest contestant per team ────────────────────────────
        // If both teams have a player in range → duel. Otherwise uncontested.
        const homeContestants = contestants.filter(p => p.team === "home");
        const awayContestants = contestants.filter(p => p.team === "away");

        if (homeContestants.length === 0 || awayContestants.length === 0) {
            // One team only — uncontested, pick the best jumper
            const side = homeContestants.length > 0 ? homeContestants : awayContestants;
            const winner = side.sort((a, b) => aerialStrength(b) - aerialStrength(a))[0];
            commands.push(...this.resolveUncontested(winner, ball, ctx));
            return commands;
        }

        const jumper = homeContestants.sort((a, b) => aerialStrength(b) - aerialStrength(a))[0];
        const rival  = awayContestants.sort((a, b) => aerialStrength(b) - aerialStrength(a))[0];

        // ── A.4 Aerial duel win probability ──────────────────────────────────
        const jumperStr = aerialStrength(jumper);
        const rivalStr  = aerialStrength(rival);
        const total     = jumperStr + rivalStr;
        const winProb   = total > 0 ? jumperStr / total : 0.5;

        const winner = ctx.rng.next() < winProb ? jumper : rival;
        const loser  = winner === jumper ? rival : jumper;

        // ── Emit header: ball bounces off winner's head ───────────────────────
        commands.push(...this.resolveHeader(winner, loser, ball, ctx));

        // ── Commentary event ──────────────────────────────────────────────────
        ctx.events.emit({
            id: `aerial_${ctx.state.tick}`,
            type: "tackle",  // closest existing type — aerial challenges logged as duels
            minute: state.minute,
            second: state.second,
            teamId: winner.team,
            playerId: winner.id,
            playerName: winner.name,
            description: `${winner.name} wins the aerial duel against ${loser.name}.`,
            pos: { ...ball.pos },
        });

        return commands;
    }

    // ── Uncontested: player claims high ball with a head or chest ────────────
    private resolveUncontested(winner: Player, ball: Ball, ctx: SimulationContext): Command[] {
        const commands: Command[] = [];
        const { width, height } = ctx.config.fieldDimensions;
        const isHome = winner.team === "home";
        const forwardX = isHome ? 1 : -1;

        // Head toward attack — modest forward bounce, small random lateral spread
        const spread = (ctx.rng.next() - 0.5) * 40;
        const headTarget = {
            x: Math.max(10, Math.min(width - 10, ball.pos.x + forwardX * 50)),
            y: Math.max(10, Math.min(height - 10, ball.pos.y + spread)),
        };

        const dx = headTarget.x - ball.pos.x;
        const dy = headTarget.y - ball.pos.y;
        const len = Math.hypot(dx, dy) || 1;
        const headForce = 2.5 + (winner.attributes.heading / 100) * 2.0;

        commands.push({
            type: "UPDATE_BALL",
            pos: { ...ball.pos },
            vel: { x: (dx / len) * headForce, y: (dy / len) * headForce },
            height: Math.max(0, ball.height - 8),
            heightVel: -1.5,
            ownerPlayerId: null,
            lastTouchedBy: winner.id,
            lastTouchedTeam: winner.team,
        } as UpdateBallCommand);

        commands.push({
            type: "SET_PLAYER_DECISION",
            playerId: winner.id,
            decision: null,
            cooldown: AERIAL_COOLDOWN_WIN,
        } as SetPlayerDecisionCommand);

        return commands;
    }

    // ── Contested: winner heads, loser stumbles ───────────────────────────────
    private resolveHeader(winner: Player, loser: Player, ball: Ball, ctx: SimulationContext): Command[] {
        const commands = this.resolveUncontested(winner, ball, ctx);

        // Loser gets a longer cooldown — stumbled in the challenge
        commands.push({
            type: "SET_PLAYER_DECISION",
            playerId: loser.id,
            decision: null,
            cooldown: AERIAL_COOLDOWN_LOSE,
        } as SetPlayerDecisionCommand);

        return commands;
    }
}