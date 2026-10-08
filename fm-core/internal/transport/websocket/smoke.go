// Package websockettransport contains the deliberately small C1 transport
// probe. It is not the C2 match runner: it only proves that a Unity-compatible
// WebSocket can receive protobuf envelopes from Go.
package websockettransport

import (
	"fmt"
	"net/http"

	"github.com/gorilla/websocket"
	matchv1 "github.com/resoul/fm-core/gen/go/fm/match/v1"
	protobufadapter "github.com/resoul/fm-core/internal/adapters/protobuf"
	"github.com/resoul/fm-core/internal/match/config"
	"github.com/resoul/fm-core/internal/match/domain"
	"github.com/resoul/fm-core/internal/match/engine"
	"github.com/resoul/fm-core/internal/runner"
	"google.golang.org/protobuf/proto"
)

var upgrader = websocket.Upgrader{
	// The probe is local-only and has no auth surface. C2 must replace this
	// with an explicit origin/auth policy before exposing the API remotely.
	CheckOrigin: func(_ *http.Request) bool { return true },
}

// SmokeHandler upgrades one local connection and writes a snapshot followed by
// a result. Each WebSocket binary frame contains exactly one StreamEnvelope.
func SmokeHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()

		snapshot := &matchv1.MatchSnapshot{
			StreamSeq:       1,
			Tick:            42,
			Phase:           matchv1.MatchPhase_MATCH_PHASE_FIRST_HALF,
			LastEventSeq:    0,
			Discontinuity:   true,
			HomeScore:       0,
			AwayScore:       0,
			Period:          1,
			PeriodElapsedMs: 2100,
			Ball: &matchv1.BallState{
				Position: &matchv1.Vec3{X: 0, Y: 0.11, Z: 0},
				Velocity: &matchv1.Vec3{},
				Mode:     matchv1.BallMode_BALL_MODE_LOOSE,
			},
		}
		result := &matchv1.MatchResult{
			FinalPhase:    matchv1.MatchPhase_MATCH_PHASE_FINISHED,
			HomeScore:     0,
			AwayScore:     0,
			EngineVersion: "b7",
			StateHash:     "c1-smoke",
		}
		for _, payload := range []*matchv1.StreamEnvelope{
			{StreamSeq: 1, Payload: &matchv1.StreamEnvelope_Snapshot{Snapshot: snapshot}},
			{StreamSeq: 2, Payload: &matchv1.StreamEnvelope_Result{Result: result}},
		} {
			wire, marshalErr := proto.Marshal(payload)
			if marshalErr != nil {
				return
			}
			if writeErr := conn.WriteMessage(websocket.BinaryMessage, wire); writeErr != nil {
				return
			}
		}
	})
}

