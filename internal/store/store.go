// Package store persists tasks and agents in SQLite.
//
// Status values are canonical English tokens so the language-neutral API
// stays stable; the web UI maps them to the Chinese column names
// (待处理 / 处理中 / 遇到阻碍 / 等你确认 / 已归档).
package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

// Status is a task's column/state, one of the fixed five tokens of the spec
// state machine. A named type so transitions can't take arbitrary strings.
type Status string

// Status tokens.
const (
	StatusTodo                 Status = "todo"
	StatusInProgress           Status = "in_progress"
	StatusBlocked              Status = "blocked"
	StatusAwaitingConfirmation Status = "awaiting_confirmation"
	StatusArchived             Status = "archived"
)

// Sentinel errors.
var (
	ErrNotFound = errors.New("task not found")
	ErrConflict = errors.New("task is not in the required status")
)

// Task is a single unit of work shown as a card on the board.
type Task struct {
	ID            string     `json:"id"`
	Title         string     `json:"title"`
	WorkspacePath string     `json:"workspacePath"`
	Description   *string    `json:"description"`
	Status        Status     `json:"status"`
	ClaimedBy     *string    `json:"claimedBy"`
	Type          *string    `json:"type"`
	Tags          []string   `json:"tags"`
	CreatedAt     time.Time  `json:"createdAt"`
	UpdatedAt     time.Time  `json:"updatedAt"`
	CompletedAt   *time.Time `json:"completedAt"`
	DueAt         *time.Time `json:"dueAt"`
}

// Agent is an autonomous program that claims and works tasks.
type Agent struct {
	ID     string  `json:"id"`
	Name   string  `json:"name"`
	Avatar *string `json:"avatar"`
}

// TaskUpdate is a partial update applied to a task's human-editable fields.
// Nil pointers mean "leave unchanged"; an empty Description or Type string
// clears the field; ClearDueAt clears the due date. Status, ClaimedBy and
// CompletedAt are system-written and can never be set through UpdateTask.
type TaskUpdate struct {
	Title         *string
	WorkspacePath *string
	Description   *string
	Type          *string
	Tags          *[]string
	DueAt         *time.Time
	ClearDueAt    bool
}

// Store wraps the SQLite database.
type Store struct {
	db *sql.DB
}

const schema = `
CREATE TABLE IF NOT EXISTS tasks (
	id            TEXT PRIMARY KEY,
	title         TEXT NOT NULL,
	workspace_path TEXT NOT NULL,
	description   TEXT,
	status        TEXT NOT NULL DEFAULT 'todo',
	claimed_by    TEXT,
	type          TEXT,
	tags          TEXT NOT NULL DEFAULT '[]',
	created_at    TEXT NOT NULL,
	updated_at    TEXT NOT NULL,
	completed_at  TEXT,
	due_at        TEXT
);
CREATE TABLE IF NOT EXISTS agents (
	id     TEXT PRIMARY KEY,
	name   TEXT NOT NULL,
	avatar TEXT
);
`

// Open opens (creating if needed) the SQLite database at path and applies
// the schema. Use ":memory:" for a throwaway in-memory database.
func Open(path string) (*Store, error) {
	var dsn string
	if path == ":memory:" {
		dsn = "file::memory:?cache=shared&_pragma=busy_timeout(5000)"
	} else {
		dsn = path + "?_pragma=busy_timeout(5000)"
	}
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", path, err)
	}
	if _, err := db.Exec(schema); err != nil {
		db.Close()
		return nil, fmt.Errorf("apply schema: %w", err)
	}
	return &Store{db: db}, nil
}

// Close releases the underlying database.
func (s *Store) Close() error { return s.db.Close() }

// Ping verifies the database is reachable.
func (s *Store) Ping(ctx context.Context) error { return s.db.PingContext(ctx) }

const taskColumns = `id, title, workspace_path, description, status, claimed_by, type, tags, created_at, updated_at, completed_at, due_at`

type rowScanner interface {
	Scan(dest ...any) error
}

