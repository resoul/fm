import type { SimulationContext } from "../context";
import type { SimulationSystem } from "../pipeline";
import type { Command, KickBallCommand, SetPlayerDecisionCommand } from "../core/Command";
import { BALANCE } from "../balance";
import type { Player, Vec2 } from "../types";
import { commentaryShot } from "./CommentarySystem";

let eventCounter = 3000;
function mkEventId() { return `evt_${++eventCounter}`; }

// ── Shot Error Model ──────────────────────────────────────────────────────────
//
// Shots are aimed at a target (usually the goal centre or a corner).
// Error offsets the actual kick target so shots can:
//   • sail wide or over the bar
//   • require the keeper to dive (not sit in the middle)
//   • occasionally dribble tamely to the keeper
//
// Error factors:
//   1. finishing attribute   — composure and technique
//   2. pressure              — defenders nearby
//   3. fatigue               — tired legs reduce accuracy
//   4. longShots attribute   — used for shots outside the box
//
// Scale is larger than pass error — a shot aimed at the top corner
// can realistically miss by a goalpost width.

const GOAL_AREA_THRESHOLD = 60; // px — inside this distance = close range shot

function computeShotError(
    player: Player,
    targetPos: Vec2,
    ctx: SimulationContext
): Vec2 {
    const rng = ctx.rng;

    const dist = Math.sqrt(
        (targetPos.x - player.pos.x) ** 2 +
        (targetPos.y - player.pos.y) ** 2
    );
    const isLongShot = dist > GOAL_AREA_THRESHOLD;

    // Pick relevant attribute: close range → finishing, long range → longShots
    const skillAttr = isLongShot
        ? ((player.attributes.longShots ?? 50) + (player.attributes.finishing ?? 50)) / 2
        : (player.attributes.finishing ?? 50);
    const skill = skillAttr / 100;

    // Pressure
    const nearbyDefenders = ctx.spatialHash
        .queryRadius(player.pos, 30)
        .filter(p => p.team !== player.team).length;
    const pressurePenalty = nearbyDefenders * BALANCE.SHOT_ERROR_PRESSURE_FACTOR;

    // Fatigue
    const fatiguePenalty = (player.fatigue ?? 0) * BALANCE.SHOT_ERROR_FATIGUE_FACTOR;

    // Long shots get a bigger error window
    const distanceFactor = isLongShot ? BALANCE.SHOT_ERROR_LONG_SHOT_FACTOR : 1.0;

    const rawInaccuracy = (1 - skill) + pressurePenalty + fatiguePenalty;
    const inaccuracy = Math.min(rawInaccuracy, 1);

    const maxError = BALANCE.SHOT_ERROR_MAX_RADIUS * inaccuracy * distanceFactor;

    if (maxError < 0.5) return { x: 0, y: 0 };

    // Bell-curve-like random via average of two samples
    const angle = rng.next() * Math.PI * 2;
    const magnitude = ((rng.next() + rng.next()) / 2) * maxError;

    return {
        x: Math.cos(angle) * magnitude,
        y: Math.sin(angle) * magnitude,
    };
}

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
        const intendedTarget = decision.target!;

        // ── 4.4 Error Model ──────────────────────────────────────────────────
        const errorVec = computeShotError(player, intendedTarget, ctx);
        const actualTarget: Vec2 = {
            x: intendedTarget.x + errorVec.x,
            y: intendedTarget.y + errorVec.y,
        };

        const errorMag = Math.sqrt(errorVec.x ** 2 + errorVec.y ** 2);
        const isTame   = errorMag > BALANCE.SHOT_ERROR_TAME_THRESHOLD;   // straight at keeper
        const isWild   = errorMag > BALANCE.SHOT_ERROR_WILD_THRESHOLD;   // likely off-target

        const commands: Command[] = [];

        // 1. Kick ball toward (possibly erroneous) target
        commands.push({
            type: "KICK_BALL",
            playerId: player.id,
            targetPos: actualTarget,
            force: force
        } as KickBallCommand);

        // 2. Clear decision and set cooldown
        commands.push({
            type: "SET_PLAYER_DECISION",
            playerId: player.id,
            decision: null,
            cooldown: 20
        } as SetPlayerDecisionCommand);

        // 3. Emit event with quality-aware description
        const rhythmMods = (ctx.tactical as any)?.rhythmModifiers;
        const scoreDiff = player.team === "home"
            ? ctx.homeTeam.score - ctx.awayTeam.score
            : ctx.awayTeam.score - ctx.homeTeam.score;
        const shotDescription = commentaryShot({
            minute: state.minute,
            xg: decision.xG,
            playerName: player.name,
            isOnTarget: !isWild,
            scoreDiff,
            rhythmState: player.team === "home"
                ? rhythmMods?.home?.state
                : rhythmMods?.away?.state,
        });

        ctx.events.emit({
            id: mkEventId(),
            type: "shot",
            minute: state.minute,
            second: state.second,
            teamId: player.team,
            playerId: player.id,
            playerName: player.name,
            description: shotDescription,
            pos: { ...player.pos },
            xg: decision.xG
        });

        // 4. Update stats
        const tStats = player.team === "home" ? state.stats.home : state.stats.away;
        tStats.shots++;
        tStats.xg += decision.xG || 0;

        // ── C.1 PlayerMatchStats ──────────────────────────────────────────────
        const pStats = ctx.playerStats?.get(player.id);
        if (pStats) {
            pStats.shots++;
            pStats.xG += decision.xG ?? 0;
            // Shot on target: ball headed towards goal (not wild)
            if (!isWild) pStats.shotsOnTarget++;
        }
        // xA for the last passer: who passed to this shooter?
        const lastPasserId = ctx.ball.lastTouchedBy;
        if (lastPasserId && lastPasserId !== player.id) {
            const passerStats = ctx.playerStats?.get(lastPasserId);
            if (passerStats) {
                passerStats.chancesCreated++;
                const shotXG = decision.xG ?? 0;
                if (shotXG >= 0.1) passerStats.keyPasses++;
                passerStats.xA += shotXG;
            }
        }

        return commands;
    }
}