// MatchHandler runs one real match owned by this connection and streams its
// authoritative snapshots, followed by the terminal result. C2 commands and
// same-connection resync are handled at the runner's ownership boundary.
func MatchHandler(input domain.MatchInput, cfg config.Config, seed int64, speed string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()

		match, err := engine.New(input, cfg, seed)
		if err != nil {
			_ = writeError(conn, fmt.Errorf("engine initialization: %w", err))
			return
		}
		var streamSeq int64
		commands := make(chan domain.MatchCommand, 16)
		go readCommands(conn, commands)
		writeEnvelope := func(envelope *matchv1.StreamEnvelope) error {
			wire, marshalErr := proto.Marshal(envelope)
			if marshalErr != nil {
				return marshalErr
			}
			return conn.WriteMessage(websocket.BinaryMessage, wire)
		}
		result, runErr := runner.RunCommandsWithChannel(r.Context(), match, speed, commands, runner.Hooks{
			OnResync: func() error {
				streamSeq++
				snapshot := protobufadapter.SnapshotToProto(match.Snapshot())
				snapshot.StreamSeq = streamSeq
				snapshot.Discontinuity = true
				snapshot.Paused = match.IsPaused()
				return writeEnvelope(&matchv1.StreamEnvelope{
					StreamSeq: streamSeq,
					Payload:   &matchv1.StreamEnvelope_Snapshot{Snapshot: snapshot},
				})
			},
			OnCommand: func(cmd domain.MatchCommand, outcome domain.CommandOutcome) error {
				if len(cmd.ID) >= 5 && cmd.ID[:5] == "auto-" {
					return nil
				}
				streamSeq++
				if err := writeEnvelope(&matchv1.StreamEnvelope{
					StreamSeq: streamSeq,
					Payload: &matchv1.StreamEnvelope_Outcome{Outcome: &matchv1.CommandOutcome{
						CommandId:   outcome.CommandID,
						Accepted:    outcome.Accepted,
						AppliedTick: cmd.TargetTick,
						Reason:      outcome.Reason,
					}},
				}); err != nil {
					return err
				}
				if outcome.Accepted && (cmd.Type == domain.CommandPause || cmd.Type == domain.CommandResume) {
					streamSeq++
					snapshot := protobufadapter.SnapshotToProto(match.Snapshot())
					snapshot.StreamSeq = streamSeq
					snapshot.Paused = match.IsPaused()
					return writeEnvelope(&matchv1.StreamEnvelope{
						StreamSeq: streamSeq,
						Payload:   &matchv1.StreamEnvelope_Snapshot{Snapshot: snapshot},
					})
				}
				return nil
			},
			OnStep: func(step engine.StepOutput) error {
				streamSeq++
				snapshot := protobufadapter.SnapshotToProto(step.Snapshot)
				snapshot.StreamSeq = streamSeq
				snapshot.Discontinuity = len(step.Events) > 0
				return writeEnvelope(&matchv1.StreamEnvelope{
					StreamSeq: streamSeq,
					Payload:   &matchv1.StreamEnvelope_Snapshot{Snapshot: snapshot},
				})
			},
		})
		if runErr != nil {
			_ = writeError(conn, runErr)
			return
		}
		streamSeq++
		_ = writeEnvelope(&matchv1.StreamEnvelope{
			StreamSeq: streamSeq,
			Payload:   &matchv1.StreamEnvelope_Result{Result: protobufadapter.ResultToProto(result)},
		})
	})
}

func readCommands(conn *websocket.Conn, commands chan<- domain.MatchCommand) {
	defer close(commands)
	for {
		messageType, wire, err := conn.ReadMessage()
		if err != nil {
			return
		}
		if messageType != websocket.BinaryMessage {
			continue
		}
		var command matchv1.MatchCommand
		commandErr := proto.Unmarshal(wire, &command)
		if commandErr != nil {
			var request matchv1.ResyncRequest
			if err := proto.Unmarshal(wire, &request); err != nil ||
				(request.MatchId == "" && request.LastStreamSeq == 0 && request.LastEventSeq == 0) {
				continue
			}
			commands <- domain.MatchCommand{ID: "resync", TargetTick: -1, Type: domain.CommandType("resync")}
			continue
		}
		// ResyncRequest and MatchCommand are deliberately separate protobuf
		// messages on this local probe. A MatchCommand always has a oneof
		// payload; when it does not, inspect the same wire as ResyncRequest.
		if command.Payload == nil {
			var request matchv1.ResyncRequest
			if err := proto.Unmarshal(wire, &request); err == nil &&
				(request.MatchId != "" || request.LastStreamSeq != 0 || request.LastEventSeq != 0) {
				commands <- domain.MatchCommand{ID: "resync", TargetTick: -1, Type: domain.CommandType("resync")}
				continue
			}
		}
		mapped := domain.MatchCommand{ID: command.CommandId, TargetTick: -1}
		if command.ExpectedTick > 0 {
			mapped.TargetTick = command.ExpectedTick
		}
		switch command.Payload.(type) {
		case *matchv1.MatchCommand_Pause:
			mapped.Type = domain.CommandPause
		case *matchv1.MatchCommand_Resume:
			mapped.Type = domain.CommandResume
		default:
			mapped.Type = domain.CommandType("invalid")
		}
		commands <- mapped
	}
}

func writeError(conn *websocket.Conn, err error) error {
	return conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseInternalServerErr, err.Error()))
}
