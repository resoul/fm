import { SimulationContext } from "../context";
import { SimulationSystem } from "../pipeline";
import { BallPhysics } from "../physics";
import { Command, KickBallCommand, SetPlayerDecisionCommand } from "../core/Command";
import { BALANCE } from "../balance";
import { Player } from "../types";

let eventCounter = 3000;
function mkEventId() { return `evt_${++eventCounter}`; }

export class ShootingSystem implements SimulationSystem {
    name = "ShootingSystem";
    private ballPhysics: BallPhysics;

    constructor() {
        this.ballPhysics = new BallPhysics({ width: 720, height: 480 }); 
    }

    update(ctx: SimulationContext): Command[] {
        const { homeTeam, awayTeam } = ctx;
        const allPlayers = [...homeTeam.players, ...awayTeam.players];
        const commands: Command[] = [];

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
