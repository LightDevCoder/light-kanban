# 验收测试任务 v2 SPEC

目标：验证新版功能——**接取时的身份约束（真实图片头像）**、**标签**、**type 已移除**、**归档历史弹窗**。

本文件夹（卡片 `workspacePath` 指向这里）就是任务的 workspace 文件夹。任务标题：「验收测试任务 v2」。

## 步骤

1. **先故意失败一次**：用不存在的头像路径接取，验证约束真的生效：

   ```bash
   curl -X POST -H "Content-Type: application/json" \
     -d '{"agentId":"<你的id>","name":"<你的工具名>","avatar":"/api/avatars/fake.png"}' \
     http://localhost:8080/api/tasks/<id>/claim
   ```

   预期：**422**，错误信息含 `avatar image not found`，任务仍保持「待处理」——卡片上永远不会出现坏图。

2. **准备真实头像**：优先走上传通道——生成一张真实图片文件（例如 base64 解码一个最小的 PNG，或从网上下载一张，PNG/JPG/GIF/WebP，≤2 MiB），然后：

   ```bash
   curl -F "file=@<图片文件>" http://localhost:8080/api/avatars
   ```

   记下返回的 `{"path": "/api/avatars/<id>.png"}`。实在无法生成图片文件时，才允许退而用稳定的 http(s) 图片 URL 作为 `avatar`。

3. **正式接取**：`POST /api/tasks/<id>/claim`，body：

   ```json
   { "agentId": "<你的id>", "name": "<你的工具名>", "avatar": "<上一步返回的path 或 http(s) URL>" }
   ```

   注意约束：`name` 必须是你这个工具的名称（如 `grok build`），**不要用模型名**（如 `grok-4.5`）；`avatar` 必须是图片，字母/emoji 会被 422 拒绝。`<id>` 用 `GET /api/tasks` 按标题「验收测试任务 v2」找到。

4. **读 spec**：本文件就是任务的指令正文。

5. **干活**：在本文件夹创建两个文件：

   - `result.txt`：
     ```
     Light-Kanban 验收测试 v2 通过
     时间：<当前日期时间>
     agent：<你的 agentId>
     头像：<你在第 2 步用的 path 或 URL>
     ```
   - `avatar-result.json`：记录第 1~3 步的请求与响应原文（伪造头像那次的状态码、上传返回的 path、正式 claim 的状态码），方便人类核对。

6. **填标签**：`PATCH /api/tasks/<id>`，body：

   ```json
   { "tags": ["demo", "api-test"] }
   ```

   卡片上应出现紫色标签。**不要传 `type`**——该字段已从产品移除（和 tags 重复），传了也会被忽略。

7. **交回**：`POST /api/tasks/<id>/complete` → 卡片移到「等你确认」列（绿 ✓ 圈）。

8. **等人类验收**：人类在网页上点「验收通过（归档）」→ 该任务出现在「归档历史」弹窗里，带完成时间；人类还会用它测试单条删除/全选删除（会真的删除，注意别把别的历史删了）。

## 判定标准

- 第 1 步伪造头像得到 422，任务未被接取；
- 接取成功后卡片显示**图片头像 + 加粗名称 + 灰色 id 小药丸**（名称与 id 分开显示，不会连成一串）；
- `PATCH` 后卡片出现两个紫色标签，且没有任何「类型」徽章；
- 归档历史弹窗里能看到本任务与完成时间。

## 说明

- 人类已在看板加入本任务（标题「验收测试任务 v2」，workspace 文件夹指向本文件夹，标签 `demo`）；
- agent 全程通过 API 操作，网页只负责人类验收与查看。
