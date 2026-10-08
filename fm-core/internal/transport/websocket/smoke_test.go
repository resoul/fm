package websockettransport

import (
	"net"
	"net/http"
	"testing"

	"github.com/gorilla/websocket"
	matchv1 "github.com/resoul/fm-core/gen/go/fm/match/v1"
	jsonadapter "github.com/resoul/fm-core/internal/adapters/json"
	matchconfig "github.com/resoul/fm-core/internal/match/config"
	"google.golang.org/protobuf/proto"
)

func TestSmokeHandlerSendsSnapshotAndResult(t *testing.T) {
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	server := &http.Server{Handler: SmokeHandler()}
	go func() { _ = server.Serve(listener) }()
	defer server.Close()

	url := "ws://" + listener.Addr().String()
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	messageType, first, err := conn.ReadMessage()
	if err != nil {
		t.Fatal(err)
	}
	if messageType != websocket.BinaryMessage {
		t.Fatalf("first frame type = %d, want binary", messageType)
	}
	var firstEnvelope matchv1.StreamEnvelope
	if err := proto.Unmarshal(first, &firstEnvelope); err != nil {
		t.Fatal(err)
	}
	if firstEnvelope.GetSnapshot().GetTick() != 42 || firstEnvelope.GetStreamSeq() != 1 {
		t.Fatalf("unexpected snapshot envelope: %s", firstEnvelope.String())
	}

	_, second, err := conn.ReadMessage()
	if err != nil {
		t.Fatal(err)
	}
	var secondEnvelope matchv1.StreamEnvelope
	if err := proto.Unmarshal(second, &secondEnvelope); err != nil {
		t.Fatal(err)
	}
	if secondEnvelope.GetResult().GetFinalPhase() != matchv1.MatchPhase_MATCH_PHASE_FINISHED || secondEnvelope.GetStreamSeq() != 2 {
		t.Fatalf("unexpected result envelope: %s", secondEnvelope.String())
	}
}

