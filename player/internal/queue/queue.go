package queue

import "errors"

var ErrEmpty = errors.New("queue is empty")

type Track struct {
	URL             string `json:"url"`
	Title           string `json:"title"`
	Artist          string `json:"artist"`
	Composer        string `json:"composer,omitempty"`
	Date            int    `json:"date,omitempty"`
	ArtworkURL      string `json:"artwork_url,omitempty"`
	DurationSeconds int    `json:"duration_seconds"`
}

type Queue struct {
	items []Track
	index int
}

func New(items []Track, index int) *Queue {
	copied := append([]Track(nil), items...)
	if len(copied) == 0 {
		return &Queue{}
	}
	if index < 0 {
		index = 0
	}
	if index >= len(copied) {
		index = len(copied) - 1
	}
	return &Queue{items: copied, index: index}
}

func (q *Queue) Replace(items []Track) {
	q.items = append([]Track(nil), items...)
	q.index = 0
	if len(q.items) == 0 {
		q.index = 0
	}
}

func (q *Queue) Append(items []Track) {
	q.items = append(q.items, items...)
}

func (q *Queue) Len() int {
	return len(q.items)
}

func (q *Queue) Index() int {
	return q.index
}

func (q *Queue) Items() []Track {
	return append([]Track(nil), q.items...)
}

func (q *Queue) Current() (Track, error) {
	if len(q.items) == 0 {
		return Track{}, ErrEmpty
	}
	return q.items[q.index], nil
}

func (q *Queue) SetIndex(index int) error {
	if len(q.items) == 0 {
		return ErrEmpty
	}
	if index < 0 || index >= len(q.items) {
		return errors.New("queue index out of range")
	}
	q.index = index
	return nil
}

func (q *Queue) Next() (Track, error) {
	if len(q.items) == 0 {
		return Track{}, ErrEmpty
	}
	if q.index+1 >= len(q.items) {
		return Track{}, ErrEmpty
	}
	q.index++
	return q.items[q.index], nil
}

func (q *Queue) Previous() (Track, error) {
	if len(q.items) == 0 {
		return Track{}, ErrEmpty
	}
	if q.index == 0 {
		return Track{}, ErrEmpty
	}
	q.index--
	return q.items[q.index], nil
}
