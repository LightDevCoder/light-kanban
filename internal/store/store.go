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
	"sort"
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
	Tags          []string   `json:"tags"`
	CreatedAt     time.Time  `json:"createdAt"`
	UpdatedAt     time.Time  `json:"updatedAt"`
	CompletedAt   *time.Time `json:"completedAt"`
	DueAt         *time.Time `json:"dueAt"`
	// BlockReason is set when an agent blocks the task (处理中 → 遇到阻碍)
	// so the human sees why it is stuck; cleared on unblock.
	BlockReason *string `json:"blockReason"`
	// ReviewFeedback is set when the human rejects a review (等你确认 →
	// 处理中) so the agent can read what to fix; cleared on complete.
	ReviewFeedback *string `json:"reviewFeedback"`
}

// Agent is an autonomous program that claims and works tasks.
type Agent struct {
	ID     string  `json:"id"`
	Name   string  `json:"name"`
	Avatar *string `json:"avatar"`
}

// TaskUpdate is a partial update applied to a task's human-editable fields.
// Nil pointers mean "leave unchanged"; an empty Description string clears the
// field; ClearDueAt clears the due date. Status, ClaimedBy and CompletedAt
// are system-written and can never be set through UpdateTask.
type TaskUpdate struct {
	Title         *string
	WorkspacePath *string
	Description   *string
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
	tags          TEXT NOT NULL DEFAULT '[]',
	created_at    TEXT NOT NULL,
	updated_at    TEXT NOT NULL,
	completed_at  TEXT,
	due_at        TEXT,
	block_reason  TEXT,
	review_feedback TEXT
);
CREATE TABLE IF NOT EXISTS agents (
	id     TEXT PRIMARY KEY,
	name   TEXT NOT NULL,
	avatar TEXT,
	configured INTEGER NOT NULL DEFAULT 0
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
	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate schema: %w", err)
	}
	return s, nil
}

// migrate brings databases created before later schema additions up to date.
func (s *Store) migrate() error {
	for _, m := range []struct{ table, column, alter string }{
		{"agents", "configured", `ALTER TABLE agents ADD COLUMN configured INTEGER NOT NULL DEFAULT 0`},
		{"tasks", "block_reason", `ALTER TABLE tasks ADD COLUMN block_reason TEXT`},
		{"tasks", "review_feedback", `ALTER TABLE tasks ADD COLUMN review_feedback TEXT`},
	} {
		if err := s.ensureColumn(m.table, m.column, m.alter); err != nil {
			return err
		}
	}
	return nil
}

