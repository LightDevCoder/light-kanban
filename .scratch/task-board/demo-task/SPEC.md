# 验收测试任务 SPEC

目标：跑通 Light-Kanban 的「人类建任务 → agent 接取 → 干活 → 交回 → 人类验收」完整闭环。

本文件夹（`workspacePath` 指向这里）就是任务的 workspace 文件夹。

## 步骤

1. **接取**：调用 `POST /api/tasks/<id>/claim`，body：
   ```json
   { "agentId": "demo-agent", "name": "Demo Agent" }
   ```
   `<id>` 从任务卡片的路径里取，或 `GET /api/tasks` 里按标题找「验收测试任务」。

2. **读 spec**：本文件就是任务的指令正文（也可以放描述里）。

3. **干活**：在本文件夹创建 `output.txt`，内容：

   ```
   Light-Kanban 验收通过
   时间：<当前日期时间>
   agent：<你的 agentId>
   ```

4. **交回**：调用 `POST /api/tasks/<id>/complete`。

5. **等人类验收**：人类在网页上点「验收通过（归档）」或「退回修改」。

## 判定标准

- 卡片出现在「等你确认」列（绿 ✓ 圈）；
- `output.txt` 内容正确；
- 验收归档后，卡片出现在「归档历史」并带完成时间。

## 说明

- 人类在网页上把本任务加入看板（标题「验收测试任务」，workspace 文件夹选本文件夹）；
- agent 通过 API 按上面步骤接取、干活、交回。
