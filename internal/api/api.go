// Package api exposes the board's REST API and serves the embedded web UI.
package api

import (
	"encoding/json"
	"io/fs"
	"net/http"

	"github.com/go-chi/chi/v5"

	"light-kanban/internal/store"
)

// New wires the router: /api/* endpoints plus the embedded UI at the root.
func New(s *store.Store, ui fs.FS) http.Handler {
	r := chi.NewRouter()

	r.Get("/api/health", handleHealth(s))

	r.Handle("/*", http.FileServer(http.FS(ui)))
	return r
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func handleHealth(s *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := s.Ping(r.Context()); err != nil {
			writeError(w, http.StatusInternalServerError, "database unreachable: "+err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "db": "ok"})
	}
}
