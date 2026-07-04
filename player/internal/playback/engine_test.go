package playback

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/gopxl/beep"

	"fantuz-media-server/player/internal/queue"
)

func TestSetQueueNotifiesWithoutDeadlock(t *testing.T) {
	statePath := filepath.Join(t.TempDir(), "player_state.json")
	engine := New(statePath, nil)

	done := make(chan struct{}, 1)
	engine.SetOnChange(func(Status) {
		engine.Status()
		done <- struct{}{}
	})

	engine.SetQueue([]queue.Track{{URL: "http://example/track.flac", Title: "Test"}}, true)

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("status callback did not complete")
	}
}

func TestSetQueueAppendKeepsCurrentPlaybackRunning(t *testing.T) {
	engine := New("", nil)
	engine.queue.Replace([]queue.Track{{URL: "http://example/current.mp3", Title: "Current"}})
	engine.playing = true
	engine.paused = false
	engine.activeCtrl = &beep.Ctrl{}

	engine.SetQueue([]queue.Track{{URL: "http://example/next.mp3", Title: "Next"}}, false)

	if !engine.playing {
		t.Fatal("expected playback to continue after appending to the queue")
	}
	if engine.paused {
		t.Fatal("expected playback to remain unpaused after appending to the queue")
	}
	if engine.activeCtrl == nil {
		t.Fatal("expected active control to remain attached after appending to the queue")
	}
	if engine.queue.Len() != 2 {
		t.Fatalf("expected queue length 2, got %d", engine.queue.Len())
	}
}

func TestSetQueueReplaceWhilePlayingKeepsCurrentPlaybackRunning(t *testing.T) {
	engine := New("", nil)
	engine.queue.Replace([]queue.Track{{URL: "http://example/current.mp3", Title: "Current"}})
	engine.playing = true
	engine.paused = false
	engine.activeCtrl = &beep.Ctrl{}

	engine.SetQueue([]queue.Track{{URL: "http://example/next.mp3", Title: "Next"}}, true)

	if !engine.playing {
		t.Fatal("expected playback to continue after queueing a track while already playing")
	}
	if engine.activeCtrl == nil {
		t.Fatal("expected active control to remain attached after queueing a track while already playing")
	}
	if engine.queue.Len() != 2 {
		t.Fatalf("expected queue length 2, got %d", engine.queue.Len())
	}
}
