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

	// A recurring agent's display name survives a later claim that omits name.
	task4, err := s.CreateTask(store.Task{ID: "t4", Title: "T4", WorkspacePath: "w"})
	if err != nil {
		t.Fatalf("CreateTask: %v", err)
	}
	if _, err := s.Claim(task4.ID, store.Agent{ID: "recurring", Name: "Recurring Agent"}); err != nil {
		t.Fatalf("Claim: %v", err)
	}
	task5, err := s.CreateTask(store.Task{ID: "t5", Title: "T5", WorkspacePath: "w"})
	if err != nil {
		t.Fatalf("CreateTask: %v", err)
	}
	if _, err := s.Claim(task5.ID, store.Agent{ID: "recurring"}); err != nil {
		t.Fatalf("Claim without name: %v", err)
	}
	a4, err := s.GetAgent("recurring")
	if err != nil {
		t.Fatalf("GetAgent: %v", err)
	}
	if a4.Name != "Recurring Agent" {
		t.Errorf("name = %q, want preserved %q (not the id)", a4.Name, "Recurring Agent")
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

// Issue 05: archive (等你确认 → 已归档, records completedAt) and reject
// (等你确认 → 处理中). Archived tasks leave the active list and are queryable
// as history with their completion date.
func TestArchiveRejectHistory(t *testing.T) {
	s := mustOpen(t, filepath.Join(t.TempDir(), "test.db"))

	finish := func(id string) {
		t.Helper()
		if _, err := s.CreateTask(store.Task{ID: id, Title: id, WorkspacePath: "w"}); err != nil {
			t.Fatalf("CreateTask: %v", err)
		}
		if _, err := s.Claim(id, store.Agent{ID: "a1", Name: "Alpha"}); err != nil {
			t.Fatalf("Claim: %v", err)
		}
		if _, err := s.Complete(id); err != nil {
			t.Fatalf("Complete: %v", err)
		}
	}

	finish("arch")
	before := time.Now().UTC()
	archived, err := s.Archive("arch")
	if err != nil {
		t.Fatalf("Archive: %v", err)
	}
	if archived.Status != store.StatusArchived {
		t.Errorf("status = %q, want %q", archived.Status, store.StatusArchived)
	}
	if archived.CompletedAt == nil {
		t.Fatal("CompletedAt not recorded on archive")
	}
	if archived.CompletedAt.Before(before.Add(-time.Minute)) || archived.CompletedAt.After(time.Now().UTC().Add(time.Minute)) {
		t.Errorf("CompletedAt = %v, want ~now", archived.CompletedAt)
	}

	// Wrong-status archive calls conflict.
	if _, err := s.Archive("arch"); !errors.Is(err, store.ErrConflict) {
		t.Errorf("Archive on archived task = %v, want ErrConflict", err)
	}

	// Archived tasks leave the active list…
	active, err := s.ListTasks("")
	if err != nil {
		t.Fatalf("ListTasks: %v", err)
	}
	for _, task := range active {
		if task.ID == "arch" {
			t.Error("archived task still appears in the active list")
		}
	}
	// …and are queryable as history with completedAt.
	history, err := s.ListTasks(store.StatusArchived)
	if err != nil {
		t.Fatalf("ListTasks(archived): %v", err)
	}
	if len(history) != 1 || history[0].ID != "arch" || history[0].CompletedAt == nil {
		t.Errorf("history = %+v, want the archived task with completedAt", history)
	}

	// Reject returns the task to the same agent, without a completion date.
	finish("rej")
	rejected, err := s.Reject("rej")
	if err != nil {
		t.Fatalf("Reject: %v", err)
	}
	if rejected.Status != store.StatusInProgress {
		t.Errorf("after Reject status = %q, want %q", rejected.Status, store.StatusInProgress)
	}
	if rejected.ClaimedBy == nil || *rejected.ClaimedBy != "a1" {
		t.Errorf("claimedBy = %v, want a1 (same agent keeps the task)", rejected.ClaimedBy)
	}
	if rejected.CompletedAt != nil {
		t.Errorf("CompletedAt = %v, want nil after reject", rejected.CompletedAt)
	}
	if _, err := s.Reject("rej"); !errors.Is(err, store.ErrConflict) {
		t.Errorf("Reject on in-progress task = %v, want ErrConflict", err)
	}
	if _, err := s.Archive("missing"); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("Archive on missing task = %v, want ErrNotFound", err)
	}
}

