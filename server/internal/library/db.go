package library

import (
	"database/sql"
	"errors"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

type DB struct {
	sql *sql.DB
}

func Open(path string) (*DB, error) {
	conn, err := sql.Open("sqlite3", path+"?_foreign_keys=on")
	if err != nil {
		return nil, err
	}

	db := &DB{sql: conn}
	if err := db.Migrate(); err != nil {
		conn.Close()
		return nil, err
	}
	return db, nil
}

func (db *DB) Close() error {
	return db.sql.Close()
}

func (db *DB) Migrate() error {
	_, err := db.sql.Exec(schemaSQL)
	return err
}

func (db *DB) UpsertTrack(meta TrackMetadata, artworkPath string) (int64, int64, error) {
	tx, err := db.sql.Begin()
	if err != nil {
		return 0, 0, err
	}
	defer tx.Rollback()

	albumID, err := upsertAlbum(tx, meta, artworkPath)
	if err != nil {
		return 0, 0, err
	}

	trackID, err := upsertTrack(tx, albumID, meta)
	if err != nil {
		return 0, 0, err
	}

	if err := replaceKeywords(tx, trackID, meta.Keywords); err != nil {
		return 0, 0, err
	}

	if err := tx.Commit(); err != nil {
		return 0, 0, err
	}
	return trackID, albumID, nil
}

func (db *DB) TrackLastModified(path string) (int64, bool, error) {
	var lastModified int64
	err := db.sql.QueryRow(`SELECT last_modified FROM tracks WHERE file_path = ?`, path).Scan(&lastModified)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, false, nil
		}
		return 0, false, err
	}
	return lastModified, true, nil
}

func (db *DB) RecalculateAlbumDurations(albumIDs []int64) error {
	if len(albumIDs) == 0 {
		return nil
	}

	tx, err := db.sql.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	seen := make(map[int64]bool, len(albumIDs))
	for _, albumID := range albumIDs {
		if albumID == 0 || seen[albumID] {
			continue
		}
		seen[albumID] = true

		_, err := tx.Exec(`
			UPDATE albums
			SET duration_seconds = (
				SELECT COALESCE(SUM(duration_seconds), 0)
				FROM tracks
				WHERE album_id = ?
			)
			WHERE id = ?
		`, albumID, albumID)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (db *DB) RemoveEmptyAlbums() error {
	_, err := db.sql.Exec(`
		DELETE FROM albums
		WHERE NOT EXISTS (
			SELECT 1 FROM tracks WHERE tracks.album_id = albums.id
		)
	`)
	return err
}

func upsertAlbum(tx *sql.Tx, meta TrackMetadata, artworkPath string) (int64, error) {
	if meta.Album == "" && meta.AlbumArtist == "" {
		return 0, nil
	}

	_, err := tx.Exec(`
		INSERT INTO albums (title, album_artist, artwork_path, duration_seconds)
		VALUES (?, ?, ?, 0)
		ON CONFLICT(title, album_artist) DO UPDATE SET
			artwork_path = CASE
				WHEN albums.artwork_path = '' AND excluded.artwork_path <> '' THEN excluded.artwork_path
				ELSE albums.artwork_path
			END
	`, meta.Album, meta.AlbumArtist, artworkPath)
	if err != nil {
		return 0, err
	}

	var id int64
	err = tx.QueryRow(`SELECT id FROM albums WHERE title = ? AND album_artist = ?`, meta.Album, meta.AlbumArtist).Scan(&id)
	return id, err
}

func upsertTrack(tx *sql.Tx, albumID int64, meta TrackMetadata) (int64, error) {
	album := sql.NullInt64{Int64: albumID, Valid: albumID != 0}

	_, err := tx.Exec(`
		INSERT INTO tracks (
			album_id, file_path, title, artist, duration_seconds, composer, genre, date,
			disc_number, total_discs, track_number, total_tracks, last_modified
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(file_path) DO UPDATE SET
			album_id = excluded.album_id,
			title = excluded.title,
			artist = excluded.artist,
			duration_seconds = excluded.duration_seconds,
			composer = excluded.composer,
			genre = excluded.genre,
			date = excluded.date,
			disc_number = excluded.disc_number,
			total_discs = excluded.total_discs,
			track_number = excluded.track_number,
			total_tracks = excluded.total_tracks,
			last_modified = excluded.last_modified
	`, album, meta.FilePath, meta.Title, meta.Artist, meta.DurationSeconds, meta.Composer, meta.Genre, meta.Date,
		meta.DiscNumber, meta.TotalDiscs, meta.TrackNumber, meta.TotalTracks, meta.LastModified)
	if err != nil {
		return 0, err
	}

	var id int64
	err = tx.QueryRow(`SELECT id FROM tracks WHERE file_path = ?`, meta.FilePath).Scan(&id)
	return id, err
}

func replaceKeywords(tx *sql.Tx, trackID int64, keywords []string) error {
	if _, err := tx.Exec(`DELETE FROM track_keywords WHERE track_id = ?`, trackID); err != nil {
		return err
	}

	for _, keyword := range keywords {
		_, err := tx.Exec(`
			INSERT INTO keywords (name)
			VALUES (?)
			ON CONFLICT(name) DO NOTHING
		`, keyword)
		if err != nil {
			return err
		}

		var keywordID int64
		if err := tx.QueryRow(`SELECT id FROM keywords WHERE name = ?`, keyword).Scan(&keywordID); err != nil {
			return err
		}

		_, err = tx.Exec(`
			INSERT INTO track_keywords (track_id, keyword_id)
			VALUES (?, ?)
			ON CONFLICT(track_id, keyword_id) DO NOTHING
		`, trackID, keywordID)
		if err != nil {
			return err
		}
	}
	return nil
}

func unixModTime(modTime time.Time) int64 {
	return modTime.Unix()
}

const schemaSQL = `
CREATE TABLE IF NOT EXISTS albums (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	title TEXT NOT NULL,
	album_artist TEXT NOT NULL,
	artwork_path TEXT NOT NULL DEFAULT '',
	duration_seconds INTEGER NOT NULL DEFAULT 0,
	UNIQUE(title, album_artist)
);

CREATE TABLE IF NOT EXISTS tracks (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	album_id INTEGER REFERENCES albums(id),
	file_path TEXT NOT NULL UNIQUE,
	title TEXT NOT NULL DEFAULT '',
	artist TEXT NOT NULL DEFAULT '',
	duration_seconds INTEGER NOT NULL DEFAULT 0,
	composer TEXT NOT NULL DEFAULT '',
	genre TEXT NOT NULL DEFAULT '',
	date INTEGER NOT NULL DEFAULT 0,
	disc_number INTEGER NOT NULL DEFAULT 0,
	total_discs INTEGER NOT NULL DEFAULT 0,
	track_number INTEGER NOT NULL DEFAULT 0,
	total_tracks INTEGER NOT NULL DEFAULT 0,
	last_modified INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS keywords (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS track_keywords (
	track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
	keyword_id INTEGER NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
	PRIMARY KEY (track_id, keyword_id)
);

CREATE TABLE IF NOT EXISTS playlists (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	title TEXT NOT NULL,
	duration_seconds INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS playlist_tracks (
	playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
	track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
	position INTEGER NOT NULL,
	PRIMARY KEY (playlist_id, position)
);

CREATE INDEX IF NOT EXISTS idx_tracks_album_id ON tracks(album_id);
CREATE INDEX IF NOT EXISTS idx_track_keywords_keyword_id ON track_keywords(keyword_id);
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track_id ON playlist_tracks(track_id);
`
