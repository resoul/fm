import { useMemo, useState } from "react";
import { DEFAULT_FIELD } from "@/simulate/matchEngine";
import { MatchSimulation } from "@/simulate/headless";
import { buildMatchTeam } from "@/simulate/teamFactory";
import { SeededRandom } from "@/simulate/seededRandom";
import type {
    Club,
    MatchEvent,
    MatchLineup,
    PlayerAttributes,
    PlayerPosition,
    PlayerProfile,
    PlayerRole,
    TeamSide,
} from "@/simulate/types";

interface DemoResult {
    kind: "realtime-slice" | "instant-result";
    score: string;
    minute: number;
    tick: number;
    seed: number;
    homePossession: number;
    awayPossession: number;
    events: MatchEvent[];
    structure: {
        homeClub: Club;
        awayClub: Club;
        homeLineup: MatchLineup;
        awayLineup: MatchLineup;
    };
}

interface TeamQuickProfile {
    club: Club;
    lineup: MatchLineup;
    players: PlayerProfile[];
    attack: number;
    creation: number;
    defense: number;
    keeper: number;
}

const BASE_ATTRIBUTES: PlayerAttributes = {
    acceleration: 70,
    agility: 70,
    balance: 70,
    jumpingReach: 68,
    naturalFitness: 72,
    pace: 70,
    stamina: 72,
    strength: 70,
    aggression: 65,
    anticipation: 68,
    bravery: 68,
    composure: 70,
    concentration: 70,
    decisions: 70,
    determination: 70,
    flair: 62,
    leadership: 62,
    offTheBall: 68,
    positioning: 68,
    teamwork: 70,
    vision: 68,
    workRate: 70,
    corners: 55,
    crossing: 62,
    dribbling: 66,
    finishing: 64,
    firstTouch: 70,
    freeKickTaking: 55,
    heading: 66,
    longShots: 62,
    longThrows: 45,
    marking: 65,
    passing: 70,
    penaltyTaking: 60,
    tackling: 66,
    technique: 70,
    aerialReach: 45,
    commandOfArea: 45,
    communication: 55,
    eccentricity: 40,
    handling: 45,
    kicking: 55,
    oneOnOnes: 45,
    punching: 42,
    reflexes: 45,
    rushingOut: 45,
    throwing: 50,
};

type Enumerate<
    N extends number,
    Acc extends number[] = []
> = Acc['length'] extends N
    ? Acc[number]
    : Enumerate<N, [...Acc, Acc['length']]>;

type Range<F extends number, T extends number> =
    Exclude<Enumerate<T>, Enumerate<F>> | T;

type AttributeNumber = Range<1, 20>;
type Role = "player" | "coach";

interface TechnicalAttributes {
    crossing: AttributeNumber,
    dribbling: AttributeNumber,
    finishing: AttributeNumber,
    firstTouch: AttributeNumber,
    heading: AttributeNumber,
    longShots: AttributeNumber,
    longThrows: AttributeNumber,
    marking: AttributeNumber,
    passing: AttributeNumber,
    tackling: AttributeNumber,
    technique: AttributeNumber,
}

interface PiecesAttributes {
    corners: AttributeNumber,
    freeKickTaking: AttributeNumber,
    longThrows: AttributeNumber,
    penaltyTaking: AttributeNumber,
}

interface MentalAttributes {
    aggression: AttributeNumber,
    anticipation: AttributeNumber,
    bravery: AttributeNumber,
    composure: AttributeNumber,
    concentration: AttributeNumber,
    decisions: AttributeNumber,
    determination: AttributeNumber,
    flair: AttributeNumber,
    leadership: AttributeNumber,
    offTheBall: AttributeNumber,
    positioning: AttributeNumber,
    teamwork: AttributeNumber,
    vision: AttributeNumber,
    workRate: AttributeNumber,
}

interface PhysicalAttributes {
    acceleration: AttributeNumber,
    agility: AttributeNumber,
    balance: AttributeNumber,
    jumpingReach: AttributeNumber,
    naturalFitness: AttributeNumber,
    pace: AttributeNumber,
    stamina: AttributeNumber,
    strength: AttributeNumber,
}

interface HiddenAttributes {
    currentAbility: AttributeNumber,
    potentialAbility: AttributeNumber,
    consistency: AttributeNumber,
    importantMatches: AttributeNumber,
    injuryProneness: AttributeNumber,
    dirtiness: AttributeNumber,
    versatility: AttributeNumber,
}

interface FootednessAttributes {
    left: AttributeNumber,
    right: AttributeNumber,
}

interface ConditionAttributes {
    sharpness: number,
    fitness: number,
    fatigue: number,
}

