import type { SimulationContext } from "../context";
import type { SimulationSystem } from "../pipeline";
import { distVec } from "../physics";
import type { TeamSide, Vec2, MatchPhase, EventType, Player } from "../types";
import type { Command, UpdateMatchStateCommand, UpdateBallCommand } from "../core/Command";
import { resetFormationPositions } from "../teamFactory";

let eventCounter = 1000;
function mkEventId() { return `evt_${++eventCounter}`; }

// Dead-ball phases where we wait for restart
const DEAD_BALL_PHASES: MatchPhase[] = [
    "throwin", "goalkick", "corner", "freekick",
    "goal", "halftime", "fulltime", "kickoff",
];

// Ticks to wait after goal before kickoff (2s at 60fps)
const GOAL_DELAY_TICKS = 120;
// Ticks before we force-resume if restart is stuck (3s safety valve)
const RESTART_TIMEOUT_TICKS = 180;

export class RefereeSystem implements SimulationSystem {
    name = "RefereeSystem";

    // ID of the player assigned to take the restart
    private _restartTakerId: string | null = null;
    // How many ticks we've been in the current dead-ball phase
    private _deadBallTicks = 0;
    // Ticks in goal/halftime delay
    private _goalDelayTick = 0;

    update(ctx: SimulationContext): Command[] {
        const { state, config } = ctx;
        const commands: Command[] = [];

        // 1. Always update match time
        const totalGameSec = state.tick / config.fps;
        const minute = Math.min(90, Math.floor(totalGameSec / 60));
        const second = Math.floor(totalGameSec % 60);
        commands.push({ type: "UPDATE_MATCH_STATE", minute, second } as UpdateMatchStateCommand);

        // 2. Full time
        if (state.tick >= state.totalTicks && state.phase !== "fulltime") {
            commands.push({ type: "UPDATE_MATCH_STATE", phase: "fulltime" } as UpdateMatchStateCommand);
            ctx.events.emit({
                id: mkEventId(), type: "fulltime",
                minute, second,
                teamId: null, playerId: null, playerName: null,
                description: "Full time.",
                pos: { x: config.fieldDimensions.width / 2, y: config.fieldDimensions.height / 2 },
            });
            return commands;
        }

        // 3. Goal delay → kickoff
        if (state.phase === "goal") {
            this._goalDelayTick++;
            if (this._goalDelayTick >= GOAL_DELAY_TICKS) {
                commands.push(...this.doKickoff(ctx, minute, second));
            }
            return commands;
        }

        // 4. Half-time delay → resume
        if (state.phase === "halftime") {
            this._goalDelayTick++;
            if (this._goalDelayTick >= GOAL_DELAY_TICKS * 2) {
                commands.push(...this.doKickoff(ctx, minute, second));
            }
            return commands;
        }

        // 5. Dead-ball restart waiting
        if (
            DEAD_BALL_PHASES.includes(state.phase) &&
            state.phase !== "goal" &&
            state.phase !== "halftime" &&
            state.phase !== "fulltime" &&
            state.phase !== "kickoff"
        ) {
            this._deadBallTicks++;

            // Keep taker locked to the restart position every tick
            // (prevents MovementSystem from dragging them away)
            this.lockTakerToRestartPos(ctx);

            const resume = this.checkRestartTaken(ctx);
            if (resume.length > 0) {
                this._deadBallTicks = 0;
                this._restartTakerId = null;
                return [...commands, ...resume];
            }

            // Safety: force resume if stuck for too long
            if (this._deadBallTicks > RESTART_TIMEOUT_TICKS) {
                this._deadBallTicks = 0;
                this._restartTakerId = null;
                commands.push({ type: "UPDATE_MATCH_STATE", phase: "playing" } as UpdateMatchStateCommand);
            }
            return commands;
        }

        // 6. Live play
        if (state.phase === "playing") {
            // Half-time check
            const halfTick = Math.floor(state.totalTicks / 2);
            if (state.tick >= halfTick && state.tick < halfTick + 2) {
                commands.push({ type: "UPDATE_MATCH_STATE", phase: "halftime" } as UpdateMatchStateCommand);
                ctx.events.emit({
                    id: mkEventId(), type: "fulltime",
                    minute: 45, second: 0,
                    teamId: null, playerId: null, playerName: null,
                    description: "Half time.",
                    pos: { x: config.fieldDimensions.width / 2, y: config.fieldDimensions.height / 2 },
                });
                this._goalDelayTick = 0;
                return commands;
            }

            commands.push(...this.checkGoal(ctx));
            commands.push(...this.checkOutOfBounds(ctx));
        }

        // 7. Possession stats
        this.updatePossession(ctx);

        return commands;
    }

