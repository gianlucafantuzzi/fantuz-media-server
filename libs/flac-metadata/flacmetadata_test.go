package flacmetadata

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func write3ByteLen(buf *bytes.Buffer, val uint32) {
	lenBytes := make([]byte, 4)
	binary.BigEndian.PutUint32(lenBytes, val)
	buf.Write(lenBytes[1:])
}

func buildMockFLAC(comments map[string]string, pictureData []byte) []byte {
	var buf bytes.Buffer
	buf.WriteString("fLaC")

	// 1. STREAMINFO block (type 0, length 34). Not last yet.
	streamInfo := make([]byte, 34)
	buf.WriteByte(BlockTypeStreamInfo) // Header (isLast=false, type=0)
	write3ByteLen(&buf, 34)
	buf.Write(streamInfo)

	// 2. VORBIS_COMMENT block (type 4)
	var commentBuf bytes.Buffer
	vendor := "reference libFLAC 1.4.3"
	binary.Write(&commentBuf, binary.LittleEndian, uint32(len(vendor)))
	commentBuf.WriteString(vendor)

	binary.Write(&commentBuf, binary.LittleEndian, uint32(len(comments)))
	for k, v := range comments {
		entry := strings.ToUpper(k) + "=" + v
		binary.Write(&commentBuf, binary.LittleEndian, uint32(len(entry)))
		commentBuf.WriteString(entry)
	}

	commentPayload := commentBuf.Bytes()
	commentHeader := byte(BlockTypeVorbisComment)
	if len(pictureData) == 0 {
		commentHeader |= 0x80 // Last block if no picture
	}
	buf.WriteByte(commentHeader)
	write3ByteLen(&buf, uint32(len(commentPayload)))
	buf.Write(commentPayload)

	// 3. PICTURE block (type 6) if provided
	if len(pictureData) > 0 {
		var picBuf bytes.Buffer
		binary.Write(&picBuf, binary.BigEndian, uint32(3)) // Front cover
		mimeType := "image/png"
		binary.Write(&picBuf, binary.BigEndian, uint32(len(mimeType)))
		picBuf.WriteString(mimeType)
		binary.Write(&picBuf, binary.BigEndian, uint32(0)) // 0 description
		binary.Write(&picBuf, binary.BigEndian, uint32(0)) // width
		binary.Write(&picBuf, binary.BigEndian, uint32(0)) // height
		binary.Write(&picBuf, binary.BigEndian, uint32(0)) // depth
		binary.Write(&picBuf, binary.BigEndian, uint32(0)) // colors
		binary.Write(&picBuf, binary.BigEndian, uint32(len(pictureData)))
		picBuf.Write(pictureData)

		picPayload := picBuf.Bytes()
		buf.WriteByte(BlockTypePicture | 0x80) // Last block
		write3ByteLen(&buf, uint32(len(picPayload)))
		buf.Write(picPayload)
	}

	// 4. Dummy audio payload
	buf.WriteString("dummy audio frames data")

	return buf.Bytes()
}

func TestReadCommentsJSON(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "flacmetadata-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	mockComments := map[string]string{
		"title":  "Surriento",
		"artist": "Juan Diego",
		"date":   "2015",
	}
	flacBytes := buildMockFLAC(mockComments, nil)
	filePath := filepath.Join(tempDir, "test.flac")
	if err := os.WriteFile(filePath, flacBytes, 0644); err != nil {
		t.Fatal(err)
	}

	jsonStr, err := ReadCommentsJSON(filePath)
	if err != nil {
		t.Fatalf("ReadCommentsJSON failed: %v", err)
	}

	var parsed map[string]string
	if err := json.Unmarshal([]byte(jsonStr), &parsed); err != nil {
		t.Fatalf("unmarshal returned JSON failed: %v", err)
	}

	for k, v := range mockComments {
		if parsed[k] != v {
			t.Errorf("expected tag %s = %s, got %s", k, v, parsed[k])
		}
	}
}

