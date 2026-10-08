package runner

import (
	"context"
	"fmt"
	"sort"
	"time"

	"github.com/resoul/fm-core/internal/match/domain"
	"github.com/resoul/fm-core/internal/match/engine"
)

var ErrCancelled = context.Canceled

type Hooks struct {
	OnCommand func(domain.MatchCommand, domain.CommandOutcome) error
	OnStep    func(engine.StepOutput) error
	OnResync  func() error
}

// Coach observes an independent read-only view of the match and proposes
// ordinary commands. The runner calls it after every completed step during
// play and at the halftime boundary, assigns each proposal's target tick
// and globally monotonic sequence, then applies and records it exactly like
// a user command. A coach must not mutate the engine or use wall-clock
// state; this keeps its decisions reproducible from the recorded commands
// (docs/simulation/coach.md).
type Coach interface {
	Commands(domain.CoachView) []domain.MatchCommand
}

// Run executes a match synchronously. Realtime only controls pacing; it never
// changes the number or order of engine steps.
func Run(ctx context.Context, e *engine.Engine, speed string) (domain.MatchResult, error) {
	return RunCommandsWithHooks(ctx, e, speed, nil, Hooks{})
}

func RunCommands(ctx context.Context, e *engine.Engine, speed string, commands []domain.MatchCommand) (domain.MatchResult, error) {
	return RunCommandsWithHooks(ctx, e, speed, commands, Hooks{})
}

func RunCommandsWithHooks(ctx context.Context, e *engine.Engine, speed string, commands []domain.MatchCommand, hooks Hooks) (domain.MatchResult, error) {
	return runCommands(ctx, e, speed, commands, hooks, nil, nil)
}

// RunCommandsWithChannel extends the normal runner with commands arriving
// while the match is running. The runner remains the only goroutine that calls
// Engine.Apply; the channel is only an input queue owned by the transport.
func RunCommandsWithChannel(ctx context.Context, e *engine.Engine, speed string, commands <-chan domain.MatchCommand, hooks Hooks) (domain.MatchResult, error) {
	return runCommands(ctx, e, speed, nil, hooks, nil, commands)
}

// RunCommandsWithCoach executes an optional deterministic coach alongside a
// scenario. Coach output is recorded through Hooks exactly like user commands.
func RunCommandsWithCoach(ctx context.Context, e *engine.Engine, speed string, commands []domain.MatchCommand, hooks Hooks, coach Coach) (domain.MatchResult, error) {
	return runCommands(ctx, e, speed, commands, hooks, coach, nil)
}

