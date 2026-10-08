package config

import (
	"strings"
	"testing"
)

func TestConfig_Defaults(t *testing.T) {
	cfg := DefaultConfig()
	if err := Validate(cfg); err != nil {
		t.Fatalf("default config failed validation: %v", err)
	}
	if cfg.Timing.StepMs != 50 {
		t.Errorf("step_ms = %d, want 50", cfg.Timing.StepMs)
	}
	if cfg.Rules.SubstitutionsLimit != 5 {
		t.Errorf("substitutions_limit = %d, want 5", cfg.Rules.SubstitutionsLimit)
	}
}

func TestConfig_ShortTest(t *testing.T) {
	cfg := ShortTestConfig()
	if err := Validate(cfg); err != nil {
		t.Fatalf("short test config failed validation: %v", err)
	}
	if cfg.Timing.HalfDurationMs != 60000 {
		t.Errorf("half_duration_ms = %d, want 60000", cfg.Timing.HalfDurationMs)
	}
}

func TestConfig_TrackedDelays(t *testing.T) {
	cfg := DefaultConfig()
	cfg.Timing.AddedTimeMode = "tracked_delays"
	if err := Validate(cfg); err != nil {
		t.Fatalf("tracked_delays config failed validation: %v", err)
	}
}

func TestConfig_Overrides_DistinguishOmittedFromZero(t *testing.T) {
	defaults := DefaultConfig()

	// 1. Explicit zero value for added time and substitutions limit
	zeroInt := 0
	overrides := ConfigOverrides{
		Rules: &RulesOverrides{
			SubstitutionsLimit: &zeroInt,
		},
	}

	merged, err := Merge(defaults, overrides)
	if err != nil {
		t.Fatalf("merge failed: %v", err)
	}
	if merged.Rules.SubstitutionsLimit != 0 {
		t.Errorf("substitutions_limit = %d, want 0 (explicit override)", merged.Rules.SubstitutionsLimit)
	}

	// 2. Omitted fields keep default
	if merged.Pitch.WidthM != 68.0 {
		t.Errorf("pitch.width = %v, want 68.0 (default)", merged.Pitch.WidthM)
	}
	if merged.Timing.StepMs != 50 {
		t.Errorf("step_ms = %d, want 50 (default)", merged.Timing.StepMs)
	}
}

func TestConfig_Overrides_ValidationFailure(t *testing.T) {
	defaults := DefaultConfig()
	zeroStep := 0
	overrides := ConfigOverrides{
		Timing: &TimingOverrides{
			StepMs: &zeroStep,
		},
	}

	_, err := Merge(defaults, overrides)
	if err == nil {
		t.Fatal("expected error when step_ms is 0, got nil")
	}
	if !strings.Contains(err.Error(), "timing.step_ms") {
		t.Errorf("error = %q, want substring 'timing.step_ms'", err.Error())
	}
}

func TestConfig_CanonicalHashStability(t *testing.T) {
	cfg1 := DefaultConfig()
	cfg2 := DefaultConfig()

	hash1, err1 := CanonicalHash(cfg1)
	if err1 != nil {
		t.Fatalf("CanonicalHash cfg1 failed: %v", err1)
	}
	hash2, err2 := CanonicalHash(cfg2)
	if err2 != nil {
		t.Fatalf("CanonicalHash cfg2 failed: %v", err2)
	}

	if hash1 != hash2 {
		t.Errorf("hash mismatch between identical configs: %s != %s", hash1, hash2)
	}
	if len(hash1) != 64 {
		t.Errorf("expected 64-character SHA-256 hex string, got len %d: %s", len(hash1), hash1)
	}
}

func TestRequireRulesProfile(t *testing.T) {
	plain := DefaultConfig()
	b1 := DefaultConfig()
	b1.Rules.OffsideEnabled, b1.Rules.FoulsEnabled, b1.Rules.CardsEnabled, b1.Rules.InjuriesEnabled = true, true, true, true

	if err := RequireRulesProfile("profile_a", plain); err != nil {
		t.Errorf("profile_a with no B1 toggles should be allowed: %v", err)
	}
	if err := RequireRulesProfile("profile_a", b1); err == nil {
		t.Error("profile_a with B1 rule toggles should be rejected")
	}
	if err := RequireRulesProfile("profile_b1", b1); err != nil {
		t.Errorf("profile_b1 with B1 rule toggles should be allowed: %v", err)
	}
	if err := RequireRulesProfile("profile_b1", plain); err != nil {
		t.Errorf("profile_b1 with no toggles enabled should still be allowed: %v", err)
	}
}
