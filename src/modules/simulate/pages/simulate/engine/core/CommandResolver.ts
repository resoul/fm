import type { SimulationWorld } from "./SimulationWorld";
import type { Command } from "./Command";

export class CommandResolver {
    resolve(world: SimulationWorld, commands: Command[]) {
        for (const cmd of commands) {
            switch (cmd.type) {
                case "MOVE_PLAYER": {
                    const player = this.findPlayer(world, cmd.playerId);
                    if (player) player.pos = { ...cmd.pos };
                    break;
                }
                case "KICK_BALL": {
                    // Logic to update ball velocity based on kick
                    // (Simplification for now)
                    world.ball.vel = {
                        x: (cmd.targetPos.x - world.ball.pos.x) * cmd.force,
                        y: (cmd.targetPos.y - world.ball.pos.y) * cmd.force
                    };
                    world.ball.ownerPlayerId = null;
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
                    world.ball.pos = { ...cmd.pos };
                    world.ball.vel = { ...cmd.vel };
                    world.ball.height = cmd.height;
                    world.ball.heightVel = cmd.heightVel;
                    world.ball.ownerPlayerId = cmd.ownerPlayerId;
                    world.ball.lastTouchedBy = cmd.lastTouchedBy;
                    world.ball.lastTouchedTeam = cmd.lastTouchedTeam;
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
}
