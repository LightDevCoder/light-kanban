Status: ready-for-agent

# Light-Kanban 任务看板

## Problem Statement

操作者（一个人）同时协调多个自治 AI agent，却没有一个统一的地方来查看、接取、追踪工作。目前任务是散在各 agent 的会话里口头/手动管理的，操作者无法一眼看出：哪些任务排队待领、哪些正在做、哪些卡住、哪些等着自己验收；agent 也没有一套标准的方式去「接取一个任务」并在完成后「交回」。需要一个自托管的、任何 agent（Python / Shell / n8n / JS 等）都能通过 HTTP 访问的任务看板，外加一个给操作者自己增删任务、查看状态、验收成品的 web 界面。

## Solution

一个自托管的**单二进制 kanban 服务**：操作者添加任务（每张卡指向一个 workspace 文件夹）；agent 接取任务、干活、上报阻碍、完成后交回给操作者验收；操作者验收通过后任务被归档并记录完成日期，供日后追溯。看板固定四列（待处理 / 处理中 / 遇到阻碍 / 等你确认）提供全局状态视图。agent 通过一个小型 REST API 交互（语言无关），操作者通过 web UI 交互。

## User Stories

1. As a human operator, I want to add a task with a title and a workspace folder path, so that I can queue work for my agents.
2. As a human operator, I want to optionally set a description and tags when creating a task, so that agents have enough context to start.
3. As a human operator, I want to see all active tasks arranged in four columns (待处理 / 处理中 / 遇到阻碍 / 等你确认), so that I understand overall state at a glance.
4. As a human operator, I want each column title prefixed by its color (待处理=灰, 处理中=黄, 遇到阻碍=红, 等你确认=绿), so that I can scan status instantly.
5. As a human operator, I want each card to show which agent is working on it (via their avatar), so that I know who to go talk to.
6. As a human operator, I want to manually move or edit a card's status, so that I can correct state when needed.
7. As a human operator, I want to see when a card lands in 等你确认, so that I know something needs my review.
8. As a human operator, I want to review (验收) a finished task, so that I can accept it or send it back for revision.
9. As a human operator, I want accepted tasks to leave the four columns but remain queryable in history, so that I can look back at what was done.
10. As a human operator, I want a completion date recorded on each accepted task, so that I can track when work landed.
11. As a human operator, I want to flag a task that is stuck in 处理中 (e.g. the agent died) and recycle it back to 待处理, so that it does not stay orphaned.
12. As a human operator, I want to pre-configure agents (id / name / avatar), so that recurring agents show recognizable icons.
13. As a human operator, I want an unknown agent to self-register when it first claims, so that a new agent is not blocked.
14. As a human operator, I want to browse archived history, so that I can recall past projects and their completion dates and tags.
15. As a human operator, I want the board to be a single self-contained service, so that I can run it anywhere with one command.
16. As an agent, I want to list the tasks available to claim (待处理), so that I can find work to pick up.
17. As an agent, I want to claim a task atomically, so that two agents never take the same task.
18. As an agent, I want to supply my id / name / avatar when claiming, so that the board can show who is working on the card.
19. As an agent, I want to mark a task 遇到阻碍, so that the human sees I am blocked and can come help.
20. As an agent, I want to unblock a task and return it to 处理中, so that I can resume after the human helps resolve the blocker.
21. As an agent, I want to mark a task complete (处理中 → 等你确认), so that the human knows to review it.
22. As an agent, I want to archive a task after the human accepts it, so that it leaves the board cleanly.
23. As an agent, I want to read a task's workspace folder path, so that I know where the SPEC / split work orders to implement live.
24. As an agent, I want to fill in a task's tags as I work, so that the board stays self-describing without the human doing all data entry.
25. As an agent, I want a minimal, language-agnostic HTTP API, so that I can be written in any language and run from my own scheduled task.

## Implementation Decisions

- **Architecture / modules**: a single Go service with three internal parts — the REST API, the SQLite store, and an embedded web frontend served from the same process. Compiled to one cross-platform binary.
- **Tech stack**: Go + `chi` (HTTP router) + `modernc.org/sqlite` (pure-Go SQLite driver, no CGO) + embedded static frontend. Rationale recorded in ADR-0001.
- **State machine** (fixed, not free-form columns; the archive is a hidden terminal state, not a visible column):

  ```
  待处理 ──claim──▶ 处理中 ──complete──▶ 等你确认 ──accept──▶ 已归档
                      │  ▲                    │
                    block│  │unblock           │reject
                      ▼  │                    ▼
                    遇到阻碍                处理中
  ```

