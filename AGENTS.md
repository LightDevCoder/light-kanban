# Light-Kanban

A single-binary Go kanban board: a human queues tasks (each card points at a workspace folder) and agents claim, work, block on, and return them for confirmation. REST API (language-neutral) + SQLite + embedded React web UI (中文 / English). Spec: `.scratch/task-board/spec.md`; domain vocabulary: `CONTEXT.md`; ADRs: `docs/adr/`.

## Layout

- `cmd/light-kanban/main.go` — entrypoint (flags, auto-opens the browser)
- `internal/api/` — HTTP API (+ `api_test.go`, `pick_test.go`)
- `internal/store/` — SQLite store + state machine (+ `store_test.go`)
- `internal/webui/` — `webui.go` embeds `dist/` via `go:embed`; **`dist/` is the committed production build of the frontend**
- `frontend/` — React 18 + TypeScript + Vite app (the real UI source; see ADR-0002)
- `scripts/` — `fetch-go.cjs` / `goenv.ps1` / `cross-build.ps1` / `make-checklist-xlsx.cjs` / `seed-demo.cjs`

## Run / build / test

- **Toolchain gotcha (Windows)**: Go is not on PATH. Source `scripts/goenv.ps1` first (PowerShell; it points GOROOT/GOPATH/GOCACHE at `.tools/`). macOS/Linux: `brew install go`, then use the `Makefile`.
- **Run**: `make build && ./dist/light-kanban` (Windows: `.\dist\light-kanban.exe -addr :8641`) → http://localhost:8641.
- **Frontend dev**: `make frontend-install` once, then `make dev-frontend` (Vite on :5173, proxies `/api` to a Go backend on :8641). Production staging: `make frontend-build` rebuilds and copies `frontend/dist` → `internal/webui/dist` (commit the result with your change).
- **Test**: `go test ./...` — tests live at the two agreed seams: HTTP API (`internal/api/api_test.go`) and the store (`internal/store/store_test.go`). The committed `internal/webui/dist` keeps these green on a fresh clone without npm.
- **Vet / format**: `go vet ./...`; `gofmt -l internal cmd scripts` (never `gofmt -l .` — `.tools/` is the vendored toolchain).
- **Cross-compile**: `make cross` (or `scripts\cross-build.ps1`) → `dist/` binaries: linux (amd64), darwin (amd64 + arm64), windows (amd64). Both build the frontend first.
- **Demo data**: `node scripts/seed-demo.cjs` seeds a running board (35 tasks / 3 agents) for density checks and screenshots.
- **Data**: SQLite at `-db kanban.db` (default, working directory); `:memory:` accepted. Uploaded agent avatars live in `-avatars avatars` (default) and are served from `/api/avatars/*`.

## Conventions

- **State machine is the contract**: todo / in_progress / blocked / awaiting_confirmation / archived. The UI never offers free-form moves or drag-and-drop; the human corrects state via the drawer's edit mode.
- **Agent actions stay API-only**: claim/block/unblock/complete/recycle have no UI buttons. Human UI actions: create / edit / delete / accept (archive) / request changes (reject with feedback) / recycle.
- **i18n is dual-source**: `frontend/src/i18n/zh.ts` is the key schema; `en.ts` must stay structurally identical (tsc enforces it).
- **Red-green discipline**: new behavior starts with a failing test at one of the two seams.

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
