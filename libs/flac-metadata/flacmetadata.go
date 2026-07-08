package flacmetadata

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"os"
	"path/filepath"
	"strings"
)

// Metadata block types
const (
	BlockTypeStreamInfo    = 0
	BlockTypePadding       = 1
	BlockTypeApplication   = 2
	BlockTypeSeekTable     = 3
	BlockTypeVorbisComment = 4
	BlockTypeCueSheet      = 5
	BlockTypePicture       = 6
)

type metadataBlock struct {
	Header  byte // Bit 7: Last-metadata-block flag, Bits 0-6: Block type
	Payload []byte
}

func (b metadataBlock) isLast() bool {
	return (b.Header & 0x80) != 0
}

func (b metadataBlock) blockType() byte {
	return b.Header & 0x7f
}

// verifyFLAC checks if the file starts with the "fLaC" magic number.
func verifyFLAC(file io.Reader) error {
	magic := make([]byte, 4)
	if _, err := io.ReadFull(file, magic); err != nil {
		return fmt.Errorf("read magic: %w", err)
	}
	if string(magic) != "fLaC" {
		return errors.New("not a valid FLAC file (missing fLaC header)")
	}
	return nil
}

// readBlocks reads all metadata blocks from a FLAC file and returns the blocks and the offset to the audio data.
func readBlocks(filePath string) ([]metadataBlock, int64, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, 0, err
	}
	defer file.Close()

	if err := verifyFLAC(file); err != nil {
		return nil, 0, err
	}

	var blocks []metadataBlock
	for {
		header := make([]byte, 4)
		if _, err := io.ReadFull(file, header); err != nil {
			return nil, 0, fmt.Errorf("read block header: %w", err)
		}

		last := (header[0] & 0x80) != 0
		blockType := header[0] & 0x7f
		length := int(header[1])<<16 | int(header[2])<<8 | int(header[3])

		payload := make([]byte, length)
		if _, err := io.ReadFull(file, payload); err != nil {
			return nil, 0, fmt.Errorf("read block payload (type %d, length %d): %w", blockType, length, err)
		}

		blocks = append(blocks, metadataBlock{
			Header:  header[0],
			Payload: payload,
		})

		if last {
			break
		}
	}

	audioOffset, err := file.Seek(0, io.SeekCurrent)
	if err != nil {
		return nil, 0, fmt.Errorf("get audio offset: %w", err)
	}

	return blocks, audioOffset, nil
}

// writeFileWithBlocks writes the updated FLAC file by saving block headers, payloads, and copying the original audio frames.
func writeFileWithBlocks(filePath string, blocks []metadataBlock, audioOffset int64) error {
	original, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer original.Close()

	tempFile, err := os.CreateTemp(filepath.Dir(filePath), "flacedit-*.tmp")
	if err != nil {
		return fmt.Errorf("create temp file: %w", err)
	}
	defer func() {
		tempFile.Close()
		_ = os.Remove(tempFile.Name())
	}()

	// Write magic
	if _, err := tempFile.Write([]byte("fLaC")); err != nil {
		return fmt.Errorf("write magic: %w", err)
	}

	// Write blocks
	for i, block := range blocks {
		isLast := i == len(blocks)-1
		headerByte := block.blockType()
		if isLast {
			headerByte |= 0x80
		}

		length := len(block.Payload)
		header := []byte{
			headerByte,
			byte((length >> 16) & 0xff),
			byte((length >> 8) & 0xff),
			byte(length & 0xff),
		}

		if _, err := tempFile.Write(header); err != nil {
			return fmt.Errorf("write block header: %w", err)
		}
		if _, err := tempFile.Write(block.Payload); err != nil {
			return fmt.Errorf("write block payload: %w", err)
		}
	}

	// Copy audio frames
	if _, err := original.Seek(audioOffset, io.SeekStart); err != nil {
		return fmt.Errorf("seek to audio offset: %w", err)
	}
	if _, err := io.Copy(tempFile, original); err != nil {
		return fmt.Errorf("copy audio frames: %w", err)
	}

	tempFile.Close()
	original.Close()

	if err := os.Rename(tempFile.Name(), filePath); err != nil {
		return fmt.Errorf("replace original file: %w", err)
	}

	return nil
}

// ReadCommentsJSON reads all VORBIS_COMMENT blocks from a FLAC file and returns them as a JSON object.
func ReadCommentsJSON(filePath string) (string, error) {
	blocks, _, err := readBlocks(filePath)
	if err != nil {
		return "", err
	}

	comments := make(map[string]string)
	for _, block := range blocks {
		if block.blockType() == BlockTypeVorbisComment {
			parsed, err := parseVorbisComment(block.Payload)
			if err != nil {
				return "", err
			}
			for k, v := range parsed {
				comments[k] = v
			}
		}
	}

	data, err := json.MarshalIndent(comments, "", "  ")
	if err != nil {
		return "", fmt.Errorf("marshal comments: %w", err)
	}

	return string(data), nil
}

