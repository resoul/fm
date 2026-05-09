import { SimulationContext } from "../context";
import { SimulationSystem } from "../pipeline";
import { distVec, PHYSICS } from "../physics";
import { TeamSide, MatchEvent, Vec2 } from "../types";

let eventCounter = 1000;
function mkEventId() { return `evt_${++eventCounter}`; }

export class RefereeSystem implements SimulationSystem {
    name = "RefereeSystem";

    update(ctx: SimulationContext): void {
        const { state, config } = ctx;

        // 1. Update match time
        const totalGameSec = state.tick / config.fps;
        state.minute = Math.min(90, Math.floor(totalGameSec / 60));
        state.second = Math.floor(totalGameSec % 60);

        // 2. Check for ball events
        if (state.phase === "playing") {
            this.checkGoal(ctx);
            this.checkOutOfBounds(ctx);
        }

        // 3. Update possession
        this.updatePossession(ctx);
    }

    private checkGoal(ctx: SimulationContext): void {
        const { ball, config, state, homeTeam, awayTeam, events } = ctx;
        
        const goalHalfW = config.fieldDimensions.goalWidth / 2;
        const centerY = config.fieldDimensions.height / 2;
        const inGoalY = ball.pos.y > centerY - goalHalfW && ball.pos.y < centerY + goalHalfW;

        let scored: TeamSide | null = null;
        if (ball.pos.x < 0 && inGoalY) scored = "away";
        if (ball.pos.x > config.fieldDimensions.width && inGoalY) scored = "home";

        if (scored) {
            if (state.phase === "playing") {
                if (scored === "home") homeTeam.score++;
                else awayTeam.score++;

                const scorerTeam = scored === "home" ? homeTeam : awayTeam;
                const scorerPlayer = ball.lastTouchedTeam === scorerTeam.id
                    ? scorerTeam.players.find(p => p.id === ball.lastTouchedBy)
                    : undefined;

                state.phase = "goal";
                state.lastGoalTime = state.tick;

                events.emit({
                    id: mkEventId(),
                    type: "goal",
                    minute: state.minute,
                    second: state.second,
                    teamId: scorerTeam.id,
                    playerId: scorerPlayer?.id ?? null,
                    playerName: scorerPlayer?.name ?? "Unknown",
                    description: `⚽ GOAL! ${scorerPlayer?.name ?? "??"} scores for ${scorerTeam.name}! (${homeTeam.score}-${awayTeam.score})`,
                    pos: { ...ball.pos },
                });
            }
        }
    }

    private checkOutOfBounds(ctx: SimulationContext): void {
        const { ball, config, state, events } = ctx;
        const { width, height } = config.fieldDimensions;

        // Sideline Out (Throw-in)
        if (ball.pos.y < 0 || ball.pos.y > height) {
            const teamId = ball.lastTouchedTeam === "home" ? "away" : "home";
            this.triggerRestart(ctx, "throwin", teamId, { 
                x: Math.max(20, Math.min(width - 20, ball.pos.x)), 
                y: ball.pos.y < 0 ? 0 : height 
            });
            return;
        }

        // Goal line Out (Goal kick or Corner)
        if (ball.pos.x < 0 || ball.pos.x > width) {
            const isHomeEnd = ball.pos.x < 0;
            const attackingTeam: TeamSide = isHomeEnd ? "away" : "home";
            const defendingTeam: TeamSide = isHomeEnd ? "home" : "away";

            if (ball.lastTouchedTeam === attackingTeam) {
                // Goal Kick
                this.triggerRestart(ctx, "goalkick", defendingTeam, { 
                    x: isHomeEnd ? 40 : width - 40, 
                    y: height / 2 
                });
            } else {
                // Corner
                this.triggerRestart(ctx, "corner", attackingTeam, { 
                    x: isHomeEnd ? 0 : width, 
                    y: ball.pos.y < height / 2 ? 0 : height 
                });
            }
        }
    }

    private triggerRestart(ctx: SimulationContext, type: any, teamId: TeamSide, pos: Vec2): void {
        const { ball, state, events } = ctx;
        
        ball.pos = { ...pos };
        ball.vel = { x: 0, y: 0 };
        ball.height = 0;
        ball.ownerPlayerId = null;
        
        // For now, we just teleport the ball and let players chase it
        // In a fuller version, we'd set phase to "goalkick"/"throwin"
        events.emit({
            id: mkEventId(),
            type: type,
            minute: state.minute,
            second: state.second,
            teamId: teamId,
            playerId: null,
            playerName: null,
            description: `${type.toUpperCase()} for ${teamId}`,
            pos: { ...pos },
        });
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
