package json

import (
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/resoul/fm-core/internal/match/config"
	"github.com/resoul/fm-core/internal/match/domain"
)

// LoadMatchInput parses and validates match input from an io.Reader, rejecting unknown fields.
func LoadMatchInput(r io.Reader) (domain.MatchInput, error) {
	dec := json.NewDecoder(r)
	dec.DisallowUnknownFields()

	var dto MatchInputDTO
	if err := dec.Decode(&dto); err != nil {
		return domain.MatchInput{}, fmt.Errorf("json parse error: %w", err)
	}

	// Ensure there are no trailing non-whitespace bytes
	var extra json.RawMessage
	if err := dec.Decode(&extra); err != io.EOF {
		if err == nil {
			return domain.MatchInput{}, fmt.Errorf("json error: unexpected trailing content")
		}
	}

	return dto.ToDomain()
}

// LoadMatchInputFromFile reads and validates a MatchInput JSON file.
func LoadMatchInputFromFile(path string) (domain.MatchInput, error) {
	f, err := os.Open(path)
	if err != nil {
		return domain.MatchInput{}, err
	}
	defer f.Close()

	return LoadMatchInput(f)
}

// LoadConfigOverrides parses model configuration overrides from an io.Reader, rejecting unknown fields.
func LoadConfigOverrides(r io.Reader) (config.ConfigOverrides, error) {
	dec := json.NewDecoder(r)
	dec.DisallowUnknownFields()

	var overrides config.ConfigOverrides
	if err := dec.Decode(&overrides); err != nil {
		return config.ConfigOverrides{}, fmt.Errorf("config json parse error: %w", err)
	}

	var extra json.RawMessage
	if err := dec.Decode(&extra); err != io.EOF {
		if err == nil {
			return config.ConfigOverrides{}, fmt.Errorf("config json error: unexpected trailing content")
		}
	}

	return overrides, nil
}

// LoadResolvedConfigFromFile loads overrides from a file and merges them with defaults.
func LoadResolvedConfigFromFile(path string, defaults config.Config) (config.Config, error) {
	f, err := os.Open(path)
	if err != nil {
		return config.Config{}, err
	}
	defer f.Close()

	overrides, err := LoadConfigOverrides(f)
	if err != nil {
		return config.Config{}, err
	}

	return config.Merge(defaults, overrides)
}
