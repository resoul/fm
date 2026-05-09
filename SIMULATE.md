# Match Simulation

This document describes the current match simulation module, how it is wired, and how to run it without the React match screen.

## Location

The simulation code lives in:

```txt
src/modules/simulate/pages/simulate/
```

Main areas:

```txt
engine/
  core/          authoritative world, commands, resolver, event store, snapshots
  simulation/    realtime, fast, hybrid, replay simulator classes
  systems/       football systems used by the simulation pipeline
  match/         local match-layer exports
  ai/            local AI-layer exports
  replay/        replay exports
  rendering/     renderer exports
  headless/      headless API wrapper
  matchEngine.ts UI-compatible facade over the engine
  teamFactory.ts helpers for clubs, lineups, and runtime teams
  types.ts       Club, PlayerProfile, Team, Player, MatchEvent, state types
```

The React page currently uses `MatchEngine` directly. For non-UI usage, prefer `MatchSimulation` from `engine/headless`.

## Core Idea

The simulation is command-driven:

1. `SimulationWorld` stores authoritative teams, ball, match state, tactical data, and event store.
2. Systems read the current context and return `Command[]`.
3. `CommandResolver` is the central mutation point.
4. `EventStore` records authoritative match events.
5. Renderer/UI should read state or snapshots, not mutate the world.

Current simulator modes:

- `realtime` — full system pipeline for the visual match.
- `fast` — lighter system pipeline.
- `hybrid` — switches between fast and realtime-style highlights.
- `replay` — applies snapshots.

## Important Types

Source types are in:

```ts
src/modules/simulate/pages/simulate/engine/types.ts
```

Key domain types:

```ts
type TeamSide = "home" | "away";

interface Club {
  id: string;
  name: string;
  shortName: string;
  color: string;
  secondaryColor: string;
  budget: number;
  reputation: number;
  squad: PlayerProfile[];
  defaultFormation: string;
}

interface MatchLineup {
  clubId: string;
  formation: string;
  startingXI: string[];
}
```

`Club` and `PlayerProfile` are persistent squad-level data. `Team` and `Player` are runtime match-engine data built from a club lineup.

## Quick Start: Generated Clubs

Use `generateClub`, `autoSelectLineup`, and `buildMatchTeam` when you want a full runnable match quickly.

```ts
import { MatchSimulation } from "./src/modules/simulate/pages/simulate/engine/headless";
import { DEFAULT_FIELD } from "./src/modules/simulate/pages/simulate/engine/matchEngine";
import {
  autoSelectLineup,
  buildMatchTeam,
  generateClub,
} from "./src/modules/simulate/pages/simulate/engine/teamFactory";

const homeClub = generateClub(
  "home_club",
  "FC Scarlet",
  "FCS",
  "#e63946",
  "#ffffff",
  "4-3-3",
  78,
);

const awayClub = generateClub(
  "away_club",
  "Azur City",
  "ACF",
  "#457b9d",
  "#ffffff",
  "4-4-2",
  75,
);

const homeLineup = autoSelectLineup(homeClub);
const awayLineup = autoSelectLineup(awayClub);

const homeTeam = buildMatchTeam(homeClub, homeLineup, DEFAULT_FIELD, "home");
const awayTeam = buildMatchTeam(awayClub, awayLineup, DEFAULT_FIELD, "away");

const sim = new MatchSimulation({
  homeTeam,
  awayTeam,
  config: { seed: 12345 },
  mode: "realtime",
});

sim.start();

for (let i = 0; i < 60 * 15; i++) {
  sim.tick();
}

console.log(sim.getState().state.minute);
console.log(sim.getEvents());
```

## Run Until Full Time

The default match duration is 90 minutes at 60 fps, so a full deterministic run is many ticks. For scripts/tests, use `totalTicks` from state.

