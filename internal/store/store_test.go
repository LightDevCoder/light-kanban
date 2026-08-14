package store_test

import (
	"errors"
	"path/filepath"
	"testing"
	"time"

	"light-kanban/internal/store"
)

func mustOpen(t *testing.T, path string) *store.Store {
	t.Helper()
	s, err := store.Open(path)
	if err != nil {
		t.Fatalf("store.Open(%q): %v", path, err)
	}
	t.Cleanup(func() { _ = s.Close() })
	return s
}

// Issue 01: opening a fresh database creates the schema, and a task
// round-trips through it with all fields preserved.
func TestOpenCreatesSchemaAndTaskRoundTrip(t *testing.T) {
	s := mustOpen(t, filepath.Join(t.TempDir(), "test.db"))

	desc := "build the board"
	typ := "feature"
	due := time.Now().UTC().Add(48 * time.Hour).Truncate(time.Second)
	in := store.Task{
		ID:            "task-1",
		Title:         "Ship Light-Kanban",
		WorkspacePath: `C:\work\light-kanban`,
		Description:   &desc,
		Status:        store.StatusTodo,
		Type:          &typ,
		Tags:          []string{"go", "board"},
		DueAt:         &due,
	}

	got, err := s.CreateTask(in)
	if err != nil {
		t.Fatalf("CreateTask: %v", err)
	}
	if got.ID != in.ID {
		t.Errorf("ID = %q, want %q", got.ID, in.ID)
	}
	if got.Title != in.Title {
		t.Errorf("Title = %q, want %q", got.Title, in.Title)
	}
	if got.WorkspacePath != in.WorkspacePath {
		t.Errorf("WorkspacePath = %q, want %q", got.WorkspacePath, in.WorkspacePath)
	}
	if got.Status != store.StatusTodo {
		t.Errorf("Status = %q, want %q", got.Status, store.StatusTodo)
	}
	if got.CreatedAt.IsZero() {
		t.Error("CreatedAt should be stamped by the store")
	}
	if !got.UpdatedAt.Equal(got.CreatedAt) {
		t.Errorf("UpdatedAt = %v, want %v (new task)", got.UpdatedAt, got.CreatedAt)
	}
	if got.Description == nil || *got.Description != desc {
		t.Errorf("Description = %v, want %q", got.Description, desc)
	}
	if got.Type == nil || *got.Type != typ {
		t.Errorf("Type = %v, want %q", got.Type, typ)
	}
	if len(got.Tags) != 2 || got.Tags[0] != "go" || got.Tags[1] != "board" {
		t.Errorf("Tags = %v, want [go board]", got.Tags)
	}
	if got.DueAt == nil || got.DueAt.Sub(due) > time.Second {
		t.Errorf("DueAt = %v, want ~%v", got.DueAt, due)
	}
	if got.CompletedAt != nil {
		t.Errorf("CompletedAt = %v, want nil for a new task", got.CompletedAt)
	}
	if got.ClaimedBy != nil {
		t.Errorf("ClaimedBy = %v, want nil for a new task", got.ClaimedBy)
	}

	byID, err := s.GetTask(in.ID)
	if err != nil {
		t.Fatalf("GetTask: %v", err)
	}
	if byID.Title != in.Title || byID.WorkspacePath != in.WorkspacePath {
		t.Errorf("GetTask round trip lost fields: %+v", byID)
	}

	if _, err := s.GetTask("no-such-id"); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("GetTask(no-such-id) = %v, want ErrNotFound", err)
	}
}

// Issue 02: listing returns the created tasks; the archived filter is accepted
// (empty here) and unknown filters are rejected.
func TestListTasksReturnsActiveAndRejectsUnknownFilter(t *testing.T) {
	s := mustOpen(t, filepath.Join(t.TempDir(), "test.db"))

	for _, tc := range []store.Task{
		{ID: "t1", Title: "First", WorkspacePath: "w1"},
		{ID: "t2", Title: "Second", WorkspacePath: "w2"},
	} {
		if _, err := s.CreateTask(tc); err != nil {
			t.Fatalf("CreateTask(%s): %v", tc.ID, err)
		}
	}

	active, err := s.ListTasks("")
	if err != nil {
		t.Fatalf("ListTasks: %v", err)
	}
	if len(active) != 2 {
		t.Fatalf("ListTasks(\"\") = %d tasks, want 2", len(active))
	}
	titles := map[string]bool{}
	for _, task := range active {
		titles[task.Title] = true
		if task.Status != store.StatusTodo {
			t.Errorf("task %s status = %q, want %q", task.ID, task.Status, store.StatusTodo)
		}
	}
	if !titles["First"] || !titles["Second"] {
		t.Errorf("ListTasks missing tasks, got %v", titles)
	}

	archived, err := s.ListTasks(store.StatusArchived)
	if err != nil {
		t.Fatalf("ListTasks(archived): %v", err)
	}
	if len(archived) != 0 {
		t.Errorf("ListTasks(archived) = %d tasks, want 0", len(archived))
	}

	if _, err := s.ListTasks("bogus"); err == nil {
		t.Error("ListTasks(bogus) should error")
	}
}
