// ============================================================
// MATCH ENGINE — Core simulation orchestrator
// Accepts ready-made Team objects from outside (buildMatchTeam)
// ============================================================

import type {
    Ball, Team, MatchState, MatchEvent, EngineConfig,
    FieldDimensions, TeamSide, Vec2,
} from "./types";
import { resetFormationPositions } from "./teamFactory";
import { SeededRandom } from "./seededRandom";
import { EventBus } from "./eventBus";
import { SimulationPipeline } from "./pipeline";
import { SimulationContext } from "./context";
import { SpatialHash } from "./spatialHash";
import { ReplayManager } from "./replayManager";
import { Player } from "./types";
import { TacticalSystem } from "./systems/TacticalSystem";
import { DecisionSystem } from "./systems/DecisionSystem";
import { ShootingSystem } from "./systems/ShootingSystem";
import { PassingSystem } from "./systems/PassingSystem";
import { GoalkeeperSystem } from "./systems/GoalkeeperSystem";
import { TackleSystem } from "./systems/TackleSystem";
import { MovementSystem } from "./systems/MovementSystem";
import { PhysicsSystem } from "./systems/PhysicsSystem";
import { RefereeSystem } from "./systems/RefereeSystem";

// ── Default field dimensions ──────────────────────────────
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

// ── Default engine config ─────────────────────────────────
export const DEFAULT_CONFIG: EngineConfig = {
    fps: 60,
    simSpeed: 1.0,
    matchDuration: 5400,
    fieldDimensions: DEFAULT_FIELD,
};

// ── Tick math ─────────────────────────────────────────────
function halftimeTick(cfg: EngineConfig): number {
    return Math.floor((45 * 60 / cfg.simSpeed) * cfg.fps);
}
function fulltimeTick(cfg: EngineConfig): number {
    return Math.floor((90 * 60 / cfg.simSpeed) * cfg.fps);
}

// ── Event ID counter ──────────────────────────────────────
let eventCounter = 0;
function mkEventId() { return `evt_${++eventCounter}`; }

// ── Match Engine ──────────────────────────────────────────
export class MatchEngine {
    readonly config: EngineConfig;
    readonly field: FieldDimensions;

    homeTeam: Team;
    awayTeam: Team;
    ball: Ball;
    state: MatchState;

    // Snapshots of the initial teams for reset()
    private _initialHomeTeam: Team;
    private _initialAwayTeam: Team;
    
    private pipeline: SimulationPipeline;
    private eventBus: EventBus;
    private rng: SeededRandom;

    private goalCooldown = 0;
    private halftimePauseTicks = 0;
    private halftimeDone = false;
    private spatialHash: SpatialHash<Player>;
    private replayManager: ReplayManager;

    /**
     * Constructor accepts ready-made Team objects.
     */
    constructor(homeTeam: Team, awayTeam: Team, config: Partial<EngineConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.field = this.config.fieldDimensions;

        // Infrastructure
        this.eventBus = new EventBus();
        this.rng = new SeededRandom(12345); // Fixed seed for now
        this.pipeline = new SimulationPipeline();
        this.spatialHash = new SpatialHash<Player>(40);
        this.replayManager = new ReplayManager();
        
        this.pipeline
            .addSystem(new RefereeSystem())
            .addSystem(new TacticalSystem())
            .addSystem(new DecisionSystem())
            .addSystem(new ShootingSystem())
            .addSystem(new PassingSystem())
            .addSystem(new GoalkeeperSystem())
            .addSystem(new TackleSystem())
            .addSystem(new MovementSystem())
            .addSystem(new PhysicsSystem());

        // Deep-clone teams so reset() can restore originals
        this._initialHomeTeam = deepCloneTeam(homeTeam);
        this._initialAwayTeam = deepCloneTeam(awayTeam);

        this.homeTeam = deepCloneTeam(homeTeam);
        this.awayTeam = deepCloneTeam(awayTeam);

        this.ball = this._createBall();
        this.state = this._createInitialState();

        this._placeBallForKickoff("home");
    }

    // ── Event callback ──────────────────────────────────────
    onEvent(cb: (event: MatchEvent) => void) { 
        this.eventBus.on("all", cb);
    }

    private emit(event: MatchEvent) {
        this.state.events.push(event);
        this.eventBus.emit(event);
    }

