# 02 — Create & list tasks (four-column board)

**What to build:** The human can create a task (title + workspacePath, optional description / type / tags / dueAt) and see it in the board. The board renders four columns with the agreed colors — 待处理 gray, 处理中 yellow, 遇到阻碍 red, 等你确认 green — and every new task appears in 待处理.

**Blocked by:** 01 — Scaffold & runnable skeleton

**Status:** ready-for-agent

- [ ] `POST /api/tasks` with title + workspacePath creates a task with status 待处理.
- [ ] `GET /api/tasks` returns the created task with all its fields.
- [ ] The web UI shows four columns with the correct titles and colors.
- [ ] A newly created task appears in the 待处理 column.
- [ ] Creating a task without a title or without a workspacePath is rejected with a clear error.
