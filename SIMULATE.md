# Football Simulation Engine — Updated Plan (May 2026)

---

## Статус на сегодня

Кодовая база существенно опережает исходный план. Ниже — честная сверка по коду.

### ✅ Полностью реализовано

- **Command System** — `CommandResolver`, типизированные команды, registry handlers
- **Immutable Safety** — `RefereeSystem` и большинство систем через команды
- **Tactical States** — 5 фаз: `in_possession / transition_attack / out_of_possession / transition_defend / set_piece`
- **Utility AI** — `ShootAction`, `PassAction`, `DribbleAction`, `HoldAction` со scoring
- **Off-ball Intelligence** — `OffBallSystem` с 6 типами ранов, leash через `ZoneSystem`
- **Space Awareness** — `SpaceAwareness.ts`, pressure penalty, defensive line
- **Team Shape System** — `TeamShape.ts`, compactness/width/depth
- **Tactical Instructions** — `TacticalInstructionsSystem`: width, tempo, directness, pressLine, overlaps, compactness
- **Role Behaviors** — 14 ролей с профилями leash/pressBias/forwardRunBias
- **Tactical Identity** — 5 стилей: `tiki_taka`, `gegenpress`, `low_block`, `direct_play`, `balanced`
- **Possession Chains** — `ChainTracker`, chain phase влияет на UtilityAI
- **Momentum System** — `MomentumSystem.ts`: confidence spike, shock, speed bonus
- **Match Rhythm System** — `MatchRhythmSystem.ts`: tempoDelta, directnessDelta, protecting lead, chasing game, desperate
- **Realistic Error Model** — `computePassError`, `computeShotError`, все константы в `balance.ts`
- **Restart Intelligence** — corner / throwin / goalkick / freekick с тактическими позициями
- **Commentary System** — `CommentarySystem.ts`: контекстные фразы по xG, phase, rhythm, scoreDiff
- **Highlights Panel** — фильтрация голов, ударов, сейвов, угловых; показывает xG
- **Tactical Overlays** — `showZones`, `showPassingLanes`, `showDefensiveLine`, `showPressureHeatmap` в рендерере
- **Replay System** — `ReplayManager`, `ReplaySimulator`, jump-to-tick в UI

### 🔧 Частично реализовано

- **PlayerAttributes** — FM-стиль типизирован полностью (30+ атрибутов), но в `UtilityAI` используются только 5: `finishing`, `composure`, `technique`, `longShots`, `vision`
- **xG Pipeline** — работает (dist, angle, pressure, composure, reflexes, GK), нет: body part, assist type, cutback detection
- **Ball Physics** — bounce, trajectory, height. Нет: spin, rolling friction, curved flight
- **Movement Model** — acceleration, fatigue, deceleration. Нет: turning inertia, body facing, turning radius
- **Tick Pipeline** — `TickRunner`, `pipeline.ts`, `systems.ts` существуют. Нет: formal read/write contracts, conflict detection
- **Event Bus** — `eventBus.ts`, `EventStore.ts` существуют. Нет: строгого разделения Simulation / Presentation / Analytics

### ❌ Не реализовано

- **CoachSystem** — тренер как агент, принимающий решения по ходу матча
- **MatchAnalyzer** — анализ паттернов матча в реальном времени
- **Intent / Commitment Architecture** — `commitTick`, `reevaluateAt`, hesitation
- **Perception System** — vision cone, awareness delay, pressure blindness
- **Collision / Shielding Layer** — body duels, shielding, loose-ball scrambles
- **PlayerMatchStats** — per-player статистика: touches, chances created, xGChain, heatmap, rating
- **TeamAdvancedStats** — PPDA, press success rate, average defensive line height
- **PostMatchReport** — итоговый отчёт с оценками игроков и тренерским анализом
- **Form & Fatigue Model** — persist fatigue/form между матчами, влияние на атрибуты
- **Deterministic Tests** — same seed → same result; `seededRandom.ts` есть, harness нет
- **League Simulation** — persistence между матчами, ротация состава
- **Metrics Dashboard** — PPDA, passes per possession, transition speed, analytics UI

---

## Главные архитектурные проблемы прямо сейчас

1. **Атрибуты — дорогой мёртвый груз.** 30+ FM-атрибутов в типах, но `vision` не влияет на видимость паса, `decisions` не влияет на скорость реакции, `agility` не влияет на разворот. Это главная незакрытая дыра между данными и поведением.

