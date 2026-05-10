import type {
    Ball, Team, MatchState, MatchEvent, EngineConfig,
    FieldDimensions, TeamSide, MatchSimulationState, MatchSimulationSnapshot,
    SimulationMode, MatchSimulationConfig, SimulationEvent,
} from "./types";
import { resetFormationPositions } from "./teamFactory";
import { SimulationWorld } from "./core/SimulationWorld";
import { MatchSimulator } from "./simulation/MatchSimulator";
import { FastSimulator } from "./simulation/FastSimulator";
import { HybridSimulator } from "./simulation/HybridSimulator";
import { BaseSimulator } from "./simulation/BaseSimulator";

export const DEFAULT_FIELD: FieldDimensions = {
    width: 720,
    height: 480,
    goalWidth: 80,
    goalDepth: 20,
    penaltyAreaWidth: 132,
    penaltyAreaHeight: 204,
    centerCircleRadius: 60,
    cornerArcRadius: 8,
};

export const DEFAULT_CONFIG: EngineConfig = {
    fps: 60,
    simSpeed: 1.0,
    matchDuration: 5400,
    fieldDimensions: DEFAULT_FIELD,
    seed: 12345,
};

export class MatchEngine {
    readonly config: EngineConfig;
    readonly field: FieldDimensions;

    world: SimulationWorld;
    private simulator: MatchSimulator;
    private fastSimulator: FastSimulator;
    private hybridSimulator: HybridSimulator;
    private activeSimulator: BaseSimulator;
    private activeMode: SimulationMode = "realtime";

    private _initialHomeTeam: Team;
    private _initialAwayTeam: Team;

    constructor(homeTeam: Team, awayTeam: Team, config: MatchSimulationConfig = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.field = this.config.fieldDimensions;

        this._initialHomeTeam = deepCloneTeam(homeTeam);
        this._initialAwayTeam = deepCloneTeam(awayTeam);

        const home = deepCloneTeam(homeTeam);
        const away = deepCloneTeam(awayTeam);
        const ball = this._createBall();
        const state = this._createInitialState();

        this.world = new SimulationWorld(home, away, state, ball, this.config);
        this.simulator = new MatchSimulator(this.world);
        this.fastSimulator = new FastSimulator(this.world);
        this.hybridSimulator = new HybridSimulator(this.world);
        this.activeSimulator = this.simulator;

        this._placeBallForKickoff("home");
    }

    get homeTeam() { return this.world.homeTeam; }
    get awayTeam() { return this.world.awayTeam; }
    get ball() { return this.world.ball; }
    get state() { return this.world.state; }
    get events() { return this.world.eventStore.getAll(); }

    start() {
        if (this.world.state.phase === "kickoff") {
            this.world.state.phase = "playing";
        }
        this.world.state.isRunning = true;
        this.world.state.isPaused = false;
        this.activeSimulator.start();
    }

    pause() {
        this.activeSimulator.pause();
        this.world.state.isPaused = this.activeSimulator.isPaused;
        this.world.state.isRunning = this.activeSimulator.isRunning;
    }

    tick() {
        this.activeSimulator.tick();
        this.world.state.isPaused = this.activeSimulator.isPaused;
        this.world.state.isRunning = this.activeSimulator.isRunning;
    }

    setMode(mode: Exclude<SimulationMode, "replay">) {
        if (mode === "realtime") this.activeSimulator = this.simulator;
        if (mode === "fast") this.activeSimulator = this.fastSimulator;
        if (mode === "hybrid") this.activeSimulator = this.hybridSimulator;
        this.activeMode = mode;
    }

    getMode(): SimulationMode {
        return this.activeMode;
    }

    getState(): MatchSimulationState {
        return {
            homeTeam: this.world.homeTeam,
            awayTeam: this.world.awayTeam,
            ball: this.world.ball,
            state: this.world.state,
            mode: this.activeMode,
        };
    }

