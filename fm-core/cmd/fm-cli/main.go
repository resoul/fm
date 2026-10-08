package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"math"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"strings"

	jsonAdapter "github.com/resoul/fm-core/internal/adapters/json"
	"github.com/resoul/fm-core/internal/batch"
	"github.com/resoul/fm-core/internal/coach"
	matchConfig "github.com/resoul/fm-core/internal/match/config"
	"github.com/resoul/fm-core/internal/match/domain"
	"github.com/resoul/fm-core/internal/match/engine"
	"github.com/resoul/fm-core/internal/recording"
	"github.com/resoul/fm-core/internal/runner"
)

const version = "0.1.0-dev"

const usage = `Usage: fm-cli <command> [flags]

Commands:
  help [command]  Show help
  version         Show CLI and Go versions
  validate        Validate match input and configuration
  run             Simulate one match
  replay          Verify a recording
  batch           Simulate multiple matches

Use "fm-cli <command> --help" for command flags.
`

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}

// run owns CLI output and exit codes.
func run(args []string, stdout, stderr io.Writer) int {
	if len(args) == 0 {
		fmt.Fprint(stdout, usage)
		return 0
	}
	command, rest := args[0], args[1:]
	switch command {
	case "help", "--help", "-h":
		if command == "help" && len(rest) == 1 {
			if rest[0] == "help" {
				fmt.Fprint(stdout, usage)
				return 0
			}
			return run([]string{rest[0], "--help"}, stdout, stderr)
		}
		if len(rest) != 0 {
			return usageError(stderr, "help accepts at most one command")
		}
		fmt.Fprint(stdout, usage)
		return 0
	case "version", "--version":
		if command == "version" && len(rest) == 1 && (rest[0] == "--help" || rest[0] == "-h") {
			fmt.Fprintln(stdout, "Usage: fm-cli version\n\nShow CLI and Go versions.")
			return 0
		}
		if len(rest) != 0 {
			return usageError(stderr, "version accepts no arguments")
		}
		fmt.Fprintf(stdout, "fm-cli %s (%s)\n", version, runtime.Version())
		return 0
	case "validate", "run", "replay", "batch":
		return parseCommand(command, rest, stdout, stderr)
	default:
		return usageError(stderr, fmt.Sprintf("unknown command %q", command))
	}
}

