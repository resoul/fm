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
export type MatchPhase = "kickoff" | "playing" | "goal" | "halftime" | "fulltime" | "freekick" | "goalkick" | "throwin" | "corner";
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
    | "goalkick"
    | "throwin"
    | "kickoff"
    | "halftime"
    | "fulltime";

// ── Vec2 ──────────────────────────────────────────────────
export interface Vec2 {
    x: number;
    y: number;
}

// ── Player Attributes ────────────────────────────────────
// Единая структура атрибутов — см. engine/person.ts
// PlayerAttributes — плоская проекция для совместимости с
// движком (Player.attributes). Новый код использует Person.
export {
    type TechnicalAttributes,
    type MentalAttributes,
    type PhysicalAttributes,
    type HiddenAttributes,
    type GoalkeeperAttributes,
    type Person,
    type PersonRole,
    playerOverall as overallRating,
} from "./person";

/**
 * PlayerAttributes — плоская структура для рантайма движка.
 * Строится из Person через flattenPersonAttrs() в teamFactory.
 * Не используй напрямую для новых фич — работай с Person.
 */
export interface PlayerAttributes {
    // Physical
    acceleration: number; agility: number; balance: number;
    jumpingReach: number; naturalFitness: number; pace: number;
    stamina: number; strength: number;
    // Mental
    aggression: number; anticipation: number; bravery: number;
    composure: number; concentration: number; decisions: number;
    determination: number; flair: number; leadership: number;
    offTheBall: number; positioning: number; teamwork: number;
    vision: number; workRate: number;
    // Technical
    corners: number; crossing: number; dribbling: number;
    finishing: number; firstTouch: number; freeKickTaking: number;
    heading: number; longShots: number; longThrows: number;
    marking: number; passing: number; penaltyTaking: number;
    tackling: number; technique: number;
    // Goalkeeping
    aerialReach: number; commandOfArea: number; communication: number;
    eccentricity: number; handling: number; kicking: number;
    oneOnOnes: number; punching: number; reflexes: number;
    rushingOut: number; throwing: number;
}

// ============================================================
// CLUB / SQUAD LAYER — sits above the match engine
// ============================================================

/**
 * PlayerProfile — игрок в заявке клуба (persistent across matches).
 * Наследует от Person, добавляет контрактные / позиционные поля.
 */
export interface PlayerProfile {
    // ── Identity (дублирует Person.id/name для удобства) ──
    id: string;
    name: string;
    age: number;
    nationality: string;

    // ── Позиция ───────────────────────────────────────────
    number: number;
    primaryPosition: PlayerPosition;
    alternatePositions: PlayerPosition[];
    role: PlayerRole;

    // ── Атрибуты через Person ─────────────────────────────
    /** Полная структура атрибутов (Person) */
    person: import("./person").Person;
    /** Плоская проекция для движка — синхронизируется с person */
    attributes: PlayerAttributes;
    /** Потенциальные атрибуты (ceiling при полном развитии) */
    potential: import("./person").Person;

    // ── Bio ───────────────────────────────────────────────
    height: number; // cm
    weight: number; // kg

    // ── Contract ──────────────────────────────────────────
    wage: number;         // weekly wage in K€
    contractEnds: number; // season number

    // ── Form & fitness ────────────────────────────────────
    form: number;         // 0–100
    fitness: number;      // 0–100
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
    /** A.1 CoachProfile — personality drives in-match decisions */
    coach?: import("./coach/CoachProfile").CoachProfile;
}

/** Lineup selected before a match: 11 player IDs + formation */
export interface MatchLineup {
    clubId: string;
    formation: string;
    startingXI: string[];  // 11 PlayerProfile IDs, index = formation slot order
    /** A.1 Optional override for the club's default coach */
    coach?: import("./coach/CoachProfile").CoachProfile;
}

// ============================================================
// ENGINE LAYER — runtime types used during simulation
// ============================================================

// ── Intent Architecture (B.1) ─────────────────────────────
/**
 * PlayerIntent captures the player's committed decision with temporal locking.
 *
 * commitTick:    the tick until which the decision is "locked in" — the player
 *               cannot switch action before this, simulating reaction lag.
 *               Controlled by `decisions` attribute: high decisions = short lock.
 *
 * reevaluateAt:  the tick at which a full UtilityAI re-evaluation is triggered.
 *               Between commits, the player may only update target positions,
 *               not switch action type.
 *
 * confidence:   degrades each tick the situation changes significantly (e.g.
 *               target moves far away, defender appears). At 0 the player
 *               hesitates before forming a new intent.
 */
