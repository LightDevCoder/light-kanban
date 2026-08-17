# Light-Kanban

A single-binary Go kanban board: a human queues tasks (each card points at a workspace folder) and agents claim, work, block on, and return them for confirmation. REST API (language-neutral) + SQLite + embedded React web UI (中文 / English). Spec: `.scratch/task-board/spec.md`; domain vocabulary: `CONTEXT.md`; ADRs: `docs/adr/`.

## Layout

- `cmd/light-kanban/main.go` — entrypoint (flags, auto-opens the browser)
- `internal/api/` — HTTP API (+ `api_test.go`, `pick_test.go`)
- `internal/store/` — SQLite store + state machine (+ `store_test.go`)
- `internal/webui/` — `webui.go` embeds `dist/` via `go:embed`; **`dist/` is the committed production build of the frontend**
- `frontend/` — React 18 + TypeScript + Vite app (the real UI source; see ADR-0002)
- `scripts/` — `fetch-go.cjs` / `goenv.ps1` / `cross-build.ps1` / `make-checklist-xlsx.cjs` / `seed-demo.cjs` / `verify-vendored-skill.cjs`
- `skills/light-kanban-worker/` — **vendored snapshot** of the official worker Skill from `LightDevCoder/skills` (see `skills/README.md`); integrity pinned by `skills/manifest.json` and checked by `make check`/CI

## Run / build / test

- **Toolchain gotcha (Windows)**: Go is not on PATH. Source `scripts/goenv.ps1` first (PowerShell; it points GOROOT/GOPATH/GOCACHE at `.tools/`). macOS/Linux: `brew install go`, then use the `Makefile`.
- **Run**: `make build && ./dist/light-kanban` (Windows: `.\dist\light-kanban.exe`) → http://127.0.0.1:8641. The default `-addr 127.0.0.1:8641` binds loopback only (no auth in v1); to let LAN agents connect, run explicitly with `-addr :8641` or `-addr 0.0.0.0:8641`.
- **Frontend dev**: `make frontend-install` once, then `make dev-frontend` (Vite on :5173, proxies `/api` to a Go backend on :8641). Production staging: `make frontend-build` rebuilds and copies `frontend/dist` → `internal/webui/dist` (commit the result with your change).
- **Test**: `go test ./...` — tests live at the two agreed Go seams: HTTP API (`internal/api/api_test.go`) and the store (`internal/store/store_test.go`), plus a tiny cmd seam (`cmd/light-kanban/main_test.go`) pinning the listen-address/startup-URL contract. v1.0.4 adds a frontend pure-logic seam: the product tour's decision logic (`frontend/src/components/ProductTour/logic.ts` + `steps.ts`) is unit-tested with vitest (`cd frontend && npm test`). The committed `internal/webui/dist` keeps the Go tests green on a fresh clone without npm.
- **Vet / format**: `go vet ./...`; `gofmt -l internal cmd scripts` (never `gofmt -l .` — `.tools/` is the vendored toolchain).
- **Pre-commit gate**: `make check` — rebuilds the frontend, runs the frontend unit tests, verifies the committed `internal/webui/dist` matches the source, runs gofmt / vet / tests, and verifies the vendored Worker Skill snapshot (`node scripts/verify-vendored-skill.cjs` + `--self-test`): the actual recursive file set of `skills/light-kanban-worker/` must equal `skills/manifest.json` exactly — missing files, hash drift, and unexpected extra files all fail the gate. CI (`.github/workflows/ci.yml`) runs the same checks on every push to main and every PR.
- **Cross-compile**: `make cross` (or `scripts\cross-build.ps1`) → `dist/` binaries: linux (amd64), darwin (amd64 + arm64), windows (amd64). Both build the frontend first.
- **Demo data**: `node scripts/seed-demo.cjs` seeds a running board (35 tasks / 3 agents) for density checks and screenshots.
- **Data**: SQLite at `-db kanban.db` (default, working directory); `:memory:` accepted. Uploaded agent avatars live in `-avatars avatars` (default) and are served from `/api/avatars/*`.

## Conventions

- **State machine is the contract**: todo / in_progress / blocked / awaiting_confirmation / archived. The UI never offers free-form moves or drag-and-drop; the human corrects state via the drawer's edit mode.
- **Agent actions stay API-only**: claim/block/unblock/complete/recycle have no UI buttons. Human UI actions: create / edit / delete / accept (archive) / request changes (reject with feedback) / recycle.
- **i18n is dual-source**: `frontend/src/i18n/zh.ts` is the key schema; `en.ts` must stay structurally identical (tsc enforces it).
- **Red-green discipline**: new behavior starts with a failing test at one of the agreed seams (Go: HTTP API / store / cmd; frontend: the ProductTour pure-logic module).
- **Embedded dist ships with its source**: every change to `frontend/src/` must commit the regenerated `internal/webui/dist/` in the same commit (`make frontend-build`, then verify with `make check`) — otherwise the shipped binary silently keeps the old UI.
- **Vendored Skill snapshot is read-only**: never edit files under `skills/light-kanban-worker/` in place. The behavioral authority is the upstream `LightDevCoder/skills` repository; to upgrade, re-vendor from the new upstream tag (byte-identical copy), regenerate `skills/manifest.json` (repository, tag, commit SHA, package path, per-file SHA-256) and update `skills/README.md` — `make check` (and CI) fail on any drift via `scripts/verify-vendored-skill.cjs`, which enforces the exact file set: manifest-listed files must match byte-for-byte, and no unlisted file may exist.

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
