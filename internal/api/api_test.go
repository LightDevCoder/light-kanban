package api_test

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"light-kanban/internal/api"
	"light-kanban/internal/store"
	"light-kanban/internal/webui"
)

// newServer spins up the full HTTP server over a fresh SQLite database —
// the API seam. All tests in this package go through real HTTP requests.
func newServer(t *testing.T) *httptest.Server {
	t.Helper()
	s, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })
	ts := httptest.NewServer(api.New(s, webui.FS))
	t.Cleanup(ts.Close)
	return ts
}

// Issue 01: GET /api/health confirms the service and its database are up.
func TestHealth(t *testing.T) {
	ts := newServer(t)

	resp, err := http.Get(ts.URL + "/api/health")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("health status = %d, want 200", resp.StatusCode)
	}
	var body map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decode health body: %v", err)
	}
	if body["status"] != "ok" {
		t.Errorf(`body["status"] = %q, want "ok"`, body["status"])
	}
	if body["db"] != "ok" {
		t.Errorf(`body["db"] = %q, want "ok"`, body["db"])
	}
}

// Issue 01: the embedded web UI shell is served at the root.
func TestUIShellServed(t *testing.T) {
	ts := newServer(t)

	resp, err := http.Get(ts.URL + "/")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET / status = %d, want 200", resp.StatusCode)
	}
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), "Light-Kanban") {
		t.Error("UI shell does not contain the board title")
	}
}

// do performs a request with an optional JSON body and returns status + body.
func do(t *testing.T, method, url, body string) (int, []byte) {
	t.Helper()
	var rdr io.Reader
	if body != "" {
		rdr = strings.NewReader(body)
	}
	req, err := http.NewRequest(method, url, rdr)
	if err != nil {
		t.Fatal(err)
	}
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	return resp.StatusCode, raw
}

func decodeTask(t *testing.T, raw []byte) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatalf("decode task %q: %v", raw, err)
	}
	return m
}

// Issue 02: POST /api/tasks creates a task in 待处理 with all fields.
func TestCreateTask(t *testing.T) {
	ts := newServer(t)

	body := `{
		"title": "Ship the board",
		"workspacePath": "C:\\work\\board",
		"description": "build the four columns",
		"type": "feature",
		"tags": ["go", "ui"],
		"dueAt": "2026-09-01T00:00:00Z"
	}`
	status, raw := do(t, http.MethodPost, ts.URL+"/api/tasks", body)
	if status != http.StatusCreated {
		t.Fatalf("POST /api/tasks status = %d, want 201 (body: %s)", status, raw)
	}
	task := decodeTask(t, raw)
	if id, _ := task["id"].(string); id == "" {
		t.Error("created task has no id")
	}
	if task["status"] != "todo" {
		t.Errorf("status = %v, want todo", task["status"])
	}
	if task["title"] != "Ship the board" {
		t.Errorf("title = %v", task["title"])
	}
	if task["workspacePath"] != `C:\work\board` {
		t.Errorf("workspacePath = %v", task["workspacePath"])
	}
	if task["description"] != "build the four columns" {
		t.Errorf("description = %v", task["description"])
	}
	if task["type"] != "feature" {
		t.Errorf("type = %v", task["type"])
	}
	tags, ok := task["tags"].([]any)
	if !ok || len(tags) != 2 || tags[0] != "go" || tags[1] != "ui" {
		t.Errorf("tags = %v", task["tags"])
	}
	if _, err := time.Parse(time.RFC3339, task["dueAt"].(string)); err != nil {
		t.Errorf("dueAt = %v, want RFC3339: %v", task["dueAt"], err)
	}
	if task["claimedBy"] != nil {
		t.Errorf("claimedBy = %v, want null", task["claimedBy"])
	}
	if task["completedAt"] != nil {
		t.Errorf("completedAt = %v, want null", task["completedAt"])
	}
}

