import type { SimulationContext } from "../context";
import type { SimulationSystem } from "../pipeline";
import { UtilityAI } from "../ai";
import { BALANCE } from "../balance";
import type { Command } from "../core/Command";
import { distVec } from "../physics";
import type { AIDecision, Ball, Player, Team } from "../types";

/**
 * DecisionSystem handles high-level AI reasoning.
 * It determines WHAT a player wants to do and returns commands.
 */
export class DecisionSystem implements SimulationSystem {
    name = "DecisionSystem";

    update(ctx: SimulationContext): Command[] {
        const { homeTeam, awayTeam } = ctx;
        const allPlayers = [...homeTeam.players, ...awayTeam.players];
        const commands: Command[] = [];

        for (const player of allPlayers) {
            // 1. Manage cooldowns
            if (player.actionCooldown > 0) {
                player.actionCooldown--;
                continue;
            }

            // 2. Goalkeepers have specialized logic
            if (player.position === "GK") continue;

            // 3. Make a decision
            const decision = player.hasBall
                ? UtilityAI.getBestDecision(player, ctx)
                : this.getOffBallDecision(player, player.team === "home" ? homeTeam : awayTeam, ctx.ball, allPlayers);
            
            // 4. Create command
            commands.push({
                type: "SET_PLAYER_DECISION",
                playerId: player.id,
                decision: decision,
                cooldown: ctx.rng.nextInt(
                    BALANCE.ACTION_COOLDOWN_MIN, 
                    BALANCE.ACTION_COOLDOWN_MAX
                )
            });
        }
        
        return commands;
    }

    private getOffBallDecision(player: Player, team: Team, ball: Ball, allPlayers: Player[]): AIDecision | null {
        if (!ball.ownerPlayerId) {
            const chasers = allPlayers
                .filter(p => p.position !== "GK")
                .sort((a, b) => distVec(a.pos, ball.pos) - distVec(b.pos, ball.pos))
                .slice(0, 4);

            if (chasers.some(chaser => chaser.id === player.id)) {
                return {
                    type: "move",
                    target: { ...ball.pos },
                };
            }

            return {
                type: "reposition",
                target: {
                    x: (player.targetPos.x * 0.85) + (ball.pos.x * 0.15),
                    y: (player.targetPos.y * 0.85) + (ball.pos.y * 0.15),
                },
            };
        }

        const owner = allPlayers.find(p => p.id === ball.ownerPlayerId);
        if (!owner) return null;

        const teamHasBall = team.players.some(p => p.id === ball.ownerPlayerId);
        if (!teamHasBall) {
            const opponents = allPlayers.filter(p => p.team !== player.team && p.position !== "GK");
            const pressers = [...team.players]
                .filter(p => p.position !== "GK")
                .sort((a, b) => distVec(a.pos, owner.pos) - distVec(b.pos, owner.pos))
                .slice(0, 3);
            const pressIndex = pressers.findIndex(p => p.id === player.id);

            if (pressIndex >= 0) {
                const angle = (pressIndex - 1) * 0.65;
                const side = player.team === "home" ? -1 : 1;
                return {
                    type: "defend",
                    target: {
                        x: owner.pos.x + Math.cos(angle) * 18 * side,
                        y: owner.pos.y + Math.sin(angle) * 26,
                    },
                };
            }

            const markTarget = opponents
                .filter(p => p.id !== owner.id)
                .sort((a, b) => distVec(a.pos, player.pos) - distVec(b.pos, player.pos))[0];

            if (markTarget) {
                return {
                    type: "defend",
                    target: {
                        x: (player.targetPos.x + markTarget.pos.x) / 2,
                        y: (player.targetPos.y + markTarget.pos.y) / 2,
                    },
                };
            }
        }

        const xShift = teamHasBall
            ? (player.team === "home" ? 44 : -44)
            : (player.team === "home" ? -26 : 26);

        return {
            type: teamHasBall ? "move" : "defend",
            target: {
                x: player.targetPos.x + xShift,
                y: player.targetPos.y,
            },
        };
    }
}
