package batch

import (
	"context"
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"testing"

	jsonAdapter "github.com/resoul/fm-core/internal/adapters/json"
	"github.com/resoul/fm-core/internal/match/config"
	"github.com/resoul/fm-core/internal/match/domain"
)

func b7Result(homeID, awayID string, home, away int, events ...domain.MatchEvent) domain.MatchResult {
	return domain.MatchResult{
		Status: "finished", Score: domain.Score{Home: home, Away: away}, Events: events,
		TeamStats: []domain.TeamStats{
			{TeamID: homeID, Goals: home, Shots: 10, ShotsOnTarget: 4, Passes: 400, SuccessfulPasses: 320, ExpectedGoals: 1.2, ControlledPossessionMs: 60000},
			{TeamID: awayID, Goals: away, Shots: 8, ShotsOnTarget: 3, Passes: 300, SuccessfulPasses: 210, ExpectedGoals: 0.8, ControlledPossessionMs: 40000},
		},
		PlayerStats: []domain.PlayerStats{
			{PlayerID: "h1", TeamID: homeID, Minutes: 90, DistanceM: 10000},
			{PlayerID: "h2", TeamID: homeID, Minutes: 45, DistanceM: 5000},
			{PlayerID: "a1", TeamID: awayID, Minutes: 90, DistanceM: 9000},
		},
	}
}

// TestB7SummarizeDistributions checks the derived statistics on a small
// hand-built series: histogram, extremes, per-team means/ratios, event
// counts attributed to the right team and per-90 distance normalisation.
func TestB7SummarizeDistributions(t *testing.T) {
	results := []domain.MatchResult{
		b7Result("home", "away", 0, 0),
		b7Result("home", "away", 3, 0, domain.MatchEvent{Type: domain.EventSave, TeamID: "away"}, domain.MatchEvent{Type: domain.EventInterception, TeamID: "away"}, domain.MatchEvent{Type: domain.EventCorner, TeamID: "home"}),
		b7Result("home", "away", 2, 4, domain.MatchEvent{Type: domain.EventInterception, TeamID: "home"}),
	}
	summary := Summarize(results, 7)
	d := summary.Distributions
	if d == nil {
		t.Fatal("no distributions")
	}
	if d.Goalless != 1 || d.SixOrMoreGoals != 1 || d.MarginThreeOrMore != 1 {
		t.Fatalf("extremes = %+v", d)
	}
	if got := d.TotalGoalsHistogram; len(got) != 3 || got[0] != (GoalBucket{0, 1}) || got[1] != (GoalBucket{3, 1}) || got[2] != (GoalBucket{6, 1}) {
		t.Fatalf("histogram = %+v", got)
	}
	if d.TotalGoals.Mean != 3 || d.TotalGoals.Median != 3 || d.TotalGoals.Min != 0 || d.TotalGoals.Max != 6 {
		t.Fatalf("total goals = %+v", d.TotalGoals)
	}
	if math.Abs(d.TotalGoals.StdDev-math.Sqrt(6)) > 1e-9 {
		t.Fatalf("std dev = %v, want sqrt(6)", d.TotalGoals.StdDev)
	}
	home, away := d.Teams[0], d.Teams[1]
	if home.TeamID != "home" || away.TeamID != "away" {
		t.Fatalf("team order = %s/%s", home.TeamID, away.TeamID)
	}
	if home.Goals.Mean != 5.0/3 || home.AverageGoalsPerMatch != 5.0/3 || away.Goals.Max != 4 {
		t.Fatalf("goals: home=%+v away=%+v", home.Goals, away.Goals)
	}
	if math.Abs(home.ShotsOnTargetRatio-0.4) > 1e-9 || math.Abs(home.GoalsPerShot-5.0/30) > 1e-9 || math.Abs(home.GoalsPerShotOnTarget-5.0/12) > 1e-9 || math.Abs(home.GoalsPerExpectedGoal-5.0/3.6) > 1e-9 {
		t.Fatalf("home ratios = %+v", home)
	}
	if math.Abs(home.PassCompletion.Mean-0.8) > 1e-9 || math.Abs(away.PassCompletion.Mean-0.7) > 1e-9 {
		t.Fatalf("pass completion home=%v away=%v", home.PassCompletion.Mean, away.PassCompletion.Mean)
	}
	// Saves/corners belong to the team in the event; a turnover is an
	// interception by the other team.
	if away.Saves.Max != 1 || home.Saves.Max != 0 || home.Corners.Max != 1 || home.Turnovers.Max != 1 || away.Turnovers.Max != 1 {
		t.Fatalf("event attribution: home=%+v away=%+v", home, away)
	}
	if math.Abs(home.PossessionShare.Mean-0.6) > 1e-9 {
		t.Fatalf("possession share = %v", home.PossessionShare.Mean)
	}
	// h1 ran 10 km in 90, h2 ran 5 km in 45 (a 10 km/90 rate): mean 10.
	if math.Abs(home.DistanceKmPerPlayer.Mean-10) > 1e-9 || math.Abs(away.DistanceKmPerPlayer.Mean-9) > 1e-9 {
		t.Fatalf("distance home=%v away=%v", home.DistanceKmPerPlayer.Mean, away.DistanceKmPerPlayer.Mean)
	}
	if summary.HomeWins != 1 || summary.Draws != 1 || summary.AwayWins != 1 || summary.BaseSeed != 7 {
		t.Fatalf("summary = %+v", summary)
	}
}

