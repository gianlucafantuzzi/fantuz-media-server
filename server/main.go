package main

import (
	"fmt"
	"log"
	"mime"
	"net/http"
	"os"
	"path/filepath"

	"fantuz-media-server/server/internal/api"
	"fantuz-media-server/server/internal/config"
	"fantuz-media-server/server/internal/library"
)

func main() {
	// Register FLAC MIME type to ensure compatibility with Safari on iOS
	_ = mime.AddExtensionType(".flac", "audio/flac")

	paths, err := serverDataPaths()
	if err != nil {
		log.Fatalf("resolve server data paths: %v", err)
	}

	cfg, err := config.Load(paths.config)
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	db, err := library.Open(paths.database)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	defer db.Close()

	server := api.New(api.Options{
		DB:         db,
		Config:     cfg,
		ConfigPath: paths.config,
		Scanner:    library.NewScanner(db, paths.artwork),
		DataDir:    paths.dir,
	})

	fmt.Printf("Fantuz Media Server - Server\nMedia path: %s\nListening on :3001\n", cfg.MediaPath)
	if err := http.ListenAndServe(":3001", server.Routes()); err != nil {
		log.Fatalf("serve: %v", err)
	}
}

type dataPaths struct {
	dir      string
	config   string
	database string
	artwork  string
}

func serverDataPaths() (dataPaths, error) {
	executable, err := os.Executable()
	if err != nil {
		return dataPaths{}, err
	}
	return dataPathsIn(filepath.Dir(executable)), nil
}

func dataPathsIn(dir string) dataPaths {
	return dataPaths{
		dir:      dir,
		config:   filepath.Join(dir, "config.json"),
		database: filepath.Join(dir, "fantuz.db"),
		artwork:  filepath.Join(dir, ".artwork"),
	}
}