func TestMatchHandlerStreamsRealMatch(t *testing.T) {
	input, err := jsonadapter.LoadMatchInputFromFile("../../../fixtures/match/equal.json")
	if err != nil {
		t.Fatal(err)
	}
	cfg, err := jsonadapter.LoadResolvedConfigFromFile("../../../configs/short_test.json", matchconfig.DefaultConfig())
	if err != nil {
		t.Fatal(err)
	}
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	server := &http.Server{Handler: MatchHandler(input, cfg, 4, "fast")}
	go func() { _ = server.Serve(listener) }()
	defer server.Close()

	conn, _, err := websocket.DefaultDialer.Dial("ws://"+listener.Addr().String(), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	frames := 0
	for {
		_, wire, readErr := conn.ReadMessage()
		if readErr != nil {
			t.Fatal(readErr)
		}
		var envelope matchv1.StreamEnvelope
		if err := proto.Unmarshal(wire, &envelope); err != nil {
			t.Fatal(err)
		}
		frames++
		if result := envelope.GetResult(); result != nil {
			if result.FinalPhase != matchv1.MatchPhase_MATCH_PHASE_FINISHED {
				t.Fatalf("real match result phase = %s", result.FinalPhase)
			}
			break
		}
	}
	if frames < 2 {
		t.Fatalf("real match sent %d frames, want snapshots plus result", frames)
	}
}

func TestMatchHandlerPauseResumeOutcome(t *testing.T) {
	input, err := jsonadapter.LoadMatchInputFromFile("../../../fixtures/match/equal.json")
	if err != nil {
		t.Fatal(err)
	}
	cfg, err := jsonadapter.LoadResolvedConfigFromFile("../../../configs/short_test.json", matchconfig.DefaultConfig())
	if err != nil {
		t.Fatal(err)
	}
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	server := &http.Server{Handler: MatchHandler(input, cfg, 4, "realtime")}
	go func() { _ = server.Serve(listener) }()
	defer server.Close()

	conn, _, err := websocket.DefaultDialer.Dial("ws://"+listener.Addr().String(), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	// Wait for the first authoritative snapshot before pausing.
	if _, _, err := conn.ReadMessage(); err != nil {
		t.Fatal(err)
	}
	pause := &matchv1.MatchCommand{CommandId: "pause-1", Payload: &matchv1.MatchCommand_Pause{Pause: &matchv1.PauseCommand{}}}
	if err := conn.WriteMessage(websocket.BinaryMessage, mustMarshal(pause)); err != nil {
		t.Fatal(err)
	}

	gotOutcome, gotPausedSnapshot := false, false
	for !(gotOutcome && gotPausedSnapshot) {
		_, wire, err := conn.ReadMessage()
		if err != nil {
			t.Fatal(err)
		}
		var envelope matchv1.StreamEnvelope
		if err := proto.Unmarshal(wire, &envelope); err != nil {
			t.Fatal(err)
		}
		if outcome := envelope.GetOutcome(); outcome != nil && outcome.CommandId == "pause-1" {
			gotOutcome = outcome.Accepted
		}
		if snapshot := envelope.GetSnapshot(); snapshot != nil && snapshot.Paused {
			gotPausedSnapshot = true
		}
	}

	resume := &matchv1.MatchCommand{CommandId: "resume-1", Payload: &matchv1.MatchCommand_Resume{Resume: &matchv1.ResumeCommand{}}}
	if err := conn.WriteMessage(websocket.BinaryMessage, mustMarshal(resume)); err != nil {
		t.Fatal(err)
	}
	for {
		_, wire, err := conn.ReadMessage()
		if err != nil {
			t.Fatal(err)
		}
		var envelope matchv1.StreamEnvelope
		if err := proto.Unmarshal(wire, &envelope); err != nil {
			t.Fatal(err)
		}
		if outcome := envelope.GetOutcome(); outcome != nil && outcome.CommandId == "resume-1" {
			if !outcome.Accepted {
				t.Fatalf("resume rejected: %s", outcome.Reason)
			}
			return
		}
	}
}

func TestMatchHandlerResyncReturnsDiscontinuitySnapshot(t *testing.T) {
	input, err := jsonadapter.LoadMatchInputFromFile("../../../fixtures/match/equal.json")
	if err != nil {
		t.Fatal(err)
	}
	cfg, err := jsonadapter.LoadResolvedConfigFromFile("../../../configs/short_test.json", matchconfig.DefaultConfig())
	if err != nil {
		t.Fatal(err)
	}
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	server := &http.Server{Handler: MatchHandler(input, cfg, 4, "realtime")}
	go func() { _ = server.Serve(listener) }()
	defer server.Close()

	conn, _, err := websocket.DefaultDialer.Dial("ws://"+listener.Addr().String(), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	_, firstWire, err := conn.ReadMessage()
	if err != nil {
		t.Fatal(err)
	}
	var first matchv1.StreamEnvelope
	if err := proto.Unmarshal(firstWire, &first); err != nil {
		t.Fatal(err)
	}
	request := &matchv1.ResyncRequest{LastStreamSeq: first.StreamSeq}
	if err := conn.WriteMessage(websocket.BinaryMessage, mustMarshal(request)); err != nil {
		t.Fatal(err)
	}
	for {
		_, wire, err := conn.ReadMessage()
		if err != nil {
			t.Fatal(err)
		}
		var envelope matchv1.StreamEnvelope
		if err := proto.Unmarshal(wire, &envelope); err != nil {
			t.Fatal(err)
		}
		if snapshot := envelope.GetSnapshot(); snapshot != nil && snapshot.Discontinuity {
			if snapshot.StreamSeq <= first.StreamSeq || envelope.StreamSeq != snapshot.StreamSeq {
				t.Fatalf("resync sequence did not advance: first=%d envelope=%d snapshot=%d", first.StreamSeq, envelope.StreamSeq, snapshot.StreamSeq)
			}
			return
		}
	}
}

func mustMarshal(message proto.Message) []byte {
	wire, err := proto.Marshal(message)
	if err != nil {
		panic(err)
	}
	return wire
}