func scanTask(row rowScanner) (Task, error) {
	var (
		t           Task
		desc, typ   sql.NullString
		claimedBy   sql.NullString
		status      string
		tags        string
		createdAt   string
		updatedAt   string
		completedAt sql.NullString
		dueAt       sql.NullString
		err         error
	)
	if err = row.Scan(&t.ID, &t.Title, &t.WorkspacePath, &desc, &status, &claimedBy, &typ, &tags, &createdAt, &updatedAt, &completedAt, &dueAt); err != nil {
		return Task{}, err
	}
	t.Status = Status(status)
	t.Description = nullStringPtr(desc)
	t.Type = nullStringPtr(typ)
	t.ClaimedBy = nullStringPtr(claimedBy)
	if err := json.Unmarshal([]byte(tags), &t.Tags); err != nil || t.Tags == nil {
		t.Tags = []string{}
	}
	if t.CreatedAt, err = parseTime(createdAt); err != nil {
		return Task{}, fmt.Errorf("parse created_at: %w", err)
	}
	if t.UpdatedAt, err = parseTime(updatedAt); err != nil {
		return Task{}, fmt.Errorf("parse updated_at: %w", err)
	}
	if completedAt.Valid {
		v, err := parseTime(completedAt.String)
		if err != nil {
			return Task{}, fmt.Errorf("parse completed_at: %w", err)
		}
		t.CompletedAt = &v
	}
	if dueAt.Valid {
		v, err := parseTime(dueAt.String)
		if err != nil {
			return Task{}, fmt.Errorf("parse due_at: %w", err)
		}
		t.DueAt = &v
	}
	return t, nil
}

func nullStringPtr(ns sql.NullString) *string {
	if !ns.Valid {
		return nil
	}
	v := ns.String
	return &v
}

func parseTime(s string) (time.Time, error) {
	return time.Parse(time.RFC3339Nano, s)
}

func formatTime(t time.Time) string { return t.UTC().Format(time.RFC3339Nano) }

func encodeTags(tags []string) (string, error) {
	if tags == nil {
		tags = []string{}
	}
	b, err := json.Marshal(tags)
	return string(b), err
}

// CreateTask inserts a task. The store stamps CreatedAt and UpdatedAt unless
// already set, and defaults an empty status to 待处理.
func (s *Store) CreateTask(t Task) (Task, error) {
	now := time.Now().UTC()
	if t.Status == "" {
		t.Status = StatusTodo
	}
	if t.CreatedAt.IsZero() {
		t.CreatedAt = now
	}
	if t.UpdatedAt.IsZero() {
		t.UpdatedAt = t.CreatedAt
	}
	tags, err := encodeTags(t.Tags)
	if err != nil {
		return Task{}, fmt.Errorf("encode tags: %w", err)
	}
	_, err = s.db.Exec(`INSERT INTO tasks (id, title, workspace_path, description, status, claimed_by, type, tags, created_at, updated_at, completed_at, due_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		t.ID, t.Title, t.WorkspacePath, strPtr(t.Description), t.Status, strPtr(t.ClaimedBy), strPtr(t.Type),
		tags, formatTime(t.CreatedAt), formatTime(t.UpdatedAt), timePtr(t.CompletedAt), timePtr(t.DueAt))
	if err != nil {
		return Task{}, fmt.Errorf("insert task: %w", err)
	}
	return t, nil
}

// GetTask returns one task by id.
func (s *Store) GetTask(id string) (Task, error) {
	t, err := scanTask(s.db.QueryRow(`SELECT `+taskColumns+` FROM tasks WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return Task{}, ErrNotFound
	}
	return t, err
}

// ListTasks returns tasks. status "" returns all active (non-archived) tasks,
// StatusArchived returns the archived history, anything else is an error.
func (s *Store) ListTasks(status Status) ([]Task, error) {
	query := `SELECT ` + taskColumns + ` FROM tasks`
	var order string
	switch status {
	case "":
		query += ` WHERE status != '` + string(StatusArchived) + `'`
		order = `created_at DESC`
	case StatusArchived:
		query += ` WHERE status = '` + string(StatusArchived) + `'`
		order = `completed_at DESC`
	default:
		return nil, fmt.Errorf("invalid status filter %q", status)
	}
	rows, err := s.db.Query(query + ` ORDER BY ` + order)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var tasks []Task
	for rows.Next() {
		t, err := scanTask(rows)
		if err != nil {
			return nil, err
		}
		tasks = append(tasks, t)
	}
	return tasks, rows.Err()
}

