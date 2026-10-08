package batch

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
	"sync"

	"github.com/resoul/fm-core/internal/match/config"
	"github.com/resoul/fm-core/internal/match/domain"
	"github.com/resoul/fm-core/internal/match/engine"
	"github.com/resoul/fm-core/internal/runner"
)

type Summary struct {
	Status           string  `json:"status"`
	Count            int     `json:"count"`
	Completed        int     `json:"completed"`
	Failed           int     `json:"failed"`
	BaseSeed         int64   `json:"base_seed"`
	AverageHomeGoals float64 `json:"average_home_goals"`
	AverageAwayGoals float64 `json:"average_away_goals"`
	HomeWins         int     `json:"home_wins"`
	AwayWins         int     `json:"away_wins"`
	Draws            int     `json:"draws"`
	AverageShots     float64 `json:"average_shots"`
	AveragePasses    float64 `json:"average_passes"`
	// Distributions (B7) describe the whole series, not just the means:
	// per-match totals, per-team metric spreads and the extreme outcomes
	// that a calibration write-up has to explain.
	Distributions *Distributions `json:"distributions,omitempty"`
}

// Distribution is the spread of one per-match metric across the series.
type Distribution struct {
	Mean   float64 `json:"mean"`
	StdDev float64 `json:"std_dev"`
	Min    float64 `json:"min"`
	Max    float64 `json:"max"`
	Median float64 `json:"median"`
}

// TeamDistributions are one team's per-match metrics across the series.
type TeamDistributions struct {
	TeamID              string       `json:"team_id"`
	Goals               Distribution `json:"goals"`
	Shots               Distribution `json:"shots"`
	ShotsOnTarget       Distribution `json:"shots_on_target"`
	Saves               Distribution `json:"saves"`
	ExpectedGoals       Distribution `json:"expected_goals"`
	Passes              Distribution `json:"passes"`
	PassCompletion      Distribution `json:"pass_completion"`
	Crosses             Distribution `json:"crosses"`
	SuccessfulCrosses   Distribution `json:"successful_crosses"`
	Corners             Distribution `json:"corners"`
	Turnovers           Distribution `json:"turnovers"`
	PossessionShare     Distribution `json:"possession_share"`
	DistanceKmPerPlayer Distribution `json:"distance_km_per_player"`
	// Derived ratios over the whole series (sums, not means of ratios).
	ShotsOnTargetRatio     float64 `json:"shots_on_target_ratio"`
	GoalsPerShot           float64 `json:"goals_per_shot"`
	GoalsPerShotOnTarget   float64 `json:"goals_per_shot_on_target"`
	GoalsPerExpectedGoal   float64 `json:"goals_per_expected_goal"`
	AverageGoalsPerMatch   float64 `json:"average_goals_per_match"`
	AverageMinutesPerMatch float64 `json:"average_minutes_per_match"`
}

// GoalBucket is how many matches ended with exactly Goals goals in total.
type GoalBucket struct {
	Goals int `json:"goals"`
	Count int `json:"count"`
}

// Distributions is the B7 statistical section of a batch summary.
type Distributions struct {
	TotalGoals          Distribution        `json:"total_goals"`
	TotalGoalsHistogram []GoalBucket        `json:"total_goals_histogram"`
	Goalless            int                 `json:"goalless"`
	SixOrMoreGoals      int                 `json:"six_or_more_goals"`
	MarginThreeOrMore   int                 `json:"margin_three_or_more"`
	Teams               []TeamDistributions `json:"teams"`
}

// Summarize computes the per-series summary for results; every result must
// carry the same two team IDs in the same home/away order.
func Summarize(results []domain.MatchResult, baseSeed int64) Summary {
	count := len(results)
	summary := Summary{Status: "finished", Count: count, Completed: count, BaseSeed: baseSeed}
	if count == 0 {
		return summary
	}
	var homeGoals, awayGoals, shots, passes int
	for _, result := range results {
		homeGoals += result.Score.Home
		awayGoals += result.Score.Away
		for _, stats := range result.TeamStats {
			shots += stats.Shots
			passes += stats.Passes
		}
		if result.Score.Home > result.Score.Away {
			summary.HomeWins++
		} else if result.Score.Away > result.Score.Home {
			summary.AwayWins++
		} else {
			summary.Draws++
		}
	}
	summary.AverageHomeGoals = float64(homeGoals) / float64(count)
	summary.AverageAwayGoals = float64(awayGoals) / float64(count)
	summary.AverageShots = float64(shots) / float64(count)
	summary.AveragePasses = float64(passes) / float64(count)
	summary.Distributions = distributions(results)
	return summary
}

