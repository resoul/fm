import { SimulationContext } from "../context";
import { SimulationSystem } from "../pipeline";
import { distVec } from "../physics";
import { TeamSide, Vec2, MatchPhase } from "../types";
import { Command, UpdateMatchStateCommand, UpdateBallCommand } from "../core/Command";

let eventCounter = 1000;
function mkEventId() { return `evt_${++eventCounter}`; }

export class RefereeSystem implements SimulationSystem {
    name = "RefereeSystem";

    update(ctx: SimulationContext): Command[] {
        const { state, config } = ctx;
        const commands: Command[] = [];

        // 1. Update match time
        const totalGameSec = state.tick / config.fps;
        const minute = Math.min(90, Math.floor(totalGameSec / 60));
        const second = Math.floor(totalGameSec % 60);

        commands.push({
            type: "UPDATE_MATCH_STATE",
            minute,
            second
        } as UpdateMatchStateCommand);

        // 2. Check for ball events
        if (state.phase === "playing") {
            commands.push(...this.checkGoal(ctx));
            commands.push(...this.checkOutOfBounds(ctx));
        }

        // 3. Update possession
        this.updatePossession(ctx);

        return commands;
    }

    private checkGoal(ctx: SimulationContext): Command[] {
        const { ball, config, state, homeTeam, awayTeam, events } = ctx;
        const commands: Command[] = [];
        
        const goalHalfW = config.fieldDimensions.goalWidth / 2;
        const centerY = config.fieldDimensions.height / 2;
        const inGoalY = ball.pos.y > centerY - goalHalfW && ball.pos.y < centerY + goalHalfW;

        let scored: TeamSide | null = null;
        if (ball.pos.x < 0 && inGoalY) scored = "away";
        if (ball.pos.x > config.fieldDimensions.width && inGoalY) scored = "home";

        if (scored && state.phase === "playing") {
            const newScore = { home: homeTeam.score, away: awayTeam.score };
            if (scored === "home") newScore.home++;
            else newScore.away++;

            const scorerTeam = scored === "home" ? homeTeam : awayTeam;
            const scorerPlayer = ball.lastTouchedTeam === scorerTeam.id
                ? scorerTeam.players.find(p => p.id === ball.lastTouchedBy)
                : undefined;

            commands.push({
                type: "UPDATE_MATCH_STATE",
                phase: "goal",
                score: newScore
            } as UpdateMatchStateCommand);

            events.emit({
                id: mkEventId(),
                type: "goal",
                minute: state.minute,
                second: state.second,
                teamId: scorerTeam.id,
                playerId: scorerPlayer?.id ?? null,
                playerName: scorerPlayer?.name ?? "Unknown",
                description: `⚽ GOAL! ${scorerPlayer?.name ?? "??"} scores for ${scorerTeam.name}! (${newScore.home}-${newScore.away})`,
                pos: { ...ball.pos },
            });
        }
        return commands;
    }

    private checkOutOfBounds(ctx: SimulationContext): Command[] {
        const { ball, config } = ctx;
        const { width, height } = config.fieldDimensions;

        // Sideline Out (Throw-in)
        if (ball.pos.y < 0 || ball.pos.y > height) {
            const teamId = ball.lastTouchedTeam === "home" ? "away" : "home";
            return this.triggerRestart(ctx, "throwin", teamId, { 
                x: Math.max(20, Math.min(width - 20, ball.pos.x)), 
                y: ball.pos.y < 0 ? 0 : height 
            });
        }

        // Goal line Out (Goal kick or Corner)
        if (ball.pos.x < 0 || ball.pos.x > width) {
            const isHomeEnd = ball.pos.x < 0;
            const attackingTeam: TeamSide = isHomeEnd ? "away" : "home";
            const defendingTeam: TeamSide = isHomeEnd ? "home" : "away";

            if (ball.lastTouchedTeam === attackingTeam) {
                return this.triggerRestart(ctx, "goalkick", defendingTeam, { 
                    x: isHomeEnd ? 40 : width - 40, 
                    y: height / 2 
                });
            } else {
                return this.triggerRestart(ctx, "corner", attackingTeam, { 
                    x: isHomeEnd ? 0 : width, 
                    y: ball.pos.y < height / 2 ? 0 : height 
                });
            }
        }
        return [];
    }

    private triggerRestart(ctx: SimulationContext, type: MatchPhase, teamId: TeamSide, pos: Vec2): Command[] {
        const { state, events } = ctx;
        
        events.emit({
            id: mkEventId(),
            type: type as any, // MatchPhase to EventType mapping is mostly 1:1 or simplified here
            minute: state.minute,
            second: state.second,
            teamId: teamId,
            playerId: null,
            playerName: null,
            description: `${type.toUpperCase()} for ${teamId}`,
            pos: { ...pos },
        });

        return [{
            type: "UPDATE_BALL",
            pos: { ...pos },
            vel: { x: 0, y: 0 },
            height: 0,
            heightVel: 0,
            ownerPlayerId: null,
            lastTouchedBy: null,
            lastTouchedTeam: null
        } as UpdateBallCommand];
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
