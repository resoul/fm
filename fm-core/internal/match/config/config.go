package config

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
)

// PitchConfig defines physical boundaries, goals, and ball dimensions in meters and kilograms.
type PitchConfig struct {
	WidthM      float64 `json:"width"`       // Pitch width in meters (default 68.0)
	LengthM     float64 `json:"length"`      // Pitch length in meters (default 105.0)
	GoalWidthM  float64 `json:"goal_width"`  // Goal width in meters (default 7.32)
	GoalDepthM  float64 `json:"goal_depth"`  // Goal depth in meters (default 2.0)
	GoalHeightM float64 `json:"goal_height"` // Goal height in meters (default 2.44)
	BallRadiusM float64 `json:"ball_radius"` // Ball radius in meters (default 0.11)
	BallMassKg  float64 `json:"ball_mass"`   // Ball mass in kilograms (default 0.43)
}

// TimingConfig defines time step, half durations, and runaway guard in milliseconds.
type TimingConfig struct {
	StepMs                int    `json:"step_ms"`                   // Simulation tick duration in ms (default 50)
	HalfDurationMs        int    `json:"half_duration_ms"`          // Duration of one regular half in ms (default 2,700,000 = 45m)
	AddedTimeMode         string `json:"added_time_mode"`           // "none", "fixed_per_half" or "tracked_delays"
	FixedAddedTimeHalf1Ms int    `json:"fixed_added_time_half1_ms"` // Added time in ms for first half (default 0)
	FixedAddedTimeHalf2Ms int    `json:"fixed_added_time_half2_ms"` // Added time in ms for second half (default 0)
	MaxTicksGuard         int    `json:"max_ticks_guard"`           // Emergency tick limit to abort runaway match (default 120,000)
}

// RulesConfig defines rule flags and limits for profile A.
type RulesConfig struct {
	SubstitutionsLimit  int  `json:"substitutions_limit"`  // Max substitutions per team (default 5)
	SubstitutionWindows int  `json:"substitution_windows"` // Max in-play substitution windows per team (default 3)
	OffsideEnabled      bool `json:"offside_enabled"`      // Offside rule enabled (default false in Profile A)
	FoulsEnabled        bool `json:"fouls_enabled"`        // Fouls enabled (default false in Profile A)
	CardsEnabled        bool `json:"cards_enabled"`        // Cards enabled (default false in Profile A)
	InjuriesEnabled     bool `json:"injuries_enabled"`     // Injuries enabled (default false in Profile A)
}

// PhysicsConfig defines physical conversion limits from attributes to SI units.
type PhysicsConfig struct {
	PlayerMinSpeedMps  float64 `json:"player_min_speed_mps"`  // Sprint speed at pace=1 in m/s (default 5.0)
	PlayerMaxSpeedMps  float64 `json:"player_max_speed_mps"`  // Sprint speed at pace=20 in m/s (default 10.0)
	PlayerMinAccelMps2 float64 `json:"player_min_accel_mps2"` // Acceleration at accel=1 in m/s^2 (default 2.0)
	PlayerMaxAccelMps2 float64 `json:"player_max_accel_mps2"` // Acceleration at accel=20 in m/s^2 (default 6.0)
	BallMaxSpeedMps    float64 `json:"ball_max_speed_mps"`    // Maximum kicked ball speed in m/s (default 35.0)
}

// Config represents a complete, immutable resolved configuration for a match simulation.
type Config struct {
	SchemaVersion string        `json:"schema_version"`
	ProfileName   string        `json:"profile_name"`
	Pitch         PitchConfig   `json:"pitch"`
	Timing        TimingConfig  `json:"timing"`
	Rules         RulesConfig   `json:"rules"`
	Physics       PhysicsConfig `json:"physics"`
}

// Overrides structs with pointers to distinguish omitted keys (nil) from explicit zero values.

