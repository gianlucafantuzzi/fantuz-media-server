package state

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSaveAndLoad(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "player_state.json")

	snapshot := Snapshot{
		Volume:          0.5,
		QueueIndex:      1,
		PositionSeconds: 12.5,
		Playing:         true,
	}
	if err := Save(path, snapshot); err != nil {
		t.Fatalf("save: %v", err)
	}

	loaded, err := Load(path)
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if loaded.Volume != 0.5 || loaded.QueueIndex != 1 || loaded.PositionSeconds != 12.5 || !loaded.Playing {
		t.Fatalf("unexpected snapshot: %+v", loaded)
	}
}

func TestLoadMissingDefaults(t *testing.T) {
	snapshot, err := Load(filepath.Join(t.TempDir(), "missing.json"))
	if err != nil {
		t.Fatalf("load missing: %v", err)
	}
	if snapshot.Volume != 1 {
		t.Fatalf("expected default volume 1, got %v", snapshot.Volume)
	}
}

func TestLoadInvalidJSON(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "player_state.json")
	if err := os.WriteFile(path, []byte("{"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	if _, err := Load(path); err == nil {
		t.Fatal("expected invalid JSON error")
	}
}
