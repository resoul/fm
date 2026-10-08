package batch

import (
	"context"
	"testing"

	jsonAdapter "github.com/resoul/fm-core/internal/adapters/json"
	"github.com/resoul/fm-core/internal/match/config"
)

func TestRunIsIndependentOfWorkers(t *testing.T) {
	input, err := jsonAdapter.LoadMatchInputFromFile("../../fixtures/match/equal.json")
	if err != nil {
		t.Fatal(err)
	}
	one, _, err := Run(context.Background(), input, config.ShortTestConfig(), 42, 4, 1)
	if err != nil {
		t.Fatal(err)
	}
	four, _, err := Run(context.Background(), input, config.ShortTestConfig(), 42, 4, 4)
	if err != nil {
		t.Fatal(err)
	}
	for i := range one {
		if one[i].MatchID != four[i].MatchID || one[i].Score != four[i].Score || one[i].Ticks != four[i].Ticks {
			t.Fatalf("result %d differs between worker counts", i)
		}
	}
}