2. **Decision = Execution.** `DecisionSystem` мгновенно превращает намерение в действие. Нет `commitTick`, нет `reevaluateAt`. Игроки переключаются идеально — ноль hesitation, ноль опоздавших реакций.

3. **Нет тренера.** Вся тактика управляется `TacticalInstructionsSystem` со статичными стилями. Нет агента, который наблюдает за ходом матча и принимает решения: замены, смена схемы, корректировка pressLine.

4. **Нет per-player статистики.** `TeamStats` — 8 полей. Нет heatmap игрока, нет xGChain, нет rating. Невозможно построить PostMatchReport.

5. **Shape — reactive, не proactive.** `TeamShape` считается, но не управляет поведением как организм: нет синхронного выдвижения линии, нет волн прессинга, нет coordinated compactness.

---

## Новый программный путь

---

## A. COACH INTELLIGENCE SYSTEM
*Новый слой. Ничего из этого нет.*

### A.1 CoachProfile

Тренер как сущность с личностью:

```ts
interface CoachProfile {
  id: string;
  name: string;
  // Личность (0–100)
  aggressiveness: number;    // насколько рано делает замены / меняет тактику
  adaptability: number;      // как быстро реагирует на паттерны матча
  riskTolerance: number;     // ставит ли атакующего при 0:1
  defensiveMindset: number;  // склонность к низкому блоку
  // Предпочтения
  preferredStyle: TacticalStyle;
  preferredFormation: string;
  // Управление составом
  substitutionBias: "fatigue" | "tactical" | "scoreline";
  rotationHeavy: boolean;    // делает много ротаций
}
```

Добавить в `Club` и `MatchLineup`. Файл: `@/simulate/coach/CoachProfile.ts`

---

### A.2 MatchAnalyzer

Система, которая каждые ~900 тиков (15 минут матча) вычисляет наблюдения:

```ts
interface MatchObservation {
  minute: number;
  side: TeamSide;
  pressingSuccessRate: number;   // перехватов / попыток прессинга за окно
  xGDelta: number;               // xG своей команды - xG соперника за окно
  possessionShare: number;       // % владения за окно
  avgPressureUnder: number;      // среднее давление на ball-carrier
  dangerZoneAccess: number;      // % атак, доходящих до финальной трети
  transitionSpeed: number;       // среднее время перехода attack→defense
  passCompletionRate: number;
}
```

Хранит историю наблюдений: `observations: MatchObservation[]` (до 6 за матч).

Файл: `@/simulate/coach/MatchAnalyzer.ts`

---

### A.3 CoachSystem

Система-агент в пайплайне. Запускается каждые 900 тиков + при голе:

```
Читает: ctx.tactical, ctx.state, observations[], CoachProfile
Пишет: команды на смену стиля (TacticalInstructions), substitution events
```

Логика решений:

```
Проигрываем ≥1 AND xGDelta < -0.2 AND minute > 60
  → aggressiveness > 60: смена стиля на direct_play / gegenpress
  → aggressiveness ≤ 60: ждать до 70-й минуты

Ведём ≥1 AND minute > 65
  → defensiveMindset > 50: переход на low_block
  → riskTolerance < 40: максимально сужаем ширину

Fatigue игрока > 0.75 AND есть подходящая замена на скамейке
  → substitutionBias === "fatigue": замена немедленно
  → иначе: ждать подходящего момента (dead ball)

Pressing success < 25% за последние 15 минут
  → adaptability > 60: снизить pressLine на один уровень

xG соперника > 1.2 за последние 15 минут (нас разрывают)
  → сдвинуть compactness на compact, снизить width
```

Разные `CoachProfile` дают разные решения в одной ситуации — это ключевое.

Файл: `@/simulate/coach/CoachSystem.ts`
Добавить в пайплайн: после `MatchRhythmSystem`, до `TacticalInstructionsSystem`

---

### A.4 SubstitutionSystem

Отдельная система обработки замен:

```ts
interface SubstitutionEvent {
  minute: number;
  side: TeamSide;
  playerOutId: string;
  playerInId: string;
  reason: "fatigue" | "tactical" | "scoreline" | "injury";
}
```

- Максимум 3 замены за матч (стандарт) или 5 (современные турниры — конфигурируется)
- Замена только в dead-ball фазах
- Игрок "входящий" берёт позицию и роль выходящего
- `SubstitutionEvent` попадает в `MatchEvent[]` и отображается в UI / Commentary

