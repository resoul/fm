package batch

import (
	"context"
	"encoding/json"
	"testing"

	jsonAdapter "github.com/resoul/fm-core/internal/adapters/json"
	"github.com/resoul/fm-core/internal/match/config"
)

// TestBatch1000SeedsNoInvariantViolations backs the A6 DoD claim
// ("batch 1000 матчей не имеет нарушений инвариантов") and the accompanying
// worker-count claim ("workers=1/4 дают одинаковые игровые результаты") with
// an actual run rather than a one-off manual check: Run already fails the
// whole batch if engine.Result's per-match ValidateInvariants rejects any
// match (see internal/match/engine/engine.go), so a nil error over 1000
// seeds is itself the invariant assertion.
func TestBatch1000SeedsNoInvariantViolations(t *testing.T) {
	input, err := jsonAdapter.LoadMatchInputFromFile("../../fixtures/match/equal.json")
	if err != nil {
		t.Fatal(err)
	}
	cfg := config.ShortTestConfig()

	oneWorker, oneSummary, err := Run(context.Background(), input, cfg, 5000, 1000, 1)
	if err != nil {
		t.Fatalf("workers=1: %v", err)
	}
	fourWorkers, fourSummary, err := Run(context.Background(), input, cfg, 5000, 1000, 4)
	if err != nil {
		t.Fatalf("workers=4: %v", err)
	}

	if len(oneWorker) != len(fourWorkers) {
		t.Fatalf("result count differs: workers=1 -> %d, workers=4 -> %d", len(oneWorker), len(fourWorkers))
	}
	for i := range oneWorker {
		a, err := json.Marshal(oneWorker[i])
		if err != nil {
			t.Fatal(err)
		}
		b, err := json.Marshal(fourWorkers[i])
		if err != nil {
			t.Fatal(err)
		}
		if string(a) != string(b) {
			t.Fatalf("result %d differs between workers=1 and workers=4", i)
		}
	}

	oneJSON, _ := json.Marshal(oneSummary)
	fourJSON, _ := json.Marshal(fourSummary)
	if string(oneJSON) != string(fourJSON) {
		t.Fatalf("summary differs between worker counts:\n workers=1: %s\n workers=4: %s", oneJSON, fourJSON)
	}
}

// TestMirroredMatchesAreStatisticallySymmetric backs the A6/testing-strategy
// balance requirement to check mirrored home/away matches: for the "equal"
// fixture (built specifically to be skill-symmetric), swapping which roster
// plays home must not create a structural scoring bias. Each team plays an
// equal number of matches as home and as away across the two batches, so
// their combined goal totals should land close together; a real
// attack-direction/kickoff-side bug would show up as a large, consistent
// skew here, not sampling noise.
func TestMirroredMatchesAreStatisticallySymmetric(t *testing.T) {
	input, err := jsonAdapter.LoadMatchInputFromFile("../../fixtures/match/equal.json")
	if err != nil {
		t.Fatal(err)
	}
	swapped := input.DeepCopy()
	swapped.HomeTeam, swapped.AwayTeam = input.AwayTeam, input.HomeTeam

	const seeds = 30
	cfg := config.DefaultConfig()

	original, _, err := Run(context.Background(), input, cfg, 42000, seeds, 4)
	if err != nil {
		t.Fatal(err)
	}
	mirrored, _, err := Run(context.Background(), swapped, cfg, 42000, seeds, 4)
	if err != nil {
		t.Fatal(err)
	}

	var teamHomeGoals, teamAwayGoals int
	for _, r := range original {
		teamHomeGoals += r.Score.Home
		teamAwayGoals += r.Score.Away
	}
	for _, r := range mirrored {
		// The formerly-home roster now plays away, and vice versa.
		teamAwayGoals += r.Score.Home
		teamHomeGoals += r.Score.Away
	}

	total := teamHomeGoals + teamAwayGoals
	if total == 0 {
		t.Fatal("no goals scored across either batch; cannot assess balance")
	}
	diff := teamHomeGoals - teamAwayGoals
	if diff < 0 {
		diff = -diff
	}
	if relative := float64(diff) / float64(total); relative > 0.25 {
		t.Fatalf("mirrored home/away goal totals diverge too much for an equal fixture: "+
			"team-originally-home=%d team-originally-away=%d (relative diff %.2f > 0.25); "+
			"suspect a home/away structural bias rather than balance noise", teamHomeGoals, teamAwayGoals, relative)
	}
}
