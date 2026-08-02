package library

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

func (db *DB) ListAlbums(filters LibraryFilters) ([]Album, error) {
	where, args := albumWhere(filters)
	query := `
		SELECT a.id, a.title, a.album_artist, a.artwork_path, a.duration_seconds
		FROM albums a
	` + where + `
		ORDER BY a.title ASC, a.album_artist ASC
	`

	rows, err := db.sql.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var albums []Album
	for rows.Next() {
		var album Album
		if err := rows.Scan(&album.ID, &album.Title, &album.AlbumArtist, &album.ArtworkPath, &album.DurationSeconds); err != nil {
			return nil, err
		}
		albums = append(albums, album)
	}
	return albums, rows.Err()
}

func (db *DB) ListTracks(filters LibraryFilters) ([]Track, error) {
	where, args := trackWhere(filters)
	query := `
		SELECT t.id, t.album_id, t.file_path, t.title, t.artist, t.duration_seconds, t.composer,
			t.genre, t.date, t.disc_number, t.total_discs, t.track_number, t.total_tracks
		FROM tracks t
		LEFT JOIN albums a ON a.id = t.album_id
	` + where + `
		ORDER BY a.title ASC, t.disc_number ASC, t.track_number ASC, t.title ASC
	`
	return db.queryTracks(query, args...)
}

func (db *DB) AlbumTracks(albumID int64) ([]Track, error) {
	return db.queryTracks(`
		SELECT id, album_id, file_path, title, artist, duration_seconds, composer,
			genre, date, disc_number, total_discs, track_number, total_tracks
		FROM tracks
		WHERE album_id = ?
		ORDER BY disc_number ASC, track_number ASC, title ASC
	`, albumID)
}

func (db *DB) Track(id int64) (Track, error) {
	row := db.sql.QueryRow(`
		SELECT id, album_id, file_path, title, artist, duration_seconds, composer,
			genre, date, disc_number, total_discs, track_number, total_tracks
		FROM tracks
		WHERE id = ?
	`, id)
	track, err := scanTrack(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Track{}, ErrNotFound
		}
		return Track{}, err
	}
	track.Keywords, err = db.trackKeywords(track.ID)
	return track, err
}

func (db *DB) TrackFilePath(id int64) (string, error) {
	var path string
	err := db.sql.QueryRow(`SELECT file_path FROM tracks WHERE id = ?`, id).Scan(&path)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	return path, err
}

func (db *DB) AlbumArtworkPath(id int64) (string, error) {
	var path string
	err := db.sql.QueryRow(`SELECT artwork_path FROM albums WHERE id = ?`, id).Scan(&path)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	return path, err
}

func (db *DB) Reset() error {
	_, err := db.sql.Exec(`
		DELETE FROM playlist_tracks;
		DELETE FROM playlists;
		DELETE FROM track_keywords;
		DELETE FROM keywords;
		DELETE FROM tracks;
		DELETE FROM albums;
	`)
	return err
}

func (db *DB) queryTracks(query string, args ...any) ([]Track, error) {
	rows, err := db.sql.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tracks []Track
	for rows.Next() {
		track, err := scanTrack(rows)
		if err != nil {
			return nil, err
		}
		track.Keywords, err = db.trackKeywords(track.ID)
		if err != nil {
			return nil, err
		}
		tracks = append(tracks, track)
	}
	return tracks, rows.Err()
}

func scanTrack(scanner interface {
	Scan(dest ...any) error
}) (Track, error) {
	var track Track
	var albumID sql.NullInt64
	err := scanner.Scan(
		&track.ID,
		&albumID,
		&track.FilePath,
		&track.Title,
		&track.Artist,
		&track.DurationSeconds,
		&track.Composer,
		&track.Genre,
		&track.Date,
		&track.DiscNumber,
		&track.TotalDiscs,
		&track.TrackNumber,
		&track.TotalTracks,
	)
	if err != nil {
		return Track{}, err
	}
	if albumID.Valid {
		id := albumID.Int64
		track.AlbumID = &id
	}
	return track, nil
}

