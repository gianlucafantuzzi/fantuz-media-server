package library

import (
	"encoding/binary"
	"errors"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/bogem/id3v2/v2"
	"github.com/dhowden/tag"
)

type Parser interface {
	Parse(path string) (TrackMetadata, error)
}

type offsetReadSeeker struct {
	r      io.ReadSeeker
	offset int64
}

func (o offsetReadSeeker) Read(p []byte) (n int, err error) {
	return o.r.Read(p)
}

func (o offsetReadSeeker) Seek(offset int64, whence int) (int64, error) {
	if whence == io.SeekStart {
		offset += o.offset
	}
	pos, err := o.r.Seek(offset, whence)
	if err != nil {
		return 0, err
	}
	return pos - o.offset, nil
}

type TagParser struct{}

func (TagParser) Parse(path string) (TrackMetadata, error) {
	file, err := os.Open(path)
	if err != nil {
		return TrackMetadata{}, err
	}
	defer file.Close()

	// Check if file starts with ID3v2
	header := make([]byte, 10)
	isID3 := false
	id3Size := 0
	if _, err := io.ReadFull(file, header); err == nil && string(header[:3]) == "ID3" {
		isID3 = true
		id3Size = 10 + (int(header[6]&0x7f)<<21 | int(header[7]&0x7f)<<14 | int(header[8]&0x7f)<<7 | int(header[9]&0x7f))
	}
	file.Seek(0, io.SeekStart)

	isMP3 := isID3 || strings.ToLower(filepath.Ext(path)) == ".mp3"

	var title, artist, album, albumArtist, composer, genre string
	var date, discNumber, totalDiscs, trackNumber, totalTracks int
	var keywords []string
	var artwork *Artwork
	var raw map[string]interface{}

	parsedWithBogem := false

	if isMP3 {
		// Use bogem as the primary parser for MP3
		tagObj, err := id3v2.Open(path, id3v2.Options{Parse: true})
		if err == nil {
			defer tagObj.Close()
			parsedWithBogem = true
			title = tagObj.Title()
			artist = tagObj.Artist()
			album = tagObj.Album()
			albumArtist = tagObj.GetTextFrame("TPE2").Text
			if albumArtist == "" {
				albumArtist = artist
			}
			genre = tagObj.Genre()
			if yearInt, convErr := strconv.Atoi(tagObj.Year()); convErr == nil {
				date = yearInt
			}

			// Extract track number and total tracks
			tr := tagObj.GetTextFrame("TRCK")
			if tr.Text != "" {
				parts := strings.Split(tr.Text, "/")
				if len(parts) >= 1 {
					if val, parseErr := strconv.Atoi(parts[0]); parseErr == nil {
						trackNumber = val
					}
				}
				if len(parts) >= 2 {
					if val, parseErr := strconv.Atoi(parts[1]); parseErr == nil {
						totalTracks = val
					}
				}
			}

			// Extract disc number and total discs
			pos := tagObj.GetTextFrame("TPOS")
			if pos.Text != "" {
				parts := strings.Split(pos.Text, "/")
				if len(parts) >= 1 {
					if val, parseErr := strconv.Atoi(parts[0]); parseErr == nil {
						discNumber = val
					}
				}
				if len(parts) >= 2 {
					if val, parseErr := strconv.Atoi(parts[1]); parseErr == nil {
						totalDiscs = val
					}
				}
			}

			// Extract composer
			comp := tagObj.GetTextFrame(tagObj.CommonID("Composer"))
			composer = comp.Text

			// Extract keywords and other custom user-defined frames
			txxxFrames := tagObj.GetFrames("TXXX")
			for _, f := range txxxFrames {
				if udtf, ok := f.(id3v2.UserDefinedTextFrame); ok {
					descLower := strings.ToLower(strings.TrimSpace(udtf.Description))
					if descLower == "keywords" {
						for _, part := range strings.Split(udtf.Value, ",") {
							part = strings.TrimSpace(part)
							if part != "" {
								keywords = append(keywords, part)
							}
						}
					} else if descLower == "total tracks" || descLower == "totaltracks" {
						if val, err := strconv.Atoi(strings.TrimSpace(udtf.Value)); err == nil {
							totalTracks = val
						}
					} else if descLower == "total discs" || descLower == "totaldiscs" {
						if val, err := strconv.Atoi(strings.TrimSpace(udtf.Value)); err == nil {
							totalDiscs = val
						}
					} else if descLower == "track number" || descLower == "tracknumber" {
						if val, err := strconv.Atoi(strings.TrimSpace(udtf.Value)); err == nil {
							trackNumber = val
						}
					} else if descLower == "disc number" || descLower == "discnumber" {
						if val, err := strconv.Atoi(strings.TrimSpace(udtf.Value)); err == nil {
							discNumber = val
						}
					}
				}
			}

			// Extract artwork/picture
			pics := tagObj.GetFrames(tagObj.CommonID("Attached picture"))
			if len(pics) > 0 {
				if pic, ok := pics[0].(id3v2.PictureFrame); ok {
					ext := "jpg"
					if strings.Contains(strings.ToLower(pic.MimeType), "png") {
						ext = "png"
					}
					artwork = &Artwork{
						Ext:      ext,
						MIMEType: pic.MimeType,
						Data:     pic.Picture,
					}
				}
			}
		}
	}

	// Only invoke dhowden if it's not MP3, or bogem failed, or bogem succeeded but artwork was not picked up correctly
	if !parsedWithBogem || artwork == nil {
		var seeker io.ReadSeeker = file
		if isID3 {
			if _, err := file.Seek(int64(id3Size), io.SeekStart); err == nil {
				flacCheck := make([]byte, 4)
				if _, err := io.ReadFull(file, flacCheck); err == nil && string(flacCheck) == "fLaC" {
					file.Seek(int64(id3Size), io.SeekStart)
					seeker = offsetReadSeeker{r: file, offset: int64(id3Size)}
				} else {
					file.Seek(0, io.SeekStart)
				}
			} else {
				file.Seek(0, io.SeekStart)
			}
		} else {
			file.Seek(0, io.SeekStart)
		}

		metadata, err := tag.ReadFrom(seeker)
		if err == nil {
			raw = metadata.Raw()
			if !parsedWithBogem {
				title = metadata.Title()
				artist = metadata.Artist()
				album = metadata.Album()
				albumArtist = metadata.AlbumArtist()
				composer = metadata.Composer()
				genre = metadata.Genre()
				date = metadata.Year()
				trackNumber, totalTracks = metadata.Track()
				discNumber, totalDiscs = metadata.Disc()
				keywords = KeywordsFromRaw(raw)
			}

			if picture := metadata.Picture(); picture != nil {
				artwork = &Artwork{
					Ext:      picture.Ext,
					MIMEType: picture.MIMEType,
					Data:     picture.Data,
				}
			}
		} else if !parsedWithBogem {
			return TrackMetadata{}, err
		}
	}

	stat, errStat := file.Stat()
	if errStat != nil {
		return TrackMetadata{}, errStat
	}

	durationSeconds := durationForFile(file, raw)

	parsed := TrackMetadata{
		FilePath:        path,
		Title:           title,
		Artist:          artist,
		Album:           album,
		AlbumArtist:     albumArtist,
		DurationSeconds: durationSeconds,
		Composer:        composer,
		Genre:           genre,
		Date:            date,
		DiscNumber:      discNumber,
		TotalDiscs:      totalDiscs,
		TrackNumber:     trackNumber,
		TotalTracks:     totalTracks,
		Keywords:        keywords,
		LastModified:    unixModTime(stat.ModTime()),
	}

	if parsed.Title == "" {
		parsed.Title = strings.TrimSuffix(stat.Name(), "."+extension(stat.Name()))
	}
	if parsed.AlbumArtist == "" {
		parsed.AlbumArtist = parsed.Artist
	}

	parsed.Artwork = artwork

	return parsed, nil
}

