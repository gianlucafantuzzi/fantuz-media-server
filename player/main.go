package main

import (
	"fmt"
	"log"
	"net/http"

	"fantuz-media-server/player/internal/api"
	"fantuz-media-server/player/internal/playback"
)

func main() {
	engine := playback.New(nil)
	if err := engine.InitSpeaker(); err != nil {
		log.Fatalf("init audio: %v", err)
	}

	server := api.New(engine)
	engine.SetOnChange(server.BroadcastStatus)

	fmt.Println("Fantuz Media Server - Player")
	fmt.Println("Listening on :3002")
	if err := http.ListenAndServe(":3002", server.Routes()); err != nil {
		log.Fatalf("serve: %v", err)
	}
}
