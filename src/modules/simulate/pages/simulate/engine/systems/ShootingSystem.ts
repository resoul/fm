import type { SimulationContext } from "../context";
import type { SimulationSystem } from "../pipeline";
import type { Command, KickBallCommand, SetPlayerDecisionCommand } from "../core/Command";
import { BALANCE } from "../balance";
import type { Player } from "../types";

let eventCounter = 3000;
function mkEventId() { return `evt_${++eventCounter}`; }

export class ShootingSystem implements SimulationSystem {
    name = "ShootingSystem";

    update(ctx: SimulationContext): Command[] {
        const { homeTeam, awayTeam } = ctx;
        const allPlayers = [...homeTeam.players, ...awayTeam.players];
        const commands: Command[] = [];

        const DEAD_PHASES = new Set(["throwin", "goalkick", "corner", "freekick", "goal", "halftime", "fulltime"]);
        if (DEAD_PHASES.has(ctx.state.phase)) return commands;

        for (const player of allPlayers) {
            if (player.nextDecision?.type === "shoot") {
                const shotCommands = this.executeShoot(player, ctx);
                commands.push(...shotCommands);
            }
        }

        return commands;
    }

    private executeShoot(player: Player, ctx: SimulationContext): Command[] {
        const { state } = ctx;
        const decision = player.nextDecision!;

        if (!player.hasBall) return [];

        const force = BALANCE.SHOT_FORCE_BASE + (player.attributes.finishing / 100) * BALANCE.FINISHING_FORCE_FACTOR;
        const target = decision.target!;

        const commands: Command[] = [];

        // 1. Kick ball command
        commands.push({
            type: "KICK_BALL",
            playerId: player.id,
            targetPos: target,
            force: force
        } as KickBallCommand);

        // 2. Clear decision and set cooldown
        commands.push({
            type: "SET_PLAYER_DECISION",
            playerId: player.id,
            decision: null,
            cooldown: 20
        } as SetPlayerDecisionCommand);

        // 3. Emit event
        ctx.events.emit({
            id: mkEventId(),
            type: "shot",
            minute: state.minute,
            second: state.second,
            teamId: player.team,
            playerId: player.id,
            playerName: player.name,
            description: `${player.name} takes a shot! (xG: ${decision.xG?.toFixed(2)})`,
            pos: { ...player.pos },
            xg: decision.xG
        });

        // 4. Update stats
        const tStats = player.team === "home" ? state.stats.home : state.stats.away;
        tStats.shots++;
        tStats.xg += decision.xG || 0;

        return commands;
    }
}