```ts
sim.start();

while (sim.getState().state.phase !== "fulltime") {
  sim.tick();

  const state = sim.getState().state;
  if (state.tick > state.totalTicks + 60) {
    throw new Error("Simulation did not finish.");
  }
}

const finalState = sim.getState();
console.log(finalState.homeTeam.score, finalState.awayTeam.score);
console.log(sim.getAuthoritativeEvents());
```

## Passing Custom Clubs

You can construct `Club` manually. Every selected player needs valid `PlayerAttributes`; the simplest reliable pattern is to generate a club and then override names/attributes you care about.

```ts
import type { Club } from "./src/modules/simulate/pages/simulate/engine/types";
import { generateClub } from "./src/modules/simulate/pages/simulate/engine/teamFactory";

const club: Club = generateClub(
  "metalist",
  "Metalist",
  "MET",
  "#facc15",
  "#111827",
  "4-2-3-1",
  74,
);

club.squad[0] = {
  ...club.squad[0],
  name: "Yehor Klymenchuk",
  age: 22,
  primaryPosition: "LB",
  alternatePositions: ["LM"],
  attributes: {
    ...club.squad[0].attributes,
    pace: 82,
    stamina: 78,
    tackling: 76,
    crossing: 72,
  },
};
```

Then build a lineup:

```ts
import type { MatchLineup } from "./src/modules/simulate/pages/simulate/engine/types";

const lineup: MatchLineup = {
  clubId: club.id,
  formation: "4-2-3-1",
  startingXI: club.squad.slice(0, 11).map(player => player.id),
};
```

Important: `startingXI` order maps to formation slot order from `FORMATIONS` in `teamFactory.ts`.

## Manual Runtime Teams

If you already have `Team` objects, you can pass them directly to `MatchSimulation`.

```ts
const sim = new MatchSimulation({
  homeTeam,
  awayTeam,
  config: {
    seed: 9876,
    simSpeed: 1,
  },
  mode: "realtime",
});
```

Use `buildMatchTeam` unless you have a good reason to construct runtime players yourself. It applies formation coordinates, side mirroring, fitness/form adjustments, and default runtime fields.

## Snapshots and Replay

The headless wrapper exposes snapshots:

```ts
const snapshot = sim.getSnapshot();

sim.tick();
sim.tick();

sim.restoreSnapshot(snapshot);
```

Snapshots include:

- current tick
- mode
- teams and runtime player state
- ball state
- match state
- events

This is intended for replay/debug tooling and eventually rollback-like workflows.

## Events

Use:

```ts
sim.getEvents();
sim.getAuthoritativeEvents();
```

Current event examples:

- `pass`
- `tackle`
- `shot`
- `goal`
- `corner`
- `goalkick`
- `throwin`
- `fulltime`

The event system is still evolving. Some gameplay systems emit sparse events today, so absence of events does not always mean nothing happened.

## Instant Result

The pre-match UI has an `INSTANT RESULT` button. It currently uses a separate statistical simulation in:

```txt
src/modules/simulate/pages/simulate/components/PreMatchPage.tsx
```

That path estimates xG from squad attributes and generates goals/scorers. It intentionally does not depend on the realtime visual engine, because the realtime match AI is still being tuned.

## Current Limitations

- Realtime football AI is early: pressing, loose-ball chasing, pass selection, shooting frequency, and goalkeeper behavior are still being tuned.
- The `fast` simulator is not yet a production-grade statistical match engine.
- `MatchSimulation` is headless in API shape, but it still imports code from the local simulate module rather than a separate root package.
- Renderer is read-only by convention and type shape, but more cleanup is still planned.
- Determinism depends on using a fixed `seed` and avoiding non-seeded helpers in new match logic.

## Recommended Next Steps

- Move instant result logic from `PreMatchPage.tsx` into `engine/match` or `engine/headless`.
- Add tests for deterministic seed results, event ordering, loose-ball pickup, and fulltime completion.
- Add a dedicated statistical simulator for league background matches.
- Keep all new simulation mutation inside commands and `CommandResolver`.
