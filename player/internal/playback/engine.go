package playback

import (
	"errors"
	"strconv"
	"strings"
	"sync"
	"time"

	"fantuz-media-server/player/internal/queue"
	"github.com/fhs/gompd/v2/mpd"
)

var (
	ErrNoTrack       = errors.New("no track in queue")
	ErrInvalidSeek   = errors.New("seek position out of range")
	ErrInvalidVolume = errors.New("volume must be between 0 and 1")
)

type StatusTrack struct {
	ID  int64  `json:"id"`
	URL string `json:"url"`
}

type Status struct {
	Playing         bool         `json:"playing"`
	PositionSeconds float64      `json:"position_seconds"`
	DurationSeconds int          `json:"duration_seconds"`
	Volume          float64      `json:"volume"`
	CurrentTrack    *StatusTrack `json:"current_track"`
	QueueIndex      int          `json:"queue_index"`
	QueueLength     int          `json:"queue_length"`
}

type Engine struct {
	mu              sync.Mutex
	mpdAddr         string
	client          *mpd.Client
	watcher         *mpd.Watcher
	queueTracks     []queue.Track
	onChange        func(Status)
	playing         bool
	positionSeconds float64
	durationSeconds int
	volume          float64
	queueIndex      int
	closeChan       chan struct{}
}

func New(onChange func(Status)) *Engine {
	e := &Engine{
		mpdAddr:     "localhost:6600",
		queueTracks: []queue.Track{},
		onChange:    onChange,
		closeChan:   make(chan struct{}),
	}
	go e.connectionAndIdleLoop()
	go e.positionTickerLoop()
	return e
}

func (e *Engine) InitSpeaker() error {
	// MPD owns the speaker output, so this is a no-op
	return nil
}

func (e *Engine) SetOnChange(onChange func(Status)) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.onChange = onChange
}

func (e *Engine) connectionAndIdleLoop() {
	for {
		select {
		case <-e.closeChan:
			return
		default:
		}

		client, err := mpd.Dial("tcp", e.mpdAddr)
		if err != nil {
			time.Sleep(2 * time.Second)
			continue
		}

		e.mu.Lock()
		e.client = client
		e.mu.Unlock()

		e.updateAndNotify()

		// Monitor subsystem updates reactively via MPD idle watcher
		watcher, err := mpd.NewWatcher("tcp", e.mpdAddr, "", "player", "playlist", "mixer", "options")
		if err == nil {
			e.mu.Lock()
			e.watcher = watcher
			e.mu.Unlock()

			watcherLoop:
			for {
				select {
				case <-e.closeChan:
					watcher.Close()
					break watcherLoop
				case err, ok := <-watcher.Error:
					if !ok || err != nil {
						break watcherLoop
					}
				case _, ok := <-watcher.Event:
					if !ok {
						break watcherLoop
					}
					e.updateAndNotify()
				}
			}
			watcher.Close()

			e.mu.Lock()
			e.watcher = nil
			e.mu.Unlock()
		}

		e.mu.Lock()
		if e.client != nil {
			_ = e.client.Close()
			e.client = nil
		}
		e.mu.Unlock()

		time.Sleep(1 * time.Second)
	}
}

func (e *Engine) positionTickerLoop() {
	ticker := time.NewTicker(250 * time.Millisecond)
	defer ticker.Stop()
	var tickCount int

	for {
		select {
		case <-e.closeChan:
			return
		case <-ticker.C:
			e.mu.Lock()
			if e.playing {
				e.positionSeconds += 0.25
				if e.durationSeconds > 0 && e.positionSeconds > float64(e.durationSeconds) {
					e.positionSeconds = float64(e.durationSeconds)
				}
				e.notifyLocked()
			}
			tickCount++
			if tickCount%40 == 0 && e.client != nil {
				if err := e.client.Ping(); err != nil {
					e.handleErrorLocked(err)
				}
			}
			e.mu.Unlock()
		}
	}
}

func (e *Engine) handleErrorLocked(err error) {
	if err == nil {
		return
	}
	if e.client != nil {
		_ = e.client.Close()
		e.client = nil
	}
	if e.watcher != nil {
		_ = e.watcher.Close()
		e.watcher = nil
	}
}

func (e *Engine) updateAndNotify() {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.client == nil {
		return
	}

	attrs, err := e.client.Status()
	if err != nil {
		e.handleErrorLocked(err)
		return
	}

	e.playing = attrs["state"] == "play"

	if volStr, ok := attrs["volume"]; ok {
		if volInt, err := strconv.Atoi(volStr); err == nil {
			if volInt < 0 {
				e.volume = 0
			} else {
				e.volume = float64(volInt) / 100.0
			}
		}
	}

	if elapsedStr, ok := attrs["elapsed"]; ok {
		if elapsed, err := strconv.ParseFloat(elapsedStr, 64); err == nil {
			e.positionSeconds = elapsed
		}
	} else if timeStr, ok := attrs["time"]; ok {
		parts := strings.Split(timeStr, ":")
		if len(parts) > 0 {
			if elapsed, err := strconv.ParseFloat(parts[0], 64); err == nil {
				e.positionSeconds = elapsed
			}
		}
	}


	duration := 0
	if durationStr, ok := attrs["duration"]; ok {
		if durFloat, err := strconv.ParseFloat(durationStr, 64); err == nil {
			duration = int(durFloat)
		}
	}
	e.durationSeconds = duration

	songIndex := -1
	if songStr, ok := attrs["song"]; ok {
		if idx, err := strconv.Atoi(songStr); err == nil {
			songIndex = idx
		}
	}
	e.queueIndex = songIndex

	e.notifyLocked()
}

