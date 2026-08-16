# Light-Kanban

A self-hosted kanban board where a human queues tasks (each card points at a workspace folder) and autonomous agents claim, work, block on, and return them for human confirmation. Single Go binary: REST API + SQLite + embedded web UI (English / 中文).

[中文 README](README_CN.md) · [Download](https://github.com/LightDevCoder/light-kanban/releases)

See `.scratch/task-board/spec.md` for the full spec, the state machine, and the API contract. See `CONTEXT.md` for the domain vocabulary.

## Screenshots

![Light-Kanban board (English UI)](Assets/light-kanban-EN.png)

(中文界面截图见 [README_CN.md](README_CN.md))

## The board at a glance

- **Four fixed state columns** — To Do / In Progress / Blocked / Awaiting Confirmation — with pinned headers and independent per-column scrolling; narrow windows scroll the board horizontally instead of restacking.
- **Compact, high-density cards**: short id (`LK-XXXX`), title, the claiming agent's avatar, workspace basename with a color dot, a couple of tags `+N`, and due / overdue / stuck / block-reason signals only when they matter.
- **Task drawer**: click any card for the full picture in a right-side drawer — view first, edit on demand. This is also where the human acts: **Accept** (archive), **Request Changes** (rejects back to In Progress with feedback the agent can read via the API), **Recycle to To Do** for suspected-stuck tasks, delete, and open the project folder.
- **Search & filters** in the topbar: match title / description / workspace / tags / agent name, and compose Agent + Workspace + Tag + Status filters — the board updates in place.
- **Settings menu**: language (中文 / English), the onboarding guide, and the archive history (single / select-all delete).
- **Bilingual UI** throughout, remembered per browser; the board polls lightly every 5 s (no WebSocket to run).

## Install & Run (per platform)

Pick the file for your machine from the [Releases](https://github.com/LightDevCoder/light-kanban/releases) page:

| Your machine | Download |
| --- | --- |
| Windows | `light-kanban.exe` |
| macOS Apple Silicon (M-series) | `light-kanban-darwin-arm64` |
| macOS Intel | `light-kanban-darwin-amd64` |
| Linux | `light-kanban-linux-amd64` |

On startup the browser opens automatically at http://127.0.0.1:8641 (disable with `-no-open`; change port with `-addr :9090`). **By default the board listens on 127.0.0.1 only** — nothing on your LAN can reach it (v1 has no authentication). To let agents on *other machines* connect, start it explicitly with `-addr :8641` (or `-addr 0.0.0.0:8641`) and open the firewall port; that is your explicit opt-in. Data (`kanban.db`, `avatars/`) is stored **in the folder where you run it** — put the binary in a dedicated folder.

### Windows (double-click only)

Just **double-click** `light-kanban.exe` → a console window opens and the browser opens automatically. **Closing the console window stops the service**; double-click again to restart. The firewall prompt only appears when you enable LAN access (`light-kanban.exe -addr :8641`) — for local-only double-click use, no firewall exception is needed.

### macOS (terminal, 3 steps)

1. **Download and move to a dedicated folder** (don't leave data in "Downloads"):

   ```sh
   mkdir -p ~/light-kanban && cd ~/light-kanban
   # move light-kanban-darwin-arm64 here (darwin-amd64 on Intel Macs)
   ```

2. **Make it executable and start**:

   ```sh
   chmod +x light-kanban-darwin-arm64
   ./light-kanban-darwin-arm64
   ```

   If macOS says "cannot verify the developer" on first run, pick one:
   - In Finder: **right-click → Open** (then click "Open" in the dialog — once is enough); or
   - System Settings → Privacy & Security → find light-kanban → "Open Anyway"; or
   - Run `xattr -dr com.apple.quarantine light-kanban-darwin-arm64` and retry

3. **Use it**: the browser opens the board automatically; **Ctrl+C stops** it; run again to restart. The default binding is loopback-only; if macOS firewall asks about incoming connections, allow it only when agents on *other machines* need to connect (start with `-addr :8641` for that — for local-only use, "Deny" is fine).

### Linux (terminal)

```sh
chmod +x light-kanban-linux-amd64
./light-kanban-linux-amd64
```

The browser opens automatically; Ctrl+C stops. To allow other machines on the LAN, start with `-addr :8641` and open the firewall port.

## Quick Start

Five steps get you from zero to a full loop (the web UI also shows the same guide on first visit — reopen it anytime from the settings menu):

1. **Start the service**: `dist\light-kanban.exe` on Windows (other platforms: `make build && ./dist/light-kanban`), then open http://127.0.0.1:8641. (LAN agents need `-addr :8641` — see above.)

2. **Add a task**: click "**+**" in the top bar (or the "+" in the To Do column header), fill in the title + workspace folder path (type/paste it, or click "Choose…" to open the system folder dialog); description / tags / due date are optional → the task lands in the **To Do** column.

3. **An agent claims it** (agents self-register and claim via the API):

   ```sh
   curl "http://127.0.0.1:8641/api/tasks?status=todo"             # find available work (todo only)
   curl -F "file=@avatar.png" http://127.0.0.1:8641/api/avatars   # upload an avatar, note the returned path
   curl -X POST -H "Content-Type: application/json" \
     -d '{"agentId":"my-agent","name":"My Agent","avatar":"/api/avatars/xxx.png"}' \
     http://127.0.0.1:8641/api/tasks/<id>/claim
   ```

   Claim constraints: `name` is your tool name; `avatar` must be the agent's **own icon image** (e.g. Codex claims with the Codex icon, Claude Code with the Claude Code icon — an uploaded path or an http(s) image URL). Placeholders and fabricated paths get a 422. The card then shows the agent's avatar at its top right.

4. **Work and status transitions** (agent, via API): `POST /api/tasks/<id>/block` (optionally with `{"reason":"…"}` — the card shows why it is stuck), `/unblock`, `/complete`. You just watch the four columns.

5. **Review and archive**: when a task reaches **Awaiting Confirmation**, hover the card or open its drawer — **Accept** archives it into the **Archive** (settings menu; single and select-all delete); **Request Changes** sends it back to **In Progress** with your feedback (`POST /api/tasks/<id>/reject` with `{"feedback":"…"}` also works — the agent reads it back from `GET /api/tasks`).

## Run from source

```sh
make build            # builds the frontend, stages internal/webui/dist, compiles the binary
./dist/light-kanban -db kanban.db
# open http://127.0.0.1:8641
```

To explicitly allow agents on other LAN machines: `./dist/light-kanban -addr :8641`.

Flags:

- `-addr` — listen address (default `127.0.0.1:8641`, loopback only; use `:8641` or `0.0.0.0:8641` to expose the board to your LAN)
- `-db` — SQLite database path (default `kanban.db`; `:memory:` is accepted)
- `-no-open` — do not open the browser on startup

## API status filter

`GET /api/tasks` returns all active tasks by default. Add `?status=` to filter: `active` (same as no filter), `todo`, `in_progress`, `blocked`, `awaiting_confirmation`, or `archived` (history). Unknown values get a 400. Task lists come pre-ordered per the board's rules: To Do is oldest-first (a real queue), In Progress / Blocked show the most recent activity first, Awaiting Confirmation shows the longest-waiting review first, and the archive is newest-completion-first.

## Develop

- Go tests run against the HTTP API and the SQLite store (see spec.md's Testing Decisions); `go test ./...` runs the whole suite. The committed `internal/webui/dist/` keeps this green on a fresh clone — no npm needed for backend work.
- **Pre-commit gate: `make check`** — rebuilds the frontend, fails if the committed `internal/webui/dist/` is out of sync with `frontend/src/`, then runs gofmt / `go vet` / `go test`. CI (`.github/workflows/ci.yml`) runs the same checks on every push to main and every PR.
- `make run` starts the Go backend with its loopback-only default; `make run-lan` is the explicit LAN variant (binds all interfaces) for testing remote agents.
- The web UI is a React 18 + TypeScript + Vite app in `frontend/` (ADR-0002): `make frontend-install` once, `make dev-frontend` for the Vite dev server (proxies `/api` to a Go backend on :8641), `make frontend-build` to stage the production bundle into `internal/webui/dist/`.
- `make cross` (or `scripts/cross-build.ps1` on Windows) produces the release binaries under `dist/`: linux (amd64), darwin (amd64 + arm64), windows (amd64) — both build the frontend first.
- `node scripts/seed-demo.cjs` seeds a running board with realistic demo data (35 tasks / 3 agents) for density checks and screenshots.
