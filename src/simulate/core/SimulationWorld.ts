import type {
    Ball, Team, MatchState, EngineConfig, FieldDimensions,
    MatchSimulationSnapshot, SimulationMode, PlayerSnapshot, TeamSnapshot,
} from "../types";
import type { TacticalData } from "../context";
import { EventStore } from "./EventStore";

export class SimulationWorld {
    homeTeam: Team;
    awayTeam: Team;
    ball: Ball;
    state: MatchState;
    config: EngineConfig;
    tacticalData?: TacticalData;
    readonly eventStore: EventStore;

    constructor(homeTeam: Team, awayTeam: Team, state: MatchState, ball: Ball, config: EngineConfig) {
        this.homeTeam = homeTeam;
        this.awayTeam = awayTeam;
        this.state = state;
        this.ball = ball;
        this.config = config;
        this.eventStore = new EventStore();
    }

    get field(): FieldDimensions {
        return this.config.fieldDimensions;
    }

    createSnapshot(mode: SimulationMode): MatchSimulationSnapshot {
        return {
            tick: this.state.tick,
            mode,
            homeTeam: snapshotTeam(this.homeTeam),
            awayTeam: snapshotTeam(this.awayTeam),
            ball: {
                ...this.ball,
                pos: { ...this.ball.pos },
                vel: { ...this.ball.vel },
            },
            state: {
                ...this.state,
                events: this.eventStore.getAll(),
                stats: {
                    home: { ...this.state.stats.home },
                    away: { ...this.state.stats.away },
                    possessionTick: { ...this.state.stats.possessionTick },
                },
            },
            events: this.eventStore.getAll(),
        };
    }

    applySnapshot(snapshot: MatchSimulationSnapshot): void {
        applyTeamSnapshot(this.homeTeam, snapshot.homeTeam);
        applyTeamSnapshot(this.awayTeam, snapshot.awayTeam);
        this.ball = {
            ...snapshot.ball,
            pos: { ...snapshot.ball.pos },
            vel: { ...snapshot.ball.vel },
        };
        this.state = {
            ...snapshot.state,
            events: [...snapshot.events],
            stats: {
                home: { ...snapshot.state.stats.home },
                away: { ...snapshot.state.stats.away },
                possessionTick: { ...snapshot.state.stats.possessionTick },
            },
        };
        this.eventStore.replace([...snapshot.events]);
    }
}

function snapshotTeam(team: Team): TeamSnapshot {
    return {
        id: team.id,
        name: team.name,
        color: team.color,
        secondaryColor: team.secondaryColor,
        score: team.score,
        formation: team.formation,
        stats: { ...team.stats },
        players: team.players.map(snapshotPlayer),
    };
}

function snapshotPlayer(player: Team["players"][number]): PlayerSnapshot {
    return {
        id: player.id,
        pos: { ...player.pos },
        vel: { ...player.vel },
        targetPos: { ...player.targetPos },
        state: player.state,
        hasBall: player.hasBall,
        fatigue: player.fatigue,
        actionCooldown: player.actionCooldown,
        kickCooldown: player.kickCooldown,
        nextDecision: player.nextDecision ? { ...player.nextDecision } : null,
        targetPlayerId: player.targetPlayerId,
        passTarget: player.passTarget,
        // B.1: preserve intent across snapshot/restore for replay correctness
        intent: player.intent ? {
            ...player.intent,
            target: player.intent.target ? { ...player.intent.target } : undefined,
        } : null,
        slotIdx: player.slotIdx,
        isExpelled: player.isExpelled,
    };
}

function applyTeamSnapshot(team: Team, snapshot: TeamSnapshot): void {
    team.score = snapshot.score;
    team.stats = { ...snapshot.stats };

    for (const playerSnapshot of snapshot.players) {
        const player = team.players.find(p => p.id === playerSnapshot.id);
        if (!player) continue;

        player.pos = { ...playerSnapshot.pos };
        player.vel = { ...playerSnapshot.vel };
        player.targetPos = { ...playerSnapshot.targetPos };
        player.state = playerSnapshot.state;
        player.hasBall = playerSnapshot.hasBall;
        player.fatigue = playerSnapshot.fatigue;
        player.actionCooldown = playerSnapshot.actionCooldown;
        player.kickCooldown = playerSnapshot.kickCooldown;
        player.nextDecision = playerSnapshot.nextDecision ? { ...playerSnapshot.nextDecision } : null;
        player.targetPlayerId = playerSnapshot.targetPlayerId;
        player.passTarget = playerSnapshot.passTarget;
        // B.1: restore intent from snapshot (needed for ReplaySimulator correctness)
        player.intent = playerSnapshot.intent ? {
            ...playerSnapshot.intent,
            target: playerSnapshot.intent.target ? { ...playerSnapshot.intent.target } : undefined,
        } : null;
        player.slotIdx = playerSnapshot.slotIdx;
        player.isExpelled = playerSnapshot.isExpelled;
    }
}