Файл: `@/simulate/coach/SubstitutionSystem.ts`

---

## B. PLAYER ATTRIBUTES → BEHAVIOUR PIPELINE
*Атрибуты есть. Влияния почти нет. Нужно прокинуть.*

### B.1 Intent Architecture

Самый важный шаг для realism. Добавить на `Player`:

```ts
interface PlayerIntent {
  type: AIDecision["type"];
  target?: Vec2;
  targetPlayerId?: string;
  confidence: number;      // 0–1, снижается если ситуация меняется
  commitTick: number;      // тик, когда решение "зафиксировано" — до этого можно отменить
  reevaluateAt: number;    // тик следующей переоценки
  formedAtTick: number;    // когда intent был создан
}

// Добавить в Player:
intent: PlayerIntent | null;
```

Константы (зависят от `decisions` атрибута):

```ts
// Высокий decisions (80+): commitTick = +8 тиков, reevaluate = +15 тиков
// Низкий decisions (40-): commitTick = +20 тиков, reevaluate = +45 тиков
const COMMIT_TICKS = Math.round(20 - player.attributes.decisions * 0.12);
const REEVAL_TICKS = Math.round(45 - player.attributes.decisions * 0.3);
```

`DecisionSystem` перед созданием нового решения проверяет: если `tick < intent.commitTick` — игрок "заперт" в текущем намерении. Это создаёт опоздавшие переключения органически.

Файл: изменение `@/simulate/types.ts` + `@/simulate/systems/DecisionSystem.ts`

---

### B.2 Attribute → UtilityAI Mapping

Расширить `UtilityAI` чтобы атрибуты реально влияли на оценку действий:

**PassAction:**
```ts
// vision → видит ли дальний пас вообще
if (player.attributes.vision < 55 && dist > 150) return 0;
if (player.attributes.vision < 70 && dist > 200) score *= 0.4;

// passing → точность оценки паса
const passingQuality = player.attributes.passing / 100;
score *= (0.5 + passingQuality * 0.5);

// composure → штраф под давлением
const panicFactor = 1 - (pressure * (1 - player.attributes.composure / 100) * 0.6);
score *= panicFactor;
```

**ShootAction:**
```ts
// positioning → бонус за нахождение в правильной зоне
const positioningBonus = player.attributes.positioning / 100 * 0.15;

// bravery → бонус за удар в контакте
if (nearbyDefenders.length > 1) {
  score *= (0.3 + player.attributes.bravery / 100 * 0.7);
}
```

**DribbleAction:**
```ts
// dribbling + agility
const dribbleCapability = (player.attributes.dribbling + player.attributes.agility) / 200;
score *= (0.4 + dribbleCapability * 0.6);

// flair → random bravery bonus
if (player.attributes.flair > 70 && rng.next() < 0.15) score *= 1.3;
```

Файл: `@/simulate/utilityAI.ts`

---

### B.3 Attribute → MovementSystem Mapping

Добавить физическую интерпретацию атрибутов в движение:

```ts
// acceleration → время разгона до maxSpeed
const accelRamp = BALANCE.PLAYER_ACCELERATION * (player.attributes.acceleration / 80);

// pace → максимальная скорость
const maxSpeed = BALANCE.PLAYER_MAX_SPEED_BASE * (0.7 + player.attributes.pace / 100 * 0.6);

// agility → минимальный радиус разворота
// Сейчас разворачиваются мгновенно — нужна задержка
const turnDelay = Math.round((1 - player.attributes.agility / 100) * 10);
if (player._turnDelayTicks > 0) {
  player._turnDelayTicks--;
  // двигаемся в старом направлении ещё turnDelay тиков
}

// stamina → кривая fatigue
const fatigueRate = BALANCE.FATIGUE_BASE_RATE * (1 - player.attributes.stamina / 100 * 0.5);
```

Файл: `@/simulate/systems/MovementSystem.ts`

---

### B.4 Attribute → GoalkeeperSystem Mapping

GK атрибуты сейчас практически не используются:

