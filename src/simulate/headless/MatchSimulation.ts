import { MatchEngine } from "../matchEngine";
import type {
    MatchSimulationConfig,
    MatchSimulationSnapshot,
    MatchSimulationState,
    SimulationEvent,
    SimulationMode,
    Team,
} from "../types";

export interface MatchSimulationOptions {
    homeTeam: Team;
    awayTeam: Team;
    config?: MatchSimulationConfig;
    mode?: Exclude<SimulationMode, "replay">;
}

export class MatchSimulation {
    private readonly engine: MatchEngine;

    constructor(options: MatchSimulationOptions) {
        this.engine = new MatchEngine(options.homeTeam, options.awayTeam, options.config);
        if (options.mode) {
            this.engine.setMode(options.mode);
        }
    }

    start(): void {
        this.engine.start();
    }

    pause(): void {
        this.engine.pause();
    }

    tick(): void {
        this.engine.tick();
    }

    setMode(mode: Exclude<SimulationMode, "replay">): void {
        this.engine.setMode(mode);
    }

    getState(): MatchSimulationState {
        return this.engine.getState();
    }

    getEvents(): SimulationEvent[] {
        return this.engine.getEvents();
    }

    getAuthoritativeEvents(): SimulationEvent[] {
        return this.engine.getAuthoritativeEvents();
    }

    getSnapshot(): MatchSimulationSnapshot {
        return this.engine.getSnapshot();
    }

    restoreSnapshot(snapshot: MatchSimulationSnapshot): void {
        this.engine.restoreSnapshot(snapshot);
    }

    reset(): void {
        this.engine.reset();
    }
}
