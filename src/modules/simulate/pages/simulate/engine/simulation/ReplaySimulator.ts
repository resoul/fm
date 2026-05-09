import { BaseSimulator } from "./BaseSimulator";
import { SimulationWorld } from "../core/SimulationWorld";
import { StateSnapshot } from "../replayManager";

export class ReplaySimulator extends BaseSimulator {
    private snapshots: StateSnapshot[] = [];
    private currentTick: number = 0;

    constructor(world: SimulationWorld, snapshots: StateSnapshot[]) {
        super(world);
        this.snapshots = snapshots;
        this.currentTick = snapshots[0]?.tick || 0;
    }

    step(): void {
        const snapshot = this.getSnapshotForTick(this.currentTick);
        if (!snapshot) {
            this.runner.pause();
            return;
        }

        this.applySnapshot(snapshot);
        this.currentTick++;
        this.world.state.tick = this.currentTick;
    }

    private getSnapshotForTick(tick: number): StateSnapshot | undefined {
        // Find exact or closest previous snapshot
        // (Simple implementation for now)
        return this.snapshots.find(s => s.tick === tick);
    }

    private applySnapshot(snapshot: StateSnapshot): void {
        const world = this.world;

        // Apply ball
        world.ball.pos = { ...snapshot.ball.pos };
        world.ball.height = snapshot.ball.height;

        // Apply players
        snapshot.homePlayers.forEach(ps => {
            const p = world.homeTeam.players.find(p => p.id === ps.id);
            if (p) {
                p.pos = { ...ps.pos };
                p.state = ps.state;
            }
        });

        snapshot.awayPlayers.forEach(ps => {
            const p = world.awayTeam.players.find(p => p.id === ps.id);
            if (p) {
                p.pos = { ...ps.pos };
                p.state = ps.state;
            }
        });
    }

    setTick(tick: number) {
        this.currentTick = tick;
    }
}
