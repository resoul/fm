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

---

## 1. CORE ENGINE / АРХИТЕКТУРА

- [✅ DONE] **1.1 Command System** — registry-based handlers, типизированные через mapped types; resolver.register() для расширения без правки core; UPDATE_PLAYER_METRICS без прямых мутаций.

- [✅ DONE] **1.2 Immutable Safety**
    - Новые команды: `TELEPORT_PLAYER`, `SET_PLAYER_TARGET`,
      `SET_PLAYER_BALL_OWNERSHIP`, `CLEAR_ALL_DECISIONS`
    - RefereeSystem полностью переведён на Command-паттерн:
      нет прямых мутаций player.pos / targetPos / vel / hasBall / nextDecision
    - Остаток: readonly snapshots, deep freeze в dev, mutation assertions

- [ ] **1.3 Tick Pipeline** (формализовать порядок)
    - Декларативный граф зависимостей с явными read/write контрактами
    - Поймать конфликты типа "MovementSystem читает то, что RefereeSystem ещё не записал"

- [ ] **1.4 Event Bus 2 уровня**
    - Simulation Events (для логики): `possession_changed`, `interception`
    - Presentation Events (для UI): `crowd_reaction`, `commentary`, `highlight`

---

## 2. FOOTBALL AI

- [✅ DONE] **2.4 Tactical States** — 5 фаз: `in_possession / transition_attack / out_of_possession / transition_defend / set_piece`. Обновляются каждый тик.

- [✅ DONE] **2.5 Decision Scoring (UtilityAI)** — HoldAction, PassAction с lane bonus, DribbleAction, ShootAction.

- [✅ DONE] **2.1 Off-ball Intelligence**
  - hold_shape использует ZoneSystem.isOutsideLeash() вместо фиксированного targetPos
  - Явный "repositioning phase" (20 тиков) после рестарта
  - defenseRecovery использует zone anchor Y для сохранения латеральной структуры

- [✅ DONE] **2.2 Space Awareness**
  - defensiveLine: реальная X-позиция второго защитника, не фиксированный процент поля
  - dangerousZones вычисляются относительно реальной defensive line
  - PassAction: pressurePenalty — не пасовать в зоны с оппонентской dominance
  - PassAction: defensiveLinePenalty — не пасовать за линию обороны без реального забегания

- [🔧 PARTIAL] **2.3 Team Shape System**
    - Centroids и compactness есть
    - Нет: dynamic width/depth adjustment в зависимости от фазы и счёта

- [✅ DONE] **2.6 Restart Intelligence**
    - `RestartIntelligenceSystem` — новый файл `engine/systems/RestartIntelligenceSystem.ts`
    - **corner**: атакующие занимают ближний/дальний пост, пенальти, край, поздний забег; защитники зонально + GK на пост; один форвард уходит на контратаку
    - **throwin**: 3–4 игрока создают варианты (короткий / вперёд / назад / широко); защитники давят на ближние опции
    - **goalkick**: команда разбегается широко, ST уходит к средней линии; противник выстраивается по линии давления
    - **freekick (атака)**: забегания в штрафную, стенка из 2–4 защитников, GK на ближний пост; **(своя половина)**: выстраиваются для получения
    - Пересчёт раз в 30 тиков (не каждый тик — нет дёрганья)
    - Зарегистрирован в `MatchSimulator` перед `OffBallSystem`

---

## 3. TACTICS SYSTEM

- [ ] **3.1 Tactical Instructions**
    - In Possession: width, tempo, overlaps, directness
    - Out of Possession: press line, compactness, trap side

- [ ] **3.2 Role Behaviors**
    - Сейчас: CM, ST, LW и т.д. как базовые позиции
    - Нужно: deep lying playmaker, mezzala, inverted winger, libero

- [ ] **3.3 Tactical Identity**
    - tiki-taka, gegenpress, low block, direct football — узнаваемый стиль

---

## 4. MATCH FLOW & REALISM