    getEvents(): SimulationEvent[] {
        return this.world.eventStore.getAll();
    }

    getAuthoritativeEvents(): SimulationEvent[] {
        return this.world.eventStore.getAuthoritativeEvents();
    }

    getSnapshot(): MatchSimulationSnapshot {
        return this.world.createSnapshot(this.activeMode);
    }

    restoreSnapshot(snapshot: MatchSimulationSnapshot) {
        this.pause();
        this.world.applySnapshot(snapshot);
        this.activeMode = snapshot.mode;
    }

    onEvent(cb: (event: MatchEvent) => void) {
        this.activeSimulator.onEvent(cb);
    }

    offEvent(cb: (event: MatchEvent) => void) {
        this.activeSimulator.offEvent(cb);
    }

    reset() {
        this.world.homeTeam = deepCloneTeam(this._initialHomeTeam);
        this.world.awayTeam = deepCloneTeam(this._initialAwayTeam);
        this.world.homeTeam.score = 0;
        this.world.awayTeam.score = 0;
        this.world.ball = this._createBall();
        this.world.state = this._createInitialState();
        this.world.eventStore.clear();
        this.simulator = new MatchSimulator(this.world);
        this.fastSimulator = new FastSimulator(this.world);
        this.hybridSimulator = new HybridSimulator(this.world);
        this.setMode(this.activeMode === "replay" ? "realtime" : this.activeMode);
        this._placeBallForKickoff("home");
    }

    private _createBall(): Ball {
        return {
            pos: { x: this.field.width / 2, y: this.field.height / 2 },
            vel: { x: 0, y: 0 },
            state: "ground",
            ownerPlayerId: null,
            lastTouchedBy: null,
            lastTouchedTeam: null,
            height: 0,
            heightVel: 0,
        };
    }

    private _createInitialState(): MatchState {
        return {
            phase: "kickoff",
            minute: 0,
            second: 0,
            tick: 0,
            totalTicks: Math.floor((90 * 60 / this.config.simSpeed) * this.config.fps),
            isRunning: false,
            isPaused: false,
            kickoffTeam: "home",
            lastGoalTime: -999,
            isSecondHalf: false,
            isPenalty: false,
            cards: [],
            events: [],
            stats: {
                home: emptyTeamStats(),
                away: emptyTeamStats(),
                possessionTick: { home: 1, away: 1 },
            },
        };
    }

    private _placeBallForKickoff(team: TeamSide) {
        this.world.ball.pos = { x: this.field.width / 2, y: this.field.height / 2 };
        this.world.ball.vel = { x: 0, y: 0 };
        this.world.ball.ownerPlayerId = null;
        this.world.ball.height = 0;
        this.world.ball.state = "ground";
        resetFormationPositions(this.world.homeTeam, this.field);
        resetFormationPositions(this.world.awayTeam, this.field);
        const t = team === "home" ? this.world.homeTeam : this.world.awayTeam;
        const striker = t.players.find(p => p.position === "ST") ?? t.players[9];
        if (striker) {
            striker.pos = { x: this.field.width / 2 + (team === "home" ? -10 : 10), y: this.field.height / 2 };
            striker.hasBall = true;
            this.world.ball.ownerPlayerId = striker.id;
            this.world.ball.pos = { ...striker.pos };
        }
    }
}

function emptyTeamStats() {
    return {
        shots: 0, shotsOnTarget: 0, passes: 0, passAccuracy: 0,
        possession: 50, tackles: 0, fouls: 0, corners: 0, xg: 0,
    };
}

export function deepCloneTeam(team: Team): Team {
    return {
        ...team,
        stats: { ...team.stats },
        players: team.players.map(p => ({
            ...p,
            pos:        { ...p.pos },
            vel:        { ...p.vel },
            targetPos:  { ...p.targetPos },
            attributes: { ...p.attributes },
        })),
    };
}