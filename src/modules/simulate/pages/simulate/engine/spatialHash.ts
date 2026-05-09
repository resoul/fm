import type { Vec2 } from "./types";

export interface SpatialEntity {
    id: string;
    pos: Vec2;
}

/**
 * Simple Spatial Hash for 2D proximity queries.
 * Divides the field into a grid for O(1) cell lookups.
 */
export class SpatialHash<T extends SpatialEntity> {
    private grid: Map<string, T[]> = new Map();
    private cellSize: number;

    constructor(cellSize: number = 40) {
        this.cellSize = cellSize;
    }

    private getKey(pos: Vec2): string {
        const gx = Math.floor(pos.x / this.cellSize);
        const gy = Math.floor(pos.y / this.cellSize);
        return `${gx},${gy}`;
    }

    clear(): void {
        this.grid.clear();
    }

    insert(entity: T): void {
        const key = this.getKey(entity.pos);
        if (!this.grid.has(key)) {
            this.grid.set(key, []);
        }
        this.grid.get(key)!.push(entity);
    }

    queryRadius(pos: Vec2, radius: number): T[] {
        const results: T[] = [];
        const startX = Math.floor((pos.x - radius) / this.cellSize);
        const endX = Math.floor((pos.x + radius) / this.cellSize);
        const startY = Math.floor((pos.y - radius) / this.cellSize);
        const endY = Math.floor((pos.y + radius) / this.cellSize);

        const r2 = radius * radius;

        for (let x = startX; x <= endX; x++) {
            for (let y = startY; y <= endY; y++) {
                const key = `${x},${y}`;
                const entities = this.grid.get(key);
                if (entities) {
                    for (const e of entities) {
                        const dx = e.pos.x - pos.x;
                        const dy = e.pos.y - pos.y;
                        if (dx * dx + dy * dy <= r2) {
                            results.push(e);
                        }
                    }
                }
            }
        }
        return results;
    }
}
