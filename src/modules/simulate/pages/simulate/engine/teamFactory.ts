import type {
    Player, Team, TeamSide, PlayerPosition, PlayerAttributes,
    FieldDimensions, Club, PlayerProfile, MatchLineup, PlayerRole,
} from "./types";
import { SeededRandom } from "./seededRandom";

const sharedRNG = new SeededRandom(Date.now());
const rngInt = (min: number, max: number) => sharedRNG.nextInt(min, max);
const rng = () => sharedRNG.next();
const rngRange = (min: number, max: number) => sharedRNG.nextFloat(min, max);

// ── Formation definitions (relative positions 0–1) ────────
type FormationSlot = { position: PlayerPosition; rx: number; ry: number };

export const FORMATIONS: Record<string, FormationSlot[]> = {
    "4-3-3": [
        { position: "GK",  rx: 0.03, ry: 0.50 },
        { position: "CB",  rx: 0.22, ry: 0.33 },
        { position: "CB",  rx: 0.22, ry: 0.67 },
        { position: "LB",  rx: 0.18, ry: 0.15 },
        { position: "RB",  rx: 0.18, ry: 0.85 },
        { position: "CM",  rx: 0.45, ry: 0.30 },
        { position: "CM",  rx: 0.50, ry: 0.50 },
        { position: "CM",  rx: 0.45, ry: 0.70 },
        { position: "LW",  rx: 0.72, ry: 0.20 },
        { position: "ST",  rx: 0.80, ry: 0.50 },
        { position: "RW",  rx: 0.72, ry: 0.80 },
    ],
    "4-4-2": [
        { position: "GK",  rx: 0.03, ry: 0.50 },
        { position: "CB",  rx: 0.22, ry: 0.35 },
        { position: "CB",  rx: 0.22, ry: 0.65 },
        { position: "LB",  rx: 0.18, ry: 0.15 },
        { position: "RB",  rx: 0.18, ry: 0.85 },
        { position: "LM",  rx: 0.45, ry: 0.20 },
        { position: "CM",  rx: 0.48, ry: 0.40 },
        { position: "CM",  rx: 0.48, ry: 0.60 },
        { position: "RM",  rx: 0.45, ry: 0.80 },
        { position: "ST",  rx: 0.78, ry: 0.38 },
        { position: "ST",  rx: 0.78, ry: 0.62 },
    ],
    "4-2-3-1": [
        { position: "GK",  rx: 0.03, ry: 0.50 },
        { position: "CB",  rx: 0.22, ry: 0.35 },
        { position: "CB",  rx: 0.22, ry: 0.65 },
        { position: "LB",  rx: 0.18, ry: 0.15 },
        { position: "RB",  rx: 0.18, ry: 0.85 },
        { position: "CM",  rx: 0.40, ry: 0.38 },
        { position: "CM",  rx: 0.40, ry: 0.62 },
        { position: "LW",  rx: 0.60, ry: 0.22 },
        { position: "CAM", rx: 0.62, ry: 0.50 },
        { position: "RW",  rx: 0.60, ry: 0.78 },
        { position: "ST",  rx: 0.80, ry: 0.50 },
    ],
    "3-5-2": [
        { position: "GK",  rx: 0.03, ry: 0.50 },
        { position: "CB",  rx: 0.22, ry: 0.25 },
        { position: "CB",  rx: 0.22, ry: 0.50 },
        { position: "CB",  rx: 0.22, ry: 0.75 },
        { position: "LM",  rx: 0.45, ry: 0.15 },
        { position: "CM",  rx: 0.48, ry: 0.35 },
        { position: "CM",  rx: 0.50, ry: 0.50 },
        { position: "CM",  rx: 0.48, ry: 0.65 },
        { position: "RM",  rx: 0.45, ry: 0.85 },
        { position: "ST",  rx: 0.78, ry: 0.38 },
        { position: "ST",  rx: 0.78, ry: 0.62 },
    ],
};

