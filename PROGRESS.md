# PROGRESS — 项目进度与交接记录

> 本文档记录 Light-Kanban 的当前进度、约定、待办与 Mac 迁移指引，供后续维护者快速接上手。
> 最后更新：2026-08-17（v1.0.4 已实现并推送到 origin/main，等待用户发布指令）

## 1. 当前状态

- **远端仓库**：https://github.com/LightDevCoder/light-kanban（public，gh 账号 LightDevCoder）
- **最新发布**：`v1.0.3`（hardening release），4 个平台二进制齐全（tag `v1.0.3` 指向发布时 commit；不移动、不覆盖）
- **当前工作**：**v1.0.4 implementation complete — pushed to origin/main — not released**。v1.0.4 目标：归档历史一键打开项目目录 + 交互式产品导览（替换旧 Wizard）；代码、测试与文档已完成，用户本地验收中发现并修复了导览灰屏 bug（缺失目标计时器回环 + 收紧为仅高亮目标可点）。等用户明确说「可以发布」后，再跑 `make cross` 出四平台二进制、建 `v1.0.4` tag 与 GitHub Release
- **工作树**：与 origin/main 一致

## 2. v1.0.4 进行中（实现完成，已推送，未发布）

- **归档历史打开项目目录**：每条归档记录右侧新增文件夹图标（复用 Task Drawer 同款 `FolderIcon` + `openFolder` API，错误提示与抽屉一致，无新后端 API）；点击不改变归档状态、不关闭弹窗；Delete / 全选删除不变
- **交互式产品导览**（替换旧居中 Wizard Modal，`GuideDialog` 已删除）：
  - 首次进入在**真实 UI** 上运行：遮罩暗化其余区域、**只有高亮目标 + coachmark 自身按钮可点**（其余一律拦截，弹窗/菜单无法在导览外被关闭）；箭头 + 白色 coachmark 跟随；跨 Create Task Dialog / Task Drawer / Settings / Archive Dialog 导航
  - 14 步流程：+ 创建 → workspace 路径（可手输/「选择…」）→ 标题 → 创建 → 精确定位刚创建的任务卡（task.id 取自 create mutation 返回结果，精确 `data-tour-task-id` 选择器；无 mutation id 时兜底跟踪新出现的 `data-tour-task-id`，绝不误指其他卡片）→ 抽屉 → 抽屉内文件夹 → 状态区（Agent 流转说明）→ 自动关抽屉后指向等你确认列头 → 设置 → 归档历史入口 → 归档弹窗 → 归档文件夹图标（无归档数据时 optional 自动跳过）→ Finish
  - 定位只依赖稳定 `data-tour="…"` 属性；`getBoundingClientRect` + 自动四向放置 + viewport 钳制；resize/scroll 监听重算；目标滚出视野自动 `scrollIntoView`；目标缺失 3.5–4s 超时（一次性计时器带 fired 防重入守卫——修掉「恢复卡片被 MutationObserver 回环反复撤销」的灰屏 bug，optional 自动跳过 / create-submit 消失自动回到第一步 / 抽屉被关回到任务卡 / 归档弹窗被关回到归档入口 / 其余核心步骤安全提示可 Next / Exit），永不无限等待
  - **持久化语义（v1.0.4 关键变更）**：只有完整走到 Finish 才写 `lk-tour-v1-completed=1`（旧 `lk-wizard-seen` 弃用）；Skip / Esc / 刷新 / 关浏览器都不写，下次启动重新自动出现；Settings → Guide 手动重放不清除 completed
  - 全部文案进 i18n（zh/en 同构）；UI 保持 quiet / dense / grayscale-first（黑色低透明遮罩 + 白色高亮边 + 白面 tooltip + 现有 shadow），无高饱和 onboarding 视觉
- **前端单测（新接缝）**：Tour 状态逻辑抽为纯函数 `frontend/src/components/ProductTour/logic.ts`（`isTourCompleted` / `resolveStep` / `getNextStep` / `shouldSkipStep` / `targetSelector` / `computePlacement` / `placeTooltip` 等），vitest 37 用例覆盖持久化、步进、缺失跳过、定位选择器约束（禁 nth-child/class/文本）、tooltip 四向放置与 viewport 钳制、步骤 i18n key 双字典完整性；`npm test` 已接入 `make check` 与 CI
- **版本号**：frontend/package.json + package-lock.json = `1.0.4`；`internal/webui/dist` 随源码同 commit 重新生成
- **文档**：README / README_CN（导览 + 归档描述）、spec.md（v1.0.4 决策）、manual-test-checklist.md（P/Q/R 三节）+ xlsx 已重新生成