func (db *DB) trackKeywords(trackID int64) ([]string, error) {
	rows, err := db.sql.Query(`
		SELECT k.name
		FROM keywords k
		JOIN track_keywords tk ON tk.keyword_id = k.id
		WHERE tk.track_id = ?
		ORDER BY k.name ASC
	`, trackID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var keywords []string
	for rows.Next() {
		var keyword string
		if err := rows.Scan(&keyword); err != nil {
			return nil, err
		}
		keywords = append(keywords, keyword)
	}
	return keywords, rows.Err()
}

func albumWhere(filters LibraryFilters) (string, []any) {
	var clauses []string
	var args []any

	if filters.Query != "" {
		clauses = append(clauses, `(
			LOWER(unaccent(COALESCE(a.title, ''))) LIKE LOWER(unaccent(?))
			OR LOWER(unaccent(COALESCE(a.album_artist, ''))) LIKE LOWER(unaccent(?))
		)`)
		like := likeArg(filters.Query)
		args = append(args, like, like)
	}
	addAlbumExists := func(column, value string) {
		if value == "" {
			return
		}
		clauses = append(clauses, fmt.Sprintf(`EXISTS (SELECT 1 FROM tracks t WHERE t.album_id = a.id AND LOWER(unaccent(COALESCE(t.%s, ''))) = LOWER(unaccent(?)))`, column))
		args = append(args, value)
	}
	addAlbumExists("genre", filters.Genre)
	addAlbumExists("artist", filters.Artist)
	addAlbumExists("composer", filters.Composer)
	if filters.AlbumArtist != "" {
		clauses = append(clauses, `LOWER(unaccent(COALESCE(a.album_artist, ''))) = LOWER(unaccent(?))`)
		args = append(args, filters.AlbumArtist)
	}
	if filters.Keyword != "" {
		clauses = append(clauses, `EXISTS (
			SELECT 1
			FROM tracks t
			JOIN track_keywords tk ON tk.track_id = t.id
			JOIN keywords k ON k.id = tk.keyword_id
			WHERE t.album_id = a.id AND LOWER(unaccent(COALESCE(k.name, ''))) = LOWER(unaccent(?))
		)`)
		args = append(args, filters.Keyword)
	}

	if len(clauses) == 0 {
		return "", args
	}
	return " WHERE " + strings.Join(clauses, " AND "), args
}

func trackWhere(filters LibraryFilters) (string, []any) {
	var clauses []string
	var args []any

	if filters.Query != "" {
		clauses = append(clauses, `(
			LOWER(unaccent(COALESCE(t.title, ''))) LIKE LOWER(unaccent(?))
			OR LOWER(unaccent(COALESCE(t.artist, ''))) LIKE LOWER(unaccent(?))
			OR LOWER(unaccent(COALESCE(t.composer, ''))) LIKE LOWER(unaccent(?))
			OR EXISTS (
				SELECT 1
				FROM track_keywords tk
				JOIN keywords k ON k.id = tk.keyword_id
				WHERE tk.track_id = t.id AND LOWER(unaccent(COALESCE(k.name, ''))) LIKE LOWER(unaccent(?))
			)
		)`)
		like := likeArg(filters.Query)
		args = append(args, like, like, like, like)
	}
	addTrackClause := func(column, value string) {
		if value == "" {
			return
		}
		clauses = append(clauses, fmt.Sprintf(`LOWER(unaccent(COALESCE(t.%s, ''))) = LOWER(unaccent(?))`, column))
		args = append(args, value)
	}
	addTrackClause("genre", filters.Genre)
	addTrackClause("artist", filters.Artist)
	addTrackClause("composer", filters.Composer)
	if filters.AlbumArtist != "" {
		clauses = append(clauses, `LOWER(unaccent(COALESCE(a.album_artist, ''))) = LOWER(unaccent(?))`)
		args = append(args, filters.AlbumArtist)
	}
	if filters.Keyword != "" {
		clauses = append(clauses, `EXISTS (
			SELECT 1
			FROM track_keywords tk
			JOIN keywords k ON k.id = tk.keyword_id
			WHERE tk.track_id = t.id AND LOWER(unaccent(COALESCE(k.name, ''))) = LOWER(unaccent(?))
		)`)
		args = append(args, filters.Keyword)
	}

	if len(clauses) == 0 {
		return "", args
	}
	return " WHERE " + strings.Join(clauses, " AND "), args
}

func likeArg(value string) string {
	return "%" + strings.TrimSpace(value) + "%"
}

func (db *DB) ListAllKeywords() ([]string, error) {
	rows, err := db.sql.Query(`SELECT name FROM keywords ORDER BY name ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		list = append(list, name)
	}
	return list, rows.Err()
}

func (db *DB) UpdateTrackKeywordsInDB(trackID int64, keywords []string) error {
	tx, err := db.sql.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if err := replaceKeywords(tx, trackID, keywords); err != nil {
		return err
	}

	return tx.Commit()
}

func (db *DB) GetTracks(ids []int64) ([]Track, error) {
	if len(ids) == 0 {
		return []Track{}, nil
	}
	placeholders := make([]string, len(ids))
	args := make([]any, len(ids))
	for i, id := range ids {
		placeholders[i] = "?"
		args[i] = id
	}
	query := fmt.Sprintf(`
		SELECT id, album_id, file_path, title, artist, duration_seconds, composer,
			genre, date, disc_number, total_discs, track_number, total_tracks
		FROM tracks
		WHERE id IN (%s)
	`, strings.Join(placeholders, ","))
	return db.queryTracks(query, args...)
}

var ErrNotFound = errors.New("not found")
