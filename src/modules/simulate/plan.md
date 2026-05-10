# Football Simulation Engine — Plan

## Видение

Сделать не просто "матчевый симулятор", а **системный football sandbox**:

- тактика формирует поведение
- игроки сохраняют структуру
- решения рождаются из контекста
- матч выглядит как взаимодействие систем, а не scripted events

---

## Корневые проблемы архитектуры

### 1. Ball-Oriented AI
Игроки слишком реагируют на мяч → shape collapse, unrealistic pressing, positional chaos, midfield disappears, defenders overcommit.

### 2. Weak Tactical Identity
Тактика влияет на modifiers, но не определяет "личность" команды → high press ≈ balanced press, possession ≈ direct play.

### 3. No Real Positional Discipline
Есть target / objective / movement, но нет positional responsibility, zone ownership, tactical anchoring.

### 4. Cooldown-Driven Behaviour
Поведение контролируется через hard cooldowns, anti-spam fixes, magic numbers — стабилизирует, но снижает realism.

### 5. Decision & Execution Coupled
AI слишком быстро превращает intention в action → мало hesitation, мало ошибок, слишком "идеальные" реакции.

---

## Целевая архитектура

### Decision Pipeline (новый слой)

```
Tactics
    ↓
Role
    ↓
Positional responsibility
    ↓
Intent generation
    ↓
AI evaluation
    ↓
Execution
```

### TacticalProfile (на каждом игроке)

```ts
interface TacticalProfile {
  role: PlayerRole;
  formationSlot: FormationSlot;
  homeZone: Zone;
  activeZone: Zone;
  attackingZone: Zone;
  defensiveZone: Zone;
  tacticalDiscipline: number;
  positionalFreedom: number;
  supportBias: number;
  pressBias: number;
  riskBias: number;
}
```

### Zone System

Каждый игрок владеет зоной. Tactical leash — максимальное удаление:

| Роль | Leash |
|------|-------|
| CB | 8m |
| DM | 14m |
| FB | 20m |
| Winger | 25m |

Фазовый сдвиг зон:

| Фаза | Сдвиг |
|------|-------|
| `in_possession` | +1 col |
| `transition_attack` | +2 col |
| `out_of_possession` | -1 col |
| `transition_defend` | -2 col |

### TeamShape State

```ts
interface TeamShape {
  defensiveLineHeight: number;
  attackingWidth: number;
  compactness: number;
  horizontalStretch: number;
  verticalStretch: number;
  pressureLine: number;
}
```

### Тактические фазы (расширенные)

```
settled_defense | high_press | mid_block | low_block
build_up | controlled_possession | final_third_attack | counter_attack
defensive_transition | attacking_transition | set_piece
```

### Роли (Role = behaviour architecture, не просто modifier)

| Роль | Поведение |
|------|-----------|
| Deep Lying Playmaker | stays central, supports circulation, avoids high pressing |
| Box To Box Midfielder | dynamic support, larger movement radius, transition focus |
| Inverted Winger | attacks half-spaces, cuts inside, overload creation |
| Anchor Man | protects CB line, minimal roaming, intercept priority |

### Атрибуты влияют на поведение, не только на шанс успеха

```
Не: "pass failed because passing = 62"
А:  "player never saw the passing lane"
    "player reacted too late"
    "player positioned badly"
    "player panicked under pressure"
```

**Mental**: vision, anticipation, composure, decisionMaking, discipline, workRate, offBallMovement, teamwork, aggression  
**Tactical**: shapeDiscipline, pressingIntelligence, spaceAwareness, supportPositioning, transitionAwareness  
**Physical**: acceleration, agility, balance, stamina, reactionSpeed, recoverySpeed  
**Technical**: firstTouch, ballControl, shortPassing, longPassing, finishing, dribbling, crossing

---

## Bugfixes (критические, вне плана)