// ── Player name pool ──────────────────────────────────────
const FIRST_NAMES = ["Luka","Marco","Kai","Noah","Alexei","Carlos","Dante","Emil","Filip","Giorgio","Hassan","Ivan","Javi","Kurt","Leon","Miguel","Nils","Omar","Pierre","Rafael","Sven","Tomas","Ugo","Victor","Willem","Xavi","Yann","Zlatan","Artur","Bruno","Diego","Enzo","Felix","Gabriel","Hugo","Igor","Jakub","Kylian","Lorenzo","Mateo","Nicolas","Oscar","Pablo","Quinn","Ricardo","Stefan","Theo","Uriel"];
const LAST_NAMES = ["Silva","Müller","Dembele","Costa","Petrov","Ramos","Ferro","Hansen","Novak","Greco","Osei","Volkov","Torres","Braun","Berg","Santos","Lindqvist","Ayoub","Deschamps","Alves","Johansson","Herrera","Bianchi","Cruz","Smit","Fernandez","Dupont","Eriksen","Gomez","Nkosi","Popov","Ribeiro","Schmidt","Tanaka","Uchida","Varela","Wagner","Xavier","Yamamoto","Zidane"];
const NATIONALITIES = ["Brazilian","German","French","Spanish","Portuguese","Argentine","Italian","English","Dutch","Belgian","Croatian","Senegalese","Nigerian","Ghanaian","Moroccan","Mexican","Colombian","Chilean","Uruguayan","Japanese","Korean"];

let _nameIdx = 0;
function nextName(): string {
    const first = FIRST_NAMES[_nameIdx % FIRST_NAMES.length];
    const last  = LAST_NAMES[(_nameIdx * 7 + 3) % LAST_NAMES.length];
    _nameIdx++;
    return `${first} ${last}`;
}
function randomNationality(): string {
    return NATIONALITIES[Math.floor(rng() * NATIONALITIES.length)];
}

// ── Attribute generation by position ─────────────────────
function generateAttributes(pos: PlayerPosition, quality: number = 75): PlayerAttributes {
    const spread = 20;
    const base = (q: number) => Math.round(Math.min(99, Math.max(35, q - spread/2 + rng() * spread)));

    const attrs: Partial<PlayerAttributes> = {};
    const allKeys: (keyof PlayerAttributes)[] = [
        "acceleration", "agility", "balance", "jumpingReach", "naturalFitness", "pace", "stamina", "strength",
        "aggression", "anticipation", "bravery", "composure", "concentration", "decisions", "determination", "flair", "leadership", "offTheBall", "positioning", "teamwork", "vision", "workRate",
        "corners", "crossing", "dribbling", "finishing", "firstTouch", "freeKickTaking", "heading", "longShots", "longThrows", "marking", "passing", "penaltyTaking", "tackling", "technique",
        "aerialReach", "commandOfArea", "communication", "eccentricity", "handling", "kicking", "oneOnOnes", "punching", "reflexes", "rushingOut", "throwing"
    ];

    // Initialize with randomized base quality
    allKeys.forEach(k => {
        attrs[k] = base(quality - 10);
    });

    // Position-specific bonuses
    if (pos === "GK") {
        const gkKeys: (keyof PlayerAttributes)[] = ["reflexes", "handling", "oneOnOnes", "aerialReach", "commandOfArea", "throwing", "kicking"];
        gkKeys.forEach(k => attrs[k] = base(quality + 15));
        attrs.agility = base(quality + 10);
    } else {
        // Physical bonuses
        if (["LW", "RW", "ST", "LB", "RB"].includes(pos)) {
            attrs.pace = base(quality + 12);
            attrs.acceleration = base(quality + 12);
            attrs.agility = base(quality + 8);
        }
        if (["CB", "ST"].includes(pos)) {
            attrs.strength = base(quality + 15);
            attrs.jumpingReach = base(quality + 15);
            attrs.heading = base(quality + 12);
        }
        // Mental bonuses
        if (["CM", "CAM"].includes(pos)) {
            attrs.vision = base(quality + 15);
            attrs.passing = base(quality + 15);
            attrs.technique = base(quality + 12);
            attrs.decisions = base(quality + 10);
        }
        // Technical bonuses
        if (["ST", "LW", "RW", "CAM"].includes(pos)) {
            attrs.finishing = base(quality + 15);
            attrs.dribbling = base(quality + 12);
            attrs.firstTouch = base(quality + 10);
        }
        if (["CB", "LB", "RB", "CM"].includes(pos)) {
            attrs.tackling = base(quality + 15);
            attrs.marking = base(quality + 15);
            attrs.positioning = base(quality + 12);
        }
    }

    return attrs as PlayerAttributes;
}