// TestB7PairAggregatesRostersAcrossSides: the paired comparison credits each
// roster with its results from both series and separates the side effect.
func TestB7PairAggregatesRostersAcrossSides(t *testing.T) {
	original := []domain.MatchResult{b7Result("A", "B", 2, 1), b7Result("A", "B", 0, 0)}
	mirrored := []domain.MatchResult{b7Result("B", "A", 1, 2), b7Result("B", "A", 3, 0)}
	paired, err := Pair(original, mirrored)
	if err != nil {
		t.Fatal(err)
	}
	a, b := paired.Rosters[0], paired.Rosters[1]
	if a.TeamID != "A" || a.Matches != 4 || a.Wins != 2 || a.Draws != 1 || a.Losses != 1 || a.GoalsFor != 4 || a.GoalsAgainst != 5 || a.Points != 7 {
		t.Fatalf("roster A = %+v", a)
	}
	if b.TeamID != "B" || b.Wins != 1 || b.Draws != 1 || b.Losses != 2 || b.GoalsFor != 5 || b.GoalsAgainst != 4 {
		t.Fatalf("roster B = %+v", b)
	}
	if paired.HomeSideGoals != 6 || paired.AwaySideGoals != 3 || math.Abs(paired.HomeSideAdvantage-1.0/3) > 1e-9 {
		t.Fatalf("side goals = %d/%d adv=%v", paired.HomeSideGoals, paired.AwaySideGoals, paired.HomeSideAdvantage)
	}
	if paired.SameSeedSameScore != 1 {
		t.Fatalf("same-score seeds = %d, want 1 (2-1 mirrored as 1-2)", paired.SameSeedSameScore)
	}
	if _, err := Pair(original, original); err == nil {
		t.Fatal("pairing a series with itself (rosters not swapped) must fail")
	}
	if _, err := Pair(original, mirrored[:1]); err == nil {
		t.Fatal("pairing series of different length must fail")
	}
}

// TestB7MirroredEqualFixtureIsLabelSwap: with two identical rosters the
// mirrored series is the same match under swapped labels, seed by seed --
// the batch-level form of the engine's no-side-asymmetry guarantee.
func TestB7MirroredEqualFixtureIsLabelSwap(t *testing.T) {
	input, err := jsonAdapter.LoadMatchInputFromFile("../../fixtures/match/equal.json")
	if err != nil {
		t.Fatal(err)
	}
	mirrored := Mirrored(input)
	if mirrored.HomeTeam.ID != input.AwayTeam.ID || mirrored.AwayTeam.ID != input.HomeTeam.ID {
		t.Fatalf("Mirrored did not swap rosters: %s/%s", mirrored.HomeTeam.ID, mirrored.AwayTeam.ID)
	}
	cfg := config.ShortTestConfig()
	original, _, err := Run(context.Background(), input, cfg, 3100, 20, 4)
	if err != nil {
		t.Fatal(err)
	}
	swapped, _, err := Run(context.Background(), mirrored, cfg, 3100, 20, 4)
	if err != nil {
		t.Fatal(err)
	}
	for i := range original {
		if original[i].Score != swapped[i].Score || original[i].Ticks != swapped[i].Ticks || len(original[i].Events) != len(swapped[i].Events) {
			t.Fatalf("seed %d: mirrored equal fixture diverged: %+v vs %+v", i, original[i].Score, swapped[i].Score)
		}
	}
	paired, err := Pair(original, swapped)
	if err != nil {
		t.Fatal(err)
	}
	if paired.HomeSideGoals != 2*sumHome(original) || paired.AwaySideGoals != 2*sumAway(original) {
		t.Fatalf("paired side goals %d/%d inconsistent with a label swap", paired.HomeSideGoals, paired.AwaySideGoals)
	}
}

