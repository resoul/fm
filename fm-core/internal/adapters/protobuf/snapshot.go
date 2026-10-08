// Package protobuf contains the explicit boundary mapping between the match
// domain and the Go types generated from api/proto. Generated types must not
// be imported by the simulation packages.
package protobuf

import (
	"fmt"
	matchv1 "github.com/resoul/fm-core/gen/go/fm/match/v1"
	"github.com/resoul/fm-core/internal/match/domain"
)

// SnapshotToProto maps an authoritative domain snapshot to the wire contract.
// It allocates all nested messages, so callers may safely mutate the result.
func SnapshotToProto(snapshot domain.MatchSnapshot) *matchv1.MatchSnapshot {
	players := make([]*matchv1.PlayerState, 0, len(snapshot.Players))
	for _, player := range snapshot.Players {
		players = append(players, &matchv1.PlayerState{
			PlayerId:  player.ID,
			TeamId:    player.TeamID,
			Position:  vec2(player.Position),
			Velocity:  vec2(player.Velocity),
			FacingRad: player.Facing,
			Active:    player.Active,
			Action:    "",
		})
	}

	ball := &matchv1.BallState{
		Position:  vec3(snapshot.Ball.Position),
		Velocity:  vec3(snapshot.Ball.Velocity),
		Mode:      ballMode(snapshot.Ball.Status),
		CarrierId: optionalString(snapshot.Ball.CarrierID),
	}
	return &matchv1.MatchSnapshot{
		Tick:            snapshot.Tick,
		Phase:           phase(snapshot.Phase),
		Paused:          false,
		LastEventSeq:    snapshot.LastEventSeq,
		Discontinuity:   false,
		HomeScore:       int32(snapshot.Score.Home),
		AwayScore:       int32(snapshot.Score.Away),
		Players:         players,
		Ball:            ball,
		Period:          int32(snapshot.Period),
		PeriodElapsedMs: int64(snapshot.PeriodElapsedMs),
		AddedTimeMs:     int64(snapshot.AddedTimeMs),
	}
}

// ResultToProto maps the terminal domain result to the transport result.
// Detailed stats remain a follow-up mapping because their wire schema is not
// defined yet; omitting them is explicit rather than encoding JSON in bytes.
func ResultToProto(result domain.MatchResult) *matchv1.MatchResult {
	phase := matchv1.MatchPhase_MATCH_PHASE_FINISHED
	if result.Status == "abandoned" {
		phase = matchv1.MatchPhase_MATCH_PHASE_ABANDONED
	}
	return &matchv1.MatchResult{
		FinalPhase:    phase,
		HomeScore:     int32(result.Score.Home),
		AwayScore:     int32(result.Score.Away),
		EngineVersion: "b7",
	}
}

// SnapshotFromProto maps a wire snapshot into an independent domain value.
// Fields not present in the C1 snapshot contract (for example radius and
// fatigue) intentionally remain at their domain zero value.
func SnapshotFromProto(snapshot *matchv1.MatchSnapshot) (domain.MatchSnapshot, error) {
	if snapshot == nil {
		return domain.MatchSnapshot{}, fmt.Errorf("protobuf: nil match snapshot")
	}
	phaseValue, err := domainPhase(snapshot.Phase)
	if err != nil {
		return domain.MatchSnapshot{}, err
	}
	if snapshot.Ball == nil {
		return domain.MatchSnapshot{}, fmt.Errorf("protobuf: snapshot ball is required")
	}
	players := make([]domain.PlayerState, 0, len(snapshot.Players))
	for i, player := range snapshot.Players {
		if player == nil || player.Position == nil || player.Velocity == nil {
			return domain.MatchSnapshot{}, fmt.Errorf("protobuf: player %d has incomplete vectors", i)
		}
		players = append(players, domain.PlayerState{
			ID:       player.PlayerId,
			TeamID:   player.TeamId,
			Position: domain.Vec3{X: player.Position.X, Y: 0, Z: player.Position.Z},
			Velocity: domain.Vec3{X: player.Velocity.X, Y: 0, Z: player.Velocity.Z},
			Facing:   player.FacingRad,
			Active:   player.Active,
		})
	}
	if snapshot.Ball.Position == nil || snapshot.Ball.Velocity == nil {
		return domain.MatchSnapshot{}, fmt.Errorf("protobuf: ball has incomplete vectors")
	}
	return domain.MatchSnapshot{
		Tick:            snapshot.Tick,
		Phase:           phaseValue,
		Period:          int(snapshot.Period),
		PeriodElapsedMs: int(snapshot.PeriodElapsedMs),
		AddedTimeMs:     int(snapshot.AddedTimeMs),
		Score:           domain.Score{Home: int(snapshot.HomeScore), Away: int(snapshot.AwayScore)},
		Players:         players,
		Ball: domain.BallState{
			Position:  domain.Vec3{X: snapshot.Ball.Position.X, Y: snapshot.Ball.Position.Y, Z: snapshot.Ball.Position.Z},
			Velocity:  domain.Vec3{X: snapshot.Ball.Velocity.X, Y: snapshot.Ball.Velocity.Y, Z: snapshot.Ball.Velocity.Z},
			CarrierID: snapshot.Ball.GetCarrierId(),
			Status:    ballStatus(snapshot.Ball.Mode),
		},
		LastEventSeq: snapshot.LastEventSeq,
	}, nil
}

