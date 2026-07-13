package playback

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"fantuz-media-server/player/internal/queue"

	"github.com/fhs/gompd/v2/mpd"
	"github.com/gopxl/beep"
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
		return nil, beep.Format{}, err
	}
	if response.StatusCode != http.StatusOK {
		response.Body.Close()
		return nil, beep.Format{}, errors.New("failed to open track URL")
	}
	return decodeStream(url, response.Header.Get("Content-Type"), response.Body)
}

func (e *Engine) statusLocked() Status {
	track, err := e.queue.Current()
	var current *StatusTrack
	durationSeconds := int(e.duration / time.Second)
	if err == nil {
		current = &StatusTrack{
			ID:  track.ID,
			URL: track.URL,
		}
		if track.DurationSeconds > 0 {
			durationSeconds = track.DurationSeconds
		}
	}
	return Status{
		Playing:         e.playing && !e.paused,
		PositionSeconds: e.position.Seconds(),
		DurationSeconds: durationSeconds,
		Volume:          e.volume,
		CurrentTrack:    current,
		QueueIndex:      e.queue.Index(),
		QueueLength:     e.queue.Len(),
	}
}

func (e *Engine) notifyLocked() {
	if e.onChange == nil {
		return
	}
	status := e.statusLocked()
	go e.onChange(status)
}

func trackDuration(q *queue.Queue) time.Duration {
	track, err := q.Current()
	if err != nil || track.DurationSeconds <= 0 {
		return 0
	}
	return time.Duration(track.DurationSeconds) * time.Second
}

func volumeToBeep(volume float64) float64 {
	if volume <= 0 {
		return -5
	}
	if volume >= 1 {
		return 0
	}
	return -5 + volume*5
}

type sampleDropper struct {
	streamer  beep.Streamer
	remaining int
}

func dropSamples(streamer beep.Streamer, count int) beep.Streamer {
	if count <= 0 {
		return streamer
	}
	return &sampleDropper{streamer: streamer, remaining: count}
}

func (d *sampleDropper) Stream(samples [][2]float64) (int, bool) {
	for d.remaining > 0 {
		discard := make([][2]float64, min(d.remaining, 512))
		n, ok := d.streamer.Stream(discard)
		if n == 0 {
			return 0, ok
		}
		d.remaining -= n
	}
	return d.streamer.Stream(samples)
}

func (d *sampleDropper) Err() error {
	return d.streamer.Err()
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
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