- [✅ DONE] **Dead-ball loop** — MovementSystem игнорирует nextDecision.target в dead-ball; triggerRestart() и doKickoff() сбрасывают nextDecision у всех; все системы пропускают работу в dead-ball; lockTakerToRestartPos() каждый тик; таймаут 3 сек.
- [✅ DONE] **Санитарный клэмп targetPos** в MovementSystem — клэмп до `[10, width-10] × [10, height-10]`
- [✅ DONE] **Пас-спам** — receiverCooldown = 45–80 тиков получателю в момент паса
- [✅ DONE] **Tackle спам** — TACKLE_SUCCESS_COOLDOWN = 150 тиков
- [✅ DONE] **Goalkick бьёт вратарь**
- [✅ DONE] **Halftime / Goal delay + корректный kickoff**
- [✅ DONE] **Throw-in loop** — тейкер не выбирает lastTouchedBy; cooldown 90 тиков на выбившего; получатели позиционируются с INSET 40px от аутовой линии

---

## 1. CORE ENGINE / АРХИТЕКТУРА

- [✅ DONE] **1.1 Command System** — registry-based handlers, типизированные через mapped types; resolver.register() для расширения без правки core; UPDATE_PLAYER_METRICS без прямых мутаций.

- [✅ DONE] **1.2 Immutable Safety**
  - Новые команды: `TELEPORT_PLAYER`, `SET_PLAYER_TARGET`, `SET_PLAYER_BALL_OWNERSHIP`, `CLEAR_ALL_DECISIONS`
  - RefereeSystem полностью переведён на Command-паттерн

- [ ] **1.3 Tick Pipeline** (формализовать порядок)
  - Декларативный граф зависимостей с явными read/write контрактами
  - Поймать конфликты типа "MovementSystem читает то, что RefereeSystem ещё не записал"

- [ ] **1.4 Event Bus 2 уровня**
  - Simulation Events (для логики): `possession_changed`, `interception`
  - Presentation Events (для UI): `crowd_reaction`, `commentary`, `highlight`

---

## 2. FOOTBALL AI

- [✅ DONE] **2.4 Tactical States** — 5 фаз: `in_possession / transition_attack / out_of_possession / transition_defend / set_piece`.

- [✅ DONE] **2.5 Decision Scoring (UtilityAI)** — HoldAction, PassAction с lane bonus, DribbleAction, ShootAction.

- [✅ DONE] **2.1 Off-ball Intelligence** — hold_shape через ZoneSystem.isOutsideLeash(); repositioning phase 20 тиков; defenseRecovery с zone anchor Y.

- [✅ DONE] **2.2 Space Awareness** — defensiveLine из реальной позиции защитников; pressurePenalty и defensiveLinePenalty в PassAction.

- [✅ DONE] **2.3 Team Shape System** — dynamic width/depth; score modifier + fatigue modifier.

- [✅ DONE] **2.6 Restart Intelligence** — corner / throwin / goalkick / freekick с тактическими позициями.

---

## 3. TACTICS SYSTEM

- [✅ DONE] **3.1 Tactical Instructions** — `TacticalInstructionsSystem`: width / tempo / overlaps / directness / pressLine / compactness / trapSide. Скалярные факторы widthFactor / tempoBias / pressLineFactor / compactnessFactor / directnessFactor читаются в OffBallSystem и UtilityAI.

- [✅ DONE] **3.2 Role Behaviors** — 14 ролей с профилями: `leashOverride`, `pressTrigger`, `forwardRunBias`, `supportDropBias`, `forwardPassBias`, `overlapsEnabled`. Применяются в UtilityAI (PassAction, ShootAction, DribbleAction) и OffBallSystem (run selection).

- [✅ DONE] **3.3 Tactical Identity** — 5 стилей: `tiki_taka`, `gegenpress`, `low_block`, `direct_play`, `balanced`. Адаптируются к счёту и минуте. `matchSimulator.setTacticalStyle(side, style)`.

---

## 4. MATCH FLOW & REALISM

- [✅ DONE] **4.1 Possession Chains** — ChainTracker работает; данные цепочек теперь используются в UtilityAI: chainForwardBonus масштабирует forward-компонент при выборе адресата паса (+0.18 в final_third/chance_creation); бонус к score() в build_up и urgentMode.

- [✅ DONE] **4.2 Momentum** — MomentumSystem: confidence spike (+12% speed, +0.3 pressureIntensity, 90 сек) для забившей команды; shock (-5% speed, -0.25 pressureIntensity, drop defensive line, 30 сек) для пропустившей. Интегрирован в MovementSystem и TacticalSystem.

