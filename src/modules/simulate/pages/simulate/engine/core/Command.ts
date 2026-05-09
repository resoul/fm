import type { Vec2, PlayerState, AIDecision, MatchPhase, TeamSide } from "../types";

export type CommandType = 
    | "MOVE_PLAYER" 
    | "KICK_BALL" 
    | "SET_PLAYER_STATE" 
    | "TACKLE_PLAYER"
    | "SET_PLAYER_DECISION"
    | "UPDATE_BALL"
    | "UPDATE_MATCH_STATE"
    | "UPDATE_PLAYER_METRICS";

export interface BaseCommand {
    type: CommandType;
}

export interface MovePlayerCommand extends BaseCommand {
    type: "MOVE_PLAYER";
    playerId: string;
    pos: Vec2;
}

export interface KickBallCommand extends BaseCommand {
    type: "KICK_BALL";
    playerId: string;
    targetPos: Vec2;
    force: number;
}

export interface SetPlayerStateCommand extends BaseCommand {
    type: "SET_PLAYER_STATE";
    playerId: string;
    state: PlayerState;
}

export interface SetPlayerDecisionCommand extends BaseCommand {
    type: "SET_PLAYER_DECISION";
    playerId: string;
    decision: AIDecision | null;
    cooldown: number;
}

export type Command = 
    | MovePlayerCommand 
    | KickBallCommand 
    | SetPlayerStateCommand 
    | SetPlayerDecisionCommand
    | UpdateBallCommand
    | UpdateMatchStateCommand
    | UpdatePlayerMetricsCommand;

export interface UpdateBallCommand extends BaseCommand {
    type: "UPDATE_BALL";
    pos: Vec2;
    vel: Vec2;
    height: number;
    heightVel: number;
    ownerPlayerId: string | null;
    lastTouchedBy: string | null;
    lastTouchedTeam: TeamSide | null;
}

export interface UpdateMatchStateCommand extends BaseCommand {
    type: "UPDATE_MATCH_STATE";
    minute?: number;
    second?: number;
    phase?: MatchPhase;
    score?: { home: number, away: number };
}

/**
 * Carries per-tick physics metrics that were previously mutated directly
 * inside MovementSystem. Now applied cleanly through the resolver.
 */
export interface UpdatePlayerMetricsCommand extends BaseCommand {
    type: "UPDATE_PLAYER_METRICS";
    playerId: string;
    /** Velocity after friction/acceleration is applied this tick */
    vel: Vec2;
    /** Updated fatigue 0-1 */
    fatigue: number;
    /** Kick cooldown ticks remaining */
    kickCooldown: number;
}
