import { SpaceAwareness } from "../ai/SpaceAwareness";
import { ChainTracker } from "../ai/PossessionChain";
import { TeamShape } from "../ai/TeamShape";
import type { SimulationContext } from "../context";
import type { SimulationSystem } from "../pipeline";
import { distVec } from "../physics";
import type { Command } from "../core/Command";
import type { Player, TeamSide, TeamTacticalPhase, TeamTacticalState, Vec2 } from "../types";

// How many ticks counts as "immediate transition" (≈1 second at 60fps)
const TRANSITION_WINDOW = 150;

export class TacticalSystem implements SimulationSystem {
    name = "TacticalSystem";

    private readonly GRID_COLS = 10;
    private readonly GRID_ROWS = 7;

    // Track possession changes across ticks
    private _lastPossessionTeam: TeamSide | null = null;
    private _ticksSinceChange = 0;

    // 4.1 Possession chain trackers
    private _homeChain = new ChainTracker();
    private _awayChain = new ChainTracker();

    // Last owner id to detect pass completion
    private _lastBallOwner: string | null = null;

    update(ctx: SimulationContext): Command[] {
        if (!ctx.tactical || !ctx.tactical.influenceMap) {
            ctx.tactical = {
                homeCentroid: { x: 0, y: 0 },
                awayCentroid: { x: 0, y: 0 },
                homeCompactness: 0,
                awayCompactness: 0,
                influenceMap: Array(this.GRID_COLS).fill(0).map(() => Array(this.GRID_ROWS).fill(0)),
                pressureMap: Array(this.GRID_COLS).fill(0).map(() => Array(this.GRID_ROWS).fill(0)),
                passingLanes: [],
                homeState: makeDefaultTacticalState(ctx, "home"),
                awayState: makeDefaultTacticalState(ctx, "away"),
                homeDefensiveLine: 0,
                awayDefensiveLine: ctx.config.fieldDimensions.width,
            };
        }

        this.calculateCentroids(ctx);
        this.calculateOffsideLines(ctx);
        this.calculateInfluenceAndPressure(ctx);
        this.calculatePassingLanes(ctx);
        this.updateTacticalStates(ctx);
        // 2.2 Space Awareness
        ctx.tactical.spaceAwareness = SpaceAwareness.compute(ctx);
        // 4.1 Possession chains + 2.3 Team shape
        this.updateChainsAndShape(ctx);

        return [];
    }

    // ── Tactical State ────────────────────────────────────

    private updateTacticalStates(ctx: SimulationContext): void {
        const possessingTeam = ctx.ball.ownerPlayerId
            ? ([...ctx.homeTeam.players, ...ctx.awayTeam.players]
                .find(p => p.id === ctx.ball.ownerPlayerId)?.team ?? null)
            : null;

        // Detect possession change this tick
        const changed = possessingTeam !== null && possessingTeam !== this._lastPossessionTeam;
        if (changed) {
            this._ticksSinceChange = 0;
            this._lastPossessionTeam = possessingTeam;
        } else {
            this._ticksSinceChange = Math.min(this._ticksSinceChange + 1, 9999);
        }

        const isSetPiece = ctx.state.phase !== "playing" && ctx.state.phase !== "kickoff";

        ctx.tactical.homeState = this.buildState(ctx, "home", possessingTeam);
        ctx.tactical.awayState = this.buildState(ctx, "away", possessingTeam);
    }

    private buildState(
        ctx: SimulationContext,
        side: TeamSide,
        possessingTeam: TeamSide | null,
    ): TeamTacticalState {
        const { width, height } = ctx.config.fieldDimensions;
        const isHome = side === "home";
        const team = isHome ? ctx.homeTeam : ctx.awayTeam;
        const outfield = team.players.filter(p => p.position !== "GK");

        const centroid = isHome ? ctx.tactical.homeCentroid : ctx.tactical.awayCentroid;

        // Defensive line: home attacks right → low X = own half; away attacks left → high X = own half
        const defensiveLineX = isHome
            ? centroid.x / width           // 0 = deepest own half, 1 = opponent half
            : 1 - centroid.x / width;

        // Team width: spread of outfield players on Y axis
        const ys = outfield.map(p => p.pos.y);
        const teamWidth = ys.length > 1
            ? (Math.max(...ys) - Math.min(...ys)) / height
            : 0;

        // Pressure the team is under: nearby opponents near ball owner
        let pressureIntensity = 0;
        if (ctx.ball.ownerPlayerId) {
            const owner = team.players.find(p => p.id === ctx.ball.ownerPlayerId);
            if (owner) {
                const nearbyOpps = ctx.spatialHash
                    .queryRadius(owner.pos, 50)
                    .filter(p => p.team !== side);
                pressureIntensity = Math.min(1, nearbyOpps.length / 3);
            }
        } else {
            // If no one has the ball — use compactness of opponents near ball
            const ballPos = ctx.ball.pos;
            const nearbyOpps = ctx.spatialHash
                .queryRadius(ballPos, 60)
                .filter(p => p.team !== side);
            pressureIntensity = Math.min(1, nearbyOpps.length / 4);
        }

        const DEAD_PHASES = new Set(["throwin", "goalkick", "corner", "freekick", "goal", "halftime", "fulltime", "offside"]);
        const isDeadBall = DEAD_PHASES.has(ctx.state.phase);
        let phase: TeamTacticalPhase;

        if (isDeadBall) {
            phase = "set_piece";
        } else if (possessingTeam === null) {
            // Ball is loose — keep previous phase or default
            const prev = isHome ? ctx.tactical.homeState : ctx.tactical.awayState;
            phase = prev?.phase ?? "out_of_possession";
        } else if (possessingTeam === side) {
            // This team has the ball
            if (this._ticksSinceChange <= TRANSITION_WINDOW && this._lastPossessionTeam === side) {
                // Just won it — transition attack
                phase = "transition_attack";
            } else {
                phase = "in_possession";
            }
        } else {
            // Opponent has the ball
            if (this._ticksSinceChange <= TRANSITION_WINDOW && this._lastPossessionTeam !== side) {
                // Just lost it — sprint back
                phase = "transition_defend";
            } else {
                phase = "out_of_possession";
            }
        }

        return {
            phase,
            matchPhase: ctx.state.phase,
            ticksSincePossessionChange: this._ticksSinceChange,
            defensiveLineX,
            teamWidth,
            pressureIntensity,
        };
    }