## 2b. v1.0.2 已实现（已发布）

- **前端迁移**：`internal/webui` 的 vanilla JS → `frontend/`（React 18 + TypeScript + Vite + TanStack Query），产物提交在 `internal/webui/dist/`（go:embed，单二进制不变；fresh clone 无需 npm 即可 go build/test）。决策见 `docs/adr/0002-react-frontend.md`
- **新版看板**：浅色安静顶栏（搜索 / 筛选 / 设置 / +）；四列固定结构、列头 pinned、每列独立滚动、窄屏横向滚动；高密度紧凑卡片（LK-XXXX 短号、右上 18px Agent 头像、workspace basename + 哈希色点、≤2 标签 +N、截止/逾期/卡住 chips、阻碍原因行）
- **任务抽屉**：点卡片右侧打开，view/edit 分离；验收通过 / 退回修改（可带反馈）/ 回收到待处理 / 编辑 / 删除 / 打开项目文件夹
- **搜索与筛选**：搜索匹配标题/描述/workspace/标签/Agent 名；筛选支持 Agent + Workspace + 标签 + 状态组合，直接作用于看板
- **归档历史 / 使用向导 / 语言切换**收进顶栏设置菜单；连接指示只在断连时出现
- **API 附加字段（向后兼容）**：`POST /block` 可选 `{"reason"}`（卡片可见，unblock 清除）；`POST /reject` 可选 `{"feedback"}`（agent 经 GET /api/tasks 读取，complete 清除）；人工改状态会清空两者
- **种子脚本**：`node scripts/seed-demo.cjs`（35 任务 / 3 Agent / 4 workspace，覆盖密度测试与截图场景）
- 双语 UI（中文 / English）完整保留；5s 轮询保留（TanStack Query refetchInterval）

## 2c. v1.0.3 加固（已发布）

- **默认监听收紧**：默认 `-addr 127.0.0.1:8641`（仅本机；v1 无认证）。LAN agent 场景显式 `-addr :8641` / `0.0.0.0:8641` 才对外。`browserURL` 与默认地址有 `cmd/light-kanban/main_test.go` 微接缝测试
- **status 过滤补全**：`GET /api/tasks?status=` 支持 `active`（默认）/`todo`/`in_progress`/`blocked`/`awaiting_confirmation`/`archived`；非法值 400。Store `ListTasks` 支持五个状态 token + 空（active 在 HTTP 层映射为空）；合法状态白名单收敛为 `store.ValidStatus` 单点
- **分状态排序**：待处理 `created_at ASC`（FIFO 队列）；处理中/遇到阻碍 `updated_at DESC`；等你确认 `updated_at ASC`（等最久的先验）；归档 `completed_at DESC`；combined active 按列序分组 + 列内规则（Go 侧比较器，单真相源）
- **PATCH 原子化**：`UpdateTaskWithStatus` 单条 UPDATE 落 fields + 人工状态纠正（原来 UpdateTask → SetStatus 两次写）；状态纠正语义保持 v1.0.2（todo 清 claimed_by、archived 写 completed_at、离开 archived 清它、任何纠正清 blockReason/reviewFeedback）；非法状态在任何写入前拒绝
- **CI + 提交门禁**：`.github/workflows/ci.yml`（push main + PR：npm ci → tsc+vite build → dist 同步守卫 → gofmt → vet → test）；`make check` 本地等效
- **dist 同步守卫**：CI 与 `make check` 都会重建 `internal/webui/dist` 并 `git diff --exit-code`，杜绝「改源码忘提交构建产物」
- **文档修正**：README/README_CN 同步默认绑定、LAN 说明、status 过滤、make check/CI；PROGRESS 修正 Vite 代理端口笔误（:8080 → :8641）并回填已完成待办

## 3. 架构与目录

