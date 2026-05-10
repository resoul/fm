import type { Player, Ball, Team, MatchState, EngineConfig, Vec2, MatchEvent, TeamTacticalState } from "./types";
import { SeededRandom } from "./seededRandom";
import { SpatialHash } from "./spatialHash";
import type { SpaceAwarenessData } from "./ai/SpaceAwareness";
import type { PossessionChain } from "./ai/PossessionChain";
import type { ShapeTarget } from "./ai/TeamShape";

export interface TacticalData {
    homeCentroid: Vec2;
    awayCentroid: Vec2;
    homeCompactness: number;
    awayCompactness: number;
    influenceMap: number[][]; // 10x7 grid, >0 for home control, <0 for away
    pressureMap: number[][];  // Total physical pressure in each zone
    passingLanes: { from: string, to: string, open: boolean }[];
    /** Tactical phase state per team — updated every tick */
    homeState: TeamTacticalState;
    awayState: TeamTacticalState;
    /** Space awareness — freeSpaceMap, pressureZones, dangerousZones (2.2) */
    spaceAwareness?: SpaceAwarenessData;
    /** Possession chain state per team (4.1) */
    homeChain?: PossessionChain;
    awayChain?: PossessionChain;
    /** Dynamic shape targets per player (2.3) */
    homeShapeTargets?: ShapeTarget[];
    awayShapeTargets?: ShapeTarget[];
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