func runCommands(ctx context.Context, e *engine.Engine, speed string, commands []domain.MatchCommand, hooks Hooks, coach Coach, external <-chan domain.MatchCommand) (domain.MatchResult, error) {
	if hooks.OnStep != nil {
		e.EnableStateHash()
	}
	if speed != "fast" && speed != "realtime" {
		return domain.MatchResult{}, fmt.Errorf("runner: unsupported speed %q", speed)
	}
	commands = append([]domain.MatchCommand(nil), commands...)
	sort.SliceStable(commands, func(i, j int) bool {
		if commands[i].TargetTick != commands[j].TargetTick {
			return commands[i].TargetTick < commands[j].TargetTick
		}
		return commands[i].Sequence < commands[j].Sequence
	})
	for i := 1; i < len(commands); i++ {
		if commands[i].TargetTick == commands[i-1].TargetTick && commands[i].Sequence == commands[i-1].Sequence {
			return domain.MatchResult{}, fmt.Errorf("runner: duplicate command sequence %d at tick %d", commands[i].Sequence, commands[i].TargetTick)
		}
		if commands[i].Sequence <= commands[i-1].Sequence {
			return domain.MatchResult{}, fmt.Errorf("runner: command sequence must be globally monotonic; %d follows %d", commands[i].Sequence, commands[i-1].Sequence)
		}
	}
	lastSequence := int64(0)
	applyExternal := func(cmd domain.MatchCommand) error {
		if cmd.Type == domain.CommandType("resync") {
			if hooks.OnResync == nil {
				return nil
			}
			return hooks.OnResync()
		}
		if cmd.TargetTick < 0 {
			cmd.TargetTick = e.Tick()
		}
		if cmd.Sequence <= 0 {
			lastSequence++
			cmd.Sequence = lastSequence
		} else if cmd.Sequence > lastSequence {
			lastSequence = cmd.Sequence
		}
		out := e.Apply(cmd)
		if hooks.OnCommand != nil {
			if err := hooks.OnCommand(cmd, out); err != nil {
				return err
			}
		}
		return nil
	}
	startCmd := domain.MatchCommand{ID: "auto-start", TargetTick: e.Tick(), Sequence: 1, Type: domain.CommandStart}
	startOut := e.Apply(startCmd)
	if !startOut.Accepted {
		return domain.MatchResult{}, fmt.Errorf("runner: start rejected: %s", startOut.Reason)
	}
	if hooks.OnCommand != nil {
		if err := hooks.OnCommand(startCmd, startOut); err != nil {
			return domain.MatchResult{}, err
		}
	}
	var started time.Time
	commandIndex := 0
	lastCoachEventSeq := int64(0)
	// applyCoachProposals asks coach for its view of the match right now,
	// assigns each proposal the current tick and the next free sequence
	// (reserving scenario sequences already queued at this tick), and
	// applies/records it exactly like a user command. Shared by the
	// halftime boundary and the per-tick in-play reevaluation below so both
	// go through one ordering rule.
	applyCoachProposals := func() error {
		if coach == nil {
			return nil
		}
		view := e.CoachView(lastCoachEventSeq)
		lastCoachEventSeq = view.LastEventSeq
		proposals := coach.Commands(view)
		if commandIndex < len(commands) && lastSequence+int64(len(proposals)) >= commands[commandIndex].Sequence {
			return fmt.Errorf("runner: cannot order %d coach command(s) before scenario sequence %d; reserve sequence values", len(proposals), commands[commandIndex].Sequence)
		}
		for _, proposed := range proposals {
			if proposed.ID == "" {
				return fmt.Errorf("runner: coach emitted command without id")
			}
			proposed.TargetTick, proposed.Sequence = e.Tick(), lastSequence+1
			lastSequence = proposed.Sequence
			out := e.Apply(proposed)
			if hooks.OnCommand != nil {
				if err := hooks.OnCommand(proposed, out); err != nil {
					return err
				}
			}
			if !out.Accepted {
				return fmt.Errorf("runner: coach command %q rejected: %s", proposed.ID, out.Reason)
			}
		}
		return nil
	}
	for {
		select {
		case <-ctx.Done():
			return domain.MatchResult{}, ErrCancelled
		default:
		}
		// Drain commands without mutating engine state from the transport
		// goroutine. They are applied in this owner loop only.
		if external != nil {
			draining := true
			for draining {
				select {
				case cmd, ok := <-external:
					if !ok {
						return domain.MatchResult{}, ErrCancelled
					}
					if err := applyExternal(cmd); err != nil {
						return domain.MatchResult{}, err
					}
				default:
					draining = false
				}
			}
		}
		if e.IsPaused() {
			if external == nil {
				return domain.MatchResult{}, fmt.Errorf("runner: match is paused with no command channel")
			}
			select {
			case <-ctx.Done():
				return domain.MatchResult{}, ErrCancelled
			case cmd, ok := <-external:
				if !ok {
					return domain.MatchResult{}, ErrCancelled
				}
				if err := applyExternal(cmd); err != nil {
					return domain.MatchResult{}, err
				}
				continue
			}
		}
		for commandIndex < len(commands) && commands[commandIndex].TargetTick < e.Tick() {
			return domain.MatchResult{}, fmt.Errorf("runner: command %q is late for tick %d", commands[commandIndex].ID, e.Tick())
		}
		for commandIndex < len(commands) && commands[commandIndex].TargetTick == e.Tick() {
			cmd := commands[commandIndex]
			out := e.Apply(cmd)
			if hooks.OnCommand != nil {
				if err := hooks.OnCommand(cmd, out); err != nil {
					return domain.MatchResult{}, err
				}
			}
			if !out.Accepted {
				return domain.MatchResult{}, fmt.Errorf("runner: command %q rejected: %s", cmd.ID, out.Reason)
			}
			lastSequence = cmd.Sequence
			commandIndex++
		}
		if e.Phase() == domain.PhaseHalfTime {
			if err := applyCoachProposals(); err != nil {
				return domain.MatchResult{}, err
			}
			out := e.Apply(domain.MatchCommand{ID: "auto-continue-second-half", TargetTick: e.Tick(), Sequence: 2, Type: domain.CommandContinueSecondHalf})
			if !out.Accepted {
				return domain.MatchResult{}, fmt.Errorf("runner: continue rejected: %s", out.Reason)
			}
			if hooks.OnCommand != nil {
				if err := hooks.OnCommand(domain.MatchCommand{ID: "auto-continue-second-half", TargetTick: e.Tick(), Type: domain.CommandContinueSecondHalf}, out); err != nil {
					return domain.MatchResult{}, err
				}
			}
			continue
		}
		if e.Phase() == domain.PhaseFinished || e.Phase() == domain.PhaseAbandoned {
			if commandIndex != len(commands) {
				return domain.MatchResult{}, fmt.Errorf("runner: command %q cannot run after the match ended (%s)", commands[commandIndex].ID, e.Phase())
			}
			return e.Result()
		}
		if e.Phase() == domain.PhaseFirstHalf || e.Phase() == domain.PhaseSecondHalf { /* normal step below */
		} else {
			return domain.MatchResult{}, fmt.Errorf("runner: match is paused with no reachable command")
		}
		if speed == "realtime" {
			if started.IsZero() {
				started = time.Now()
			}
			want := time.Duration(e.Tick()+1) * e.StepDuration()
			if wait := want - time.Since(started); wait > 0 {
				timer := time.NewTimer(wait)
				select {
				case <-ctx.Done():
					timer.Stop()
					return domain.MatchResult{}, ErrCancelled
				case <-timer.C:
				}
			}
		}
		step, err := e.Step()
		if err != nil {
			return domain.MatchResult{}, err
		}
		if hooks.OnStep != nil {
			if err := hooks.OnStep(step); err != nil {
				return domain.MatchResult{}, err
			}
		}
		// Reevaluate in-play, not only at halftime, so the coach can react
		// to a red card, an injury or a goal without waiting for the
		// interval. Only reached when the step above did not move the
		// match to halftime/finished/abandoned; applyCoachProposals itself
		// decides whether anything is actually due this tick.
		if e.Phase() == domain.PhaseFirstHalf || e.Phase() == domain.PhaseSecondHalf {
			if err := applyCoachProposals(); err != nil {
				return domain.MatchResult{}, err
			}
		}
	}
}
