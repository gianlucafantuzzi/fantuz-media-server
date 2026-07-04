package library

import (
	"os"
	"path/filepath"
	"testing"
)

func TestWriteKeywordsMP3(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "tagger-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	tmpFile := filepath.Join(tmpDir, "test.mp3")
	frame := makeMP3Frame(0xfffb9064)
	if err := os.WriteFile(tmpFile, frame, 0644); err != nil {
		t.Fatal(err)
	}

	keywords := []string{"Pop", "80s", "Live"}
	if err := WriteKeywords(tmpFile, keywords); err != nil {
		t.Fatal(err)
	}

	var parser TagParser
	meta, err := parser.Parse(tmpFile)
	if err != nil {
		t.Fatal(err)
	}

	if len(meta.Keywords) != 3 {
		t.Fatalf("expected 3 keywords, got %d: %v", len(meta.Keywords), meta.Keywords)
	}
	for i, kw := range keywords {
		if meta.Keywords[i] != kw {
			t.Errorf("expected keyword %d to be %s, got %s", i, kw, meta.Keywords[i])
		}
	}
}

func TestWriteKeywordsFLAC(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "tagger-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	tmpFile := filepath.Join(tmpDir, "test.flac")
	flacBytes := makeFLAC(44100, 88200)
	flacBytes = append(flacBytes, 0xFF, 0xF8)
	if err := os.WriteFile(tmpFile, flacBytes, 0644); err != nil {
		t.Fatal(err)
	}

	keywords := []string{"Ambient", "Chillout"}
	if err := WriteKeywords(tmpFile, keywords); err != nil {
		t.Fatal(err)
	}

	var parser TagParser
	meta, err := parser.Parse(tmpFile)
	if err != nil {
		t.Fatal(err)
	}

	if len(meta.Keywords) != 2 {
		t.Fatalf("expected 2 keywords, got %d: %v", len(meta.Keywords), meta.Keywords)
	}
	for i, kw := range keywords {
		if meta.Keywords[i] != kw {
			t.Errorf("expected keyword %d to be %s, got %s", i, kw, meta.Keywords[i])
		}
	}
}
