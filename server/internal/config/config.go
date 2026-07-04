package config

import (
	"encoding/json"
	"errors"
	"os"
)

type Config struct {
	MediaPath  string   `json:"media_path"`
	PlayerURLs []string `json:"player_urls"`
}

func Default() Config {
	return Config{
		MediaPath:  "",
		PlayerURLs: []string{"http://localhost:3002"},
	}
}

func Load(path string) (Config, error) {
	cfg := Default()

	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return cfg, Save(path, cfg)
		}
		return Config{}, err
	}

	if err := json.Unmarshal(data, &cfg); err != nil {
		return Config{}, err
	}
	if cfg.PlayerURLs == nil {
		cfg.PlayerURLs = []string{}
	}
	return cfg, nil
}

func Save(path string, cfg Config) error {
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(data, '\n'), 0o644)
}
