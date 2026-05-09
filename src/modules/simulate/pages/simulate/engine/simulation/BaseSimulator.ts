import { SimulationWorld } from "../core/SimulationWorld";
import { TickRunner } from "../core/TickRunner";
import { SimulationPipeline } from "../pipeline";
import type { SimulationContext } from "../context";
import { SpatialHash } from "../spatialHash";
import { SeededRandom } from "../seededRandom";
import { EventBus } from "../eventBus";
import type { Player, MatchEvent } from "../types";

export abstract class BaseSimulator {
    protected world: SimulationWorld;
    protected runner: TickRunner;
    protected pipeline: SimulationPipeline;
    protected spatialHash: SpatialHash<Player>;
    protected rng: SeededRandom;
    protected eventBus: EventBus;

    constructor(world: SimulationWorld) {
        this.world = world;
        this.runner = new TickRunner(() => this.step());
        this.pipeline = new SimulationPipeline();
        this.spatialHash = new SpatialHash<Player>(40);
        this.rng = new SeededRandom(world.config.seed);
        this.eventBus = new EventBus();
    }

    abstract step(): void;

    start() { this.runner.start(); }
    pause() { this.runner.pause(); }
    tick() { this.runner.tick(); }

    get isRunning() { return this.runner.isRunning; }
    get isPaused() { return this.runner.isPaused; }

    onEvent(cb: (event: MatchEvent) => void) {
        this.eventBus.on("all", cb);
    }

    offEvent(cb: (event: MatchEvent) => void) {
        this.eventBus.off("all", cb);
    }

    protected emit(event: MatchEvent) {
        this.world.eventStore.push(event);
        this.world.state.events = this.world.eventStore.getAll();
        this.eventBus.emit(event);
    }

    protected updateSpatialHash() {
        this.spatialHash.clear();
        [...this.world.homeTeam.players, ...this.world.awayTeam.players].forEach(p => 
            this.spatialHash.insert(p)
        );
    }

    protected createContext(): SimulationContext {
        if (!this.world.tacticalData) {
            this.world.tacticalData = {
                homeCentroid: { x: 0, y: 0 },
                awayCentroid: { x: 0, y: 0 },
                homeCompactness: 0,
                awayCompactness: 0,
                influenceMap: Array(10).fill(0).map(() => Array(7).fill(0)),
                pressureMap: Array(10).fill(0).map(() => Array(7).fill(0)),
                passingLanes: []
            };
        }

        return {
            homeTeam: this.world.homeTeam,
            awayTeam: this.world.awayTeam,
            ball: this.world.ball,
            state: this.world.state,
            config: this.world.config,
            rng: this.rng,
            events: {
                emit: (e: MatchEvent) => this.emit(e),
                on: (evt, cb) => this.eventBus.on(evt, cb),
                off: (evt, cb) => this.eventBus.off(evt, cb),
                clear: () => this.eventBus.clear(),
            },
            spatialHash: this.spatialHash,
            dt: 1,
            tactical: this.world.tacticalData
        };
    }
}
