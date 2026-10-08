package engine

import (
	"testing"

	jsonAdapter "github.com/resoul/fm-core/internal/adapters/json"
	"github.com/resoul/fm-core/internal/match/config"
	"github.com/resoul/fm-core/internal/match/domain"
)

// BenchmarkFullMatch measures the cost of one complete two-half match under
// the production profile (DefaultConfig), reported with -benchmem. This
// backs the A6 performance requirement (docs/testing/strategy.md:
// "Время матча, memory ... throughput batch"). Run with:
//
//	go test ./internal/match/engine/... -run '^$' -bench BenchmarkFullMatch -benchmem
func BenchmarkFullMatch(b *testing.B) {
	input, err := jsonAdapter.LoadMatchInputFromFile("../../../fixtures/match/equal.json")
	if err != nil {
		b.Fatal(err)
	}
	cfg := config.DefaultConfig()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		e, err := New(input, cfg, int64(i))
		if err != nil {
			b.Fatal(err)
		}
		if out := e.Apply(domain.MatchCommand{ID: "start", TargetTick: 0, Type: domain.CommandStart}); !out.Accepted {
			b.Fatal(out.Reason)
		}
		for {
			if _, err := e.Step(); err != nil {
				b.Fatal(err)
			}
			if e.Phase() == domain.PhaseHalfTime {
				if out := e.Apply(domain.MatchCommand{ID: "continue", TargetTick: e.Tick(), Type: domain.CommandContinueSecondHalf}); !out.Accepted {
					b.Fatal(out.Reason)
				}
			}
			if e.Phase() == domain.PhaseFinished {
				break
			}
		}
		if _, err := e.Result(); err != nil {
			b.Fatal(err)
		}
	}
}