// Issue 06: UpdateTask edits the human-editable fields only, persists them,
// and bumps UpdatedAt; system fields (status, claimedBy, completedAt) are
// never touched; empty strings clear optional fields.
func TestUpdateTaskFields(t *testing.T) {
	s := mustOpen(t, filepath.Join(t.TempDir(), "test.db"))

	desc := "old desc"
	typ := "feature"
	due := time.Now().UTC().Add(48 * time.Hour)
	task, err := s.CreateTask(store.Task{
		ID: "t1", Title: "Old", WorkspacePath: "w1",
		Description: &desc, Type: &typ, Tags: []string{"a"}, DueAt: &due,
	})
	if err != nil {
		t.Fatalf("CreateTask: %v", err)
	}
	if _, err := s.Claim(task.ID, store.Agent{ID: "a1", Name: "Alpha"}); err != nil {
		t.Fatalf("Claim: %v", err)
	}

	newDesc := "new desc"
	newType := "bug"
	newDue := due.Add(24 * time.Hour)
	updated, err := s.UpdateTask(task.ID, store.TaskUpdate{
		Title:         strPtr2("New Title"),
		WorkspacePath: strPtr2("w2"),
		Description:   &newDesc,
		Type:          &newType,
		Tags:          &[]string{"b", "c"},
		DueAt:         &newDue,
	})
	if err != nil {
		t.Fatalf("UpdateTask: %v", err)
	}
	if updated.Title != "New Title" || updated.WorkspacePath != "w2" {
		t.Errorf("title/workspacePath = %q / %q", updated.Title, updated.WorkspacePath)
	}
	if updated.Description == nil || *updated.Description != newDesc {
		t.Errorf("description = %v, want %q", updated.Description, newDesc)
	}
	if updated.Type == nil || *updated.Type != newType {
		t.Errorf("type = %v, want %q", updated.Type, newType)
	}
	if len(updated.Tags) != 2 || updated.Tags[0] != "b" || updated.Tags[1] != "c" {
		t.Errorf("tags = %v, want [b c]", updated.Tags)
	}
	if updated.DueAt == nil || updated.DueAt.Sub(newDue) > time.Second {
		t.Errorf("dueAt = %v, want ~%v", updated.DueAt, newDue)
	}
	if !updated.UpdatedAt.After(task.UpdatedAt) {
		t.Errorf("UpdatedAt not bumped: %v → %v", task.UpdatedAt, updated.UpdatedAt)
	}
	// System fields untouched.
	if updated.Status != store.StatusInProgress {
		t.Errorf("status = %q, want in_progress (system field must survive)", updated.Status)
	}
	if updated.ClaimedBy == nil || *updated.ClaimedBy != "a1" {
		t.Errorf("claimedBy = %v, want a1 (system field must survive)", updated.ClaimedBy)
	}
	if updated.CompletedAt != nil {
		t.Errorf("completedAt = %v, want nil", updated.CompletedAt)
	}

	// Empty strings clear the optional fields; ClearDueAt clears the due date.
	cleared, err := s.UpdateTask(task.ID, store.TaskUpdate{
		Description: strPtr2(""),
		Type:        strPtr2(""),
		Tags:        &[]string{},
		ClearDueAt:  true,
	})
	if err != nil {
		t.Fatalf("UpdateTask(clear): %v", err)
	}
	if cleared.Description != nil || cleared.Type != nil {
		t.Errorf("cleared optional fields = %v / %v, want nil", cleared.Description, cleared.Type)
	}
	if len(cleared.Tags) != 0 {
		t.Errorf("tags = %v, want empty", cleared.Tags)
	}
	if cleared.DueAt != nil {
		t.Errorf("dueAt = %v, want nil after clear", cleared.DueAt)
	}

	// An empty update is a no-op read; unknown ids are not found.
	noop, err := s.UpdateTask(task.ID, store.TaskUpdate{})
	if err != nil || noop.ID != task.ID {
		t.Errorf("empty update = %+v, %v", noop, err)
	}
	if _, err := s.UpdateTask("missing", store.TaskUpdate{Title: strPtr2("X")}); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("UpdateTask(missing) = %v, want ErrNotFound", err)
	}
}

