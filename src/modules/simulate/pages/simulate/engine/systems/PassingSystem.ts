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

        // During dead-ball, don't auto-execute passes — wait for DecisionSystem to give taker a fresh decision
        const DEAD_PHASES = new Set(["throwin", "goalkick", "corner", "freekick", "goal", "halftime", "fulltime"]);
        if (DEAD_PHASES.has(ctx.state.phase)) return commands;

        for (const player of allPlayers) {
            if (player.nextDecision?.type === "pass") {
                commands.push(...this.executePass(player, ctx));
            } else if (player.nextDecision?.type === "dribble") {
                commands.push(...this.executeDribble(player));
            }
        }

        return commands;
    }

    private executePass(player: Player, ctx: SimulationContext): Command[] {
        const { homeTeam, awayTeam, state } = ctx;
        const decision = player.nextDecision!;

        if (!player.hasBall) return [];

        const allPlayers = [...homeTeam.players, ...awayTeam.players];
        const targetPlayer = decision.targetPlayerId
            ? allPlayers.find(p => p.id === decision.targetPlayerId)
            : null;
        const targetPos = targetPlayer?.pos ?? decision.target;
        if (!targetPos) return [];

        // Pass force scales with passing attribute
        const force = BALANCE.PASS_FORCE_BASE + (player.attributes.passing / 100) * 4;

        const commands: Command[] = [];
        commands.push({
            type: "KICK_BALL",
            playerId: player.id,
            targetPos: targetPos,
            force: force
        } as KickBallCommand);

        // Passer cooldown: they need time to recover their position
        commands.push({
            type: "SET_PLAYER_DECISION",
            playerId: player.id,
            decision: null,
            cooldown: ctx.rng.nextInt(BALANCE.ACTION_COOLDOWN_MIN, BALANCE.ACTION_COOLDOWN_MAX),
        } as SetPlayerDecisionCommand);

        // ── Receiver first-touch cooldown (KEY FIX for pass spam) ──
        // The receiver gets a cooldown immediately, representing the time
        // needed to control the ball, look up, and evaluate options.
        // Without this, receivers re-pass within 1-2 ticks of pickup.
        if (targetPlayer) {
            // Better first touch = lower control time
            const firstTouchFactor = 1 - (targetPlayer.attributes.firstTouch / 100) * 0.4;
            // Under pressure (nearby defenders) = higher control time
            const nearbyDefenders = ctx.spatialHash
                .queryRadius(targetPlayer.pos, 35)
                .filter(p => p.team !== targetPlayer.team).length;
            const pressureFactor = 1 + nearbyDefenders * 0.12;

            const baseCooldown = ctx.rng.nextInt(
                BALANCE.PASS_RECEIVER_CONTROL_MIN,
                BALANCE.PASS_RECEIVER_CONTROL_MAX,
            );
            const receiverCooldown = Math.round(baseCooldown * firstTouchFactor * pressureFactor);

            commands.push({
                type: "SET_PLAYER_DECISION",
                playerId: targetPlayer.id,
                decision: null,
                cooldown: receiverCooldown,
            } as SetPlayerDecisionCommand);
        }

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

    private executeDribble(player: Player): Command[] {
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