func distributions(results []domain.MatchResult) *Distributions {
	d := &Distributions{}
	totals := make([]float64, len(results))
	histogram := map[int]int{}
	for i, r := range results {
		total := r.Score.Home + r.Score.Away
		totals[i] = float64(total)
		histogram[total]++
		if total == 0 {
			d.Goalless++
		}
		if total >= 6 {
			d.SixOrMoreGoals++
		}
		if margin := r.Score.Home - r.Score.Away; margin >= 3 || margin <= -3 {
			d.MarginThreeOrMore++
		}
	}
	d.TotalGoals = describe(totals)
	for goals := range histogram {
		d.TotalGoalsHistogram = append(d.TotalGoalsHistogram, GoalBucket{Goals: goals, Count: histogram[goals]})
	}
	sort.Slice(d.TotalGoalsHistogram, func(i, j int) bool { return d.TotalGoalsHistogram[i].Goals < d.TotalGoalsHistogram[j].Goals })
	for teamIndex := range results[0].TeamStats {
		d.Teams = append(d.Teams, teamDistributions(results, teamIndex))
	}
	return d
}

func teamDistributions(results []domain.MatchResult, teamIndex int) TeamDistributions {
	n := len(results)
	teamID := results[0].TeamStats[teamIndex].TeamID
	td := TeamDistributions{TeamID: teamID}
	metrics := map[string][]float64{}
	add := func(name string, v float64) { metrics[name] = append(metrics[name], v) }
	var sumGoals, sumShots, sumOnTarget int
	var sumXG float64
	for _, r := range results {
		ts := r.TeamStats[teamIndex]
		sumGoals += ts.Goals
		sumShots += ts.Shots
		sumOnTarget += ts.ShotsOnTarget
		sumXG += ts.ExpectedGoals
		add("goals", float64(ts.Goals))
		add("shots", float64(ts.Shots))
		add("on_target", float64(ts.ShotsOnTarget))
		add("xg", ts.ExpectedGoals)
		add("passes", float64(ts.Passes))
		completion := 0.0
		if ts.Passes > 0 {
			completion = float64(ts.SuccessfulPasses) / float64(ts.Passes)
		}
		add("completion", completion)
		add("crosses", float64(ts.Crosses))
		add("successful_crosses", float64(ts.SuccessfulCrosses))
		var saves, corners, turnovers int
		for _, ev := range r.Events {
			switch {
			case ev.Type == domain.EventSave && ev.TeamID == teamID:
				saves++
			case ev.Type == domain.EventCorner && ev.TeamID == teamID:
				corners++
			case ev.Type == domain.EventInterception && ev.TeamID != teamID:
				// The interceptor's team is the opponent: each such event is
				// one possession this team lost to a tackle, a contested
				// reception, a duel or a cut-out pass.
				turnovers++
			}
		}
		add("saves", float64(saves))
		add("corners", float64(corners))
		add("turnovers", float64(turnovers))
		var possession int
		for _, other := range r.TeamStats {
			possession += other.ControlledPossessionMs
		}
		share := 0.0
		if possession > 0 {
			share = float64(ts.ControlledPossessionMs) / float64(possession)
		}
		add("possession", share)
		var distance, minutes float64
		var players int
		for _, ps := range r.PlayerStats {
			if ps.TeamID != teamID || ps.Minutes <= 0 {
				continue
			}
			// Normalise to a full match so substitutes do not drag the
			// per-player load down; a player's running rate is what the
			// calibration compares with real per-90 distances.
			distance += ps.DistanceM / 1000 * (90 / ps.Minutes)
			minutes += ps.Minutes
			players++
		}
		if players > 0 {
			add("distance", distance/float64(players))
			add("minutes", minutes/float64(players))
		}
	}
	td.Goals = describe(metrics["goals"])
	td.Shots = describe(metrics["shots"])
	td.ShotsOnTarget = describe(metrics["on_target"])
	td.Saves = describe(metrics["saves"])
	td.ExpectedGoals = describe(metrics["xg"])
	td.Passes = describe(metrics["passes"])
	td.PassCompletion = describe(metrics["completion"])
	td.Crosses = describe(metrics["crosses"])
	td.SuccessfulCrosses = describe(metrics["successful_crosses"])
	td.Corners = describe(metrics["corners"])
	td.Turnovers = describe(metrics["turnovers"])
	td.PossessionShare = describe(metrics["possession"])
	td.DistanceKmPerPlayer = describe(metrics["distance"])
	td.AverageGoalsPerMatch = float64(sumGoals) / float64(n)
	td.AverageMinutesPerMatch = describe(metrics["minutes"]).Mean
	if sumShots > 0 {
		td.ShotsOnTargetRatio = float64(sumOnTarget) / float64(sumShots)
		td.GoalsPerShot = float64(sumGoals) / float64(sumShots)
	}
	if sumOnTarget > 0 {
		td.GoalsPerShotOnTarget = float64(sumGoals) / float64(sumOnTarget)
	}
	if sumXG > 0 {
		td.GoalsPerExpectedGoal = float64(sumGoals) / sumXG
	}
	return td
}

