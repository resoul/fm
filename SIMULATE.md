# Football Simulation Engine — Plan (May 2026)

---

## Статус на сегодня

### ✅ Полностью реализовано

**Движок (старое)**
- Command System — `CommandResolver`, типизированные команды, registry handlers
- Immutable Safety — системы через команды
- Tactical States — 5 фаз: `in_possession / transition_attack / out_of_possession / transition_defend / set_piece`
- Utility AI — `ShootAction`, `PassAction`, `DribbleAction`, `HoldAction` со scoring
- Off-ball Intelligence — `OffBallSystem` с 6 типами ранов, leash через `ZoneSystem`
- Space Awareness — `SpaceAwareness.ts`, pressure penalty, defensive line
- Team Shape System — `TeamShape.ts`, compactness/width/depth
- Tactical Instructions — `TacticalInstructionsSystem`: width, tempo, directness, pressLine, overlaps, compactness
- Role Behaviors — 14 ролей с профилями leash/pressBias/forwardRunBias
- Tactical Identity — 5 стилей: `tiki_taka`, `gegenpress`, `low_block`, `direct_play`, `balanced`
- Possession Chains — `ChainTracker`, chain phase влияет на UtilityAI
- Momentum System — `MomentumSystem.ts`
- Match Rhythm System — `MatchRhythmSystem.ts`: tempoDelta, directnessDelta, protecting lead, chasing game, desperate
- Realistic Error Model — `computePassError`, `computeShotError`, константы в `balance.ts`
- Restart Intelligence — corner / throwin / goalkick / freekick с тактическими позициями
- Commentary System — контекстные фразы по xG, phase, rhythm, scoreDiff
- Highlights Panel — фильтрация голов, ударов, сейвов, угловых; показывает xG
- Tactical Overlays — `showZones`, `showPassingLanes`, `showDefensiveLine`, `showPressureHeatmap`
- Replay System — `ReplayManager`, `ReplaySimulator`, jump-to-tick в UI
- Intent Architecture (B.1) — `commitTick`, `reevaluateAt`, `confidence` на `Player`

**Person / Атрибуты (новое)**
- `engine/person.ts` — единая структура `Person` с group-based атрибутами (technical, mental, physical, hidden, pieces, condition, foot, personality, reputation, ability, staff, coaching, medical, staffMental, knowledge, tacticalStyle, board)
- `AttributeNumber` = 1–20 для всех атрибутов
- `GoalkeeperAttributes` — отдельная optional группа только для GK
- Helpers: `createPerson()`, `playerOverall()`, `goalkeeperOverall()`, `coachOverall()`, `clampAttr()`
- Default factories для каждой группы
- `flattenPersonAttrs(person)` — Person → плоский `PlayerAttributes` для движка
- `PlayerProfile.person: Person` — полная структура атрибутов
- `PlayerProfile.potential: Person` — потенциальный потолок
- `buildPlayerProfile()` обновлён — создаёт `Person` из сгенерированных атрибутов

**Coach Intelligence (новое)**
- `engine/coach/CoachProfile.ts` — `CoachProfile` поверх `Person`; 5 архетипов (`aggressive`, `conservative`, `balanced`, `possession`, `direct`); шорткаты `coachAggressiveness/Adaptability/RiskTolerance/DefensiveMindset` читают из `person.tacticalStyle`; `createCoach()` для кастомных тренеров
- `engine/coach/MatchAnalyzer.ts` — наблюдения каждые 900 тиков: `pressingSuccessRate`, `xGDelta`, `possessionShare`, `dangerZoneAccess`, `passCompletionRate`, `transitionSpeed`; `getLatest(side)`, `getRecent(side, n)`
- `engine/coach/CoachSystem.ts` — агент в пайплайне; 5 ветвей решений (проигрываем, ведём, прессинг не работает, нас разрывают, fatigue); адаптивность через `coachAdaptability`; читает `person.tacticalStyle` через хелперы
- `engine/coach/SubstitutionSystem.ts` — замены в dead-ball фазах; макс 3/5; входящий наследует позицию/роль/targetPos

**PlayerMatchStats (новое)**
- `engine/stats/PlayerMatchStats.ts` — полный тип + хелперы `createPlayerMatchStats()`, `initPlayerStats()`, `recordPositionSample()`, `finaliseStats()`
- `context.ts` — `playerStats: Map<string, PlayerMatchStats>`
- `BaseSimulator.ts` — инициализация `playerStats` в конструкторе, передача в `createContext()`
- Инкременты в: `PassingSystem` (passesAttempted, passesCompleted, progressivePasses), `ShootingSystem` (shots, xG, shotsOnTarget; chancesCreated/keyPasses/xA для пасующего), `TackleSystem` (tacklesWon, duelsWon/Lost), `MovementSystem` (distanceCovered, heatmap, progressiveCarries, touches), `DecisionSystem` (pressingActions), `PhysicsSystem` (interceptions при подборе от противника), `RefereeSystem` (goals; `finaliseStats()` на fulltime)

