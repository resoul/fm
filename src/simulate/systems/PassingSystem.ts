import type { SimulationContext } from "../context";
import type { SimulationSystem } from "../pipeline";
import type { Command, KickBallCommand, SetPlayerDecisionCommand, SetPlayerStateCommand } from "../core/Command";
import { BALANCE } from "../balance";
import type { Player, Vec2 } from "../types";

let eventCounter = 2000;
function mkEventId() { return `evt_${++eventCounter}`; }

// ── Error Model helpers ───────────────────────────────────────────────────────
//
// A pass is executed as KICK_BALL with a targetPos.
// Instead of always sending the ball exactly where intended, we offset
// targetPos by a random error vector. The magnitude depends on:
//
//   1. passing attribute      — better passer = smaller base error
//   2. pressure               — nearby defenders increase error
//   3. fatigue                — tired players are less accurate
//   4. weak foot              — cross-foot passes add error (future: flair attr)
//   5. decision complexity    — long passes have larger absolute error
//
// The resulting inaccuracy is enough to:
//   • send the ball slightly wide of the intended receiver → loose ball
//   • drift into a defender's path → interception
//   • go out of play on a bad touch
//
// It does NOT make every pass terrible — a 85-passing player under no
// pressure will still land the ball within ~3-5px of the target.
// A 50-passing player under two defenders could miss by 25-40px.

function computePassError(
    player: Player,
    targetPos: Vec2,
    ctx: SimulationContext
): Vec2 {
    const rng = ctx.rng;

    // 1. Base accuracy: 0 (terrible) → 1 (perfect)
    const passingSkill = (player.attributes.passing ?? 50) / 100;

    // 2. Pressure: count defenders within 30px
    const nearbyDefenders = ctx.spatialHash
        .queryRadius(player.pos, 30)
        .filter(p => p.team !== player.team).length;
    const pressurePenalty = nearbyDefenders * BALANCE.PASS_ERROR_PRESSURE_FACTOR;

    // 3. Fatigue (0 = fresh, 1 = exhausted)
    const fatiguePenalty = (player.fatigue ?? 0) * BALANCE.PASS_ERROR_FATIGUE_FACTOR;

    // 4. Distance — longer passes have larger absolute error window
    const dx = targetPos.x - player.pos.x;
    const dy = targetPos.y - player.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const distanceFactor = 1 + (dist / BALANCE.PASS_ERROR_DISTANCE_NORM) * BALANCE.PASS_ERROR_DISTANCE_SCALE;

    // Combined accuracy 0..1 (1 = max error)
    const rawInaccuracy = (1 - passingSkill) + pressurePenalty + fatiguePenalty;
    const inaccuracy = Math.min(rawInaccuracy, 1);

    // Max error radius in world units (px)
    const maxError = BALANCE.PASS_ERROR_MAX_RADIUS * inaccuracy * distanceFactor;

    if (maxError < 0.5) return { x: 0, y: 0 }; // elite passer, no pressure → skip

    // Random direction + magnitude with slight bias toward 0 (gaussian-like via two samples)
    const angle = rng.next() * Math.PI * 2;
    const magnitude = ((rng.next() + rng.next()) / 2) * maxError; // softer bell curve

    return {
        x: Math.cos(angle) * magnitude,
        y: Math.sin(angle) * magnitude,
    };
}

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
        const intendedPos = targetPlayer?.pos ?? decision.target;
        if (!intendedPos) return [];

        // ── 4.4 Error Model ──────────────────────────────────────────────────
        // Compute positional error and apply it to the kick target.
        // The ball lands near — but not always exactly on — the intended receiver.
        const errorVec = computePassError(player, intendedPos, ctx);
        const actualTargetPos: Vec2 = {
            x: intendedPos.x + errorVec.x,
            y: intendedPos.y + errorVec.y,
        };

        // Classify error severity for the event description
        const errorMag = Math.sqrt(errorVec.x ** 2 + errorVec.y ** 2);
        const isWildPass = errorMag > BALANCE.PASS_ERROR_WILD_THRESHOLD;
        const isPoorPass = errorMag > BALANCE.PASS_ERROR_POOR_THRESHOLD;

        // Pass force scales with passing attribute
        const force = BALANCE.PASS_FORCE_BASE + (player.attributes.passing / 100) * 4;

        const commands: Command[] = [];
        commands.push({
            type: "KICK_BALL",
            playerId: player.id,
            targetPos: actualTargetPos,  // ← erroneous position, not intendedPos
            force: force
        } as KickBallCommand);

        // Passer cooldown
        commands.push({
            type: "SET_PLAYER_DECISION",
            playerId: player.id,
            decision: null,
            cooldown: ctx.rng.nextInt(BALANCE.ACTION_COOLDOWN_MIN, BALANCE.ACTION_COOLDOWN_MAX),
        } as SetPlayerDecisionCommand);

        // ── Receiver first-touch cooldown ────────────────────────────────────
        // Wild passes skip the receiver cooldown — the ball isn't going to them cleanly.
        // Poor passes still set a cooldown but longer (harder to control).
        if (targetPlayer && !isWildPass) {
            const firstTouchFactor = 1 - (targetPlayer.attributes.firstTouch / 100) * 0.4;
            const nearbyDefenders = ctx.spatialHash
                .queryRadius(targetPlayer.pos, 35)
                .filter(p => p.team !== targetPlayer.team).length;
            const pressureFactor = 1 + nearbyDefenders * 0.12;

            // Poor passes are harder to control
            const poorPassFactor = isPoorPass ? 1.3 : 1.0;

            const baseCooldown = ctx.rng.nextInt(
                BALANCE.PASS_RECEIVER_CONTROL_MIN,
                BALANCE.PASS_RECEIVER_CONTROL_MAX,
            );
            const receiverCooldown = Math.round(
                baseCooldown * firstTouchFactor * pressureFactor * poorPassFactor
            );

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

        // ── C.1 PlayerMatchStats ──────────────────────────────────────────────
        const pStats = ctx.playerStats?.get(player.id);
        if (pStats) {
            pStats.passesAttempted++;
            // A wild pass is not "completed" — ball went too far astray
            if (!isWildPass) pStats.passesCompleted++;
            // Progressive pass: ball moved ≥ 20px toward opponent goal
            const dx = intendedPos.x - player.pos.x;
            const progressiveDir = player.team === "home" ? dx : -dx;
            if (progressiveDir >= 20) pStats.progressivePasses++;
        }

        // Event description reflects pass quality
        const qualityLabel = isWildPass
            ? "plays a wayward pass."
            : isPoorPass
                ? `plays a loose pass to ${targetPlayer?.name ?? "open space"}.`
                : targetPlayer
                    ? `passes to ${targetPlayer.name}.`
                    : "plays a pass.";

        ctx.events.emit({
            id: mkEventId(),
            type: "pass",
            minute: state.minute,
            second: state.second,
            teamId: player.team,
            playerId: player.id,
            playerName: player.name,
            description: `${player.name} ${qualityLabel}`,
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