func describe(values []float64) Distribution {
	if len(values) == 0 {
		return Distribution{}
	}
	sorted := append([]float64(nil), values...)
	sort.Float64s(sorted)
	var sum float64
	for _, v := range sorted {
		sum += v
	}
	mean := sum / float64(len(sorted))
	var variance float64
	for _, v := range sorted {
		variance += (v - mean) * (v - mean)
	}
	median := sorted[len(sorted)/2]
	if len(sorted)%2 == 0 {
		median = (sorted[len(sorted)/2-1] + sorted[len(sorted)/2]) / 2
	}
	return Distribution{Mean: mean, StdDev: math.Sqrt(variance / float64(len(sorted))), Min: sorted[0], Max: sorted[len(sorted)-1], Median: median}
}

// Mirrored swaps which roster plays at home, keeping every other field. A
// paired series runs the same seeds on the input and on its mirror, so any
// systematic home/away (attack-direction, kickoff-side) effect separates
// from roster strength.
func Mirrored(input domain.MatchInput) domain.MatchInput {
	swapped := input.DeepCopy()
	swapped.HomeTeam, swapped.AwayTeam = swapped.AwayTeam, swapped.HomeTeam
	return swapped
}

// RosterComparison aggregates one roster's results across the original and
// mirrored series: it played every seed once at home and once away.
type RosterComparison struct {
	TeamID       string  `json:"team_id"`
	Matches      int     `json:"matches"`
	Wins         int     `json:"wins"`
	Draws        int     `json:"draws"`
	Losses       int     `json:"losses"`
	GoalsFor     int     `json:"goals_for"`
	GoalsAgainst int     `json:"goals_against"`
	Shots        int     `json:"shots"`
	Passes       int     `json:"passes"`
	Points       int     `json:"points"`
	PointShare   float64 `json:"point_share"`
}

// Paired is the comparison written by a --mirror batch.
type Paired struct {
	Seeds int `json:"seeds"`
	// Rosters compares the two squads independent of which side they played.
	Rosters []RosterComparison `json:"rosters"`
	// HomeSideGoals/AwaySideGoals are goals scored by whichever roster played
	// home/away across both series; with no home advantage modelled they
	// should differ only by sampling noise. HomeSideAdvantage is their
	// relative difference (0 = perfectly symmetric).
	HomeSideGoals     int     `json:"home_side_goals"`
	AwaySideGoals     int     `json:"away_side_goals"`
	HomeSideAdvantage float64 `json:"home_side_advantage"`
	// SameSeedSameScore counts seeds where the mirrored match reproduced the
	// original score with sides swapped: expected to be low, since the RNG
	// stream is consumed in a different order once the rosters swap sides.
	SameSeedSameScore int `json:"same_seed_same_score"`
}

// Pair builds the paired comparison from an original series and its
// mirrored counterpart run on the same seeds.
func Pair(original, mirrored []domain.MatchResult) (Paired, error) {
	if len(original) != len(mirrored) || len(original) == 0 {
		return Paired{}, fmt.Errorf("batch: paired series need the same non-zero length, got %d and %d", len(original), len(mirrored))
	}
	homeID, awayID := original[0].TeamStats[0].TeamID, original[0].TeamStats[1].TeamID
	if mirrored[0].TeamStats[0].TeamID != awayID || mirrored[0].TeamStats[1].TeamID != homeID {
		return Paired{}, fmt.Errorf("batch: mirrored series does not swap the same two rosters")
	}
	rosters := map[string]*RosterComparison{homeID: {TeamID: homeID}, awayID: {TeamID: awayID}}
	paired := Paired{Seeds: len(original)}
	tally := func(results []domain.MatchResult) {
		for _, r := range results {
			home, away := rosters[r.TeamStats[0].TeamID], rosters[r.TeamStats[1].TeamID]
			home.Matches++
			away.Matches++
			home.GoalsFor += r.Score.Home
			home.GoalsAgainst += r.Score.Away
			away.GoalsFor += r.Score.Away
			away.GoalsAgainst += r.Score.Home
			home.Shots += r.TeamStats[0].Shots
			away.Shots += r.TeamStats[1].Shots
			home.Passes += r.TeamStats[0].Passes
			away.Passes += r.TeamStats[1].Passes
			switch {
			case r.Score.Home > r.Score.Away:
				home.Wins++
				away.Losses++
			case r.Score.Home < r.Score.Away:
				away.Wins++
				home.Losses++
			default:
				home.Draws++
				away.Draws++
			}
			paired.HomeSideGoals += r.Score.Home
			paired.AwaySideGoals += r.Score.Away
		}
	}
	tally(original)
	tally(mirrored)
	for i := range original {
		if original[i].Score.Home == mirrored[i].Score.Away && original[i].Score.Away == mirrored[i].Score.Home {
			paired.SameSeedSameScore++
		}
	}
	for _, id := range []string{homeID, awayID} {
		rc := rosters[id]
		rc.Points = 3*rc.Wins + rc.Draws
		if rc.Matches > 0 {
			rc.PointShare = float64(rc.Points) / float64(3*rc.Matches)
		}
		paired.Rosters = append(paired.Rosters, *rc)
	}
	if total := paired.HomeSideGoals + paired.AwaySideGoals; total > 0 {
		paired.HomeSideAdvantage = float64(paired.HomeSideGoals-paired.AwaySideGoals) / float64(total)
	}
	return paired, nil
}

