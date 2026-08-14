# 04 — Block / unblock / complete

**What to build:** Agents move a claimed task through the remaining lifecycle states: block (处理中 → 遇到阻碍), unblock (遇到阻碍 → 处理中), complete (处理中 → 等你确认). The web UI reflects each move.

**Blocked by:** 03 — Atomic claim & agent self-registration

**Status:** ready-for-agent

- [x] `POST /api/tasks/:id/block` moves 处理中 → 遇到阻碍.
- [x] `POST /api/tasks/:id/unblock` moves 遇到阻碍 → 处理中.
- [x] `POST /api/tasks/:id/complete` moves 处理中 → 等你确认.
- [x] Each endpoint rejects calls from the wrong status with a conflict error.
- [x] The web UI shows the card in the correct column after each transition.