// Issue 02: a task without a title or without a workspacePath is rejected.
func TestCreateTaskRequiresTitleAndWorkspacePath(t *testing.T) {
	ts := newServer(t)

	for name, body := range map[string]string{
		"missing title":         `{"workspacePath": "C:\\work\\x"}`,
		"blank title":           `{"title": "   ", "workspacePath": "C:\\work\\x"}`,
		"missing workspacePath": `{"title": "Some task"}`,
		"blank workspacePath":   `{"title": "Some task", "workspacePath": ""}`,
	} {
		status, raw := do(t, http.MethodPost, ts.URL+"/api/tasks", body)
		if status != http.StatusUnprocessableEntity {
			t.Errorf("%s: status = %d, want 422 (body: %s)", name, status, raw)
		}
		var errBody map[string]string
		if err := json.Unmarshal(raw, &errBody); err != nil || errBody["error"] == "" {
			t.Errorf("%s: body %q has no error message", name, raw)
		}
	}

	status, raw := do(t, http.MethodPost, ts.URL+"/api/tasks", `{"title": `)
	if status != http.StatusBadRequest {
		t.Errorf("malformed JSON: status = %d, want 400 (body: %s)", status, raw)
	}

	status, _ = do(t, http.MethodPost, ts.URL+"/api/tasks",
		`{"title": "T", "workspacePath": "W", "dueAt": "not-a-date"}`)
	if status != http.StatusUnprocessableEntity {
		t.Errorf("bad dueAt: status = %d, want 422", status)
	}
}

// Issue 02: GET /api/tasks returns the created tasks with all fields.
func TestListTasks(t *testing.T) {
	ts := newServer(t)

	status, raw := do(t, http.MethodPost, ts.URL+"/api/tasks", `{"title": "A", "workspacePath": "wa"}`)
	if status != http.StatusCreated {
		t.Fatalf("create A: status = %d (body: %s)", status, raw)
	}
	status, raw = do(t, http.MethodPost, ts.URL+"/api/tasks", `{"title": "B", "workspacePath": "wb", "tags": ["urgent"]}`)
	if status != http.StatusCreated {
		t.Fatalf("create B: status = %d (body: %s)", status, raw)
	}

	status, raw = do(t, http.MethodGet, ts.URL+"/api/tasks", "")
	if status != http.StatusOK {
		t.Fatalf("GET /api/tasks status = %d, want 200", status)
	}
	var tasks []map[string]any
	if err := json.Unmarshal(raw, &tasks); err != nil {
		t.Fatalf("decode list: %v", err)
	}
	if len(tasks) != 2 {
		t.Fatalf("list has %d tasks, want 2", len(tasks))
	}
	for _, task := range tasks {
		if task["status"] != "todo" {
			t.Errorf("task %v status = %v, want todo", task["title"], task["status"])
		}
		if task["title"] == "A" && task["workspacePath"] != "wa" {
			t.Errorf("task A workspacePath = %v", task["workspacePath"])
		}
		if task["title"] == "B" {
			tags, _ := task["tags"].([]any)
			if len(tags) != 1 || tags[0] != "urgent" {
				t.Errorf("task B tags = %v", task["tags"])
			}
		}
	}

	// Archived filter: nothing archived yet, so an empty (not null) array.
	status, raw = do(t, http.MethodGet, ts.URL+"/api/tasks?status=archived", "")
	if status != http.StatusOK {
		t.Fatalf("GET archived status = %d, want 200", status)
	}
	if strings.TrimSpace(string(raw)) != "[]" {
		t.Errorf("archived list = %s, want []", raw)
	}

	status, raw = do(t, http.MethodGet, ts.URL+"/api/tasks?status=bogus", "")
	if status != http.StatusBadRequest {
		t.Errorf("bogus status filter: status = %d, want 400 (body: %s)", status, raw)
	}
}