func KeywordsFromRaw(raw map[string]interface{}) []string {
	values := make([]string, 0)
	for _, key := range []string{"KEYWORDS", "Keywords", "keywords", "keyw", "keyword", "TXXX:KEYWORDS", "TXXX:Keywords", "TXXX:keywords"} {
		if value, ok := raw[key]; ok {
			values = append(values, rawStringValues(value)...)
		}
	}

	keys := make([]string, 0, len(raw))
	for key := range raw {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		comm, ok := raw[key].(*tag.Comm)
		if ok && isKeywordDescription(comm.Description) {
			values = append(values, comm.Text)
		}
	}

	seen := map[string]bool{}
	keywords := make([]string, 0, len(values))
	for _, value := range values {
		for _, part := range strings.Split(value, ",") {
			keyword := strings.TrimSpace(part)
			if keyword == "" || seen[strings.ToLower(keyword)] {
				continue
			}
			seen[strings.ToLower(keyword)] = true
			keywords = append(keywords, keyword)
		}
	}
	return keywords
}

func rawStringValues(value interface{}) []string {
	switch v := value.(type) {
	case string:
		return []string{v}
	case *tag.Comm:
		return []string{v.Text}
	case []string:
		return v
	case []interface{}:
		values := make([]string, 0, len(v))
		for _, item := range v {
			values = append(values, rawStringValues(item)...)
		}
		return values
	case interface{ String() string }:
		return []string{v.String()}
	default:
		return nil
	}
}

