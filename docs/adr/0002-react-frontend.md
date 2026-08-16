# React + TypeScript + Vite frontend (kept inside the Go single binary)

v1.0.1 shipped a hand-written vanilla JS UI (`internal/webui/index.html` +
`app.js` + `style.css`). The v1.0.2 redesign (dense four-column agent
workbench: task drawer, search, composable filters, per-column scrolling)
outgrew what a dependency-free single file can hold maintainably. We decided
to rebuild the frontend as a React 18 + TypeScript + Vite app in `frontend/`,
while keeping the Go single-binary product shape unchanged.

## Considered Options

- **React + TypeScript + Vite (chosen)** — the interaction surface (drawer
  view/edit modes, popovers, live filtering, polling cache) is component
  shaped; TypeScript keeps the API contract honest; Vite is the smallest
  proven build tool for this stack.
- **Keep vanilla JS, add features** — rejected: every new surface (drawer,
  filter popover, settings menu) would deepen the single-file DOM-string
  approach that was already straining at 841 lines.
- **Vue / Svelte** — viable; rejected only because React's ecosystem and
  agent-maintainer familiarity are the safer default for this repo.
- **shadcn/Radix component templates** — rejected for visuals: the reference
  design is a quiet, dense, grayscale board that default dashboard templates
  do not match; hand-written CSS variables give exact control and keep the
  bundle tiny (~70 KB gzip).

## Build / embed pipeline

- `frontend/` is a standard Vite app. Dev: `npm run dev` (proxies `/api` to
  the Go backend on :8080). Prod: `npm run build`.
- `make frontend-build` builds and copies `frontend/dist/` →
  `internal/webui/dist/`, which `internal/webui/webui.go` embeds with
  `go:embed all:dist`.
- **`internal/webui/dist/` is committed.** A fresh clone can `go build` /
  `go test ./...` without npm, and every commit that changes the frontend
  rebuilds and re-commits the staged bundle. `make build` / `make cross`
  always rebuild the frontend first, so release binaries can never ship a
  stale UI.
- End users still run one binary (`light-kanban`); no node/npm at runtime.

## Consequences

- Contributors need Node only when changing the frontend; pure Go work
  (API, store) needs no npm install.
- TanStack Query owns polling (5 s), cache invalidation and mutation
  refresh — no hand-rolled `setInterval` refresh logic.
- `scripts/cross-build.ps1` gained a frontend build step; `Makefile` owns
  the same flow on macOS/Linux.
- The committed `dist/` adds small build diffs to frontend-touching
  commits — accepted as the price for a clone-and-go repository.