- [🔧 PARTIAL] **4.1 Possession Chains**
    - PossessionChain трекер есть
    - Нет: использования данных для тактических решений (когда переходить к вертикальной игре)

- [ ] **4.2 Momentum**
    - После гола — confidence spike у атаки, паника у обороны, изменение давления команды

- [ ] **4.3 Match Rhythm**
    - Recycling possession, tempo shifts, намеренное замедление при ведении в счёте

- [✅ DONE] **4.4 Realistic Error Model**
    - `PassingSystem`: `computePassError()` — отклонение targetPos от `passing` + pressure + fatigue + distance
    - `ShootingSystem`: `computeShotError()` — для дальних ударов avg(`longShots`, `finishing`); радиус до 55px
    - Лейблы событий: "wayward pass" / "loose pass" / "blazes it wide" / "straight at keeper"
    - Wild pass (>22px): receiver cooldown не выставляется
    - Все константы вынесены в `balance.ts` (12 новых констант `PASS_ERROR_*` / `SHOT_ERROR_*`)

---

## 5. PHYSICS & MOVEMENT

- [🔧 PARTIAL] **5.1 Ball Physics** — базовая физика, bounce, height. Нет: spin, realistic ground friction.

- [🔧 PARTIAL] **5.2 Movement Model** — acceleration/deceleration/fatigue есть. Нет: turning radius, inertia при резкой смене направления.

- [ ] **5.3 Collision System** — shielding, shoulder duels, loose-ball scrambles

---

## 6. STATISTICAL ENGINE

- [ ] **6.1 xG Pipeline** — shot location, body part, assist type, pressure on shooter, GK position

- [ ] **6.2 League Simulation** — fatigue accumulation между матчами, squad rotation, morale

---

## 7. UI / VIEWER

- [✅ DONE] **Highlights Panel** — вкладка "⚡ Моменты"; фильтрует голы, удары, сейвы, угловые, свободные удары; показывает xG.

- [ ] **7.1 Replay / Jump to moment** — snapshot каждые N секунд → кнопка "смотреть" телепортирует к тику

- [ ] **7.2 Tactical Overlays**
    - Zone Grid overlay: показать 6×5 сетку + кто в какой зоне
    - Нужно добавить `renderOptions.showZones` в `FootballField.tsx`
    - passing lanes, defensive line, marking assignments, pressure heatmap toggle

- [ ] **7.3 Commentary / Event Descriptions**
    - Сейчас: "Müller passes to Schmidt."
    - Нужно: "Dangerous ball over the top!", "Great recovery tackle!", "What a chance!"

---

## 8. TOOLING

- [ ] **8.1 Deterministic Tests** — same seed → same result, same goals, same possession %. Прямые мутации в RefereeSystem сейчас нарушают детерминизм.

- [ ] **8.2 Simulation Metrics Dashboard** — passes per possession, shots per game, PPDA, average compactness, transition speed

---

## Приоритеты

### 🟡 Сейчас (Football IQ)

- [ ] **2.1** OffBallSystem: `hold_shape` использует `ZoneSystem.isOutsideLeash()`
- [ ] **2.2** SpaceAwareness: опасные зоны, линия обороны
- [ ] **4.1** Possession Chains: вертикальная vs горизонтальная игра
- [ ] **4.2** Momentum: реакция команды на гол

### 🟢 Потом (Realism + Meta)

- [ ] **3.1** Tactical Instructions (ширина, темп, прессинг)
- [ ] **3.3** Tactical Identity (стили игры)
- [ ] **5.3** Collisions / shielding
- [ ] **6.1** xG Pipeline
- [ ] **7.1** Replay / Jump to moment

---

## Главное правило

> Самая опасная ошибка футбольных движков — улучшать renderer / анимации вместо принятия решений.

Качество игры определяется: **positioning / spacing / decision timing / tactical logic** — а не красотой рендера.

**Архитектурный принцип зон:** каждый игрок "владеет" зоной поля. В атаке — зона смещается вперёд. В обороне — назад. Игрок не должен покидать свою leash zone без причины. Это создаёт компактность, структуру, реализм.