func (e *Engine) notifyLocked() {
	if e.onChange == nil {
		return
	}

	var current *StatusTrack
	if e.queueIndex >= 0 && e.queueIndex < len(e.queueTracks) {
		track := e.queueTracks[e.queueIndex]
		current = &StatusTrack{
			ID:  track.ID,
			URL: track.URL,
		}
		if track.DurationSeconds > 0 && e.durationSeconds <= 0 {
			e.durationSeconds = track.DurationSeconds
		}
	}

	status := Status{
		Playing:         e.playing,
		PositionSeconds: e.positionSeconds,
		DurationSeconds: e.durationSeconds,
		Volume:          e.volume,
		CurrentTrack:    current,
		QueueIndex:      e.queueIndex,
		QueueLength:     len(e.queueTracks),
	}

	go e.onChange(status)
}

func (e *Engine) Status() Status {
	e.mu.Lock()
	defer e.mu.Unlock()

	var current *StatusTrack
	if e.queueIndex >= 0 && e.queueIndex < len(e.queueTracks) {
		track := e.queueTracks[e.queueIndex]
		current = &StatusTrack{
			ID:  track.ID,
			URL: track.URL,
		}
	}

	return Status{
		Playing:         e.playing,
		PositionSeconds: e.positionSeconds,
		DurationSeconds: e.durationSeconds,
		Volume:          e.volume,
		CurrentTrack:    current,
		QueueIndex:      e.queueIndex,
		QueueLength:     len(e.queueTracks),
	}
}

func (e *Engine) Queue() ([]queue.Track, int) {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.queueTracks, e.queueIndex
}

func (e *Engine) SetQueue(tracks []queue.Track, replace bool) {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.client == nil {
		return
	}

	if replace {
		if err := e.client.Clear(); err != nil {
			e.handleErrorLocked(err)
			return
		}
		e.queueTracks = []queue.Track{}
		e.queueIndex = -1
		e.positionSeconds = 0
		e.durationSeconds = 0
	}

	for _, track := range tracks {
		if err := e.client.Add(track.URL); err != nil {
			e.handleErrorLocked(err)
			return
		}
		e.queueTracks = append(e.queueTracks, track)
	}

	e.notifyLocked()
}

func (e *Engine) Play() error {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.client == nil {
		return errors.New("mpd not connected")
	}

	if len(e.queueTracks) == 0 {
		return ErrNoTrack
	}

	return e.client.Play(-1)
}

func (e *Engine) PlayIndex(index int) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.client == nil {
		return errors.New("mpd not connected")
	}

	if index < 0 || index >= len(e.queueTracks) {
		return errors.New("index out of range")
	}

	err := e.client.Play(index)
	if err != nil {
		e.handleErrorLocked(err)
	}
	return err
}

func (e *Engine) Pause() error {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.client == nil {
		return errors.New("mpd not connected")
	}

	err := e.client.Pause(true)
	if err != nil {
		e.handleErrorLocked(err)
	}
	return err
}

func (e *Engine) Seek(seconds float64) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.client == nil {
		return errors.New("mpd not connected")
	}

	if len(e.queueTracks) == 0 {
		return ErrNoTrack
	}

	if seconds < 0 {
		return ErrInvalidSeek
	}

	if e.queueIndex >= 0 && e.queueIndex < len(e.queueTracks) {
		track := e.queueTracks[e.queueIndex]
		if track.DurationSeconds > 0 && seconds > float64(track.DurationSeconds) {
			return ErrInvalidSeek
		}
	}

	err := e.client.SeekCur(time.Duration(seconds*float64(time.Second)), false)
	if err != nil {
		e.handleErrorLocked(err)
		return err
	}
	e.positionSeconds = seconds
	e.notifyLocked()
	return nil
}

func (e *Engine) SetVolume(volume float64) error {
	if volume < 0 || volume > 1 {
		return ErrInvalidVolume
	}

	e.mu.Lock()
	defer e.mu.Unlock()

	if e.client == nil {
		return errors.New("mpd not connected")
	}

	err := e.client.SetVolume(int(volume * 100))
	if err != nil {
		e.handleErrorLocked(err)
		return err
	}
	e.volume = volume
	e.notifyLocked()
	return nil
}

func (e *Engine) Next() error {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.client == nil {
		return errors.New("mpd not connected")
	}

	err := e.client.Next()
	if err != nil {
		e.handleErrorLocked(err)
	}
	return err
}

func (e *Engine) Previous() error {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.client == nil {
		return errors.New("mpd not connected")
	}

	err := e.client.Previous()
	if err != nil {
		e.handleErrorLocked(err)
	}
	return err
}

func (e *Engine) Remove(index int) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.client == nil {
		return errors.New("mpd not connected")
	}

	if index < 0 || index >= len(e.queueTracks) {
		return errors.New("index out of range")
	}

	err := e.client.Delete(index, -1)
	if err != nil {
		e.handleErrorLocked(err)
		return err
	}
	e.queueTracks = append(e.queueTracks[:index], e.queueTracks[index+1:]...)
	e.notifyLocked()
	return nil
}

func (e *Engine) Close() {
	close(e.closeChan)
	e.mu.Lock()
	if e.client != nil {
		_ = e.client.Close()
		e.client = nil
	}
	e.mu.Unlock()
}
