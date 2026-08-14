package store_test

import (
	"errors"
	"fmt"
	"path/filepath"
	"sync"
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

// Issue 03: claim moves 待处理 → 处理中 and records the agent; a second claim
// conflicts; claiming a missing task is a not-found.
func TestClaimTransitionsAndConflicts(t *testing.T) {
	s := mustOpen(t, filepath.Join(t.TempDir(), "test.db"))
	task, err := s.CreateTask(store.Task{ID: "t1", Title: "T", WorkspacePath: "w"})
	if err != nil {
		t.Fatalf("CreateTask: %v", err)
	}

	claimed, err := s.Claim(task.ID, store.Agent{ID: "a1", Name: "Alpha"})
	if err != nil {
		t.Fatalf("Claim: %v", err)
	}
	if claimed.Status != store.StatusInProgress {
		t.Errorf("status = %q, want %q", claimed.Status, store.StatusInProgress)
	}
	if claimed.ClaimedBy == nil || *claimed.ClaimedBy != "a1" {
		t.Errorf("claimedBy = %v, want a1", claimed.ClaimedBy)
	}

	if _, err := s.Claim(task.ID, store.Agent{ID: "a2"}); !errors.Is(err, store.ErrConflict) {
		t.Fatalf("second claim = %v, want ErrConflict", err)
	}
	if _, err := s.Claim("missing", store.Agent{ID: "a3"}); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("claim on missing task = %v, want ErrNotFound", err)
	}
}

// Issue 03: two (or more) concurrent claims on the same task → exactly one
// winner, all others conflict. This is the atomicity guarantee.
func TestClaimConcurrentSingleWinner(t *testing.T) {
	s := mustOpen(t, filepath.Join(t.TempDir(), "test.db"))
	task, err := s.CreateTask(store.Task{ID: "t1", Title: "T", WorkspacePath: "w"})
	if err != nil {
		t.Fatalf("CreateTask: %v", err)
	}

	const n = 8
	errs := make(chan error, n)
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, err := s.Claim(task.ID, store.Agent{ID: fmt.Sprintf("agent-%d", i), Name: fmt.Sprintf("Agent %d", i)})
			errs <- err
		}(i)
	}
	wg.Wait()
	close(errs)

	wins, conflicts := 0, 0
	for err := range errs {
		switch {
		case err == nil:
			wins++
		case errors.Is(err, store.ErrConflict):
			conflicts++
		default:
			t.Fatalf("unexpected claim error: %v", err)
		}
	}
	if wins != 1 {
		t.Fatalf("winners = %d, want exactly 1", wins)
	}
	if conflicts != n-1 {
		t.Fatalf("conflicts = %d, want %d", conflicts, n-1)
	}
	got, err := s.GetTask(task.ID)
	if err != nil {
		t.Fatalf("GetTask: %v", err)
	}
	if got.ClaimedBy == nil {
		t.Fatal("the winning claim did not record claimedBy")
	}
}

// Issue 03: an unknown agent self-registers on claim (id + name + avatar,
// or a default name derived from the id), and a pre-configured avatar
// survives a claim that omits avatar.
func TestClaimSelfRegistersUnknownAgent(t *testing.T) {
	s := mustOpen(t, filepath.Join(t.TempDir(), "test.db"))

	avatar := "🤖"
	task, err := s.CreateTask(store.Task{ID: "t1", Title: "T", WorkspacePath: "w"})
	if err != nil {
		t.Fatalf("CreateTask: %v", err)
	}
	if _, err := s.Claim(task.ID, store.Agent{ID: "newbie", Name: "Newbie", Avatar: &avatar}); err != nil {
		t.Fatalf("Claim: %v", err)
	}
	a, err := s.GetAgent("newbie")
	if err != nil {
		t.Fatalf("GetAgent: %v", err)
	}
	if a.Name != "Newbie" {
		t.Errorf("name = %q, want Newbie", a.Name)
	}
	if a.Avatar == nil || *a.Avatar != avatar {
		t.Errorf("avatar = %v, want %q", a.Avatar, avatar)
	}

	// A second agent with no name gets one derived from its id.
	task2, err := s.CreateTask(store.Task{ID: "t2", Title: "T2", WorkspacePath: "w"})
	if err != nil {
		t.Fatalf("CreateTask: %v", err)
	}
	if _, err := s.Claim(task2.ID, store.Agent{ID: "noname"}); err != nil {
		t.Fatalf("Claim: %v", err)
	}
	a2, err := s.GetAgent("noname")
	if err != nil {
		t.Fatalf("GetAgent: %v", err)
	}
	if a2.Name != "noname" {
		t.Errorf("name = %q, want the id as default", a2.Name)
	}

	// A pre-configured avatar survives a claim that omits avatar.
	pre := "🦊"
	if _, err := s.UpsertAgent(store.Agent{ID: "fox", Name: "Fox", Avatar: &pre}); err != nil {
		t.Fatalf("UpsertAgent: %v", err)
	}
	task3, err := s.CreateTask(store.Task{ID: "t3", Title: "T3", WorkspacePath: "w"})
	if err != nil {
		t.Fatalf("CreateTask: %v", err)
	}
	if _, err := s.Claim(task3.ID, store.Agent{ID: "fox", Name: "Fox"}); err != nil {
		t.Fatalf("Claim: %v", err)
	}
	a3, err := s.GetAgent("fox")
	if err != nil {
		t.Fatalf("GetAgent: %v", err)
	}
	if a3.Avatar == nil || *a3.Avatar != pre {
		t.Errorf("avatar = %v, want preserved %q", a3.Avatar, pre)
	}
}