    // ── Kickoff after goal or halftime ────────────────────

    private doKickoff(ctx: SimulationContext, minute: number, second: number): Command[] {
        this._goalDelayTick = 0;
        const { config } = ctx;
        const fw = config.fieldDimensions.width;
        const fh = config.fieldDimensions.height;

        // Team that conceded kicks off (or away after halftime)
        const kickoffTeam: TeamSide =
            ctx.state.phase === "halftime"
                ? "away"
                : (ctx.homeTeam.score > ctx.awayTeam.score ? "away" : "home");

        resetFormationPositions(ctx.homeTeam, config.fieldDimensions);
        resetFormationPositions(ctx.awayTeam, config.fieldDimensions);

        // Clear all stale decisions
        for (const p of [...ctx.homeTeam.players, ...ctx.awayTeam.players]) {
            p.nextDecision = null;
            p.hasBall = false;
        }

        const team = kickoffTeam === "home" ? ctx.homeTeam : ctx.awayTeam;
        const striker = team.players.find(p => p.position === "ST") ?? team.players[9];

        if (striker) {
            striker.pos = { x: fw / 2 + (kickoffTeam === "home" ? -10 : 10), y: fh / 2 };
            striker.targetPos = { ...striker.pos };
            striker.vel = { x: 0, y: 0 };
            striker.hasBall = true;
            striker.kickCooldown = 0;
            striker.actionCooldown = 0;
        }

        return [
            { type: "UPDATE_MATCH_STATE", phase: "playing" } as UpdateMatchStateCommand,
            {
                type: "UPDATE_BALL",
                pos: { x: fw / 2, y: fh / 2 },
                vel: { x: 0, y: 0 },
                height: 0, heightVel: 0,
                ownerPlayerId: striker?.id ?? null,
                lastTouchedBy: striker?.id ?? null,
                lastTouchedTeam: kickoffTeam,
            } as UpdateBallCommand,
        ];
    }

    // ── Goal ──────────────────────────────────────────────

    private checkGoal(ctx: SimulationContext): Command[] {
        const { ball, config, state, homeTeam, awayTeam, events } = ctx;
        const commands: Command[] = [];

        const goalHalfW = config.fieldDimensions.goalWidth / 2;
        const centerY = config.fieldDimensions.height / 2;
        const inGoalY = ball.pos.y > centerY - goalHalfW && ball.pos.y < centerY + goalHalfW;

        let scored: TeamSide | null = null;
        if (ball.pos.x < 0 && inGoalY) scored = "away";
        if (ball.pos.x > config.fieldDimensions.width && inGoalY) scored = "home";

        if (scored) {
            const newScore = { home: homeTeam.score, away: awayTeam.score };
            if (scored === "home") newScore.home++;
            else newScore.away++;

            const scorerTeam = scored === "home" ? homeTeam : awayTeam;
            const scorerPlayer = ball.lastTouchedTeam === scorerTeam.id
                ? scorerTeam.players.find(p => p.id === ball.lastTouchedBy)
                : undefined;

            this._goalDelayTick = 0;

            commands.push({ type: "UPDATE_MATCH_STATE", phase: "goal", score: newScore } as UpdateMatchStateCommand);
            commands.push({
                type: "UPDATE_BALL",
                pos: { ...ball.pos },
                vel: { x: 0, y: 0 },
                height: 0, heightVel: 0,
                ownerPlayerId: null,
                lastTouchedBy: ball.lastTouchedBy,
                lastTouchedTeam: ball.lastTouchedTeam,
            } as UpdateBallCommand);

            events.emit({
                id: mkEventId(), type: "goal",
                minute: state.minute, second: state.second,
                teamId: scorerTeam.id,
                playerId: scorerPlayer?.id ?? null,
                playerName: scorerPlayer?.name ?? "Unknown",
                description: `⚽ GOAL! ${scorerPlayer?.name ?? "??"} scores for ${scorerTeam.name}! (${newScore.home}-${newScore.away})`,
                pos: { ...ball.pos },
            });
        }
        return commands;
    }

