package library

import (
	"io/fs"
	"path/filepath"
	"strings"
)

type Scanner struct {
	DB      *DB
	Parser  Parser
	Artwork ArtworkCache
}

type ScanResult struct {
	Scanned int
	Skipped int
	Failed  int
}

func NewScanner(db *DB, artworkDir string) Scanner {
	return Scanner{
		DB:      db,
		Parser:  TagParser{},
		Artwork: NewArtworkCache(artworkDir),
	}
}

func (s Scanner) Scan(root string) (ScanResult, error) {
	result := ScanResult{}
	affectedAlbums := make([]int64, 0)

	absoluteRoot, err := filepath.Abs(root)
	if err != nil {
		return result, err
	}

	err = filepath.WalkDir(absoluteRoot, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			result.Failed++
			return nil
		}
		if entry.IsDir() || !isAudioFile(path) {
			return nil
		}

		info, err := entry.Info()
		if err != nil {
			result.Failed++
			return nil
		}

		lastModified := unixModTime(info.ModTime())
		storedLastModified, ok, err := s.DB.TrackLastModified(path)
		if err != nil {
			return err
		}
		if ok && storedLastModified == lastModified {
			result.Skipped++
			return nil
		}

		meta, err := s.Parser.Parse(path)
		if err != nil {
			result.Failed++
			return nil
		}
		meta.FilePath = path
		meta.LastModified = lastModified

		artworkPath, err := s.Artwork.Store(meta.Album, meta.AlbumArtist, meta.Artwork)
		if err != nil {
			result.Failed++
			return nil
		}

		_, albumID, err := s.DB.UpsertTrack(meta, artworkPath)
		if err != nil {
			return err
		}
		affectedAlbums = append(affectedAlbums, albumID)
		result.Scanned++
		return nil
	})
	if err != nil {
		return result, err
	}

	return result, s.DB.RecalculateAlbumDurations(affectedAlbums)
}

func isAudioFile(path string) bool {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".mp3", ".m4a", ".m4b", ".flac", ".ogg":
		return true
	default:
		return false
	}
}
