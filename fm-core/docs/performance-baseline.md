# Performance baseline (A6)

Measured once to establish a starting point per
[docs/testing/strategy.md](../../../docs/testing/strategy.md) ("Сначала собрать измерения;
требования к матчам/сек и размеру потока выбрать по этим данным"). Re-measure and update this
file after any change likely to affect per-tick cost, allocation shape, or recording volume, and
explain the change in [docs/architecture/decisions.md](../../../docs/architecture/decisions.md).

## Environment

- Date: 2026-09-18
- Hardware: Apple M2, 8 logical CPUs
- OS: macOS 27.0 (BuildVersion 26A428)
- Go: go1.27.1 darwin/arm64
- Build: `go build -trimpath -o bin/fm-cli ./cmd/fm-cli` (module `github.com/resoul/fm-core`)
- Fixture: `fixtures/match/equal.json`, config: `config.DefaultConfig()` (profile_a, 45-minute
  halves, 50ms step -> 108,000 ticks/match) unless noted.

## Single match (engine only, no recording)

### B7 measurement (2026-09-21)

After B7 replaced the static off-ball targets with a per-tick team shape (every outfield player
re-derives a target from the ball, possession and the nearest opponent), added transient pressing,
carrier dribbling, pass-lane checks and the two-phase movement loop (decide from start-of-tick
state, then move):

```
BenchmarkFullMatch-8   10   1850539208 ns/op   314193396 B/op   877742 allocs/op
```

- ~1.85 s per full match, single core (A7: ~0.38 s). The cost is the O(n²) per-tick scans
  (`shapeTarget` → `nearestActiveOpponent` for the team in possession, `laneBlocked` for every
  pass candidate, `pressureOn` at several call sites), not allocation: after reusing scratch
  buffers for pressers/speed fractions/pass options the allocation count is ~0.9M per match
  (2.26M before that fix; A7: 110k). ~314 MB/match is dominated by the unchanged per-step
  snapshot/event output.
- Batch throughput on the same machine: 4 workers ≈ 2 full matches/s (a 100-seed `--mirror`
  series of a real fixture, 200 matches, ≈ 100 s). Acceptable for calibration series; an
  explicit optimisation pass (cached nearest-opponent per tick, lane checks only for the top
  candidates) is left as an open item — see decision 29.


### A7 measurement (2026-09-18)

After replacing scripted tick triggers with possession/position/pressure decisions and adding
fatigue-sensitive movement:

```
BenchmarkFullMatch-8   20   368980790 ns/op   290909446 B/op   109414 allocs/op
```

This is comparable to the A6 run below: the per-tick decision scan adds behavior without a
material change to allocation volume. The result and state golden hashes were intentionally
updated because the trajectory and event stream changed.

`go test ./internal/match/engine/... -run '^$' -bench BenchmarkFullMatch -benchmem -benchtime=20x`

```
BenchmarkFullMatch-8   20   380593017 ns/op   291333793 B/op   110181 allocs/op
```

- ~381 ms wall time per full two-half match, single core.
- ~291 MB allocated per match (110k allocations). This is high for a CLI-only batch workload;
  worth revisiting before B/C (e.g. snapshot/event allocation reuse) if batch throughput or GC
  pause time becomes a bottleneck, but out of scope for closing A6's test-coverage gap.

## Single match with full recording (`run --record`)

`go test ./internal/recording/... -run '^$' -bench BenchmarkFullMatchWithRecording -benchmem -benchtime=10x`

```
BenchmarkFullMatchWithRecording-8   10   5004401933 ns/op   2090870836 B/op   2178597 allocs/op
```

- ~5.0 s per match once every tick is serialized to `states.ndjson`/`events.ndjson`/
  `checksums.ndjson` and hashed (`EnableStateHash`) — roughly 13x the unrecorded cost, dominated by
  per-tick JSON encoding and hashing, not the engine itself.
- One manually recorded match (`run --record`, seed 1, default config) produced:

  | file | size |
  |---|---|
  | `states.ndjson` | 613 MB |
  | `checksums.ndjson` | 10.0 MB |
  | `events.ndjson` | 244 KB |
  | `result.json` | 379 KB |
  | **total** | **609 MB** |

  `states.ndjson` (one full player+ball snapshot per tick, no downsampling) dominates recording
  size. A5 already allows the writer's snapshot frequency to differ from the calculation
  frequency ("частота записи независима от частоты расчёта" — see
  [docs/implementation/roadmap.md](../../../docs/implementation/roadmap.md) A5); this baseline is
  the concrete number that shows *why* that knob matters once recordings need to be shipped or
  stored — running everything at full 50ms tick resolution costs ~600 MB per 90-minute match.

## Batch: 1000 matches, workers=1 vs workers=4

`fm-cli batch --input fixtures/match/equal.json --seed 500 --count 1000 --workers N --out <dir> --format json`,
default config.

| workers | wall time | summary |
|---|---|---|
| 1 | ~600 s (not captured precisely; consistent with 1000 x ~0.4-0.6s/match on one core) | `{"average_home_goals":28.716,"average_away_goals":28.05,"home_wins":432,"away_wins":488,"draws":80,"average_shots":178,"average_passes":720}` |
| 4 | 125.5 s (589.4 s user, 475% CPU) | identical (byte-for-byte `diff` of `results.ndjson` and `summary.json`) |

- `workers=1` and `workers=4` produced **byte-identical** `results.ndjson` and `summary.json` —
  this is the DoD claim ("workers=1/4 дают одинаковые игровые результаты") checked directly, not
  inferred. The batch also completed all 1000 matches with no invariant failures (`engine.Result`
  runs `ValidateInvariants` per match; `batch.Run` returns an error and aborts if any match fails
  it, so a `"status":"finished"` summary is itself the "no invariant violations" evidence).
- `results.ndjson` for 1000 matches (final `MatchResult` per match, no per-tick snapshots) was
  246 MB (~246 KB/match) — batch does not use `internal/recording`, so this does not carry the
  per-tick cost measured above.
- ~4.7x speedup at workers=4 on 8 logical CPUs is expected: `batch.Run` launches one goroutine per
  worker, each running one full synchronous engine at a time (see
  [internal/batch/batch.go](../internal/batch/batch.go)), so wall time scales with
  `count/min(workers, count)` up to core/GC contention limits.
- A fast, CI-friendly regression check for both determinism and invariant-cleanliness now runs on
  every `go test ./...`: `internal/batch/balance_test.go`'s
  `TestBatch1000SeedsNoInvariantViolations` repeats this comparison with 1000 seeds under
  `config.ShortTestConfig()` (~7s) instead of the full 45-minute profile (~10+ minutes), so the
  1000-seed/workers claim is continuously verified without making every CI run pay the full-length
  cost measured above.

## B7 batch baseline (2026-09-21)

The A6/A7 numbers below are historical. The B7 full-match distributions (100 seeds, `--mirror`,
default config, workers=1/4 byte-identical) are recorded in
[docs/implementation/roadmap.md](../../../docs/implementation/roadmap.md) (section B7); the
headline for `equal.json`, seeds 5000–5099: 2.85 goals/match (sd 1.55), 29.5 shots, 31% on
target, 9.6% goals per shot, 589 passes/team at 87–88%, 11.0 km per outfield player per 90,
zero structural side advantage (mirrored series identical to the original under swapped labels).

## Known limitation surfaced by this baseline (not an A6 gap — see A3/A7)

Average combined goals were ~57 per match (28.7 + 28.0) under the default profile at A6 time.
This was an artifact of A3's scripted shot/pass triggers (fixed `tick % 600` / `tick % 120`) and
was tracked as part of A3's "AI игроков" gap rather than a balance bug — not realistic football,
and not something to tune toward as if it were ("Не задавать произвольный процент побед как
«правильный футбол»" — docs/testing/strategy.md).

### A7 side effect: goal count roughly doubled (2026-09-18)

After A7 replaced the tick-modulo triggers with possession/pressure-based decisions, the same
measurement (`fm-cli batch --input fixtures/match/equal.json --seed 500 --count 200 --workers 4`,
default config) moved from ~57 combined goals/match to:

```
{"average_home_goals":49.065,"average_away_goals":49.21,"home_wins":76,"away_wins":93,"draws":31,
 "average_shots":161.65,"average_passes":296.15}
```

~98 combined goals/match, on a similar shot count (161.65 vs the earlier 178) — i.e. per-shot
conversion roughly doubled, not shot volume. The likely mechanism: `startShot`/`advanceBall`
(shot placement, save-or-goal roll, mid-flight interception) were not touched by A7, but *when*
a shot is now taken changed — `shotDecisionRate` in
[internal/match/engine/engine.go](../internal/match/engine/engine.go) scales down with
`pressureOn(carrier)`, so shots increasingly fire in exactly the situations where defenders are
not close to the ball's path, which is also when `interceptingPlayer` is least likely to catch
the ball mid-flight on its way to goal. Fewer intercepted shots with a similar attempt count
means more of them resolve at the save/goal roll, which was already skewed toward goals (a shot
that isn't wide converts at a flat 75% regardless of goalkeeper positioning or shot quality).

This is not a regression A7 needs to fix by its own DoD (A7 is explicitly about *why* a shot/pass
happens, not about tuning the resulting scoreline — see
[docs/implementation/roadmap.md](../../../docs/implementation/roadmap.md) A7's DoD), and the
mirrored-match balance test still passes at the new numbers. It is recorded here so B2's
"калибровка вероятностей и пространственного поведения относительно baseline A7" starts from the
right number, and so nobody mistakes the still-unrealistic ~98 goals/match for an accident this
baseline missed. The save/goal roll not depending on shot quality or keeper positioning is a
separate, pre-existing simplification, not something A7 introduced.
