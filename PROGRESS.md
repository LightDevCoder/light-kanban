# PROGRESS — 项目进度与交接记录

> 本文档记录 Light-Kanban 的当前进度、约定、待办与 Mac 迁移指引，供后续维护者快速接上手。
> 最后更新：2026-08-16（v1.0.2 UI 重构实现完成，等待本地验收）

## 1. 当前状态

- **远端仓库**：https://github.com/LightDevCoder/light-kanban（public，gh 账号 LightDevCoder）
- **最新发布**：`v1.0.1`（tag 指向 `f465348`），4 个平台二进制齐全
- **进行中**：`v1.0.2` —— UI/UX 重构（React + TypeScript + Vite）。实现完成、测试通过、production embed 验证通过；**等待用户本地验收 + 新版截图，未获明确批准前不 push / 不打 tag / 不发 Release**
- **工作树**：本地提交领先 origin/main（见 git log）

## 2. v1.0.2 已实现（本地，未发布）

- **前端迁移**：`internal/webui` 的 vanilla JS → `frontend/`（React 18 + TypeScript + Vite + TanStack Query），产物提交在 `internal/webui/dist/`（go:embed，单二进制不变；fresh clone 无需 npm 即可 go build/test）。决策见 `docs/adr/0002-react-frontend.md`
- **新版看板**：浅色安静顶栏（搜索 / 筛选 / 设置 / +）；四列固定结构、列头 pinned、每列独立滚动、窄屏横向滚动；高密度紧凑卡片（LK-XXXX 短号、右上 18px Agent 头像、workspace basename + 哈希色点、≤2 标签 +N、截止/逾期/卡住 chips、阻碍原因行）
- **任务抽屉**：点卡片右侧打开，view/edit 分离；验收通过 / 退回修改（可带反馈）/ 回收到待处理 / 编辑 / 删除 / 打开项目文件夹
- **搜索与筛选**：搜索匹配标题/描述/workspace/标签/Agent 名；筛选支持 Agent + Workspace + 标签 + 状态组合，直接作用于看板
- **归档历史 / 使用向导 / 语言切换**收进顶栏设置菜单；连接指示只在断连时出现
- **API 附加字段（向后兼容）**：`POST /block` 可选 `{"reason"}`（卡片可见，unblock 清除）；`POST /reject` 可选 `{"feedback"}`（agent 经 GET /api/tasks 读取，complete 清除）；人工改状态会清空两者
- **种子脚本**：`node scripts/seed-demo.cjs`（35 任务 / 3 Agent / 4 workspace，覆盖密度测试与截图场景）
- 双语 UI（中文 / English）完整保留；5s 轮询保留（TanStack Query refetchInterval）

## 3. 架构与目录

- **单 Go 二进制**：REST API（chi）+ SQLite（modernc.org/sqlite，纯 Go 无 CGO）+ `go:embed` 网页
- `cmd/light-kanban/main.go` — 入口（自动开浏览器在这里）
- `internal/api/` — HTTP API（含 `api_test.go`）
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
- **前端工具链**：`make frontend-install`（npm ci）→ 开发 `make dev-frontend`（Vite :5173 代理 /api 到 :8080）→ 出产物 `make frontend-build`（拷入 `internal/webui/dist` 并随改动提交）
- **格式化**：`gofmt -l internal cmd scripts`（永远不要 `gofmt -l .`）
- **测试纪律（红绿）**：测试只跑在两个接缝 —— HTTP API 与 store 直接层。改功能先写红用例再实现
- **i18n**：`frontend/src/i18n/zh.ts` 是 key 基准，`en.ts` 必须同构（tsc 强制）
- **跨平台构建**：`make cross`（或 `scripts\cross-build.ps1`）→ `dist/` 四平台二进制；两者都会先构建前端
- **发布流程**：dist 构建 → `gh release create vN` 附 4 个二进制；`gh auth setup-git` 后 git push 走令牌。**v1.0.2 额外 gate：用户本地验收 + 中英文新截图入库后才允许发布**

## 5. 待办 / 未决事项

- [ ] **用户本地验收 v1.0.2**（SPEC 第 49 节清单）
- [ ] **新版截图**：中文 + English 各一张 → `Assets/light-kanban-CN.png` / `Assets/light-kanban-EN.png`（用户截图；不要自行生成最终截图），README 引用同步
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
make test                        # 全量红绿
make cross                       # 产出 dist/ 四个平台二进制（会先构建前端）
make build && ./dist/light-kanban

# 4. 直接跑发布版（不用构建）
mkdir -p ~/light-kanban && cd ~/light-kanban
# 从 Releases 下载 light-kanban-darwin-arm64（M 系列）/ darwin-amd64（Intel）
chmod +x light-kanban-darwin-arm64 && ./light-kanban-darwin-arm64
# Gatekeeper 提示时：右键 → 打开，或 xattr -dr com.apple.quarantine light-kanban-darwin-arm64
```

## 7. 运行时数据（不入库）

- `kanban.db`（SQLite，默认当前目录）、`avatars/`（上传头像，默认当前目录）——均已 gitignore
- 删除数据 = 删这两个文件，重启即全新看板