func parseCommand(command string, args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet(command, flag.ContinueOnError)
	// Keep flag diagnostics separate so help goes to stdout and errors to stderr.
	fs.SetOutput(io.Discard)
	fs.Usage = func() {}

	var input, config, speed, format, commands, record, out string
	var aiCoach, mirror bool
	var seed int64
	var count, workers int
	var verify bool
	if command != "replay" {
		fs.StringVar(&input, "input", "", "match input JSON (required)")
		fs.StringVar(&config, "config", "", "optional model configuration JSON")
	}
	if command == "run" || command == "batch" {
		fs.Int64Var(&seed, "seed", 0, "random seed (required; zero is valid)")
		fs.StringVar(&format, "format", "text", "output format: text or json")
	}
	switch command {
	case "run":
		fs.StringVar(&speed, "speed", "fast", "simulation pacing: fast or realtime")
		fs.StringVar(&commands, "commands", "", "optional command scenario JSON")
		fs.StringVar(&record, "record", "", "new recording directory")
		fs.BoolVar(&aiCoach, "ai-coach", false, "enable the deterministic in-match coach (substitutions, tactics, reformation)")
	case "replay":
		fs.StringVar(&record, "record", "", "recording directory (required)")
		fs.BoolVar(&verify, "verify", false, "verify replay (required)")
	case "batch":
		fs.IntVar(&count, "count", 0, "number of matches (required, positive)")
		fs.IntVar(&workers, "workers", 1, "maximum parallel workers (positive)")
		fs.StringVar(&out, "out", "", "output directory (required)")
		fs.BoolVar(&mirror, "mirror", false, "also run the same seeds with home/away rosters swapped and write mirrored/ plus paired.json")
	}
	err := fs.Parse(args)
	if errors.Is(err, flag.ErrHelp) {
		switch command {
		case "validate":
			fmt.Fprintf(stdout, "Usage: fm-cli validate [flags]\n\nValidate match input and optional model configuration.\n\n")
		case "run":
			fmt.Fprintf(stdout, "Usage: fm-cli run [flags]\n\nSimulate one match and print its result.\n\n")
		case "replay":
			fmt.Fprintf(stdout, "Usage: fm-cli replay [flags]\n\nVerify a recording produced by 'run --record'.\n\n")
		case "batch":
			fmt.Fprintf(stdout, "Usage: fm-cli batch [flags]\n\nSimulate multiple matches over a seed range.\n\n")
		}
		fs.SetOutput(stdout)
		fs.PrintDefaults()
		return 0
	}
	if err != nil {
		return usageError(stderr, err.Error())
	}
	if fs.NArg() != 0 {
		return usageError(stderr, "unexpected positional arguments; place all flags after the command")
	}
	if command != "replay" && input == "" {
		return usageError(stderr, "--input is required")
	}
	if command == "run" || command == "batch" {
		seedSet := false
		fs.Visit(func(f *flag.Flag) {
			if f.Name == "seed" {
				seedSet = true
			}
		})
		if !seedSet {
			return usageError(stderr, "--seed is required (zero is valid)")
		}
		if format != "text" && format != "json" {
			return usageError(stderr, "--format must be text or json")
		}
	}
	switch command {
	case "validate":
		return runValidate(input, config, stdout, stderr)
	case "run":
		if speed != "fast" && speed != "realtime" {
			return usageError(stderr, "--speed must be fast or realtime")
		}
		return runMatch(input, config, commands, record, seed, speed, format, aiCoach, stdout, stderr)
	case "replay":
		if record == "" || !verify {
			return usageError(stderr, "replay requires --record and --verify")
		}
		return runReplay(record, stdout, stderr)
	case "batch":
		if count <= 0 || workers <= 0 || out == "" {
			return usageError(stderr, "batch requires positive --count, positive --workers and --out")
		}
		if seed > math.MaxInt64-int64(count-1) {
			return usageError(stderr, "batch seed range overflows int64")
		}
		return runBatch(input, config, seed, count, workers, mirror, format, out, stdout, stderr)
	}
	panic("unreachable: parseCommand called with unsupported command " + command)
}

