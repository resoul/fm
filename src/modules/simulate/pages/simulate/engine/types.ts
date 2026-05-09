// ============================================================
// TYPES — Full type definitions including Club/Squad layer
// ============================================================

export type TeamSide = "home" | "away";
export type PlayerPosition = "GK" | "CB" | "LB" | "RB" | "CM" | "LM" | "RM" | "CAM" | "ST" | "LW" | "RW";
export type PlayerRole = 
    | "GK_Sweeper" | "GK_Defensive" 
    | "CB_Stopper" | "CB_BallPlaying" 
    | "WB_Attacking" | "WB_Defensive"
    | "CM_BallWinner" | "CM_Playmaker" | "CM_BoxToBox"
    | "W_Winger" | "W_Inverted"
    | "ST_Poacher" | "ST_TargetMan" | "ST_Advanced";
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

// ── Player Attributes (FM-Style) ──────────────────────────
export interface PlayerAttributes {
    // Physical
    acceleration: number;
    agility: number;
    balance: number;
    jumpingReach: number;
    naturalFitness: number;
    pace: number;
    stamina: number;
    strength: number;

    // Mental
    aggression: number;
    anticipation: number;
    bravery: number;
    composure: number;
    concentration: number;
    decisions: number;
    determination: number;
    flair: number;
    leadership: number;
    offTheBall: number;
    positioning: number;
    teamwork: number;
    vision: number;
    workRate: number;

    // Technical
    corners: number;
    crossing: number;
    dribbling: number;
    finishing: number;
    firstTouch: number;
    freeKickTaking: number;
    heading: number;
    longShots: number;
    longThrows: number;
    marking: number;
    passing: number;
    penaltyTaking: number;
    tackling: number;
    technique: number;

    // Goalkeeping (Mostly for GK)
    aerialReach: number;
    commandOfArea: number;
    communication: number;
    eccentricity: number;
    handling: number;
    kicking: number;
    oneOnOnes: number;
    punching: number;
    reflexes: number;
    rushingOut: number;
    throwing: number;
}

// ── Overall rating helper (weighted average) ─────────────
export function overallRating(attrs: PlayerAttributes): number {
    // Simple average of key physical/technical for now
    const keys: (keyof PlayerAttributes)[] = [
        "acceleration", "pace", "stamina", "passing", "finishing", "tackling", "vision", "decisions"
    ];
    let sum = 0;
    for (const k of keys) sum += attrs[k] as number;
    return Math.round(sum / keys.length);
}

// ============================================================
// CLUB / SQUAD LAYER — sits above the match engine
// ============================================================

/** A player in a club's squad (persistent across matches) */
export interface PlayerProfile {
    id: string;
    name: string;
    age: number;
    nationality: string;
    number: number;                       // preferred shirt number
    primaryPosition: PlayerPosition;
    alternatePositions: PlayerPosition[]; // positions player can also play
    role: PlayerRole;

    attributes: PlayerAttributes;
    potential: PlayerAttributes;          // max attributes if fully developed

    // Bio
    height: number;                       // in cm
    weight: number;                       // in kg

    // Contract
    wage: number;                         // weekly wage in K€
    contractEnds: number;                 // season number

    // Form & fitness — updated after each match
    form: number;        // 0–100: recent performance streak
    fitness: number;     // 0–100: physical freshness (100 = fully rested)
    matchesPlayed: number;
    goals: number;
    assists: number;
}

/** A club with a full squad */
export interface Club {
    id: string;
    name: string;
    shortName: string;   // 3-letter abbreviation e.g. "FCH"
    color: string;       // primary kit color (hex)
    secondaryColor: string;
    budget: number;      // in K€
    reputation: number;  // 1–100, affects transfers
    squad: PlayerProfile[];
    defaultFormation: string;
}

/** Lineup selected before a match: 11 player IDs + formation */
export interface MatchLineup {
    clubId: string;
    formation: string;
    startingXI: string[];  // 11 PlayerProfile IDs, index = formation slot order
}

// ============================================================
// ENGINE LAYER — runtime types used during simulation
// ============================================================

/** Runtime player inside the match engine */
export interface Player {
    id: string;
    name: string;
    number: number;
    team: TeamSide;
    position: PlayerPosition;
    attributes: PlayerAttributes;  // may be adjusted by fitness/form
    role: PlayerRole;

    // Bio
    height: number;
    weight: number;

    // Runtime state
    pos: Vec2;
    vel: Vec2;
    targetPos: Vec2;
    state: PlayerState;
    hasBall: boolean;
    fatigue: number;         // 0-1, increases over match
    actionCooldown: number;
    kickCooldown: number;

    // AI state
    nextDecision: AIDecision | null;
    targetPlayerId: string | null;
    passTarget: string | null;

    // Back-reference to source profile (optional, for post-match stats)
    profileId?: string;
}

export interface Ball {
    pos: Vec2;
    vel: Vec2;
    state: BallState;
    ownerPlayerId: string | null;
    lastTouchedBy: string | null;
    lastTouchedTeam: TeamSide | null;
    height: number;
    heightVel: number;
}

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

export interface TeamStats {
    shots: number;
    shotsOnTarget: number;
    passes: number;
    passAccuracy: number;
    possession: number;
    tackles: number;
    fouls: number;
    corners: number;
    xg: number;
}

export interface MatchStats {
    home: TeamStats;
    away: TeamStats;
    possessionTick: { home: number; away: number };
}

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
    xg?: number;
}

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

export interface MatchState {
    phase: MatchPhase;
    minute: number;
    second: number;
    tick: number;
    totalTicks: number;
    isRunning: boolean;
    isPaused: boolean;
    kickoffTeam: TeamSide;
    lastGoalTime: number;
    events: MatchEvent[];
    stats: MatchStats;
}

export interface EngineConfig {
    fps: number;
    simSpeed: number;
    matchDuration: number;
    fieldDimensions: FieldDimensions;
}

export interface RenderOptions {
    showNames: boolean;
    showStats: boolean;
    showHeatmap: boolean;
    showPossessionArrow: boolean;
}

export interface AIDecision {
    type: "pass" | "shoot" | "dribble" | "move" | "defend" | "clearance" | "reposition";
    target?: Vec2;
    targetPlayerId?: string;
    force?: number;
    xG?: number;
}

export interface Zone {
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
}