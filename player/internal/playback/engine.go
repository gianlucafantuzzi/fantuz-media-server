package playback

import (
	"errors"
	"net/http"
	"sync"
	"time"

	"github.com/gopxl/beep"
	"github.com/gopxl/beep/effects"
	"github.com/gopxl/beep/speaker"

	"fantuz-media-server/player/internal/queue"
)

var (
	ErrNoTrack       = errors.New("no track in queue")
	ErrInvalidSeek   = errors.New("seek position out of range")
	ErrInvalidVolume = errors.New("volume must be between 0 and 1")
)

type Status struct {
	Playing         bool         `json:"playing"`
	PositionSeconds float64      `json:"position_seconds"`
	DurationSeconds int          `json:"duration_seconds"`
	Volume          float64      `json:"volume"`
	CurrentTrack    *queue.Track `json:"current_track"`
	QueueIndex      int          `json:"queue_index"`
	QueueLength     int          `json:"queue_length"`
}

type Engine struct {
	mu          sync.Mutex
	queue       *queue.Queue
	volume      float64
	playing     bool
	paused      bool
	position    time.Duration
	duration    time.Duration
	sampleRate  beep.SampleRate
	httpClient  *http.Client
	onChange    func(Status)
	streamDone  chan struct{}
	loadVersion int
	activeCtrl  *beep.Ctrl
}

func New(onChange func(Status)) *Engine {
	return &Engine{
		queue:      queue.New(nil, 0),
		volume:     1,
		sampleRate: beep.SampleRate(44100),
		httpClient: &http.Client{Timeout: 0},
		onChange:   onChange,
	}
}

func (e *Engine) InitSpeaker() error {
	return speaker.Init(e.sampleRate, e.sampleRate.N(time.Second/10))
}

func (e *Engine) SetOnChange(onChange func(Status)) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.onChange = onChange
}

func (e *Engine) Status() Status {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.statusLocked()
}

func (e *Engine) SetQueue(tracks []queue.Track, replace bool) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if replace {
		e.queue.Replace(tracks)
		e.position = 0
		e.duration = trackDuration(e.queue)
		e.stopPlaybackLocked()
	} else {
		e.queue.Append(tracks)
		if !e.playing && !e.paused {
			e.position = 0
		}
		e.duration = trackDuration(e.queue)
	}
	e.notifyLocked()
}

func (e *Engine) Play() error {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.queue.Len() == 0 {
		return ErrNoTrack
	}
	if e.activeCtrl != nil && e.paused {
		e.paused = false
		e.playing = true
		e.activeCtrl.Paused = false
		e.notifyLocked()
		return nil
	}
	if e.playing && !e.paused {
		return nil
	}
	e.position = 0
	return e.startCurrentLocked()
}

func (e *Engine) PlayIndex(index int) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	if err := e.queue.SetIndex(index); err != nil {
		return err
	}
	e.position = 0
	return e.startCurrentLocked()
}

func (e *Engine) Pause() error {
	e.mu.Lock()
	defer e.mu.Unlock()
	if !e.playing && !e.paused {
		return nil
	}
	e.paused = true
	e.playing = false
	if e.activeCtrl != nil {
		e.activeCtrl.Paused = true
	}
	e.notifyLocked()
	return nil
}

func (e *Engine) Seek(seconds float64) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	if seconds < 0 {
		return ErrInvalidSeek
	}
	track, err := e.queue.Current()
	if err != nil {
		return err
	}
	if track.DurationSeconds > 0 && seconds > float64(track.DurationSeconds) {
		return ErrInvalidSeek
	}
	e.position = time.Duration(seconds * float64(time.Second))
	return e.startCurrentLocked()
}

func (e *Engine) SetVolume(volume float64) error {
	if volume < 0 || volume > 1 {
		return ErrInvalidVolume
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	e.volume = volume
	if e.playing || e.paused {
		return e.startCurrentLocked()
	}
	e.notifyLocked()
	return nil
}

func (e *Engine) Next() error {
	e.mu.Lock()
	defer e.mu.Unlock()
	if _, err := e.queue.Next(); err != nil {
		return err
	}
	e.position = 0
	return e.startCurrentLocked()
}

func (e *Engine) Previous() error {
	e.mu.Lock()
	defer e.mu.Unlock()
	if _, err := e.queue.Previous(); err != nil {
		return err
	}
	e.position = 0
	return e.startCurrentLocked()
}

func (e *Engine) startCurrentLocked() error {
	track, err := e.queue.Current()
	if err != nil {
		return err
	}
	e.stopPlaybackLocked()
	e.playing = true
	e.paused = false
	e.duration = time.Duration(track.DurationSeconds) * time.Second
	version := e.loadVersion + 1
	e.loadVersion = version
	done := make(chan struct{})
	e.streamDone = done
	go e.playTrack(version, track, e.position, done)
	e.notifyLocked()
	return nil
}

func (e *Engine) stopPlaybackLocked() {
	if e.streamDone != nil {
		close(e.streamDone)
		e.streamDone = nil
	}
	e.activeCtrl = nil
	speaker.Clear()
	e.playing = false
}

func (e *Engine) playTrack(version int, track queue.Track, startAt time.Duration, done chan struct{}) {
	seekCloser, format, err := e.openTrack(track.URL)
	if err != nil {
		e.finishTrack(version, false)
		return
	}
	defer seekCloser.Close()

	var stream beep.Streamer = seekCloser
	if format.SampleRate != e.sampleRate {
		stream = beep.Resample(4, format.SampleRate, e.sampleRate, seekCloser)
	}

	if startAt > 0 {
		stream = dropSamples(stream, e.sampleRate.N(startAt))
	}

	ctrl := &beep.Ctrl{Streamer: stream, Paused: false}
	e.mu.Lock()
	if version != e.loadVersion {
		e.mu.Unlock()
		return
	}
	e.activeCtrl = ctrl
	e.mu.Unlock()

	volumeStreamer := &effects.Volume{
		Streamer: ctrl,
		Base:     2,
		Volume:   volumeToBeep(e.volume),
		Silent:   e.volume == 0,
	}

	position := startAt
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	speaker.Play(beep.Seq(volumeStreamer, beep.Callback(func() {
		e.finishTrack(version, true)
	})))

	for {
		select {
		case <-done:
			return
		case <-ticker.C:
			e.mu.Lock()
			if version != e.loadVersion {
				e.mu.Unlock()
				return
			}
			if !e.paused {
				position += time.Second
				e.position = position
			}
			e.notifyLocked()
			e.mu.Unlock()
		}
	}
}

func (e *Engine) finishTrack(version int, advance bool) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if version != e.loadVersion {
		return
	}
	e.activeCtrl = nil
	e.playing = false
	e.paused = false
	e.position = 0
	if advance {
		if _, err := e.queue.Next(); err == nil {
			_ = e.startCurrentLocked()
			return
		}
	}
	e.notifyLocked()
}

func (e *Engine) openTrack(url string) (beep.StreamSeekCloser, beep.Format, error) {
	response, err := e.httpClient.Get(url)
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
	var current *queue.Track
	if err == nil {
		copy := track
		current = &copy
	}
	durationSeconds := int(e.duration / time.Second)
	if current != nil && current.DurationSeconds > 0 {
		durationSeconds = current.DurationSeconds
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