func strPtr2(s string) *string { return &s }

// Issue 06: agents can be pre-configured with id/name/avatar and updated;
// a missing name defaults to the id.
func TestUpsertAgentPreconfigures(t *testing.T) {
	s := mustOpen(t, filepath.Join(t.TempDir(), "test.db"))

	avatar := "🦄"
	a, err := s.UpsertAgent(store.Agent{ID: "pre", Name: "Pre Agent", Avatar: &avatar})
	if err != nil {
		t.Fatalf("UpsertAgent: %v", err)
	}
	if a.ID != "pre" || a.Name != "Pre Agent" || a.Avatar == nil || *a.Avatar != avatar {
		t.Errorf("agent = %+v", a)
	}

	// Upserting again updates the display identity.
	a, err = s.UpsertAgent(store.Agent{ID: "pre", Name: "Pre Agent v2"})
	if err != nil {
		t.Fatalf("UpsertAgent: %v", err)
	}
	if a.Name != "Pre Agent v2" {
		t.Errorf("name = %q, want Pre Agent v2", a.Name)
	}

	// Name defaults to the id.
	a, err = s.UpsertAgent(store.Agent{ID: "nameless"})
	if err != nil {
		t.Fatalf("UpsertAgent: %v", err)
	}
	if a.Name != "nameless" {
		t.Errorf("name = %q, want id as default", a.Name)
	}

	agents, err := s.ListAgents()
	if err != nil {
		t.Fatalf("ListAgents: %v", err)
	}
	if len(agents) != 2 {
		t.Errorf("agents = %d, want 2", len(agents))
	}
}

// Issue 07: recycle moves a stuck 处理中 task back to 待处理, drops the
// claim, and makes it claimable again; wrong-status recycles conflict.
func TestRecycleReturnsToTodo(t *testing.T) {
	s := mustOpen(t, filepath.Join(t.TempDir(), "test.db"))

	task, err := s.CreateTask(store.Task{ID: "t1", Title: "T", WorkspacePath: "w"})
	if err != nil {
		t.Fatalf("CreateTask: %v", err)
	}
	if _, err := s.Claim(task.ID, store.Agent{ID: "a1", Name: "Alpha"}); err != nil {
		t.Fatalf("Claim: %v", err)
	}

	recycled, err := s.Recycle(task.ID)
	if err != nil {
		t.Fatalf("Recycle: %v", err)
	}
	if recycled.Status != store.StatusTodo {
		t.Errorf("status = %q, want %q", recycled.Status, store.StatusTodo)
	}
	if recycled.ClaimedBy != nil {
		t.Errorf("claimedBy = %v, want nil after recycle", recycled.ClaimedBy)
	}

	// The recycled task is claimable again, by any agent.
	reclaimed, err := s.Claim(task.ID, store.Agent{ID: "a2", Name: "Beta"})
	if err != nil {
		t.Fatalf("re-claim after recycle: %v", err)
	}
	if reclaimed.ClaimedBy == nil || *reclaimed.ClaimedBy != "a2" {
		t.Errorf("claimedBy = %v, want a2", reclaimed.ClaimedBy)
	}

	// Recycle applies to 处理中, so a 待处理 task conflicts.
	if _, err := s.Recycle(task.ID); err != nil {
		t.Fatalf("Recycle on in-progress task should succeed: %v", err)
	}
	if _, err := s.Recycle(task.ID); !errors.Is(err, store.ErrConflict) {
		t.Errorf("Recycle on todo task = %v, want ErrConflict", err)
	}
	for _, setup := range []struct {
		id     string
		status store.Status
		move   func(id string) error
	}{
		{id: "t2", status: store.StatusBlocked, move: func(id string) error { _, err := s.Block(id); return err }},
		{id: "t3", status: store.StatusAwaitingConfirmation, move: func(id string) error { _, err := s.Complete(id); return err }},
		{id: "t4", status: store.StatusArchived, move: func(id string) error {
			if _, err := s.Complete(id); err != nil {
				return err
			}
			_, err := s.Archive(id)
			return err
		}},
	} {
		if _, err := s.CreateTask(store.Task{ID: setup.id, Title: setup.id, WorkspacePath: "w"}); err != nil {
			t.Fatalf("CreateTask: %v", err)
		}
		if _, err := s.Claim(setup.id, store.Agent{ID: "a1"}); err != nil {
			t.Fatalf("Claim: %v", err)
		}
		if err := setup.move(setup.id); err != nil {
			t.Fatalf("setup move: %v", err)
		}
		if _, err := s.Recycle(setup.id); !errors.Is(err, store.ErrConflict) {
			t.Errorf("Recycle on %s task = %v, want ErrConflict", setup.status, err)
		}
	}

	if _, err := s.Recycle("missing"); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("Recycle on missing task = %v, want ErrNotFound", err)
	}
}

