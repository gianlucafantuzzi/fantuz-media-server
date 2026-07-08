package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	"fantuz-media-server/server/internal/config"
	"fantuz-media-server/server/internal/library"
)

type scanner interface {
	Scan(root string) (library.ScanResult, error)
}

type Options struct {
	DB         *library.DB
	Config     config.Config
	ConfigPath string
	Scanner    scanner
	DataDir    string
}

type Server struct {
	db         *library.DB
	config     config.Config
	configPath string
	scanner    scanner
	dataDir    string
	hub        *Hub
	configMu   sync.RWMutex
	scanMu     sync.Mutex
}

func New(options Options) *Server {
	return &Server{
		db:         options.DB,
		config:     options.Config,
		configPath: options.ConfigPath,
		scanner:    options.Scanner,
		dataDir:    options.DataDir,
		hub:        NewHub(),
	}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/config", s.handleConfig)
	mux.HandleFunc("/api/scan", s.handleScan)
	mux.HandleFunc("/api/reset", s.handleReset)
	mux.HandleFunc("/api/library/search", s.handleLibrarySearch)
	mux.HandleFunc("/api/library/albums", s.handleAlbums)
	mux.HandleFunc("/api/library/albums/", s.handleAlbum)
	mux.HandleFunc("/api/library/albums/keywords", s.handleAlbumKeywords)
	mux.HandleFunc("/api/library/albums/metadata", s.handleAlbumMetadataUpdate)
	mux.HandleFunc("/api/library/keywords", s.handleKeywords)
	mux.HandleFunc("/api/library/tracks", s.handleTracks)
	mux.HandleFunc("/api/playlists", s.handlePlaylists)
	mux.HandleFunc("/api/playlists/", s.handlePlaylist)
	mux.HandleFunc("/api/library/tracks/metadata", s.handleTrackMetadataUpdate)
	mux.HandleFunc("/api/library/tracks/keywords", s.handleTrackKeywords)
	mux.HandleFunc("/media/", s.handleMedia)
	mux.HandleFunc("/artwork/", s.handleArtwork)
	mux.HandleFunc("/ws/scan", s.handleScanWebSocket)
	return cors(mux)
}

func (s *Server) handleConfig(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		s.configMu.RLock()
		defer s.configMu.RUnlock()
		writeJSON(w, http.StatusOK, s.config)
	case http.MethodPost:
		var next config.Config
		if !decodeJSON(w, r, &next) {
			return
		}
		if next.PlayerURLs == nil {
			next.PlayerURLs = []string{}
		}
		if err := config.Save(s.configPath, next); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		s.configMu.Lock()
		s.config = next
		s.configMu.Unlock()
		writeJSON(w, http.StatusOK, next)
	default:
		methodNotAllowed(w)
	}
}

func (s *Server) handleScan(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}

	s.configMu.RLock()
	mediaPath := s.config.MediaPath
	s.configMu.RUnlock()
	if strings.TrimSpace(mediaPath) == "" {
		writeErrorText(w, http.StatusBadRequest, "media_path is not configured")
		return
	}

	s.scanMu.Lock()
	defer s.scanMu.Unlock()

	s.broadcastScan("running", library.ScanResult{}, "")
	result, err := s.scanner.Scan(mediaPath)
	if err != nil {
		s.broadcastScan("failed", result, err.Error())
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	status := s.broadcastScan("complete", result, "")
	writeJSON(w, http.StatusOK, status)
}

func (s *Server) handleReset(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}

	s.scanMu.Lock()
	defer s.scanMu.Unlock()

	if err := s.db.Reset(); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	s.configMu.RLock()
	mediaPath := s.config.MediaPath
	s.configMu.RUnlock()
	if strings.TrimSpace(mediaPath) == "" {
		status := s.broadcastScan("reset", library.ScanResult{}, "")
		writeJSON(w, http.StatusOK, status)
		return
	}

	s.broadcastScan("resetting", library.ScanResult{}, "")
	result, err := s.scanner.Scan(mediaPath)
	if err != nil {
		s.broadcastScan("failed", result, err.Error())
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	status := s.broadcastScan("complete", result, "")
	writeJSON(w, http.StatusOK, status)
}

func (s *Server) handleAlbums(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	albums, err := s.db.ListAlbums(filtersFromQuery(r))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, albums)
}

func (s *Server) handleAlbum(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}

	rest := strings.TrimPrefix(r.URL.Path, "/api/library/albums/")
	parts := strings.Split(strings.Trim(rest, "/"), "/")
	if len(parts) != 2 || parts[1] != "tracks" {
		http.NotFound(w, r)
		return
	}
	id, ok := parseID(w, parts[0])
	if !ok {
		return
	}

	tracks, err := s.db.AlbumTracks(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, tracks)
}

func (s *Server) handleTracks(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	tracks, err := s.db.ListTracks(filtersFromQuery(r))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, tracks)
}