type PitchOverrides struct {
	WidthM      *float64 `json:"width,omitempty"`
	LengthM     *float64 `json:"length,omitempty"`
	GoalWidthM  *float64 `json:"goal_width,omitempty"`
	GoalDepthM  *float64 `json:"goal_depth,omitempty"`
	GoalHeightM *float64 `json:"goal_height,omitempty"`
	BallRadiusM *float64 `json:"ball_radius,omitempty"`
	BallMassKg  *float64 `json:"ball_mass,omitempty"`
}

type TimingOverrides struct {
	StepMs                *int    `json:"step_ms,omitempty"`
	HalfDurationMs        *int    `json:"half_duration_ms,omitempty"`
	AddedTimeMode         *string `json:"added_time_mode,omitempty"`
	FixedAddedTimeHalf1Ms *int    `json:"fixed_added_time_half1_ms,omitempty"`
	FixedAddedTimeHalf2Ms *int    `json:"fixed_added_time_half2_ms,omitempty"`
	MaxTicksGuard         *int    `json:"max_ticks_guard,omitempty"`
}

type RulesOverrides struct {
	SubstitutionsLimit  *int  `json:"substitutions_limit,omitempty"`
	SubstitutionWindows *int  `json:"substitution_windows,omitempty"`
	OffsideEnabled      *bool `json:"offside_enabled,omitempty"`
	FoulsEnabled        *bool `json:"fouls_enabled,omitempty"`
	CardsEnabled        *bool `json:"cards_enabled,omitempty"`
	InjuriesEnabled     *bool `json:"injuries_enabled,omitempty"`
}

type PhysicsOverrides struct {
	PlayerMinSpeedMps  *float64 `json:"player_min_speed_mps,omitempty"`
	PlayerMaxSpeedMps  *float64 `json:"player_max_speed_mps,omitempty"`
	PlayerMinAccelMps2 *float64 `json:"player_min_accel_mps2,omitempty"`
	PlayerMaxAccelMps2 *float64 `json:"player_max_accel_mps2,omitempty"`
	BallMaxSpeedMps    *float64 `json:"ball_max_speed_mps,omitempty"`
}

// ConfigOverrides holds optional overrides loaded from a JSON configuration file.
type ConfigOverrides struct {
	SchemaVersion *string           `json:"schema_version,omitempty"`
	ProfileName   *string           `json:"profile_name,omitempty"`
	Pitch         *PitchOverrides   `json:"pitch,omitempty"`
	Timing        *TimingOverrides  `json:"timing,omitempty"`
	Rules         *RulesOverrides   `json:"rules,omitempty"`
	Physics       *PhysicsOverrides `json:"physics,omitempty"`
}

// DefaultConfig returns the standard Profile A configuration.
func DefaultConfig() Config {
	return Config{
		SchemaVersion: "v1",
		ProfileName:   "profile_a",
		Pitch: PitchConfig{
			WidthM:      68.0,
			LengthM:     105.0,
			GoalWidthM:  7.32,
			GoalDepthM:  2.0,
			GoalHeightM: 2.44,
			BallRadiusM: 0.11,
			BallMassKg:  0.43,
		},
		Timing: TimingConfig{
			StepMs:                50,
			HalfDurationMs:        2700000, // 45 minutes
			AddedTimeMode:         "none",
			FixedAddedTimeHalf1Ms: 0,
			FixedAddedTimeHalf2Ms: 0,
			MaxTicksGuard:         120000, // 100 minutes at 50ms
		},
		Rules: RulesConfig{
			SubstitutionsLimit:  5,
			SubstitutionWindows: 3,
			OffsideEnabled:      false,
			FoulsEnabled:        false,
			CardsEnabled:        false,
			InjuriesEnabled:     false,
		},
		Physics: PhysicsConfig{
			PlayerMinSpeedMps:  5.0,
			PlayerMaxSpeedMps:  10.0,
			PlayerMinAccelMps2: 2.0,
			PlayerMaxAccelMps2: 6.0,
			BallMaxSpeedMps:    35.0,
		},
	}
}

// ShortTestConfig returns a test profile with short half duration (60 seconds) for fast tests.
func ShortTestConfig() Config {
	cfg := DefaultConfig()
	cfg.ProfileName = "short_test"
	cfg.Timing.HalfDurationMs = 60000 // 1 minute
	cfg.Timing.MaxTicksGuard = 5000   // Guard limit
	return cfg
}

