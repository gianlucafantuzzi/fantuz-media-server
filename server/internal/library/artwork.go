package library

import (
	"bytes"
	"crypto/sha1"
	"encoding/hex"
	"image"
	"image/jpeg"
	"image/png"
	"os"
	"path/filepath"
	"strings"

	_ "image/jpeg"
	_ "image/png"
)

const maxArtworkSize = 600

type ArtworkCache struct {
	dir string
}

func NewArtworkCache(dir string) ArtworkCache {
	return ArtworkCache{dir: dir}
}

func (c ArtworkCache) Store(albumTitle, albumArtist string, artwork *Artwork) (string, error) {
	if artwork == nil || len(artwork.Data) == 0 {
		return "", nil
	}
	if err := os.MkdirAll(c.dir, 0o755); err != nil {
		return "", err
	}

	img, format, err := image.Decode(bytes.NewReader(artwork.Data))
	if err != nil {
		return "", err
	}

	img = resizeToFit(img, maxArtworkSize)
	ext := normalizedArtworkExt(artwork.Ext, format)
	name := artworkName(albumTitle, albumArtist, ext)
	relativePath := filepath.Join(".artwork", name)
	fullPath := filepath.Join(c.dir, name)

	var output bytes.Buffer
	switch ext {
	case "png":
		err = png.Encode(&output, img)
	default:
		err = jpeg.Encode(&output, img, &jpeg.Options{Quality: 85})
	}
	if err != nil {
		return "", err
	}

	if err := os.WriteFile(fullPath, output.Bytes(), 0o644); err != nil {
		return "", err
	}
	return relativePath, nil
}

func artworkName(albumTitle, albumArtist, ext string) string {
	sum := sha1.Sum([]byte(albumTitle + "\x00" + albumArtist))
	return hex.EncodeToString(sum[:]) + "." + ext
}

func normalizedArtworkExt(ext, format string) string {
	ext = strings.TrimPrefix(strings.ToLower(ext), ".")
	if ext == "jpg" || ext == "jpeg" {
		return "jpg"
	}
	if ext == "png" || format == "png" {
		return "png"
	}
	return "jpg"
}

func resizeToFit(src image.Image, maxSize int) image.Image {
	bounds := src.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()
	if width <= maxSize && height <= maxSize {
		return src
	}

	newWidth, newHeight := width, height
	if width >= height {
		newWidth = maxSize
		newHeight = height * maxSize / width
	} else {
		newHeight = maxSize
		newWidth = width * maxSize / height
	}

	dst := image.NewRGBA(image.Rect(0, 0, newWidth, newHeight))
	for y := 0; y < newHeight; y++ {
		for x := 0; x < newWidth; x++ {
			srcX := bounds.Min.X + x*width/newWidth
			srcY := bounds.Min.Y + y*height/newHeight
			dst.Set(x, y, src.At(srcX, srcY))
		}
	}
	return dst
}
