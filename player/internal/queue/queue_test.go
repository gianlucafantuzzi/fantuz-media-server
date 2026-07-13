package queue

import "testing"

func TestQueueReplaceAndCurrent(t *testing.T) {
	q := New(nil, 0)
	if _, err := q.Current(); err != ErrEmpty {
		t.Fatalf("expected empty queue error, got %v", err)
	}

	q.Replace([]Track{{URL: "a"}, {URL: "b"}})
	track, err := q.Current()
	if err != nil {
		t.Fatalf("current: %v", err)
	}
	if track.URL != "a" {
		t.Fatalf("expected first track, got %+v", track)
	}
}

func TestQueueNavigation(t *testing.T) {
	q := New([]Track{{URL: "a"}, {URL: "b"}, {URL: "c"}}, 0)

	if _, err := q.Previous(); err == nil {
		t.Fatal("expected error at start of queue")
	}

	next, err := q.Next()
	if err != nil || next.URL != "b" {
		t.Fatalf("next: %+v %v", next, err)
	}

	prev, err := q.Previous()
	if err != nil || prev.URL != "a" {
		t.Fatalf("previous: %+v %v", prev, err)
	}

	if err := q.SetIndex(2); err != nil {
		t.Fatalf("set index: %v", err)
	}
	if err := q.SetIndex(3); err == nil {
		t.Fatal("expected out of range error")
	}
}

func TestQueueAppend(t *testing.T) {
	q := New([]Track{{URL: "a"}}, 0)
	q.Append([]Track{{URL: "b"}})
	if q.Len() != 2 {
		t.Fatalf("expected length 2, got %d", q.Len())
	}
}