function getDefaultRole(pos: PlayerPosition): PlayerRole {
    switch (pos) {
        case "GK": return "GK_Defensive";
        case "CB": return "CB_Stopper";
        case "LB":
        case "RB": return "WB_Defensive";
        case "CM": return "CM_BoxToBox";
        case "LM":
        case "RM": return "W_Winger";
        case "CAM": return "CM_Playmaker";
        case "LW":
        case "RW": return "W_Winger";
        case "ST": return "ST_Advanced";
        default: return "ST_Advanced";
    }
}

function generateBio(pos: PlayerPosition): { height: number; weight: number } {
    let h = 180;
    let w = 75;
    if (pos === "GK" || pos === "CB") {
        h = rngInt(185, 202);
        w = rngInt(80, 95);
    } else if (["LW", "RW", "LM", "RM"].includes(pos)) {
        h = rngInt(165, 182);
        w = rngInt(60, 75);
    } else {
        h = rngInt(175, 188);
        w = rngInt(70, 85);
    }
    return { height: h, weight: w };
}

function generatePotential(base: PlayerAttributes, age: number): PlayerAttributes {
    const growthFactor = age <= 21 ? 1.15 : age <= 24 ? 1.08 : age <= 28 ? 1.03 : 0.98;
    const result: Partial<PlayerAttributes> = {};
    for (const key of Object.keys(base) as (keyof PlayerAttributes)[]) {
        result[key] = Math.min(99, Math.round(base[key] * growthFactor + rng() * 5));
    }
    return result as PlayerAttributes;
}

export function buildPlayerProfile(id: string, number: number, position: PlayerPosition, quality: number): PlayerProfile {
    const age = rngInt(17, 35);
    const attrs = generateAttributes(position, quality);
    const bio = generateBio(position);
    return {
        id,
        name: nextName(),
        age,
        nationality: randomNationality(),
        number,
        primaryPosition: position,
        alternatePositions: [],
        role: getDefaultRole(position),
        attributes: attrs,
        potential: generatePotential(attrs, age),
        height: bio.height,
        weight: bio.weight,
        wage: Math.round((quality - 50) * 2 + rng() * 20) * 5,
        contractEnds: rngInt(1, 4),
        form: Math.round(50 + rng() * 50),
        fitness: Math.round(70 + rng() * 30),
        matchesPlayed: rngInt(0, 30),
        goals: 0,
        assists: 0,
    };
}

export function generateClub(id: string, name: string, shortName: string, color: string, secondaryColor: string, formation: string, quality: number = 75): Club {
    const slots = FORMATIONS[formation] ?? FORMATIONS["4-3-3"];
    const squad: PlayerProfile[] = [];
    slots.forEach((slot, i) => {
        const profile = buildPlayerProfile(`${id}_p${i}`, i + 1, slot.position, quality);
        squad.push(profile);
    });
    const benchPositions: PlayerPosition[] = ["GK", "CB", "LB", "CM", "LW", "ST", "RW"];
    benchPositions.forEach((pos, i) => {
        const profile = buildPlayerProfile(`${id}_b${i}`, 12 + i, pos, quality - 8);
        squad.push(profile);
    });
    return { id, name, shortName, color, secondaryColor, budget: Math.round((quality - 50) * 50 + rng() * 200) * 100, reputation: quality, squad, defaultFormation: formation };
}

function applyFitnessForm(attrs: PlayerAttributes, fitness: number, form: number): PlayerAttributes {
    const fitnessFactor = fitness >= 70 ? 1.0 : 0.85 + (fitness / 70) * 0.15;
    const formFactor = 0.90 + (form / 100) * 0.15;
    const result: Partial<PlayerAttributes> = {};
    for (const key of Object.keys(attrs) as (keyof PlayerAttributes)[]) {
        // Physicals are affected by fitness, Technicals/Mentals by form
        const isPhysical = ["acceleration", "agility", "balance", "jumpingReach", "pace", "stamina", "strength"].includes(key);
        result[key] = Math.round(attrs[key] * (isPhysical ? fitnessFactor : formFactor));
    }
    return result as PlayerAttributes;
}