func (s *Server) handleLibrarySearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	filters := filtersFromQuery(r)
	if filters.Query == "" {
		filters.Query = strings.TrimSpace(r.URL.Query().Get("q"))
	}

	albums, err := s.db.ListAlbums(filters)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	tracks, err := s.db.ListTracks(filters)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"albums": albums,
		"tracks": tracks,
	})
}

func (s *Server) handlePlaylists(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		playlists, err := s.db.ListPlaylists()
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, playlists)
	case http.MethodPost:
		var request playlistRequest
		if !decodeJSON(w, r, &request) {
			return
		}
		playlist, err := s.db.CreatePlaylist(strings.TrimSpace(request.Title), request.TrackIDs)
		if err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		writeJSON(w, http.StatusCreated, playlist)
	default:
		methodNotAllowed(w)
	}
}

func (s *Server) handlePlaylist(w http.ResponseWriter, r *http.Request) {
	idText := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/playlists/"), "/")
	id, ok := parseID(w, idText)
	if !ok {
		return
	}

	switch r.Method {
	case http.MethodGet:
		playlist, err := s.db.GetPlaylist(id)
		writePlaylistResponse(w, playlist, err)
	case http.MethodPut:
		var request playlistRequest
		if !decodeJSON(w, r, &request) {
			return
		}
		playlist, err := s.db.UpdatePlaylist(id, strings.TrimSpace(request.Title), request.TrackIDs)
		writePlaylistResponse(w, playlist, err)
	case http.MethodDelete:
		err := s.db.DeletePlaylist(id)
		if errors.Is(err, library.ErrNotFound) {
			writeErrorText(w, http.StatusNotFound, "playlist not found")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		methodNotAllowed(w)
	}
}

func (s *Server) handleMedia(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	id, ok := parseID(w, strings.TrimPrefix(r.URL.Path, "/media/"))
	if !ok {
		return
	}
	path, err := s.db.TrackFilePath(id)
	if errors.Is(err, library.ErrNotFound) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	http.ServeFile(w, r, path)
}

func (s *Server) handleArtwork(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	id, ok := parseID(w, strings.TrimPrefix(r.URL.Path, "/artwork/"))
	if !ok {
		return
	}
	path, err := s.db.AlbumArtworkPath(id)
	if errors.Is(err, library.ErrNotFound) || path == "" {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	fullPath := filepath.Clean(filepath.Join(s.dataDir, path))
	if !strings.HasPrefix(fullPath, filepath.Clean(s.dataDir)+string(os.PathSeparator)) {
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, fullPath)
}

func (s *Server) handleScanWebSocket(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	s.hub.ServeHTTP(w, r)
}

func (s *Server) broadcastScan(state string, result library.ScanResult, message string) scanStatus {
	status := scanStatus{
		State:   state,
		Scanned: result.Scanned,
		Skipped: result.Skipped,
		Failed:  result.Failed,
		Message: message,
	}
	s.hub.Broadcast(status)
	return status
}

func filtersFromQuery(r *http.Request) library.LibraryFilters {
	query := r.URL.Query()
	return library.LibraryFilters{
		Query:       strings.TrimSpace(query.Get("q")),
		Genre:       strings.TrimSpace(query.Get("genre")),
		Artist:      strings.TrimSpace(query.Get("artist")),
		AlbumArtist: strings.TrimSpace(query.Get("album_artist")),
		Composer:    strings.TrimSpace(query.Get("composer")),
		Keyword:     strings.TrimSpace(query.Get("keyword")),
	}
}

func writePlaylistResponse(w http.ResponseWriter, playlist library.Playlist, err error) {
	if errors.Is(err, library.ErrNotFound) {
		writeErrorText(w, http.StatusNotFound, "playlist not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, playlist)
}

func parseID(w http.ResponseWriter, text string) (int64, bool) {
	id, err := strconv.ParseInt(strings.Trim(text, "/"), 10, 64)
	if err != nil || id <= 0 {
		writeErrorText(w, http.StatusBadRequest, "invalid id")
		return 0, false
	}
	return id, true
}

type playlistRequest struct {
	Title    string  `json:"title"`
	TrackIDs []int64 `json:"track_ids"`
}

type scanStatus struct {
	State   string `json:"state"`
	Scanned int    `json:"scanned"`
	Skipped int    `json:"skipped"`
	Failed  int    `json:"failed"`
	Message string `json:"message,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func decodeJSON(w http.ResponseWriter, r *http.Request, value any) bool {
	defer r.Body.Close()
	if err := json.NewDecoder(r.Body).Decode(value); err != nil {
		writeErrorText(w, http.StatusBadRequest, "invalid JSON")
		return false
	}
	return true
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeErrorText(w, status, err.Error())
}

func writeErrorText(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func methodNotAllowed(w http.ResponseWriter) {
	writeErrorText(w, http.StatusMethodNotAllowed, "method not allowed")
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) handleKeywords(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	list, err := s.db.ListAllKeywords()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	if list == nil {
		list = []string{}
	}
	writeJSON(w, http.StatusOK, list)
}

type albumKeywordsReq struct {
	AlbumIDs []int64  `json:"album_ids"`
	Keywords []string `json:"keywords"`
}

func (s *Server) handleAlbumKeywords(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodDelete {
		methodNotAllowed(w)
		return
	}

	var req albumKeywordsReq
	if !decodeJSON(w, r, &req) {
		return
	}

	for _, albumID := range req.AlbumIDs {
		tracks, err := s.db.AlbumTracks(albumID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}

		for _, track := range tracks {
			var updatedKeywords []string
			if r.Method == http.MethodPost {
				keywordMap := make(map[string]bool)
				for _, kw := range track.Keywords {
					keywordMap[strings.ToLower(kw)] = true
					updatedKeywords = append(updatedKeywords, kw)
				}
				for _, kw := range req.Keywords {
					lower := strings.ToLower(kw)
					if !keywordMap[lower] {
						keywordMap[lower] = true
						updatedKeywords = append(updatedKeywords, kw)
					}
				}
			} else {
				deleteMap := make(map[string]bool)
				for _, kw := range req.Keywords {
					deleteMap[strings.ToLower(kw)] = true
				}
				for _, kw := range track.Keywords {
					if !deleteMap[strings.ToLower(kw)] {
						updatedKeywords = append(updatedKeywords, kw)
					}
				}
			}

			if err := library.WriteKeywords(track.FilePath, updatedKeywords); err != nil {
				writeError(w, http.StatusInternalServerError, err)
				return
			}

			if err := s.db.UpdateTrackKeywordsInDB(track.ID, updatedKeywords); err != nil {
				writeError(w, http.StatusInternalServerError, err)
				return
			}
		}
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "success"})
}

type albumMetadataUpdateReq struct {
	AlbumID     int64  `json:"album_id"`
	Album       string `json:"album"`
	AlbumArtist string `json:"album_artist"`
	Artist      string `json:"artist"`
	Composer    string `json:"composer"`
	Date        string `json:"date"`
}

func (s *Server) handleAlbumMetadataUpdate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}

	var req albumMetadataUpdateReq
	if !decodeJSON(w, r, &req) {
		return
	}

	tracks, err := s.db.AlbumTracks(req.AlbumID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	fields := make(map[string]string)
	if req.Album != "Varies across tracks" {
		fields["album"] = req.Album
	}
	if req.AlbumArtist != "Varies across tracks" {
		fields["album_artist"] = req.AlbumArtist
	}
	if req.Artist != "Varies across tracks" {
		fields["artist"] = req.Artist
	}
	if req.Composer != "Varies across tracks" {
		fields["composer"] = req.Composer
	}
	if req.Date != "Varies across tracks" {
		fields["date"] = req.Date
	}

	if len(fields) > 0 {
		for _, track := range tracks {
			if err := library.WriteMetadataFields(track.FilePath, fields); err != nil {
				writeError(w, http.StatusInternalServerError, err)
				return
			}
		}
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "success"})
}

type trackMetadataUpdateReq struct {
	TrackID     int64  `json:"track_id"`
	Title       string `json:"title"`
	Artist      string `json:"artist"`
	Album       string `json:"album"`
	AlbumArtist string `json:"album_artist"`
	Composer    string `json:"composer"`
	Date        string `json:"date"`
}

func (s *Server) handleTrackMetadataUpdate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}

	var req trackMetadataUpdateReq
	if !decodeJSON(w, r, &req) {
		return
	}

	track, err := s.db.Track(req.TrackID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	fields := map[string]string{
		"title":        req.Title,
		"artist":       req.Artist,
		"album":        req.Album,
		"album_artist": req.AlbumArtist,
		"composer":     req.Composer,
		"date":         req.Date,
	}

	if err := library.WriteMetadataFields(track.FilePath, fields); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "success"})
}

type trackKeywordsReq struct {
	TrackID  int64    `json:"track_id"`
	Keywords []string `json:"keywords"`
}

func (s *Server) handleTrackKeywords(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodDelete {
		methodNotAllowed(w)
		return
	}

	var req trackKeywordsReq
	if !decodeJSON(w, r, &req) {
		return
	}

	track, err := s.db.Track(req.TrackID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	var updatedKeywords []string
	if r.Method == http.MethodPost {
		keywordMap := make(map[string]bool)
		for _, kw := range track.Keywords {
			keywordMap[strings.ToLower(kw)] = true
			updatedKeywords = append(updatedKeywords, kw)
		}
		for _, kw := range req.Keywords {
			lower := strings.ToLower(kw)
			if !keywordMap[lower] {
				keywordMap[lower] = true
				updatedKeywords = append(updatedKeywords, kw)
			}
		}
	} else {
		deleteMap := make(map[string]bool)
		for _, kw := range req.Keywords {
			deleteMap[strings.ToLower(kw)] = true
		}
		for _, kw := range track.Keywords {
			if !deleteMap[strings.ToLower(kw)] {
				updatedKeywords = append(updatedKeywords, kw)
			}
		}
	}

	if err := library.WriteKeywords(track.FilePath, updatedKeywords); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	if err := s.db.UpdateTrackKeywordsInDB(track.ID, updatedKeywords); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "success"})
}