    // ── Out of Bounds ─────────────────────────────────────

    private checkOutOfBounds(ctx: SimulationContext): Command[] {
        const { ball, config } = ctx;
        const { width, height } = config.fieldDimensions;

        if (ball.pos.y < 0 || ball.pos.y > height) {
            const teamId: TeamSide = ball.lastTouchedTeam === "home" ? "away" : "home";
            const restartPos: Vec2 = {
                x: Math.max(20, Math.min(width - 20, ball.pos.x)),
                y: ball.pos.y < 0 ? 8 : height - 8,
            };
            return this.triggerRestart(ctx, "throwin", teamId, restartPos);
        }

        if (ball.pos.x < 0 || ball.pos.x > width) {
            const isHomeEnd = ball.pos.x < 0;
            const attackingTeam: TeamSide = isHomeEnd ? "away" : "home";
            const defendingTeam: TeamSide = isHomeEnd ? "home" : "away";

            if (ball.lastTouchedTeam === attackingTeam) {
                const gkPos: Vec2 = { x: isHomeEnd ? 30 : width - 30, y: height / 2 };
                return this.triggerRestart(ctx, "goalkick", defendingTeam, gkPos);
            } else {
                const cornerPos: Vec2 = {
                    x: isHomeEnd ? 8 : width - 8,
                    y: ball.pos.y < height / 2 ? 8 : height - 8,
                };
                return this.triggerRestart(ctx, "corner", attackingTeam, cornerPos);
            }
        }

        return [];
    }

    // ── Restart ───────────────────────────────────────────

    private triggerRestart(
        ctx: SimulationContext,
        type: MatchPhase,
        teamId: TeamSide,
        pos: Vec2,
    ): Command[] {
        const { state, events } = ctx;
        const allPlayers = [...ctx.homeTeam.players, ...ctx.awayTeam.players];
        const taker = this.findRestartTaker(allPlayers, teamId, pos, type);

        this._restartTakerId = taker?.id ?? null;
        this._deadBallTicks = 0;

        events.emit({
            id: mkEventId(),
            type: restartEventType(type),
            minute: state.minute, second: state.second,
            teamId,
            playerId: taker?.id ?? null,
            playerName: taker?.name ?? null,
            description: `${type.toUpperCase()} for ${teamId}`,
            pos: { ...pos },
        });

        // Clear ALL players' nextDecision so stale targets don't override targetPos in MovementSystem
        for (const p of allPlayers) {
            p.nextDecision = null;
            p.hasBall = false;
        }

        // Teleport taker and lock their targetPos
        if (taker) {
            taker.pos = { ...pos };
            taker.targetPos = { ...pos };
            taker.vel = { x: 0, y: 0 };
            taker.hasBall = true;
            taker.actionCooldown = 20;
            taker.kickCooldown = 0;
        }

        return [
            { type: "UPDATE_MATCH_STATE", phase: type } as UpdateMatchStateCommand,
            {
                type: "UPDATE_BALL",
                pos: { ...pos },
                vel: { x: 0, y: 0 },
                height: 0, heightVel: 0,
                ownerPlayerId: taker?.id ?? null,
                lastTouchedBy: taker?.id ?? null,
                lastTouchedTeam: teamId,
            } as UpdateBallCommand,
        ];
    }

