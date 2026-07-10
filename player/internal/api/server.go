package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"fantuz-media-server/player/internal/playback"
	"fantuz-media-server/player/internal/queue"
)

type Player interface {
	Status() playback.Status
	Queue() (tracks []queue.Track, index int)
	SetQueue(tracks []queue.Track, replace bool)
	Play() error
	PlayIndex(index int) error
	Pause() error
	Seek(seconds float64) error
	SetVolume(volume float64) error
	Next() error
	Previous() error
	Remove(index int) error
}

type Server struct {
	player Player
	hub    *Hub
}

func New(player Player) *Server {
	server := &Server{player: player, hub: NewHub()}
	return server
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/queue", s.handleQueue)
	mux.HandleFunc("/play", s.handlePlay)
	mux.HandleFunc("/pause", s.handlePause)
	mux.HandleFunc("/seek", s.handleSeek)
	mux.HandleFunc("/volume", s.handleVolume)
	mux.HandleFunc("/next", s.handleNext)
	mux.HandleFunc("/previous", s.handlePrevious)
	mux.HandleFunc("/status", s.handleStatus)
	mux.HandleFunc("/ws", s.handleWebSocket)
	return cors(mux)
}

func (s *Server) BroadcastStatus(status playback.Status) {
	s.hub.Broadcast(status)
}

func (s *Server) handleQueue(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		tracks, index := s.player.Queue()
		writeJSON(w, http.StatusOK, map[string]any{
			"tracks": tracks,
			"index":  index,
		})
	case http.MethodPost:
		var request struct {
			Tracks  []queue.Track `json:"tracks"`
			Replace bool          `json:"replace"`
		}
		if !decodeJSON(w, r, &request) {
			return
		}
		s.player.SetQueue(request.Tracks, request.Replace)
		writeJSON(w, http.StatusOK, s.player.Status())
	case http.MethodDelete:
		indexStr := r.URL.Query().Get("index")
		if indexStr == "" {
			writeErrorText(w, http.StatusBadRequest, "missing index query parameter")
			return
		}
		index, err := strconv.Atoi(indexStr)
		if err != nil || index < 0 {
			writeErrorText(w, http.StatusBadRequest, "invalid index")
			return
		}
		if err := s.player.Remove(index); err != nil {
			writeErrorText(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, s.player.Status())
	default:
		methodNotAllowed(w)
	}
}

func (s *Server) handlePlay(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	var request struct {
		Index *int `json:"index"`
	}
	_ = json.NewDecoder(r.Body).Decode(&request)
	defer r.Body.Close()

	var err error
	if request.Index != nil {
		err = s.player.PlayIndex(*request.Index)
	} else {
		err = s.player.Play()
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, s.player.Status())
}

func (s *Server) handlePause(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	if err := s.player.Pause(); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, s.player.Status())
}

func (s *Server) handleSeek(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	var request struct {
		PositionSeconds float64 `json:"position_seconds"`
	}
	if !decodeJSON(w, r, &request) {
		return
	}
	if err := s.player.Seek(request.PositionSeconds); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, s.player.Status())
}

func (s *Server) handleVolume(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	var request struct {
		Volume float64 `json:"volume"`
	}
	if !decodeJSON(w, r, &request) {
		return
	}
	if err := s.player.SetVolume(request.Volume); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, s.player.Status())
}

func (s *Server) handleNext(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	if err := s.player.Next(); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, s.player.Status())
}

func (s *Server) handlePrevious(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	if err := s.player.Previous(); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, s.player.Status())
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	writeJSON(w, http.StatusOK, s.player.Status())
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	s.hub.ServeHTTP(w, r, s.player.Status())
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
