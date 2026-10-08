package json

import (
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/resoul/fm-core/internal/match/domain"
)

type CommandScenario struct {
	SchemaVersion string       `json:"schema_version"`
	Commands      []CommandDTO `json:"commands"`
}

type CommandDTO struct {
	CommandID  string             `json:"command_id"`
	TargetTick int64              `json:"target_tick"`
	Sequence   int64              `json:"sequence"`
	Type       domain.CommandType `json:"type"`
	Payload    CommandPayloadDTO  `json:"payload"`
}

type CommandPayloadDTO struct {
	TeamID      string   `json:"team_id"`
	PlayerOutID string   `json:"player_out_id"`
	PlayerInID  string   `json:"player_in_id"`
	Slot        string   `json:"slot"`
	Formation   string   `json:"formation"`
	Width       *float64 `json:"width"`
	LineHeight  *float64 `json:"line_height"`
	Tempo       *float64 `json:"tempo"`
	Pressing    *float64 `json:"pressing"`
}

func (d CommandDTO) ToDomain() (domain.MatchCommand, error) {
	cmd := domain.MatchCommand{ID: d.CommandID, TargetTick: d.TargetTick, Sequence: d.Sequence, Type: d.Type, TeamID: d.Payload.TeamID, PlayerOut: d.Payload.PlayerOutID, PlayerIn: d.Payload.PlayerInID, Slot: d.Payload.Slot}
	if d.Type == domain.CommandChangeTactics {
		if d.Payload.Formation == "" || d.Payload.Width == nil || d.Payload.LineHeight == nil || d.Payload.Tempo == nil || d.Payload.Pressing == nil {
			return domain.MatchCommand{}, fmt.Errorf("command %q: incomplete tactics payload", d.CommandID)
		}
		cmd.Tactics = &domain.Tactics{Formation: d.Payload.Formation, Width: *d.Payload.Width, LineHeight: *d.Payload.LineHeight, Tempo: *d.Payload.Tempo, Pressing: *d.Payload.Pressing}
	}
	return cmd, nil
}

func LoadCommandScenario(r io.Reader) ([]domain.MatchCommand, error) {
	dec := json.NewDecoder(r)
	dec.DisallowUnknownFields()
	var dto CommandScenario
	if err := dec.Decode(&dto); err != nil {
		return nil, fmt.Errorf("commands json parse error: %w", err)
	}
	if dto.SchemaVersion != "v1" {
		return nil, fmt.Errorf("commands: unsupported schema_version %q", dto.SchemaVersion)
	}
	commands := make([]domain.MatchCommand, len(dto.Commands))
	for i, item := range dto.Commands {
		if item.CommandID == "" {
			return nil, fmt.Errorf("commands[%d]: command_id is required", i)
		}
		if item.Sequence <= 0 {
			return nil, fmt.Errorf("commands[%d]: sequence must be positive", i)
		}
		cmd, err := item.ToDomain()
		if err != nil {
			return nil, err
		}
		commands[i] = cmd
	}
	return commands, nil
}

func LoadCommandScenarioFromFile(path string) ([]domain.MatchCommand, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return LoadCommandScenario(f)
}