    /**
     * Called every tick while in dead-ball phase.
     * Keep the taker pinned to restart position so MovementSystem can't drag them away.
     */
    private lockTakerToRestartPos(ctx: SimulationContext): void {
        if (!this._restartTakerId) return;
        const taker = findPlayer(ctx, this._restartTakerId);
        if (!taker || !ctx.ball.ownerPlayerId) return;

        // Only lock if taker still has ball
        if (ctx.ball.ownerPlayerId === this._restartTakerId) {
            // Keep targetPos pointing at current ball position so Movement doesn't drift them
            taker.targetPos = { ...ctx.ball.pos };
        }
    }

    /**
     * Resume playing only when the ball is actually in motion and released.
     *
     * Conditions to resume:
     * A) Ball is moving fast (> threshold) and no longer owned → taker kicked it
     * B) Ball is owned by a DIFFERENT player (not the taker) → someone else took over
     * C) Taker no longer exists / lost the ball somehow → force resume
     */
    private checkRestartTaken(ctx: SimulationContext): Command[] {
        const { ball } = ctx;
        const takerId = this._restartTakerId;

        // No taker assigned → resume immediately
        if (!takerId) {
            return [{ type: "UPDATE_MATCH_STATE", phase: "playing" } as UpdateMatchStateCommand];
        }

        const ballSpeed = Math.hypot(ball.vel.x, ball.vel.y);

        // A) Ball flying free (no owner) at decent speed
        if (ball.ownerPlayerId === null && ballSpeed > 1.0) {
            return [{ type: "UPDATE_MATCH_STATE", phase: "playing" } as UpdateMatchStateCommand];
        }

        // B) Different player has the ball
        if (ball.ownerPlayerId !== null && ball.ownerPlayerId !== takerId) {
            return [{ type: "UPDATE_MATCH_STATE", phase: "playing" } as UpdateMatchStateCommand];
        }

        // Still waiting
        return [];
    }

    // ── Helpers ───────────────────────────────────────────

    private findRestartTaker(
        allPlayers: Player[],
        teamId: TeamSide,
        pos: Vec2,
        type: MatchPhase,
    ): Player | undefined {
        // Goalkick → always the GK
        if (type === "goalkick") {
            return allPlayers.find(p => p.team === teamId && p.position === "GK");
        }

        const eligible = allPlayers.filter(p =>
            p.team === teamId && p.position !== "GK"
        );
        if (eligible.length === 0) return undefined;

        // Corner → best crosser
        if (type === "corner") {
            return eligible.sort((a, b) =>
                b.attributes.crossing - a.attributes.crossing
            )[0];
        }

        // Throw-in / free-kick → nearest player to restart spot
        return eligible.sort((a, b) => distVec(a.pos, pos) - distVec(b.pos, pos))[0];
    }

    private updatePossession(ctx: SimulationContext): void {
        const { ball, state, homeTeam, awayTeam } = ctx;
        const owner = [...homeTeam.players, ...awayTeam.players].find(p => p.id === ball.ownerPlayerId);

        if (owner) {
            if (owner.team === "home") state.stats.possessionTick.home++;
            else state.stats.possessionTick.away++;
        } else {
            const hClosest = Math.min(...homeTeam.players.map(p => distVec(p.pos, ball.pos)));
            const aClosest = Math.min(...awayTeam.players.map(p => distVec(p.pos, ball.pos)));
            if (hClosest < aClosest * 0.8) state.stats.possessionTick.home += 0.3;
            else if (aClosest < hClosest * 0.8) state.stats.possessionTick.away += 0.3;
        }

        const total = state.stats.possessionTick.home + state.stats.possessionTick.away;
        if (total > 0) {
            state.stats.home.possession = Math.round((state.stats.possessionTick.home / total) * 100);
            state.stats.away.possession = 100 - state.stats.home.possession;
        }
    }
}

function findPlayer(ctx: SimulationContext, id: string): Player | undefined {
    return (
        ctx.homeTeam.players.find(p => p.id === id) ||
        ctx.awayTeam.players.find(p => p.id === id)
    );
}

function restartEventType(phase: MatchPhase): EventType {
    if (phase === "corner") return "corner";
    if (phase === "freekick") return "freekick";
    if (phase === "throwin") return "throwin";
    if (phase === "goalkick") return "goalkick";
    return "freekick";
}