func isFinite(f float64) bool {
	return !math.IsNaN(f) && !math.IsInf(f, 0)
}

// Merge combines defaults with user overrides and validates the result.
func Merge(defaults Config, overrides ConfigOverrides) (Config, error) {
	res := defaults

	if overrides.SchemaVersion != nil {
		res.SchemaVersion = *overrides.SchemaVersion
	}
	if overrides.ProfileName != nil {
		res.ProfileName = *overrides.ProfileName
	}

	if p := overrides.Pitch; p != nil {
		if p.WidthM != nil {
			res.Pitch.WidthM = *p.WidthM
		}
		if p.LengthM != nil {
			res.Pitch.LengthM = *p.LengthM
		}
		if p.GoalWidthM != nil {
			res.Pitch.GoalWidthM = *p.GoalWidthM
		}
		if p.GoalDepthM != nil {
			res.Pitch.GoalDepthM = *p.GoalDepthM
		}
		if p.GoalHeightM != nil {
			res.Pitch.GoalHeightM = *p.GoalHeightM
		}
		if p.BallRadiusM != nil {
			res.Pitch.BallRadiusM = *p.BallRadiusM
		}
		if p.BallMassKg != nil {
			res.Pitch.BallMassKg = *p.BallMassKg
		}
	}

	if t := overrides.Timing; t != nil {
		if t.StepMs != nil {
			res.Timing.StepMs = *t.StepMs
		}
		if t.HalfDurationMs != nil {
			res.Timing.HalfDurationMs = *t.HalfDurationMs
		}
		if t.AddedTimeMode != nil {
			res.Timing.AddedTimeMode = *t.AddedTimeMode
		}
		if t.FixedAddedTimeHalf1Ms != nil {
			res.Timing.FixedAddedTimeHalf1Ms = *t.FixedAddedTimeHalf1Ms
		}
		if t.FixedAddedTimeHalf2Ms != nil {
			res.Timing.FixedAddedTimeHalf2Ms = *t.FixedAddedTimeHalf2Ms
		}
		if t.MaxTicksGuard != nil {
			res.Timing.MaxTicksGuard = *t.MaxTicksGuard
		}
	}

	if r := overrides.Rules; r != nil {
		if r.SubstitutionsLimit != nil {
			res.Rules.SubstitutionsLimit = *r.SubstitutionsLimit
		}
		if r.SubstitutionWindows != nil {
			res.Rules.SubstitutionWindows = *r.SubstitutionWindows
		}
		if r.OffsideEnabled != nil {
			res.Rules.OffsideEnabled = *r.OffsideEnabled
		}
		if r.FoulsEnabled != nil {
			res.Rules.FoulsEnabled = *r.FoulsEnabled
		}
		if r.CardsEnabled != nil {
			res.Rules.CardsEnabled = *r.CardsEnabled
		}
		if r.InjuriesEnabled != nil {
			res.Rules.InjuriesEnabled = *r.InjuriesEnabled
		}
	}

	if ph := overrides.Physics; ph != nil {
		if ph.PlayerMinSpeedMps != nil {
			res.Physics.PlayerMinSpeedMps = *ph.PlayerMinSpeedMps
		}
		if ph.PlayerMaxSpeedMps != nil {
			res.Physics.PlayerMaxSpeedMps = *ph.PlayerMaxSpeedMps
		}
		if ph.PlayerMinAccelMps2 != nil {
			res.Physics.PlayerMinAccelMps2 = *ph.PlayerMinAccelMps2
		}
		if ph.PlayerMaxAccelMps2 != nil {
			res.Physics.PlayerMaxAccelMps2 = *ph.PlayerMaxAccelMps2
		}
		if ph.BallMaxSpeedMps != nil {
			res.Physics.BallMaxSpeedMps = *ph.BallMaxSpeedMps
		}
	}

	if err := Validate(res); err != nil {
		return Config{}, err
	}
	return res, nil
}