interface PersonalityAttributes {
    adaptability: AttributeNumber,
    ambition: AttributeNumber,
    controversy: AttributeNumber,
    loyalty: AttributeNumber,
    pressure: AttributeNumber,
    professionalism: AttributeNumber,
    sportsmanship: AttributeNumber,
    temperament: AttributeNumber,
}

interface ReputationAttributes {
    current: number,
    home: number,
    world: number,
}

interface AbilityAttributes {
    morale: number,
}

interface StaffAttributes {
    manager: AttributeNumber,
    assistantManager: AttributeNumber,
    coach: AttributeNumber,
    physio: AttributeNumber,
    scout: AttributeNumber,
    goalkeeperCoach: AttributeNumber,
    fitness: AttributeNumber,
    pieceCoach: AttributeNumber,
    dOf: AttributeNumber,
    headOfYouthDev: AttributeNumber,
    loadManager: AttributeNumber,
    dataAnalyst: AttributeNumber,
    sportsScientist: AttributeNumber,
    technicalDirector: AttributeNumber,
}

interface CoachingAttributes {
    attacking: AttributeNumber,
    defending: AttributeNumber,
    fitness: AttributeNumber,
    goalkeeping: AttributeNumber,
    possession: AttributeNumber,
    tactical: AttributeNumber,
    technical: AttributeNumber,
    setPieces: AttributeNumber,
    youngsters: AttributeNumber,
}

interface MedicalAttributes {
    physiotherapy: AttributeNumber,
    sportsScience: AttributeNumber,
}

interface StaffMentalAttributes {
    adaptability: AttributeNumber,
    authority: AttributeNumber,
    determination: AttributeNumber,
    motivating: AttributeNumber,
    peopleMgmt: AttributeNumber,
}

interface KnowledgeAttributes {
    judgeAbility: AttributeNumber,
    judgePotential: AttributeNumber,
    judgeStaff: AttributeNumber,
    negotiating: AttributeNumber,
    tactical: AttributeNumber,
    dataAnalysis: AttributeNumber,
}

interface TacticalStyleAttributes {
    attacking: AttributeNumber,
    defLine: AttributeNumber,
    directness: AttributeNumber,
    flexibility: AttributeNumber,
    tempo: AttributeNumber,
    width: AttributeNumber,
    triggerPress: AttributeNumber,
    rotation: AttributeNumber,
    hardness: AttributeNumber,
    dirtiness: AttributeNumber,
    versatility: AttributeNumber,
}

interface BoardAttributes {
    buyingPlayers: AttributeNumber,
    business: AttributeNumber,
    interference: AttributeNumber,
    mindGames: AttributeNumber,
    patience: AttributeNumber,
    resources: AttributeNumber,
}

interface Person {
    name: string,
    role: Role,
    // Player Attrs
    ability: AbilityAttributes,
    reputation: ReputationAttributes,
    personality: PersonalityAttributes,
    hidden: HiddenAttributes,
    condition: ConditionAttributes,
    foot: FootednessAttributes,
    pieces: PiecesAttributes,
    technical: TechnicalAttributes,
    mental: MentalAttributes,
    physical: PhysicalAttributes,
    // Staff Attrs
    staff: StaffAttributes,
    coach: CoachingAttributes,
    medical: MedicalAttributes,
    staffMental: StaffMentalAttributes,
    knowledge: KnowledgeAttributes,
    tacticalStyle: TacticalStyleAttributes,
    board: BoardAttributes,
}

console.log({} as Person);


function attrs(overrides: Partial<PlayerAttributes> = {}): PlayerAttributes {
    return { ...BASE_ATTRIBUTES, ...overrides };
}

function roleForPosition(position: PlayerPosition): PlayerRole {
    if (position === "GK") return "GK_Defensive";
    if (position === "CB") return "CB_Stopper";
    if (position === "LB" || position === "RB") return "WB_Defensive";
    if (position === "CM") return "CM_BoxToBox";
    if (position === "LW" || position === "RW" || position === "LM" || position === "RM") return "W_Winger";
    if (position === "CAM") return "CM_Playmaker";
    return "ST_Advanced";
}

function player(
    id: string,
    name: string,
    number: number,
    primaryPosition: PlayerPosition,
    attributeOverrides: Partial<PlayerAttributes> = {},
): PlayerProfile {
    const attributes = attrs(attributeOverrides);
    return {
        id,
        name,
        age: 24,
        nationality: "Demo",
        number,
        primaryPosition,
        alternatePositions: [],
        role: roleForPosition(primaryPosition),
        attributes,
        potential: attributes,
        height: primaryPosition === "GK" || primaryPosition === "CB" ? 190 : 180,
        weight: primaryPosition === "GK" || primaryPosition === "CB" ? 84 : 75,
        wage: 50,
        contractEnds: 3,
        form: 75,
        fitness: 92,
        matchesPlayed: 0,
        goals: 0,
        assists: 0,
    };
}

