import type { SimulationContext } from "../context";
import type { SimulationSystem } from "../pipeline";
import { addVec, distVec, normVec, scaleVec, subVec } from "../physics";
import { BALANCE } from "../balance";
import type { Command, SetPlayerDecisionCommand, UpdateBallCommand, UpdateMatchStateCommand } from "../core/Command";
import type { Player, PlayerCard, Vec2 } from "../types";

let eventCounter = 5000;
function mkEventId() { return `evt_${++eventCounter}`; }

// After a successful tackle the tackler needs recovery time before acting again.
// At 60 fps: 120 ticks = 2 s, 180 ticks = 3 s.
const TACKLE_SUCCESS_COOLDOWN = 150; // ~2.5 s — long enough to prevent repeat spam
const TACKLE_FAIL_COOLDOWN    = BALANCE.TACKLE_COOLDOWN; // already 50 ticks

/** Check if a position is inside either penalty area */
function isInPenaltyArea(pos: Vec2, ctx: SimulationContext, attackingTeam: "home" | "away"): boolean {
    const { width, height, penaltyAreaWidth, penaltyAreaHeight } = ctx.config.fieldDimensions;
    const halfGoalAreaH = penaltyAreaHeight / 2;
    const centerY = height / 2;
    const inY = pos.y > centerY - halfGoalAreaH && pos.y < centerY + halfGoalAreaH;

    if (attackingTeam === "away") {
        // Away attacks toward x=0 (home goal)
        return pos.x < penaltyAreaWidth && inY;
    } else {
        // Home attacks toward x=width (away goal)
        return pos.x > width - penaltyAreaWidth && inY;
    }
}

export class TackleSystem implements SimulationSystem {
    name = "TackleSystem";

    update(ctx: SimulationContext): Command[] {
        const { homeTeam, awayTeam, ball } = ctx;

        const DEAD_PHASES = new Set(["throwin", "goalkick", "corner", "freekick", "goal", "halftime", "fulltime"]);
        if (DEAD_PHASES.has(ctx.state.phase)) return [];

        if (!ball.ownerPlayerId) return [];

        const allPlayers = [...homeTeam.players, ...awayTeam.players];
        const owner = allPlayers.find(p => p.id === ball.ownerPlayerId);
        if (!owner) return [];

        const opponents = owner.team === "home" ? awayTeam.players : homeTeam.players;

        for (const opp of opponents) {
            // Skip expelled players
            if (opp.isExpelled) continue;

            if (
                distVec(opp.pos, owner.pos) < BALANCE.TACKLE_RANGE + 8 &&
                opp.kickCooldown === 0 &&
                opp.actionCooldown === 0
            ) {
                return this.executeTackle(opp, owner, ctx);
            }
        }

        return [];
    }

    private executeTackle(tackler: Player, owner: Player, ctx: SimulationContext): Command[] {
        const { rng, state } = ctx;
        const commands: Command[] = [];

        const tackleSkill  = (tackler.attributes.tackling * 0.7 + tackler.attributes.strength  * 0.3) / 100;
        const retainSkill  = (owner.attributes.strength  * 0.6 + owner.attributes.balance      * 0.4) / 100;
        const successProb  = Math.max(0.05, Math.min(0.85, 0.4 + (tackleSkill - retainSkill) * 0.4));

        if (rng.next() < successProb) {
            // ── Successful tackle ──────────────────────────
            const awayFromOwner  = normVec(subVec(tackler.pos, owner.pos));
            const looseDirection = normVec({
                x: awayFromOwner.x + rng.nextFloat(-0.45, 0.45),
                y: awayFromOwner.y + rng.nextFloat(-0.45, 0.45),
            });

            // A.1: strength → loose ball force
            const looseForce = 1.5 + (tackler.attributes.strength / 100) * 2.5;

            commands.push({
                type: "UPDATE_BALL",
                pos: addVec(tackler.pos, scaleVec(looseDirection, 10)),
                vel: scaleVec(looseDirection, looseForce),
                height: 0,
                heightVel: 0,
                ownerPlayerId:   null,
                lastTouchedBy:   tackler.id,
                lastTouchedTeam: tackler.team,
            } as UpdateBallCommand);

            commands.push({
                type: "SET_PLAYER_DECISION",
                playerId: tackler.id,
                decision: null,
                cooldown: TACKLE_SUCCESS_COOLDOWN,
            } as SetPlayerDecisionCommand);

            commands.push({
                type: "SET_PLAYER_DECISION",
                playerId: owner.id,
                decision: null,
                cooldown: 40,
            } as SetPlayerDecisionCommand);

            ctx.events.emit({
                id: mkEventId(),
                type: "tackle",
                minute: state.minute,
                second: state.second,
                teamId:     tackler.team,
                playerId:   tackler.id,
                playerName: tackler.name,
                description: `${tackler.name} wins the ball with a tackle!`,
                pos: { ...tackler.pos },
            });

            const tStats = ctx.playerStats?.get(tackler.id);
            if (tStats) { tStats.tacklesWon++; tStats.duelsWon++; }
            const oStats = ctx.playerStats?.get(owner.id);
            if (oStats) oStats.duelsLost++;

        } else {
            // ── Failed tackle ──────────────────────────────
            commands.push({
                type: "SET_PLAYER_DECISION",
                playerId: tackler.id,
                decision: null,
                cooldown: TACKLE_FAIL_COOLDOWN,
            } as SetPlayerDecisionCommand);

            const tStatsFail = ctx.playerStats?.get(tackler.id);
            if (tStatsFail) tStatsFail.duelsLost++;
            const oStatsFail = ctx.playerStats?.get(owner.id);
            if (oStatsFail) oStatsFail.duelsWon++;

            // D.1: Foul detection on failed tackle
            // Only in "playing" phase — never on dead ball
            if (state.phase !== "playing") return commands;

            const aggression  = tackler.attributes.aggression / 100;
            const tackleSkillN = tackler.attributes.tackling / 100;
            // dirtiness from hidden attributes if available (via person)
            const dirtiness = (tackler as any).person?.hidden?.dirtiness ?? 50;
            const dirtinessN = dirtiness / 100;

            const foulProb = 0.15 + aggression * 0.25 - tackleSkillN * 0.2 + dirtinessN * 0.15;

            if (rng.next() < foulProb) {
                commands.push(...this.handleFoul(tackler, owner, ctx, dirtiness));
            }
        }

        return commands;
    }

