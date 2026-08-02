package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"testing"

	"fantuz-media-server/server/internal/config"
	"fantuz-media-server/server/internal/library"
)

type fakeScanner struct {
	result library.ScanResult
	root   string
}

func (s *fakeScanner) Scan(root string) (library.ScanResult, error) {
	s.root = root
	return s.result, nil
}

func TestConfigEndpointReadsAndWritesConfig(t *testing.T) {
	server, _ := testServer(t)

	request := httptest.NewRequest(http.MethodGet, "/api/config", nil)
	response := httptest.NewRecorder()
	server.Routes().ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("GET /api/config status = %d", response.Code)
	}

	body := bytes.NewBufferString(`{"media_path":"/music","player_urls":["http://player"]}`)
	request = httptest.NewRequest(http.MethodPost, "/api/config", body)
	response = httptest.NewRecorder()
	server.Routes().ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("POST /api/config status = %d body = %s", response.Code, response.Body.String())
	}

	request = httptest.NewRequest(http.MethodGet, "/api/config", nil)
	response = httptest.NewRecorder()
	server.Routes().ServeHTTP(response, request)

	var cfg config.Config
	if err := json.NewDecoder(response.Body).Decode(&cfg); err != nil {
		t.Fatalf("decode config: %v", err)
	}
	if cfg.MediaPath != "/music" || len(cfg.PlayerURLs) != 1 || cfg.PlayerURLs[0] != "http://player" {
		t.Fatalf("config = %#v", cfg)
	}
}

func TestLibraryAndPlaylistEndpoints(t *testing.T) {
	server, db := testServer(t)
	trackOne := addTrack(t, db, library.TrackMetadata{
		FilePath:        filepath.Join(t.TempDir(), "one.mp3"),
		Title:           "First",
		Artist:          "Artist",
		Album:           "Album",
		AlbumArtist:     "Album Artist",
		DurationSeconds: 60,
		Genre:           "Rock",
		Keywords:        []string{"Live"},
		LastModified:    1,
	})
	trackTwo := addTrack(t, db, library.TrackMetadata{
		FilePath:        filepath.Join(t.TempDir(), "two.mp3"),
		Title:           "Second",
		Artist:          "Artist",
		Album:           "Album",
		AlbumArtist:     "Album Artist",
		DurationSeconds: 90,
		Genre:           "Jazz",
		Keywords:        []string{"Piano"},
		LastModified:    1,
	})
	if err := db.RecalculateAlbumDurations([]int64{1}); err != nil {
		t.Fatalf("recalculate album duration: %v", err)
	}

	response := request(server, http.MethodGet, "/api/library/albums?keyword=Live", nil)
	if response.Code != http.StatusOK {
		t.Fatalf("albums status = %d body = %s", response.Code, response.Body.String())
	}

	var albums []library.Album
	if err := json.NewDecoder(response.Body).Decode(&albums); err != nil {
		t.Fatalf("decode albums: %v", err)
	}
	if len(albums) != 1 || albums[0].DurationSeconds != 150 {
		t.Fatalf("albums = %#v", albums)
	}

	body := bytes.NewBufferString(`{"title":"Mix","track_ids":[` + strconvText(trackOne) + `,` + strconvText(trackTwo) + `]}`)
	response = request(server, http.MethodPost, "/api/playlists", body)
	if response.Code != http.StatusCreated {
		t.Fatalf("create playlist status = %d body = %s", response.Code, response.Body.String())
	}

	var playlist library.Playlist
	if err := json.NewDecoder(response.Body).Decode(&playlist); err != nil {
		t.Fatalf("decode playlist: %v", err)
	}
	if playlist.DurationSeconds != 150 || len(playlist.Tracks) != 2 {
		t.Fatalf("playlist = %#v", playlist)
	}

	searchResp := request(server, http.MethodGet, "/api/library/search?q=First", nil)
	if searchResp.Code != http.StatusOK {
		t.Fatalf("search status = %d body = %s", searchResp.Code, searchResp.Body.String())
	}
	var searchResult map[string]any
	if err := json.NewDecoder(searchResp.Body).Decode(&searchResult); err != nil {
		t.Fatalf("decode search result: %v", err)
	}
	t.Logf("search result = %#v", searchResult)
}


func TestScanEndpointUsesConfiguredMediaPath(t *testing.T) {
	server, _ := testServer(t)
	server.config.MediaPath = "/music"
	server.scanner.(*fakeScanner).result = library.ScanResult{Scanned: 2, Skipped: 1}

	response := request(server, http.MethodPost, "/api/scan", nil)
	if response.Code != http.StatusOK {
		t.Fatalf("scan status = %d body = %s", response.Code, response.Body.String())
	}
	if server.scanner.(*fakeScanner).root != "/music" {
		t.Fatalf("scanner root = %q", server.scanner.(*fakeScanner).root)
	}
}

func TestMediaEndpointServesTrackFile(t *testing.T) {
	server, db := testServer(t)
	dir := t.TempDir()
	path := filepath.Join(dir, "track.mp3")
	if err := os.WriteFile(path, []byte("audio"), 0o644); err != nil {
		t.Fatalf("write media: %v", err)
	}
	trackID := addTrack(t, db, library.TrackMetadata{
		FilePath:     path,
		Title:        "Track",
		LastModified: 1,
	})

	response := request(server, http.MethodGet, "/media/"+strconvText(trackID), nil)
	if response.Code != http.StatusOK {
		t.Fatalf("media status = %d body = %s", response.Code, response.Body.String())
	}
	if response.Body.String() != "audio" {
		t.Fatalf("media body = %q", response.Body.String())
	}
}

func testServer(t *testing.T) (*Server, *library.DB) {
	t.Helper()
	dir := t.TempDir()
	db, err := library.Open(filepath.Join(dir, "fantuz.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	server := New(Options{
		DB:         db,
		Config:     config.Config{PlayerURLs: []string{}},
		ConfigPath: filepath.Join(dir, "config.json"),
		Scanner:    &fakeScanner{},
		DataDir:    dir,
	})
	return server, db
}

func addTrack(t *testing.T, db *library.DB, meta library.TrackMetadata) int64 {
	t.Helper()
	trackID, albumID, err := db.UpsertTrack(meta, "")
	if err != nil {
		t.Fatalf("upsert track: %v", err)
	}
	if albumID != 0 {
		if err := db.RecalculateAlbumDurations([]int64{albumID}); err != nil {
			t.Fatalf("recalculate album: %v", err)
		}
	}
	return trackID
}

func request(server *Server, method, path string, body *bytes.Buffer) *httptest.ResponseRecorder {
	var reader *bytes.Reader
	if body == nil {
		reader = bytes.NewReader(nil)
	} else {
		reader = bytes.NewReader(body.Bytes())
	}
	req := httptest.NewRequest(method, path, reader)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	response := httptest.NewRecorder()
	server.Routes().ServeHTTP(response, req)
	return response
}

func strconvText(id int64) string {
	return strconv.FormatInt(id, 10)
}
