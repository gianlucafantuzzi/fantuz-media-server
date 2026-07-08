# Server API

The media server listens on port `3001` and returns JSON for all `/api/...` routes. CORS is open for browser clients during local network use.

## Configuration

### `GET /api/config`

Returns the current server configuration.

```json
{
  "media_path": "/Volumes/Music",
  "player_urls": ["http://localhost:3002"]
}
```

### `POST /api/config`

Saves the server configuration to `config.json` beside the running server executable.

Request body:

```json
{
  "media_path": "/Volumes/Music",
  "player_urls": ["http://localhost:3002", "http://player.local:3002"]
}
```

## Scanning

### `POST /api/scan`

Scans `media_path` from the current configuration. Existing unchanged files are skipped.

Response:

```json
{
  "state": "complete",
  "scanned": 12,
  "skipped": 40,
  "failed": 0
}
```

### `POST /api/reset`

Deletes library and playlist data from the database, then rescans if `media_path` is configured.

## Library

### `GET /api/library/albums`

Returns albums in alphabetical order.

Supported query parameters:

- `q`
- `genre`
- `artist`
- `album_artist`
- `composer`
- `keyword`

Example:

```text
GET /api/library/albums?keyword=Live
```

### `GET /api/library/albums/{id}/tracks`

Returns tracks for one album ordered by disc number, track number, and title.

### `POST /api/library/albums/metadata`

Updates the metadata (album title, album artist, artist, composer, and release date/year) for all tracks belonging to the specified album. Updates both physical audio file tags and the database.

Request body:
```json
{
  "album_id": 1,
  "album": "The Spaghetti Incident?",
  "album_artist": "Guns N' Roses",
  "artist": "Guns N' Roses",
  "composer": "Various Artists",
  "date": "1993"
}
```

Response: Status 200 OK.

### `GET /api/library/tracks`

Returns tracks. Supports the same query parameters as `/api/library/albums`.

### `POST /api/library/tracks/metadata`

Updates the metadata (title, artist, album, album artist, composer, and release date/year) for the specified track. Updates both the physical audio file tags and the database.

Request body:
```json
{
  "track_id": 123,
  "title": "Since I Don't Have You",
  "artist": "Guns N' Roses",
  "album": "The Spaghetti Incident?",
  "album_artist": "Guns N' Roses",
  "composer": "Joseph Rock",
  "date": "1993"
}
```

Response: Status 200 OK.

### `GET /api/library/search?q={term}`

Returns both matching albums and tracks.

Response:

```json
{
  "albums": [],
  "tracks": []
}
```

## Playlists

### `GET /api/playlists`

Returns playlist summaries ordered by title.

### `POST /api/playlists`

Creates a playlist and stores its total duration.

Request body:

```json
{
  "title": "Evening",
  "track_ids": [1, 2, 3]
}
```

### `GET /api/playlists/{id}`

Returns one playlist with tracks in playlist order.

### `PUT /api/playlists/{id}`

Replaces the playlist title and ordered track list, then recalculates duration.

Request body:

```json
{
  "title": "Evening",
  "track_ids": [3, 1, 2]
}
```

### `DELETE /api/playlists/{id}`

Deletes a playlist.

## Keywords

### `GET /api/library/keywords`

Returns all keywords stored in the library in alphabetical order.

Response:
```json
[
  "Acoustic",
  "Live",
  "Rock"
]
```

### `POST /api/library/albums/keywords`

Adds one or more keywords to all tracks of the specified albums. Updates both physical audio file tags and the database.

Request body:
```json
{
  "album_ids": [1, 2],
  "keywords": ["Live", "Acoustic"]
}
```

Response: Status 200 OK.

### `DELETE /api/library/albums/keywords`

Removes one or more keywords from all tracks of the specified albums. Updates both physical audio file tags and the database.

Request body:
```json
{
  "album_ids": [1, 2],
  "keywords": ["Live"]
}
```

Response: Status 200 OK.

### `POST /api/library/tracks/keywords`

Adds one or more keywords to a specific track. Updates both the physical audio file tags and the database.

Request body:
```json
{
  "track_id": 123,
  "keywords": ["Favorite"]
}
```

Response: Status 200 OK.

### `DELETE /api/library/tracks/keywords`

Removes one or more keywords from a specific track. Updates both the physical audio file tags and the database.

Request body:
```json
{
  "track_id": 123,
  "keywords": ["Favorite"]
}
```

Response: Status 200 OK.

## Media Files

### `GET /media/{id}`

Serves the raw audio file for a track id.

### `GET /artwork/{id}`

Serves cached artwork for an album id.

## WebSocket

### `GET /ws/scan`

Upgrades to a WebSocket connection and pushes scan status messages.

Message shape:

```json
{
  "state": "running",
  "scanned": 0,
  "skipped": 0,
  "failed": 0
}
```

Possible `state` values include `running`, `resetting`, `reset`, `complete`, and `failed`.
