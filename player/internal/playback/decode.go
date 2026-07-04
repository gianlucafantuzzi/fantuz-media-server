package playback

import (
	"bytes"
	"errors"
	"io"
	"path"
	"strings"

	"github.com/gopxl/beep"
	"github.com/gopxl/beep/flac"
	"github.com/gopxl/beep/mp3"
	"github.com/gopxl/beep/vorbis"
	"github.com/gopxl/beep/wav"
)

const sniffLen = 16

var errUnsupportedFormat = errors.New("unsupported audio format")

type audioFormat int

const (
	formatUnknown audioFormat = iota
	formatMP3
	formatFLAC
	formatWAV
	formatOGG
)

func decodeStream(url, contentType string, body io.ReadCloser) (beep.StreamSeekCloser, beep.Format, error) {
	header := make([]byte, sniffLen)
	n, err := io.ReadFull(body, header)
	if err != nil && !errors.Is(err, io.ErrUnexpectedEOF) && !errors.Is(err, io.EOF) {
		_ = body.Close()
		return nil, beep.Format{}, err
	}
	header = header[:n]

	format := sniffFormat(header)
	if format == formatUnknown {
		format = formatFromContentType(contentType)
	}
	if format == formatUnknown {
		format = formatFromURL(url)
	}
	if format == formatUnknown {
		_ = body.Close()
		return nil, beep.Format{}, errUnsupportedFormat
	}

	reader := prefixedReadCloser{
		reader: io.MultiReader(bytes.NewReader(header), body),
		closer: body,
	}
	return decodeByFormat(format, reader)
}

type prefixedReadCloser struct {
	reader io.Reader
	closer io.Closer
}

func (r prefixedReadCloser) Read(p []byte) (int, error) {
	return r.reader.Read(p)
}

func (r prefixedReadCloser) Close() error {
	return r.closer.Close()
}

func sniffFormat(header []byte) audioFormat {
	if len(header) >= 4 && string(header[:4]) == "fLaC" {
		return formatFLAC
	}
	if len(header) >= 12 && string(header[:4]) == "RIFF" && string(header[8:12]) == "WAVE" {
		return formatWAV
	}
	if len(header) >= 4 && string(header[:4]) == "OggS" {
		return formatOGG
	}
	if isMP3(header) {
		return formatMP3
	}
	return formatUnknown
}

func isMP3(header []byte) bool {
	if len(header) >= 3 && string(header[:3]) == "ID3" {
		return true
	}
	if len(header) >= 2 && header[0] == 0xFF && (header[1]&0xE0) == 0xE0 {
		return true
	}
	return false
}

func formatFromContentType(contentType string) audioFormat {
	mediaType := strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0]))
	switch mediaType {
	case "audio/mpeg", "audio/mp3":
		return formatMP3
	case "audio/flac", "audio/x-flac":
		return formatFLAC
	case "audio/wav", "audio/wave", "audio/x-wav":
		return formatWAV
	case "audio/ogg", "application/ogg":
		return formatOGG
	default:
		return formatUnknown
	}
}

func formatFromURL(url string) audioFormat {
	switch strings.ToLower(path.Ext(path.Base(url))) {
	case ".mp3":
		return formatMP3
	case ".flac":
		return formatFLAC
	case ".wav":
		return formatWAV
	case ".ogg":
		return formatOGG
	default:
		return formatUnknown
	}
}

func decodeByFormat(format audioFormat, reader io.ReadCloser) (beep.StreamSeekCloser, beep.Format, error) {
	switch format {
	case formatMP3:
		return mp3.Decode(reader)
	case formatFLAC:
		return flac.Decode(reader)
	case formatWAV:
		return wav.Decode(reader)
	case formatOGG:
		return vorbis.Decode(reader)
	default:
		_ = reader.Close()
		return nil, beep.Format{}, errUnsupportedFormat
	}
}
