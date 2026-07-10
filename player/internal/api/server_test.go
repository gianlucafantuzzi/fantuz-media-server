package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"fantuz-media-server/player/internal/playback"
	"fantuz-media-server/player/internal/queue"
)

type mockPlayer struct {
	status playback.Status
}

func (m *mockPlayer) Status() playback.Status {
	return m.status
}

func (m *mockPlayer) Queue() ([]queue.Track, int) {
	return []queue.Track{}, m.status.QueueIndex
}

func (m *mockPlayer) SetQueue(tracks []queue.Track, replace bool) {
	m.status.QueueLength = len(tracks)
	if len(tracks) > 0 {
		track := tracks[0]
		m.status.CurrentTrack = &playback.StatusTrack{
			ID:  track.ID,
			URL: track.URL,
		}
	}
}

func (m *mockPlayer) Play() error {
	m.status.Playing = true
	return nil
}

func (m *mockPlayer) PlayIndex(index int) error {
	m.status.QueueIndex = index
	m.status.Playing = true
	return nil
}

func (m *mockPlayer) Pause() error {
	m.status.Playing = false
	return nil
}

func (m *mockPlayer) Seek(seconds float64) error {
	m.status.PositionSeconds = seconds
	return nil
}

func (m *mockPlayer) SetVolume(volume float64) error {
	if volume < 0 || volume > 1 {
		return playback.ErrInvalidVolume
	}
	m.status.Volume = volume
	return nil
}

func (m *mockPlayer) Next() error {
	m.status.QueueIndex++
	return nil
}

func (m *mockPlayer) Previous() error {
	m.status.QueueIndex--
	return nil
}

func TestHandleQueueAndPlay(t *testing.T) {
	player := &mockPlayer{}
	server := New(player)

	queueBody := `{"tracks":[{"id":12,"url":"http://example/track.mp3","duration_seconds":180}],"replace":true}`
	queueRequest := httptest.NewRequest(http.MethodPost, "/queue", bytes.NewBufferString(queueBody))
	queueRecorder := httptest.NewRecorder()
	server.Routes().ServeHTTP(queueRecorder, queueRequest)
	if queueRecorder.Code != http.StatusOK {
		t.Fatalf("queue status: %d body=%s", queueRecorder.Code, queueRecorder.Body.String())
	}

	playRequest := httptest.NewRequest(http.MethodPost, "/play", nil)
	playRecorder := httptest.NewRecorder()
	server.Routes().ServeHTTP(playRecorder, playRequest)
	if playRecorder.Code != http.StatusOK {
		t.Fatalf("play status: %d", playRecorder.Code)
	}

	var status playback.Status
	if err := json.Unmarshal(playRecorder.Body.Bytes(), &status); err != nil {
		t.Fatalf("decode status: %v", err)
	}
	if !status.Playing {
		t.Fatal("expected playing status")
	}
}

func TestHandleVolumeValidation(t *testing.T) {
	player := &mockPlayer{status: playback.Status{Volume: 1}}
	server := New(player)

	request := httptest.NewRequest(http.MethodPost, "/volume", bytes.NewBufferString(`{"volume":2}`))
	recorder := httptest.NewRecorder()
	server.Routes().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", recorder.Code)
	}
}

func TestHandleStatus(t *testing.T) {
	player := &mockPlayer{status: playback.Status{Volume: 0.75, QueueLength: 2}}
	server := New(player)

	request := httptest.NewRequest(http.MethodGet, "/status", nil)
	recorder := httptest.NewRecorder()
	server.Routes().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}
}

func TestCORSOptions(t *testing.T) {
	server := New(&mockPlayer{})
	request := httptest.NewRequest(http.MethodOptions, "/play", nil)
	recorder := httptest.NewRecorder()
	server.Routes().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", recorder.Code)
	}
	if recorder.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Fatal("expected CORS header")
	}
}