- **单 Go 二进制**：REST API（chi）+ SQLite（modernc.org/sqlite，纯 Go 无 CGO）+ `go:embed` 网页
- `cmd/light-kanban/main.go` — 入口（自动开浏览器在这里）
- `internal/api/` — HTTP API（含 `api_test.go`、`pick_test.go`）
- `internal/store/` — SQLite 存取 + 状态机（含 `store_test.go`，并发/原子性）
- `internal/webui/` — `webui.go` embed `dist/`；`dist/` 是**提交进仓库**的前端构建产物
- `frontend/` — React 源码（api/ components/ features/ hooks/ i18n/ styles/ types/ utils/）
- `scripts/` — goenv.ps1 / fetch-go.cjs / cross-build.ps1 / make-checklist-xlsx.cjs / seed-demo.cjs
- `Makefile` — build / test / vet / cross / run / frontend-install / frontend-build / dev-frontend / clean
- `.scratch/task-board/spec.md` — **权威契约**（状态机 + API 表 + 测试决策）
- `CONTEXT.md` — 领域词汇；`docs/adr/` — 架构决策（0001 Go 单二进制，0002 React 前端）
- `docs/manual-test-checklist.md` + `docs/light-kanban-验收清单.xlsx` — 手动验收清单（md 是唯一事实源，改完跑 `node scripts/make-checklist-xlsx.cjs` 重新生成）

## 4. 开发约定（重要）

- **Go 工具链**：Mac/Linux 直接系统 Go + Makefile；Windows 先 `source scripts/goenv.ps1`
- **前端工具链**：`make frontend-install`（npm ci）→ 开发 `make dev-frontend`（Vite :5173 代理 /api 到 :8641）→ 出产物 `make frontend-build`（拷入 `internal/webui/dist` 并随改动提交）
- **格式化**：`gofmt -l internal cmd scripts`（永远不要 `gofmt -l .`）
- **提交门禁**：`make check`（重建前端 → 前端单测 vitest → dist 同步守卫 → gofmt → vet → test），CI 同款；改动 `frontend/src/` 必须同 commit 提交重新生成的 `internal/webui/dist`
- **测试纪律（红绿）**：测试跑在两个 Go 主接缝 —— HTTP API 与 store 直接层，外加 cmd 包的监听地址微接缝（main_test.go）；v1.0.4 起增加前端纯逻辑接缝（`components/ProductTour/logic.ts`，vitest，纳入 make check/CI）。改功能先写红用例再实现
- **i18n**：`frontend/src/i18n/zh.ts` 是 key 基准，`en.ts` 必须同构（tsc 强制）
- **跨平台构建**：`make cross`（或 `scripts\cross-build.ps1`）→ `dist/` 四平台二进制；两者都会先构建前端
- **发布流程**：dist 构建 → `gh release create vN` 附 4 个二进制；`gh auth setup-git` 后 git push 走令牌。**v1.0.2 额外 gate：用户本地验收 + 中英文新截图入库后才允许发布**

## 5. 待办 / 未决事项

- [x] **用户本地验收 v1.0.2**（SPEC 第 49 节清单）
- [x] **新版截图**：中文 + English 各一张 → `Assets/light-kanban-CN.png` / `Assets/light-kanban-EN.png`（v1.0.2 发布时已入库）
- [ ] **验收清单未回填**：`docs/manual-test-checklist.md` 的「结果 / 评论」列，用户测完逐条回填
- [ ] **未决产品问题**：agentId 是否需要格式约束（如禁止空格）——等用户拍板
- [ ] 明确不做（out of scope）：推送通知、WebSocket、多看板、TTL 自动回收、认证、自由拖拽换列

## 6. Mac 迁移指引（新机器）

```sh
# 1. 安装工具链
brew install go gh node
gh auth login                    # 登录 GitHub（LightDevCoder）
gh auth setup-git                # 让 git 走 gh 令牌

# 2. 拉代码
git clone https://github.com/LightDevCoder/light-kanban.git
cd light-kanban

# 3. 构建与测试（Makefile；前端产物已随仓库提交，纯看 Go 可不装 node）
make check                       # 提交门禁：前端构建 + dist 同步守卫 + gofmt/vet/test
make cross                       # 产出 dist/ 四个平台二进制（会先构建前端）
make build && ./dist/light-kanban
# 默认只监听 127.0.0.1:8641；局域网 agent 用 ./dist/light-kanban -addr :8641

# 4. 直接跑发布版（不用构建）
mkdir -p ~/light-kanban && cd ~/light-kanban
# 从 Releases 下载 light-kanban-darwin-arm64（M 系列）/ darwin-amd64（Intel）
chmod +x light-kanban-darwin-arm64 && ./light-kanban-darwin-arm64
# Gatekeeper 提示时：右键 → 打开，或 xattr -dr com.apple.quarantine light-kanban-darwin-arm64
```

## 7. 运行时数据（不入库）

- `kanban.db`（SQLite，默认当前目录）、`avatars/`（上传头像，默认当前目录）——均已 gitignore
- 删除数据 = 删这两个文件，重启即全新看板
