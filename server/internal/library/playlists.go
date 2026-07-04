package library

import (
	"database/sql"
	"errors"
)

func (db *DB) ListPlaylists() ([]Playlist, error) {
	rows, err := db.sql.Query(`
		SELECT id, title, duration_seconds
		FROM playlists
		ORDER BY title ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var playlists []Playlist
	for rows.Next() {
		var playlist Playlist
		if err := rows.Scan(&playlist.ID, &playlist.Title, &playlist.DurationSeconds); err != nil {
			return nil, err
		}
		playlists = append(playlists, playlist)
	}
	return playlists, rows.Err()
}

func (db *DB) GetPlaylist(id int64) (Playlist, error) {
	var playlist Playlist
	err := db.sql.QueryRow(`
		SELECT id, title, duration_seconds
		FROM playlists
		WHERE id = ?
	`, id).Scan(&playlist.ID, &playlist.Title, &playlist.DurationSeconds)
	if errors.Is(err, sql.ErrNoRows) {
		return Playlist{}, ErrNotFound
	}
	if err != nil {
		return Playlist{}, err
	}

	playlist.Tracks, err = db.queryTracks(`
		SELECT t.id, t.album_id, t.file_path, t.title, t.artist, t.duration_seconds, t.composer,
			t.genre, t.date, t.disc_number, t.total_discs, t.track_number, t.total_tracks
		FROM playlist_tracks pt
		JOIN tracks t ON t.id = pt.track_id
		WHERE pt.playlist_id = ?
		ORDER BY pt.position ASC
	`, id)
	if err != nil {
		return Playlist{}, err
	}
	return playlist, nil
}

func (db *DB) CreatePlaylist(title string, trackIDs []int64) (Playlist, error) {
	tx, err := db.sql.Begin()
	if err != nil {
		return Playlist{}, err
	}
	defer tx.Rollback()

	result, err := tx.Exec(`INSERT INTO playlists (title, duration_seconds) VALUES (?, 0)`, title)
	if err != nil {
		return Playlist{}, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return Playlist{}, err
	}
	if err := setPlaylistTracks(tx, id, trackIDs); err != nil {
		return Playlist{}, err
	}
	if err := recalculatePlaylistDuration(tx, id); err != nil {
		return Playlist{}, err
	}
	if err := tx.Commit(); err != nil {
		return Playlist{}, err
	}
	return db.GetPlaylist(id)
}

func (db *DB) UpdatePlaylist(id int64, title string, trackIDs []int64) (Playlist, error) {
	tx, err := db.sql.Begin()
	if err != nil {
		return Playlist{}, err
	}
	defer tx.Rollback()

	result, err := tx.Exec(`UPDATE playlists SET title = ? WHERE id = ?`, title, id)
	if err != nil {
		return Playlist{}, err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return Playlist{}, err
	}
	if affected == 0 {
		return Playlist{}, ErrNotFound
	}
	if err := setPlaylistTracks(tx, id, trackIDs); err != nil {
		return Playlist{}, err
	}
	if err := recalculatePlaylistDuration(tx, id); err != nil {
		return Playlist{}, err
	}
	if err := tx.Commit(); err != nil {
		return Playlist{}, err
	}
	return db.GetPlaylist(id)
}

func (db *DB) DeletePlaylist(id int64) error {
	result, err := db.sql.Exec(`DELETE FROM playlists WHERE id = ?`, id)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrNotFound
	}
	return nil
}

func setPlaylistTracks(tx *sql.Tx, playlistID int64, trackIDs []int64) error {
	if _, err := tx.Exec(`DELETE FROM playlist_tracks WHERE playlist_id = ?`, playlistID); err != nil {
		return err
	}
	for position, trackID := range trackIDs {
		_, err := tx.Exec(`
			INSERT INTO playlist_tracks (playlist_id, track_id, position)
			VALUES (?, ?, ?)
		`, playlistID, trackID, position)
		if err != nil {
			return err
		}
	}
	return nil
}

func recalculatePlaylistDuration(tx *sql.Tx, playlistID int64) error {
	_, err := tx.Exec(`
		UPDATE playlists
		SET duration_seconds = (
			SELECT COALESCE(SUM(t.duration_seconds), 0)
			FROM playlist_tracks pt
			JOIN tracks t ON t.id = pt.track_id
			WHERE pt.playlist_id = ?
		)
		WHERE id = ?
	`, playlistID, playlistID)
	return err
}