    // ── Init helpers ────────────────────────────────────────
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
        const emptyTeamStats = () => ({
            shots: 0, shotsOnTarget: 0, passes: 0, passAccuracy: 0,
            possession: 50, tackles: 0, fouls: 0, corners: 0, xg: 0,
        });
        return {
            phase: "kickoff",
            minute: 0,
            second: 0,
            tick: 0,
            totalTicks: fulltimeTick(this.config),
            isRunning: false,
            isPaused: false,
            kickoffTeam: "home",
            lastGoalTime: -999,
            events: [],
            stats: {
                home: emptyTeamStats(),
                away: emptyTeamStats(),
                possessionTick: { home: 1, away: 1 },
            },
        };
    }

    private _placeBallForKickoff(team: TeamSide) {
        this.ball.pos = { x: this.field.width / 2, y: this.field.height / 2 };
        this.ball.vel = { x: 0, y: 0 };
        this.ball.ownerPlayerId = null;
        this.ball.height = 0;
        this.ball.state = "ground";
        resetFormationPositions(this.homeTeam, this.field);
        resetFormationPositions(this.awayTeam, this.field);
        const t = team === "home" ? this.homeTeam : this.awayTeam;
        const striker = t.players.find(p => p.position === "ST") ?? t.players[9];
        if (striker) {
            striker.pos = { x: this.field.width / 2 + (team === "home" ? -10 : 10), y: this.field.height / 2 };
            striker.hasBall = true;
            this.ball.ownerPlayerId = striker.id;
            this.ball.pos = { ...striker.pos };
        } else {
            // Fallback if no striker found
            this.ball.pos = { x: this.field.width / 2, y: this.field.height / 2 };
            this.ball.vel = { x: 0, y: 0 };
            this.ball.ownerPlayerId = null;
        }
    }

    // ── Player lookup ────────────────────────────────────────
    getPlayer(id: string) {
        return (
            this.homeTeam.players.find(p => p.id === id) ??
            this.awayTeam.players.find(p => p.id === id)
        );
    }

    getOwnerPlayer() {
        if (!this.ball.ownerPlayerId) return null;
        return this.getPlayer(this.ball.ownerPlayerId) ?? null;
    }

    // ── Control ──────────────────────────────────────────────
    get stats() { return this.state.stats; }
    get events() { return this.state.events; }
    get currentSpatialHash() { return this.spatialHash; }
    get replay() { return this.replayManager; }
    start() { this.state.isRunning = true; this.state.isPaused = false; }
    pause() { this.state.isPaused = !this.state.isPaused; }

    reset() {
        this.homeTeam = deepCloneTeam(this._initialHomeTeam);
        this.awayTeam = deepCloneTeam(this._initialAwayTeam);
        this.homeTeam.score = 0;
        this.awayTeam.score = 0;
        this.ball = this._createBall();
        this.state = this._createInitialState();
        this.goalCooldown = 0;
        this.halftimePauseTicks = 0;
        this.halftimeDone = false;
        this.spatialHash.clear();
        this.replayManager.clear();
        this._placeBallForKickoff("home");
    }

    setSimSpeed(speed: number) {
        (this.config as any).simSpeed = speed;
    }

    // ── Main update tick ──────────────────────────────────────
    tick(): void {
        if (!this.state.isRunning || this.state.isPaused) return;
        if (this.state.phase === "fulltime") return;

        const steps = Math.max(1, Math.round(this.config.simSpeed));
        for (let s = 0; s < steps; s++) {
            this._step();
        }
    }

    private _step(): void {
        if (!this.halftimeDone && this.state.tick >= halftimeTick(this.config) && this.state.phase === "playing") {
            this._handleHalftime();
            return;
        }

        if (this.state.phase === "halftime") {
            this.halftimePauseTicks--;
            if (this.halftimePauseTicks <= 0) {
                this.halftimeDone = true;
                this.state.phase = "playing";
                this._placeBallForKickoff("away");
            }
            return;
        }

        if (this.state.tick >= fulltimeTick(this.config) && this.state.phase === "playing") {
            this._handleFulltime();
            return;
        }

        if (this.state.phase === "fulltime") return;

        if (this.goalCooldown > 0) {
            this.goalCooldown--;
            if (this.goalCooldown === 0) {
                this.state.phase = "playing";
                this._placeBallForKickoff(
                    this.state.lastGoalTime > 0
                        ? (this.homeTeam.score > this.awayTeam.score ? "away" : "home")
                        : "home"
                );
            }
            return;
        }

        if (this.state.phase === "kickoff") this.state.phase = "playing";

        // Update Spatial Hash
        this.spatialHash.clear();
        [...this.homeTeam.players, ...this.awayTeam.players].forEach(p => this.spatialHash.insert(p));

        // Execute Pipeline
        const context: SimulationContext = {
            homeTeam: this.homeTeam,
            awayTeam: this.awayTeam,
            ball: this.ball,
            state: this.state,
            config: this.config,
            rng: this.rng,
            events: {
                emit: (e: MatchEvent) => this.emit(e),
                on: this.eventBus.on.bind(this.eventBus),
                off: this.eventBus.off.bind(this.eventBus),
                clear: this.eventBus.clear.bind(this.eventBus),
            } as any,
            spatialHash: this.spatialHash,
            dt: 1,
            tactical: this.tacticalData || {
                homeCentroid: { x: 0, y: 0 },
                awayCentroid: { x: 0, y: 0 },
                homeCompactness: 0,
                awayCompactness: 0,
                influenceMap: Array(10).fill(0).map(() => Array(7).fill(0)),
            }
        };

        this.pipeline.update(context);
        this.state.tick++;

        // Record replay snapshot every 10 ticks
        if (this.state.tick % 10 === 0) {
            this.replayManager.record(this.state.tick, this.ball, this.homeTeam.players, this.awayTeam.players);
        }

        this.tacticalData = context.tactical;
        
        // Post-step cleanup (if phase changed in systems)
        if (this.state.phase === "goal" && this.goalCooldown === 0) {
            this.goalCooldown = Math.floor(this.config.fps * 6); // 6 seconds pause
        }
    }

    // ── Halftime ────────────────────────────────────────────
    private _handleHalftime(): void {
        this.state.phase        = "halftime";
        this.halftimePauseTicks = this.config.fps * 3;
        this.emit({
            id: mkEventId(), type: "halftime",
            minute: 45, second: 0,
            teamId: null, playerId: null, playerName: null,
            description: `Half time! ${this.homeTeam.name} ${this.homeTeam.score} - ${this.awayTeam.score} ${this.awayTeam.name}`,
            pos: { x: this.field.width / 2, y: this.field.height / 2 },
        });
    }

    private _handleFulltime(): void {
        this.state.phase     = "fulltime";
        this.state.isRunning = false;
        this.emit({
            id: mkEventId(), type: "fulltime",
            minute: 90, second: 0,
            teamId: null, playerId: null, playerName: null,
            description: `Full time! ${this.homeTeam.name} ${this.homeTeam.score} - ${this.awayTeam.score} ${this.awayTeam.name}`,
            pos: { x: this.field.width / 2, y: this.field.height / 2 },
        });
    }
}

// ── Deep clone a Team ─────────────────────────────────────
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