func isKeywordDescription(description string) bool {
	description = strings.ToLower(strings.TrimSpace(description))
	return description == "keywords" || description == "keyword"
}

func durationFromRaw(raw map[string]interface{}) int {
	for _, key := range []string{"TLEN", "Length", "length"} {
		value, ok := raw[key]
		if !ok {
			continue
		}
		textValues := rawStringValues(value)
		if len(textValues) == 0 {
			continue
		}
		milliseconds, err := strconv.Atoi(strings.TrimSpace(textValues[0]))
		if err == nil && milliseconds > 0 {
			return (milliseconds + 999) / 1000
		}
	}
	for _, key := range []string{"duration", "Duration", "DURATION"} {
		value, ok := raw[key]
		if !ok {
			continue
		}
		if seconds := rawSeconds(value); seconds > 0 {
			return seconds
		}
	}
	return 0
}

func rawSeconds(value interface{}) int {
	switch v := value.(type) {
	case int:
		return v
	case int64:
		return int(v)
	case uint64:
		return int(v)
	case float64:
		return int(v + 0.5)
	case string:
		seconds, err := strconv.ParseFloat(strings.TrimSpace(v), 64)
		if err == nil && seconds > 0 {
			return int(seconds + 0.5)
		}
	}
	return 0
}

func durationForFile(r io.ReadSeeker, raw map[string]interface{}) int {
	if seconds := durationFromRaw(raw); seconds > 0 {
		return seconds
	}
	if _, err := r.Seek(0, io.SeekStart); err != nil {
		return 0
	}
	data, err := io.ReadAll(r)
	if err != nil || len(data) == 0 {
		return 0
	}

	offset := skipID3v2(data)
	remaining := data[offset:]

	switch {
	case len(remaining) >= 4 && string(remaining[:4]) == "fLaC":
		return flacDurationSeconds(remaining)
	case len(remaining) >= 4 && string(remaining[:4]) == "OggS":
		return oggVorbisDurationSeconds(remaining)
	case len(remaining) >= 8 && string(remaining[4:8]) == "ftyp":
		return mp4DurationSeconds(remaining)
	default:
		return mp3DurationSeconds(remaining)
	}
}

func mp3DurationSeconds(data []byte) int {
	if len(data) == 0 {
		return 0
	}

	offset := skipID3v2(data)
	duration := 0.0
	for offset+4 <= len(data) {
		header := binary.BigEndian.Uint32(data[offset : offset+4])
		frame, ok := parseMP3Frame(header)
		if !ok || offset+frame.size > len(data) {
			offset++
			continue
		}
		duration += float64(frame.samples) / float64(frame.sampleRate)
		offset += frame.size
	}
	return int(duration + 0.5)
}

func flacDurationSeconds(data []byte) int {
	offset := 4
	for offset+4 <= len(data) {
		header := data[offset]
		blockType := header & 0x7f
		length := int(data[offset+1])<<16 | int(data[offset+2])<<8 | int(data[offset+3])
		offset += 4
		if offset+length > len(data) {
			return 0
		}
		if blockType == 0 && length >= 18 {
			block := data[offset : offset+length]
			value := binary.BigEndian.Uint64(block[10:18])
			sampleRate := value >> 44
			totalSamples := value & 0x0fffffffff
			if sampleRate == 0 || totalSamples == 0 {
				return 0
			}
			return int((totalSamples + sampleRate/2) / sampleRate)
		}
		offset += length
		if header&0x80 != 0 {
			break
		}
	}
	return 0
}

func oggVorbisDurationSeconds(data []byte) int {
	offset := 0
	sampleRate := uint64(0)
	lastGranule := uint64(0)
	for offset+27 <= len(data) {
		if string(data[offset:offset+4]) != "OggS" {
			offset++
			continue
		}
		segments := int(data[offset+26])
		if offset+27+segments > len(data) {
			return 0
		}
		segmentTable := data[offset+27 : offset+27+segments]
		payloadLength := 0
		for _, segment := range segmentTable {
			payloadLength += int(segment)
		}
		payloadOffset := offset + 27 + segments
		if payloadOffset+payloadLength > len(data) {
			return 0
		}

		granule := binary.LittleEndian.Uint64(data[offset+6 : offset+14])
		if granule != ^uint64(0) {
			lastGranule = granule
		}
		payload := data[payloadOffset : payloadOffset+payloadLength]
		if sampleRate == 0 && len(payload) >= 16 && payload[0] == 1 && string(payload[1:7]) == "vorbis" {
			sampleRate = uint64(binary.LittleEndian.Uint32(payload[12:16]))
		}
		offset = payloadOffset + payloadLength
	}
	if sampleRate == 0 || lastGranule == 0 {
		return 0
	}
	return int((lastGranule + sampleRate/2) / sampleRate)
}

