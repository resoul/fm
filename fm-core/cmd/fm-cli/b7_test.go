package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/resoul/fm-core/internal/batch"
)

// TestB7BatchMirrorWritesPairedSeries: `batch --mirror` writes the original
// series, a mirrored/ series on the same seeds and paired.json, prints the
// paired comparison, and the summary carries the B7 distributions.
func TestB7BatchMirrorWritesPairedSeries(t *testing.T) {
	out := filepath.Join(t.TempDir(), "batch")
	var stdout, stderr bytes.Buffer
	args := []string{"batch", "--input", "fixtures/match/real/fc_barcelona_vs_manchester_city.json", "--config", "configs/short_test.json", "--seed", "77", "--count", "3", "--workers", "2", "--mirror", "--format", "json", "--out", out}
	if code := run(args, &stdout, &stderr); code != 0 {
		t.Fatalf("exit=%d: %s", code, &stderr)
	}
	dec := json.NewDecoder(&stdout)
	var summary batch.Summary
	if err := dec.Decode(&summary); err != nil {
		t.Fatal(err)
	}
	var paired batch.Paired
	if err := dec.Decode(&paired); err != nil {
		t.Fatal(err)
	}
	if summary.Completed != 3 || summary.Distributions == nil || len(summary.Distributions.Teams) != 2 {
		t.Fatalf("summary = %+v", summary)
	}
	if paired.Seeds != 3 || len(paired.Rosters) != 2 || paired.Rosters[0].Matches != 6 {
		t.Fatalf("paired = %+v", paired)
	}
	for _, name := range []string{"results.ndjson", "summary.json", "paired.json", filepath.Join("mirrored", "results.ndjson"), filepath.Join("mirrored", "summary.json")} {
		if _, err := os.Stat(filepath.Join(out, name)); err != nil {
			t.Fatalf("missing %s: %v", name, err)
		}
	}
	mirroredInput, err := os.ReadFile(filepath.Join(out, "mirrored", "input.json"))
	if err != nil {
		t.Fatal(err)
	}
	originalInput, err := os.ReadFile(filepath.Join(out, "input.json"))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(mirroredInput, originalInput) {
		t.Fatal("mirrored/ must keep the original input bytes; the swap is a runtime transform, not a second fixture")
	}
	stdout.Reset()
	if code := run([]string{"batch", "--input", "fixtures/match/equal.json", "--config", "configs/short_test.json", "--seed", "77", "--count", "2", "--mirror", "--out", filepath.Join(out, "text")}, &stdout, &stderr); code != 0 {
		t.Fatalf("exit=%d: %s", code, &stderr)
	}
	if !bytes.Contains(stdout.Bytes(), []byte("Paired home")) || !bytes.Contains(stdout.Bytes(), []byte("home-side advantage")) {
		t.Fatalf("text output lacks the paired lines: %s", &stdout)
	}
}

// TestB7RealFixturesValidateThroughCLI: the generated real-team fixtures
// pass `validate` with the baseline config.
func TestB7RealFixturesValidateThroughCLI(t *testing.T) {
	fixtures, err := filepath.Glob("fixtures/match/real/*.json")
	if err != nil || len(fixtures) == 0 {
		t.Fatalf("no real fixtures: %v", err)
	}
	for _, path := range fixtures {
		var stdout, stderr bytes.Buffer
		if code := run([]string{"validate", "--input", path, "--config", "configs/baseline.json"}, &stdout, &stderr); code != 0 {
			t.Fatalf("%s: exit=%d: %s", path, code, &stderr)
		}
	}
}