func sumHome(results []domain.MatchResult) int {
	n := 0
	for _, r := range results {
		n += r.Score.Home
	}
	return n
}

func sumAway(results []domain.MatchResult) int {
	n := 0
	for _, r := range results {
		n += r.Score.Away
	}
	return n
}

// TestB7RealFixturesRunAndFavouriteWins: every generated real-team fixture
// validates and completes a short paired series without invariant errors,
// and the deliberately lopsided pairing (Bayern vs Inter Miami) gives the
// stronger roster the better point share across both sides. Balance is
// measured, not asserted to a fixed percentage (docs/testing/strategy.md).
func TestB7RealFixturesRunAndFavouriteWins(t *testing.T) {
	fixtures, err := filepath.Glob("../../fixtures/match/real/*.json")
	if err != nil || len(fixtures) == 0 {
		t.Fatalf("no real fixtures found: %v", err)
	}
	cfg := config.ShortTestConfig()
	for _, path := range fixtures {
		input, err := jsonAdapter.LoadMatchInputFromFile(path)
		if err != nil {
			t.Fatalf("%s: %v", path, err)
		}
		if _, _, err := Run(context.Background(), input, cfg, 100, 4, 4); err != nil {
			t.Fatalf("%s: %v", path, err)
		}
	}
	input, err := jsonAdapter.LoadMatchInputFromFile("../../fixtures/match/real/fc_bayern_vs_inter_miami.json")
	if err != nil {
		t.Fatal(err)
	}
	// Full halves, so squad quality has time to show through the noise of a
	// two-minute snippet; 12 seeds mirrored is 24 matches.
	full := config.DefaultConfig()
	original, _, err := Run(context.Background(), input, full, 4200, 12, 4)
	if err != nil {
		t.Fatal(err)
	}
	mirrored, _, err := Run(context.Background(), Mirrored(input), full, 4200, 12, 4)
	if err != nil {
		t.Fatal(err)
	}
	paired, err := Pair(original, mirrored)
	if err != nil {
		t.Fatal(err)
	}
	bayern, miami := paired.Rosters[0], paired.Rosters[1]
	if bayern.TeamID != "fc_bayern" || miami.TeamID != "inter_miami" {
		t.Fatalf("roster order = %s/%s", bayern.TeamID, miami.TeamID)
	}
	if !(bayern.PointShare > miami.PointShare) || !(bayern.GoalsFor > miami.GoalsFor) {
		t.Fatalf("favourite did not come out ahead over the paired series: bayern=%+v miami=%+v", bayern, miami)
	}
	if miami.Wins == 0 && miami.Draws == 0 {
		t.Fatalf("favourite won every match; a statistical edge, not a guaranteed win, is what the model should show: %+v", miami)
	}
}

// TestB7WriteIsDeterministic: a summary with distributions serialises the
// same way twice (no map-order leakage into the JSON artefacts).
func TestB7WriteIsDeterministic(t *testing.T) {
	results := []domain.MatchResult{b7Result("home", "away", 1, 2), b7Result("home", "away", 4, 4)}
	first, _ := json.Marshal(Summarize(results, 1))
	second, _ := json.Marshal(Summarize(results, 1))
	if string(first) != string(second) {
		t.Fatal("summary JSON differs between identical runs")
	}
	dir := t.TempDir()
	if err := WritePaired(dir, Paired{Seeds: 2}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, "paired.json")); err != nil {
		t.Fatal(err)
	}
}
