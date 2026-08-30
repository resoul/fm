export type AttributeNumber = number; // 1–20

// ── Attribute groups ──────────────────────────────────────

export interface TechnicalAttributes {
    crossing:     AttributeNumber;
    dribbling:    AttributeNumber;
    finishing:    AttributeNumber;
    firstTouch:   AttributeNumber;
    heading:      AttributeNumber;
    longShots:    AttributeNumber;
    longThrows:   AttributeNumber;
    marking:      AttributeNumber;
    passing:      AttributeNumber;
    tackling:     AttributeNumber;
    technique:    AttributeNumber;
}

export interface PiecesAttributes {
    corners:         AttributeNumber;
    freeKickTaking:  AttributeNumber;
    longThrows:      AttributeNumber;
    penaltyTaking:   AttributeNumber;
}

export interface MentalAttributes {
    aggression:    AttributeNumber;
    anticipation:  AttributeNumber;
    bravery:       AttributeNumber;
    composure:     AttributeNumber;
    concentration: AttributeNumber;
    decisions:     AttributeNumber;
    determination: AttributeNumber;
    flair:         AttributeNumber;
    leadership:    AttributeNumber;
    offTheBall:    AttributeNumber;
    positioning:   AttributeNumber;
    teamwork:      AttributeNumber;
    vision:        AttributeNumber;
    workRate:      AttributeNumber;
}

export interface PhysicalAttributes {
    acceleration:   AttributeNumber;
    agility:        AttributeNumber;
    balance:        AttributeNumber;
    jumpingReach:   AttributeNumber;
    naturalFitness: AttributeNumber;
    pace:           AttributeNumber;
    stamina:        AttributeNumber;
    strength:       AttributeNumber;
}

export interface HiddenAttributes {
    currentAbility:    AttributeNumber;
    potentialAbility:  AttributeNumber;
    consistency:       AttributeNumber;
    importantMatches:  AttributeNumber;
    injuryProneness:   AttributeNumber;
    dirtiness:         AttributeNumber;
    versatility:       AttributeNumber;
}

export interface FootednessAttributes {
    left:  AttributeNumber;
    right: AttributeNumber;
}

/** Динамические условия — не 1-20, а текущие значения */
export interface ConditionAttributes {
    sharpness: number; // 0–100
    fitness:   number; // 0–100
    fatigue:   number; // 0–100
}

export interface PersonalityAttributes {
    adaptability:    AttributeNumber;
    ambition:        AttributeNumber;
    controversy:     AttributeNumber;
    loyalty:         AttributeNumber;
    pressure:        AttributeNumber;
    professionalism: AttributeNumber;
    sportsmanship:   AttributeNumber;
    temperament:     AttributeNumber;
}

export interface ReputationAttributes {
    current: number;
    home:    number;
    world:   number;
}

export interface AbilityAttributes {
    morale: number; // 0–100
}

// ── Staff / Coach-specific groups ─────────────────────────

export interface StaffAttributes {
    manager:         AttributeNumber;
    assistantManager:AttributeNumber;
    coach:           AttributeNumber;
    physio:          AttributeNumber;
    scout:           AttributeNumber;
    goalkeeperCoach: AttributeNumber;
    fitness:         AttributeNumber;
    pieceCoach:      AttributeNumber;
    dOf:             AttributeNumber;
    headOfYouthDev:  AttributeNumber;
    loadManager:     AttributeNumber;
    dataAnalyst:     AttributeNumber;
    sportsScientist: AttributeNumber;
    technicalDirector: AttributeNumber;
}

export interface CoachingAttributes {
    attacking:    AttributeNumber;
    defending:    AttributeNumber;
    fitness:      AttributeNumber;
    goalkeeping:  AttributeNumber;
    possession:   AttributeNumber;
    tactical:     AttributeNumber;
    technical:    AttributeNumber;
    setPieces:    AttributeNumber;
    youngsters:   AttributeNumber;
}

export interface MedicalAttributes {
    physiotherapy: AttributeNumber;
    sportsScience: AttributeNumber;
}

export interface StaffMentalAttributes {
    adaptability: AttributeNumber;
    authority:    AttributeNumber;
    determination:AttributeNumber;
    motivating:   AttributeNumber;
    peopleMgmt:   AttributeNumber;
}

export interface KnowledgeAttributes {
    judgeAbility:    AttributeNumber;
    judgePotential:  AttributeNumber;
    judgeStaff:      AttributeNumber;
    negotiating:     AttributeNumber;
    tactical:        AttributeNumber;
    dataAnalysis:    AttributeNumber;
}

