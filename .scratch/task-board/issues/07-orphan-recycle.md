# 07 — Orphan recycle

**What to build:** The human can detect and recover tasks left in 处理中 by a dead agent. The UI highlights a 处理中 task that has not been updated beyond a threshold as "suspected stuck", and the human recycles it back to 待处理 in one action so any agent can claim it again.

**Blocked by:** 03 — Atomic claim & agent self-registration

**Status:** ready-for-agent

- [ ] A 处理中 task not updated within the threshold is flagged "suspected stuck" in the UI.
- [ ] The human's recycle action moves it 处理中 → 待处理.
- [ ] The recycled task is claimable again (a subsequent claim succeeds).
