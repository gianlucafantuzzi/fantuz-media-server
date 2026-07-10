# Player API

The player listens on port `3002` and returns JSON for all control routes. CORS is open for browser clients during local network use.

The player does not talk to the media server directly. The frontend passes streamable track URLs (for example `http://localhost:3001/media/42`) in the queue.

## Status

### `GET /status`

Returns the current playback status.

```json
{
  "playing": false,
  "position_seconds": 0,
  "duration_seconds": 240,
  "volume": 1,
  "current_track": {
    "id": 42,
    "url": "http://localhost:3001/media/42"
  },
  "queue_index": 0,
  "queue_length": 3
}
```

`current_track` is `null` when the queue is empty.

## Queue

### `GET /queue`

Returns the current playback queue containing all tracks in order and the active queue index.

Response:

```json
{
  "tracks": [
    {
      "id": 42,
      "url": "http://localhost:3001/media/42",
      "duration_seconds": 240
    }
  ],
  "index": 0
}
```

### `POST /queue`

Sets or extends the playback queue.

Request body:

```json
{
  "tracks": [
    {
      "id": 42,
      "url": "http://localhost:3001/media/42",
      "duration_seconds": 240
    }
  ],
  "replace": true
}
```

- `replace: true` replaces the entire queue.
- `replace: false` appends tracks to the existing queue.

Response: current status object.

## Playback Control

### `POST /play`

Starts playback or resumes from pause.

Optional request body:

```json
{
  "index": 0
}
```

When `index` is provided, playback starts at that queue position. When omitted, playback starts from the current queue index (or resumes the paused track).

Response: current status object.

### `POST /pause`

Pauses the current track.

Response: current status object.

### `POST /seek`

Seeks within the current track.

Request body:

```json
{
  "position_seconds": 42
}
```

Response: current status object.

### `POST /volume`

Sets playback volume.

Request body:

```json
{
  "volume": 0.8
}
```

`volume` must be between `0` and `1`.

Response: current status object.

### `POST /next`

Moves to the next track in the queue and starts playback.

Response: current status object.

### `POST /previous`

Moves to the previous track in the queue and starts playback.

Response: current status object.

## WebSocket

### `GET /ws`

Upgrades to a WebSocket connection and streams playback status updates.

The server sends the current status immediately after the connection is established, then pushes a new message whenever playback state changes.

Message shape matches the `GET /status` response.

