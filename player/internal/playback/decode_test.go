package playback

import "testing"

func TestSniffFormat(t *testing.T) {
	tests := []struct {
		name   string
		header []byte
		want   audioFormat
	}{
		{
			name:   "flac",
			header: []byte("fLaC\x00\x00\x00"),
			want:   formatFLAC,
		},
		{
			name:   "wav",
			header: []byte("RIFF\x00\x00\x00\x00WAVE"),
			want:   formatWAV,
		},
		{
			name:   "ogg",
			header: []byte("OggS\x00\x00\x00"),
			want:   formatOGG,
		},
		{
			name:   "mp3 id3",
			header: []byte("ID3\x04\x00\x00"),
			want:   formatMP3,
		},
		{
			name:   "mp3 frame sync",
			header: []byte{0xFF, 0xFB, 0x90, 0x00},
			want:   formatMP3,
		},
		{
			name:   "unknown",
			header: []byte{0x00, 0x01, 0x02, 0x03},
			want:   formatUnknown,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := sniffFormat(test.header); got != test.want {
				t.Fatalf("sniffFormat() = %v, want %v", got, test.want)
			}
		})
	}
}

func TestFormatFromContentType(t *testing.T) {
	if formatFromContentType("audio/flac; charset=binary") != formatFLAC {
		t.Fatal("expected flac content type")
	}
	if formatFromContentType("audio/mpeg") != formatMP3 {
		t.Fatal("expected mpeg content type")
	}
}

func TestFormatFromURLFallback(t *testing.T) {
	if formatFromURL("http://localhost:3001/media/1") != formatUnknown {
		t.Fatal("expected unknown format for extensionless URL")
	}
	if formatFromURL("http://example/track.flac") != formatFLAC {
		t.Fatal("expected flac from URL")
	}
}
