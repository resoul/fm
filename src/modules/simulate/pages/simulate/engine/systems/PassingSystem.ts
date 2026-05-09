import { SimulationContext } from "../context";
import { SimulationSystem } from "../pipeline";
import { BallPhysics, subVec } from "../physics";
import { BALANCE } from "../balance";

let eventCounter = 4000;
function mkEventId() { return `evt_${++eventCounter}`; }

export class PassingSystem implements SimulationSystem {
    name = "PassingSystem";
    private ballPhysics: BallPhysics;

    constructor() {
        this.ballPhysics = new BallPhysics({ width: 720, height: 480 });
    }

    update(ctx: SimulationContext): void {
        const { homeTeam, awayTeam } = ctx;
        const allPlayers = [...homeTeam.players, ...awayTeam.players];

        for (const player of allPlayers) {
            if (player.nextDecision?.type === "pass") {
                this.executePass(player, ctx);
                player.nextDecision = null;
            } else if (player.nextDecision?.type === "dribble") {
                this.executeDribble(player, ctx);
                player.nextDecision = null;
            }
        }
    }

    private executePass(player: any, ctx: SimulationContext): void {
        const { ball, state } = ctx;
        const decision = player.nextDecision!;
        
        if (!player.hasBall) return;

        const targetPos = decision.target;
        const dir = subVec(targetPos, player.pos);
        const force = BALANCE.PASS_FORCE_BASE + (player.attributes.passing / 100) * 4;

        this.ballPhysics.kick(ball, dir, force, 0);
        
        player.hasBall = false;
        player.kickCooldown = 15;

        const tStats = player.team === "home" ? state.stats.home : state.stats.away;
        tStats.passes++;
    }

    private executeDribble(player: any, ctx: SimulationContext): void {
        const decision = player.nextDecision!;
        player.targetPos = decision.target;
        player.state = "dribbling";
    }
}