function makeClub(id: string, side: TeamSide, name: string, color: string, formation: string): Club {
    const prefix = `${side}_demo`;
    const squad = formation === "4-4-2"
        ? [
            player(`${prefix}_gk`, `${name} GK`, 1, "GK", { reflexes: 78, handling: 76, oneOnOnes: 74 }),
            player(`${prefix}_cb1`, `${name} CB A`, 2, "CB", { tackling: 76, marking: 78, strength: 80 }),
            player(`${prefix}_cb2`, `${name} CB B`, 3, "CB", { tackling: 74, marking: 76, concentration: 77 }),
            player(`${prefix}_lb`, `${name} LB`, 4, "LB", { pace: 76, stamina: 78, crossing: 70 }),
            player(`${prefix}_rb`, `${name} RB`, 5, "RB", { pace: 76, stamina: 78, crossing: 70 }),
            player(`${prefix}_lm`, `${name} LM`, 6, "LM", { pace: 78, crossing: 76, dribbling: 74 }),
            player(`${prefix}_cm1`, `${name} CM A`, 7, "CM", { passing: 78, vision: 76, decisions: 75 }),
            player(`${prefix}_cm2`, `${name} CM B`, 8, "CM", { tackling: 74, workRate: 80, stamina: 78 }),
            player(`${prefix}_rm`, `${name} RM`, 9, "RM", { pace: 78, crossing: 76, dribbling: 74 }),
            player(`${prefix}_st1`, `${name} ST A`, 10, "ST", { finishing: 80, offTheBall: 78, composure: 76 }),
            player(`${prefix}_st2`, `${name} ST B`, 11, "ST", { finishing: 76, heading: 80, strength: 78 }),
        ]
        : [
            player(`${prefix}_gk`, `${name} GK`, 1, "GK", { reflexes: 80, handling: 78, oneOnOnes: 76 }),
            player(`${prefix}_cb1`, `${name} CB A`, 2, "CB", { tackling: 78, marking: 78, strength: 82 }),
            player(`${prefix}_cb2`, `${name} CB B`, 3, "CB", { tackling: 76, marking: 76, concentration: 78 }),
            player(`${prefix}_lb`, `${name} LB`, 4, "LB", { pace: 80, stamina: 80, crossing: 74 }),
            player(`${prefix}_rb`, `${name} RB`, 5, "RB", { pace: 79, stamina: 80, crossing: 73 }),
            player(`${prefix}_cm1`, `${name} CM A`, 6, "CM", { passing: 80, vision: 78, decisions: 78 }),
            player(`${prefix}_cm2`, `${name} CM B`, 7, "CM", { tackling: 76, workRate: 82, stamina: 80 }),
            player(`${prefix}_cm3`, `${name} CM C`, 8, "CM", { passing: 76, firstTouch: 78, technique: 78 }),
            player(`${prefix}_lw`, `${name} LW`, 9, "LW", { pace: 84, dribbling: 80, crossing: 76 }),
            player(`${prefix}_st`, `${name} ST`, 10, "ST", { finishing: 82, offTheBall: 80, composure: 78 }),
            player(`${prefix}_rw`, `${name} RW`, 11, "RW", { pace: 83, dribbling: 80, crossing: 75 }),
        ];

    return {
        id,
        name,
        shortName: name.slice(0, 3).toUpperCase(),
        color,
        secondaryColor: "#ffffff",
        budget: 10_000,
        reputation: 75,
        squad,
        defaultFormation: formation,
    };
}

function lineupFor(club: Club): MatchLineup {
    return {
        clubId: club.id,
        formation: club.defaultFormation,
        startingXI: club.squad.slice(0, 11).map(({ id }) => id),
    };
}