// parseVorbisComment parses Vorbis Comments from raw block payload.
func parseVorbisComment(payload []byte) (map[string]string, error) {
	reader := bytes.NewReader(payload)

	var vendorLen uint32
	if err := binary.Read(reader, binary.LittleEndian, &vendorLen); err != nil {
		return nil, fmt.Errorf("read vendor length: %w", err)
	}

	vendorBytes := make([]byte, vendorLen)
	if _, err := io.ReadFull(reader, vendorBytes); err != nil {
		return nil, fmt.Errorf("read vendor string: %w", err)
	}

	var commentListLen uint32
	if err := binary.Read(reader, binary.LittleEndian, &commentListLen); err != nil {
		return nil, fmt.Errorf("read comment list length: %w", err)
	}

	comments := make(map[string]string)
	for i := uint32(0); i < commentListLen; i++ {
		var commentLen uint32
		if err := binary.Read(reader, binary.LittleEndian, &commentLen); err != nil {
			return nil, fmt.Errorf("read comment length: %w", err)
		}

		commentBytes := make([]byte, commentLen)
		if _, err := io.ReadFull(reader, commentBytes); err != nil {
			return nil, fmt.Errorf("read comment: %w", err)
		}

		commentStr := string(commentBytes)
		parts := strings.SplitN(commentStr, "=", 2)
		if len(parts) == 2 {
			comments[strings.ToLower(parts[0])] = parts[1]
		}
	}

	return comments, nil
}

type Picture struct {
	MIMEType string
	Ext      string
	Data     []byte
}

// ReadPicture reads the PICTURE block from a FLAC file and returns the decoded picture structure in memory.
func ReadPicture(filePath string) (*Picture, error) {
	blocks, _, err := readBlocks(filePath)
	if err != nil {
		return nil, err
	}

	var pictureBlock *metadataBlock
	for _, block := range blocks {
		if block.blockType() == BlockTypePicture {
			pictureBlock = &block
			break
		}
	}

	if pictureBlock == nil {
		return nil, errors.New("no PICTURE block found in FLAC file")
	}

	reader := bytes.NewReader(pictureBlock.Payload)

	// Skip Picture Type (4 bytes)
	if _, err := reader.Seek(4, io.SeekCurrent); err != nil {
		return nil, fmt.Errorf("seek past picture type: %w", err)
	}

	var mimeLen uint32
	if err := binary.Read(reader, binary.BigEndian, &mimeLen); err != nil {
		return nil, fmt.Errorf("read mime length: %w", err)
	}

	mimeBytes := make([]byte, mimeLen)
	if _, err := io.ReadFull(reader, mimeBytes); err != nil {
		return nil, fmt.Errorf("read mime string: %w", err)
	}
	mimeType := string(mimeBytes)

	var descLen uint32
	if err := binary.Read(reader, binary.BigEndian, &descLen); err != nil {
		return nil, fmt.Errorf("read description length: %w", err)
	}

	// Skip Description string
	if _, err := reader.Seek(int64(descLen), io.SeekCurrent); err != nil {
		return nil, fmt.Errorf("seek past description: %w", err)
	}

	// Skip Width, Height, Depth, Color Count (4 * 4 = 16 bytes)
	if _, err := reader.Seek(16, io.SeekCurrent); err != nil {
		return nil, fmt.Errorf("seek past dimensions: %w", err)
	}

	var dataLen uint32
	if err := binary.Read(reader, binary.BigEndian, &dataLen); err != nil {
		return nil, fmt.Errorf("read picture data length: %w", err)
	}

	pictureData := make([]byte, dataLen)
	if _, err := io.ReadFull(reader, pictureData); err != nil {
		return nil, fmt.Errorf("read picture data: %w", err)
	}

	ext := ".img"
	exts, err := mime.ExtensionsByType(mimeType)
	if err == nil && len(exts) > 0 {
		ext = exts[0]
	} else {
		// Fallbacks
		if strings.Contains(mimeType, "jpeg") || strings.Contains(mimeType, "jpg") {
			ext = ".jpg"
		} else if strings.Contains(mimeType, "png") {
			ext = ".png"
		} else if strings.Contains(mimeType, "gif") {
			ext = ".gif"
		}
	}

	return &Picture{
		MIMEType: mimeType,
		Ext:      ext,
		Data:     pictureData,
	}, nil
}

// ExtractPicture reads the PICTURE block from a FLAC file and saves the extracted image.
func ExtractPicture(filePath string, outputDir string) (string, error) {
	pic, err := ReadPicture(filePath)
	if err != nil {
		return "", err
	}

	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return "", fmt.Errorf("create output directory: %w", err)
	}

	baseName := strings.TrimSuffix(filepath.Base(filePath), filepath.Ext(filePath))
	outPath := filepath.Join(outputDir, baseName+pic.Ext)
	if err := os.WriteFile(outPath, pic.Data, 0644); err != nil {
		return "", fmt.Errorf("write extracted picture file: %w", err)
	}

	return outPath, nil
}

