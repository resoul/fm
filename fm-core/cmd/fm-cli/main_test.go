package main

import (
	"bytes"
	"os"
	"strings"
	"testing"
)

func TestMain(m *testing.M) {
	if _, err := os.Stat("fixtures"); os.IsNotExist(err) {
		if _, err := os.Stat("../../fixtures"); err == nil {
			_ = os.Chdir("../..")
		}
	}
	os.Exit(m.Run())
}

func TestCLIContract(t *testing.T) {
	tests := []struct {
		name     string
		args     []string
		code     int
		contains string
	}{
		{"no arguments", nil, 0, "Usage:"},
		{"help", []string{"help"}, 0, "Usage:"},
		{"help help", []string{"help", "help"}, 0, "Usage:"},
		{"help version", []string{"help", "version"}, 0, "Usage: fm-cli version"},
		{"help flag", []string{"--help"}, 0, "Usage:"},
		{"short help", []string{"-h"}, 0, "Usage:"},
		{"version", []string{"version"}, 0, "fm-cli 0.1.0-dev (go"},
		{"version flag", []string{"--version"}, 0, "fm-cli 0.1.0-dev (go"},
		{"command help", []string{"help", "run"}, 0, "Usage: fm-cli run"},
		{"validate help", []string{"validate", "--help"}, 0, "input"},
		{"replay help", []string{"replay", "-h"}, 0, "verify"},
		{"batch help", []string{"batch", "--help"}, 0, "workers"},
		{"unknown", []string{"missing"}, 2, "unknown command"},
		{"unknown help", []string{"help", "missing"}, 2, "unknown command"},
		{"help extras", []string{"help", "run", "extra"}, 2, "help accepts"},
		{"version extras", []string{"version", "extra"}, 2, "version accepts"},
		{"missing input", []string{"validate"}, 2, "--input is required"},
		{"missing flag value", []string{"validate", "--input"}, 2, "flag needs an argument"},
		{"unknown flag", []string{"run", "--typo"}, 2, "flag provided but not defined"},
		{"positional", []string{"validate", "match.json"}, 2, "unexpected positional"},
		{"missing seed", []string{"run", "--input", "match.json"}, 2, "--seed is required"},
		{"bad seed", []string{"run", "--input", "match.json", "--seed", "abc"}, 2, "invalid value"},
		{"bad speed", []string{"run", "--input", "match.json", "--seed", "42", "--speed", "slow"}, 2, "--speed must"},
		{"bad format", []string{"run", "--input", "match.json", "--seed", "42", "--format", "xml"}, 2, "--format must"},
		{"replay missing verify", []string{"replay", "--record", "recording"}, 2, "requires --record and --verify"},
		{"replay false verify", []string{"replay", "--record", "recording", "--verify=false"}, 2, "requires --record and --verify"},
		{"batch zero count", []string{"batch", "--input", "match.json", "--seed", "42", "--count", "0", "--out", "output"}, 2, "positive --count"},
		{"batch zero workers", []string{"batch", "--input", "match.json", "--seed", "42", "--count", "1", "--workers", "0", "--out", "output"}, 2, "positive --workers"},
		{"batch seed overflow", []string{"batch", "--input", "match.json", "--seed", "9223372036854775807", "--count", "2", "--out", "output"}, 2, "overflows"},
		{"validate missing file", []string{"validate", "--input", "does-not-exist.json"}, 2, "validation error"},
		{"validate equal fixture", []string{"validate", "--input", "fixtures/match/equal.json"}, 0, "Validation passed"},
		{"validate favorite fixture", []string{"validate", "--input", "fixtures/match/favorite.json"}, 0, "Validation passed"},
		{"validate tired fixture", []string{"validate", "--input", "fixtures/match/tired.json"}, 0, "Validation passed"},
		{"validate with baseline config", []string{"validate", "--input", "fixtures/match/equal.json", "--config", "configs/baseline.json"}, 0, "Validation passed"},
		{"validate with short_test config", []string{"validate", "--input", "fixtures/match/equal.json", "--config", "configs/short_test.json"}, 0, "Validation passed"},
		{"validate negative missing gk", []string{"validate", "--input", "testdata/match/missing_gk.json"}, 2, "validation error"},
		{"validate negative zero step config", []string{"validate", "--input", "fixtures/match/equal.json", "--config", "testdata/config/zero_step.json"}, 2, "configuration error"},
		{"run zero seed", []string{"run", "--input", "match.json", "--seed", "0", "--format", "json"}, 2, "validation error"},
		{"run all flags", []string{"run", "--input", "match.json", "--seed", "-1", "--speed", "realtime", "--config", "config.json", "--commands", "commands.json", "--record", "recording"}, 2, "validation error"},
		{"replay missing recording", []string{"replay", "--record", "recording", "--verify"}, 1, "replay verification failed"},
		{"batch missing input", []string{"batch", "--input", "match.json", "--seed", "42", "--count", "1", "--workers", "4", "--out", "output"}, 2, "validation error"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var stdout, stderr bytes.Buffer
			if code := run(tt.args, &stdout, &stderr); code != tt.code {
				t.Fatalf("exit = %d, want %d; stderr: %s", code, tt.code, &stderr)
			}
			output, empty := &stdout, &stderr
			if tt.code != 0 {
				output, empty = &stderr, &stdout
			}
			if !strings.Contains(output.String(), tt.contains) {
				t.Errorf("output = %q, want substring %q", output, tt.contains)
			}
			if empty.Len() != 0 {
				t.Errorf("unexpected output on other stream: %q", empty)
			}
		})
	}
}
