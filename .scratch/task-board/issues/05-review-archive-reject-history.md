# 05 — Review: archive / reject + history

**What to build:** The human reviews a task in 等你确认 and either accepts it (the agent archives it → 已归档, recording `completedAt`) or rejects it (→ back to 处理中). Archived tasks leave the four columns and are queryable as history with their completion date.

**Blocked by:** 04 — Block / unblock / complete

**Status:** ready-for-agent

- [ ] `POST /api/tasks/:id/archive` moves 等你确认 → 已归档 and sets `completedAt`.
- [ ] `POST /api/tasks/:id/reject` moves 等你确认 → 处理中.
- [ ] Archived tasks no longer appear in the four-column board.
- [ ] `GET /api/tasks?status=archived` returns archived tasks with `completedAt`.
- [ ] The web UI provides review actions (accept / reject) and an archived-history view.