```ts
// reflexes → base save probability
const reflexFactor = gk.attributes.reflexes / 100;

// handling → снижение вероятности отскока (parry → catch)
const catchProb = gk.attributes.handling / 100 * 0.6;

// positioning → штраф за неправильную позицию (уже частично в xG)
// rushingOut → агрессивность на выходе на кросс/навес
const rushRange = BALANCE.GK_BASE_RUSH_RANGE * (0.5 + gk.attributes.rushingOut / 100 * 0.8);

// oneOnOnes → шанс остановить 1v1
const oneOnOneSave = gk.attributes.oneOnOnes / 100 * 0.7;
```

Файл: `@/simulate/systems/GoalkeeperSystem.ts`

---

### B.5 Form & Fatigue Model

Связать внутриматчевый fatigue с межматчевыми данными `PlayerProfile`:

**Внутри матча (уже частично есть):**
- `fatigue` нарастает каждый тик пропорционально расстоянию и интенсивности
- При `fatigue > 0.6` → штраф на pace и stamina-based скорость (-10%)
- При `fatigue > 0.8` → штраф на decisions и composure (-15%)

**После матча (новое):**
```ts
// Записать в PlayerProfile после fulltime
profile.fitness = Math.max(20, profile.fitness - fatigueAtFullTime * 40);
profile.matchesPlayed++;

// Form: скользящая средняя по рейтингам последних 5 матчей
profile.form = weightedAverage([...lastRatings, matchRating], weights);
```

**Влияние на следующий матч:**
- `fitness < 60` → атрибуты умножаются на `0.85 + fitness/100 * 0.15`
- `form > 75` → небольшой бонус к `composure` и `decisions`

Файл: `@/simulate/coach/FormFatigueModel.ts`

---

## C. STATISTICS & ANALYTICS ENGINE
*TeamStats есть (8 полей). PlayerStats нет вообще.*

### C.1 PlayerMatchStats

Новый тип — накапливается в течение матча:

```ts
interface PlayerMatchStats {
  playerId: string;
  // Базовые
  minutesPlayed: number;
  touches: number;
  // Пас
  passesAttempted: number;
  passesCompleted: number;
  passAccuracy: number;         // считается по итогу
  chancesCreated: number;       // пасы, приведшие к удару
  keyPasses: number;            // пасы с xG > 0.1
  // Удары
  shots: number;
  shotsOnTarget: number;
  goals: number;
  assists: number;
  xG: number;                   // сумма xG всех ударов
  xA: number;                   // xG с ударов после паса этого игрока
  // Продвижение
  progressiveCarries: number;   // carries вперёд > 10px
  progressivePasses: number;    // пасы вперёд > 20px
  distanceCovered: number;      // накапливается в MovementSystem
  // Единоборства
  duelsWon: number;
  duelsLost: number;
  tacklesWon: number;
  interceptions: number;
  // Прессинг
  pressingActions: number;      // попытки отбора в высокой/средней зоне
  // Позиционирование
  heatmapBuckets: number[][];   // 10×7, инкрементируется каждые 30 тиков
  avgPosX: number;
  avgPosY: number;
  // Итоговый рейтинг
  rating: number;               // 0–10, считается в PostMatchReport
}
```

Хранить в `ctx.playerStats: Map<string, PlayerMatchStats>`. Инициализировать при старте матча.

Инкрементировать в:
- `MovementSystem` → `distanceCovered`, `heatmapBuckets`, `touches` (при получении мяча)
- `PassingSystem` → `passesAttempted`, `passesCompleted`, `chancesCreated`, `keyPasses`, `xA`
- `ShootingSystem` → `shots`, `shotsOnTarget`, `xG`
- `RefereeSystem` → `goals`, `assists`
- `TackleSystem` → `duelsWon`, `duelsLost`, `tacklesWon`, `interceptions`
- `DecisionSystem` → `pressingActions`

Файл: `@/simulate/stats/PlayerMatchStats.ts` + расширение `context.ts`

---

### C.2 TeamAdvancedStats

Расширить `TeamStats`:

```ts
interface TeamAdvancedStats extends TeamStats {
  // Прессинг
  ppda: number;                      // Passes Per Defensive Action (чем ниже, тем агрессивнее прессинг)
  highPressSuccessRate: number;      // % прессинговых действий выше середины поля
  avgPressingIntensity: number;
  // Позиционирование
  avgDefensiveLineHeight: number;    // нормализованный X центроида защиты
  avgTeamWidth: number;
  avgCompactness: number;
  // Атака
  counterAttackCount: number;        // атаки из transition_attack < 5 сек
  setpieceXG: number;               // xG только со стандартов
  bigChances: number;                // удары с xG > 0.35
  bigChancesMissed: number;
  // Переходы
  avgTransitionSpeed: number;        // тиков от потери до первого дефенсивного действия
}
```

