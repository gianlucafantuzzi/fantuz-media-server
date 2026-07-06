package library

import (
	"errors"
	"io"
	"os"
	"strings"

	"github.com/bogem/id3v2/v2"
	"github.com/go-flac/flacvorbis"
	"github.com/go-flac/go-flac"
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
	file, err := os.Open(filePath)
	if err != nil {
		return err
	}

	header := make([]byte, 10)
	offset := 0
	if _, err := io.ReadFull(file, header); err == nil && string(header[:3]) == "ID3" {
		offset = 10 + (int(header[6]&0x7f)<<21 | int(header[7]&0x7f)<<14 | int(header[8]&0x7f)<<7 | int(header[9]&0x7f))
	}

	if _, err := file.Seek(int64(offset), io.SeekStart); err != nil {
		file.Close()
		return err
	}

	f, err := flac.ParseBytes(file)
	file.Close()
	if err != nil {
		return err
	}

	var commentBlock *flac.MetaDataBlock
	var commentIndex int = -1
	for idx, block := range f.Meta {
		if block.Type == flac.VorbisComment {
			commentBlock = block
			commentIndex = idx
			break
		}
	}

	var vc *flacvorbis.MetaDataBlockVorbisComment
	if commentBlock != nil {
		vc, err = flacvorbis.ParseFromMetaDataBlock(*commentBlock)
		if err != nil {
			return err
		}
	} else {
		vc = flacvorbis.New()
	}

	// Remove any existing KEYWORDS comments
	newComments := make([]string, 0)
	for _, comment := range vc.Comments {
		parts := strings.SplitN(comment, "=", 2)
		if len(parts) == 2 {
			k := strings.ToUpper(parts[0])
			if k == "KEYWORDS" {
				continue
			}
		}
		newComments = append(newComments, comment)
	}
	vc.Comments = newComments

	if len(keywords) > 0 {
		val := strings.Join(keywords, ", ")
		_ = vc.Add("KEYWORDS", val)
	}

	serializedBlock := vc.Marshal()
	if commentIndex != -1 {
		f.Meta[commentIndex] = &serializedBlock
	} else {
		f.Meta = append(f.Meta, &serializedBlock)
	}

	return f.Save(filePath)
}