// Issue 06/user story 6: the human can correct a card's status directly.
// Moving to 待处理 drops the claim; moving to 已归档 records completedAt;
// leaving 已归档 clears it; unknown statuses are rejected.
func TestSetStatusManualCorrection(t *testing.T) {
	s := mustOpen(t, filepath.Join(t.TempDir(), "test.db"))

	task, err := s.CreateTask(store.Task{ID: "t1", Title: "T", WorkspacePath: "w"})
	if err != nil {
		t.Fatalf("CreateTask: %v", err)
	}
	if _, err := s.Claim(task.ID, store.Agent{ID: "a1", Name: "Alpha"}); err != nil {
		t.Fatalf("Claim: %v", err)
	}

	// Human moves a claimed card back to 待处理: the claim is dropped.
	back, err := s.SetStatus(task.ID, store.StatusTodo)
	if err != nil {
		t.Fatalf("SetStatus(todo): %v", err)
	}
	if back.Status != store.StatusTodo || back.ClaimedBy != nil {
		t.Errorf("after SetStatus(todo) = %+v, want todo with no claim", back)
	}

	// Human moves a card straight to 等你确认 without an agent.
	awaiting, err := s.SetStatus(task.ID, store.StatusAwaitingConfirmation)
	if err != nil {
		t.Fatalf("SetStatus(awaiting): %v", err)
	}
	if awaiting.Status != store.StatusAwaitingConfirmation {
		t.Errorf("status = %q, want awaiting_confirmation", awaiting.Status)
	}

	// Moving to 已归档 records the completion date.
	archived, err := s.SetStatus(task.ID, store.StatusArchived)
	if err != nil {
		t.Fatalf("SetStatus(archived): %v", err)
	}
	if archived.Status != store.StatusArchived || archived.CompletedAt == nil {
		t.Errorf("archived = %+v, want archived with completedAt", archived)
	}

	// Leaving 已归档 clears the completion date.
	reopened, err := s.SetStatus(task.ID, store.StatusInProgress)
	if err != nil {
		t.Fatalf("SetStatus(in_progress): %v", err)
	}
	if reopened.Status != store.StatusInProgress || reopened.CompletedAt != nil {
		t.Errorf("reopened = %+v, want in_progress with nil completedAt", reopened)
	}

	if _, err := s.SetStatus(task.ID, "bogus"); err == nil {
		t.Error("SetStatus(bogus) should error")
	}
	if _, err := s.SetStatus("missing", store.StatusTodo); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("SetStatus(missing) = %v, want ErrNotFound", err)
	}
}

// The human can delete a task entirely (correction tool): it disappears from
// the store, and deleting it again is a not-found.
func TestDeleteTask(t *testing.T) {
	s := mustOpen(t, filepath.Join(t.TempDir(), "test.db"))

	task, err := s.CreateTask(store.Task{ID: "t1", Title: "Junk", WorkspacePath: "w"})
	if err != nil {
		t.Fatalf("CreateTask: %v", err)
	}
	if _, err := s.Claim(task.ID, store.Agent{ID: "a1"}); err != nil {
		t.Fatalf("Claim: %v", err)
	}
	deletedID := task.ID

	if err := s.DeleteTask(task.ID); err != nil {
		t.Fatalf("DeleteTask: %v", err)
	}
	if _, err := s.GetTask(task.ID); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("GetTask after delete = %v, want ErrNotFound", err)
	}
	if err := s.DeleteTask(task.ID); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("second DeleteTask = %v, want ErrNotFound", err)
	}

	active, err := s.ListTasks("")
	if err != nil {
		t.Fatalf("ListTasks: %v", err)
	}
	for _, task := range active {
		if task.ID == deletedID {
			t.Error("deleted task still listed")
		}
	}
}