// UpdateTask applies a partial update to human-editable fields only and
// bumps UpdatedAt.
func (s *Store) UpdateTask(id string, u TaskUpdate) (Task, error) {
	var sets []string
	var args []any
	apply := func(col string, v any) {
		sets = append(sets, col+" = ?")
		args = append(args, v)
	}
	if u.Title != nil {
		apply("title", *u.Title)
	}
	if u.WorkspacePath != nil {
		apply("workspace_path", *u.WorkspacePath)
	}
	if u.Description != nil {
		// empty string clears the field
		apply("description", emptyToNil(*u.Description))
	}
	if u.Type != nil {
		apply("type", emptyToNil(*u.Type))
	}
	if u.Tags != nil {
		tags, err := encodeTags(*u.Tags)
		if err != nil {
			return Task{}, fmt.Errorf("encode tags: %w", err)
		}
		apply("tags", tags)
	}
	if u.DueAt != nil {
		apply("due_at", formatTime(*u.DueAt))
	}
	if u.ClearDueAt {
		apply("due_at", nil)
	}
	if len(sets) == 0 {
		return s.GetTask(id)
	}
	apply("updated_at", formatTime(time.Now().UTC()))
	args = append(args, id)
	res, err := s.db.Exec(`UPDATE tasks SET `+strings.Join(sets, ", ")+` WHERE id = ?`, args...)
	if err != nil {
		return Task{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return Task{}, ErrNotFound
	}
	return s.GetTask(id)
}

func emptyToNil(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func strPtr(p *string) any {
	if p == nil {
		return nil
	}
	return *p
}

func timePtr(p *time.Time) any {
	if p == nil {
		return nil
	}
	return formatTime(*p)
}

// Claim atomically moves a task 待处理 → 处理中 and self-registers the agent
// that claims it. Concurrent claims on the same task: exactly one wins.
func (s *Store) Claim(id string, a Agent) (Task, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return Task{}, err
	}
	defer tx.Rollback()

	res, err := tx.Exec(`UPDATE tasks SET status = ?, claimed_by = ?, updated_at = ? WHERE id = ? AND status = ?`,
		StatusInProgress, a.ID, formatTime(time.Now().UTC()), id, StatusTodo)
	if err != nil {
		return Task{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		var exists int
		if err := tx.QueryRow(`SELECT COUNT(*) FROM tasks WHERE id = ?`, id).Scan(&exists); err != nil {
			return Task{}, err
		}
		if exists == 0 {
			return Task{}, ErrNotFound
		}
		return Task{}, ErrConflict
	}

	// Self-register (or refresh) the agent: a new row defaults its name to
	// the id; a known agent keeps its display name/avatar when the claim
	// omits them.
	if err := upsertAgent(tx, a); err != nil {
		return Task{}, err
	}
	if err := tx.Commit(); err != nil {
		return Task{}, err
	}
	return s.GetTask(id)
}

// Block moves a task 处理中 → 遇到阻碍.
func (s *Store) Block(id string) (Task, error) {
	return s.simpleTransition(id, StatusInProgress, StatusBlocked, nil, nil)
}

// Unblock moves a task 遇到阻碍 → 处理中.
func (s *Store) Unblock(id string) (Task, error) {
	return s.simpleTransition(id, StatusBlocked, StatusInProgress, nil, nil)
}

// Complete moves a task 处理中 → 等你确认.
func (s *Store) Complete(id string) (Task, error) {
	return s.simpleTransition(id, StatusInProgress, StatusAwaitingConfirmation, nil, nil)
}

// Archive moves a task 等你确认 → 已归档, recording the completion date.
func (s *Store) Archive(id string) (Task, error) {
	now := formatTime(time.Now().UTC())
	return s.simpleTransition(id, StatusAwaitingConfirmation, StatusArchived, []string{"completed_at = ?"}, []any{now})
}

// Reject moves a task 等你确认 → 处理中, back to the same agent.
func (s *Store) Reject(id string) (Task, error) {
	return s.simpleTransition(id, StatusAwaitingConfirmation, StatusInProgress, nil, nil)
}

// Recycle moves a task 处理中 → 待处理 and drops the claim, so any agent can
// claim it again (used when the claiming agent is suspected dead).
func (s *Store) Recycle(id string) (Task, error) {
	return s.simpleTransition(id, StatusInProgress, StatusTodo, []string{"claimed_by = NULL"}, nil)
}

func (s *Store) simpleTransition(id string, from, to Status, extraSet []string, extraArgs []any) (Task, error) {
	sets := append([]string{"status = ?", "updated_at = ?"}, extraSet...)
	args := append([]any{to, formatTime(time.Now().UTC())}, extraArgs...)
	args = append(args, id, from)
	res, err := s.db.Exec(`UPDATE tasks SET `+strings.Join(sets, ", ")+` WHERE id = ? AND status = ?`, args...)
	if err != nil {
		return Task{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		if _, err := s.GetTask(id); errors.Is(err, ErrNotFound) {
			return Task{}, ErrNotFound
		}
		return Task{}, ErrConflict
	}
	return s.GetTask(id)
}

// SetStatus lets the human correct a card's status directly (user story 6:
// "manually move or edit a card's status"), bypassing the transition guards.
// Moving to 待处理 drops the claim; moving to 已归档 records the completion
// date; leaving 已归档 clears it. Unknown statuses are rejected.
func (s *Store) SetStatus(id string, status Status) (Task, error) {
	switch status {
	case StatusTodo, StatusInProgress, StatusBlocked, StatusAwaitingConfirmation, StatusArchived:
	default:
		return Task{}, fmt.Errorf("invalid status %q", status)
	}
	sets := []string{"status = ?", "updated_at = ?"}
	args := []any{status, formatTime(time.Now().UTC())}
	if status == StatusTodo {
		sets = append(sets, "claimed_by = NULL")
	}
	if status == StatusArchived {
		sets = append(sets, "completed_at = ?")
		args = append(args, formatTime(time.Now().UTC()))
	} else {
		sets = append(sets, "completed_at = NULL")
	}
	args = append(args, id)
	res, err := s.db.Exec(`UPDATE tasks SET `+strings.Join(sets, ", ")+` WHERE id = ?`, args...)
	if err != nil {
		return Task{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return Task{}, ErrNotFound
	}
	return s.GetTask(id)
}

// upsertAgentSQL inserts or updates an agent's display identity. A new row
// defaults its name to the id; an existing agent keeps its name and avatar
// when the incoming values are empty.
const upsertAgentSQL = `INSERT INTO agents (id, name, avatar) VALUES (?, COALESCE(NULLIF(?, ''), ?), ?)
	ON CONFLICT(id) DO UPDATE SET
		name = CASE WHEN ? = '' THEN agents.name ELSE excluded.name END,
		avatar = COALESCE(excluded.avatar, agents.avatar)`

type execer interface {
	Exec(query string, args ...any) (sql.Result, error)
}

func upsertAgent(exec execer, a Agent) error {
	_, err := exec.Exec(upsertAgentSQL, a.ID, a.Name, a.ID, strPtr(a.Avatar), a.Name)
	return err
}

// DeleteTask removes a task entirely (human correction tool): it leaves the
// board and the archived history, and the row is gone from the store.
func (s *Store) DeleteTask(id string) error {
	res, err := s.db.Exec(`DELETE FROM tasks WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// ListAgents returns all registered agents.
func (s *Store) ListAgents() ([]Agent, error) {
	rows, err := s.db.Query(`SELECT id, name, avatar FROM agents ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var agents []Agent
	for rows.Next() {
		var a Agent
		var avatar sql.NullString
		if err := rows.Scan(&a.ID, &a.Name, &avatar); err != nil {
			return nil, err
		}
		a.Avatar = nullStringPtr(avatar)
		agents = append(agents, a)
	}
	return agents, rows.Err()
}

// GetAgent returns one agent by id.
func (s *Store) GetAgent(id string) (Agent, error) {
	var a Agent
	var avatar sql.NullString
	err := s.db.QueryRow(`SELECT id, name, avatar FROM agents WHERE id = ?`, id).Scan(&a.ID, &a.Name, &avatar)
	if errors.Is(err, sql.ErrNoRows) {
		return Agent{}, ErrNotFound
	}
	if err != nil {
		return Agent{}, err
	}
	a.Avatar = nullStringPtr(avatar)
	return a, nil
}

// UpsertAgent pre-configures or updates an agent's display identity.
// A new agent defaults its name to the id; an existing agent keeps its
// name when the update omits one.
func (s *Store) UpsertAgent(a Agent) (Agent, error) {
	if err := upsertAgent(s.db, a); err != nil {
		return Agent{}, err
	}
	return s.GetAgent(a.ID)
}