// createTask is a helper: POST a minimal task and return its id.
func createTask(t *testing.T, ts *httptest.Server, title string) string {
	t.Helper()
	status, raw := do(t, http.MethodPost, ts.URL+"/api/tasks", `{"title":"`+title+`","workspacePath":"wa"}`)
	if status != http.StatusCreated {
		t.Fatalf("create %s: status = %d (body: %s)", title, status, raw)
	}
	return decodeTask(t, raw)["id"].(string)
}

// Issue 03: claim moves a 待处理 task to 处理中 and records claimedBy.
func TestClaim(t *testing.T) {
	ts := newServer(t)
	id := createTask(t, ts, "A")

	status, raw := do(t, http.MethodPost, ts.URL+"/api/tasks/"+id+"/claim",
		`{"agentId":"a1","name":"Alpha","avatar":"🤖"}`)
	if status != http.StatusOK {
		t.Fatalf("claim status = %d, want 200 (body: %s)", status, raw)
	}
	task := decodeTask(t, raw)
	if task["status"] != "in_progress" {
		t.Errorf("status = %v, want in_progress", task["status"])
	}
	if task["claimedBy"] != "a1" {
		t.Errorf("claimedBy = %v, want a1", task["claimedBy"])
	}

	// The board list reflects the move.
	_, raw = do(t, http.MethodGet, ts.URL+"/api/tasks", "")
	var tasks []map[string]any
	if err := json.Unmarshal(raw, &tasks); err != nil {
		t.Fatal(err)
	}
	if len(tasks) != 1 || tasks[0]["status"] != "in_progress" || tasks[0]["claimedBy"] != "a1" {
		t.Errorf("board list after claim = %s", raw)
	}
}

// Issue 03: claiming a task not in 待处理 returns a conflict (no state
// change); unknown ids are 404; missing agentId is 422.
func TestClaimRejectsWrongStatus(t *testing.T) {
	ts := newServer(t)
	id := createTask(t, ts, "A")

	do(t, http.MethodPost, ts.URL+"/api/tasks/"+id+"/claim", `{"agentId":"a1"}`)

	status, raw := do(t, http.MethodPost, ts.URL+"/api/tasks/"+id+"/claim", `{"agentId":"a2"}`)
	if status != http.StatusConflict {
		t.Fatalf("second claim status = %d, want 409 (body: %s)", status, raw)
	}
	var errBody map[string]string
	if err := json.Unmarshal(raw, &errBody); err != nil || errBody["error"] == "" {
		t.Errorf("conflict body %q has no error message", raw)
	}

	status, raw = do(t, http.MethodPost, ts.URL+"/api/tasks/no-such/claim", `{"agentId":"a1"}`)
	if status != http.StatusNotFound {
		t.Errorf("claim on missing task status = %d, want 404 (body: %s)", status, raw)
	}

	status, raw = do(t, http.MethodPost, ts.URL+"/api/tasks/"+id+"/claim", `{}`)
	if status != http.StatusUnprocessableEntity {
		t.Errorf("claim without agentId status = %d, want 422 (body: %s)", status, raw)
	}
}

// Issue 03: an unknown agent self-registers when it claims (its identity is
// then visible through GET /api/agents).
func TestClaimSelfRegistersAgent(t *testing.T) {
	ts := newServer(t)
	id := createTask(t, ts, "A")

	status, raw := do(t, http.MethodPost, ts.URL+"/api/tasks/"+id+"/claim",
		`{"agentId":"newbie","name":"Newbie","avatar":"🦊"}`)
	if status != http.StatusOK {
		t.Fatalf("claim status = %d (body: %s)", status, raw)
	}

	status, raw = do(t, http.MethodGet, ts.URL+"/api/agents", "")
	if status != http.StatusOK {
		t.Fatalf("GET /api/agents status = %d, want 200", status)
	}
	var agents []map[string]any
	if err := json.Unmarshal(raw, &agents); err != nil {
		t.Fatal(err)
	}
	if len(agents) != 1 {
		t.Fatalf("agents = %s, want exactly the self-registered agent", raw)
	}
	if agents[0]["id"] != "newbie" || agents[0]["name"] != "Newbie" || agents[0]["avatar"] != "🦊" {
		t.Errorf("self-registered agent = %s", raw)
	}
}

