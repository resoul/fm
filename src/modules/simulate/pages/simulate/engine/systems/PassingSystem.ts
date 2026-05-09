import { SimulationContext } from "../context";
import { SimulationSystem } from "../pipeline";
import { BallPhysics } from "../physics";
import { Command, KickBallCommand, SetPlayerDecisionCommand, SetPlayerStateCommand } from "../core/Command";
import { BALANCE } from "../balance";
import { Player } from "../types";

export class PassingSystem implements SimulationSystem {
    name = "PassingSystem";
    private ballPhysics: BallPhysics;

    constructor() {
        this.ballPhysics = new BallPhysics({ width: 720, height: 480 });
    }

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
        const { state } = ctx;
        const decision = player.nextDecision!;
        
        if (!player.hasBall) return [];

        const targetPos = decision.target!;
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
            cooldown: 15
        } as SetPlayerDecisionCommand);

        // Update stats
        const tStats = player.team === "home" ? state.stats.home : state.stats.away;
        tStats.passes++;

        return commands;
    }

    private executeDribble(player: Player, ctx: SimulationContext): Command[] {
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
