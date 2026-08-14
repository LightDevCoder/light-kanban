# Light-Kanban

A board where a human adds tasks and autonomous agents claim, work, and return them for confirmation.

## Language

**任务 (Task)**:
A single unit of work shown as a card on the board.
_Avoid_: ticket, issue, job

**标签 (Tag)**:
A named piece of metadata on a task card (free-form), alongside structured fields like task type and completion date.
_Avoid_: label, category, badge

**看板 (Board)**:
The four-column surface that holds tasks.
_Avoid_: queue, list, table

**workspace 文件夹 (Workspace folder)**:
The project folder a task card points to (via its path); it holds that project's SPEC and split work orders. The board reads the path and title but does not manage the folder's contents.
_Avoid_: repo, working directory, project directory

**待处理 (To Do)**:
A task that no agent has claimed; open for any agent to take.
_Avoid_: backlog, ready, available

**处理中 (In Progress)**:
A task currently held and being worked by one agent.
_Avoid_: doing, active, claimed

**遇到阻碍 (Blocked)**:
A task an agent has flagged as unable to proceed, still held by that agent.
_Avoid_: stuck, on-hold, paused

**等你确认 (Awaiting Confirmation)**:
A task an agent finished and returned for the human to review (验收).
_Avoid_: review, done, pending-approval

**接取 (claim)**:
The transition 待处理 → 处理中, where an agent takes a task.
_Avoid_: pick up, grab, assign

**完成 (complete)**:
The transition 处理中 → 等你确认, where an agent returns finished work for human review.
_Avoid_: finish, close, resolve

**阻碍 (block)**:
The transition 处理中 → 遇到阻碍, where an agent flags it cannot proceed.
_Avoid_: flag, stall, pause

**解除阻碍 (unblock)**:
The transition 遇到阻碍 → 处理中, where the same agent resumes after the human helps resolve the blocker.
_Avoid_: resolve, resume, unfreeze

**验收 (accept)**:
The human's review of a task in 等你确认; on acceptance the agent archives the card.
_Avoid_: approve, review, QA

**归档 (archive)**:
The transition 等你确认 → archived, where the owning agent removes the card after acceptance. Archived tasks are kept for history with their completion date.
_Avoid_: delete, close, remove

**退回 (reject)**:
The transition 等你确认 → 处理中, where the human sends a not-yet-accepted task back to the same agent to revise.
_Avoid_: bounce, send back, redo

**Agent**:
An autonomous program with an id, name, and avatar that claims, works, and returns tasks through the board's API. It registers itself by supplying its identity when it first claims.
_Avoid_: bot, worker, robot