// Issue 04: block / unblock / complete move the card through the lifecycle,
// each rejecting calls from the wrong status with a conflict.
func TestBlockUnblockComplete(t *testing.T) {
	ts := newServer(t)
	id := createTask(t, ts, "A")
	do(t, http.MethodPost, ts.URL+"/api/tasks/"+id+"/claim", `{"agentId":"a1"}`)

	status, raw := do(t, http.MethodPost, ts.URL+"/api/tasks/"+id+"/block", "")
	if status != http.StatusOK {
		t.Fatalf("block status = %d, want 200 (body: %s)", status, raw)
	}
	if decodeTask(t, raw)["status"] != "blocked" {
		t.Errorf("after block: %s", raw)
	}

	status, raw = do(t, http.MethodPost, ts.URL+"/api/tasks/"+id+"/block", "")
	if status != http.StatusConflict {
		t.Errorf("block on blocked task status = %d, want 409 (body: %s)", status, raw)
	}
	var errBody map[string]string
	if err := json.Unmarshal(raw, &errBody); err != nil || errBody["error"] == "" {
		t.Errorf("conflict body %q has no error message", raw)
	}

	status, raw = do(t, http.MethodPost, ts.URL+"/api/tasks/"+id+"/unblock", "")
	if status != http.StatusOK || decodeTask(t, raw)["status"] != "in_progress" {
		t.Fatalf("unblock = %d %s", status, raw)
	}

	status, raw = do(t, http.MethodPost, ts.URL+"/api/tasks/"+id+"/complete", "")
	if status != http.StatusOK {
		t.Fatalf("complete status = %d, want 200 (body: %s)", status, raw)
	}
	task := decodeTask(t, raw)
	if task["status"] != "awaiting_confirmation" {
		t.Errorf("after complete status = %v, want awaiting_confirmation", task["status"])
	}

	status, raw = do(t, http.MethodPost, ts.URL+"/api/tasks/"+id+"/complete", "")
	if status != http.StatusConflict {
		t.Errorf("complete on completed task status = %d, want 409 (body: %s)", status, raw)
	}

	// Transitions on a 待处理 (unclaimed) task conflict.
	id2 := createTask(t, ts, "B")
	status, _ = do(t, http.MethodPost, ts.URL+"/api/tasks/"+id2+"/block", "")
	if status != http.StatusConflict {
		t.Errorf("block on todo task status = %d, want 409", status)
	}
	status, _ = do(t, http.MethodPost, ts.URL+"/api/tasks/"+id2+"/complete", "")
	if status != http.StatusConflict {
		t.Errorf("complete on todo task status = %d, want 409", status)
	}

	// Unknown id.
	status, raw = do(t, http.MethodPost, ts.URL+"/api/tasks/no-such/block", "")
	if status != http.StatusNotFound {
		t.Errorf("block on missing task status = %d, want 404 (body: %s)", status, raw)
	}

	// The board list reflects each move (card sits in the right column).
	_, raw = do(t, http.MethodGet, ts.URL+"/api/tasks", "")
	var tasks []map[string]any
	if err := json.Unmarshal(raw, &tasks); err != nil {
		t.Fatal(err)
	}
	byTitle := map[string]string{}
	for _, task := range tasks {
		byTitle[task["title"].(string)] = task["status"].(string)
	}
	if byTitle["A"] != "awaiting_confirmation" {
		t.Errorf("task A status in list = %q, want awaiting_confirmation", byTitle["A"])
	}
	if byTitle["B"] != "todo" {
		t.Errorf("task B status in list = %q, want todo", byTitle["B"])
	}
}

