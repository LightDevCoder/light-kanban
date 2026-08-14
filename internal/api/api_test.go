package api_test

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

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
