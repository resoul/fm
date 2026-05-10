// ============================================================
// CoachProfile — A.1
//
// Тренер — это Person с role === "coach".
// CoachProfile = Person + контрактные / клубные поля.
//
// Личность тренера читается напрямую из Person:
//   tacticalStyle.attacking   → агрессивность атаки
//   tacticalStyle.defLine     → склонность к высокой линии
//   tacticalStyle.triggerPress → интенсивность прессинга
//   tacticalStyle.flexibility → адаптивность
//   coaching.tactical         → тактический IQ
//   coaching.attacking/defending → предпочтение сторон
//
// CoachSystem использует именно эти значения.
// ============================================================

import { createPerson, defaultCoaching, defaultTacticalStyle } from "../person";
import type { Person, TacticalStyleAttributes, CoachingAttributes } from "../person";
import type { TacticalStyle } from "../systems/TacticalInstructionsSystem";

export interface CoachProfile {
    /** Полная структура Person */
    person: Person;

    // ── Контрактные поля ──────────────────────────────────
    clubId?: string;
    wage:    number;        // weekly wage in K€
    contractEnds: number;  // season number

    // ── Тактические предпочтения ──────────────────────────
    preferredStyle:     TacticalStyle;
    preferredFormation: string;

    /** Источник решений о заменах */
    substitutionBias: "fatigue" | "tactical" | "scoreline";
    /** Активная ротация состава */
    rotationHeavy: boolean;
}

// ── Шорткаты для чтения личности из Person ───────────────

/** Перевод атрибута 1–20 в диапазон 0–100 */
export function scaleAttr(v: number): number {
    return Math.round(Math.max(0, Math.min(100, (v - 1) / 19 * 100)));
}

/** 0–100: насколько агрессивно тренер меняет стиль/замены */
export function coachAggressiveness(p: Person): number {
    return scaleAttr(p.tacticalStyle.attacking);
}

/** 0–100: скорость реакции на наблюдения MatchAnalyzer */
export function coachAdaptability(p: Person): number {
    return scaleAttr(p.tacticalStyle.flexibility);
}

/** 0–100: готовность рисковать когда проигрываем */
export function coachRiskTolerance(p: Person): number {
    return scaleAttr(Math.round((p.tacticalStyle.attacking + (20 - p.tacticalStyle.defLine)) / 2));
}

/** 0–100: тяготение к оборонительному блоку */
export function coachDefensiveMindset(p: Person): number {
    return Math.round(
        (scaleAttr(20 - p.tacticalStyle.attacking) + scaleAttr(p.tacticalStyle.defLine)) / 2
    );
}

// ── Фабрики архетипов ─────────────────────────────────────

type ArchetypeOverride = {
    name:               string;
    tacticalStyle?:     Partial<TacticalStyleAttributes>;
    coaching?:          Partial<CoachingAttributes>;
    preferredStyle:     TacticalStyle;
    preferredFormation: string;
    substitutionBias:   CoachProfile["substitutionBias"];
    rotationHeavy:      boolean;
};

function makeCoachProfile(id: string, o: ArchetypeOverride): CoachProfile {
    const person = createPerson({
        id,
        name: o.name,
        role: "coach",
        tacticalStyle: { ...defaultTacticalStyle(), ...o.tacticalStyle },
        coaching:      { ...defaultCoaching(),       ...o.coaching      },
    });
    return {
        person,
        wage:               0,
        contractEnds:       0,
        preferredStyle:     o.preferredStyle,
        preferredFormation: o.preferredFormation,
        substitutionBias:   o.substitutionBias,
        rotationHeavy:      o.rotationHeavy,
    };
}

export const COACH_ARCHETYPES = {

    aggressive: makeCoachProfile("coach_aggressive", {
        name: "Aggressive Coach",
        tacticalStyle: { attacking: 17, defLine: 5, triggerPress: 16, flexibility: 14, tempo: 16 },
        coaching:      { attacking: 16, defending: 8, tactical: 14 },
        preferredStyle:     "gegenpress",
        preferredFormation: "4-3-3",
        substitutionBias:   "scoreline",
        rotationHeavy:      false,
    }),

    conservative: makeCoachProfile("coach_conservative", {
        name: "Conservative Coach",
        tacticalStyle: { attacking: 5, defLine: 15, triggerPress: 5, flexibility: 8, tempo: 6 },
        coaching:      { attacking: 7, defending: 17, tactical: 13 },
        preferredStyle:     "low_block",
        preferredFormation: "4-5-1",
        substitutionBias:   "fatigue",
        rotationHeavy:      true,
    }),

    balanced: makeCoachProfile("coach_balanced", {
        name: "Balanced Coach",
        tacticalStyle: { attacking: 11, defLine: 11, triggerPress: 11, flexibility: 13, tempo: 11 },
        coaching:      { attacking: 12, defending: 12, tactical: 14 },
        preferredStyle:     "balanced",
        preferredFormation: "4-4-2",
        substitutionBias:   "tactical",
        rotationHeavy:      false,
    }),

    possession: makeCoachProfile("coach_possession", {
        name: "Possession Coach",
        tacticalStyle: { attacking: 9, defLine: 9, triggerPress: 7, flexibility: 11, tempo: 5, width: 15 },
        coaching:      { possession: 18, technical: 16, tactical: 15 },
        preferredStyle:     "tiki_taka",
        preferredFormation: "4-3-3",
        substitutionBias:   "tactical",
        rotationHeavy:      true,
    }),

    direct: makeCoachProfile("coach_direct", {
        name: "Direct Coach",
        tacticalStyle: { attacking: 14, defLine: 8, directness: 17, tempo: 16, flexibility: 10 },
        coaching:      { attacking: 15, defending: 10, tactical: 11 },
        preferredStyle:     "direct_play",
        preferredFormation: "4-4-2",
        substitutionBias:   "scoreline",
        rotationHeavy:      false,
    }),

} satisfies Record<string, CoachProfile>;

export type CoachArchetypeName = keyof typeof COACH_ARCHETYPES;

/** Создать кастомный CoachProfile поверх архетипа */
export function createCoach(
    base: CoachArchetypeName,
    overrides: Partial<Omit<CoachProfile, "person">> & {
        id: string;
        name: string;
        tacticalStyle?: Partial<TacticalStyleAttributes>;
        coaching?:      Partial<CoachingAttributes>;
    },
): CoachProfile {
    const arch = COACH_ARCHETYPES[base];
    const person = createPerson({
        ...arch.person,
        id:            overrides.id,
        name:          overrides.name,
        tacticalStyle: { ...arch.person.tacticalStyle, ...overrides.tacticalStyle },
        coaching:      { ...arch.person.coaching,      ...overrides.coaching      },
    });
    return {
        ...arch,
        ...overrides,
        person,
    };
}