import type { SimulationWorld } from "./SimulationWorld";
import type { Command } from "./Command";

export class CommandResolver {
    resolve(world: SimulationWorld, commands: Command[]) {
        const orderedCommands = [
            ...commands.filter(cmd => cmd.type !== "KICK_BALL"),
            ...commands.filter(cmd => cmd.type === "KICK_BALL"),
        ];

        for (const cmd of orderedCommands) {
            switch (cmd.type) {
                case "MOVE_PLAYER": {
                    const player = this.findPlayer(world, cmd.playerId);
                    if (player) player.pos = { ...cmd.pos };
                    break;
                }
                case "KICK_BALL": {
                    const player = this.findPlayer(world, cmd.playerId);
                    const origin = player?.pos ?? world.ball.pos;
                    const dx = cmd.targetPos.x - origin.x;
                    const dy = cmd.targetPos.y - origin.y;
                    const len = Math.hypot(dx, dy) || 1;

                    this.clearBallOwnership(world);
                    if (player) {
                        player.kickCooldown = 28;
                    }

                    world.ball.pos = { ...origin };
                    world.ball.vel = {
                        x: (dx / len) * cmd.force,
                        y: (dy / len) * cmd.force
                    };
                    world.ball.ownerPlayerId = null;
                    world.ball.lastTouchedBy = cmd.playerId;
                    world.ball.lastTouchedTeam = player?.team ?? world.ball.lastTouchedTeam;
                    break;
                }
                case "SET_PLAYER_DECISION": {
                    const player = this.findPlayer(world, cmd.playerId);
                    if (player) {
                        player.nextDecision = cmd.decision;
                        player.actionCooldown = cmd.cooldown;
                    }
                    break;
                }
                case "SET_PLAYER_STATE": {
                    const player = this.findPlayer(world, cmd.playerId);
                    if (player) player.state = cmd.state;
                    break;
                }
                case "UPDATE_BALL": {
                    this.clearBallOwnership(world);
                    world.ball.pos = { ...cmd.pos };
                    world.ball.vel = { ...cmd.vel };
                    world.ball.height = cmd.height;
                    world.ball.heightVel = cmd.heightVel;
                    world.ball.ownerPlayerId = cmd.ownerPlayerId;
                    world.ball.lastTouchedBy = cmd.lastTouchedBy;
                    world.ball.lastTouchedTeam = cmd.lastTouchedTeam;
                    if (cmd.ownerPlayerId) {
                        const owner = this.findPlayer(world, cmd.ownerPlayerId);
                        if (owner) owner.hasBall = true;
                    }
                    break;
                }
                case "UPDATE_MATCH_STATE": {
                    if (cmd.minute !== undefined) world.state.minute = cmd.minute;
                    if (cmd.second !== undefined) world.state.second = cmd.second;
                    if (cmd.phase !== undefined) world.state.phase = cmd.phase;
                    if (cmd.score) {
                        world.homeTeam.score = cmd.score.home;
                        world.awayTeam.score = cmd.score.away;
                    }
                    break;
                }
            }
        }
    }

    private findPlayer(world: SimulationWorld, id: string) {
        return (
            world.homeTeam.players.find(p => p.id === id) ||
            world.awayTeam.players.find(p => p.id === id)
        );
    }

    private clearBallOwnership(world: SimulationWorld) {
        for (const player of [...world.homeTeam.players, ...world.awayTeam.players]) {
            player.hasBall = false;
        }
    }
}