export interface TacticalStyleAttributes {
    attacking:   AttributeNumber;
    defLine:     AttributeNumber;
    directness:  AttributeNumber;
    flexibility: AttributeNumber;
    tempo:       AttributeNumber;
    width:       AttributeNumber;
    triggerPress:AttributeNumber;
    rotation:    AttributeNumber;
    hardness:    AttributeNumber;
    dirtiness:   AttributeNumber;
    versatility: AttributeNumber;
}

export interface BoardAttributes {
    buyingPlayers: AttributeNumber;
    business:      AttributeNumber;
    interference:  AttributeNumber;
    mindGames:     AttributeNumber;
    patience:      AttributeNumber;
    resources:     AttributeNumber;
}

// ── Goalkeeper-specific technical attrs ───────────────────
// Хранятся как optional extension на TechnicalAttributes
// чтобы не загромождать полевых игроков.
export interface GoalkeeperAttributes {
    aerialReach:   AttributeNumber;
    commandOfArea: AttributeNumber;
    communication: AttributeNumber;
    eccentricity:  AttributeNumber;
    handling:      AttributeNumber;
    kicking:       AttributeNumber;
    oneOnOnes:     AttributeNumber;
    punching:      AttributeNumber;
    reflexes:      AttributeNumber;
    rushingOut:    AttributeNumber;
    throwing:      AttributeNumber;
}

// ── Person ────────────────────────────────────────────────

export type PersonRole = "player" | "coach";

export interface Person {
    id:          string;
    name:        string;
    role:        PersonRole;
    age:         number;
    nationality: string;

    // ── Shared attrs (все личности) ───────────────────────
    ability:      AbilityAttributes;
    reputation:   ReputationAttributes;
    personality:  PersonalityAttributes;
    hidden:       HiddenAttributes;
    condition:    ConditionAttributes;
    mental:       MentalAttributes;

    // ── Player attrs (role === "player") ──────────────────
    technical:    TechnicalAttributes;
    physical:     PhysicalAttributes;
    foot:         FootednessAttributes;
    pieces:       PiecesAttributes;
    goalkeeper?:  GoalkeeperAttributes;   // только для GK

    // ── Staff / Coach attrs (role === "coach") ────────────
    staff:        StaffAttributes;
    coaching:     CoachingAttributes;
    medical:      MedicalAttributes;
    staffMental:  StaffMentalAttributes;
    knowledge:    KnowledgeAttributes;
    tacticalStyle:TacticalStyleAttributes;
    board:        BoardAttributes;
}

// ── Helpers ───────────────────────────────────────────────

/** Зажать значение в диапазон 1–20 */
export function clampAttr(v: number): AttributeNumber {
    return Math.max(1, Math.min(20, Math.round(v)));
}

/** Дефолтные нули для групп атрибутов — удобно при создании */
export function defaultTechnical(): TechnicalAttributes {
    return { crossing:1, dribbling:1, finishing:1, firstTouch:1, heading:1,
        longShots:1, longThrows:1, marking:1, passing:1, tackling:1, technique:1 };
}
export function defaultMental(): MentalAttributes {
    return { aggression:1, anticipation:1, bravery:1, composure:1, concentration:1,
        decisions:1, determination:1, flair:1, leadership:1, offTheBall:1,
        positioning:1, teamwork:1, vision:1, workRate:1 };
}
export function defaultPhysical(): PhysicalAttributes {
    return { acceleration:1, agility:1, balance:1, jumpingReach:1,
        naturalFitness:1, pace:1, stamina:1, strength:1 };
}
export function defaultHidden(): HiddenAttributes {
    return { currentAbility:1, potentialAbility:1, consistency:1,
        importantMatches:1, injuryProneness:1, dirtiness:1, versatility:1 };
}
export function defaultPieces(): PiecesAttributes {
    return { corners:1, freeKickTaking:1, longThrows:1, penaltyTaking:1 };
}
export function defaultFoot(): FootednessAttributes {
    return { left:10, right:15 };
}
export function defaultCondition(): ConditionAttributes {
    return { sharpness:80, fitness:100, fatigue:0 };
}
export function defaultPersonality(): PersonalityAttributes {
    return { adaptability:10, ambition:10, controversy:5, loyalty:10,
        pressure:10, professionalism:10, sportsmanship:10, temperament:10 };
}
export function defaultReputation(): ReputationAttributes {
    return { current:1, home:1, world:1 };
}
export function defaultAbility(): AbilityAttributes {
    return { morale:80 };
}
export function defaultStaff(): StaffAttributes {
    return { manager:1, assistantManager:1, coach:1, physio:1, scout:1,
        goalkeeperCoach:1, fitness:1, pieceCoach:1, dOf:1,
        headOfYouthDev:1, loadManager:1, dataAnalyst:1,
        sportsScientist:1, technicalDirector:1 };
}
export function defaultCoaching(): CoachingAttributes {
    return { attacking:1, defending:1, fitness:1, goalkeeping:1, possession:1,
        tactical:1, technical:1, setPieces:1, youngsters:1 };
}
export function defaultMedical(): MedicalAttributes {
    return { physiotherapy:1, sportsScience:1 };
}
export function defaultStaffMental(): StaffMentalAttributes {
    return { adaptability:1, authority:1, determination:1, motivating:1, peopleMgmt:1 };
}
export function defaultKnowledge(): KnowledgeAttributes {
    return { judgeAbility:1, judgePotential:1, judgeStaff:1,
        negotiating:1, tactical:1, dataAnalysis:1 };
}
export function defaultTacticalStyle(): TacticalStyleAttributes {
    return { attacking:10, defLine:10, directness:10, flexibility:10, tempo:10,
        width:10, triggerPress:10, rotation:10, hardness:5, dirtiness:5, versatility:10 };
}
export function defaultBoard(): BoardAttributes {
    return { buyingPlayers:10, business:10, interference:5,
        mindGames:10, patience:10, resources:10 };
}