**Pipeline (новое)**
- `MatchSimulator` — CoachSystem + SubstitutionSystem добавлены между MatchRhythm и TacticalInstructions
- Публичные методы: `getPlayerStats()`, `getObservations()`
- `TacticalInstructionsSystem` больше не дублируется — используется один shared instance

---

### 🔧 Частично реализовано

- **Атрибуты → Поведение** — `Person` с group-based атрибутами есть, но в `UtilityAI` используются только `finishing`, `composure`, `technique`, `longShots`, `vision`. Остальные (agility, decisions, bravery и т.д.) пока не влияют на scoring
- **Intent Architecture** — типы есть (`commitTick`, `reevaluateAt`, `confidence`), но `DecisionSystem` пока не проверяет `intent.commitTick` перед формированием нового решения
- **xG Pipeline** — работает (dist, angle, pressure, composure, reflexes, GK). Нет: body part, assist type, cutback detection
- **MovementSystem** — acceleration, fatigue, deceleration. Нет: turning inertia, body facing
- **GK Attributes** — частично в xG через `reflexes`/`handling`. Нет: rushingOut, oneOnOnes, commandOfArea как отдельные множители
- **Form & Fatigue** — `FormFatigueModel.ts` существует, но не подключён к `PlayerProfile` после матча
- **CoachSystem → SubstitutionSystem** — логика fatigue subs написана, но `bench` игроки не передаются (нужна интеграция на уровне лиги)
- **`setCoach()`** — публичный метод есть, но hot-swap не реализован (только стаб с warn)

---

### ❌ Не реализовано

- **C.2 TeamAdvancedStats** — PPDA, high press success rate, avg defensive line height, counter attack count
- **C.3 xG Pipeline v2** — body part, assist type, transition bonus
- **C.4 PlayerRating** — алгоритм рейтинга 0–10 по итогам матча
- **D.1 PostMatchReport** — тип + генерация итогового отчёта
- **D.2 PostMatchReportUI** — компонент React с вкладками
- **B.2 Attribute → UtilityAI** — vision, passing, composure, decisions, bravery влияют на scoring
- **B.3 Attribute → MovementSystem** — acceleration ramp, turning inertia, pace → maxSpeed
- **B.4 Attribute → GoalkeeperSystem** — reflexes factor, rushingOut range, oneOnOnes
- **B.5 Form & Fatigue → PlayerProfile** — persist fatigue/form между матчами
- **E.1 Collision / Shielding** — body duels, shielding, loose-ball scrambles
- **E.2 Pressing Structure** — coordinated press wave вместо ball-centric
- **E.3 Midfield Occupation Maps** — зоны поддержки треугольников в центре
- **E.4 Turning Inertia** — `bodyFacing`, задержка разворота
- **F.1 Deterministic Test Harness** — same seed → same result
- **F.2 Event Bus разделение** — Simulation / Presentation / Analytics
- **League Simulation** — persistence между матчами, ротация, трансферы
- **Metrics Dashboard UI** — PPDA, analytics panel

---

## Приоритеты дальнейшей работы

### 🔴 Критично — делать первым

| # | Что | Зависимости | Почему |
|---|-----|-------------|--------|
| 1 | **B.1 Intent lock в DecisionSystem** | Intent поля уже на Player | Типы есть, осталось проверять `commitTick` в `DecisionSystem.update()`. Biggest realism gap, минимум работы |
| 2 | **C.4 PlayerRating** | C.1 ✅ | PlayerMatchStats заполняются — нужен финальный шаг для рейтинга |
| 3 | **D.1 PostMatchReport** | C.1 ✅, C.4 | Замыкает всю аналитику матча в один объект |
| 4 | **D.2 PostMatchReportUI** | D.1 | Видимый результат всей аналитической работы |

### 🟡 Важно — делать вторым

| # | Что | Зависимости | Почему |
|---|-----|-------------|--------|
| 5 | **B.2 Attribute → UtilityAI** | Person ✅ | Атрибуты есть — осталось прокинуть в scoring. По одному атрибуту за раз |
| 6 | **B.3 Attribute → MovementSystem** | Person ✅ | pace/acceleration/agility уже в Person, нужно подключить |
| 7 | **B.4 Attribute → GoalkeeperSystem** | Person + GoalkeeperAttributes ✅ | GK attrs в Person.goalkeeper, нужно использовать |
| 8 | **C.3 xG Pipeline v2** | — | Body part + assist type + transition bonus |
| 9 | **CoachSystem bench integration** | SubstitutionSystem ✅ | Подключить скамейку из Club.squad для реальных замен |
| 10 | **C.2 TeamAdvancedStats** | C.1 ✅ | PPDA и extended stats для тренерского анализа |

