// Package api exposes the board's REST API and serves the embedded web UI.
package api

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
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
		r.Patch("/{id}", handlePatchTask(s))
		r.Post("/{id}/claim", handleClaim(s))
		r.Post("/{id}/block", transitionHandler(s, s.Block, "block"))
		r.Post("/{id}/unblock", transitionHandler(s, s.Unblock, "unblock"))
		r.Post("/{id}/complete", transitionHandler(s, s.Complete, "complete"))
		r.Post("/{id}/archive", transitionHandler(s, s.Archive, "archive"))
		r.Post("/{id}/reject", transitionHandler(s, s.Reject, "reject"))
		r.Post("/{id}/recycle", transitionHandler(s, s.Recycle, "recycle"))
	})
	r.Get("/api/agents", handleListAgents(s))
	r.Post("/api/agents", handleUpsertAgent(s))
	r.Get("/api/fs/dirs", handleBrowseDirs())
	r.Post("/api/fs/pick", handlePickDir())

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
		switch store.Status(status) {
		case "", store.StatusArchived:
		default:
			writeError(w, http.StatusBadRequest, "invalid status filter: "+status)
			return
		}
		tasks, err := s.ListTasks(store.Status(status))
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
		if err != nil {
			writeStoreTransitionError(w, err, "claim")
			return
		}
		writeJSON(w, http.StatusOK, task)
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

type patchTaskRequest struct {
	Title         *string   `json:"title"`
	WorkspacePath *string   `json:"workspacePath"`
	Description   *string   `json:"description"`
	Type          *string   `json:"type"`
	Tags          *[]string `json:"tags"`
	DueAt         *string   `json:"dueAt"`
	Status        *string   `json:"status"`
}

// handlePatchTask edits a task's human-editable fields and may correct its
// status directly (user story 6 — the human overrides wrong state). System
// fields (claimedBy, completedAt, createdAt) can never be set here; unknown
// JSON fields are ignored. Empty string clears an optional field, empty
// dueAt clears the due date, null means "leave unchanged".
func handlePatchTask(s *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		var req patchTaskRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
			return
		}
		u := store.TaskUpdate{
			Description: req.Description,
			Type:        req.Type,
			Tags:        req.Tags,
		}
		if req.Title != nil {
			title := strings.TrimSpace(*req.Title)
			if title == "" {
				writeError(w, http.StatusUnprocessableEntity, "title cannot be empty")
				return
			}
			u.Title = &title
		}
		if req.WorkspacePath != nil {
			wp := strings.TrimSpace(*req.WorkspacePath)
			if wp == "" {
				writeError(w, http.StatusUnprocessableEntity, "workspacePath cannot be empty")
				return
			}
			u.WorkspacePath = &wp
		}
		if req.DueAt != nil {
			if *req.DueAt == "" {
				u.ClearDueAt = true
			} else {
				parsed, err := time.Parse(time.RFC3339, *req.DueAt)
				if err != nil {
					writeError(w, http.StatusUnprocessableEntity, "dueAt must be an RFC3339 timestamp")
					return
				}
				u.DueAt = &parsed
			}
		}
		if req.Status != nil {
			status := strings.TrimSpace(*req.Status)
			switch store.Status(status) {
			case store.StatusTodo, store.StatusInProgress, store.StatusBlocked,
				store.StatusAwaitingConfirmation, store.StatusArchived:
			default:
				writeError(w, http.StatusUnprocessableEntity, "invalid status: "+status)
				return
			}
			// Fields first (if any), then the status correction on top.
			task, err := s.UpdateTask(id, u)
			if err != nil {
				writeStoreTransitionError(w, err, "update")
				return
			}
			task, err = s.SetStatus(id, store.Status(status))
			if err != nil {
				writeStoreTransitionError(w, err, "set status")
				return
			}
			writeJSON(w, http.StatusOK, task)
			return
		}
		task, err := s.UpdateTask(id, u)
		if err != nil {
			writeStoreTransitionError(w, err, "update")
			return
		}
		writeJSON(w, http.StatusOK, task)
	}
}

type agentRequest struct {
	ID     string  `json:"id"`
	Name   string  `json:"name"`
	Avatar *string `json:"avatar"`
}

// handleUpsertAgent pre-configures or updates an agent's display identity
// (id + name + avatar). Recurring agents then show their configured avatar
// on every card they claim.
func handleUpsertAgent(s *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req agentRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
			return
		}
		req.ID = strings.TrimSpace(req.ID)
		if req.ID == "" {
			writeError(w, http.StatusUnprocessableEntity, "agent id is required")
			return
		}
		agent, err := s.UpsertAgent(store.Agent{
			ID:     req.ID,
			Name:   strings.TrimSpace(req.Name),
			Avatar: req.Avatar,
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "upsert agent: "+err.Error())
			return
		}
		writeJSON(w, http.StatusOK, agent)
	}
}