// WriteCommentsJSON adds/replaces comments in VORBIS_COMMENT blocks of a FLAC file.
func WriteCommentsJSON(filePath string, commentsJSON string) error {
	var updates map[string]string
	if err := json.Unmarshal([]byte(commentsJSON), &updates); err != nil {
		return fmt.Errorf("parse JSON comments: %w", err)
	}

	blocks, audioOffset, err := readBlocks(filePath)
	if err != nil {
		return err
	}

	var vorbisBlockIdx = -1
	currentComments := make(map[string]string)
	for i, block := range blocks {
		if block.blockType() == BlockTypeVorbisComment {
			vorbisBlockIdx = i
			parsed, err := parseVorbisComment(block.Payload)
			if err == nil {
				for k, v := range parsed {
					currentComments[k] = v
				}
			}
			break
		}
	}

	// Apply updates
	for k, v := range updates {
		currentComments[strings.ToLower(k)] = v
	}

	// Build new payload
	var buf bytes.Buffer

	// Write vendor string (default standard reference libFLAC if unknown)
	vendor := "reference libFLAC 1.4.3"
	binary.Write(&buf, binary.LittleEndian, uint32(len(vendor)))
	buf.WriteString(vendor)

	// Write comment list length
	binary.Write(&buf, binary.LittleEndian, uint32(len(currentComments)))

	// Write comment list
	for k, v := range currentComments {
		comment := strings.ToUpper(k) + "=" + v
		binary.Write(&buf, binary.LittleEndian, uint32(len(comment)))
		buf.WriteString(comment)
	}

	newBlock := metadataBlock{
		Header:  BlockTypeVorbisComment,
		Payload: buf.Bytes(),
	}

	if vorbisBlockIdx != -1 {
		blocks[vorbisBlockIdx] = newBlock
	} else {
		// Insert before the last block
		lastBlock := blocks[len(blocks)-1]
		blocks[len(blocks)-1] = newBlock
		blocks = append(blocks, lastBlock)
	}

	return writeFileWithBlocks(filePath, blocks, audioOffset)
}

// WritePicture replaces or adds a picture block in a FLAC file.
func WritePicture(filePath string, picturePath string) error {
	pictureData, err := os.ReadFile(picturePath)
	if err != nil {
		return fmt.Errorf("read new picture file: %w", err)
	}

	ext := strings.ToLower(filepath.Ext(picturePath))
	mimeType := "image/jpeg"
	if ext == ".png" {
		mimeType = "image/png"
	} else if ext == ".gif" {
		mimeType = "image/gif"
	}

	blocks, audioOffset, err := readBlocks(filePath)
	if err != nil {
		return err
	}

	// Filter out any existing picture blocks
	var newBlocks []metadataBlock
	for _, block := range blocks {
		if block.blockType() != BlockTypePicture {
			newBlocks = append(newBlocks, block)
		}
	}

	// Build new PICTURE block payload
	var buf bytes.Buffer
	binary.Write(&buf, binary.BigEndian, uint32(3)) // 3 = Front Cover
	binary.Write(&buf, binary.BigEndian, uint32(len(mimeType)))
	buf.WriteString(mimeType)
	binary.Write(&buf, binary.BigEndian, uint32(0)) // 0 description length
	// Dimensions
	binary.Write(&buf, binary.BigEndian, uint32(0)) // width
	binary.Write(&buf, binary.BigEndian, uint32(0)) // height
	binary.Write(&buf, binary.BigEndian, uint32(0)) // depth
	binary.Write(&buf, binary.BigEndian, uint32(0)) // color count
	// Picture data
	binary.Write(&buf, binary.BigEndian, uint32(len(pictureData)))
	buf.Write(pictureData)

	pictureBlock := metadataBlock{
		Header:  BlockTypePicture,
		Payload: buf.Bytes(),
	}

	// Append picture block before the last block
	lastBlock := newBlocks[len(newBlocks)-1]
	newBlocks[len(newBlocks)-1] = pictureBlock
	newBlocks = append(newBlocks, lastBlock)

	return writeFileWithBlocks(filePath, newBlocks, audioOffset)
}

// VerifyDirectory goes through all .flac files in the hierarchy and lists files with errors.
func VerifyDirectory(dirPath string) ([]string, error) {
	var failingFiles []string

	err := filepath.Walk(dirPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() && strings.ToLower(filepath.Ext(path)) == ".flac" {
			// Try reading blocks to verify FLAC validity
			_, _, parseErr := readBlocks(path)
			if parseErr != nil {
				failingFiles = append(failingFiles, path)
			}
		}
		return nil
	})

	if err != nil {
		return nil, fmt.Errorf("walk directory: %w", err)
	}

	return failingFiles, nil
}