export function Page() {
    const setup = useMemo(() => {
        const homeClub = makeClub("scouting_home", "home", "Manual Reds", "#e63946", "4-3-3");
        const awayClub = makeClub("scouting_away", "away", "Manual Blues", "#457b9d", "4-4-2");
        return {
            homeClub,
            awayClub,
            homeLineup: lineupFor(homeClub),
            awayLineup: lineupFor(awayClub),
        };
    }, []);

    const [result, setResult] = useState<DemoResult | null>(null);

    const handleQuickSim = () => {
        const seed = Date.now();
        const homeTeam = buildMatchTeam(setup.homeClub, setup.homeLineup, DEFAULT_FIELD, "home");
        const awayTeam = buildMatchTeam(setup.awayClub, setup.awayLineup, DEFAULT_FIELD, "away");
        const sim = new MatchSimulation({
            homeTeam,
            awayTeam,
            config: { seed },
            mode: "realtime",
        });

        sim.start();
        for (let tick = 0; tick < 60 * 20; tick++) {
            sim.tick();
        }

        const state = sim.getState();
        setResult({
            kind: "realtime-slice",
            score: `${state.homeTeam.score} - ${state.awayTeam.score}`,
            minute: state.state.minute,
            tick: state.state.tick,
            seed,
            homePossession: state.state.stats.home.possession,
            awayPossession: state.state.stats.away.possession,
            events: sim.getEvents().slice(-12),
            structure: setup,
        });
    };

    const handleInstantResult = () => {
        const seed = Date.now();
        const result = simulateInstantResult(setup.homeClub, setup.awayClub, setup.homeLineup, setup.awayLineup, seed);
        setResult({
            kind: "instant-result",
            score: `${result.homeScore} - ${result.awayScore}`,
            minute: 90,
            tick: 0,
            seed,
            homePossession: result.homePossession,
            awayPossession: result.awayPossession,
            events: result.events,
            structure: setup,
        });
    };

    return (
        <div className="space-y-4 p-4 text-sm">
            <div>
                <h1 className="text-lg font-bold text-white">Manual Match Simulation Demo</h1>
                <p className="text-muted-foreground">
                    No generated clubs here: this page creates two manual clubs, builds lineups,
                    converts them to runtime teams, then runs the headless match simulation.
                </p>
            </div>

            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={handleQuickSim}
                    className="rounded-md bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-500"
                >
                    Run 20s realtime structure
                </button>
                <button
                    type="button"
                    onClick={handleInstantResult}
                    className="rounded-md bg-sky-600 px-4 py-2 font-semibold text-white hover:bg-sky-500"
                >
                    Run 90m instant result
                </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <CodeBlock title="1. Manual Club + MatchLineup" value={{
                    homeClub: {
                        id: setup.homeClub.id,
                        name: setup.homeClub.name,
                        formation: setup.homeClub.defaultFormation,
                        players: setup.homeClub.squad.map(({ id, name, primaryPosition }) => ({ id, name, primaryPosition })),
                    },
                    homeLineup: setup.homeLineup,
                }} />

                <CodeBlock title="2. What the button does" value={{
                    realtimeStructure: [
                        "buildMatchTeam(club, lineup, DEFAULT_FIELD, side)",
                        "new MatchSimulation({ homeTeam, awayTeam, config: { seed }, mode: 'realtime' })",
                        "sim.start()",
                        "sim.tick() for 20 in-game seconds",
                        "sim.getState() + sim.getEvents()",
                    ],
                    instantResult: [
                        "buildQuickProfile(club, lineup)",
                        "calculate expected goals from attack/creation/defense/keeper",
                        "sample goals with seeded RNG",
                        "create goal MatchEvent[]",
                    ],
                }} />
            </div>

            {result && (
                <div className="grid gap-4 lg:grid-cols-2">
                    <CodeBlock title="3. Runtime Result" value={{
                        mode: result.kind,
                        score: result.score,
                        minute: result.minute,
                        tick: result.tick,
                        seed: result.seed,
                        possession: {
                            home: result.homePossession,
                            away: result.awayPossession,
                        },
                    }} />

                    <CodeBlock title="4. Recent Match Events" value={result.events.map(event => ({
                        time: `${event.minute}'${String(event.second).padStart(2, "0")}`,
                        type: event.type,
                        teamId: event.teamId,
                        playerName: event.playerName,
                        description: event.description,
                    }))} />
                </div>
            )}
        </div>
    );
}

function simulateInstantResult(
    homeClub: Club,
    awayClub: Club,
    homeLineup: MatchLineup,
    awayLineup: MatchLineup,
    seed: number,
) {
    const rng = new SeededRandom(seed);
    const home = buildQuickProfile(homeClub, homeLineup);
    const away = buildQuickProfile(awayClub, awayLineup);
    const homeXg = expectedGoals(home, away, 0.18);
    const awayXg = expectedGoals(away, home, -0.04);
    const homeScore = samplePoisson(homeXg, rng);
    const awayScore = samplePoisson(awayXg, rng);
    const homePossession = Math.round(50 + (home.creation - away.creation) * 0.35 + rng.nextFloat(-4, 4));
    const safeHomePossession = Math.max(38, Math.min(62, homePossession));

    return {
        homeScore,
        awayScore,
        homePossession: safeHomePossession,
        awayPossession: 100 - safeHomePossession,
        events: [
            ...createGoalEvents(home, homeScore, "home", rng),
            ...createGoalEvents(away, awayScore, "away", rng),
        ].sort((a, b) => a.minute - b.minute || a.second - b.second),
    };
}

