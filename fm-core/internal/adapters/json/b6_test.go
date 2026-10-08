package json

import (
	"math"
	"testing"

	"github.com/resoul/fm-core/internal/match/domain"
)

func intp(v int) *int { return &v }

// baseV1Attributes returns a valid schema-v1 PlayerAttributesDTO (the 9
// shared core fields + shooting), leaving aerial/weak_foot/handling/reflexes
// for the caller to fill in as needed.
func baseV1Attributes() PlayerAttributesDTO {
	return PlayerAttributesDTO{
		Pace: intp(12), Acceleration: intp(12), Stamina: intp(14), Passing: intp(13),
		FirstTouch: intp(11), Dribbling: intp(10), Tackling: intp(9),
		Positioning: intp(14), Decisions: intp(13), Shooting: intp(15),
	}
}

// TestB6MigrationV1ToV2 checks every entry of the v1->v2 migration table
// (decision 26) against mapAttributes directly.
func TestB6MigrationV1ToV2(t *testing.T) {
	dto := baseV1Attributes()
	dto.Aerial = intp(8)
	dto.WeakFoot = intp(2)
	dto.Handling = intp(16)
	dto.Reflexes = intp(17)

	attr, err := mapAttributes("attrs", "p1", dto, "v1")
	if err != nil {
		t.Fatal(err)
	}
	want := domain.PlayerAttributes{
		Pace: 12, Acceleration: 12, Stamina: 14, Passing: 13,
		FirstTouch: 11, Dribbling: 10, Tackling: 9, Positioning: 14, Decisions: 13,
		Finishing: 15, LongShots: 15, FreeKickTaking: 15, PenaltyTaking: 15,
		Crossing: 13, Kicking: 13, Throwing: 13, Corners: 13,
		Heading: 8, JumpingReach: 8,
		Right: 20, Left: 1 + int(math.Round((2-1)*19.0/4.0)),
		Handling: 16, Reflexes: 17, OneOnOnes: 17, AerialReach: 16, CommandOfArea: 16,
	}
	if attr != want {
		t.Fatalf("migrated attributes =\n%+v\nwant\n%+v", attr, want)
	}
}

// TestB6MigrationV1DefaultsAerialWeakFoot checks that omitted aerial/
// weak_foot still fall back to the pre-B6 defaults (10, 3) before being
// migrated into Heading/JumpingReach/Left, same as today's v1 behavior.
func TestB6MigrationV1DefaultsAerialWeakFoot(t *testing.T) {
	attr, err := mapAttributes("attrs", "p1", baseV1Attributes(), "v1")
	if err != nil {
		t.Fatal(err)
	}
	if attr.Heading != 10 || attr.JumpingReach != 10 {
		t.Fatalf("aerial default not migrated: heading=%d jumping_reach=%d", attr.Heading, attr.JumpingReach)
	}
	wantLeft := 1 + int(math.Round((3-1)*19.0/4.0))
	if attr.Left != wantLeft || attr.Right != 20 {
		t.Fatalf("weak_foot default not migrated: left=%d (want %d) right=%d", attr.Left, wantLeft, attr.Right)
	}
}

// TestB6V2NativeMapping checks that schema v2 attributes map directly with
// no migration/derivation involved.
func TestB6V2NativeMapping(t *testing.T) {
	dto := PlayerAttributesDTO{
		Pace: intp(12), Acceleration: intp(12), Stamina: intp(14), Passing: intp(13),
		FirstTouch: intp(11), Dribbling: intp(10), Tackling: intp(9),
		Positioning: intp(14), Decisions: intp(13),
		Finishing: intp(16), LongShots: intp(9), Crossing: intp(11),
		Heading: intp(7), JumpingReach: intp(6), Left: intp(4), Right: intp(19),
		Corners: intp(5), FreeKickTaking: intp(6), PenaltyTaking: intp(17),
		Handling: intp(15), Reflexes: intp(16), OneOnOnes: intp(14),
		AerialReach: intp(13), CommandOfArea: intp(12), Kicking: intp(11), Throwing: intp(10),
	}
	attr, err := mapAttributes("attrs", "p1", dto, "v2")
	if err != nil {
		t.Fatal(err)
	}
	want := domain.PlayerAttributes{
		Pace: 12, Acceleration: 12, Stamina: 14, Passing: 13,
		FirstTouch: 11, Dribbling: 10, Tackling: 9, Positioning: 14, Decisions: 13,
		Finishing: 16, LongShots: 9, Crossing: 11, Heading: 7, JumpingReach: 6,
		Left: 4, Right: 19, Corners: 5, FreeKickTaking: 6, PenaltyTaking: 17,
		Handling: 15, Reflexes: 16, OneOnOnes: 14, AerialReach: 13, CommandOfArea: 12,
		Kicking: 11, Throwing: 10,
	}
	if attr != want {
		t.Fatalf("v2 attributes =\n%+v\nwant\n%+v", attr, want)
	}
}