### 🟢 Потом — делать третьим

| # | Что |
|---|-----|
| 11 | **E.1 Collision / Shielding** — strength → shielding, loose-ball deflection |
| 12 | **E.2 Pressing Structure** — coordinated press wave, shadow press |
| 13 | **B.5 Form & Fatigue → PlayerProfile** — persist между матчами |
| 14 | **E.4 Turning Inertia** — `bodyFacing`, `maxTurnRate` от agility |
| 15 | **F.1 Deterministic Tests** — `test:determinism` в package.json |
| 16 | **E.3 Midfield Occupation Maps** |
| 17 | **`setCoach()` hot-swap** — expose setters на CoachSystem |

### ⚪ Долгосрочно

| # | Что |
|---|-----|
| 18 | **F.2 Event Bus разделение** — Simulation / Presentation / Analytics |
| 19 | **League Simulation** — persistence, ротация, трансферы |
| 20 | **Tick Pipeline формализация** — read/write contracts, conflict detection |
| 21 | **Perception System** — vision cone, awareness delay, pressure blindness |
| 22 | **Metrics Dashboard UI** — PPDA, analytics panel |

---

## Файловая карта

### Новые файлы (реализованы)
```
engine/
  person.ts                    ✅ — единая структура Person
  stats/
    PlayerMatchStats.ts        ✅ — C.1
  coach/
    CoachProfile.ts            ✅ — A.1 (поверх Person)
    MatchAnalyzer.ts           ✅ — A.2
    CoachSystem.ts             ✅ — A.3
    SubstitutionSystem.ts      ✅ — A.4
    FormFatigueModel.ts        🔧 — B.5 (существует, не подключён)
```

### Новые файлы (нужно создать)
```
engine/
  stats/
    PlayerRating.ts            ❌ — C.4
    PostMatchReport.ts         ❌ — D.1
components/
  PostMatchReport.tsx          ❌ — D.2
engine/
  tests/
    determinism.test.ts        ❌ — F.1
```

### Изменения в существующих файлах (реализованы)
```
engine/types.ts                ✅ — PlayerIntent, Person export, PlayerProfile.person
engine/context.ts              ✅ — playerStats: Map<string, PlayerMatchStats>
engine/teamFactory.ts          ✅ — flattenPersonAttrs(), buildPlayerProfile с Person
engine/simulation/
  BaseSimulator.ts             ✅ — playerStats инициализация
  MatchSimulator.ts            ✅ — CoachSystem + SubstitutionSystem в пайплайне
engine/systems/
  PassingSystem.ts             ✅ — C.1 stat increments
  ShootingSystem.ts            ✅ — C.1 stat increments
  TackleSystem.ts              ✅ — C.1 stat increments
  MovementSystem.ts            ✅ — C.1 stat increments
  DecisionSystem.ts            ✅ — C.1 pressingActions; ❌ B.1 intent lock
  PhysicsSystem.ts             ✅ — C.1 interceptions
  RefereeSystem.ts             ✅ — C.1 goals + finaliseStats
components/
  PreMatchPage.tsx             ✅ — overallRating(p.person)
  LineupBuilder.tsx            ✅ — overallRating(p.person)
```

### Изменения в существующих файлах (нужно сделать)
```
engine/utilityAI.ts            ❌ — B.2: vision, passing, composure, decisions, bravery
engine/systems/
  DecisionSystem.ts            ❌ — B.1: проверка intent.commitTick
  MovementSystem.ts            ❌ — B.3: pace→maxSpeed, acceleration ramp, turning delay
  GoalkeeperSystem.ts          ❌ — B.4: reflexes factor, rushingOut, oneOnOnes
  TackleSystem.ts              ❌ — E.1: shielding
  OffBallSystem.ts             ❌ — E.2: coordinated press wave
engine/xG.ts                   ❌ — C.3: body part, assist type, transition bonus
engine/types.ts                ❌ — C.2: TeamAdvancedStats
```

---

## Следующий рекомендуемый порядок

```
B.1  DecisionSystem intent lock     — commitTick check (маленькое изменение, большой эффект)
C.4  PlayerRating                   — рейтинг 0–10 из PlayerMatchStats
D.1  PostMatchReport type           — структура итогового отчёта
D.2  PostMatchReportUI              — компонент с вкладками
B.2  UtilityAI ← Person attrs       — vision, composure, decisions, bravery
B.3  MovementSystem ← Person attrs  — pace, acceleration, agility
B.4  GoalkeeperSystem ← GK attrs    — reflexes, rushingOut, oneOnOnes
```