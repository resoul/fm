import type { Ball, Team, MatchState, EngineConfig, FieldDimensions } from "../types";
import { TacticalData } from "../context";

export class SimulationWorld {
    homeTeam: Team;
    awayTeam: Team;
    ball: Ball;
    state: MatchState;
    config: EngineConfig;
    tacticalData?: TacticalData;

    constructor(homeTeam: Team, awayTeam: Team, state: MatchState, ball: Ball, config: EngineConfig) {
        this.homeTeam = homeTeam;
        this.awayTeam = awayTeam;
        this.state = state;
        this.ball = ball;
        this.config = config;
    }

    get field(): FieldDimensions {
        return this.config.fieldDimensions;
    }
}
