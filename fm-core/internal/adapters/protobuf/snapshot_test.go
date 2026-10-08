package protobuf

import (
	"encoding/hex"
	"testing"

	"google.golang.org/protobuf/proto"

	matchv1 "github.com/resoul/fm-core/gen/go/fm/match/v1"
	"github.com/resoul/fm-core/internal/match/domain"
)

func TestSnapshotWireGoldenAndRoundTrip(t *testing.T) {
	original := domain.MatchSnapshot{
		Tick:            123,
		Phase:           domain.PhaseSecondHalf,
		Period:          2,
		PeriodElapsedMs: 4560,
		AddedTimeMs:     30000,
		Score:           domain.Score{Home: 1, Away: 0},
		Players: []domain.PlayerState{{
			ID:       "home-9",
			TeamID:   "home",
			Position: domain.Vec3{X: 3.5, Z: -12},
			Velocity: domain.Vec3{X: 1.25, Z: 0.5},
			Facing:   1.5707963267948966,
			Active:   true,
		}},
		Ball: domain.BallState{
			Position:  domain.Vec3{X: 3.5, Y: 0.42, Z: -12},
			Velocity:  domain.Vec3{X: 0, Y: 2.5, Z: 1},
			CarrierID: "home-9",
			Status:    "carried",
		},
		LastEventSeq: 77,
	}

	wire, err := proto.Marshal(SnapshotToProto(original))
	if err != nil {
		t.Fatal(err)
	}
	const wantWire = "107b1804284d38014a410a06686f6d652d391212090000000000000c401100000000000028c01a1209000000000000f43f11000000000000e03f21182d4454fb21f93f3204686f6d653801523b0a1b090000000000000c4011e17a14ae47e1da3f1900000000000028c0121211000000000000044019000000000000f03f18022206686f6d652d39580260d02368b0ea01"
	if got := hex.EncodeToString(wire); got != wantWire {
		t.Fatalf("wire golden mismatch: got %s want %s", got, wantWire)
	}

	var decoded matchv1.MatchSnapshot
	if err := proto.Unmarshal(wire, &decoded); err != nil {
		t.Fatal(err)
	}
	got, err := SnapshotFromProto(&decoded)
	if err != nil {
		t.Fatal(err)
	}
	if got.Tick != original.Tick || got.Phase != original.Phase || got.Period != original.Period ||
		got.PeriodElapsedMs != original.PeriodElapsedMs || got.AddedTimeMs != original.AddedTimeMs ||
		got.Score != original.Score || got.LastEventSeq != original.LastEventSeq {
		t.Fatalf("scalar round-trip mismatch: got %#v", got)
	}
	if len(got.Players) != 1 || got.Players[0].ID != "home-9" || got.Players[0].TeamID != "home" ||
		got.Players[0].Position != original.Players[0].Position || got.Players[0].Velocity.X != 1.25 {
		t.Fatalf("player round-trip mismatch: got %#v", got.Players)
	}
	if got.Ball.Position != original.Ball.Position || got.Ball.CarrierID != original.Ball.CarrierID || got.Ball.Status != original.Ball.Status {
		t.Fatalf("ball round-trip mismatch: got %#v", got.Ball)
	}
}

func TestSnapshotFromProtoRejectsIncompletePayload(t *testing.T) {
	_, err := SnapshotFromProto(&matchv1.MatchSnapshot{Phase: matchv1.MatchPhase_MATCH_PHASE_FIRST_HALF})
	if err == nil {
		t.Fatal("expected missing ball error")
	}
}
