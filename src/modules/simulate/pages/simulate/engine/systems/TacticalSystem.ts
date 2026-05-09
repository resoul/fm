import type { SimulationContext } from "../context";
import type { SimulationSystem } from "../pipeline";
import { distVec } from "../physics";
import type { Command } from "../core/Command";
import type { Player, Vec2 } from "../types";

export class TacticalSystem implements SimulationSystem {
    name = "TacticalSystem";

    private readonly GRID_COLS = 10;
    private readonly GRID_ROWS = 7;

    update(ctx: SimulationContext): Command[] {
        if (!ctx.tactical || !ctx.tactical.influenceMap) {
            ctx.tactical = {
                homeCentroid: { x: 0, y: 0 },
                awayCentroid: { x: 0, y: 0 },
                homeCompactness: 0,
                awayCompactness: 0,
                influenceMap: Array(this.GRID_COLS).fill(0).map(() => Array(this.GRID_ROWS).fill(0)),
                pressureMap: Array(this.GRID_COLS).fill(0).map(() => Array(this.GRID_ROWS).fill(0)),
                passingLanes: []
            };
        }

        this.calculateCentroids(ctx);
        this.calculateInfluenceAndPressure(ctx);
        this.calculatePassingLanes(ctx);
        
        return [];
    }

    private calculateCentroids(ctx: SimulationContext): void {
        const calculate = (players: Player[]) => {
            const sum = players.reduce((acc, p) => ({ x: acc.x + p.pos.x, y: acc.y + p.pos.y }), { x: 0, y: 0 });
            const centroid = { x: sum.x / players.length, y: sum.y / players.length };
            const avgDist = players.reduce((acc, p) => acc + distVec(p.pos, centroid), 0) / players.length;
            return { centroid, compactness: avgDist };
        };

        const home = calculate(ctx.homeTeam.players);
        const away = calculate(ctx.awayTeam.players);

        ctx.tactical.homeCentroid = home.centroid;
        ctx.tactical.homeCompactness = home.compactness;
        ctx.tactical.awayCentroid = away.centroid;
        ctx.tactical.awayCompactness = away.compactness;
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

                // Home team
                for (const p of ctx.homeTeam.players) {
                    const d = distVec(p.pos, cellCenter);
                    const infl = 1000 / (d * d + 400);
                    influence += infl;
                    pressure += infl;
                }
                // Away team
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

        const owner = [...ctx.homeTeam.players, ...ctx.awayTeam.players].find(p => p.id === ownerId);
        if (!owner) return;

        const teammates = owner.team === "home" ? ctx.homeTeam.players : ctx.awayTeam.players;
        const opponents = owner.team === "home" ? ctx.awayTeam.players : ctx.homeTeam.players;
        
        const lanes: { from: string, to: string, open: boolean }[] = [];

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
            y: v.y + t * (w.y - v.y) 
        });
    }
}