/** Создать Person с полными дефолтами */
export function createPerson(partial: Pick<Person, "id" | "name" | "role"> & Partial<Person>): Person {
    return {
        age:          partial.age         ?? 25,
        nationality:  partial.nationality ?? "Unknown",
        ability:      partial.ability     ?? defaultAbility(),
        reputation:   partial.reputation  ?? defaultReputation(),
        personality:  partial.personality ?? defaultPersonality(),
        hidden:       partial.hidden      ?? defaultHidden(),
        condition:    partial.condition   ?? defaultCondition(),
        mental:       partial.mental      ?? defaultMental(),
        technical:    partial.technical   ?? defaultTechnical(),
        physical:     partial.physical    ?? defaultPhysical(),
        foot:         partial.foot        ?? defaultFoot(),
        pieces:       partial.pieces      ?? defaultPieces(),
        goalkeeper:   partial.goalkeeper,
        staff:        partial.staff       ?? defaultStaff(),
        coaching:     partial.coaching    ?? defaultCoaching(),
        medical:      partial.medical     ?? defaultMedical(),
        staffMental:  partial.staffMental ?? defaultStaffMental(),
        knowledge:    partial.knowledge   ?? defaultKnowledge(),
        tacticalStyle:partial.tacticalStyle ?? defaultTacticalStyle(),
        board:        partial.board       ?? defaultBoard(),
        ...partial,
    };
}

// ── Overall rating helpers ────────────────────────────────

/** Взвешенный overall для полевого игрока (1–20) */
export function playerOverall(p: Person): number {
    const t = p.technical;
    const m = p.mental;
    const ph = p.physical;
    const sum =
        t.passing * 2 + t.finishing * 2 + t.dribbling + t.firstTouch +
        t.tackling + t.technique + t.crossing +
        m.decisions * 2 + m.vision * 2 + m.composure + m.anticipation +
        m.offTheBall + m.positioning + m.workRate +
        ph.pace * 2 + ph.acceleration + ph.stamina + ph.strength;
    const count = 2+2+1+1+1+1+1 + 2+2+1+1+1+1+1 + 2+1+1+1;
    return Math.round(sum / count);
}

/** Overall для вратаря (1–20) */
export function goalkeeperOverall(p: Person): number {
    const gk = p.goalkeeper;
    if (!gk) return playerOverall(p);
    const m = p.mental;
    const ph = p.physical;
    const sum =
        gk.reflexes * 3 + gk.handling * 2 + gk.oneOnOnes * 2 +
        gk.aerialReach + gk.commandOfArea + m.positioning +
        m.decisions + m.concentration + m.composure +
        ph.agility * 2 + ph.acceleration;
    const count = 3+2+2+1+1+1+1+1+1+2+1;
    return Math.round(sum / count);
}

/** Overall тренера на основе coaching + tacticalStyle */
export function coachOverall(p: Person): number {
    const c = p.coaching;
    const ts = p.tacticalStyle;
    const sum =
        c.tactical * 3 + c.attacking * 2 + c.defending * 2 +
        c.possession + c.technical + c.setPieces +
        ts.flexibility * 2 + ts.tempo + ts.triggerPress;
    const count = 3+2+2+1+1+1+2+1+1;
    return Math.round(sum / count);
}