PPDA считается: `oppPassesInPressZone / ownPressActions`

Файл: расширение `@/simulate/types.ts`, накопление в `TacticalSystem` + `TackleSystem`

---

### C.3 xG Pipeline v2

Расширить `calculateXG` в `xG.ts`:

```ts
// Body part multiplier (нужен источник из ShootingSystem)
const bodyPartFactor = bodyPart === "header" ? 0.65
  : bodyPart === "weak_foot" ? 0.75
  : 1.0;

// Assist type multiplier
const assistFactor = assistType === "cutback" ? 1.25
  : assistType === "through_ball" ? 1.15
  : assistType === "cross" ? 0.85
  : 1.0;

// Transition bonus: shot in first 4 seconds of counter
const transitionBonus = isCounterAttackShot ? 1.12 : 1.0;

// Defensive pressure cone: defenders between shooter and goal (не просто рядом)
// (уже есть в базовом виде — уточнить геометрию)
```

Добавить `bodyPart` и `assistType` в `AIDecision` и `MatchEvent`.

Файл: `@/simulate/xG.ts`

---

### C.4 Player Rating Algorithm

Итоговый рейтинг 0–10 по событиям матча:

```ts
function computeRating(stats: PlayerMatchStats, teamResult: "win" | "draw" | "loss"): number {
  let rating = 6.0; // базовый

  // Позитивные факторы
  rating += stats.goals * 1.2;
  rating += stats.assists * 0.8;
  rating += stats.keyPasses * 0.15;
  rating += stats.chancesCreated * 0.1;
  rating += (stats.passAccuracy - 70) * 0.01;  // бонус за точность выше 70%
  rating += stats.tacklesWon * 0.1;
  rating += stats.interceptions * 0.12;
  rating += stats.bigChancesCreated * 0.3;

  // Негативные факторы
  rating -= stats.duelsLost * 0.05;
  rating -= stats.bigChancesMissed * 0.3;

  // Результат матча
  if (teamResult === "win") rating += 0.2;
  if (teamResult === "loss") rating -= 0.1;

  // xG вклад
  rating += stats.xG * 0.3;
  rating += stats.xA * 0.2;

  return Math.min(10, Math.max(3, +rating.toFixed(1)));
}
```

Файл: `@/simulate/stats/PlayerRating.ts`

---

## D. POST-MATCH REPORT
*Финальная точка всей аналитики. Ничего нет.*

### D.1 PostMatchReport Type

```ts
interface PostMatchReport {
  matchId: string;
  minute: number;                           // = 90 (или больше)
  homeScore: number;
  awayScore: number;

  // Статистика
  homeStats: TeamAdvancedStats;
  awayStats: TeamAdvancedStats;
  playerStats: PlayerMatchStats[];          // все 22 игрока

  // Лучший игрок
  mvpPlayerId: string;
  mvpRating: number;

  // Ключевые моменты (top-6 по xG)
  keyMoments: MatchEvent[];

  // Тренерский анализ
  homeCoachReport: CoachReport;
  awayCoachReport: CoachReport;

  // Тактическое резюме
  tacticalSummary: TacticalSummary;
}

interface CoachReport {
  overallAssessment: string;            // текст из CommentarySystem
  substitutionsMade: SubstitutionEvent[];
  tacticalChanges: string[];            // "switched to low_block at 68'"
  whatWorked: string[];
  whatFailed: string[];
}

interface TacticalSummary {
  homeDominantPhase: TeamTacticalPhase;
  awayDominantPhase: TeamTacticalPhase;
  pressureBattle: "home" | "away" | "even";
  possessionBattle: "home" | "away" | "even";
  formationShifts: { minute: number; side: TeamSide; from: string; to: string }[];
}
```

Файл: `@/simulate/stats/PostMatchReport.ts`

---

### D.2 PostMatchReportUI

Компонент React/TSX для отображения отчёта после матча:

- Вкладки: "Обзор" / "Игроки" / "Тренеры" / "Тактика"
- "Обзор" — score, xG, ключевые моменты (timeline)
- "Игроки" — таблица с рейтингами, heatmap при клике на игрока
- "Тренеры" — что менял, почему, оценка решений
- "Тактика" — PPDA, pressing stats, formation shifts

