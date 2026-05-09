export type TeamSide = "home" | "away";
export type PlayerPosition = "GK" | "CB" | "LB" | "RB" | "CM" | "LM" | "RM" | "CAM" | "ST" | "LW" | "RW";
export type PlayerState = "idle" | "running" | "dribbling" | "passing" | "shooting" | "defending" | "celebrating" | "repositioning";
export type BallState = "ground" | "air" | "rolling";
export type MatchPhase = "kickoff" | "playing" | "goal" | "halftime" | "fulltime" | "freekick" | "goalkick" | "throwin";
export type EventType =
    | "goal"
    | "shot"
    | "shot_saved"
    | "shot_missed"
    | "pass"
    | "pass_intercepted"
    | "tackle"
    | "tackle_won"
    | "foul"
    | "offside"
    | "corner"
    | "freekick"
    | "kickoff"
    | "halftime"
    | "fulltime";

// ── Vec2 ──────────────────────────────────────────────────
export interface Vec2 {
    x: number;
    y: number;
}

// ── Player Attributes ─────────────────────────────────────
export interface PlayerAttributes {
    speed: number;       // 1-100: max sprint speed
    passing: number;     // 1-100: pass accuracy & range
    shooting: number;    // 1-100: shot power & precision
    stamina: number;     // 1-100: fatigue resistance
    defense: number;     // 1-100: tackling & positioning
    dribbling: number;   // 1-100: ball control
}

// ── Player ────────────────────────────────────────────────
export interface Player {
    id: string;
    name: string;
    number: number;
    team: TeamSide;
    position: PlayerPosition;
    attributes: PlayerAttributes;

    // Runtime state
    pos: Vec2;
    vel: Vec2;
    targetPos: Vec2;
    state: PlayerState;
    hasBall: boolean;
    fatigue: number;         // 0-1, increases over time
    actionCooldown: number;  // frames until next AI decision
    kickCooldown: number;    // frames until can kick again

    // AI state
    targetPlayerId: string | null;
    passTarget: string | null;
}

// ── Ball ──────────────────────────────────────────────────
export interface Ball {
    pos: Vec2;
    vel: Vec2;
    state: BallState;
    ownerPlayerId: string | null;
    lastTouchedBy: string | null;
    lastTouchedTeam: TeamSide | null;
    height: number;       // 0 = ground
    heightVel: number;    // vertical velocity
}

// ── Team ──────────────────────────────────────────────────
export interface Team {
    id: TeamSide;
    name: string;
    color: string;
    secondaryColor: string;
    score: number;
    formation: string;
    players: Player[];
    stats: TeamStats;
}

// ── Match Stats ───────────────────────────────────────────
export interface TeamStats {
    shots: number;
    shotsOnTarget: number;
    passes: number;
    passAccuracy: number;
    possession: number;    // 0-100 percentage
    tackles: number;
    fouls: number;
    corners: number;
}

export interface MatchStats {
    home: TeamStats;
    away: TeamStats;
    possessionTick: { home: number; away: number };
}

// ── Match Event ───────────────────────────────────────────
export interface MatchEvent {
    id: string;
    type: EventType;
    minute: number;
    second: number;
    teamId: TeamSide | null;
    playerId: string | null;
    playerName: string | null;
    description: string;
    pos: Vec2;
}

// ── Field Dimensions ──────────────────────────────────────
export interface FieldDimensions {
    width: number;
    height: number;
    goalWidth: number;
    goalDepth: number;
    penaltyAreaWidth: number;
    penaltyAreaHeight: number;
    centerCircleRadius: number;
    cornerArcRadius: number;
}

// ── Match State ───────────────────────────────────────────
export interface MatchState {
    phase: MatchPhase;
    minute: number;
    second: number;
    tick: number;
    totalTicks: number;   // 90min * 60s * 60fps
    isRunning: boolean;
    isPaused: boolean;
    kickoffTeam: TeamSide;
    lastGoalTime: number;
    events: MatchEvent[];
    stats: MatchStats;
}

// ── Engine Config ─────────────────────────────────────────
export interface EngineConfig {
    fps: number;
    simSpeed: number;    // 1.0 = realtime, 2.0 = 2x speed
    matchDuration: number; // in seconds (real: 5400 = 90min)
    fieldDimensions: FieldDimensions;
}

// ── Render Options ────────────────────────────────────────
export interface RenderOptions {
    showNames: boolean;
    showStats: boolean;
    showHeatmap: boolean;
    showPossessionArrow: boolean;
}

// ── AI Decision ───────────────────────────────────────────
export interface AIDecision {
    action: "pass" | "shoot" | "dribble" | "move" | "defend" | "clearance" | "reposition";
    targetPos?: Vec2;
    targetPlayerId?: string;
    force?: number;
}

// ── Zone ──────────────────────────────────────────────────
export interface Zone {
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
}