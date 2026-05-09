import { Player, Ball, Team, MatchState, EngineConfig, Vec2 } from "./types";
import { SeededRandom } from "./seededRandom";
import { EventBus } from "./eventBus";
import { SpatialHash } from "./spatialHash";

export interface TacticalData {
    homeCentroid: Vec2;
    awayCentroid: Vec2;
    homeCompactness: number;
    awayCompactness: number;
    influenceMap: number[][]; // 10x7 grid, >0 for home control, <0 for away
    pressureMap: number[][];  // Total physical pressure in each zone
    passingLanes: { from: string, to: string, open: boolean }[];
}

export interface SimulationEvents {
    emit: (event: MatchEvent) => void;
    on: (event: string, cb: (event: MatchEvent) => void) => void;
    off: (event: string, cb: (event: MatchEvent) => void) => void;
    clear: () => void;
}

/**
 * The SimulationContext contains the entire state of a single match tick.
 * Systems read from and write to this context.
 */
export interface SimulationContext {
    // Entities
    homeTeam: Team;
    awayTeam: Team;
    ball: Ball;

    // Match Metadata
    state: MatchState;
    config: EngineConfig;

    // Tactical Analysis (Calculated by TacticalSystem)
    tactical: TacticalData;

    // Infrastructure
    rng: SeededRandom;
    events: SimulationEvents;
    spatialHash: SpatialHash<Player>;

    // Delta time for this tick
    dt: number;
}