// driveToAwaiting claims and completes a task so it sits in 等你确认.
func driveToAwaiting(t *testing.T, ts *httptest.Server, id string) {
	t.Helper()
	do(t, http.MethodPost, ts.URL+"/api/tasks/"+id+"/claim", `{"agentId":"a1","name":"Alpha"}`)
	status, raw := do(t, http.MethodPost, ts.URL+"/api/tasks/"+id+"/complete", "")
	if status != http.StatusOK {
		t.Fatalf("complete: status = %d (body: %s)", status, raw)
	}
}

// Issue 05: archive moves 等你确认 → 已归档 and records completedAt; the task
// leaves the four-column board and appears in archived history.
func TestArchiveRecordsCompletionAndHistory(t *testing.T) {
	ts := newServer(t)
	id := createTask(t, ts, "Done")
	driveToAwaiting(t, ts, id)

	status, raw := do(t, http.MethodPost, ts.URL+"/api/tasks/"+id+"/archive", "")
	if status != http.StatusOK {
		t.Fatalf("archive status = %d, want 200 (body: %s)", status, raw)
	}
	task := decodeTask(t, raw)
	if task["status"] != "archived" {
		t.Errorf("status = %v, want archived", task["status"])
	}
	completedAt, ok := task["completedAt"].(string)
	if !ok {
		t.Fatalf("completedAt missing: %s", raw)
	}
	if _, err := time.Parse(time.RFC3339, completedAt); err != nil {
		t.Errorf("completedAt = %q, want RFC3339: %v", completedAt, err)
	}

	// Gone from the active board…
	_, raw = do(t, http.MethodGet, ts.URL+"/api/tasks", "")
	var active []map[string]any
	if err := json.Unmarshal(raw, &active); err != nil {
		t.Fatal(err)
	}
	for _, task := range active {
		if task["id"] == id {
			t.Error("archived task still appears in the active board")
		}
	}

	// …queryable in history with its completion date.
	_, raw = do(t, http.MethodGet, ts.URL+"/api/tasks?status=archived", "")
	var history []map[string]any
	if err := json.Unmarshal(raw, &history); err != nil {
		t.Fatal(err)
	}
	if len(history) != 1 || history[0]["id"] != id {
		t.Fatalf("history = %s, want the archived task", raw)
	}
	if history[0]["completedAt"] != completedAt {
		t.Errorf("history completedAt = %v, want %v", history[0]["completedAt"], completedAt)
	}
}

// Issue 05: reject sends a 等你确认 task back to 处理中 with the same agent.
func TestRejectReturnsToInProgress(t *testing.T) {
	ts := newServer(t)
	id := createTask(t, ts, "Revise me")
	driveToAwaiting(t, ts, id)

	status, raw := do(t, http.MethodPost, ts.URL+"/api/tasks/"+id+"/reject", "")
	if status != http.StatusOK {
		t.Fatalf("reject status = %d, want 200 (body: %s)", status, raw)
	}
	task := decodeTask(t, raw)
	if task["status"] != "in_progress" {
		t.Errorf("status = %v, want in_progress", task["status"])
	}
	if task["claimedBy"] != "a1" {
		t.Errorf("claimedBy = %v, want a1 (same agent keeps the task)", task["claimedBy"])
	}
	if task["completedAt"] != nil {
		t.Errorf("completedAt = %v, want null after reject", task["completedAt"])
	}
}

// Issue 05: review endpoints reject calls from the wrong status.
func TestReviewRejectsWrongStatus(t *testing.T) {
	ts := newServer(t)
	id := createTask(t, ts, "A")

	// 待处理 task: neither archive nor reject applies.
	status, raw := do(t, http.MethodPost, ts.URL+"/api/tasks/"+id+"/archive", "")
	if status != http.StatusConflict {
		t.Errorf("archive on todo status = %d, want 409 (body: %s)", status, raw)
	}
	status, raw = do(t, http.MethodPost, ts.URL+"/api/tasks/"+id+"/reject", "")
	if status != http.StatusConflict {
		t.Errorf("reject on todo status = %d, want 409 (body: %s)", status, raw)
	}

	// 处理中 task: archive conflicts.
	do(t, http.MethodPost, ts.URL+"/api/tasks/"+id+"/claim", `{"agentId":"a1"}`)
	status, raw = do(t, http.MethodPost, ts.URL+"/api/tasks/"+id+"/archive", "")
	if status != http.StatusConflict {
		t.Errorf("archive on in_progress status = %d, want 409 (body: %s)", status, raw)
	}

	// Unknown id.
	status, _ = do(t, http.MethodPost, ts.URL+"/api/tasks/no-such/archive", "")
	if status != http.StatusNotFound {
		t.Errorf("archive on missing task status = %d, want 404", status)
	}
}