// Issue 04: block (处理中 → 遇到阻碍), unblock (遇到阻碍 → 处理中) and
// complete (处理中 → 等你确认), each rejecting calls from the wrong status.
func TestBlockUnblockComplete(t *testing.T) {
	s := mustOpen(t, filepath.Join(t.TempDir(), "test.db"))
	task, err := s.CreateTask(store.Task{ID: "t1", Title: "T", WorkspacePath: "w"})
	if err != nil {
		t.Fatalf("CreateTask: %v", err)
	}
	if _, err := s.Claim(task.ID, store.Agent{ID: "a1", Name: "Alpha"}); err != nil {
		t.Fatalf("Claim: %v", err)
	}

	blocked, err := s.Block(task.ID)
	if err != nil {
		t.Fatalf("Block: %v", err)
	}
	if blocked.Status != store.StatusBlocked {
		t.Errorf("after Block status = %q, want %q", blocked.Status, store.StatusBlocked)
	}

	// Wrong-status calls conflict: blocking an already-blocked task, and
	// completing a blocked task.
	if _, err := s.Block(task.ID); !errors.Is(err, store.ErrConflict) {
		t.Errorf("Block on blocked task = %v, want ErrConflict", err)
	}
	if _, err := s.Complete(task.ID); !errors.Is(err, store.ErrConflict) {
		t.Errorf("Complete on blocked task = %v, want ErrConflict", err)
	}

	unblocked, err := s.Unblock(task.ID)
	if err != nil {
		t.Fatalf("Unblock: %v", err)
	}
	if unblocked.Status != store.StatusInProgress {
		t.Errorf("after Unblock status = %q, want %q", unblocked.Status, store.StatusInProgress)
	}

	completed, err := s.Complete(task.ID)
	if err != nil {
		t.Fatalf("Complete: %v", err)
	}
	if completed.Status != store.StatusAwaitingConfirmation {
		t.Errorf("after Complete status = %q, want %q", completed.Status, store.StatusAwaitingConfirmation)
	}

	// Wrong-status calls on the completed task.
	if _, err := s.Complete(task.ID); !errors.Is(err, store.ErrConflict) {
		t.Errorf("Complete on completed task = %v, want ErrConflict", err)
	}
	if _, err := s.Unblock(task.ID); !errors.Is(err, store.ErrConflict) {
		t.Errorf("Unblock on completed task = %v, want ErrConflict", err)
	}

	// Transitions on an unclaimed 待处理 task conflict too.
	task2, err := s.CreateTask(store.Task{ID: "t2", Title: "T2", WorkspacePath: "w"})
	if err != nil {
		t.Fatalf("CreateTask: %v", err)
	}
	if _, err := s.Block(task2.ID); !errors.Is(err, store.ErrConflict) {
		t.Errorf("Block on todo task = %v, want ErrConflict", err)
	}
	if _, err := s.Complete(task2.ID); !errors.Is(err, store.ErrConflict) {
		t.Errorf("Complete on todo task = %v, want ErrConflict", err)
	}
}
