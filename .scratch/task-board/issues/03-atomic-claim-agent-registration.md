# 03 — Atomic claim & agent self-registration

**What to build:** An agent claims a task atomically (待处理 → 处理中). The claim carries the agent's identity (`agentId` required, `name` / `avatar` optional); an unknown agent is self-registered. The card moves to 处理中 and shows the agent's avatar (hash-color + initial when no avatar is given). Two agents claiming the same task concurrently results in exactly one winner.

**Blocked by:** 02 — Create & list tasks (four-column board)

**Status:** ready-for-agent

- [ ] `POST /api/tasks/:id/claim` moves a 待处理 task to 处理中 and records `claimedBy`.
- [ ] Claiming a task not in 待处理 returns a conflict error (no state change).
- [ ] Two concurrent claims on the same task result in exactly one success.
- [ ] Claiming with an unknown `agentId` self-registers that agent (id + name + avatar, or a default avatar).
- [ ] The web UI shows the claimed card in 处理中 with the agent's avatar.
