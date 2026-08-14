// Package api exposes the board's REST API and serves the embedded web UI.
package api

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"light-kanban/internal/store"
)

// New wires the router: /api/* endpoints plus the embedded UI at the root.
func New(s *store.Store, ui fs.FS) http.Handler {
	r := chi.NewRouter()

	r.Get("/api/health", handleHealth(s))
	r.Route("/api/tasks", func(r chi.Router) {
		r.Get("/", handleListTasks(s))
		r.Post("/", handleCreateTask(s))
		r.Post("/{id}/claim", handleClaim(s))
		r.Post("/{id}/block", transitionHandler(s, s.Block, "block"))
		r.Post("/{id}/unblock", transitionHandler(s, s.Unblock, "unblock"))
		r.Post("/{id}/complete", transitionHandler(s, s.Complete, "complete"))
	})
	r.Get("/api/agents", handleListAgents(s))

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

// newID returns a random hex identifier (32 chars) for tasks and agents.
func newID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic("crypto/rand unavailable: " + err.Error())
	}
	return fmt.Sprintf("%x", b)
}

type createTaskRequest struct {
	Title         string    `json:"title"`
	WorkspacePath string    `json:"workspacePath"`
	Description   *string   `json:"description"`
	Type          *string   `json:"type"`
	Tags          *[]string `json:"tags"`
	DueAt         *string   `json:"dueAt"`
}

func handleCreateTask(s *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req createTaskRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
			return
		}
		title := strings.TrimSpace(req.Title)
		if title == "" {
			writeError(w, http.StatusUnprocessableEntity, "title is required")
			return
		}
		workspacePath := strings.TrimSpace(req.WorkspacePath)
		if workspacePath == "" {
			writeError(w, http.StatusUnprocessableEntity, "workspacePath is required")
			return
		}
		var dueAt *time.Time
		if req.DueAt != nil && *req.DueAt != "" {
			parsed, err := time.Parse(time.RFC3339, *req.DueAt)
			if err != nil {
				writeError(w, http.StatusUnprocessableEntity, "dueAt must be an RFC3339 timestamp")
				return
			}
			dueAt = &parsed
		}
		var tags []string
		if req.Tags != nil {
			tags = *req.Tags
		}
		task, err := s.CreateTask(store.Task{
			ID:            newID(),
			Title:         title,
			WorkspacePath: workspacePath,
			Description:   req.Description,
			Type:          req.Type,
			Tags:          tags,
			DueAt:         dueAt,
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "create task: "+err.Error())
			return
		}
		writeJSON(w, http.StatusCreated, task)
	}
}

func handleListTasks(s *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		status := r.URL.Query().Get("status")
		if status == "active" {
			status = ""
		}
		switch status {
		case "", store.StatusArchived:
		default:
			writeError(w, http.StatusBadRequest, "invalid status filter: "+status)
			return
		}
		tasks, err := s.ListTasks(status)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "list tasks: "+err.Error())
			return
		}
		if tasks == nil {
			tasks = []store.Task{}
		}
		writeJSON(w, http.StatusOK, tasks)
	}
}

type claimRequest struct {
	AgentID string  `json:"agentId"`
	Name    string  `json:"name"`
	Avatar  *string `json:"avatar"`
}

// handleClaim implements 待处理 → 处理中 with atomicity: the store's single
// conditional UPDATE guarantees exactly one concurrent claim wins.
func handleClaim(s *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		var req claimRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
			return
		}
		req.AgentID = strings.TrimSpace(req.AgentID)
		if req.AgentID == "" {
			writeError(w, http.StatusUnprocessableEntity, "agentId is required")
			return
		}
		task, err := s.Claim(id, store.Agent{
			ID:     req.AgentID,
			Name:   strings.TrimSpace(req.Name),
			Avatar: req.Avatar,
		})
		switch {
		case errors.Is(err, store.ErrNotFound):
			writeError(w, http.StatusNotFound, "task not found")
		case errors.Is(err, store.ErrConflict):
			writeError(w, http.StatusConflict, "task is not 待处理 and cannot be claimed")
		case err != nil:
			writeError(w, http.StatusInternalServerError, "claim: "+err.Error())
		default:
			writeJSON(w, http.StatusOK, task)
		}
	}
}

func handleListAgents(s *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agents, err := s.ListAgents()
		if err != nil {
			writeError(w, http.StatusInternalServerError, "list agents: "+err.Error())
			return
		}
		if agents == nil {
			agents = []store.Agent{}
		}
		writeJSON(w, http.StatusOK, agents)
	}
}

// transitionHandler maps a store status transition (block/unblock/complete/…)
// onto HTTP: 200 with the moved task, 409 on wrong status, 404 on missing id.
func transitionHandler(s *store.Store, action func(id string) (store.Task, error), verb string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		task, err := action(id)
		switch {
		case errors.Is(err, store.ErrNotFound):
			writeError(w, http.StatusNotFound, "task not found")
		case errors.Is(err, store.ErrConflict):
			writeError(w, http.StatusConflict, "task is not in the required status for "+verb)
		case err != nil:
			writeError(w, http.StatusInternalServerError, verb+": "+err.Error())
		default:
			writeJSON(w, http.StatusOK, task)
		}
	}
}
