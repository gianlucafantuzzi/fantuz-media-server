package library

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"
)

type fakeParser struct {
	metadataByPath map[string]TrackMetadata
	calls          int
}

func (p *fakeParser) Parse(path string) (TrackMetadata, error) {
	p.calls++
	return p.metadataByPath[path], nil
}

func TestScannerIndexesTracksAlbumsKeywordsAndDurations(t *testing.T) {
	dir := t.TempDir()
	db, err := Open(filepath.Join(dir, "fantuz.db"))
	if err != nil {
		t.Fatalf("Open returned error: %v", err)
	}
	defer db.Close()

	trackOne := filepath.Join(dir, "01.mp3")
	trackTwo := filepath.Join(dir, "02.mp3")
	if err := os.WriteFile(trackOne, []byte("one"), 0o644); err != nil {
		t.Fatalf("write track one: %v", err)
	}
	if err := os.WriteFile(trackTwo, []byte("two"), 0o644); err != nil {
		t.Fatalf("write track two: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "cover.txt"), []byte("skip"), 0o644); err != nil {
		t.Fatalf("write non-audio: %v", err)
	}

	parser := &fakeParser{metadataByPath: map[string]TrackMetadata{
		trackOne: {
			Title:           "First",
			Artist:          "Artist",
			Album:           "Album",
			AlbumArtist:     "Album Artist",
			DurationSeconds: 60,
			Genre:           "Genre",
			TrackNumber:     1,
			Keywords:        []string{"Live", "Piano"},
		},
		trackTwo: {
			Title:           "Second",
			Artist:          "Artist",
			Album:           "Album",
			AlbumArtist:     "Album Artist",
			DurationSeconds: 90,
			Genre:           "Genre",
			TrackNumber:     2,
			Keywords:        []string{"Piano"},
		},
	}}

	scanner := Scanner{
		DB:      db,
		Parser:  parser,
		Artwork: NewArtworkCache(filepath.Join(dir, ".artwork")),
	}

	result, err := scanner.Scan(dir)
	if err != nil {
		t.Fatalf("Scan returned error: %v", err)
	}
	if result.Scanned != 2 || result.Skipped != 0 || result.Failed != 0 {
		t.Fatalf("result = %#v, want 2 scanned", result)
	}

	var albumDuration int
	if err := db.sql.QueryRow(`SELECT duration_seconds FROM albums WHERE title = ?`, "Album").Scan(&albumDuration); err != nil {
		t.Fatalf("query album duration: %v", err)
	}
	if albumDuration != 150 {
		t.Fatalf("album duration = %d, want 150", albumDuration)
	}

	var keywordCount int
	if err := db.sql.QueryRow(`SELECT COUNT(*) FROM keywords`).Scan(&keywordCount); err != nil {
		t.Fatalf("query keyword count: %v", err)
	}
	if keywordCount != 2 {
		t.Fatalf("keyword count = %d, want 2", keywordCount)
	}

	result, err = scanner.Scan(dir)
	if err != nil {
		t.Fatalf("second Scan returned error: %v", err)
	}
	if result.Scanned != 0 || result.Skipped != 2 || parser.calls != 2 {
		t.Fatalf("second result = %#v, parser calls = %d; want skipped unchanged files", result, parser.calls)
	}
}

func TestSchemaContainsPlaylistTables(t *testing.T) {
	db, err := Open(filepath.Join(t.TempDir(), "fantuz.db"))
	if err != nil {
		t.Fatalf("Open returned error: %v", err)
	}
	defer db.Close()

	for _, table := range []string{"albums", "tracks", "keywords", "track_keywords", "playlists", "playlist_tracks"} {
		var name string
		err := db.sql.QueryRow(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, table).Scan(&name)
		if err != nil {
			if err == sql.ErrNoRows {
				t.Fatalf("missing table %s", table)
			}
			t.Fatalf("query table %s: %v", table, err)
		}
	}
}

func TestScanRemovesEmptyAlbums(t *testing.T) {
	dir := t.TempDir()
	db, err := Open(filepath.Join(dir, "fantuz.db"))
	if err != nil {
		t.Fatalf("Open returned error: %v", err)
	}
	defer db.Close()

	// Insert an empty album with no tracks
	if _, err := db.sql.Exec(`INSERT INTO albums (title, album_artist) VALUES ('Orphan Album', 'Orphan Artist')`); err != nil {
		t.Fatalf("failed to insert orphan album: %v", err)
	}

	trackOne := filepath.Join(dir, "track.mp3")
	if err := os.WriteFile(trackOne, []byte("track"), 0o644); err != nil {
		t.Fatalf("write track: %v", err)
	}

	parser := &fakeParser{metadataByPath: map[string]TrackMetadata{
		trackOne: {
			Title:       "Track",
			Artist:      "Artist",
			Album:       "Active Album",
			AlbumArtist: "Active Artist",
		},
	}}

	scanner := Scanner{
		DB:      db,
		Parser:  parser,
		Artwork: NewArtworkCache(filepath.Join(dir, ".artwork")),
	}

	if _, err := scanner.Scan(dir); err != nil {
		t.Fatalf("Scan returned error: %v", err)
	}

	albums, err := db.ListAlbums(LibraryFilters{})
	if err != nil {
		t.Fatalf("ListAlbums returned error: %v", err)
	}

	if len(albums) != 1 || albums[0].Title != "Active Album" {
		t.Fatalf("expected only 'Active Album', got: %#v", albums)
	}
}

func TestUnaccentSearch(t *testing.T) {
	dir := t.TempDir()
	db, err := Open(filepath.Join(dir, "fantuz.db"))
	if err != nil {
		t.Fatalf("Open returned error: %v", err)
	}
	defer db.Close()

	trackFile := filepath.Join(dir, "track.mp3")
	if err := os.WriteFile(trackFile, []byte("track"), 0o644); err != nil {
		t.Fatalf("write track: %v", err)
	}

	parser := &fakeParser{metadataByPath: map[string]TrackMetadata{
		trackFile: {
			Title:       "Mêxico",
			Artist:      "Édith Piaf",
			Album:       "Édit Piaf Best Of",
			AlbumArtist: "Édith Piaf",
		},
	}}

	scanner := Scanner{
		DB:      db,
		Parser:  parser,
		Artwork: NewArtworkCache(filepath.Join(dir, ".artwork")),
	}

	if _, err := scanner.Scan(dir); err != nil {
		t.Fatalf("Scan returned error: %v", err)
	}

	// 1. Search "mexico" (unaccented) matching track title "Mêxico"
	tracks, err := db.ListTracks(LibraryFilters{Query: "mexico"})
	if err != nil || len(tracks) != 1 {
		t.Fatalf("search 'mexico' failed: err=%v, count=%d", err, len(tracks))
	}

	// 2. Search "edith piaf" (unaccented) matching album artist "Édith Piaf" and track artist "Édith Piaf"
	tracks, err = db.ListTracks(LibraryFilters{Query: "edith piaf"})
	if err != nil || len(tracks) != 1 {
		t.Fatalf("search track 'edith piaf' failed: err=%v, count=%d", err, len(tracks))
	}
	albums, err := db.ListAlbums(LibraryFilters{Query: "edith piaf"})
	if err != nil || len(albums) != 1 {
		t.Fatalf("search album 'edith piaf' failed: err=%v, count=%d", err, len(albums))
	}

	// 3. Search "edit piaf" (unaccented) matching album title "Édit Piaf Best Of"
	albums, err = db.ListAlbums(LibraryFilters{Query: "edit piaf"})
	if err != nil || len(albums) != 1 {
		t.Fatalf("search album 'edit piaf' failed: err=%v, count=%d", err, len(albums))
	}
}

func TestUnaccentSearchWithNullFields(t *testing.T) {
	dir := t.TempDir()
	db, err := Open(filepath.Join(dir, "fantuz.db"))
	if err != nil {
		t.Fatalf("Open returned error: %v", err)
	}
	defer db.Close()

	// Insert track with NULL album_id and missing optional fields
	_, err = db.sql.Exec(`INSERT INTO tracks (file_path, title, artist) VALUES ('/orphan.mp3', 'Mêxico', 'Édith Piaf')`)
	if err != nil {
		t.Fatalf("insert orphan track: %v", err)
	}

	tracks, err := db.ListTracks(LibraryFilters{Query: "mexico"})
	if err != nil || len(tracks) != 1 {
		t.Fatalf("search 'mexico' with NULL fields failed: err=%v, count=%d", err, len(tracks))
	}

	albums, err := db.ListAlbums(LibraryFilters{Query: "mexico"})
	if err != nil {
		t.Fatalf("ListAlbums with NULL fields failed: %v", err)
	}
	_ = albums
}

func TestFilterAndCommonKeywords(t *testing.T) {
	dir := t.TempDir()
	db, err := Open(filepath.Join(dir, "fantuz.db"))
	if err != nil {
		t.Fatalf("Open returned error: %v", err)
	}
	defer db.Close()

	trackFile1 := filepath.Join(dir, "t1.mp3")
	trackFile2 := filepath.Join(dir, "t2.mp3")
	_ = os.WriteFile(trackFile1, []byte("1"), 0o644)
	_ = os.WriteFile(trackFile2, []byte("2"), 0o644)

	parser := &fakeParser{metadataByPath: map[string]TrackMetadata{
		trackFile1: {Title: "T1", Album: "Album A", Keywords: []string{"Live", "Pop"}},
		trackFile2: {Title: "T2", Album: "Album B", Keywords: []string{"Live", "Rock"}},
	}}

	scanner := Scanner{DB: db, Parser: parser, Artwork: NewArtworkCache(filepath.Join(dir, ".artwork"))}
	if _, err := scanner.Scan(dir); err != nil {
		t.Fatalf("Scan: %v", err)
	}

	// Test FilterKeywords: Live keyword matches both Album A and Album B
	albs, err := db.ListAlbums(LibraryFilters{FilterKeywords: []string{"Live"}})
	if err != nil || len(albs) != 2 {
		t.Fatalf("FilterKeywords Live failed: err=%v, count=%d", err, len(albs))
	}

	// Test FilterKeywords: Pop keyword matches only Album A
	albs, err = db.ListAlbums(LibraryFilters{FilterKeywords: []string{"Pop"}})
	if err != nil || len(albs) != 1 || albs[0].Title != "Album A" {
		t.Fatalf("FilterKeywords Pop failed: err=%v, count=%d", err, len(albs))
	}

	// Test ExcludeKeywords: Pop excludes Album A, returns Album B
	albs, err = db.ListAlbums(LibraryFilters{ExcludeKeywords: []string{"Pop"}})
	if err != nil || len(albs) != 1 || albs[0].Title != "Album B" {
		t.Fatalf("ExcludeKeywords Pop failed: err=%v, count=%d", err, len(albs))
	}

	// Test CommonKeywords for Album A and Album B
	common, err := db.CommonKeywords([]int64{1, 2})
	if err != nil || len(common) != 1 || common[0] != "Live" {
		t.Fatalf("CommonKeywords failed: err=%v, common=%#v", err, common)
	}
}