// Validate checks all values of ResolvedConfig against domain safety bounds.
func Validate(cfg Config) error {
	if cfg.SchemaVersion != "v1" {
		return fmt.Errorf("config: unsupported schema_version %q; expected %q", cfg.SchemaVersion, "v1")
	}
	if cfg.ProfileName == "" {
		return fmt.Errorf("config: profile_name cannot be empty")
	}

	// Pitch
	if !isFinite(cfg.Pitch.WidthM) || cfg.Pitch.WidthM < 45.0 || cfg.Pitch.WidthM > 90.0 {
		return fmt.Errorf("config: pitch.width %v is out of range [45.0, 90.0] meters", cfg.Pitch.WidthM)
	}
	if !isFinite(cfg.Pitch.LengthM) || cfg.Pitch.LengthM < 90.0 || cfg.Pitch.LengthM > 120.0 {
		return fmt.Errorf("config: pitch.length %v is out of range [90.0, 120.0] meters", cfg.Pitch.LengthM)
	}
	if !isFinite(cfg.Pitch.GoalWidthM) || cfg.Pitch.GoalWidthM < 5.0 || cfg.Pitch.GoalWidthM > 10.0 {
		return fmt.Errorf("config: pitch.goal_width %v is out of range [5.0, 10.0] meters", cfg.Pitch.GoalWidthM)
	}
	if !isFinite(cfg.Pitch.GoalDepthM) || cfg.Pitch.GoalDepthM <= 0.0 || cfg.Pitch.GoalDepthM > 5.0 {
		return fmt.Errorf("config: pitch.goal_depth %v is out of range (0.0, 5.0] meters", cfg.Pitch.GoalDepthM)
	}
	if !isFinite(cfg.Pitch.GoalHeightM) || cfg.Pitch.GoalHeightM < 1.5 || cfg.Pitch.GoalHeightM > 3.5 {
		return fmt.Errorf("config: pitch.goal_height %v is out of range [1.5, 3.5] meters", cfg.Pitch.GoalHeightM)
	}
	if !isFinite(cfg.Pitch.BallRadiusM) || cfg.Pitch.BallRadiusM < 0.08 || cfg.Pitch.BallRadiusM > 0.15 {
		return fmt.Errorf("config: pitch.ball_radius %v is out of range [0.08, 0.15] meters", cfg.Pitch.BallRadiusM)
	}
	if !isFinite(cfg.Pitch.BallMassKg) || cfg.Pitch.BallMassKg < 0.3 || cfg.Pitch.BallMassKg > 0.6 {
		return fmt.Errorf("config: pitch.ball_mass %v is out of range [0.3, 0.6] kg", cfg.Pitch.BallMassKg)
	}

	// Timing
	if cfg.Timing.StepMs <= 0 {
		return fmt.Errorf("config: timing.step_ms %d must be strictly positive", cfg.Timing.StepMs)
	}
	if cfg.Timing.HalfDurationMs <= 0 {
		return fmt.Errorf("config: timing.half_duration_ms %d must be strictly positive", cfg.Timing.HalfDurationMs)
	}
	if cfg.Timing.AddedTimeMode != "none" && cfg.Timing.AddedTimeMode != "fixed_per_half" && cfg.Timing.AddedTimeMode != "tracked_delays" {
		return fmt.Errorf("config: timing.added_time_mode %q must be \"none\", \"fixed_per_half\" or \"tracked_delays\"", cfg.Timing.AddedTimeMode)
	}
	if cfg.Timing.FixedAddedTimeHalf1Ms < 0 {
		return fmt.Errorf("config: timing.fixed_added_time_half1_ms %d cannot be negative", cfg.Timing.FixedAddedTimeHalf1Ms)
	}
	if cfg.Timing.FixedAddedTimeHalf2Ms < 0 {
		return fmt.Errorf("config: timing.fixed_added_time_half2_ms %d cannot be negative", cfg.Timing.FixedAddedTimeHalf2Ms)
	}
	minRequiredTicks := (2 * cfg.Timing.HalfDurationMs) / cfg.Timing.StepMs
	if cfg.Timing.MaxTicksGuard < minRequiredTicks {
		return fmt.Errorf("config: timing.max_ticks_guard %d is less than regular match ticks %d", cfg.Timing.MaxTicksGuard, minRequiredTicks)
	}

	// Rules
	if cfg.Rules.SubstitutionsLimit < 0 || cfg.Rules.SubstitutionsLimit > 11 {
		return fmt.Errorf("config: rules.substitutions_limit %d must be in range [0, 11]", cfg.Rules.SubstitutionsLimit)
	}
	if cfg.Rules.SubstitutionWindows < 0 || cfg.Rules.SubstitutionWindows > 10 {
		return fmt.Errorf("config: rules.substitution_windows %d must be in range [0, 10]", cfg.Rules.SubstitutionWindows)
	}

	// Physics
	if !isFinite(cfg.Physics.PlayerMinSpeedMps) || cfg.Physics.PlayerMinSpeedMps <= 0.0 {
		return fmt.Errorf("config: physics.player_min_speed_mps %v must be positive", cfg.Physics.PlayerMinSpeedMps)
	}
	if !isFinite(cfg.Physics.PlayerMaxSpeedMps) || cfg.Physics.PlayerMaxSpeedMps <= cfg.Physics.PlayerMinSpeedMps {
		return fmt.Errorf("config: physics.player_max_speed_mps %v must be strictly greater than min speed %v", cfg.Physics.PlayerMaxSpeedMps, cfg.Physics.PlayerMinSpeedMps)
	}
	if !isFinite(cfg.Physics.PlayerMinAccelMps2) || cfg.Physics.PlayerMinAccelMps2 <= 0.0 {
		return fmt.Errorf("config: physics.player_min_accel_mps2 %v must be positive", cfg.Physics.PlayerMinAccelMps2)
	}
	if !isFinite(cfg.Physics.PlayerMaxAccelMps2) || cfg.Physics.PlayerMaxAccelMps2 <= cfg.Physics.PlayerMinAccelMps2 {
		return fmt.Errorf("config: physics.player_max_accel_mps2 %v must be strictly greater than min accel %v", cfg.Physics.PlayerMaxAccelMps2, cfg.Physics.PlayerMinAccelMps2)
	}
	if !isFinite(cfg.Physics.BallMaxSpeedMps) || cfg.Physics.BallMaxSpeedMps <= 0.0 {
		return fmt.Errorf("config: physics.ball_max_speed_mps %v must be positive", cfg.Physics.BallMaxSpeedMps)
	}

	return nil
}

