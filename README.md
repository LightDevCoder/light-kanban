# Light-Kanban

A self-hosted kanban board where a human queues tasks (each card points at a workspace folder) and autonomous agents claim, work, block on, and return them for human confirmation. Single Go binary: REST API + SQLite + embedded web UI (English / 中文).

[中文 README](README_CN.md) · [Download](https://github.com/LightDevCoder/light-kanban/releases)

See `.scratch/task-board/spec.md` for the full spec, the state machine, and the API contract. See `CONTEXT.md` for the domain vocabulary.

## Screenshots

![Light-Kanban board (English UI)](Assets/light-kanban-EN.png)

(中文界面截图见 [README_CN.md](README_CN.md))

## Install & Run (per platform)

Pick the file for your machine from the [Releases](https://github.com/LightDevCoder/light-kanban/releases) page:

| Your machine | Download |
| --- | --- |
| Windows | `light-kanban.exe` |
| macOS Apple Silicon (M-series) | `light-kanban-darwin-arm64` |
| macOS Intel | `light-kanban-darwin-amd64` |
| Linux | `light-kanban-linux-amd64` |

On startup the browser opens automatically at http://localhost:8080 (disable with `-no-open`; change port with `-addr :9090`). Data (`kanban.db`, `avatars/`) is stored **in the folder where you run it** — put the binary in a dedicated folder.

### Windows (double-click only)

Just **double-click** `light-kanban.exe` → a console window opens and the browser opens automatically. The first launch asks about the Windows firewall — choose "Allow access". **Closing the console window stops the service**; double-click again to restart.

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

3. **Use it**: the browser opens the board automatically; **Ctrl+C stops** it; run again to restart. If macOS firewall asks about incoming connections, allow it only when agents on *other machines* need to connect (for local-only use, "Deny" is fine).

### Linux (terminal)

```sh
chmod +x light-kanban-linux-amd64
./light-kanban-linux-amd64
```

The browser opens automatically; Ctrl+C stops. To allow other machines on the LAN, start with `-addr :8080` and open the firewall port.

## Quick Start

Five steps get you from zero to a full loop (the web UI also shows the same guide on first visit — reopen it anytime with the "Guide" button):

1. **Start the service**: `dist\light-kanban.exe -addr :8080` on Windows (other platforms: `make build && ./dist/light-kanban`), then open http://localhost:8080.

2. **Add a task**: click "+ Add Task" in the top bar, fill in the title + workspace folder path (browse in-page or use the system picker); description / tags / due date are optional → the task lands in the **To Do** column.

3. **An agent claims it** (agents self-register and claim via the API):

   ```sh
   curl http://localhost:8080/api/tasks                          # find the task and its id
   curl -F "file=@avatar.png" http://localhost:8080/api/avatars   # upload an avatar, note the returned path
   curl -X POST -H "Content-Type: application/json" \
     -d '{"agentId":"my-agent","name":"My Agent","avatar":"/api/avatars/xxx.png"}' \
     http://localhost:8080/api/tasks/<id>/claim
   ```

   Claim constraints: `name` is your tool name; `avatar` must be a real image (an uploaded path or an http(s) image URL) — fabricated paths get a 422. The card then shows the agent's avatar and name.

4. **Work and status transitions** (agent, via API): `POST /api/tasks/<id>/block` (blocked), `/unblock` (unblocked), `/complete` (finished). You just watch the four columns.

5. **Review and archive**: when a task reaches **Awaiting Confirmation**, review it — accept: click "Accept & Archive" on the card, it moves to the **Archive** modal (top-bar button; supports single and select-all delete); not good enough: just tell the agent to fix it, the agent moves the task back to **In Progress** via the API.

## Run

```sh
go build -o dist/light-kanban ./cmd/light-kanban
./dist/light-kanban -addr :8080 -db kanban.db
# open http://localhost:8080
```

Flags:

- `-addr` — listen address (default `:8080`)
- `-db` — SQLite database path (default `kanban.db`; `:memory:` is accepted)
- `-no-open` — do not open the browser on startup

## Develop

- Tests run against the HTTP API and the SQLite store (see spec.md's Testing Decisions); `go test ./...` runs the whole suite.
- `make cross` (or `scripts/cross-build.ps1` on Windows) produces the release binaries under `dist/`: linux (amd64), darwin (amd64 + arm64), windows (amd64).
- The web UI is plain static files embedded via `go:embed` — no frontend build step; edit `internal/webui/`.
