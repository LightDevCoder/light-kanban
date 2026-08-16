package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
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
	ts := httptest.NewServer(New(s, webui.FS, filepath.Join(t.TempDir(), "avatars")))
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

// POST /api/fs/open reveals a folder in the OS file manager on the server
// machine. The opener is injectable; validation happens before it runs.
func TestOpenFolder(t *testing.T) {
	old := openFolder
	t.Cleanup(func() { openFolder = old })

	dir := t.TempDir()
	opened := ""
	openFolder = func(path string) error { opened = path; return nil }

	ts := pickTestServer(t)
	bodyFor := func(p string) string {
		t.Helper()
		b, err := json.Marshal(map[string]string{"path": p})
		if err != nil {
			t.Fatal(err)
		}
		return string(b)
	}
	req, err := http.NewRequest(http.MethodPost, ts.URL+"/api/fs/open", strings.NewReader(bodyFor(dir)))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("open status = %d, want 200", resp.StatusCode)
	}
	if filepath.Clean(opened) != filepath.Clean(dir) {
		t.Errorf("opened = %q, want %q", opened, dir)
	}

	// Relative path rejected before the opener runs.
	opened = ""
	status, raw := doJSON(t, ts.URL+"/api/fs/open", bodyFor("relative/dir"))
	if status != http.StatusBadRequest {
		t.Errorf("relative status = %d, want 400 (body: %s)", status, raw)
	}
	if opened != "" {
		t.Errorf("opener ran for a relative path: %q", opened)
	}

	// Nonexistent path is 404.
	status, _ = doJSON(t, ts.URL+"/api/fs/open", bodyFor(filepath.Join(dir, "nope")))
	if status != http.StatusNotFound {
		t.Errorf("missing path status = %d, want 404", status)
	}

	// Opener failure → 500.
	openFolder = func(path string) error { return errors.New("no file manager") }
	status, _ = doJSON(t, ts.URL+"/api/fs/open", bodyFor(dir))
	if status != http.StatusInternalServerError {
		t.Errorf("opener error status = %d, want 500", status)
	}
}

func doJSON(t *testing.T, url, body string) (int, []byte) {
	t.Helper()
	req, err := http.NewRequest(http.MethodPost, url, strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	buf := make([]byte, 0, 256)
	tmp := make([]byte, 256)
	for {
		n, err := resp.Body.Read(tmp)
		buf = append(buf, tmp[:n]...)
		if err != nil {
			break
		}
	}
	return resp.StatusCode, buf
}