    // ── Existing calculations ─────────────────────────────

    private calculateCentroids(ctx: SimulationContext): void {
        const calculate = (players: Player[]) => {
            const sum = players.reduce(
                (acc, p) => ({ x: acc.x + p.pos.x, y: acc.y + p.pos.y }),
                { x: 0, y: 0 },
            );
            const centroid = { x: sum.x / players.length, y: sum.y / players.length };
            const avgDist =
                players.reduce((acc, p) => acc + distVec(p.pos, centroid), 0) / players.length;
            return { centroid, compactness: avgDist };
        };

        const home = calculate(ctx.homeTeam.players);
        const away = calculate(ctx.awayTeam.players);

        ctx.tactical.homeCentroid = home.centroid;
        ctx.tactical.homeCompactness = home.compactness;
        ctx.tactical.awayCentroid = away.centroid;
        ctx.tactical.awayCompactness = away.compactness;
    }

    private calculateOffsideLines(ctx: SimulationContext): void {
        const { width } = ctx.config.fieldDimensions;
        const halfW = width / 2;

        const getLine = (players: Player[], attackDir: 1 | -1): number => {
            // Sort players by proximity to their own goal
            // Home goal is at 0, Away goal is at width
            const sorted = [...players].sort((a, b) => {
                return attackDir === 1 
                    ? b.pos.x - a.pos.x // Away team: b.x - a.x (closest to width first)
                    : a.pos.x - b.pos.x // Home team: a.x - b.x (closest to 0 first)
            });

            // Offside line is the second player from the goal
            const secondDefender = sorted[1] ?? sorted[0];
            const lineX = secondDefender.pos.x;

            // Offside only exists in the opponent's half
            return attackDir === 1 
                ? Math.max(halfW, lineX) 
                : Math.min(halfW, lineX);
        };

        // homeDefensiveLine is the line for Home attackers (determined by Away defenders)
        ctx.tactical.homeDefensiveLine = getLine(ctx.awayTeam.players, 1);
        // awayDefensiveLine is the line for Away attackers (determined by Home defenders)
        ctx.tactical.awayDefensiveLine = getLine(ctx.homeTeam.players, -1);
    }

    private calculateInfluenceAndPressure(ctx: SimulationContext): void {
        const { width, height } = ctx.config.fieldDimensions;
        const colStep = width / this.GRID_COLS;
        const rowStep = height / this.GRID_ROWS;

        for (let x = 0; x < this.GRID_COLS; x++) {
            for (let y = 0; y < this.GRID_ROWS; y++) {
                const cellCenter = { x: (x + 0.5) * colStep, y: (y + 0.5) * rowStep };
                let influence = 0;
                let pressure = 0;

                for (const p of ctx.homeTeam.players) {
                    const d = distVec(p.pos, cellCenter);
                    const infl = 1000 / (d * d + 400);
                    influence += infl;
                    pressure += infl;
                }
                for (const p of ctx.awayTeam.players) {
                    const d = distVec(p.pos, cellCenter);
                    const infl = 1000 / (d * d + 400);
                    influence -= infl;
                    pressure += infl;
                }

                ctx.tactical.influenceMap[x][y] = influence;
                ctx.tactical.pressureMap[x][y] = pressure;
            }
        }
    }

