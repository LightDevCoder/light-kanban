# Light-Kanban

A single-binary Go kanban board: a human queues tasks (each card points at a workspace folder) and agents claim, work, block on, and return them for confirmation. REST API (language-neutral) + SQLite + embedded Chinese web UI. Spec: `.scratch/task-board/spec.md`; domain vocabulary: `CONTEXT.md`; ADRs: `docs/adr/`.

## Run / build / test

- **Toolchain gotcha**: Go is not on PATH. Source `scripts/goenv.ps1` first (PowerShell; it points GOROOT/GOPATH/GOCACHE at `.tools/`). Non-Windows: use the `Makefile`.
- **Run**: `.\dist\light-kanban.exe -addr :8080` (prebuilt) or `go run ./cmd/light-kanban -addr :8080` → open http://localhost:8080.
- **Test**: `go test ./...` — tests live at the two agreed seams: HTTP API (`internal/api/api_test.go`) and the store directly (`internal/store/store_test.go`, atomicity/concurrency).
- **Vet / format**: `go vet ./...`; `gofmt -l internal cmd scripts` (never `gofmt -l .` — `.tools/` is the vendored toolchain).
- **Cross-compile**: `scripts\cross-build.ps1` → `dist/` binaries for linux / darwin / windows.
- **Data**: SQLite at `-db kanban.db` (default, working directory); `:memory:` accepted.

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
