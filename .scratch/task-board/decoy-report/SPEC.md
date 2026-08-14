# 周报数据整理任务（候选）

候选任务：用于测试 agent 是否按标题精确接取。工作量很小。

## 步骤

1. **接取**：`POST /api/tasks/<id>/claim`，body `{"agentId":"<你的id>","name":"<你的工具名>","avatar":"<真实图片：先 POST /api/avatars 上传或用 http(s) 图片 URL>"}`。`<id>` 用 `GET /api/tasks` 按标题「周报数据整理任务」找到。
2. **干活**：在本文件夹创建 `output.txt`：
   ```
   agent <你的agentId> 于 <时间> 接取了「周报数据整理任务」
   ```
3. **交回**：`POST /api/tasks/<id>/complete`。

## 判定标准

- 卡片出现在「等你确认」列；
- `output.txt` 存在且内容正确。
