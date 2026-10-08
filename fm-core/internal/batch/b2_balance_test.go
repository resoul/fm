package batch

import (
	"context"
	"testing"

	jsonAdapter "github.com/resoul/fm-core/internal/adapters/json"
	"github.com/resoul/fm-core/internal/match/config"
	"github.com/resoul/fm-core/internal/match/domain"
)

// TestB2CrossFrequencyChangesMeasuredOutput is the B2 calibration guard. It
// compares the A7-compatible neutral fixture with the same players instructed
// to cross often. The sample is fixed and only asserts the intended direction,
// leaving exact football distributions for later balance work.
func TestB2CrossFrequencyChangesMeasuredOutput(t *testing.T) {
	input, err := jsonAdapter.LoadMatchInputFromFile("../../fixtures/match/equal.json")
	if err != nil {
		t.Fatal(err)
	}
	wide := input.DeepCopy()
	setCrossFrequency(&wide.HomeTeam, 1)
	setCrossFrequency(&wide.AwayTeam, 1)

	const seeds = 80
	baseline, _, err := Run(context.Background(), input, config.ShortTestConfig(), 8100, seeds, 4)
	if err != nil {
		t.Fatal(err)
	}
	wideResults, _, err := Run(context.Background(), wide, config.ShortTestConfig(), 8100, seeds, 4)
	if err != nil {
		t.Fatal(err)
	}
	baselineCrosses, wideCrosses := totalCrosses(baseline), totalCrosses(wideResults)
	if wideCrosses <= baselineCrosses {
		t.Fatalf("high cross_frequency did not increase crosses: baseline=%d high=%d", baselineCrosses, wideCrosses)
	}
}

func setCrossFrequency(team *domain.TeamInput, frequency float64) {
	for i := range team.Players {
		team.Players[i].Instructions.CrossFrequency = frequency
	}
}

func totalCrosses(results []domain.MatchResult) int {
	total := 0
	for _, result := range results {
		for _, stats := range result.TeamStats {
			total += stats.Crosses
		}
	}
	return total
}
