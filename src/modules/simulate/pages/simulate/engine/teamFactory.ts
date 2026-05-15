import type { Player, Team, TeamSide, PlayerPosition, PlayerAttributes, FieldDimensions } from "./types.ts";
import { rngInt } from "./physics.ts";

// ── Formation definitions (relative positions 0-1) ────────
// x=0 = own goal, x=1 = opponent goal
// y=0 = top, y=1 = bottom
type FormationSlot = { position: PlayerPosition; rx: number; ry: number };

const FORMATIONS: Record<string, FormationSlot[]> = {
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
};

// ── Player names pool ─────────────────────────────────────
const FIRST_NAMES = [
    "Luka","Marco","Kai","Noah","Alexei","Carlos","Dante","Emil",
    "Filip","Giorgio","Hassan","Ivan","Javi","Kurt","Leon","Miguel",
    "Nils","Omar","Pierre","Rafael","Sven","Tomas","Ugo","Victor",
    "Willem","Xavi","Yann","Zlatan","Artur","Bruno",
];
const LAST_NAMES = [
    "Silva","Müller","Dembele","Costa","Petrov","Ramos","Ferro","Hansen",
    "Novak","Greco","Osei","Volkov","Torres","Braun","Berg","Santos",
    "Lindqvist","Ayoub","Deschamps","Alves","Johansson","Herrera","Bianchi","Cruz",
    "Smit","Fernandez","Dupont","Eriksen","Gomez","Nkosi",
];

let nameIdx = 0;
function nextName(): string {
    const first = FIRST_NAMES[nameIdx % FIRST_NAMES.length];
    const last  = LAST_NAMES[(nameIdx * 7 + 3) % LAST_NAMES.length];
    nameIdx++;
    return `${first} ${last}`;
}

// ── Attribute generation by position ─────────────────────
function generateAttributes(pos: PlayerPosition): PlayerAttributes {
    const base = (): number => rngInt(55, 85);

    const attrs: Record<PlayerPosition, () => PlayerAttributes> = {
        GK:  () => ({ speed: rngInt(45,65), passing: rngInt(50,70), shooting: rngInt(20,40), stamina: base(), defense: rngInt(75,95), dribbling: rngInt(35,55) }),
        CB:  () => ({ speed: rngInt(55,72), passing: rngInt(55,72), shooting: rngInt(35,55), stamina: base(), defense: rngInt(72,90), dribbling: rngInt(45,62) }),
        LB:  () => ({ speed: rngInt(68,85), passing: rngInt(60,78), shooting: rngInt(45,60), stamina: rngInt(68,85), defense: rngInt(65,82), dribbling: rngInt(55,72) }),
        RB:  () => ({ speed: rngInt(68,85), passing: rngInt(60,78), shooting: rngInt(45,60), stamina: rngInt(68,85), defense: rngInt(65,82), dribbling: rngInt(55,72) }),
        CM:  () => ({ speed: rngInt(62,78), passing: rngInt(70,88), shooting: rngInt(55,72), stamina: rngInt(72,88), defense: rngInt(58,75), dribbling: rngInt(65,80) }),
        LM:  () => ({ speed: rngInt(70,85), passing: rngInt(65,82), shooting: rngInt(60,75), stamina: rngInt(68,85), defense: rngInt(52,68), dribbling: rngInt(68,85) }),
        RM:  () => ({ speed: rngInt(70,85), passing: rngInt(65,82), shooting: rngInt(60,75), stamina: rngInt(68,85), defense: rngInt(52,68), dribbling: rngInt(68,85) }),
        CAM: () => ({ speed: rngInt(65,80), passing: rngInt(75,92), shooting: rngInt(68,85), stamina: rngInt(65,80), defense: rngInt(45,62), dribbling: rngInt(72,88) }),
        LW:  () => ({ speed: rngInt(75,92), passing: rngInt(65,82), shooting: rngInt(68,85), stamina: rngInt(68,82), defense: rngInt(42,58), dribbling: rngInt(72,90) }),
        RW:  () => ({ speed: rngInt(75,92), passing: rngInt(65,82), shooting: rngInt(68,85), stamina: rngInt(68,82), defense: rngInt(42,58), dribbling: rngInt(72,90) }),
        ST:  () => ({ speed: rngInt(72,88), passing: rngInt(58,75), shooting: rngInt(78,95), stamina: rngInt(68,82), defense: rngInt(38,55), dribbling: rngInt(68,85) }),
    };

    return attrs[pos]();
}

// ── Build single player ───────────────────────────────────
function buildPlayer(
    id: string,
    number: number,
    team: TeamSide,
    slot: FormationSlot,
    pos: { x: number; y: number },
): Player {
    return {
        id,
        name: nextName(),
        number,
        team,
        position: slot.position,
        attributes: generateAttributes(slot.position),
        pos: { ...pos },
        vel: { x: 0, y: 0 },
        targetPos: { ...pos },
        state: "idle",
        hasBall: false,
        fatigue: 0,
        actionCooldown: 0,
        kickCooldown: 0,
        targetPlayerId: null,
        passTarget: null,
    };
}

// ── Build team ────────────────────────────────────────────
export function createTeam(
    side: TeamSide,
    name: string,
    color: string,
    secondaryColor: string,
    formation: string,
    field: FieldDimensions,
): Team {
    const slots = FORMATIONS[formation] ?? FORMATIONS["4-3-3"];
    const players: Player[] = [];
    const fw = field.width;
    const fh = field.height;

    slots.forEach((slot, i) => {
        // Home: attacks right (rx goes 0→1 = left→right)
        // Away: mirrored
        let rx = side === "home" ? slot.rx : 1 - slot.rx;
        let ry = slot.ry;
        // Away team mirrors y slightly for symmetry variation
        if (side === "away") ry = 1 - ry;

        const x = fw * rx;
        const y = fh * ry;
        const id = `${side}_${i}`;
        const number = i === 0 ? 1 : i + 1;
        players.push(buildPlayer(id, number, side, slot, { x, y }));
    });

    const emptyStats = () => ({
        shots: 0,
        shotsOnTarget: 0,
        passes: 0,
        passAccuracy: 0,
        possession: 50,
        tackles: 0,
        fouls: 0,
        corners: 0,
    });

    return {
        id: side,
        name,
        color,
        secondaryColor,
        score: 0,
        formation,
        players,
        stats: emptyStats(),
    };
}

// ── Reset player positions to formation ───────────────────
export function resetFormationPositions(
    team: Team,
    field: FieldDimensions,
): void {
    const slots = FORMATIONS[team.formation] ?? FORMATIONS["4-3-3"];
    const fw = field.width;
    const fh = field.height;

    team.players.forEach((player, i) => {
        const slot = slots[i];
        if (!slot) return;
        let rx = team.id === "home" ? slot.rx : 1 - slot.rx;
        let ry = team.id === "home" ? slot.ry : 1 - slot.ry;
        player.targetPos = { x: fw * rx, y: fh * ry };
        player.state = "repositioning";
        player.hasBall = false;
    });
}

export { FORMATIONS };