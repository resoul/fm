import type { SimulationWorld } from "./SimulationWorld";
import type {
    Command, CommandType,
    MovePlayerCommand, KickBallCommand, SetPlayerDecisionCommand,
    SetPlayerStateCommand, UpdateBallCommand, UpdateMatchStateCommand,
    UpdatePlayerMetricsCommand,
} from "./Command";

// Handler signature: takes world + the specific command subtype
type CommandHandler<T extends Command> = (world: SimulationWorld, cmd: T) => void;

// Map from CommandType to its handler — typed via overloaded record
type HandlerMap = {
    [K in CommandType]?: CommandHandler<Extract<Command, { type: K }>>;
};

/**
 * CommandResolver applies a list of Commands to SimulationWorld.
 *
 * Handlers are registered in a map (handlers[cmd.type]) instead of a switch,
 * so adding new command types never requires touching this file.
 *
 * KICK_BALL commands are always applied last (after all position updates)
 * to ensure physics reads the correct player positions.
 */
export class CommandResolver {
    private readonly handlers: HandlerMap = {

        MOVE_PLAYER: (world, cmd: MovePlayerCommand) => {
            const player = this.findPlayer(world, cmd.playerId);
            if (player) player.pos = { ...cmd.pos };
        },

        KICK_BALL: (world, cmd: KickBallCommand) => {
            const player = this.findPlayer(world, cmd.playerId);
            const origin = player?.pos ?? world.ball.pos;
            const dx = cmd.targetPos.x - origin.x;
            const dy = cmd.targetPos.y - origin.y;
            const len = Math.hypot(dx, dy) || 1;

            this.clearBallOwnership(world);
            if (player) player.kickCooldown = 28;

            world.ball.pos = { ...origin };
            world.ball.vel = {
                x: (dx / len) * cmd.force,
                y: (dy / len) * cmd.force,
            };
            world.ball.ownerPlayerId = null;
            world.ball.lastTouchedBy = cmd.playerId;
            world.ball.lastTouchedTeam = player?.team ?? world.ball.lastTouchedTeam;
        },

        SET_PLAYER_DECISION: (world, cmd: SetPlayerDecisionCommand) => {
            const player = this.findPlayer(world, cmd.playerId);
            if (player) {
                player.nextDecision = cmd.decision;
                player.actionCooldown = cmd.cooldown;
            }
        },

        SET_PLAYER_STATE: (world, cmd: SetPlayerStateCommand) => {
            const player = this.findPlayer(world, cmd.playerId);
            if (player) player.state = cmd.state;
        },

        UPDATE_BALL: (world, cmd: UpdateBallCommand) => {
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
        },

        UPDATE_MATCH_STATE: (world, cmd: UpdateMatchStateCommand) => {
            if (cmd.minute !== undefined) world.state.minute = cmd.minute;
            if (cmd.second !== undefined) world.state.second = cmd.second;
            if (cmd.phase !== undefined) world.state.phase = cmd.phase;
            if (cmd.score) {
                world.homeTeam.score = cmd.score.home;
                world.awayTeam.score = cmd.score.away;
            }
        },

        UPDATE_PLAYER_METRICS: (world, cmd: UpdatePlayerMetricsCommand) => {
            const player = this.findPlayer(world, cmd.playerId);
            if (player) {
                player.vel = { ...cmd.vel };
                player.fatigue = cmd.fatigue;
                player.kickCooldown = cmd.kickCooldown;
            }
        },
    };

    resolve(world: SimulationWorld, commands: Command[]): void {
        // KICK_BALL must run after all position/state updates
        const kicks = commands.filter(cmd => cmd.type === "KICK_BALL");
        const rest  = commands.filter(cmd => cmd.type !== "KICK_BALL");

        for (const cmd of [...rest, ...kicks]) {
            const handler = this.handlers[cmd.type] as CommandHandler<Command> | undefined;
            handler?.(world, cmd);
        }
    }

    /**
     * Register a handler for a new command type at runtime.
     * Allows external systems to extend the resolver without modifying this file.
     */
    register<T extends Command>(type: T["type"], handler: CommandHandler<T>): void {
        (this.handlers as Record<string, CommandHandler<Command>>)[type] =
            handler as CommandHandler<Command>;
    }

    // ── Helpers ───────────────────────────────────────────

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