func vec2(value domain.Vec3) *matchv1.Vec2 { return &matchv1.Vec2{X: value.X, Z: value.Z} }
func vec3(value domain.Vec3) *matchv1.Vec3 { return &matchv1.Vec3{X: value.X, Y: value.Y, Z: value.Z} }

func optionalString(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func phase(value domain.MatchPhase) matchv1.MatchPhase {
	switch value {
	case domain.PhaseFirstHalf:
		return matchv1.MatchPhase_MATCH_PHASE_FIRST_HALF
	case domain.PhaseHalfTime:
		return matchv1.MatchPhase_MATCH_PHASE_HALFTIME
	case domain.PhaseSecondHalf:
		return matchv1.MatchPhase_MATCH_PHASE_SECOND_HALF
	case domain.PhaseFinished:
		return matchv1.MatchPhase_MATCH_PHASE_FINISHED
	case domain.PhaseAbandoned:
		return matchv1.MatchPhase_MATCH_PHASE_ABANDONED
	default:
		return matchv1.MatchPhase_MATCH_PHASE_PRE_KICKOFF
	}
}

func domainPhase(value matchv1.MatchPhase) (domain.MatchPhase, error) {
	switch value {
	case matchv1.MatchPhase_MATCH_PHASE_PRE_KICKOFF:
		return domain.PhaseNotStarted, nil
	case matchv1.MatchPhase_MATCH_PHASE_FIRST_HALF:
		return domain.PhaseFirstHalf, nil
	case matchv1.MatchPhase_MATCH_PHASE_HALFTIME:
		return domain.PhaseHalfTime, nil
	case matchv1.MatchPhase_MATCH_PHASE_SECOND_HALF:
		return domain.PhaseSecondHalf, nil
	case matchv1.MatchPhase_MATCH_PHASE_FINISHED:
		return domain.PhaseFinished, nil
	case matchv1.MatchPhase_MATCH_PHASE_ABANDONED:
		return domain.PhaseAbandoned, nil
	default:
		return "", fmt.Errorf("protobuf: unsupported match phase %s", value.String())
	}
}

func ballMode(value string) matchv1.BallMode {
	switch value {
	case "carried":
		return matchv1.BallMode_BALL_MODE_CARRIED
	case "in_flight":
		return matchv1.BallMode_BALL_MODE_IN_FLIGHT
	default:
		return matchv1.BallMode_BALL_MODE_LOOSE
	}
}

func ballStatus(value matchv1.BallMode) string {
	switch value {
	case matchv1.BallMode_BALL_MODE_CARRIED:
		return "carried"
	case matchv1.BallMode_BALL_MODE_IN_FLIGHT:
		return "in_flight"
	case matchv1.BallMode_BALL_MODE_LOOSE:
		return "loose"
	default:
		return ""
	}
}
