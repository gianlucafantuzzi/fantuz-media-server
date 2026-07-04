package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadCreatesDefaultConfig(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")

	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}
	if cfg.MediaPath != "" {
		t.Fatalf("MediaPath = %q, want empty", cfg.MediaPath)
	}
	if len(cfg.PlayerURLs) != 1 || cfg.PlayerURLs[0] != "http://localhost:3002" {
		t.Fatalf("PlayerURLs = %#v, want localhost player", cfg.PlayerURLs)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("expected config file to be created: %v", err)
	}
}