- **Task schema** (decision-rich shape):

  ```text
  Task {
    id             string       // uuid
    title          string
    workspacePath  string       // 指向该任务的项目 workspace 文件夹
    description    string?      // 可选，指令正文/补充说明
    status         enum         // 待处理 | 处理中 | 遇到阻碍 | 等你确认 | 已归档
    claimedBy      string?      // 接取该任务的 agent id
    tags           string[]     // 自由标签
    createdAt      timestamp
    updatedAt      timestamp
    completedAt    timestamp?   // 验收归档时写入（完成日期）
    dueAt          timestamp?   // 可选截止
    blockReason    string?      // block 时可选填入的阻碍原因，展示在卡片/详情（unblock 清除）
    reviewFeedback string?      // reject 时可选填入的退回反馈，agent 可读（complete 清除）
  }

  Agent {
    id       string
    name     string
    avatar   string?   // 图片（上传文件路径或 http(s) URL）；旧数据缺省用名字哈希色 + 首字母
  }
  ```

- **Atomic claim**: claiming is a conditional transition — it succeeds only if the task's current status is 待处理, enforced atomically by the store (single `UPDATE ... WHERE status='待处理'`). A losing concurrent claim gets a "conflict" response, never a duplicate.
- **Concurrency model**: one task is held by at most one agent at a time; an agent may hold multiple tasks concurrently.
- **Orphan reclaim**: no automatic lease/heartbeat/TTL in v1. The UI marks a 处理中 task that has not been updated for a long time as "suspected stuck" (a quiet ⚠ chip, no flashing), and the human moves it back to 待处理 via the task drawer's 回收到待处理 button, the drawer's edit-mode 状态 field, or `POST /api/tasks/:id/recycle`.
- **Agent identity**: self-registration on claim, with enforced constraints — the claim request carries `agentId`, `name` and `avatar`, all required: `name` must be non-empty (the agent's tool name, e.g. "grok build"), and `avatar` must be an image that the server can verify — an uploaded `/api/avatars/...` path whose file actually exists (fabricated paths are rejected, so cards never show broken icons), or an http(s) image URL. A letter or emoji is rejected. Agents that skip or fake their identity get a 422 and must retry properly. The human can pre-configure agents or edit their identity afterwards; human-configured identities are **pinned** — later claims cannot overwrite them. No authentication in v1 (trust the local machine/network); identity is for display and ownership, not authorization. **Icon convention**: the avatar should be the agent's own product icon image (e.g. Codex claims with the Codex icon, Claude Code with the Claude Code icon), not a placeholder or generic colored dot — the server verifies the image exists, and the own-icon rule is a documented convention agents must follow.
- **Column ordering** (v1.0.3): task lists come pre-ordered per column — 待处理 is a FIFO queue (created oldest-first, so agents claiming the first card never starve old tasks); 处理中 and 遇到阻碍 show the most recent activity first (`updated_at DESC`); 等你确认 shows the longest-waiting review first (`updated_at ASC`); the archive is newest-completion-first (`completed_at DESC`). The combined active list groups by column order and keeps each column's internal rule — the UI splits it into columns anyway.
- **Atomic PATCH** (v1.0.3): `PATCH /api/tasks/:id` applies field edits and an optional manual status correction in ONE atomic store statement — a failed request (e.g. invalid status) can never leave a half-applied row. Manual corrections keep the v1.0.2 rules: 待处理 drops the claim, 已归档 records the completion date, leaving 已归档 clears it, and every correction clears block reason and review feedback.
- **Default network binding** (v1.0.3): the service listens on `127.0.0.1:8641` by default — loopback only, because v1 has no authentication and the API can create/delete tasks and open folders on the server. Exposing the board to LAN agents is an explicit opt-in: `-addr :8641` or `-addr 0.0.0.0:8641`. Authentication stays out of scope.
- **Archive folder shortcut** (v1.0.4): every archive-history row carries a folder icon next to Delete that calls the existing `POST /api/fs/open` with the task's `workspacePath` — same icon, button style, tooltip and error handling as the task drawer's open-folder. It never changes archive state, never restores the task, and never closes the archive dialog. No new backend API.
- **Interactive product tour** (v1.0.4): the old centered wizard modal is replaced by a guided overlay that runs on the real UI. Each step anchors at a stable `data-tour="…"` attribute (never nth-child / class / text / hardcoded coordinates), the rest of the page is dimmed and click-blocked while the current target (and, where useful, its whole dialog/drawer "cutout") stays visible and clickable; a quiet white coachmark with an arrow follows the target and auto-picks top/bottom/left/right placement clamped to the viewport (resize/scroll are observed; targets scrolled out of view are `scrollIntoView`-ed). The recommended flow walks the core loop — click「+」→ fill workspace path (type or system picker) → title → create → the newly created task card → drawer → drawer folder icon → status area (agent workflow) → close drawer → 等你确认 column header → settings → archive entry → archive dialog → archive folder icon (optional: skipped when the archive is empty) → finish card. The created task is tracked by its id captured from the create mutation result (`data-tour-task-id` on every card; exact selector — never by column position); when no mutation id is known (task created outside the tour), the tour falls back to watching for the first newly appearing `data-tour-task-id`. Steps advance through real interactions (target click, typed input, target appearance) or an explicit Next on informational steps; a missing target waits up to 3.5–4 s (MutationObserver-based, no infinite retry), then optional steps auto-skip, the create-submit step returns to the first step (the user canceled the dialog — restarting the create flow beats a cascade of "not found" cards), and other core steps show a safe fallback with Next / Exit.
- **Tour completion semantics** (v1.0.4): only walking the tour to the end and pressing Finish writes `lk-tour-v1-completed = 1` (replacing `lk-wizard-seen`). Skip, Esc, refresh and browser close never write it, so the tour auto-starts again on the next launch. Manual replay: Settings → Guide reopens the tour at any time and never clears the completed flag. The tour never mutates task state on its own — it only performs sanctioned UI navigation (e.g. clicking the drawer's real close button before the 等你确认 step).
- **Task tags**: free-form labels, filled by agents (or the human); `completedAt` is recorded by the system on archive, not hand-entered. (A separate `type` field existed briefly; it was removed — tags already cover it.)
- **API contract** (REST, JSON; no auth):

  | Method & path | Purpose |
  | --- | --- |
  | `GET /api/tasks?status=<s>` | list tasks, pre-ordered per column. `status` defaults to `active` (all non-archived tasks, equal to no filter). Legal values: `active`, `todo`, `in_progress`, `blocked`, `awaiting_confirmation`, `archived` (history); anything else → 400 |
  | `POST /api/tasks` | create a task (human) |
  | `PATCH /api/tasks/:id` | edit title/description/workspacePath/tags/dueAt, and manually correct `status` (human; user story 6) |
  | `POST /api/tasks/:id/claim` | 待处理 → 处理中; body `{agentId, name, avatar}` — `agentId`、`name` 必填（agent 工具名），`avatar` 必填且必须是图片（`/api/avatars/...` 且文件真实存在，或 http(s) 图片 URL）；注册时强制约束 |
  | `POST /api/tasks/:id/block` | 处理中 → 遇到阻碍; 可选 body `{"reason": "…"}` 记录阻碍原因（展示在卡片与详情里，unblock 时清除） |
  | `POST /api/tasks/:id/unblock` | 遇到阻碍 → 处理中（清除阻碍原因） |
  | `POST /api/tasks/:id/complete` | 处理中 → 等你确认（清除退回反馈，新一轮验收重新开始） |
  | `POST /api/tasks/:id/archive` | 等你确认 → 已归档 (验收通过后) |
  | `POST /api/tasks/:id/reject` | 等你确认 → 处理中 (验收不通过)；可选 body `{"feedback": "…"}`，agent 通过 GET /api/tasks 读到（complete 时清除） |
  | `POST /api/tasks/:id/recycle` | 处理中 → 待处理, drops the claim (human; orphan reclaim, issue 07) |
  | `DELETE /api/tasks/:id` | delete a task entirely (human correction; removes it from the board and the archived history) |
  | `GET /api/agents` | list agents |
  | `POST /api/agents` | pre-configure an agent (human) |
  | `POST /api/fs/pick` | open the server's native folder dialog on the operator's machine (macOS dialog self-activates to the front); returns `{"path": "<abs>"}` (`""` = canceled); client abort stops the wait |
  | `POST /api/fs/open` | reveal a folder in the OS file manager on the server machine (the card's "jump to project folder" button); body `{path}` |
  | `POST /api/avatars` | upload an agent avatar image (multipart field `file`, ≤2 MiB, PNG/JPEG/GIF/WebP); returns `{"path": "/api/avatars/<id>.<ext>"}` |
  | `GET /api/avatars/*` | serve stored avatar images |

- **Realtime**: polling only, no WebSocket in v1. The web UI refreshes on an interval; single-user traffic makes this cheap.
- **Startup UX**: on startup the service opens the default browser at the board URL (best effort, so a double-clicked binary is immediately usable; `-no-open` disables it). The console prints the listen address and the URL. The default binding is `127.0.0.1:8641` (loopback only, see above); the browser URL is `http://127.0.0.1:8641` (localhost-equivalent).
- **Web UI**: React + TypeScript + Vite (ADR-0002), embedded into the single binary via `go:embed`. The main page is the four fixed columns under a quiet topbar (brand / search / filter / settings /「+」create). Cards are compact scan units — display id (`LK-XXXX`, derived from the real id; the API id never changes), title, agent avatar at top-right, workspace basename with a hash-color dot, ≤2 tags `+N`, due/overdue/stuck chips, and the block reason line on blocked cards. Clicking a card opens a right-side **task drawer** with full details (view-first; editing title/workspacePath/description/tags/dueAt/status is an explicit mode). Review is the human's primary action: hovering an 等你确认 card — or opening its drawer — offers 验收通过 (archive) and 退回修改 (reject with a feedback message the agent reads back via the API). The drawer also carries 回收到待处理 for stuck 处理中 tasks, delete, and open-folder. Task creation is a compact dialog (topbar「+」or the 待处理 column header「+」). Archive history, the guide (v1.0.4: the interactive product tour, see above) and the language switch live in the topbar settings menu; the connection indicator only appears when the backend is unreachable. Column headers stay pinned while each column scrolls independently; narrow windows scroll the board horizontally instead of restacking columns. Search matches title/description/workspace/tags/agent name and filters compose (agent + workspace + tag + status) — both act on the board in place. There is no agent registration form in the UI: agents self-register via the claim API; the agentId exists only at the API layer and is never displayed. Card buttons show only the human's real actions — status transitions (claim/block/unblock/complete/recycle) remain agent API actions with no buttons.
- **Board scope**: one global board in v1. All projects' tasks share the four columns; `workspacePath` and tags distinguish them. A `boardId` can be added later without breaking data.

## Testing Decisions

- **What makes a good test**: test only external behavior — an HTTP request and the resulting response plus persisted state. Never assert on internal Go structure.
- **Seams**: the HTTP API is the primary test seam; the store package is the second seam (state machine, atomicity, ordering). A tiny cmd seam (`cmd/light-kanban/main_test.go`) pins the listen-address default and the startup-URL derivation (v1.0.3 Fix 1). Tests run against a fresh SQLite (in-memory or temp file) per run.
- **Frontend seam** (v1.0.4): the product tour's decision logic (step resolution/advance/skip policy, `lk-tour-v1-completed` persistence, selector construction, tooltip placement geometry) is extracted into pure DOM-free functions (`frontend/src/components/ProductTour/logic.ts` + `steps.ts`) and unit-tested with vitest (`npm test`, part of `make check` and CI) — including the guarantee that every step targets a stable `data-tour` attribute and that every step text key exists in both dictionaries. No browser E2E framework in v1; the interactive behaviors themselves are covered by the manual checklist.
- **Modules tested through the seams**: task lifecycle, claim atomicity, agent self-registration, archive/reject behavior, list/filter (every status token + invalid), per-column ordering, atomic field+status PATCH.
- **Prior art**: none (greenfield); this establishes the pattern.
- **Key cases to cover**: two concurrent claims → exactly one wins; full lifecycle claim → block → unblock → complete → accept → archive; reject returns a task to 处理中; archive records `completedAt`; an unknown agent id self-registers on claim; claim on a non-待处理 task fails.

## Out of Scope

- Automatic lease / heartbeat / TTL reclaim (manual recycle only).
- Push notifications when a task reaches 等你确认.
- Multiple boards / per-project boards.
- Authentication and multi-user roles.
- Priority field.
- WebSocket realtime updates.
- Free-form drag-and-drop columns (four fixed columns + hidden archive).

## Further Notes

- The `.scratch/` issue tracker set up by `/setup-matt-pocock-skills` tracks **Light-Kanban's own development**; it is distinct from the tasks this board manages.
- The "constraint" model: identity and tags are reserved fields plus agent-facing instructions — agents self-configure when claiming, keeping the board minimal and avoiding human data entry.
- Agents are expected to call the API from their own scheduled tasks; scheduling/orchestration is outside this board's responsibility.
