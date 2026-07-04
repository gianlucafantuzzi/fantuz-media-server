package state

import (
	"encoding/json"
	"os"
	"path/filepath"

	"fantuz-media-server/player/internal/queue"
)

type Snapshot struct {
	Volume          float64       `json:"volume"`
	Queue           []queue.Track `json:"queue"`
	QueueIndex      int           `json:"queue_index"`
	PositionSeconds float64       `json:"position_seconds"`
	Playing         bool          `json:"playing"`
}

func Load(path string) (Snapshot, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return Snapshot{Volume: 1}, nil
		}
		return Snapshot{}, err
	}

	var snapshot Snapshot
	if err := json.Unmarshal(data, &snapshot); err != nil {
		return Snapshot{}, err
	}
	if snapshot.Volume <= 0 {
		snapshot.Volume = 1
	}
	return snapshot, nil
}

func Save(path string, snapshot Snapshot) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(snapshot, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}