export function buildMatchTeam(club: Club, lineup: MatchLineup, field: FieldDimensions, side: TeamSide): Team {
    const slots = FORMATIONS[lineup.formation] ?? FORMATIONS["4-3-3"];
    const fw = field.width;
    const fh = field.height;

    const players: Player[] = lineup.startingXI.map((profileId, slotIdx) => {
        const profile = club.squad.find(p => p.id === profileId);
        const slot    = slots[slotIdx] ?? slots[0];
        const rx = side === "home" ? slot.rx : 1 - slot.rx;
        const ry = side === "home" ? slot.ry : 1 - slot.ry;

        const player: Player = {
            id:         profileId,
            name:       profile?.name ?? `Player ${slotIdx + 1}`,
            number:     profile?.number ?? slotIdx + 1,
            team:       side,
            position:   slot.position,
            attributes: profile ? applyFitnessForm(profile.attributes, profile.fitness, profile.form) : generateAttributes(slot.position, 70),
            role:       profile?.role ?? getDefaultRole(slot.position),
            height:     profile?.height ?? 180,
            weight:     profile?.weight ?? 75,
            pos:        { x: fw * rx, y: fh * ry },
            vel:        { x: 0, y: 0 },
            targetPos:  { x: fw * rx, y: fh * ry },
            state:      "idle",
            hasBall:    false,
            fatigue:    profile ? (1 - profile.fitness / 100) * 0.3 : 0,
            actionCooldown: 0,
            kickCooldown:   0,
            nextDecision:    null,
            targetPlayerId: null,
            passTarget:     null,
            profileId:      profileId,
        };
        return player;
    });

    return { id: side, name: club.name, color: club.color, secondaryColor: club.secondaryColor, score: 0, formation: lineup.formation, players, stats: { shots: 0, shotsOnTarget: 0, passes: 0, passAccuracy: 0, possession: 50, tackles: 0, fouls: 0, corners: 0, xg: 0 } };
}

export function autoSelectLineup(club: Club, formation?: string): MatchLineup {
    const fmt = formation ?? club.defaultFormation;
    const slots = FORMATIONS[fmt] ?? FORMATIONS["4-3-3"];
    const usedIds = new Set<string>();
    const startingXI: string[] = [];
    for (const slot of slots) {
        const candidate = club.squad.find(p => !usedIds.has(p.id) && p.primaryPosition === slot.position) ?? club.squad.find(p => !usedIds.has(p.id));
        if (candidate) {
            startingXI.push(candidate.id);
            usedIds.add(candidate.id);
        }
    }
    return { clubId: club.id, formation: fmt, startingXI };
}

export function createTeam(side: TeamSide, name: string, color: string, secondaryColor: string, formation: string, field: FieldDimensions): Team {
    const club = generateClub(`legacy_${side}`, name, name.slice(0, 3).toUpperCase(), color, secondaryColor, formation, 72);
    const lineup = autoSelectLineup(club, formation);
    return buildMatchTeam(club, lineup, field, side);
}

export function resetFormationPositions(team: Team, field: FieldDimensions): void {
    const slots = FORMATIONS[team.formation] ?? FORMATIONS["4-3-3"];
    const fw = field.width;
    const fh = field.height;
    team.players.forEach((player, i) => {
        const slot = slots[i];
        if (!slot) return;
        const rx = team.id === "home" ? slot.rx : 1 - slot.rx;
        const ry = team.id === "home" ? slot.ry : 1 - slot.ry;
        player.targetPos = { x: fw * rx, y: fh * ry };
        player.state     = "repositioning";
        player.hasBall   = false;
    });
}

export function updatePlayerAfterMatch(profile: PlayerProfile, minutesPlayed: number, scored: number, assisted: number, teamWon: boolean): PlayerProfile {
    const fatigueCost = Math.round((minutesPlayed / 90) * 25);
    const newFitness  = Math.max(30, profile.fitness - fatigueCost);
    let formDelta = scored * 12 + assisted * 8 + (teamWon ? 5 : -5) + (minutesPlayed >= 60 ? 3 : -3) + rngRange(-5, 5);
    return { ...profile, fitness: newFitness, form: Math.min(100, Math.max(0, profile.form + formDelta)), matchesPlayed: profile.matchesPlayed + 1, goals: profile.goals + scored, assists: profile.assists + assisted };
}

export function recoverFitness(profile: PlayerProfile, daysSinceMatch: number): PlayerProfile {
    const recovery = Math.min(daysSinceMatch * 8, 40);
    return { ...profile, fitness: Math.min(100, profile.fitness + recovery) };
}