- [ ] **4.3 Match Rhythm**
  - Recycling possession (намеренное замедление при ведении в счёте)
  - Tempo shifts: команда ведёт → короткие пасы назад, меньше риска; проигрывает → повышение темпа автоматически
  - Сейчас `tiki_taka` и score-адаптация в TacticalInstructions частично закрывают это — но нет явного per-tick tempo control

- [✅ DONE] **4.4 Realistic Error Model** — computePassError() / computeShotError(); лейблы событий; все константы в balance.ts.

---

## 5. PHYSICS & MOVEMENT

- [🔧 PARTIAL] **5.1 Ball Physics** — базовая физика, bounce, height. Нет: spin, realistic ground friction.

- [🔧 PARTIAL] **5.2 Movement Model** — acceleration/deceleration/fatigue есть. Нет: turning radius, inertia при резкой смене направления.

- [ ] **5.3 Collision System** — shielding, shoulder duels, loose-ball scrambles

---

## 6. STATISTICAL ENGINE

- [ ] **6.1 xG Pipeline** — shot location, body part, assist type, pressure on shooter, GK position
  - Базовый xG.ts существует, но не учитывает body part, assist type, детальную позицию GK

- [ ] **6.2 League Simulation** — fatigue accumulation между матчами, squad rotation, morale

---

## 7. UI / VIEWER

- [✅ DONE] **Highlights Panel** — вкладка "⚡ Моменты"; фильтрует голы, удары, сейвы, угловые, свободные удары; показывает xG.

- [ ] **7.1 Replay / Jump to moment**
  - ReplayManager уже записывает snapshots (pos + state каждые N тиков)
  - Нет: UI-кнопки "смотреть" в Highlights Panel, которая телепортирует к нужному тику
  - Нет: ReplaySimulator, воспроизводящий snapshot вместо live state

- [ ] **7.2 Tactical Overlays**
  - RenderOptions сейчас: `showNames`, `showStats`, `showHeatmap`, `showPossessionArrow`
  - Нужно добавить в RenderOptions: `showZones`, `showPassingLanes`, `showDefensiveLine`, `showPressureHeatmap`, `showMarkingLines`
  - Renderer уже рисует influenceMap heatmap — нужно дорисовать зоны и линии

- [ ] **7.3 Commentary / Event Descriptions**
  - Сейчас: "Müller passes to Schmidt.", "blazes it wide", "straight at keeper"
  - Нужно: контекстные фразы — "Dangerous ball over the top!", "Great recovery tackle!", "What a chance — inches wide!"
  - Привязка к chain phase, tactical phase, momentum state

---

## 8. TOOLING

- [ ] **8.1 Deterministic Tests** — same seed → same result, same goals, same possession %. SeededRandom уже есть, но прямые мутации в некоторых местах могут нарушать детерминизм.

- [ ] **8.2 Simulation Metrics Dashboard** — passes per possession, shots per game, PPDA, average compactness, transition speed

---

## Приоритеты

### 🔴 Следующие (Football IQ + UX)

- [ ] **7.1** Replay / Jump to moment — инфраструктура есть (ReplayManager), нужен только UI
- [ ] **7.2** Tactical Overlays — showZones / showPassingLanes / showDefensiveLine в RenderOptions + renderer
- [ ] **4.3** Match Rhythm — per-tick tempo control (замедление при ведении, ускорение при отставании)
- [ ] **7.3** Commentary — контекстные описания событий

### 🟡 Потом (Depth)

- [ ] **6.1** xG Pipeline — body part, assist type, GK position factor
- [ ] **5.3** Collisions / shielding
- [ ] **8.2** Metrics Dashboard

### 🟢 Долгосрочно

- [ ] **1.3** Tick Pipeline формализация
- [ ] **1.4** Event Bus 2 уровня
- [ ] **6.2** League Simulation
- [ ] **8.1** Deterministic Tests

---

## Главное правило

> Самая опасная ошибка футбольных движков — улучшать renderer / анимации вместо принятия решений.

Качество игры определяется: **positioning / spacing / decision timing / tactical logic** — а не красотой рендера.

**Архитектурный принцип зон:** каждый игрок "владеет" зоной поля. В атаке — зона смещается вперёд. В обороне — назад. Игрок не должен покидать свою leash zone без причины. Это создаёт компактность, структуру, реализм.