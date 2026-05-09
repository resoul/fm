# Football Manager: Simulation Engine Roadmap 2.0 ⚽🧠

This plan outlines the architectural evolution of the match engine toward a professional-grade, deterministic, and tactically deep simulation.

## Core Architectural Pillars
1. **Decoupled Systems**: Breaking down monolithic systems (AISystem) into specialized, focused units.
2. **Action-Based AI**: Transitioning from procedural logic to an OO/Component-based Action system (ShootAction, PassAction).
3. **Spatial Intelligence**: Moving beyond "ball-centric" AI to "space-centric" AI using Influence Maps and Passing Lanes.
4. **Determinism**: Ensuring same seed = same match for replayability and snapshot testing.

---

## Stage 1: Stabilization & Refactoring 💎
*Goal: Solidify the foundation and clean up technical debt.*

- [/] **Architectural Refactor**
    - [ ] Break `AISystem` into: `DecisionSystem`, `PassingSystem`, `ShootingSystem`, `GoalkeeperSystem`.
    - [ ] Refactor `UtilityAI` into an Action-based system: `Action { score(), execute() }`.
- [ ] **Pure Physics vs Gameplay Math**
    - [ ] Move gameplay balancing (attributes multipliers) out of `physics.ts` into a dedicated `BalanceSystem` or configuration.
- [ ] **Determinism & Testing**
    - [ ] Audit all `Math.random()` calls to ensure they use the `SeededRandom`.
    - [ ] Implement a basic Snapshot Test utility to verify engine state consistency.

## Stage 2: Real Football Intelligence 🧠
*Goal: Implement collective tactical behavior and off-ball movement.*

- [ ] **Advanced Spatial Awareness**
    - [ ] **Influence Maps**: Implement a grid-based map of team control/pressure.
    - [ ] **Passing Lanes**: AI evaluates risk based on defender proximity to potential ball paths.
- [ ] **Collective Tactics**
    - [ ] **Tactical Shape**: Teams maintain formation lines (defensive, midfield, attack) relative to ball/centroid.
    - [ ] **Pressing Triggers**: Defenders decide to leave position based on ball pressure/distance.
- [ ] **Off-Ball Movement**
    - [ ] Support players (attackers) seek "pockets" of space (low influence zones).
    - [ ] Defensive marking: Defenders assign themselves to opponents based on proximity.

## Stage 3: Elite Simulation (The "FM" Layer) 📊
*Goal: Add psychological and physical depth.*

- [ ] **Dynamic Match Context**
    - [ ] **Momentum/Morale**: Teams get bonuses/penalties based on recent success (goals, possession).
    - [ ] **Fatigue Intelligence**: Tired players take fewer risks and have slower reaction times.
- [ ] **Personality & Traits**
    - [ ] `RiskBehavior`: Some players prefer risky long passes; others prefer safe ones.
    - [ ] `Role Personalities`: Specialized behaviors for "Box-to-Box", "Target Man", etc.
- [ ] **Go authoritative?** (Optional Future Goal)
    - [ ] Evaluate porting the deterministic pipeline to a Go backend for a true server-side simulation.

---

## Progress Log
- **2024-05-09**: Initial Stage 1 & 2 (Clean Architecture, Basic AI) - DONE.
- **2024-05-09**: Stage 3 Performance (Spatial Hash, Replays) - DONE.
- **2024-05-09**: Started Roadmap 2.0 (Stabilization & Action System).