function buildQuickProfile(club: Club, lineup: MatchLineup): TeamQuickProfile {
    const players = lineup.startingXI
        .map(id => club.squad.find(candidate => candidate.id === id))
        .filter((candidate): candidate is PlayerProfile => Boolean(candidate));
    const outfield = players.filter(({ primaryPosition }) => primaryPosition !== "GK");
    const keeper = players.find(({ primaryPosition }) => primaryPosition === "GK");

    return {
        club,
        lineup,
        players,
        attack: average(outfield.map(candidate => weightedRating(candidate, ["finishing", "longShots", "dribbling", "offTheBall", "pace", "composure"]))),
        creation: average(outfield.map(candidate => weightedRating(candidate, ["passing", "vision", "technique", "decisions", "teamwork", "firstTouch"]))),
        defense: average(outfield.map(candidate => weightedRating(candidate, ["tackling", "marking", "positioning", "strength", "concentration", "workRate"]))),
        keeper: keeper ? weightedRating(keeper, ["reflexes", "handling", "oneOnOnes", "aerialReach", "positioning", "communication"]) : 55,
    };
}

function expectedGoals(team: TeamQuickProfile, opponent: TeamQuickProfile, homeAdvantage: number): number {
    const attackEdge = (team.attack - opponent.defense) * 0.028;
    const creationEdge = (team.creation - opponent.defense) * 0.018;
    const keeperEdge = (70 - opponent.keeper) * 0.012;
    return Math.max(0.25, Math.min(3.4, 1.18 + homeAdvantage + attackEdge + creationEdge + keeperEdge));
}

function weightedRating(candidate: PlayerProfile, keys: (keyof PlayerAttributes)[]): number {
    return average(keys.map(key => candidate.attributes[key]));
}

function average(values: number[]): number {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function samplePoisson(lambda: number, rng: SeededRandom): number {
    const limit = Math.exp(-lambda);
    let product = 1;
    let count = 0;

    do {
        count++;
        product *= rng.next();
    } while (product > limit);

    return Math.min(7, count - 1);
}

function createGoalEvents(team: TeamQuickProfile, goals: number, side: TeamSide, rng: SeededRandom): MatchEvent[] {
    const scorers = team.players
        .filter(({ primaryPosition }) => primaryPosition !== "GK")
        .sort((a, b) => scorerWeight(b) - scorerWeight(a));

    return Array.from({ length: goals }, (_, index) => {
        const scorer = pickScorer(scorers, rng);
        const minute = Math.min(90, Math.max(1, Math.round(((index + rng.next()) / Math.max(1, goals)) * 88)));
        return {
            id: `scouting_quick_goal_${team.club.id}_${index}_${minute}`,
            type: "goal",
            minute,
            second: rng.nextInt(0, 59),
            teamId: side,
            playerId: scorer?.id ?? null,
            playerName: scorer?.name ?? null,
            description: `Goal for ${team.club.name}${scorer ? ` by ${scorer.name}` : ""}.`,
            pos: { x: DEFAULT_FIELD.width / 2, y: DEFAULT_FIELD.height / 2 },
        };
    });
}

function scorerWeight(candidate: PlayerProfile): number {
    return candidate.attributes.finishing * 0.38
        + candidate.attributes.offTheBall * 0.22
        + candidate.attributes.composure * 0.18
        + candidate.attributes.longShots * 0.12
        + candidate.attributes.heading * 0.1;
}

function pickScorer(players: PlayerProfile[], rng: SeededRandom): PlayerProfile | undefined {
    const total = players.reduce((sum, candidate) => sum + scorerWeight(candidate), 0);
    let roll = rng.nextFloat(0, total);
    for (const candidate of players) {
        roll -= scorerWeight(candidate);
        if (roll <= 0) return candidate;
    }
    return players[players.length - 1];
}

function CodeBlock({ title, value }: { title: string; value: unknown }) {
    return (
        <section className="rounded-lg border border-white/10 bg-black/40 p-4">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-white/50">{title}</h2>
            <pre className="max-h-[420px] overflow-auto rounded bg-black/50 p-3 text-xs leading-relaxed text-emerald-100">
                {JSON.stringify(value, null, 2)}
            </pre>
        </section>
    );
}
