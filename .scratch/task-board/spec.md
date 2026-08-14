Status: ready-for-agent

# Light-Kanban 任务看板

## Problem Statement

操作者（一个人）同时协调多个自治 AI agent，却没有一个统一的地方来查看、接取、追踪工作。目前任务是散在各 agent 的会话里口头/手动管理的，操作者无法一眼看出：哪些任务排队待领、哪些正在做、哪些卡住、哪些等着自己验收；agent 也没有一套标准的方式去「接取一个任务」并在完成后「交回」。需要一个自托管的、任何 agent（Python / Shell / n8n / JS 等）都能通过 HTTP 访问的任务看板，外加一个给操作者自己增删任务、查看状态、验收成品的 web 界面。

## Solution

一个自托管的**单二进制 kanban 服务**：操作者添加任务（每张卡指向一个 workspace 文件夹）；agent 接取任务、干活、上报阻碍、完成后交回给操作者验收；操作者验收通过后任务被归档并记录完成日期，供日后追溯。看板固定四列（待处理 / 处理中 / 遇到阻碍 / 等你确认）提供全局状态视图。agent 通过一个小型 REST API 交互（语言无关），操作者通过 web UI 交互。

## User Stories

1. As a human operator, I want to add a task with a title and a workspace folder path, so that I can queue work for my agents.
2. As a human operator, I want to optionally set a description, type, and tags when creating a task, so that agents have enough context to start.
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
24. As an agent, I want to fill in a task's type and tags as I work, so that the board stays self-describing without the human doing all data entry.
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
    type           string?      // 任务类型，agent（或人）自报
    tags           string[]     // 自由标签
    createdAt      timestamp
    updatedAt      timestamp
    completedAt    timestamp?   // 验收归档时写入（完成日期）
    dueAt          timestamp?   // 可选截止
  }

  Agent {
    id       string
    name     string
    avatar   string?   // emoji / 颜色 / 图标；缺省用名字哈希色 + 首字母
  }
  ```

- **Atomic claim**: claiming is a conditional transition — it succeeds only if the task's current status is 待处理, enforced atomically by the store (single `UPDATE ... WHERE status='待处理'`). A losing concurrent claim gets a "conflict" response, never a duplicate.
- **Concurrency model**: one task is held by at most one agent at a time; an agent may hold multiple tasks concurrently.
- **Orphan reclaim**: no automatic lease/heartbeat/TTL in v1. The UI highlights a 处理中 task that has not been updated for a long time as "suspected stuck", and the human recycles it back to 待处理 with one click.
- **Agent identity**: self-registration on first claim — the claim request carries `agentId` (required) plus `name` and `avatar` (optional; defaults derived from the id). The human can pre-configure agents or edit their avatar afterwards. No authentication in v1 (trust the local machine/network); identity is for display and ownership, not authorization.
- **Task type / tags**: reserved fields with a convention rather than a rigid enum. Agents (or the human) fill `type` and `tags` themselves; `completedAt` is recorded by the system on archive, not hand-entered.
- **API contract** (REST, JSON; no auth):

  | Method & path | Purpose |
  | --- | --- |
  | `GET /api/tasks?status=<s>` | list tasks; default active; `status=archived` for history |
  | `POST /api/tasks` | create a task (human) |
  | `PATCH /api/tasks/:id` | edit title/description/workspacePath/type/tags/dueAt, and manually correct `status` (human; user story 6) |
  | `POST /api/tasks/:id/claim` | 待处理 → 处理中; body `{agentId, name?, avatar?}` |
  | `POST /api/tasks/:id/block` | 处理中 → 遇到阻碍 |
  | `POST /api/tasks/:id/unblock` | 遇到阻碍 → 处理中 |
  | `POST /api/tasks/:id/complete` | 处理中 → 等你确认 |
  | `POST /api/tasks/:id/archive` | 等你确认 → 已归档 (验收通过后) |
  | `POST /api/tasks/:id/reject` | 等你确认 → 处理中 (验收不通过) |
  | `POST /api/tasks/:id/recycle` | 处理中 → 待处理, drops the claim (human; orphan reclaim, issue 07) |
  | `GET /api/agents` | list agents |
  | `POST /api/agents` | pre-configure an agent (human) |
  | `GET /api/fs/dirs?path=<abs>` | list subdirectories of an absolute path (workspace-folder browser; `..` and relative paths rejected; empty path = platform roots) |
  | `POST /api/fs/pick` | open the server's native folder dialog on the operator's machine; returns `{"path": "<abs>"}` (`""` = canceled) |

- **Realtime**: polling only, no WebSocket in v1. The web UI refreshes on an interval; single-user traffic makes this cheap.
- **Board scope**: one global board in v1. All projects' tasks share the four columns; `workspacePath` / type / tags distinguish them. A `boardId` can be added later without breaking data.

## Testing Decisions

- **What makes a good test**: test only external behavior — an HTTP request and the resulting response plus persisted state. Never assert on internal Go structure.
- **Seam**: the HTTP API is the single test seam. Tests run against a fresh SQLite (in-memory or temp file) per run; no other seams are introduced.
- **Modules tested through the seam**: task lifecycle, claim atomicity, agent self-registration, archive/reject behavior, list/filter.
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
- The "constraint" model: identity, type, and tags are reserved fields plus agent-facing instructions — agents self-configure when claiming, keeping the board minimal and avoiding human data entry.
- Agents are expected to call the API from their own scheduled tasks; scheduling/orchestration is outside this board's responsibility.
