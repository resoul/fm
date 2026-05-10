import type { Vec2, PlayerState, AIDecision, MatchPhase, TeamSide } from "../types";

export type CommandType =
    | "MOVE_PLAYER"
    | "KICK_BALL"
    | "SET_PLAYER_STATE"
    | "TACKLE_PLAYER"
    | "SET_PLAYER_DECISION"
    | "UPDATE_BALL"
    | "UPDATE_MATCH_STATE"
    | "UPDATE_PLAYER_METRICS"
    | "TELEPORT_PLAYER"
    | "SET_PLAYER_TARGET"
    | "SET_PLAYER_BALL_OWNERSHIP"
    | "CLEAR_ALL_DECISIONS";

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
    | UpdatePlayerMetricsCommand
    | TeleportPlayerCommand
    | SetPlayerTargetCommand
    | SetPlayerBallOwnershipCommand
    | ClearAllDecisionsCommand;

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

/**
 * Instantly teleports a player to a position (for restarts, kickoffs).
 * Sets pos, vel (zeroed), and optionally targetPos.
 */
export interface TeleportPlayerCommand extends BaseCommand {
    type: "TELEPORT_PLAYER";
    playerId: string;
    pos: Vec2;
    /** If omitted, targetPos is also set to pos */
    targetPos?: Vec2;
}

/**
 * Sets only the targetPos of a player (movement destination).
 * Used to lock the restart taker in place every tick without touching pos.
 */
export interface SetPlayerTargetCommand extends BaseCommand {
    type: "SET_PLAYER_TARGET";
    playerId: string;
    targetPos: Vec2;
}

/**
 * Sets hasBall, actionCooldown and kickCooldown on a player.
 * Used when assigning a restart taker.
 */
export interface SetPlayerBallOwnershipCommand extends BaseCommand {
    type: "SET_PLAYER_BALL_OWNERSHIP";
    playerId: string;
    hasBall: boolean;
    actionCooldown?: number;
    kickCooldown?: number;
}

/**
 * Clears nextDecision and hasBall for ALL players on both teams.
 * Emitted on goal / kickoff to wipe stale AI intentions.
 */
export interface ClearAllDecisionsCommand extends BaseCommand {
    type: "CLEAR_ALL_DECISIONS";
}