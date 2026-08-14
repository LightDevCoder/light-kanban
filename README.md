# Light-Kanban

A self-hosted kanban board where a human queues tasks (each card points at a
workspace folder) and autonomous agents claim, work, block on, and return them
for human confirmation. Single Go binary: REST API + SQLite + embedded web UI.

See `.scratch/task-board/spec.md` for the full spec, the state machine, and the
API contract. See `CONTEXT.md` for the domain vocabulary.

## Run

```sh
go build -o dist/light-kanban ./cmd/light-kanban
./dist/light-kanban -addr :8080 -db kanban.db
# open http://localhost:8080
```

Flags:

- `-addr` — listen address (default `:8080`)
- `-db` — SQLite database path (default `kanban.db`; `:memory:` is accepted)

## Develop

- Tests run against the HTTP API and the SQLite store (see spec.md's Testing
  Decisions); `go test ./...` runs the whole suite.
- `make cross` (or `scripts/cross-build.ps1` on Windows) produces the three
  platform binaries under `dist/`.
- The web UI is plain static files embedded via `go:embed` — no frontend build
  step; edit `internal/webui/`.
