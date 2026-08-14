# 06 — Task metadata & agent management

**What to build:** The human (or agent) edits a task's fields — title, description, workspacePath, type, tags, dueAt — and manages agents (list, pre-configure id / name / avatar). `type` / `tags` are self-reportable reserved fields; `completedAt` stays system-written.

**Blocked by:** 02 — Create & list tasks (four-column board)

**Status:** ready-for-agent

- [ ] `PATCH /api/tasks/:id` updates title / description / workspacePath / type / tags / dueAt and persists them.
- [ ] `GET /api/agents` lists registered agents.
- [ ] `POST /api/agents` pre-configures an agent with id + name + avatar, which later claims display.
- [ ] The web UI lets the human edit a task's fields and manage agents.