export interface PlayerIntent {
    type: AIDecision["type"];
    target?: Vec2;
    targetPlayerId?: string;
    /** 0–1: decreases when situation diverges from when intent was formed */
    confidence: number;
    /** Tick at which this intent becomes locked (cannot switch before) */
    commitTick: number;
    /** Tick at which a new UtilityAI evaluation is triggered */
    reevaluateAt: number;
    /** Tick when the intent was originally formed */
    formedAtTick: number;
}

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

    /**
     * Intent architecture (B.1): committed decision with temporal locking.
     * DecisionSystem checks this before forming a new decision.
     * null = player has no active intent (will evaluate immediately).
     */
    intent: PlayerIntent | null;

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

export type SimulationMode = "realtime" | "fast" | "hybrid" | "replay";

// ── Team Tactical State ───────────────────────────────────
/**
 * Describes the current collective tactical situation of a team.
 * Updated each tick by TacticalSystem. Used by DecisionSystem to
 * choose contextually correct off-ball behaviour.
 */
export type TeamTacticalPhase =
    | "in_possession"       // Team has the ball — build up / attack
    | "out_of_possession"   // Team lost the ball — press / defend
    | "transition_attack"   // Just won the ball — counter opportunity
    | "transition_defend"   // Just lost the ball — sprint back
    | "set_piece";          // Free kick / corner / throw-in

export interface TeamTacticalState {
    phase: TeamTacticalPhase;
    /** How many ticks ago the possession last changed (0 = this tick) */
    ticksSincePossessionChange: number;
    /** Distance from team centroid to own goal — proxy for defensive line height */
    defensiveLineX: number;
    /** Width spread of outfield players */
    teamWidth: number;
    /** Estimated pressure the team is under (0-1) */
    pressureIntensity: number;
}

export type SimulationEvent = MatchEvent;

export interface MatchSimulationConfig extends Partial<EngineConfig> {
    seed?: number;
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
    seed: number;
}

export interface MatchSimulationState {
    readonly homeTeam: Readonly<Team>;
    readonly awayTeam: Readonly<Team>;
    readonly ball: Readonly<Ball>;
    readonly state: Readonly<MatchState>;
    readonly mode: SimulationMode;
}

export interface PlayerSnapshot {
    readonly id: string;
    readonly pos: Readonly<Vec2>;
    readonly vel: Readonly<Vec2>;
    readonly targetPos: Readonly<Vec2>;
    readonly state: PlayerState;
    readonly hasBall: boolean;
    readonly fatigue: number;
    readonly actionCooldown: number;
    readonly kickCooldown: number;
    readonly nextDecision: AIDecision | null;
    readonly targetPlayerId: string | null;
    readonly passTarget: string | null;
    /** B.1: serialised intent for replay / debug inspection */
    readonly intent: PlayerIntent | null;
}

export interface TeamSnapshot {
    readonly id: TeamSide;
    readonly name: string;
    readonly color: string;
    readonly secondaryColor: string;
    readonly score: number;
    readonly formation: string;
    readonly stats: Readonly<TeamStats>;
    readonly players: readonly PlayerSnapshot[];
}

export interface MatchSimulationSnapshot {
    readonly tick: number;
    readonly mode: SimulationMode;
    readonly homeTeam: TeamSnapshot;
    readonly awayTeam: TeamSnapshot;
    readonly ball: Readonly<Ball>;
    readonly state: Readonly<MatchState>;
    readonly events: readonly SimulationEvent[];
}

export interface RenderOptions {
    showNames: boolean;
    showStats: boolean;
    showHeatmap: boolean;
    showPossessionArrow: boolean;
    // 7.2 Tactical Overlays
    showZones: boolean;
    showPassingLanes: boolean;
    showDefensiveLine: boolean;
    showPressureHeatmap: boolean;
}

export interface AIDecision {
    type: "pass" | "shoot" | "dribble" | "move" | "defend" | "clearance" | "reposition";
    target?: Vec2;
    targetPlayerId?: string;
    force?: number;
    xG?: number;
    /** Set by OffBallSystem to tag which run type produced this decision */
    offBallRunType?: OffBallRunType;
}

// ── Off-ball run types (2.1) ──────────────────────────────
export type OffBallRunType =
    | "support_run"
    | "overlap_run"
    | "underlap_run"
    | "third_man_run"
    | "defensive_recovery"
    | "hold_shape";

export interface Zone {
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
}