func TestExtractPicture(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "flacmetadata-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	mockImg := []byte("PNGfakeimagedata")
	flacBytes := buildMockFLAC(map[string]string{"title": "Surriento"}, mockImg)
	filePath := filepath.Join(tempDir, "test.flac")
	if err := os.WriteFile(filePath, flacBytes, 0644); err != nil {
		t.Fatal(err)
	}

	outDir := filepath.Join(tempDir, "out")
	savedPath, err := ExtractPicture(filePath, outDir)
	if err != nil {
		t.Fatalf("ExtractPicture failed: %v", err)
	}

	if filepath.Ext(savedPath) != ".png" {
		t.Errorf("expected extension .png, got %s", filepath.Ext(savedPath))
	}

	extractedBytes, err := os.ReadFile(savedPath)
	if err != nil {
		t.Fatal(err)
	}

	if !bytes.Equal(extractedBytes, mockImg) {
		t.Errorf("extracted image bytes did not match original")
	}
}

func TestWriteCommentsJSON(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "flacmetadata-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	mockComments := map[string]string{
		"title":  "Surriento",
		"artist": "Juan Diego",
		"date":   "2015",
	}
	flacBytes := buildMockFLAC(mockComments, nil)
	filePath := filepath.Join(tempDir, "test.flac")
	if err := os.WriteFile(filePath, flacBytes, 0644); err != nil {
		t.Fatal(err)
	}

	updates := map[string]string{
		"artist":   "Flórez",
		"composer": "Curtis",
	}
	updatesJSON, _ := json.Marshal(updates)

	if err := WriteCommentsJSON(filePath, string(updatesJSON)); err != nil {
		t.Fatalf("WriteCommentsJSON failed: %v", err)
	}

	jsonStr, err := ReadCommentsJSON(filePath)
	if err != nil {
		t.Fatal(err)
	}

	var parsed map[string]string
	json.Unmarshal([]byte(jsonStr), &parsed)

	// Checked preserved and updated
	if parsed["title"] != "Surriento" {
		t.Errorf("expected title to be preserved, got %s", parsed["title"])
	}
	if parsed["artist"] != "Flórez" {
		t.Errorf("expected artist to be updated, got %s", parsed["artist"])
	}
	if parsed["composer"] != "Curtis" {
		t.Errorf("expected composer to be added, got %s", parsed["composer"])
	}
}

func TestWritePicture(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "flacmetadata-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	flacBytes := buildMockFLAC(map[string]string{"title": "Surriento"}, nil)
	filePath := filepath.Join(tempDir, "test.flac")
	if err := os.WriteFile(filePath, flacBytes, 0644); err != nil {
		t.Fatal(err)
	}

	newImgBytes := []byte("PNGnewfakeimagedata")
	newImgPath := filepath.Join(tempDir, "cover.png")
	if err := os.WriteFile(newImgPath, newImgBytes, 0644); err != nil {
		t.Fatal(err)
	}

	if err := WritePicture(filePath, newImgPath); err != nil {
		t.Fatalf("WritePicture failed: %v", err)
	}

	extracted, err := ExtractPicture(filePath, filepath.Join(tempDir, "out"))
	if err != nil {
		t.Fatal(err)
	}

	extractedBytes, _ := os.ReadFile(extracted)
	if !bytes.Equal(extractedBytes, newImgBytes) {
		t.Errorf("extracted image bytes after WritePicture did not match new image")
	}
}

func TestVerifyDirectory(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "flacmetadata-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	// Valid file
	flacBytes := buildMockFLAC(map[string]string{"title": "Surriento"}, nil)
	validFile := filepath.Join(tempDir, "valid.flac")
	os.WriteFile(validFile, flacBytes, 0644)

	// Invalid file
	invalidFile := filepath.Join(tempDir, "invalid.flac")
	os.WriteFile(invalidFile, []byte("not a flac file"), 0644)

	// Non-flac file (ignored)
	os.WriteFile(filepath.Join(tempDir, "other.txt"), []byte("text"), 0644)

	failing, err := VerifyDirectory(tempDir)
	if err != nil {
		t.Fatal(err)
	}

	if len(failing) != 1 || failing[0] != invalidFile {
		t.Errorf("expected failing list to contain only %s, got %v", invalidFile, failing)
	}
}

func TestVerifyNonFLACReturnsError(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "flacmetadata-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	filePath := filepath.Join(tempDir, "notflac.flac")
	os.WriteFile(filePath, []byte("MP3fakeheader"), 0644)

	_, err = ReadCommentsJSON(filePath)
	if err == nil {
		t.Error("expected error for non-FLAC file, got nil")
	}
}
