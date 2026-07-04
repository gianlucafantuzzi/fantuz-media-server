package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"fantuz-media-server/player/internal/api"
	"fantuz-media-server/player/internal/playback"
	"fantuz-media-server/player/internal/state"
)

func main() {
	dir, err := executableDir()
	if err != nil {
		log.Fatalf("resolve player data path: %v", err)
	}

	statePath := filepath.Join(dir, "player_state.json")
	snapshot, err := state.Load(statePath)
	if err != nil {
		log.Fatalf("load player state: %v", err)
	}

	engine := playback.New(statePath, nil)
	if err := engine.InitSpeaker(); err != nil {
		log.Fatalf("init audio: %v", err)
	}
	engine.Restore(snapshot)

	server := api.New(engine)
	engine.SetOnChange(server.BroadcastStatus)

	fmt.Println("Fantuz Media Server - Player")
	fmt.Println("Listening on :3002")
	if err := http.ListenAndServe(":3002", server.Routes()); err != nil {
		log.Fatalf("serve: %v", err)
	}
}

func executableDir() (string, error) {
	executable, err := os.Executable()
	if err != nil {
		return "", err
	}
	return filepath.Dir(executable), nil
}