// Issue 06: PATCH /api/tasks/:id edits the human-editable fields and
// persists them; system fields are never touched.
func TestPatchTask(t *testing.T) {
	ts := newServer(t)
	id := createTask(t, ts, "Old")

	status, raw := do(t, http.MethodPatch, ts.URL+"/api/tasks/"+id,
		`{"title":"New Title","type":"bug","tags":["x","y"],"dueAt":"2026-12-01T00:00:00Z"}`)
	if status != http.StatusOK {
		t.Fatalf("PATCH status = %d, want 200 (body: %s)", status, raw)
	}
	task := decodeTask(t, raw)
	if task["title"] != "New Title" {
		t.Errorf("title = %v, want New Title", task["title"])
	}
	if task["type"] != "bug" {
		t.Errorf("type = %v, want bug", task["type"])
	}
	tags, _ := task["tags"].([]any)
	if len(tags) != 2 || tags[0] != "x" || tags[1] != "y" {
		t.Errorf("tags = %v", task["tags"])
	}
	if task["dueAt"] != "2026-12-01T00:00:00Z" {
		t.Errorf("dueAt = %v", task["dueAt"])
	}
	if task["status"] != "todo" {
		t.Errorf("status = %v, want todo (system field)", task["status"])
	}
	if task["claimedBy"] != nil {
		t.Errorf("claimedBy = %v, want null (system field)", task["claimedBy"])
	}

	// Empty string clears an optional field; null leaves it unchanged.
	status, raw = do(t, http.MethodPatch, ts.URL+"/api/tasks/"+id, `{"description":""}`)
	if status != http.StatusOK {
		t.Fatalf("PATCH clear description status = %d (body: %s)", status, raw)
	}
	task = decodeTask(t, raw)
	if task["description"] != nil {
		t.Errorf("description = %v, want null after clearing", task["description"])
	}
	status, raw = do(t, http.MethodPatch, ts.URL+"/api/tasks/"+id, `{"description":null}`)
	if status != http.StatusOK {
		t.Fatalf("PATCH null description status = %d (body: %s)", status, raw)
	}
	task = decodeTask(t, raw)
	if task["description"] != nil {
		t.Errorf("description = %v, want null (null means unchanged)", task["description"])
	}
	status, raw = do(t, http.MethodPatch, ts.URL+"/api/tasks/"+id, `{"dueAt":""}`)
	if status != http.StatusOK {
		t.Fatalf("PATCH clear dueAt status = %d (body: %s)", status, raw)
	}
	task = decodeTask(t, raw)
	if task["dueAt"] != nil {
		t.Errorf("dueAt = %v, want null after clearing", task["dueAt"])
	}

	// Validation: blank title/workspacePath, malformed dueAt, bad JSON.
	status, raw = do(t, http.MethodPatch, ts.URL+"/api/tasks/"+id, `{"title":"  "}`)
	if status != http.StatusUnprocessableEntity {
		t.Errorf("blank title status = %d, want 422 (body: %s)", status, raw)
	}
	status, _ = do(t, http.MethodPatch, ts.URL+"/api/tasks/"+id, `{"workspacePath":""}`)
	if status != http.StatusUnprocessableEntity {
		t.Errorf("blank workspacePath status = %d, want 422", status)
	}
	status, _ = do(t, http.MethodPatch, ts.URL+"/api/tasks/"+id, `{"dueAt":"nope"}`)
	if status != http.StatusUnprocessableEntity {
		t.Errorf("bad dueAt status = %d, want 422", status)
	}
	status, _ = do(t, http.MethodPatch, ts.URL+"/api/tasks/"+id, `{broken`)
	if status != http.StatusBadRequest {
		t.Errorf("malformed JSON status = %d, want 400", status)
	}
	status, _ = do(t, http.MethodPatch, ts.URL+"/api/tasks/no-such", `{"title":"X"}`)
	if status != http.StatusNotFound {
		t.Errorf("PATCH missing task status = %d, want 404", status)
	}
}