type Manifest struct {
	SchemaVersion string `json:"schema_version"`
	Count         int    `json:"count"`
	Workers       int    `json:"workers"`
	BaseSeed      int64  `json:"base_seed"`
}

func Run(ctx context.Context, input domain.MatchInput, cfg config.Config, baseSeed int64, count, workers int) ([]domain.MatchResult, Summary, error) {
	if count <= 0 || workers <= 0 {
		return nil, Summary{}, fmt.Errorf("batch: count and workers must be positive")
	}
	if workers > count {
		workers = count
	}
	results := make([]domain.MatchResult, count)
	errs := make([]error, count)
	jobs := make(chan int)
	var wg sync.WaitGroup
	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := range jobs {
				select {
				case <-ctx.Done():
					errs[i] = ctx.Err()
					continue
				default:
				}
				matchInput := input.DeepCopy()
				matchInput.MatchID = fmt.Sprintf("%s-%d", input.MatchID, i)
				resultEngine, err := engine.New(matchInput, cfg, baseSeed+int64(i))
				if err == nil {
					results[i], err = runner.Run(ctx, resultEngine, "fast")
				}
				errs[i] = err
			}
		}()
	}
	for i := 0; i < count; i++ {
		jobs <- i
	}
	close(jobs)
	wg.Wait()
	for i, err := range errs {
		if err != nil {
			return results, Summary{Status: "failed", Count: count, BaseSeed: baseSeed}, fmt.Errorf("batch match %d: %w", i, err)
		}
	}
	return results, Summarize(results, baseSeed), nil
}

func Write(dir string, input []byte, cfg config.Config, results []domain.MatchResult, summary Summary, baseSeed int64, workers int) error {
	if _, err := os.Stat(dir); err == nil {
		entries, readErr := os.ReadDir(dir)
		if readErr != nil {
			return readErr
		}
		if len(entries) > 0 {
			return fmt.Errorf("batch output directory %q is not empty", dir)
		}
	} else if !os.IsNotExist(err) {
		return err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(dir, "input.json"), input, 0o644); err != nil {
		return err
	}
	configBytes, err := config.CanonicalJSON(cfg)
	if err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(dir, "config.json"), configBytes, 0o644); err != nil {
		return err
	}
	manifest := Manifest{SchemaVersion: "v1", Count: len(results), Workers: workers, BaseSeed: baseSeed}
	if err := writeJSON(filepath.Join(dir, "manifest.json"), manifest); err != nil {
		return err
	}
	f, err := os.Create(filepath.Join(dir, "results.ndjson"))
	if err != nil {
		return err
	}
	enc := json.NewEncoder(f)
	for _, result := range results {
		if err := enc.Encode(result); err != nil {
			f.Close()
			return err
		}
	}
	if err := f.Close(); err != nil {
		return err
	}
	if err := writeJSON(filepath.Join(dir, "summary.json"), summary); err != nil {
		return err
	}
	return writeJSON(filepath.Join(dir, "completion.json"), map[string]any{"status": summary.Status, "completed": summary.Completed, "failed": summary.Failed})
}

// WritePaired stores the mirrored comparison next to the original series.
func WritePaired(dir string, paired Paired) error {
	return writeJSON(filepath.Join(dir, "paired.json"), paired)
}

func writeJSON(path string, value any) error {
	b, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0o644)
}
