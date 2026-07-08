package library

import (
	"encoding/json"
	"errors"
	"strings"

	"github.com/bogem/id3v2/v2"
	"fantuz-media-server/libs/flac-metadata"
)

// WriteKeywords writes the list of keywords to the physical audio file metadata tags.
// Supports MP3 (via ID3v2 TXXX:KEYWORDS) and FLAC (via Vorbis Comments).
func WriteKeywords(filePath string, keywords []string) error {
	lowerPath := strings.ToLower(filePath)
	if strings.HasSuffix(lowerPath, ".mp3") {
		return writeMP3Keywords(filePath, keywords)
	} else if strings.HasSuffix(lowerPath, ".flac") {
		return writeFLACKeywords(filePath, keywords)
	}
	return errors.New("unsupported file format for writing keywords")
}

func writeMP3Keywords(filePath string, keywords []string) error {
	tag, err := id3v2.Open(filePath, id3v2.Options{Parse: true})
	if err != nil {
		return err
	}
	defer tag.Close()

	// Prepare user-defined text frame (TXXX) with description "Keywords"
	val := strings.Join(keywords, ", ")
	userFrame := id3v2.UserDefinedTextFrame{
		Encoding:    id3v2.EncodingUTF8,
		Description: "Keywords",
		Value:       val,
	}
	tag.AddUserDefinedTextFrame(userFrame)

	return tag.Save()
}

func writeFLACKeywords(filePath string, keywords []string) error {
	val := strings.Join(keywords, ", ")
	updates := map[string]string{
		"keywords": val,
	}
	jsonData, err := json.Marshal(updates)
	if err != nil {
		return err
	}
	return flacmetadata.WriteCommentsJSON(filePath, string(jsonData))
}

// WriteMetadataFields writes multiple metadata tags (album, album_artist, artist, composer, date)
// to the physical audio file metadata tags.
func WriteMetadataFields(filePath string, fields map[string]string) error {
	lowerPath := strings.ToLower(filePath)
	if strings.HasSuffix(lowerPath, ".mp3") {
		return writeMP3MetadataFields(filePath, fields)
	} else if strings.HasSuffix(lowerPath, ".flac") {
		return writeFLACMetadataFields(filePath, fields)
	}
	return errors.New("unsupported file format for writing metadata fields")
}

func writeMP3MetadataFields(filePath string, fields map[string]string) error {
	tag, err := id3v2.Open(filePath, id3v2.Options{Parse: true})
	if err != nil {
		return err
	}
	defer tag.Close()

	if val, ok := fields["title"]; ok {
		tag.AddTextFrame("TIT2", id3v2.EncodingUTF8, val)
	}
	if val, ok := fields["album"]; ok {
		tag.AddTextFrame("TALB", id3v2.EncodingUTF8, val)
	}
	if val, ok := fields["album_artist"]; ok {
		tag.AddTextFrame("TPE2", id3v2.EncodingUTF8, val)
	}
	if val, ok := fields["artist"]; ok {
		tag.AddTextFrame("TPE1", id3v2.EncodingUTF8, val)
	}
	if val, ok := fields["composer"]; ok {
		tag.AddTextFrame("TCOM", id3v2.EncodingUTF8, val)
	}
	if val, ok := fields["date"]; ok {
		tag.AddTextFrame("TYER", id3v2.EncodingUTF8, val)
		tag.AddTextFrame("TDRC", id3v2.EncodingUTF8, val)
	}

	return tag.Save()
}

func writeFLACMetadataFields(filePath string, fields map[string]string) error {
	updates := make(map[string]string)
	fieldMap := map[string]string{
		"title":        "title",
		"album":        "album",
		"album_artist": "albumartist",
		"artist":       "artist",
		"composer":     "composer",
		"date":         "date",
	}

	for field, val := range fields {
		if flacKey, ok := fieldMap[field]; ok {
			updates[flacKey] = val
		}
	}

	jsonData, err := json.Marshal(updates)
	if err != nil {
		return err
	}
	return flacmetadata.WriteCommentsJSON(filePath, string(jsonData))
}

