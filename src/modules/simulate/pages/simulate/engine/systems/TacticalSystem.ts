import type { SimulationContext } from "../context";
import type { SimulationSystem } from "../pipeline";
import { distVec } from "../physics";

export class TacticalSystem implements SimulationSystem {
    name = "TacticalSystem";

    private readonly GRID_COLS = 10;
    private readonly GRID_ROWS = 7;

    update(ctx: SimulationContext): void {
        // Initialize tactical data if it doesn't exist (should be done in MatchEngine though)
        if (!ctx.tactical) {
            ctx.tactical = {
                homeCentroid: { x: 0, y: 0 },
                awayCentroid: { x: 0, y: 0 },
                homeCompactness: 0,
                awayCompactness: 0,
                influenceMap: Array(this.GRID_COLS).fill(0).map(() => Array(this.GRID_ROWS).fill(0))
            };
        }

        this.calculateCentroids(ctx);
        this.calculateInfluenceMap(ctx);
    }

    private calculateCentroids(ctx: SimulationContext): void {
        const calculate = (players: any[]) => {
            const sum = players.reduce((acc, p) => ({ x: acc.x + p.pos.x, y: acc.y + p.pos.y }), { x: 0, y: 0 });
            const centroid = { x: sum.x / players.length, y: sum.y / players.length };
            
            // Compactness = average distance from centroid
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

    private calculateInfluenceMap(ctx: SimulationContext): void {
        const { width, height } = ctx.config.fieldDimensions;
        const colStep = width / this.GRID_COLS;
        const rowStep = height / this.GRID_ROWS;

        for (let x = 0; x < this.GRID_COLS; x++) {
            for (let y = 0; y < this.GRID_ROWS; y++) {
                const cellCenter = {
                    x: (x + 0.5) * colStep,
                    y: (y + 0.5) * rowStep
                };

                let influence = 0;

                // Simple influence: sum of 1/dist^2 for each team
                // Home team
                for (const p of ctx.homeTeam.players) {
                    const d = distVec(p.pos, cellCenter);
                    influence += 1000 / (d * d + 400);
                }
                // Away team
                for (const p of ctx.awayTeam.players) {
                    const d = distVec(p.pos, cellCenter);
                    influence -= 1000 / (d * d + 400);
                }

                ctx.tactical.influenceMap[x][y] = influence;
            }
        }
    }
}