Файл: `components/PostMatchReport.tsx`

---

## E. REALISM GAPS (существующие системы)

### E.1 Collision / Shielding Layer
*Критично для mid-third реализма*

Добавить в `TackleSystem` и `MovementSystem`:

```ts
// Shielding: игрок с мячом может заблокировать доступ телом
// Если defender приближается с фронта, ball-carrier поворачивается спиной
// defender должен обходить — это реализуется через отталкивание

const shieldAngle = angleBetween(ballCarrier.pos, defender.pos, ballCarrier.targetPos);
if (shieldAngle < 45) {
  // defender заблокирован — скорость подхода снижается
  defenderApproachSpeed *= (0.3 + ballCarrier.attributes.strength / 100 * 0.7);
}
```

Loose ball scramble: когда мяч без владельца и ≥ 3 игроков в радиусе 30px — добавить случайный deflection вектор пропорционально `strength` ближайшего игрока.

Файл: расширение `@/simulate/systems/TackleSystem.ts`

---

### E.2 Pressing Structure

Прессинг сейчас ball-centric: каждый игрок сам решает давить или нет.

Нужен coordinated press trigger:

```ts
// TacticalSystem определяет: есть ли условия для организованного прессинга?
const pressTrigger = (
  possessionJustLost &&                          // только что потеряли мяч
  ballPos.x > pressLine &&                       // мяч выше линии прессинга
  teamCompactness > 0.6 &&                       // команда компактна
  ctx.tactical.rhythmModifiers[side].state !== "protecting_lead"
);

if (pressTrigger) {
  // Назначить ближайших 4-5 игроков в "press wave"
  // Остальные поддерживают shape (не бегут за мячом)
  // Shadow pressing: ближайший к ball-carrier перекрывает линию паса
}
```

Файл: расширение `@/simulate/systems/OffBallSystem.ts`

---

### E.3 Midfield Occupation Maps

Добавить в `TacticalSystem` occupationMap — какие зоны заняты:

```ts
// 5×3 сетка центральной трети
// Если зона пустая и мяч в соседней — ближайший CM занимает её
// Это создаёт треугольники поддержки органически
```

---

### E.4 Turning Inertia

В `MovementSystem` добавить `bodyFacing` и задержку разворота:

```ts
// Текущее направление тела (angle в радианах)
player.bodyFacing: number;

// Каждый тик: медленно поворачиваемся к targetDir
const maxTurnRate = Math.PI / (8 - player.attributes.agility / 20); // rad/tick
const angleDiff = normalizeAngle(targetAngle - player.bodyFacing);
player.bodyFacing += clamp(angleDiff, -maxTurnRate, maxTurnRate);

// Скорость зависит от рассогласования
const alignmentFactor = Math.cos(angleDiff / 2); // 1.0 = идём в нужную сторону
player.vel = scaleVec(player.vel, alignmentFactor);
```

---

## F. INFRASTRUCTURE

### F.1 Deterministic Test Harness

```ts
// Запустить матч с seed=42, проверить что score/possession/events совпадают
function runDeterministicTest(seed: number, ticks: number): MatchSnapshot {
  const sim = new MatchSimulator(createTestWorld(seed));
  for (let i = 0; i < ticks; i++) sim.step();
  return sim.snapshot();
}

// test: assert(run(42, 5400).homeScore === run(42, 5400).homeScore)
```

Добавить в `package.json` как `test:determinism`.

Файл: `@/simulate/tests/determinism.test.ts`

---

### F.2 Event Bus Разделение

Разделить смешанные события на три уровня:

```ts
type SimulationEvent = "possession_changed" | "interception" | "danger_zone_entry";
type PresentationEvent = "crowd_reaction" | "commentary" | "highlight";
type AnalyticsEvent = "xg_shot" | "press_attempt" | "chain_completed";
```

Это нужно чтобы:
- `AnalyticsEvent` писались в `PlayerMatchStats` без coupling с UI
- `PresentationEvent` можно отключить в headless/fast simulation
- Нет неожиданных сайд-эффектов между gameplay и рендерингом

Файл: расширение `@/simulate/eventBus.ts` + `@/simulate/core/EventStore.ts`

---

## Приоритеты реализации

### 🔴 Критично (делать первым)

