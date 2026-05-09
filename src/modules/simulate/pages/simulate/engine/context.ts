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
    events: EventBus;
    spatialHash: SpatialHash<Player>;

    // Delta time for this tick
    dt: number;
}
