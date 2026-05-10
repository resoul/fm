import type { Player, Ball, PlayerState, Vec2 } from "./types";

export interface StateSnapshot {
    tick: number;
    ball: { pos: Vec2; height: number };
    homePlayers: { id: string; pos: Vec2; state: PlayerState }[];
    awayPlayers: { id: string; pos: Vec2; state: PlayerState }[];
}

/**
 * Replay Manager
 * Records and plays back match snapshots.
 */
export class ReplayManager {
    private snapshots: StateSnapshot[] = [];
    private maxSnapshots: number = 5000; // ~15 mins of match at 6hz

    record(tick: number, ball: Ball, home: Player[], away: Player[]): void {
        const snapshot: StateSnapshot = {
            tick,
            ball: { pos: { ...ball.pos }, height: ball.height },
            homePlayers: home.map(p => ({ id: p.id, pos: { ...p.pos }, state: p.state })),
            awayPlayers: away.map(p => ({ id: p.id, pos: { ...p.pos }, state: p.state })),
        };

        this.snapshots.push(snapshot);
        if (this.snapshots.length > this.maxSnapshots) {
            this.snapshots.shift();
        }
    }

    getSnapshotAt(tick: number): StateSnapshot | undefined {
        return this.snapshots.find(s => s.tick === tick) || this.snapshots[this.snapshots.length - 1];
    }

    getHistory(): StateSnapshot[] {
        return this.snapshots;
    }

    clear(): void {
        this.snapshots = [];
    }
}
