import type { SimulationContext } from "../context";
import type { SimulationSystem } from "../pipeline";
import type { Command, KickBallCommand, SetPlayerDecisionCommand, SetPlayerStateCommand } from "../core/Command";
import { BALANCE } from "../balance";
import type { Player } from "../types";

let eventCounter = 2000;
function mkEventId() { return `evt_${++eventCounter}`; }

export class PassingSystem implements SimulationSystem {
    name = "PassingSystem";

    update(ctx: SimulationContext): Command[] {
        const { homeTeam, awayTeam } = ctx;
        const allPlayers = [...homeTeam.players, ...awayTeam.players];
        const commands: Command[] = [];

        for (const player of allPlayers) {
            if (player.nextDecision?.type === "pass") {
                commands.push(...this.executePass(player, ctx));
            } else if (player.nextDecision?.type === "dribble") {
                commands.push(...this.executeDribble(player, ctx));
            }
        }
        
        return commands;
    }

    private executePass(player: Player, ctx: SimulationContext): Command[] {
        const { homeTeam, awayTeam, state } = ctx;
        const decision = player.nextDecision!;
        
        if (!player.hasBall) return [];

        const targetPlayer = decision.targetPlayerId
            ? [...homeTeam.players, ...awayTeam.players].find(p => p.id === decision.targetPlayerId)
            : null;
        const targetPos = targetPlayer?.pos ?? decision.target;
        if (!targetPos) return [];
        const force = BALANCE.PASS_FORCE_BASE + (player.attributes.passing / 100) * 4;

        const commands: Command[] = [];
        commands.push({
            type: "KICK_BALL",
            playerId: player.id,
            targetPos: targetPos,
            force: force
        } as KickBallCommand);

        commands.push({
            type: "SET_PLAYER_DECISION",
            playerId: player.id,
            decision: null,
            cooldown: 75
        } as SetPlayerDecisionCommand);

        // Update stats
        const tStats = player.team === "home" ? state.stats.home : state.stats.away;
        tStats.passes++;

        ctx.events.emit({
            id: mkEventId(),
            type: "pass",
            minute: state.minute,
            second: state.second,
            teamId: player.team,
            playerId: player.id,
            playerName: player.name,
            description: targetPlayer
                ? `${player.name} passes to ${targetPlayer.name}.`
                : `${player.name} plays a pass.`,
            pos: { ...player.pos },
        });

        return commands;
    }

    private executeDribble(player: Player, _ctx: SimulationContext): Command[] {
        return [
            {
                type: "SET_PLAYER_STATE",
                playerId: player.id,
                state: "dribbling"
            } as SetPlayerStateCommand,
            {
                type: "SET_PLAYER_DECISION",
                playerId: player.id,
                decision: null,
                cooldown: 5
            } as SetPlayerDecisionCommand,
        ];
    }
}