func mp4DurationSeconds(data []byte) int {
	return mp4DurationInAtoms(data, 0, len(data))
}

func mp4DurationInAtoms(data []byte, start, end int) int {
	for offset := start; offset+8 <= end; {
		size := int(binary.BigEndian.Uint32(data[offset : offset+4]))
		atomType := string(data[offset+4 : offset+8])
		headerSize := 8
		if size == 1 {
			if offset+16 > end {
				return 0
			}
			size64 := binary.BigEndian.Uint64(data[offset+8 : offset+16])
			if size64 > uint64(end-offset) {
				return 0
			}
			size = int(size64)
			headerSize = 16
		}
		if size == 0 {
			size = end - offset
		}
		if size < headerSize || offset+size > end {
			return 0
		}

		payloadStart := offset + headerSize
		payloadEnd := offset + size
		switch atomType {
		case "moov", "trak", "mdia":
			if seconds := mp4DurationInAtoms(data, payloadStart, payloadEnd); seconds > 0 {
				return seconds
			}
		case "mvhd":
			return mvhdDurationSeconds(data[payloadStart:payloadEnd])
		}
		offset += size
	}
	return 0
}

func mvhdDurationSeconds(payload []byte) int {
	if len(payload) < 4 {
		return 0
	}
	version := payload[0]
	switch version {
	case 0:
		if len(payload) < 20 {
			return 0
		}
		timescale := uint64(binary.BigEndian.Uint32(payload[12:16]))
		duration := uint64(binary.BigEndian.Uint32(payload[16:20]))
		if timescale == 0 || duration == 0 {
			return 0
		}
		return int((duration + timescale/2) / timescale)
	case 1:
		if len(payload) < 32 {
			return 0
		}
		timescale := uint64(binary.BigEndian.Uint32(payload[20:24]))
		duration := binary.BigEndian.Uint64(payload[24:32])
		if timescale == 0 || duration == 0 {
			return 0
		}
		return int((duration + timescale/2) / timescale)
	default:
		return 0
	}
}

func skipID3v2(data []byte) int {
	if len(data) < 10 || string(data[:3]) != "ID3" {
		return 0
	}
	size := int(data[6]&0x7f)<<21 | int(data[7]&0x7f)<<14 | int(data[8]&0x7f)<<7 | int(data[9]&0x7f)
	return 10 + size
}

type mp3Frame struct {
	size       int
	samples    int
	sampleRate int
}

func parseMP3Frame(header uint32) (mp3Frame, bool) {
	if header>>21 != 0x7ff {
		return mp3Frame{}, false
	}

	versionID := (header >> 19) & 0x3
	layer := (header >> 17) & 0x3
	bitrateIndex := (header >> 12) & 0xf
	sampleRateIndex := (header >> 10) & 0x3
	padding := (header >> 9) & 0x1

	if versionID == 1 || layer != 1 || bitrateIndex == 0 || bitrateIndex == 15 || sampleRateIndex == 3 {
		return mp3Frame{}, false
	}

	bitrate := bitrateKbps(versionID, bitrateIndex)
	sampleRate := sampleRateHz(versionID, sampleRateIndex)
	if bitrate == 0 || sampleRate == 0 {
		return mp3Frame{}, false
	}

	samples := 1152
	coefficient := 144
	if versionID != 3 {
		samples = 576
		coefficient = 72
	}

	size := coefficient*bitrate*1000/sampleRate + int(padding)
	if size <= 0 {
		return mp3Frame{}, false
	}
	return mp3Frame{size: size, samples: samples, sampleRate: sampleRate}, true
}

func bitrateKbps(versionID uint32, index uint32) int {
	mpeg1 := []int{0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320}
	mpeg2 := []int{0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160}
	if versionID == 3 {
		return mpeg1[index]
	}
	return mpeg2[index]
}

func sampleRateHz(versionID uint32, index uint32) int {
	rates := map[uint32][]int{
		0: {11025, 12000, 8000},
		2: {22050, 24000, 16000},
		3: {44100, 48000, 32000},
	}
	return rates[versionID][index]
}

func extension(path string) string {
	index := strings.LastIndexByte(path, '.')
	if index == -1 {
		return ""
	}
	return path[index+1:]
}

var ErrUnsupportedAudio = errors.New("unsupported audio file")
