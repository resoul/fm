package engine

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"testing"

	jsonAdapter "github.com/resoul/fm-core/internal/adapters/json"
	"github.com/resoul/fm-core/internal/match/config"
	"github.com/resoul/fm-core/internal/match/domain"
)

// Golden pins fixture, config profile, seed and engine version to a fixed
// result hash and a fixed final per-tick state hash. It exists to catch
// unintentional behavior drift (AGENTS.md / docs/testing/strategy.md
// "Golden сохраняет вход, конфиг, seed, версию и ожидаемые хеши/события").
// Update the expected values only after explaining the behavior change that
// caused them to move (strategy.md).
type goldenCase struct {
	name         string
	fixture      string
	cfg          config.Config
	seed         int64
	wantResult   string
	wantLastTick string
}

func runGolden(t *testing.T, tc goldenCase) (string, string) {
	t.Helper()
	input, err := jsonAdapter.LoadMatchInputFromFile(tc.fixture)
	if err != nil {
		t.Fatal(err)
	}
	e, err := New(input, tc.cfg, tc.seed)
	if err != nil {
		t.Fatal(err)
	}
	e.EnableStateHash()
	if out := e.Apply(domain.MatchCommand{ID: "start", TargetTick: 0, Type: domain.CommandStart}); !out.Accepted {
		t.Fatal(out.Reason)
	}
	var lastStateHash string
	for {
		step, err := e.Step()
		if err != nil {
			t.Fatal(err)
		}
		lastStateHash = step.StateHash
		if e.Phase() == domain.PhaseHalfTime {
			if out := e.Apply(domain.MatchCommand{ID: "continue", TargetTick: e.Tick(), Type: domain.CommandContinueSecondHalf}); !out.Accepted {
				t.Fatal(out.Reason)
			}
		}
		if e.Phase() == domain.PhaseFinished {
			break
		}
	}
	result, err := e.Result()
	if err != nil {
		t.Fatal(err)
	}
	b, err := json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:]), lastStateHash
}

func TestGoldenMatches(t *testing.T) {
	cases := []goldenCase{
		{
			name:         "equal/short_test/seed2024",
			fixture:      "../../../fixtures/match/equal.json",
			cfg:          config.ShortTestConfig(),
			seed:         2024,
			wantResult:   "df84f819c61805fc89e7699ecc2d98eec61998afb0e9bd6dd1e221967b887ed8",
			wantLastTick: "ca2dd1e2e46f3e32000febe34f3c14230e39740ef1b1e2bcc2cfcf14ce76fce8",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			gotResult, gotLastTick := runGolden(t, tc)
			if gotResult != tc.wantResult {
				t.Errorf("result hash = %s, want %s (behavior changed; update only after explaining why in docs/architecture/decisions.md)", gotResult, tc.wantResult)
			}
			if gotLastTick != tc.wantLastTick {
				t.Errorf("last tick state hash = %s, want %s", gotLastTick, tc.wantLastTick)
			}
		})
	}
}

// TestGoldenIsReproducible guards against the golden case itself being
// accidentally non-deterministic (e.g. map iteration leaking into RNG use).
func TestGoldenIsReproducible(t *testing.T) {
	tc := goldenCase{
		fixture: "../../../fixtures/match/equal.json",
		cfg:     config.ShortTestConfig(),
		seed:    2024,
	}
	firstResult, firstLastTick := runGolden(t, tc)
	secondResult, secondLastTick := runGolden(t, tc)
	if firstResult != secondResult || firstLastTick != secondLastTick {
		t.Fatalf("same seed produced different hashes: (%s,%s) vs (%s,%s)", firstResult, firstLastTick, secondResult, secondLastTick)
	}
}