// ensureColumn adds a column when a database created before it existed is
// opened. Fresh databases already have every column from the schema above.
func (s *Store) ensureColumn(table, column, alter string) error {
	rows, err := s.db.Query(`PRAGMA table_info(` + table + `)`)
	if err != nil {
		return err
	}
	has := false
	for rows.Next() {
		var cid, notnull, pk int
		var name, typ string
		var dflt any
		if err := rows.Scan(&cid, &name, &typ, &notnull, &dflt, &pk); err != nil {
			rows.Close()
			return err
		}
		if name == column {
			has = true
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	if has {
		return nil
	}
	_, err = s.db.Exec(alter)
	return err
}

// Close releases the underlying database.
func (s *Store) Close() error { return s.db.Close() }

// Ping verifies the database is reachable.
func (s *Store) Ping(ctx context.Context) error { return s.db.PingContext(ctx) }

const taskColumns = `id, title, workspace_path, description, status, claimed_by, tags, created_at, updated_at, completed_at, due_at, block_reason, review_feedback`

type rowScanner interface {
	Scan(dest ...any) error
}

func scanTask(row rowScanner) (Task, error) {
	var (
		t              Task
		desc           sql.NullString
		claimedBy      sql.NullString
		status         string
		tags           string
		createdAt      string
		updatedAt      string
		completedAt    sql.NullString
		dueAt          sql.NullString
		blockReason    sql.NullString
		reviewFeedback sql.NullString
		err            error
	)
	if err = row.Scan(&t.ID, &t.Title, &t.WorkspacePath, &desc, &status, &claimedBy, &tags, &createdAt, &updatedAt, &completedAt, &dueAt, &blockReason, &reviewFeedback); err != nil {
		return Task{}, err
	}
	t.Status = Status(status)
	t.Description = nullStringPtr(desc)
	t.ClaimedBy = nullStringPtr(claimedBy)
	t.BlockReason = nullStringPtr(blockReason)
	t.ReviewFeedback = nullStringPtr(reviewFeedback)
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
	_, err = s.db.Exec(`INSERT INTO tasks (id, title, workspace_path, description, status, claimed_by, tags, created_at, updated_at, completed_at, due_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		t.ID, t.Title, t.WorkspacePath, strPtr(t.Description), t.Status, strPtr(t.ClaimedBy),
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

// ValidStatus reports whether s is one of the five state-machine tokens.
// It is the single allow-list shared by the store and the HTTP layer so
// the status vocabulary can never drift apart.
func ValidStatus(s Status) bool {
	switch s {
	case StatusTodo, StatusInProgress, StatusBlocked, StatusAwaitingConfirmation, StatusArchived:
		return true
	}
	return false
}

// ListTasks returns tasks ordered per the board's column rules. status ""
// returns all active (non-archived) tasks grouped in column order; any of
// the five status tokens returns just that column; anything else is an error.
func (s *Store) ListTasks(status Status) ([]Task, error) {
	if status != "" && !ValidStatus(status) {
		return nil, fmt.Errorf("invalid status filter %q", status)
	}
	query := `SELECT ` + taskColumns + ` FROM tasks`
	var arg any
	if status == "" {
		query += ` WHERE status != ?`
		arg = StatusArchived
	} else {
		query += ` WHERE status = ?`
		arg = status
	}
	rows, err := s.db.Query(query, arg)
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
	if err := rows.Err(); err != nil {
		return nil, err
	}
	sortTasks(tasks)
	return tasks, nil
}

// statusGroupOrder is the visible board column order (archived excluded;
// it is its own history view).
var statusGroupOrder = map[Status]int{
	StatusTodo:                 0,
	StatusInProgress:           1,
	StatusBlocked:              2,
	StatusAwaitingConfirmation: 3,
}

// sortTasks applies the column ordering rules (SPEC v1.0.3 Fix 3):
// todo is a FIFO queue (created oldest-first), in_progress and blocked show
// the most recent activity first, awaiting_confirmation shows the
// longest-waiting review first, and archived shows the newest completion
// first. For the combined active list the columns come first, each keeping
// its internal rule — the UI splits it into four columns anyway.
func sortTasks(tasks []Task) {
	sort.SliceStable(tasks, func(i, j int) bool {
		a, b := tasks[i], tasks[j]
		ga, gb := statusGroupOrder[a.Status], statusGroupOrder[b.Status]
		if ga != gb {
			return ga < gb
		}
		switch a.Status {
		case StatusTodo:
			return a.CreatedAt.Before(b.CreatedAt)
		case StatusInProgress, StatusBlocked:
			return a.UpdatedAt.After(b.UpdatedAt)
		case StatusAwaitingConfirmation:
			return a.UpdatedAt.Before(b.UpdatedAt)
		case StatusArchived:
			return timePtrAfter(a.CompletedAt, b.CompletedAt)
		}
		return false
	})
}

// timePtrAfter reports whether the first timestamp is strictly newer than
// the second, treating a missing timestamp as oldest (sorts last in
// newest-first order).
func timePtrAfter(a, b *time.Time) bool {
	at, bt := time.Time{}, time.Time{}
	if a != nil {
		at = *a
	}
	if b != nil {
		bt = *b
	}
	return at.After(bt)
}

// UpdateTask applies a partial update to human-editable fields only and
// bumps UpdatedAt.
func (s *Store) UpdateTask(id string, u TaskUpdate) (Task, error) {
	return s.UpdateTaskWithStatus(id, u, nil)
}

// taskUpdateSets builds the SET clauses and arguments for the human-editable
// field updates shared by UpdateTask and UpdateTaskWithStatus.
func taskUpdateSets(u TaskUpdate) ([]string, []any, error) {
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
	if u.Tags != nil {
		tags, err := encodeTags(*u.Tags)
		if err != nil {
			return nil, nil, fmt.Errorf("encode tags: %w", err)
		}
		apply("tags", tags)
	}
	if u.DueAt != nil {
		apply("due_at", formatTime(*u.DueAt))
	}
	if u.ClearDueAt {
		apply("due_at", nil)
	}
	return sets, args, nil
}

// UpdateTaskWithStatus applies field updates and an optional manual status
// correction in ONE statement, so a PATCH carrying both can never leave a
// half-applied row behind (SPEC v1.0.3 Fix 4). Status corrections keep the
// v1.0.2 rules: 待处理 drops the claim, 已归档 records the completion date,
// leaving 已归档 clears it, and any correction clears block reason and
// review feedback. Unknown statuses are rejected before anything is written.
func (s *Store) UpdateTaskWithStatus(id string, u TaskUpdate, status *Status) (Task, error) {
	sets, args, err := taskUpdateSets(u)
	if err != nil {
		return Task{}, err
	}
	if status != nil {
		if !ValidStatus(*status) {
			return Task{}, fmt.Errorf("invalid status %q", *status)
		}
		sets = append(sets, "status = ?", "block_reason = NULL", "review_feedback = NULL")
		args = append(args, *status)
		if *status == StatusTodo {
			sets = append(sets, "claimed_by = NULL")
		}
		if *status == StatusArchived {
			sets = append(sets, "completed_at = ?")
			args = append(args, formatTime(time.Now().UTC()))
		} else {
			sets = append(sets, "completed_at = NULL")
		}
	}
	if len(sets) == 0 {
		return s.GetTask(id)
	}
	sets = append(sets, "updated_at = ?")
	args = append(args, formatTime(time.Now().UTC()), id)
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
	// omits them; a human-configured agent keeps them no matter what.
	if err := upsertAgentClaim(tx, a); err != nil {
		return Task{}, err
	}
	if err := tx.Commit(); err != nil {
		return Task{}, err
	}
	return s.GetTask(id)
}

// Block moves a task 处理中 → 遇到阻碍, recording an optional reason so the
// human can see why the agent is stuck.
func (s *Store) Block(id string, reason *string) (Task, error) {
	return s.simpleTransition(id, StatusInProgress, StatusBlocked, []string{"block_reason = ?"}, []any{strPtr(reason)})
}

// Unblock moves a task 遇到阻碍 → 处理中 and clears the block reason.
func (s *Store) Unblock(id string) (Task, error) {
	return s.simpleTransition(id, StatusBlocked, StatusInProgress, []string{"block_reason = NULL"}, nil)
}

// Complete moves a task 处理中 → 等你确认 and clears any review feedback
// from a previous rejection (the new delivery is reviewed fresh).
func (s *Store) Complete(id string) (Task, error) {
	return s.simpleTransition(id, StatusInProgress, StatusAwaitingConfirmation, []string{"review_feedback = NULL"}, nil)
}

// Archive moves a task 等你确认 → 已归档, recording the completion date.
func (s *Store) Archive(id string) (Task, error) {
	now := formatTime(time.Now().UTC())
	return s.simpleTransition(id, StatusAwaitingConfirmation, StatusArchived, []string{"completed_at = ?"}, []any{now})
}

// Reject moves a task 等你确认 → 处理中, back to the same agent, with an
// optional feedback message the agent reads through the task list.
func (s *Store) Reject(id string, feedback *string) (Task, error) {
	return s.simpleTransition(id, StatusAwaitingConfirmation, StatusInProgress, []string{"review_feedback = ?"}, []any{strPtr(feedback)})
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
// date; leaving 已归档 clears it. A manual correction is a clean slate:
// block reason and review feedback are always cleared. Unknown statuses are
// rejected. It shares the atomic correction statement with
// UpdateTaskWithStatus so the semantics can never drift apart.
func (s *Store) SetStatus(id string, status Status) (Task, error) {
	return s.UpdateTaskWithStatus(id, TaskUpdate{}, &status)
}

// upsertAgentClaimSQL inserts or updates an agent when an agent claims a
// task. A new row defaults its name to the id and is self-registered
// (configured=0); a human-configured agent (configured=1) keeps its pinned
// name and avatar no matter what the claim sends; otherwise the claim's
// values apply, with empty name/avatar preserving existing ones.
const upsertAgentClaimSQL = `INSERT INTO agents (id, name, avatar, configured) VALUES (?, COALESCE(NULLIF(?, ''), ?), ?, 0)
	ON CONFLICT(id) DO UPDATE SET
		name = CASE WHEN agents.configured = 1 THEN agents.name
		            WHEN ? = '' THEN agents.name
		            ELSE excluded.name END,
		avatar = CASE WHEN agents.configured = 1 THEN agents.avatar
		              ELSE COALESCE(excluded.avatar, agents.avatar) END,
		configured = agents.configured`

// upsertAgentConfigSQL is the human's pre-configuration path (POST /api/agents):
// it always applies the given name/avatar and pins the identity.
const upsertAgentConfigSQL = `INSERT INTO agents (id, name, avatar, configured) VALUES (?, COALESCE(NULLIF(?, ''), ?), ?, 1)
	ON CONFLICT(id) DO UPDATE SET
		name = CASE WHEN ? = '' THEN agents.name ELSE excluded.name END,
		avatar = COALESCE(excluded.avatar, agents.avatar),
		configured = 1`

type execer interface {
	Exec(query string, args ...any) (sql.Result, error)
}

func upsertAgentClaim(exec execer, a Agent) error {
	_, err := exec.Exec(upsertAgentClaimSQL, a.ID, a.Name, a.ID, strPtr(a.Avatar), a.Name)
	return err
}

func upsertAgentConfig(exec execer, a Agent) error {
	_, err := exec.Exec(upsertAgentConfigSQL, a.ID, a.Name, a.ID, strPtr(a.Avatar), a.Name)
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
// name when the update omits one. The identity is pinned: later claims
// by this agent cannot overwrite it.
func (s *Store) UpsertAgent(a Agent) (Agent, error) {
	if err := upsertAgentConfig(s.db, a); err != nil {
		return Agent{}, err
	}
	return s.GetAgent(a.ID)
}
