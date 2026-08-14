package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"light-kanban/internal/store"
	"light-kanban/internal/webui"
)

func pickTestServer(t *testing.T) *httptest.Server {
	t.Helper()
	s, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })
	ts := httptest.NewServer(New(s, webui.FS))
	t.Cleanup(ts.Close)
	return ts
}

func doPost(t *testing.T, url string) (int, []byte) {
	t.Helper()
	resp, err := http.Post(url, "application/json", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	raw := make([]byte, 0, 256)
	buf := make([]byte, 256)
	for {
		n, err := resp.Body.Read(buf)
		raw = append(raw, buf[:n]...)
		if err != nil {
			break
		}
	}
	return resp.StatusCode, raw
}

// The native folder picker runs on the server's desktop (the operator's own
// machine). The picker function is injectable so the API seam is testable.
func TestPickDir(t *testing.T) {
	old := pickDir
	t.Cleanup(func() { pickDir = old })

	// Stub: the "dialog" returns a folder.
	pickDir = func() (string, error) { return `C:\Users\me\Projects`, nil }
	ts := pickTestServer(t)
	status, raw := doPost(t, ts.URL+"/api/fs/pick")
	if status != http.StatusOK {
		t.Fatalf("pick status = %d, want 200 (body: %s)", status, raw)
	}
	var res struct {
		Path string `json:"path"`
	}
	if err := json.Unmarshal(raw, &res); err != nil {
		t.Fatalf("decode pick: %v (%s)", err, raw)
	}
	if res.Path != `C:\Users\me\Projects` {
		t.Errorf("path = %q, want the picked folder", res.Path)
	}

	// Stub: user cancels → empty path, still 200.
	pickDir = func() (string, error) { return "", nil }
	status, raw = doPost(t, ts.URL+"/api/fs/pick")
	if status != http.StatusOK {
		t.Fatalf("pick cancel status = %d, want 200 (body: %s)", status, raw)
	}
	if err := json.Unmarshal(raw, &res); err != nil {
		t.Fatal(err)
	}
	if res.Path != "" {
		t.Errorf("canceled pick path = %q, want empty", res.Path)
	}

	// Stub: dialog error → 500.
	pickDir = func() (string, error) { return "", errors.New("no display") }
	status, raw = doPost(t, ts.URL+"/api/fs/pick")
	if status != http.StatusInternalServerError {
		t.Errorf("pick error status = %d, want 500 (body: %s)", status, raw)
	}
}