// Issue 06/user story 6: PATCH can also correct a card's status manually —
// the human overrides the state machine to fix wrong state.
func TestPatchStatusManualCorrection(t *testing.T) {
	ts := newServer(t)
	id := createTask(t, ts, "Correct me")

	// Straight to 等你确认 without any claim (human override).
	status, raw := do(t, http.MethodPatch, ts.URL+"/api/tasks/"+id, `{"status":"awaiting_confirmation"}`)
	if status != http.StatusOK {
		t.Fatalf("PATCH status = %d, want 200 (body: %s)", status, raw)
	}
	task := decodeTask(t, raw)
	if task["status"] != "awaiting_confirmation" {
		t.Errorf("status = %v, want awaiting_confirmation", task["status"])
	}

	// Moving to 已归档 records the completion date and leaves the board.
	status, raw = do(t, http.MethodPatch, ts.URL+"/api/tasks/"+id, `{"status":"archived"}`)
	if status != http.StatusOK {
		t.Fatalf("PATCH to archived status = %d (body: %s)", status, raw)
	}
	task = decodeTask(t, raw)
	if task["status"] != "archived" || task["completedAt"] == nil {
		t.Errorf("archived task = %s, want archived with completedAt", raw)
	}
	_, raw = do(t, http.MethodGet, ts.URL+"/api/tasks", "")
	var active []map[string]any
	if err := json.Unmarshal(raw, &active); err != nil {
		t.Fatal(err)
	}
	if len(active) != 0 {
		t.Errorf("active board = %s, want empty after manual archive", raw)
	}
	_, raw = do(t, http.MethodGet, ts.URL+"/api/tasks?status=archived", "")
	var history []map[string]any
	if err := json.Unmarshal(raw, &history); err != nil {
		t.Fatal(err)
	}
	if len(history) != 1 || history[0]["id"] != id {
		t.Errorf("history = %s, want the manually archived task", raw)
	}

	// Reopen it: back on the board without a completion date.
	status, raw = do(t, http.MethodPatch, ts.URL+"/api/tasks/"+id, `{"status":"in_progress"}`)
	if status != http.StatusOK {
		t.Fatalf("PATCH reopen status = %d (body: %s)", status, raw)
	}
	task = decodeTask(t, raw)
	if task["status"] != "in_progress" || task["completedAt"] != nil {
		t.Errorf("reopened = %s, want in_progress with null completedAt", raw)
	}

	// Unknown status token rejected.
	status, raw = do(t, http.MethodPatch, ts.URL+"/api/tasks/"+id, `{"status":"bogus"}`)
	if status != http.StatusUnprocessableEntity {
		t.Errorf("bogus status = %d, want 422 (body: %s)", status, raw)
	}
}

