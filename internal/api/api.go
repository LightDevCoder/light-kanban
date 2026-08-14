// Package api exposes the board's REST API and serves the embedded web UI.
package api

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io"
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
// avatarsDir is where uploaded avatar images are stored and served from.
func New(s *store.Store, ui fs.FS, avatarsDir string) http.Handler {
	r := chi.NewRouter()

	r.Get("/api/health", handleHealth(s))
	r.Route("/api/tasks", func(r chi.Router) {
		r.Get("/", handleListTasks(s))
		r.Post("/", handleCreateTask(s))
		r.Patch("/{id}", handlePatchTask(s))
		r.Delete("/{id}", handleDeleteTask(s))
		r.Post("/{id}/claim", handleClaim(s, avatarsDir))
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
	r.Post("/api/fs/open", handleOpenDir())
	r.Post("/api/avatars", handleUploadAvatar(avatarsDir))
	r.Get("/api/avatars/*", handleAvatarFile(avatarsDir))

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

// validateAvatar checks an avatar reference at claim time: uploaded
// /api/avatars/ paths must point at a file that actually exists on the
// server (no fabricated paths → no broken images on cards); http(s) image
// URLs are accepted as-is.
func validateAvatar(dir, v string) error {
	if strings.HasPrefix(v, "/api/avatars/") {
		name := filepath.Base(v)
		if name == "." || name == ".." {
			return errors.New("avatar must be an uploaded image")
		}
		if _, err := os.Stat(filepath.Join(dir, name)); err != nil {
			return errors.New("avatar image not found — upload it via POST /api/avatars first")
		}
		return nil
	}
	if strings.HasPrefix(v, "http://") || strings.HasPrefix(v, "https://") {
		return nil
	}
	return errors.New("avatar must be an uploaded image or an http(s) image URL")
}

// handleClaim implements 待处理 → 处理中 with atomicity: the store's single
// conditional UPDATE guarantees exactly one concurrent claim wins. Agents
// self-register here, so the claim must carry a proper identity: a non-empty
// tool name and an image avatar that exists on the server.
func handleClaim(s *store.Store, avatarsDir string) http.HandlerFunc {
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
		req.Name = strings.TrimSpace(req.Name)
		if req.Name == "" {
			writeError(w, http.StatusUnprocessableEntity, "name is required (use your agent tool name, e.g. \"grok build\")")
			return
		}
		if req.Avatar == nil {
			writeError(w, http.StatusUnprocessableEntity, "avatar is required and must be an image (upload it, or give an http(s) image URL)")
			return
		}
		if err := validateAvatar(avatarsDir, *req.Avatar); err != nil {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		task, err := s.Claim(id, store.Agent{
			ID:     req.AgentID,
			Name:   req.Name,
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

// maxAvatarBytes caps uploaded avatar images at 2 MiB.
const maxAvatarBytes = 2 << 20

var avatarExtByType = map[string]string{
	"image/png":  ".png",
	"image/jpeg": ".jpg",
	"image/gif":  ".gif",
	"image/webp": ".webp",
}

// handleUploadAvatar accepts an image file (multipart field "file"), stores
// it under avatarsDir and returns its public path. The avatar field of an
// agent is a string, so a URL path fits the existing API untouched.
func handleUploadAvatar(dir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, maxAvatarBytes)
		if err := r.ParseMultipartForm(maxAvatarBytes); err != nil {
			writeError(w, http.StatusBadRequest, "avatar upload must be a multipart form under 2 MiB")
			return
		}
		file, _, err := r.FormFile("file")
		if err != nil {
			writeError(w, http.StatusBadRequest, "missing file field")
			return
		}
		defer file.Close()

		head := make([]byte, 512)
		n, err := file.Read(head)
		if err != nil && err != io.EOF {
			writeError(w, http.StatusInternalServerError, "read upload: "+err.Error())
			return
		}
		ext, ok := avatarExtByType[http.DetectContentType(head[:n])]
		if !ok {
			writeError(w, http.StatusUnprocessableEntity, "avatar must be a PNG/JPEG/GIF/WebP image")
			return
		}
		if err := os.MkdirAll(dir, 0o755); err != nil {
			writeError(w, http.StatusInternalServerError, "create avatars dir: "+err.Error())
			return
		}
		name := newID() + ext
		dst, err := os.Create(filepath.Join(dir, name))
		if err != nil {
			writeError(w, http.StatusInternalServerError, "save avatar: "+err.Error())
			return
		}
		defer dst.Close()
		if _, err := dst.Write(head[:n]); err != nil {
			writeError(w, http.StatusInternalServerError, "save avatar: "+err.Error())
			return
		}
		if _, err := io.Copy(dst, file); err != nil {
			writeError(w, http.StatusInternalServerError, "save avatar: "+err.Error())
			return
		}
		writeJSON(w, http.StatusCreated, map[string]string{"path": "/api/avatars/" + name})
	}
}

// handleAvatarFile serves stored avatar images by basename only.
func handleAvatarFile(dir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := filepath.Base(r.URL.Path)
		if name == "." || name == ".." {
			writeError(w, http.StatusNotFound, "avatar not found")
			return
		}
		path := filepath.Join(dir, name)
		if _, err := os.Stat(path); err != nil {
			writeError(w, http.StatusNotFound, "avatar not found")
			return
		}
		w.Header().Set("Cache-Control", "public, max-age=3600")
		http.ServeFile(w, r, path)
	}
}

// handleDeleteTask removes a task entirely (human correction): 204 on
// success, 404 for unknown ids.
func handleDeleteTask(s *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		if err := s.DeleteTask(id); err != nil {
			writeStoreTransitionError(w, err, "delete")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// openFolder reveals a folder in the OS file manager on the server machine
// (browsers cannot open local folders, so the server does it). Injectable
// for tests.
var openFolder = defaultOpenFolder

// handleOpenDir implements the card's "jump to the project folder" button.
func handleOpenDir() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Path string `json:"path"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
			return
		}
		path := filepath.FromSlash(strings.TrimSpace(req.Path))
		if path == "" || !filepath.IsAbs(path) {
			writeError(w, http.StatusBadRequest, "path must be absolute")
			return
		}
		clean := filepath.Clean(path)
		if _, err := os.Stat(clean); err != nil {
			writeError(w, http.StatusNotFound, "path not found")
			return
		}
		if err := openFolder(clean); err != nil {
			writeError(w, http.StatusInternalServerError, "open folder: "+err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"ok": "true"})
	}
}

// defaultOpenFolder shells out to the platform's file manager.
func defaultOpenFolder(path string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("explorer.exe", path)
	case "darwin":
		cmd = exec.Command("open", path)
	case "linux":
		cmd = exec.Command("xdg-open", path)
	default:
		return fmt.Errorf("open folder not supported on %s", runtime.GOOS)
	}
	return cmd.Start()
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
