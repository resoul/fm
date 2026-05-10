# 🤖 AGENTS.md — Context for AI Assistants

This file contains key information about the **Football Manager (FM)** project to help AI agents quickly get up to speed and follow established development standards.

## 📝 Project Overview
**Football Manager** is a web-based football management simulator. The user manages a club, tactics, and transfers, and participates in competitions. All game logic and data are stored on the client side.

## 🛠 Technology Stack
- **Core:** React 19, TypeScript, Vite.
- **Styling:** Tailwind CSS 4, Radix UI (components), Lucide React (icons).
- **State Management:** Zustand (UI state, settings).
- **Database:** Dexie.js (IndexedDB) — the primary storage for game data (clubs, players, matches).
- **Routing:** React Router 7.
- **Data Validation:** Zod (data schemas in `src/schemas`).
- **Strict Typing:** Avoid using `any` at all costs. Always define proper interfaces or types for new code.

## 📂 Project Structure
- `src/modules/` — core functional blocks of the game (tactics, transfers, squad, etc.). Each module is isolated.
- `src/schemas/` — Zod schemas defining the data structure of game objects.
- `db/` — Dexie database initialization and hooks for synchronization/access.
- `src/game_events/` — game event logic (draws, matches, event dispatcher).
- `src/state/` — global Zustand stores.
- `src/lib/` — utility functions and helpers.

## 🔑 Key Concepts
1. **Day Transition:** The entire game dynamic is tied to a calendar system. The logic for transitioning between days is located in `src/modules/day-transition`.
2. **Persistent State:** All critical game data must be saved in Dexie (`db/db.ts`). UI state (modals, filters) is stored in Zustand.
3. **Event-Driven:** Some processes (e.g., league draws) operate through an event system in `src/game_events`. The `DrawEvent` is responsible for generating match schedules for seasons.

---
*Update this file when there are significant changes to the architecture or stack.*

## ⚽ Simulation Engine Architecture (Modular & Stateless)
The match engine has been refactored into a modular, command-driven architecture located in `src/modules/simulate/pages/simulate/engine/`.

### Core Layers:
1.  **SimulationWorld (`core/`):** Authority of the current state (players, ball, match metadata).
2.  **Command Buffer (`core/Command.ts`):** Systems do not mutate the world directly. Instead, they emit `Command` objects (intents).
3.  **CommandResolver (`core/CommandResolver.ts`):** The only place where state mutation happens, ensuring determinism.
4.  **SimulationPipeline (`pipeline.ts`):** Orchestrates the execution of multiple `SimulationSystem` instances.
5.  **EventStore (`core/EventStore.ts`):** Records all authoritative match events for replays and sourcing.

### Simulators (`simulation/`):
- **MatchSimulator:** Standard real-time loop.
- **FastSimulator:** Instant match calculation.
- **HybridSimulator:** Switches between Fast and Match modes during "highlights".
- **ReplaySimulator:** Reconstructs match state from snapshots/events.

### Systems (`systems/`):
Pure functional modules (`Decision`, `Movement`, `Physics`, etc.) that process the context and return a list of commands.
