package library

import (
	"bytes"
	"encoding/binary"
	"testing"
)

func TestKeywordsFromRawSplitsTrimsAndDeduplicates(t *testing.T) {
	keywords := KeywordsFromRaw(map[string]interface{}{
		"KEYWORDS": "Live, Soundtrack, live, Piano",
		"keyw":     []string{"Road trip, Piano"},
		"keyword":  "Late night",
	})

	want := []string{"Live", "Soundtrack", "Piano", "Road trip", "Late night"}
	if len(keywords) != len(want) {
		t.Fatalf("keywords = %#v, want %#v", keywords, want)
	}
	for i := range want {
		if keywords[i] != want[i] {
			t.Fatalf("keywords = %#v, want %#v", keywords, want)
		}
	}
}

func TestDurationFromRawUsesTLENMilliseconds(t *testing.T) {
	got := durationFromRaw(map[string]interface{}{"TLEN": "61001"})
	if got != 62 {
		t.Fatalf("durationFromRaw = %d, want 62", got)
	}
}

func TestDurationFromRawUsesDurationSeconds(t *testing.T) {
	got := durationFromRaw(map[string]interface{}{"duration": "61"})
	if got != 61 {
		t.Fatalf("durationFromRaw = %d, want 61", got)
	}
}

func TestMP3DurationSecondsCountsFrames(t *testing.T) {
	frame := makeMP3Frame(0xfffb9064)
	var data []byte
	for range 38 {
		data = append(data, frame...)
	}

	got := mp3DurationSeconds(data)
	if got != 1 {
		t.Fatalf("mp3DurationSeconds = %d, want 1", got)
	}
}

func TestDurationForFileReadsFLACStreamInfo(t *testing.T) {
	got := durationForFile(bytes.NewReader(makeFLAC(44100, 88200)), nil)
	if got != 2 {
		t.Fatalf("durationForFile FLAC = %d, want 2", got)
	}
}

func TestDurationForFileReadsOggVorbisGranulePosition(t *testing.T) {
	got := durationForFile(bytes.NewReader(makeOggVorbis(48000, 96000)), nil)
	if got != 2 {
		t.Fatalf("durationForFile Ogg Vorbis = %d, want 2", got)
	}
}

func TestDurationForFileReadsMP4MovieHeader(t *testing.T) {
	got := durationForFile(bytes.NewReader(makeMP4(44100, 88200)), nil)
	if got != 2 {
		t.Fatalf("durationForFile MP4 = %d, want 2", got)
	}
}

func TestDurationForFileReadsFLACWithPrependedID3(t *testing.T) {
	flacBytes := makeFLAC(44100, 88200)
	
	// Create an ID3v2 header of 10 bytes plus 4 bytes payload
	id3Header := []byte("ID3\x04\x00\x00\x00\x00\x00\x04") // size: 4
	id3Payload := []byte("test")
	
	fullData := append(id3Header, id3Payload...)
	fullData = append(fullData, flacBytes...)
	
	got := durationForFile(bytes.NewReader(fullData), nil)
	if got != 2 {
		t.Fatalf("durationForFile FLAC with ID3 = %d, want 2", got)
	}
}

func makeMP3Frame(header uint32) []byte {
	frame, ok := parseMP3Frame(header)
	if !ok {
		panic("invalid test frame header")
	}
	data := make([]byte, frame.size)
	binary.BigEndian.PutUint32(data[:4], header)
	return data
}

func makeFLAC(sampleRate, totalSamples uint64) []byte {
	streamInfo := make([]byte, 34)
	value := sampleRate<<44 | totalSamples
	binary.BigEndian.PutUint64(streamInfo[10:18], value)

	data := []byte("fLaC")
	data = append(data, 0x80, 0x00, 0x00, byte(len(streamInfo)))
	data = append(data, streamInfo...)
	return data
}

func makeOggVorbis(sampleRate, totalSamples uint64) []byte {
	identification := make([]byte, 30)
	identification[0] = 1
	copy(identification[1:7], "vorbis")
	identification[11] = 2
	binary.LittleEndian.PutUint32(identification[12:16], uint32(sampleRate))

	return append(oggPage(0, identification), oggPage(totalSamples, nil)...)
}

func oggPage(granule uint64, payload []byte) []byte {
	page := make([]byte, 27)
	copy(page[:4], "OggS")
	binary.LittleEndian.PutUint64(page[6:14], granule)
	page[26] = 1
	page = append(page, byte(len(payload)))
	page = append(page, payload...)
	return page
}

func makeMP4(timescale, duration uint32) []byte {
	mvhd := make([]byte, 20)
	binary.BigEndian.PutUint32(mvhd[12:16], timescale)
	binary.BigEndian.PutUint32(mvhd[16:20], duration)

	return append(atom("ftyp", []byte("M4A \x00\x00\x00\x00")), atom("moov", atom("mvhd", mvhd))...)
}

func atom(name string, payload []byte) []byte {
	data := make([]byte, 8+len(payload))
	binary.BigEndian.PutUint32(data[:4], uint32(len(data)))
	copy(data[4:8], name)
	copy(data[8:], payload)
	return data
}
