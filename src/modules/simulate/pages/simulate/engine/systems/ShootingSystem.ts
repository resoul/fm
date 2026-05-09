import { SimulationContext } from "../context";
import { SimulationSystem } from "../pipeline";
import { BallPhysics, subVec } from "../physics";
import { TeamSide, MatchEvent } from "../types";
import { BALANCE } from "../balance";

let eventCounter = 3000;
function mkEventId() { return `evt_${++eventCounter}`; }

export class ShootingSystem implements SimulationSystem {
    name = "ShootingSystem";
    private ballPhysics: BallPhysics;

    constructor() {
        // We'll need a shared ballPhysics or similar, for now create local
        this.ballPhysics = new BallPhysics({ width: 720, height: 480 }); // TODO: pass field dim
    }

    update(ctx: SimulationContext): void {
        const { homeTeam, awayTeam, ball, state, events } = ctx;
        const allPlayers = [...homeTeam.players, ...awayTeam.players];

        for (const player of allPlayers) {
            if (player.nextDecision?.type === "shoot") {
                this.executeShoot(player, ctx);
                player.nextDecision = null; // Clear decision after execution
            }
        }
    }

    private executeShoot(player: any, ctx: SimulationContext): void {
        const { ball, events, state, homeTeam, awayTeam } = ctx;
        const decision = player.nextDecision!;
        
        if (!player.hasBall) return;

        const force = BALANCE.SHOT_FORCE_BASE + (player.attributes.finishing / 100) * BALANCE.FINISHING_FORCE_FACTOR;
        const target = decision.target;
        const dir = subVec(target, player.pos);
        
        // Apply inaccuracy based on attributes
        const inaccuracy = 0.15 - (player.attributes.technique / 100) * 0.1;
        const shotDir = this.ballPhysics.addInaccuracy(dir, inaccuracy, ctx.rng);

        this.ballPhysics.kick(ball, shotDir, force, 0.1); 
        
        player.hasBall = false;
        player.kickCooldown = 20;

        events.emit({
            id: mkEventId(),
            type: "shot",
            minute: state.minute,
            second: state.second,
            teamId: player.team,
            playerId: player.id,
            playerName: player.name,
            description: `${player.name} takes a shot! (xG: ${decision.xG?.toFixed(2)})`,
            pos: { ...player.pos },
            xG: decision.xG
        });

        // Update stats
        const tStats = player.team === "home" ? state.stats.home : state.stats.away;
        tStats.shots++;
        tStats.xg += decision.xG || 0;
    }
}
