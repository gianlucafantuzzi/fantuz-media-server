package main

import (
	"path/filepath"
	"testing"
)

func TestDataPathsInUsesExecutableDirectory(t *testing.T) {
	dir := filepath.Join("tmp", "server")
	paths := dataPathsIn(dir)

	if paths.config != filepath.Join(dir, "config.json") {
		t.Fatalf("config path = %q", paths.config)
	}
	if paths.dir != dir {
		t.Fatalf("dir = %q", paths.dir)
	}
	if paths.database != filepath.Join(dir, "fantuz.db") {
		t.Fatalf("database path = %q", paths.database)
	}
	if paths.artwork != filepath.Join(dir, ".artwork") {
		t.Fatalf("artwork path = %q", paths.artwork)
	}
}