func runBatch(inputPath, configPath string, seed int64, count, workers int, mirror bool, format, outPath string, stdout, stderr io.Writer) int {
	matchInput, err := jsonAdapter.LoadMatchInputFromFile(inputPath)
	if err != nil {
		fmt.Fprintf(stderr, "fm-cli: validation error: %v\n", err)
		return 2
	}
	cfg := matchConfig.DefaultConfig()
	if configPath != "" {
		cfg, err = jsonAdapter.LoadResolvedConfigFromFile(configPath, cfg)
		if err != nil {
			fmt.Fprintf(stderr, "fm-cli: configuration error: %v\n", err)
			return 2
		}
	}
	inputBytes, err := os.ReadFile(inputPath)
	if err != nil {
		fmt.Fprintf(stderr, "fm-cli: input error: %v\n", err)
		return 1
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	results, summary, err := batch.Run(ctx, matchInput, cfg, seed, count, workers)
	if err != nil {
		fmt.Fprintf(stderr, "fm-cli: batch error: %v\n", err)
		return 1
	}
	if err := batch.Write(outPath, inputBytes, cfg, results, summary, seed, workers); err != nil {
		fmt.Fprintf(stderr, "fm-cli: batch output error: %v\n", err)
		return 1
	}
	var paired *batch.Paired
	if mirror {
		mirroredResults, mirroredSummary, err := batch.Run(ctx, batch.Mirrored(matchInput), cfg, seed, count, workers)
		if err != nil {
			fmt.Fprintf(stderr, "fm-cli: mirrored batch error: %v\n", err)
			return 1
		}
		if err := batch.Write(filepath.Join(outPath, "mirrored"), inputBytes, cfg, mirroredResults, mirroredSummary, seed, workers); err != nil {
			fmt.Fprintf(stderr, "fm-cli: mirrored batch output error: %v\n", err)
			return 1
		}
		comparison, err := batch.Pair(results, mirroredResults)
		if err != nil {
			fmt.Fprintf(stderr, "fm-cli: paired comparison error: %v\n", err)
			return 1
		}
		if err := batch.WritePaired(outPath, comparison); err != nil {
			fmt.Fprintf(stderr, "fm-cli: paired output error: %v\n", err)
			return 1
		}
		paired = &comparison
	}
	if format == "json" {
		if err := json.NewEncoder(stdout).Encode(summary); err != nil {
			fmt.Fprintf(stderr, "fm-cli: output error: %v\n", err)
			return 1
		}
		if paired != nil {
			if err := json.NewEncoder(stdout).Encode(paired); err != nil {
				fmt.Fprintf(stderr, "fm-cli: output error: %v\n", err)
				return 1
			}
		}
	} else {
		fmt.Fprintf(stdout, "Batch finished: %d matches, average score %.3f-%.3f\n", summary.Completed, summary.AverageHomeGoals, summary.AverageAwayGoals)
		if paired != nil {
			for _, roster := range paired.Rosters {
				fmt.Fprintf(stdout, "Paired %s: %d matches W/D/L %d/%d/%d goals %d-%d point share %.3f\n", roster.TeamID, roster.Matches, roster.Wins, roster.Draws, roster.Losses, roster.GoalsFor, roster.GoalsAgainst, roster.PointShare)
			}
			fmt.Fprintf(stdout, "Paired home-side goals %d, away-side goals %d, home-side advantage %.3f\n", paired.HomeSideGoals, paired.AwaySideGoals, paired.HomeSideAdvantage)
		}
	}
	return 0
}

func runMatch(inputPath, configPath, commandsPath, recordPath string, seed int64, speed, format string, aiCoach bool, stdout, stderr io.Writer) int {
	matchInput, err := jsonAdapter.LoadMatchInputFromFile(inputPath)
	if err != nil {
		fmt.Fprintf(stderr, "fm-cli: validation error: %v\n", err)
		return 2
	}
	cfg := matchConfig.DefaultConfig()
	if configPath != "" {
		cfg, err = jsonAdapter.LoadResolvedConfigFromFile(configPath, cfg)
		if err != nil {
			fmt.Fprintf(stderr, "fm-cli: configuration error: %v\n", err)
			return 2
		}
	}
	e, err := engine.New(matchInput, cfg, seed)
	if err != nil {
		fmt.Fprintf(stderr, "fm-cli: engine initialization error: %v\n", err)
		return 1
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	var scenario []domain.MatchCommand
	if commandsPath != "" {
		scenario, err = jsonAdapter.LoadCommandScenarioFromFile(commandsPath)
		if err != nil {
			fmt.Fprintf(stderr, "fm-cli: commands error: %v\n", err)
			return 2
		}
	}
	var writer *recording.Writer
	if recordPath != "" {
		inputBytes, readErr := os.ReadFile(inputPath)
		if readErr != nil {
			fmt.Fprintf(stderr, "fm-cli: recording input error: %v\n", readErr)
			return 1
		}
		writer, err = recording.NewWriter(recordPath, inputBytes, cfg, seed)
		if err != nil {
			fmt.Fprintf(stderr, "fm-cli: recording error: %v\n", err)
			return 1
		}
	}
	hooks := runner.Hooks{}
	if writer != nil {
		hooks.OnCommand = writer.Command
		hooks.OnStep = writer.Step
	}
	var matchCoach runner.Coach
	var coachLog []coachDecision
	if aiCoach {
		matchCoach = coach.NewPolicy(matchInput.HomeTeam.ID, matchInput.AwayTeam.ID, coach.DefaultConfig())
		prevOnCommand := hooks.OnCommand
		hooks.OnCommand = func(cmd domain.MatchCommand, out domain.CommandOutcome) error {
			if strings.HasPrefix(cmd.ID, "ai-coach-") {
				coachLog = append(coachLog, coachDecision{cmd: cmd, outcome: out})
			}
			if prevOnCommand != nil {
				return prevOnCommand(cmd, out)
			}
			return nil
		}
	}
	result, err := runner.RunCommandsWithCoach(ctx, e, speed, scenario, hooks, matchCoach)
	if err != nil {
		if writer != nil {
			_ = writer.Abort("failed", e.Tick(), err.Error())
		}
		if errors.Is(err, context.Canceled) {
			fmt.Fprintln(stderr, "fm-cli: match cancelled")
			return 130
		}
		fmt.Fprintf(stderr, "fm-cli: run error: %v\n", err)
		return 1
	}
	if writer != nil {
		if err := writer.Finish(result); err != nil {
			fmt.Fprintf(stderr, "fm-cli: recording error: %v\n", err)
			return 1
		}
	}
	if format == "json" {
		if err := json.NewEncoder(stdout).Encode(result); err != nil {
			fmt.Fprintf(stderr, "fm-cli: output error: %v\n", err)
			return 1
		}
		return 0
	}
	fmt.Fprintf(stdout, "Match %s: %s %d-%d %s\n", result.MatchID, result.Status, result.Score.Home, result.Score.Away, speed)
	fmt.Fprintf(stdout, "ticks=%d duration_ms=%d events=%d\n", result.Ticks, result.DurationMs, len(result.Events))
	final := e.Snapshot()
	if len(final.Players) > 0 {
		p := final.Players[0]
		fmt.Fprintf(stdout, "state phase=%s period=%d players=%d ball=(%.2f,%.2f,%.2f) first_player=%s position=(%.2f,%.2f,%.2f)\n",
			final.Phase, final.Period, len(final.Players), final.Ball.Position.X, final.Ball.Position.Y, final.Ball.Position.Z,
			p.ID, p.Position.X, p.Position.Y, p.Position.Z)
	}
	for _, event := range result.Events {
		fmt.Fprintf(stdout, "tick=%d period=%d %s\n", event.Tick, event.Period, event.Type)
	}
	for _, decision := range coachLog {
		status := "accepted"
		if !decision.outcome.Accepted {
			status = "rejected: " + decision.outcome.Reason
		}
		fmt.Fprintf(stdout, "coach tick=%d team=%s %s (%s): %s\n",
			decision.cmd.TargetTick, decision.cmd.TeamID, decision.cmd.Type, status, decision.cmd.Reason)
	}
	return 0
}

// coachDecision pairs a coach-issued command with its outcome for the CLI's
// text-mode explanation log (docs/simulation/coach.md: "решения объяснимы").
type coachDecision struct {
	cmd     domain.MatchCommand
	outcome domain.CommandOutcome
}

func runReplay(recordPath string, stdout, stderr io.Writer) int {
	if err := recording.Verify(recordPath); err != nil {
		fmt.Fprintf(stderr, "fm-cli: replay verification failed: %v\n", err)
		return 1
	}
	fmt.Fprintln(stdout, "Replay verified successfully")
	return 0
}

func runValidate(inputPath, configPath string, stdout, stderr io.Writer) int {
	matchInput, err := jsonAdapter.LoadMatchInputFromFile(inputPath)
	if err != nil {
		fmt.Fprintf(stderr, "fm-cli: validation error: %v\n", err)
		return 2
	}

	if configPath != "" {
		resolvedCfg, err := jsonAdapter.LoadResolvedConfigFromFile(configPath, matchConfig.DefaultConfig())
		if err != nil {
			fmt.Fprintf(stderr, "fm-cli: configuration error: %v\n", err)
			return 2
		}
		if err := matchConfig.RequireRulesProfile(matchInput.RulesProfile, resolvedCfg); err != nil {
			fmt.Fprintf(stderr, "fm-cli: validation error: %v\n", err)
			return 2
		}
		fmt.Fprintf(stdout, "Validation passed: match %q (rules_profile: %s, home: %s, away: %s) with config %q (profile: %s)\n",
			matchInput.MatchID, matchInput.RulesProfile, matchInput.HomeTeam.Name, matchInput.AwayTeam.Name, configPath, resolvedCfg.ProfileName)
		return 0
	}

	fmt.Fprintf(stdout, "Validation passed: match %q (rules_profile: %s, home: %s, away: %s)\n",
		matchInput.MatchID, matchInput.RulesProfile, matchInput.HomeTeam.Name, matchInput.AwayTeam.Name)
	return 0
}

func usageError(stderr io.Writer, message string) int {
	fmt.Fprintf(stderr, "fm-cli: %s\nUse 'fm-cli help' for usage.\n", message)
	return 2
}