| # | Что | Почему |
|---|-----|--------|
| 1 | **B.1 Intent Architecture** | Biggest realism gap. Минимум изменений кода, максимум эффекта. `commitTick` + `reevaluateAt` на `Player` |
| 2 | **C.1 PlayerMatchStats** | Нужно для всего остального: ratings, report, coach decisions. Чисто аддитивно, ничего не ломает |
| 3 | **A.2 MatchAnalyzer** | Фундамент CoachSystem. Без наблюдений тренер не может принимать решения |
| 4 | **A.1 + A.3 CoachSystem** | Главная новая фича. Зависит от MatchAnalyzer и PlayerMatchStats |

### 🟡 Важно (делать вторым)

| # | Что | Почему |
|---|-----|--------|
| 5 | **B.2 Attribute → UtilityAI** | Атрибуты наконец влияют на AI. Вводить по одному, тестировать |
| 6 | **B.3 Attribute → MovementSystem** | Поворот, acceleration ramp, fatigue penalty |
| 7 | **A.4 SubstitutionSystem** | Нужен для CoachSystem + это видимая feature в UI |
| 8 | **C.3 xG Pipeline v2** | Body part, assist type, transition bonus |
| 9 | **D.1 + D.2 PostMatchReport** | Финальная точка всей аналитики. Зависит от C.1 + C.4 |

### 🟢 Потом (делать третьим)

| # | Что | Почему |
|---|-----|--------|
| 10 | **E.1 Collision / Shielding** | Крупный realism gap, требует осторожности — может сломать баланс |
| 11 | **E.2 Pressing Structure** | Coordinated press wave вместо ball-centric |
| 12 | **B.4 GK Attributes** | Вратарь сейчас недостаточно учитывает атрибуты |
| 13 | **B.5 Form & Fatigue Model** | Нужно для League Simulation |
| 14 | **E.4 Turning Inertia** | Физически реалистичнее, но требует аккуратной балансировки |
| 15 | **F.1 Deterministic Tests** | До активного масштабирования |
| 16 | **C.2 TeamAdvancedStats** | После PlayerMatchStats |
| 17 | **E.3 Midfield Occupation** | После Pressing Structure |

### ⚪ Долгосрочно

| # | Что |
|---|-----|
| 18 | **F.2 Event Bus разделение** |
| 19 | **League Simulation** — persistence, ротация, трансферы |
| 20 | **Tick Pipeline формализация** — read/write contracts |
| 21 | **Perception System** — vision cone, awareness delay |
| 22 | **Metrics Dashboard UI** — PPDA, analytics panel |

---

## Новые файлы и папки

```
simulate/
  coach/
    CoachProfile.ts          — A.1
    MatchAnalyzer.ts         — A.2
    CoachSystem.ts           — A.3
    SubstitutionSystem.ts    — A.4
    FormFatigueModel.ts      — B.5
  stats/
    PlayerMatchStats.ts      — C.1
    PlayerRating.ts          — C.4
    PostMatchReport.ts       — D.1

components/
  PostMatchReport.tsx        — D.2
```

Изменения в существующих файлах:

```
simulate/types.ts              — PlayerIntent, обновлённый Player, TeamAdvancedStats
simulate/context.ts            — playerStats: Map<string, PlayerMatchStats>
simulate/utilityAI.ts          — B.2: attribute влияния на scoring
simulate/systems/
  simulate.ts          — B.3: accel/agility/turning
  GoalkeeperSystem.ts        — B.4: reflexes/handling/positioning
  DecisionSystem.ts          — B.1: intent lock check
  TackleSystem.ts            — E.1: shielding
  OffBallSystem.ts           — E.2: coordinated press
  PassingSystem.ts           — C.1: stat increments
  ShootingSystem.ts          — C.1 + C.3: stat increments + body part
  RefereeSystem.ts           — C.1: goal/assist increments
simulate/xG.ts                 — C.3: body part, assist type
simulate/simulation/MatchSimulator.ts — добавить CoachSystem в пайплайн
```

---

## Главное правило (обновлённое)

> Следующий уровень симуляции достигается не через новые системы с нуля, а через замыкание петли между данными и поведением.
>
> Атрибуты игроков уже есть — они должны реально влиять на решения.
> Тактика уже есть — нужен агент, который её адаптирует по ходу матча.
> События уже есть — нужна аналитика, которая их осмысляет.

**Архитектурный принцип:** каждый новый слой (Coach, Intent, Stats) должен только читать существующий `ctx` и писать через команды. Никаких новых прямых мутаций.