// handleBrowseDirs lists the subdirectories of an absolute path, so the
// human can pick a workspace folder by browsing instead of typing. Only
// directory names are returned (never file contents); ".." components and
// relative paths are rejected. Empty path lists platform roots.
func handleBrowseDirs() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw := filepath.FromSlash(strings.TrimSpace(r.URL.Query().Get("path")))
		if raw == "" {
			writeJSON(w, http.StatusOK, map[string]any{"path": "", "dirs": platformRoots()})
			return
		}
		if !filepath.IsAbs(raw) {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("path must be absolute: got %q", r.URL.Query().Get("path")))
			return
		}
		// Check ".." on the raw path: filepath.Clean would swallow it.
		for _, part := range strings.Split(raw, string(filepath.Separator)) {
			if part == ".." {
				writeError(w, http.StatusBadRequest, "path must not contain '..'")
				return
			}
		}
		clean := filepath.Clean(raw)
		entries, err := os.ReadDir(clean)
		if err != nil {
			if os.IsNotExist(err) {
				writeError(w, http.StatusNotFound, "path not found")
				return
			}
			writeError(w, http.StatusInternalServerError, "read dir: "+err.Error())
			return
		}
		dirs := []string{}
		for _, e := range entries {
			if e.IsDir() {
				dirs = append(dirs, filepath.Join(clean, e.Name()))
			}
		}
		writeJSON(w, http.StatusOK, map[string]any{"path": clean, "dirs": dirs})
	}
}

// platformRoots returns the top-level directories to start browsing from.
func platformRoots() []string {
	if runtime.GOOS != "windows" {
		return []string{"/"}
	}
	roots := []string{}
	for c := 'A'; c <= 'Z'; c++ {
		p := string(c) + `:\`
		if _, err := os.Stat(p); err == nil {
			roots = append(roots, p)
		}
	}
	return roots
}

// pickDir opens the server's native folder picker and returns the chosen
// absolute path ("" when the user cancels). Injectable for tests.
var pickDir = defaultPickDir

// handlePickDir lets the operator pick a workspace folder with the real OS
// dialog (the board runs on their own machine). Browsers never expose
// absolute paths from their own pickers, so the server opens its own.
func handlePickDir() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Minute)
		defer cancel()
		path, err := pickDirWith(ctx)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "folder picker failed: "+err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"path": path})
	}
}

func pickDirWith(ctx context.Context) (string, error) {
	done := make(chan struct {
		path string
		err  error
	}, 1)
	go func() {
		p, err := pickDir()
		done <- struct {
			path string
			err  error
		}{p, err}
	}()
	select {
	case res := <-done:
		return res.path, res.err
	case <-ctx.Done():
		return "", ctx.Err()
	}
}

// defaultPickDir shells out to the platform's native folder dialog.
func defaultPickDir() (string, error) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		script := `Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $d.SelectedPath }`
		cmd = exec.Command("powershell.exe", "-NoProfile", "-STA", "-Command", script)
	case "darwin":
		cmd = exec.Command("osascript", "-e", `POSIX path of (choose folder)`)
	case "linux":
		if _, err := exec.LookPath("zenity"); err == nil {
			cmd = exec.Command("zenity", "--file-selection", "--directory")
		} else if _, err := exec.LookPath("kdialog"); err == nil {
			cmd = exec.Command("kdialog", "--getexistingdirectory")
		} else {
			return "", errors.New("no folder picker available (zenity/kdialog)")
		}
	default:
		return "", fmt.Errorf("folder picker not supported on %s", runtime.GOOS)
	}
	out, err := cmd.Output()
	if err != nil {
		// Canceled dialogs exit non-zero with no path.
		if len(strings.TrimSpace(string(out))) == 0 {
			return "", nil
		}
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

// writeStoreTransitionError maps store errors onto HTTP responses and
// reports whether an error was written (false = success, callers continue).
// Error bodies stay language-neutral per the API contract.
func writeStoreTransitionError(w http.ResponseWriter, err error, verb string) bool {
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, "task not found")
	case errors.Is(err, store.ErrConflict):
		writeError(w, http.StatusConflict, "task is not in the required status for "+verb)
	case err != nil:
		writeError(w, http.StatusInternalServerError, verb+": "+err.Error())
	default:
		return false
	}
	return true
}

// transitionHandler maps a store status transition (block/unblock/complete/…)
// onto HTTP: 200 with the moved task, 409 on wrong status, 404 on missing id.
func transitionHandler(s *store.Store, action func(id string) (store.Task, error), verb string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		task, err := action(id)
		if writeStoreTransitionError(w, err, verb) {
			return
		}
		writeJSON(w, http.StatusOK, task)
	}
}
