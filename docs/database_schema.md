# Database Schema

The Fantuz Media Server uses SQLite with six tables. Albums and keywords are normalized so that album metadata and keyword filtering work correctly across tracks. Playlists are user-curated ordered lists of tracks stored separately from the library index. Per-track fields such as artist, composer, and genre remain as plain columns on `tracks` to keep scanning and storage simple.

## Table: `albums`

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` | Unique identifier for the album |
| `title` | `TEXT` | Album title |
| `album_artist` | `TEXT` | Album artist |
| `artwork_path` | `TEXT` | Relative path to the cached artwork file in `.artwork/` |
| `duration_seconds` | `INTEGER` | Total length of the album in whole seconds (sum of all track durations) |

`UNIQUE(title, album_artist)` — one row per album identity (handles same title with different album artists).

## Table: `tracks`

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` | Unique identifier for the track |
| `album_id` | `INTEGER REFERENCES albums(id)` | Foreign key to the album (nullable for files missing album tags) |
| `file_path` | `TEXT UNIQUE` | Absolute path to the playable media file on disk. Used to check if a file was removed or already indexed. |
| `title` | `TEXT` | Track title |
| `artist` | `TEXT` | Track artist |
| `duration_seconds` | `INTEGER` | Length of the track in whole seconds, derived from file metadata at scan time |
| `composer` | `TEXT` | Composer |
| `genre` | `TEXT` | Genre |
| `date` | `INTEGER` | Release year / date |
| `disc_number` | `INTEGER` | Disc number for multi-disc albums |
| `total_discs` | `INTEGER` | Total number of discs in the album |
| `track_number` | `INTEGER` | Track number on the disc |
| `total_tracks` | `INTEGER` | Total number of tracks on the disc |
| `last_modified` | `INTEGER` | Unix timestamp of the file's last modification. Used to determine if a file needs to be rescanned during an update. |

## Table: `keywords`

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` | Unique identifier for the keyword |
| `name` | `TEXT UNIQUE` | Keyword text (comma-separated ID3 values are split and trimmed on ingest) |

## Table: `track_keywords`

| Column | Type | Description |
| :--- | :--- | :--- |
| `track_id` | `INTEGER REFERENCES tracks(id) ON DELETE CASCADE` | Foreign key to the track |
| `keyword_id` | `INTEGER REFERENCES keywords(id) ON DELETE CASCADE` | Foreign key to the keyword |

`PRIMARY KEY (track_id, keyword_id)`

## Table: `playlists`

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` | Unique identifier for the playlist |
| `title` | `TEXT` | Playlist title |
| `duration_seconds` | `INTEGER` | Total length of the playlist in whole seconds (sum of all track durations) |

## Table: `playlist_tracks`

| Column | Type | Description |
| :--- | :--- | :--- |
| `playlist_id` | `INTEGER REFERENCES playlists(id) ON DELETE CASCADE` | Foreign key to the playlist |
| `track_id` | `INTEGER REFERENCES tracks(id) ON DELETE CASCADE` | Foreign key to the track |
| `position` | `INTEGER` | Zero-based position of the track within the playlist |

`PRIMARY KEY (playlist_id, position)`

## Indexing Behavior

When a file is scanned:

1. Upsert the album by `(title, album_artist)` and set `artwork_path` from the extracted artwork (first non-empty artwork wins for a given album).
2. Insert or update the track row and link it via `album_id`.
3. Parse ID3 keywords into individual strings, upsert each into `keywords`, and replace all `track_keywords` rows for that track on rescan.

After all tracks in a scan batch have been processed, recalculate and store `duration_seconds` on each affected album as the sum of `duration_seconds` for its tracks. Deferring this until the end avoids partial totals while tracks are still being extracted.

When a playlist's track list changes (create, update, reorder, or remove tracks), recalculate and store `duration_seconds` on that playlist as the sum of `duration_seconds` for its tracks.

## Query Examples

**Fetch all albums:**
```sql
SELECT id, title, album_artist, artwork_path, duration_seconds
FROM albums
ORDER BY title ASC;
```

**Fetch tracks for an album:**
```sql
SELECT t.*
FROM tracks t
WHERE t.album_id = ?
ORDER BY t.disc_number ASC, t.track_number ASC;
```

**Filter albums by keyword:**
```sql
SELECT DISTINCT a.*
FROM albums a
JOIN tracks t ON t.album_id = a.id
JOIN track_keywords tk ON tk.track_id = t.id
JOIN keywords k ON k.id = tk.keyword_id
WHERE k.name = ?;
```

**Fetch all playlists:**
```sql
SELECT id, title, duration_seconds
FROM playlists
ORDER BY title ASC;
```

**Fetch tracks for a playlist (in order):**
```sql
SELECT t.*
FROM playlist_tracks pt
JOIN tracks t ON t.id = pt.track_id
WHERE pt.playlist_id = ?
ORDER BY pt.position ASC;
```