// RequireRulesProfile checks that rule toggles that did not exist in profile A
// (offside, fouls, cards, injuries) are only enabled for a match input that
// explicitly declares itself "profile_b1". This is the structural guarantee
// behind B1's DoD ("новые правила не включаются молча в старые replay"): a
// match input still declaring "profile_a" cannot silently gain B1 behavior
// just because a config file flips a rule flag, and callers do not need to
// remember to check this by convention. input.Validate already rejects any
// value other than "profile_a"/"profile_b1", so this only needs to guard the
// "profile_a" side.
func RequireRulesProfile(rulesProfile string, cfg Config) error {
	if rulesProfile != "profile_a" {
		return nil
	}
	if cfg.Rules.OffsideEnabled || cfg.Rules.FoulsEnabled || cfg.Rules.CardsEnabled || cfg.Rules.InjuriesEnabled {
		return fmt.Errorf("config: rules_profile %q does not allow offside/fouls/cards/injuries rule toggles; use rules_profile %q in the match input", rulesProfile, "profile_b1")
	}
	return nil
}

// CanonicalJSON marshals Config into deterministically ordered indented JSON bytes.
func CanonicalJSON(cfg Config) ([]byte, error) {
	return json.MarshalIndent(cfg, "", "  ")
}

// CanonicalHash returns the SHA-256 hex string of the canonical JSON representation.
func CanonicalHash(cfg Config) (string, error) {
	b, err := CanonicalJSON(cfg)
	if err != nil {
		return "", err
	}
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:]), nil
}