    private calculatePassingLanes(ctx: SimulationContext): void {
        const ownerId = ctx.ball.ownerPlayerId;
        if (!ownerId) {
            ctx.tactical.passingLanes = [];
            return;
        }

        const owner = [...ctx.homeTeam.players, ...ctx.awayTeam.players].find(
            p => p.id === ownerId,
        );
        if (!owner) return;

        const teammates =
            owner.team === "home" ? ctx.homeTeam.players : ctx.awayTeam.players;
        const opponents =
            owner.team === "home" ? ctx.awayTeam.players : ctx.homeTeam.players;

        const lanes: { from: string; to: string; open: boolean }[] = [];

        for (const tm of teammates) {
            if (tm.id === owner.id) continue;

            let open = true;
            for (const opp of opponents) {
                const d = this.distToSegment(opp.pos, owner.pos, tm.pos);
                if (d < 15) {
                    open = false;
                    break;
                }
            }
            lanes.push({ from: owner.id, to: tm.id, open });
        }

        ctx.tactical.passingLanes = lanes;
    }

    private distToSegment(p: Vec2, v: Vec2, w: Vec2): number {
        const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
        if (l2 === 0) return distVec(p, v);
        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        return distVec(p, {
            x: v.x + t * (w.x - v.x),
            y: v.y + t * (w.y - v.y),
        });
    }

    // ── 4.1 Chains + 2.3 Shape ────────────────────────────

    private updateChainsAndShape(ctx: SimulationContext): void {
        const { width, height } = ctx.config.fieldDimensions;
        const allPlayers = [...ctx.homeTeam.players, ...ctx.awayTeam.players];

        const ballOwner = ctx.ball.ownerPlayerId
            ? allPlayers.find(p => p.id === ctx.ball.ownerPlayerId) ?? null
            : null;

        // Detect pass completion: owner changed to a teammate this tick
        const passCompleted = (
            ballOwner !== null &&
            this._lastBallOwner !== null &&
            ballOwner.id !== this._lastBallOwner &&
            ballOwner.team === (allPlayers.find(p => p.id === this._lastBallOwner)?.team ?? null)
        );

        const possessionLost = (
            this._lastBallOwner !== null &&
            ballOwner !== null &&
            ballOwner.team !== (allPlayers.find(p => p.id === this._lastBallOwner)?.team ?? ballOwner.team)
        );

        // Update chain trackers
        ctx.tactical.homeChain = this._homeChain.update(
            "home", ctx.ball.pos, ballOwner,
            passCompleted && ballOwner?.team === "home",
            possessionLost && (allPlayers.find(p => p.id === this._lastBallOwner)?.team === "home"),
            width,
        );
        ctx.tactical.awayChain = this._awayChain.update(
            "away", ctx.ball.pos, ballOwner,
            passCompleted && ballOwner?.team === "away",
            possessionLost && (allPlayers.find(p => p.id === this._lastBallOwner)?.team === "away"),
            width,
        );

        this._lastBallOwner = ballOwner?.id ?? this._lastBallOwner;

        // Compute dynamic shape targets (2.3)
        const homeAvgFatigue = avgFatigue(ctx.homeTeam.players);
        const awayAvgFatigue = avgFatigue(ctx.awayTeam.players);

        ctx.tactical.homeShapeTargets = TeamShape.computeTargets(
            ctx.homeTeam,
            ctx.ball.pos,
            ctx.tactical.homeState,
            ctx.tactical.homeChain ?? null,
            width, height,
            {
                goalDiff: ctx.homeTeam.score - ctx.awayTeam.score,
                avgFatigue: homeAvgFatigue,
                ticksSincePossessionChange: ctx.tactical.homeState.ticksSincePossessionChange,
            },
        );
        ctx.tactical.awayShapeTargets = TeamShape.computeTargets(
            ctx.awayTeam,
            ctx.ball.pos,
            ctx.tactical.awayState,
            ctx.tactical.awayChain ?? null,
            width, height,
            {
                goalDiff: ctx.awayTeam.score - ctx.homeTeam.score,
                avgFatigue: awayAvgFatigue,
                ticksSincePossessionChange: ctx.tactical.awayState.ticksSincePossessionChange,
            },
        );
    }
}

// ── Helpers ───────────────────────────────────────────────

function makeDefaultTacticalState(ctx: SimulationContext, side: TeamSide): TeamTacticalState {
    return {
        phase: "out_of_possession",
        matchPhase: ctx.state.phase,
        ticksSincePossessionChange: 9999,
        defensiveLineX: side === "home"
            ? (ctx.tactical?.homeCentroid?.x ?? 0) / ctx.config.fieldDimensions.width
            : 1 - ((ctx.tactical?.awayCentroid?.x ?? 0) / ctx.config.fieldDimensions.width),
        teamWidth: 0.6,
        pressureIntensity: 0,
    };
}
function avgFatigue(players: import("../types").Player[]): number {
    const outfield = players.filter(p => p.position !== "GK");
    if (outfield.length === 0) return 0;
    return outfield.reduce((sum, p) => sum + p.fatigue, 0) / outfield.length;
}