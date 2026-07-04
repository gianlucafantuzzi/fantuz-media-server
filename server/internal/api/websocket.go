package api

import (
	"bufio"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"net"
	"net/http"
	"strings"
	"sync"
)

type Hub struct {
	mu      sync.Mutex
	clients map[net.Conn]bool
}

func NewHub() *Hub {
	return &Hub{clients: map[net.Conn]bool{}}
}

func (h *Hub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if !isWebSocketRequest(r) {
		writeErrorText(w, http.StatusBadRequest, "websocket upgrade required")
		return
	}

	hijacker, ok := w.(http.Hijacker)
	if !ok {
		writeErrorText(w, http.StatusInternalServerError, "websocket unsupported")
		return
	}

	conn, rw, err := hijacker.Hijack()
	if err != nil {
		return
	}

	accept := websocketAccept(r.Header.Get("Sec-WebSocket-Key"))
	_, _ = rw.WriteString("HTTP/1.1 101 Switching Protocols\r\n")
	_, _ = rw.WriteString("Upgrade: websocket\r\n")
	_, _ = rw.WriteString("Connection: Upgrade\r\n")
	_, _ = rw.WriteString("Sec-WebSocket-Accept: " + accept + "\r\n\r\n")
	if err := rw.Flush(); err != nil {
		_ = conn.Close()
		return
	}

	h.add(conn)
	go h.drain(conn, rw.Reader)
}

func (h *Hub) Broadcast(value any) {
	data, err := json.Marshal(value)
	if err != nil {
		return
	}
	frame := textFrame(data)

	h.mu.Lock()
	defer h.mu.Unlock()
	for conn := range h.clients {
		if _, err := conn.Write(frame); err != nil {
			delete(h.clients, conn)
			_ = conn.Close()
		}
	}
}

func (h *Hub) add(conn net.Conn) {
	h.mu.Lock()
	h.clients[conn] = true
	h.mu.Unlock()
}

func (h *Hub) remove(conn net.Conn) {
	h.mu.Lock()
	delete(h.clients, conn)
	h.mu.Unlock()
	_ = conn.Close()
}

func (h *Hub) drain(conn net.Conn, reader *bufio.Reader) {
	buffer := make([]byte, 512)
	for {
		if _, err := reader.Read(buffer); err != nil {
			h.remove(conn)
			return
		}
	}
}

func isWebSocketRequest(r *http.Request) bool {
	return strings.EqualFold(r.Header.Get("Upgrade"), "websocket") &&
		strings.Contains(strings.ToLower(r.Header.Get("Connection")), "upgrade") &&
		r.Header.Get("Sec-WebSocket-Key") != ""
}

func websocketAccept(key string) string {
	sum := sha1.Sum([]byte(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
	return base64.StdEncoding.EncodeToString(sum[:])
}

func textFrame(payload []byte) []byte {
	frame := []byte{0x81}
	switch {
	case len(payload) < 126:
		frame = append(frame, byte(len(payload)))
	case len(payload) <= 65535:
		frame = append(frame, 126, byte(len(payload)>>8), byte(len(payload)))
	default:
		var size [8]byte
		binary.BigEndian.PutUint64(size[:], uint64(len(payload)))
		frame = append(frame, 127)
		frame = append(frame, size[:]...)
	}
	return append(frame, payload...)
}