// Issue 06: POST /api/agents pre-configures an agent whose identity later
// claims display; upserting updates the display.
func TestPreconfigureAgent(t *testing.T) {
	ts := newServer(t)

	status, raw := do(t, http.MethodPost, ts.URL+"/api/agents",
		`{"id":"pre","name":"Pre Agent","avatar":"🦄"}`)
	if status != http.StatusOK {
		t.Fatalf("POST /api/agents status = %d, want 200 (body: %s)", status, raw)
	}

	status, raw = do(t, http.MethodGet, ts.URL+"/api/agents", "")
	if status != http.StatusOK {
		t.Fatalf("GET /api/agents status = %d", status)
	}
	var agents []map[string]any
	if err := json.Unmarshal(raw, &agents); err != nil {
		t.Fatal(err)
	}
	if len(agents) != 1 || agents[0]["id"] != "pre" || agents[0]["name"] != "Pre Agent" || agents[0]["avatar"] != "🦄" {
		t.Errorf("agents = %s", raw)
	}

	// Upsert updates the display identity (avatar change).
	status, raw = do(t, http.MethodPost, ts.URL+"/api/agents",
		`{"id":"pre","name":"Pre Agent","avatar":"🐉"}`)
	if status != http.StatusOK {
		t.Fatalf("re-POST status = %d (body: %s)", status, raw)
	}
	_, raw = do(t, http.MethodGet, ts.URL+"/api/agents", "")
	if err := json.Unmarshal(raw, &agents); err != nil {
		t.Fatal(err)
	}
	if len(agents) != 1 || agents[0]["avatar"] != "🐉" {
		t.Errorf("agents after upsert = %s", raw)
	}

	// Validation: id required; name defaults to id.
	status, raw = do(t, http.MethodPost, ts.URL+"/api/agents", `{"name":"NoId"}`)
	if status != http.StatusUnprocessableEntity {
		t.Errorf("agent without id status = %d, want 422 (body: %s)", status, raw)
	}
	status, raw = do(t, http.MethodPost, ts.URL+"/api/agents", `{"id":"justid"}`)
	if status != http.StatusOK {
		t.Fatalf("agent without name status = %d, want 200 (body: %s)", status, raw)
	}
	var a map[string]any
	if err := json.Unmarshal(raw, &a); err != nil {
		t.Fatal(err)
	}
	if a["name"] != "justid" {
		t.Errorf("default name = %v, want the id", a["name"])
	}
}

// Issue 07: the human recycles a 处理中 task back to 待处理 in one action;
// the recycled task is claimable again.
func TestRecycleOrphan(t *testing.T) {
	ts := newServer(t)
	id := createTask(t, ts, "Orphan")

	do(t, http.MethodPost, ts.URL+"/api/tasks/"+id+"/claim", `{"agentId":"a1"}`)

	status, raw := do(t, http.MethodPost, ts.URL+"/api/tasks/"+id+"/recycle", "")
	if status != http.StatusOK {
		t.Fatalf("recycle status = %d, want 200 (body: %s)", status, raw)
	}
	task := decodeTask(t, raw)
	if task["status"] != "todo" {
		t.Errorf("status = %v, want todo", task["status"])
	}
	if task["claimedBy"] != nil {
		t.Errorf("claimedBy = %v, want null after recycle", task["claimedBy"])
	}

	// Any agent can claim it again.
	status, raw = do(t, http.MethodPost, ts.URL+"/api/tasks/"+id+"/claim", `{"agentId":"a2","name":"Beta"}`)
	if status != http.StatusOK {
		t.Fatalf("re-claim status = %d, want 200 (body: %s)", status, raw)
	}
	if decodeTask(t, raw)["claimedBy"] != "a2" {
		t.Errorf("re-claim body = %s", raw)
	}

	// Recycle applies to 处理中; a 待处理 task conflicts.
	status, raw = do(t, http.MethodPost, ts.URL+"/api/tasks/"+id+"/recycle", "")
	if status != http.StatusOK {
		t.Errorf("recycle on in_progress status = %d, want 200 (body: %s)", status, raw)
	}
	status, raw = do(t, http.MethodPost, ts.URL+"/api/tasks/"+id+"/recycle", "")
	if status != http.StatusConflict {
		t.Errorf("recycle on todo status = %d, want 409 (body: %s)", status, raw)
	}
	status, _ = do(t, http.MethodPost, ts.URL+"/api/tasks/no-such/recycle", "")
	if status != http.StatusNotFound {
		t.Errorf("recycle on missing task status = %d, want 404", status)
	}
}