    private handleFoul(
        tackler: Player,
        owner: Player,
        ctx: SimulationContext,
        dirtiness: number,
    ): Command[] {
        const { state } = ctx;
        const commands: Command[] = [];

        // Increment team fouls
        const tacklerTeamStats = tackler.team === "home"
            ? ctx.homeTeam.stats
            : ctx.awayTeam.stats;
        tacklerTeamStats.fouls++;

        // D.2: Penalty area check — foul inside box → penalty
        const inBox = isInPenaltyArea(owner.pos, ctx, owner.team);
        const restartPos = inBox
            ? this.penaltySpot(ctx, owner.team)
            : { ...owner.pos };

        ctx.events.emit({
            id: mkEventId(),
            type: inBox ? "penalty" : "foul",
            minute: state.minute,
            second: state.second,
            teamId:     tackler.team,
            playerId:   tackler.id,
            playerName: tackler.name,
            description: inBox
                ? `PENALTY! ${tackler.name} fouls ${owner.name} in the box!`
                : `Foul by ${tackler.name} on ${owner.name}.`,
            pos: { ...owner.pos },
        });

        commands.push(
            {
                type: "UPDATE_MATCH_STATE",
                phase: "freekick",
                isPenalty: inBox,
            } as UpdateMatchStateCommand,
            {
                type: "UPDATE_BALL",
                pos: restartPos,
                vel: { x: 0, y: 0 },
                height: 0,
                heightVel: 0,
                ownerPlayerId: owner.id,
                lastTouchedBy: owner.id,
                lastTouchedTeam: owner.team,
            } as UpdateBallCommand,
        );

        // D.3: Card system
        commands.push(...this.checkCard(tackler, owner, ctx, dirtiness, inBox));

        return commands;
    }

    private penaltySpot(ctx: SimulationContext, attackingTeam: "home" | "away"): { x: number; y: number } {
        const { width, height, penaltyAreaWidth } = ctx.config.fieldDimensions;
        const centerY = height / 2;
        // Penalty spot is typically ~11m from goal line; we approximate as 80% into penalty area
        if (attackingTeam === "away") {
            return { x: penaltyAreaWidth * 0.8, y: centerY };
        } else {
            return { x: width - penaltyAreaWidth * 0.8, y: centerY };
        }
    }

    private checkCard(
        tackler: Player,
        _owner: Player,
        ctx: SimulationContext,
        dirtiness: number,
        inDangerousZone: boolean,
    ): Command[] {
        const { state, rng } = ctx;
        const commands: Command[] = [];

        const aggression = tackler.attributes.aggression / 100;
        const dirtinessN = dirtiness / 100;

        // Yellow card probability
        const yellowProb = 0.12 + aggression * 0.2 + dirtinessN * 0.15
            + (inDangerousZone ? 0.1 : 0);

        // Direct red probability (brutal foul)
        const directRedProb = 0.03 + dirtinessN * 0.08;

        let cardType: "yellow" | "red" | null = null;

        if (rng.next() < directRedProb) {
            cardType = "red";
        } else if (rng.next() < yellowProb) {
            // Check for second yellow → automatic red
            const existingYellows = (state.cards ?? []).filter(
                c => c.playerId === tackler.id && c.type === "yellow"
            ).length;
            cardType = existingYellows >= 1 ? "red" : "yellow";
        }

        if (!cardType) return commands;

        const card: PlayerCard = {
            playerId: tackler.id,
            playerName: tackler.name,
            type: cardType,
            minute: state.minute,
            reason: inDangerousZone ? "Dangerous foul in box" : "Foul",
        };

        // Push card to match state
        state.cards = [...(state.cards ?? []), card];

        ctx.events.emit({
            id: mkEventId(),
            type: cardType === "red" ? "red_card" : "yellow_card",
            minute: state.minute,
            second: state.second,
            teamId: tackler.team,
            playerId: tackler.id,
            playerName: tackler.name,
            description: cardType === "red"
                ? `RED CARD — ${tackler.name} is sent off!`
                : `Yellow card for ${tackler.name}.`,
            pos: { ...tackler.pos },
        });

        // Update player stats
        const stats = ctx.playerStats?.get(tackler.id);
        if (stats) {
            if (cardType === "yellow") stats.yellowCards++;
            else stats.redCards++;
        }

        // D.4: Mark expelled player on red card
        if (cardType === "red") {
            tackler.isExpelled = true;
            tackler.hasBall = false;
            tackler.nextDecision = null;
            tackler.intent = null;
        }

        return commands;
    }
}