// TestB6V1RejectsV2OnlyFields checks that a v1 payload setting a v2-only
// field (finishing) is rejected rather than silently accepted/ignored.
func TestB6V1RejectsV2OnlyFields(t *testing.T) {
	dto := baseV1Attributes()
	dto.Finishing = intp(15)
	if _, err := mapAttributes("attrs", "p1", dto, "v1"); err == nil {
		t.Fatal("expected error for v2-only field under schema v1")
	}
}

// TestB6V2RejectsV1OnlyFields checks that a v2 payload setting a v1-only
// aggregate field (shooting/aerial/weak_foot) is rejected.
func TestB6V2RejectsV1OnlyFields(t *testing.T) {
	for _, mutate := range []func(*PlayerAttributesDTO){
		func(d *PlayerAttributesDTO) { d.Shooting = intp(10) },
		func(d *PlayerAttributesDTO) { d.Aerial = intp(10) },
		func(d *PlayerAttributesDTO) { d.WeakFoot = intp(3) },
	} {
		dto := PlayerAttributesDTO{
			Pace: intp(12), Acceleration: intp(12), Stamina: intp(14), Passing: intp(13),
			FirstTouch: intp(11), Dribbling: intp(10), Tackling: intp(9),
			Positioning: intp(14), Decisions: intp(13),
			Finishing: intp(16), LongShots: intp(9), Crossing: intp(11),
			Heading: intp(7), JumpingReach: intp(6), Left: intp(4), Right: intp(19),
			Corners: intp(5), FreeKickTaking: intp(6), PenaltyTaking: intp(17),
		}
		mutate(&dto)
		if _, err := mapAttributes("attrs", "p1", dto, "v2"); err == nil {
			t.Fatal("expected error for v1-only field under schema v2")
		}
	}
}

// TestB6V2MissingRequiredField checks that each of the 10 new v2-required
// outfield fields is actually enforced.
func TestB6V2MissingRequiredField(t *testing.T) {
	base := func() PlayerAttributesDTO {
		return PlayerAttributesDTO{
			Pace: intp(12), Acceleration: intp(12), Stamina: intp(14), Passing: intp(13),
			FirstTouch: intp(11), Dribbling: intp(10), Tackling: intp(9),
			Positioning: intp(14), Decisions: intp(13),
			Finishing: intp(16), LongShots: intp(9), Crossing: intp(11),
			Heading: intp(7), JumpingReach: intp(6), Left: intp(4), Right: intp(19),
			Corners: intp(5), FreeKickTaking: intp(6), PenaltyTaking: intp(17),
		}
	}
	for _, clear := range []func(*PlayerAttributesDTO){
		func(d *PlayerAttributesDTO) { d.Finishing = nil },
		func(d *PlayerAttributesDTO) { d.LongShots = nil },
		func(d *PlayerAttributesDTO) { d.Crossing = nil },
		func(d *PlayerAttributesDTO) { d.Heading = nil },
		func(d *PlayerAttributesDTO) { d.JumpingReach = nil },
		func(d *PlayerAttributesDTO) { d.Left = nil },
		func(d *PlayerAttributesDTO) { d.Right = nil },
		func(d *PlayerAttributesDTO) { d.Corners = nil },
		func(d *PlayerAttributesDTO) { d.FreeKickTaking = nil },
		func(d *PlayerAttributesDTO) { d.PenaltyTaking = nil },
	} {
		dto := base()
		clear(&dto)
		if _, err := mapAttributes("attrs", "p1", dto, "v2"); err == nil {
			t.Fatal("expected error for missing required v2 field")
		}
	}
}
