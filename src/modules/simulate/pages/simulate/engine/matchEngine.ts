// ============================================================
// MATCH ENGINE — Core simulation orchestrator
// ============================================================

import type {
    Ball, Team, MatchState, MatchEvent, EngineConfig,
    FieldDimensions, TeamSide, Vec2,
} from "./types";
import {
    BallPhysics, PlayerPhysics,
    distVec, normVec, subVec, addVec, scaleVec,
    rng, rngRange, PHYSICS,
} from "./physics";
import { createTeam, resetFormationPositions } from "./teamFactory";
import { updatePlayerAI, AI } from "./playerai";

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
    simSpeed: 3.0,       // 3x speed for watchable match
    matchDuration: 600,  // 10 min real = ~30 min sim at 3x
    fieldDimensions: DEFAULT_FIELD,
};

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

    private ballPhysics: BallPhysics;
    private playerPhysics: PlayerPhysics;
    private _onEvent?: (event: MatchEvent) => void;
    private goalCooldown = 0;

    constructor(config: Partial<EngineConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.field = this.config.fieldDimensions;

        this.ballPhysics = new BallPhysics(this.field);
        this.playerPhysics = new PlayerPhysics();

        this.homeTeam = createTeam("home", "FC Home", "#e63946", "#ffffff", "4-3-3", this.field);
        this.awayTeam = createTeam("away", "FC Away", "#457b9d", "#ffffff", "4-4-2", this.field);

        this.ball = this.createBall();
        this.state = this.createInitialState();

        this.placeBallForKickoff("home");
    }

    // ── Event callback ──────────────────────────────────────
    onEvent(cb: (event: MatchEvent) => void) { this._onEvent = cb; }

    private emit(event: MatchEvent) {
        this.state.events.push(event);
        this._onEvent?.(event);
    }

    // ── Init ────────────────────────────────────────────────
    private createBall(): Ball {
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

    private createInitialState(): MatchState {
        const emptyTeamStats = () => ({
            shots: 0, shotsOnTarget: 0, passes: 0, passAccuracy: 0,
            possession: 50, tackles: 0, fouls: 0, corners: 0,
        });
        return {
            phase: "kickoff",
            minute: 0,
            second: 0,
            tick: 0,
            totalTicks: this.config.matchDuration * this.config.fps,
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

    private placeBallForKickoff(team: TeamSide) {
        this.ball.pos = { x: this.field.width / 2, y: this.field.height / 2 };
        this.ball.vel = { x: 0, y: 0 };
        this.ball.ownerPlayerId = null;
        this.ball.height = 0;
        this.ball.state = "ground";
        resetFormationPositions(this.homeTeam, this.field);
        resetFormationPositions(this.awayTeam, this.field);
        // Give ball to center forward of kickoff team
        const t = team === "home" ? this.homeTeam : this.awayTeam;
        const striker = t.players.find(p => p.position === "ST") ?? t.players[9];
        if (striker) {
            striker.pos = { x: this.field.width / 2 + (team === "home" ? -10 : 10), y: this.field.height / 2 };
            striker.hasBall = true;
            this.ball.ownerPlayerId = striker.id;
            this.ball.pos = { ...striker.pos };
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
    start() { this.state.isRunning = true; this.state.isPaused = false; }
    pause() { this.state.isPaused = !this.state.isPaused; }
    reset() {
        this.homeTeam = createTeam("home", this.homeTeam.name, this.homeTeam.color, this.homeTeam.secondaryColor, this.homeTeam.formation, this.field);
        this.awayTeam = createTeam("away", this.awayTeam.name, this.awayTeam.color, this.awayTeam.secondaryColor, this.awayTeam.formation, this.field);
        this.homeTeam.score = 0;
        this.awayTeam.score = 0;
        this.ball = this.createBall();
        this.state = this.createInitialState();
        this.placeBallForKickoff("home");
    }

    // ── Main update tick ──────────────────────────────────────
    tick(): void {
        if (!this.state.isRunning || this.state.isPaused) return;
        if (this.state.phase === "fulltime") return;

        // Multiple sim steps per tick for speed
        const steps = Math.ceil(this.config.simSpeed);
        for (let s = 0; s < steps; s++) {
            this._step();
        }
    }

    private _step(): void {
        this.state.tick++;

        // Update game clock
        const totalSec = (this.state.tick / this.config.fps) * this.config.simSpeed;
        const gameSec = totalSec % 60;
        const gameMin = Math.floor(totalSec / 60);
        this.state.minute = Math.min(gameMin, 90);
        this.state.second = Math.floor(gameSec);

        // Halftime
        if (this.state.minute >= 45 && this.state.phase === "playing") {
            this._handleHalftime();
        }

        // Fulltime
        if (this.state.minute >= 90 && this.state.phase === "playing") {
            this._handleFulltime();
            return;
        }

        if (this.state.phase === "halftime" || this.state.phase === "fulltime") return;

        // Goal cooldown
        if (this.goalCooldown > 0) {
            this.goalCooldown--;
            if (this.goalCooldown === 0) {
                this.state.phase = "playing";
                this.placeBallForKickoff(
                    this.state.lastGoalTime > 0 ? (this.homeTeam.score > this.awayTeam.score ? "away" : "home") : "home"
                );
            }
            return;
        }

        if (this.state.phase === "kickoff") this.state.phase = "playing";

        // Run AI for all players
        this._runAI();

        // Update ball physics
        this.ballPhysics.update(this.ball);

        // Update player physics
        for (const player of [...this.homeTeam.players, ...this.awayTeam.players]) {
            this.playerPhysics.moveToward(player);
            this.playerPhysics.updateFatigue(player);
            this.playerPhysics.clampToField(player, this.field);
            if (player.kickCooldown > 0) player.kickCooldown--;
        }

        // Ball pickup
        this._handleBallPickup();

        // Dribble: keep ball with owner
        this._handleDribble();

        // Check goal
        this._checkGoal();

        // Possession stats
        this._updatePossession();
    }

    // ── AI Loop ────────────────────────────────────────────
    private _runAI(): void {
        const allPlayers = [...this.homeTeam.players, ...this.awayTeam.players];

        for (const player of allPlayers) {
            const ownTeam = player.team === "home" ? this.homeTeam : this.awayTeam;
            const enemyTeam = player.team === "home" ? this.awayTeam : this.homeTeam;

            const decision = updatePlayerAI(player, this.ball, ownTeam, enemyTeam, this.field);
            if (!decision) continue;

            this._executeDecision(player, decision, ownTeam, enemyTeam);
        }
    }

    private _executeDecision(player: any, decision: any, ownTeam: Team, enemyTeam: Team): void {
        switch (decision.action) {
            case "move":
            case "reposition":
                if (decision.targetPos) player.targetPos = decision.targetPos;
                player.state = decision.action === "reposition" ? "repositioning" : "running";
                break;

            case "dribble":
                if (decision.targetPos) player.targetPos = decision.targetPos;
                player.state = "dribbling";
                break;

            case "pass":
                if (decision.targetPlayerId && player.kickCooldown === 0) {
                    this._executePass(player, decision.targetPlayerId, ownTeam, enemyTeam);
                }
                break;

            case "shoot":
                if (player.kickCooldown === 0) {
                    this._executeShot(player, ownTeam);
                }
                break;

            case "defend":
                if (decision.targetPlayerId) {
                    this._executeTackle(player, decision.targetPlayerId, enemyTeam);
                }
                player.state = "defending";
                break;

            case "clearance":
                if (player.kickCooldown === 0 && (player.hasBall || this.ball.ownerPlayerId === player.id)) {
                    this._executeClearance(player, decision, ownTeam);
                }
                break;
        }
    }

    // ── Pass ──────────────────────────────────────────────
    private _executePass(player: any, targetId: string, ownTeam: Team, enemyTeam: Team): void {
        if (!player.hasBall && this.ball.ownerPlayerId !== player.id) return;

        const target = ownTeam.players.find(p => p.id === targetId);
        if (!target) return;

        const dist = distVec(player.pos, target.pos);
        const accuracy = player.attributes.passing / 100;
        const inaccuracy = (1 - accuracy) * 0.3;

        // Direction with inaccuracy
        const baseDir = normVec(subVec(target.pos, player.pos));
        const dir = this.ballPhysics.addInaccuracy(baseDir, inaccuracy);

        const force = Math.min(3 + dist / 35, PHYSICS.KICK_MAX_FORCE);

        // Release ball
        player.hasBall = false;
        player.kickCooldown = 25;
        player.state = "passing";

        this.ball.ownerPlayerId = null;
        this.ball.lastTouchedBy = player.id;
        this.ball.lastTouchedTeam = player.team;
        this.ballPhysics.kick(this.ball, dir, force);

        ownTeam.stats.passes++;

        // Check for interception by nearby enemy
        const interceptChance = enemyTeam.players.some(e => {
            const eDist = distVec(e.pos, target.pos);
            return eDist < 25 && rng() < (e.attributes.defense / 100) * 0.35;
        });

        this.emit({
            id: mkEventId(),
            type: interceptChance ? "pass_intercepted" : "pass",
            minute: this.state.minute,
            second: this.state.second,
            teamId: player.team,
            playerId: player.id,
            playerName: player.name,
            description: interceptChance
                ? `${player.name} pass intercepted!`
                : `${player.name} passes to ${target.name}`,
            pos: { ...player.pos },
        });
    }

    // ── Shot ──────────────────────────────────────────────
    private _executeShot(player: any, ownTeam: Team): void {
        if (!player.hasBall && this.ball.ownerPlayerId !== player.id) return;

        const attackingRight = ownTeam.id === "home";
        const goalX = attackingRight ? this.field.width + this.field.goalDepth : -this.field.goalDepth;
        const goalY = this.field.height / 2 + rngRange(-this.field.goalWidth * 0.35, this.field.goalWidth * 0.35);
        const target: Vec2 = { x: goalX, y: goalY };

        const dist = distVec(player.pos, target);
        const accuracy = player.attributes.shooting / 100;
        const inaccuracy = (1 - accuracy) * 0.25 + (dist / this.field.width) * 0.15;

        const baseDir = normVec(subVec(target, player.pos));
        const dir = this.ballPhysics.addInaccuracy(baseDir, inaccuracy);
        const force = 8 + (player.attributes.shooting / 100) * 10;

        const loft = rngRange(0.05, 0.25);

        player.hasBall = false;
        player.kickCooldown = 40;
        player.state = "shooting";
        this.ball.ownerPlayerId = null;
        this.ball.lastTouchedBy = player.id;
        this.ball.lastTouchedTeam = player.team;
        this.ballPhysics.kick(this.ball, dir, force, loft);

        ownTeam.stats.shots++;

        // Check if on target (rough)
        const onTarget = Math.abs(dir.y - normVec(subVec(target, player.pos)).y) < 0.25;
        if (onTarget) ownTeam.stats.shotsOnTarget++;

        this.emit({
            id: mkEventId(),
            type: "shot",
            minute: this.state.minute,
            second: this.state.second,
            teamId: player.team,
            playerId: player.id,
            playerName: player.name,
            description: `${player.name} shoots!`,
            pos: { ...player.pos },
        });
    }

    // ── Clearance ──────────────────────────────────────────
    private _executeClearance(player: any, decision: any, ownTeam: Team): void {
        if (!player.hasBall && this.ball.ownerPlayerId !== player.id) return;

        const target = decision.targetPos ?? {
            x: this.field.width / 2,
            y: this.field.height / 2,
        };
        const dir = normVec(subVec(target, player.pos));
        const force = decision.force ?? 12;

        player.hasBall = false;
        player.kickCooldown = 30;
        this.ball.ownerPlayerId = null;
        this.ball.lastTouchedBy = player.id;
        this.ball.lastTouchedTeam = player.team;
        this.ballPhysics.kick(this.ball, dir, force, 0.2);
    }

    // ── Tackle ────────────────────────────────────────────
    private _executeTackle(player: any, targetId: string, enemyTeam: Team): void {
        const target = enemyTeam.players.find(p => p.id === targetId);
        if (!target) return;

        const dist = distVec(player.pos, target.pos);
        if (dist > AI.TACKLE_RANGE * 2) return;

        const tackleChance = (player.attributes.defense / 100) * 0.6
            - (target.attributes.dribbling / 100) * 0.3
            + rng() * 0.3;

        player.state = "defending";
        player.targetPos = target.pos;

        if (tackleChance > 0.5 && dist < AI.TACKLE_RANGE * 1.5) {
            // Successful tackle
            if (target.hasBall || this.ball.ownerPlayerId === target.id) {
                target.hasBall = false;
                this.ball.ownerPlayerId = null;
                this.ball.vel = scaleVec(normVec(subVec(player.pos, target.pos)), 3);

                const ownTeam = player.team === "home" ? this.homeTeam : this.awayTeam;
                ownTeam.stats.tackles++;

                this.emit({
                    id: mkEventId(),
                    type: "tackle_won",
                    minute: this.state.minute,
                    second: this.state.second,
                    teamId: player.team,
                    playerId: player.id,
                    playerName: player.name,
                    description: `${player.name} wins the ball!`,
                    pos: { ...player.pos },
                });
            }
        }
    }

    // ── Ball Pickup ────────────────────────────────────────
    private _handleBallPickup(): void {
        if (this.ball.ownerPlayerId !== null) return;

        const allPlayers = [...this.homeTeam.players, ...this.awayTeam.players];
        let closest: any = null;
        let closestDist = PHYSICS.CONTROL_RANGE;

        for (const p of allPlayers) {
            if (p.kickCooldown > 8) continue;
            const d = distVec(p.pos, this.ball.pos);
            if (d < closestDist) {
                closestDist = d;
                closest = p;
            }
        }

        if (closest) {
            // Release from previous owner
            for (const p of allPlayers) p.hasBall = false;
            closest.hasBall = true;
            this.ball.ownerPlayerId = closest.id;
            this.ball.lastTouchedBy = closest.id;
            this.ball.lastTouchedTeam = closest.team;
            this.ball.vel = { x: 0, y: 0 };
        }
    }

    // ── Dribble: ball follows owner ─────────────────────────
    private _handleDribble(): void {
        const owner = this.getOwnerPlayer();
        if (!owner) return;

        owner.hasBall = true;
        const offset = normVec(owner.vel);
        const dribOff = distVec({ x: 0, y: 0 }, owner.vel) > 0.1
            ? scaleVec(offset, PHYSICS.DRIBBLE_DISTANCE)
            : { x: 0, y: 0 };

        this.ball.pos = addVec(owner.pos, dribOff);
        this.ball.vel = { x: 0, y: 0 };
    }

    // ── Goal check ─────────────────────────────────────────
    private _checkGoal(): void {
        if (this.goalCooldown > 0) return;

        const scored = this.ballPhysics.isGoal(this.ball.pos, this.field);
        if (!scored) return;

        const scorer = this.ball.lastTouchedTeam === "home"
            ? (scored === "home" ? this.awayTeam : this.homeTeam)  // own goal
            : (scored === "home" ? this.homeTeam : this.awayTeam);

        // Actually: lastTouchedTeam scores if ball in opponent goal
        const actualScorer = scored === "home" ? this.homeTeam : this.awayTeam;
        // Wait: "away" means away scores, "home" means home scores
        // isGoal returns "away" if ball in left goal (home goal) → away scored
        //            returns "home" if ball in right goal (away goal) → home scored
        if (scored === "home") {
            this.homeTeam.score++;
        } else {
            this.awayTeam.score++;
        }

        const scorerTeam = scored === "home" ? this.homeTeam : this.awayTeam;
        const scorerPlayer = this.ball.lastTouchedTeam === scorerTeam.id
            ? scorerTeam.players.find(p => p.id === this.ball.lastTouchedBy)
            : undefined;

        this.state.phase = "goal";
        this.state.lastGoalTime = this.state.tick;
        this.goalCooldown = Math.floor(this.config.fps * 2.5); // 2.5s pause

        this.emit({
            id: mkEventId(),
            type: "goal",
            minute: this.state.minute,
            second: this.state.second,
            teamId: scorerTeam.id,
            playerId: scorerPlayer?.id ?? null,
            playerName: scorerPlayer?.name ?? "Unknown",
            description: `⚽ GOAL! ${scorerPlayer?.name ?? "??"} scores for ${scorerTeam.name}! (${this.homeTeam.score}-${this.awayTeam.score})`,
            pos: { ...this.ball.pos },
        });
    }

    // ── Possession ─────────────────────────────────────────
    private _updatePossession(): void {
        const owner = this.getOwnerPlayer();
        if (owner) {
            if (owner.team === "home") this.state.stats.possessionTick.home++;
            else this.state.stats.possessionTick.away++;
        } else {
            // Loose ball — check who is closer
            const hClosest = Math.min(...this.homeTeam.players.map(p => distVec(p.pos, this.ball.pos)));
            const aClosest = Math.min(...this.awayTeam.players.map(p => distVec(p.pos, this.ball.pos)));
            if (hClosest < aClosest * 0.8) this.state.stats.possessionTick.home += 0.3;
            else if (aClosest < hClosest * 0.8) this.state.stats.possessionTick.away += 0.3;
        }

        const total = this.state.stats.possessionTick.home + this.state.stats.possessionTick.away;
        this.state.stats.home.possession = Math.round((this.state.stats.possessionTick.home / total) * 100);
        this.state.stats.away.possession = 100 - this.state.stats.home.possession;
    }

    // ── Halftime / Fulltime ────────────────────────────────
    private _handleHalftime(): void {
        this.state.phase = "halftime";
        this.emit({
            id: mkEventId(), type: "halftime",
            minute: 45, second: 0,
            teamId: null, playerId: null, playerName: null,
            description: `Half time! ${this.homeTeam.name} ${this.homeTeam.score} - ${this.awayTeam.score} ${this.awayTeam.name}`,
            pos: { x: this.field.width / 2, y: this.field.height / 2 },
        });
        // Resume after brief pause
        setTimeout(() => {
            if (this.state.phase === "halftime") {
                this.state.phase = "playing";
                this.placeBallForKickoff("away");
            }
        }, 3000);
    }

    private _handleFulltime(): void {
        this.state.phase = "fulltime";
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