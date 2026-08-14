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
