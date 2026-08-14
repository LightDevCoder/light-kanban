# PROGRESS — 项目进度与交接记录

> 本文档记录 Light-Kanban 的当前进度、约定、待办与 Mac 迁移指引，供后续维护者（在 Mac 上继续）快速接上手。
> 最后更新：2026-08-14（v1.0.1 发布后）

## 1. 当前状态

- **远端仓库**：https://github.com/LightDevCoder/light-kanban（public，gh 账号 LightDevCoder）
- **最新发布**：`v1.0.1`（tag 指向 `f465348`），4 个平台二进制齐全：Windows amd64 / macOS arm64+amd64 / Linux amd64
- **About 元信息**：已填描述 + topics（kanban, go, sqlite, self-hosted, ai-agents, task-board, rest-api）
- **工作树**：干净，全部改动已提交并推送

## 2. 已实现功能（v1.0.1）

- 四列看板：待处理 / 处理中 / 遇到阻碍 / 等你确认（+ 隐藏归档状态），固定列不可拖动
- **添加任务 / 归档历史均为弹窗**；归档历史支持单条删除、全选删除
- **Agent 通过 API 自注册接取**：claim 强制 `agentId` + `name`（工具名）+ `avatar`（真实图片：`POST /api/avatars` 上传路径或 http(s) URL，伪造路径 422）
- **状态流转全走 API**：claim / block / unblock / complete / recycle / reject；界面只保留人类的 编辑 / 删除 / 验收归档
- **卡片显示**：图片头像 + 加粗名称（agentId 仅存在于 API 层，界面不显示）
- **双语界面（English / 中文）**：浏览器自动检测，顶栏「EN / 中文」切换，localStorage 记住（key: `lk-lang`）
- **首次使用引导向导**：4 步，与 README Quick Start 同流程；跳过/完成后不再自动弹（key: `lk-wizard-seen`），顶栏「使用向导」随时重开
- **启动自动打开浏览器**（`-no-open` 关闭；`-addr` 换端口）
- 疑似卡住标记（处理中 >24h 未更新，红框 + 闪烁徽章）
- 📁 直达项目文件夹、页内目录浏览、系统原生文件夹选择（服务端弹窗）

## 3. 架构与目录

- **单 Go 二进制**：REST API（chi）+ SQLite（modernc.org/sqlite，纯 Go 无 CGO）+ `go:embed` 网页
- `cmd/light-kanban/main.go` — 入口（自动开浏览器在这里）
- `internal/api/` — HTTP API（含 `api_test.go`、`pick_test.go`）
- `internal/store/` — SQLite 存取 + 状态机（含 `store_test.go`，并发/原子性）
- `internal/webui/` — 纯静态前端（index.html / app.js / style.css，i18n 词典在 app.js 的 `I18N`）
- `scripts/` — goenv.ps1 / fetch-go.cjs / cross-build.ps1 / make-checklist-xlsx.cjs
- `Makefile` — 非 Windows 平台用（build / test / vet / cross / run / clean）
- `.scratch/task-board/spec.md` — **权威契约**（状态机 + API 表 + 测试决策）；`issues/01-07` 是开发记录
- `CONTEXT.md` — 领域词汇；`docs/adr/0001-*` — 架构决策
- `docs/manual-test-checklist.md` + `docs/light-kanban-验收清单.xlsx` — 手动验收清单（md 是唯一事实源，改完跑 `node scripts/make-checklist-xlsx.cjs` 重新生成）

## 4. 开发约定（重要）

- **Go 工具链**：仓库内 `.tools/`（gitignore）。Windows：先 `source scripts/goenv.ps1`（PowerShell 用 `. .\scripts\goenv.ps1`）再跑 go 命令。**Mac/Linux：直接系统 Go + Makefile**（`make test` / `make vet` / `make cross`）
- **格式化**：`gofmt -l internal cmd scripts`（永远不要 `gofmt -l .`，`.tools/` 会污染输出）
- **测试纪律（红绿）**：测试只跑在两个接缝 —— HTTP API（`internal/api/api_test.go`）与 store 直接层（`internal/store/store_test.go`）。改功能先写红用例再实现
- **跨平台构建**：`scripts\cross-build.ps1`（Windows 输出 `dist\light-kanban.exe`，即文档里的运行名）或 `make cross`
- **发布流程**：dist 构建 → `gh release create vN` 附 4 个二进制；`gh auth setup-git` 后 git push 直接走令牌

## 5. 待办 / 未决事项

- [ ] **验收清单未回填**：`docs/manual-test-checklist.md` 的「结果 / 评论」列，用户测完逐条回填
- [ ] **Mac 实机验证**：darwin-arm64 二进制在主力 Mac 上跑通（Gatekeeper、系统选择文件夹、打开项目文件夹）
- [ ] **语言切换（A6b）**在 Mac 上确认
- [ ] **未决产品问题**：agentId 是否需要格式约束（如禁止空格，强制 `grok-build` 风格）——等用户拍板，要加就在 claim 校验处加（`internal/api`）
- [ ] 明确不做（out of scope）：推送通知、WebSocket、多看板、TTL 自动回收、认证

## 6. Mac 迁移指引（新机器）

```sh
# 1. 安装工具链
brew install go gh
gh auth login                    # 登录 GitHub（LightDevCoder）
gh auth setup-git                # 让 git 走 gh 令牌（Windows 沙箱没装上，Mac 上记得做）

# 2. 拉代码
git clone https://github.com/LightDevCoder/light-kanban.git
cd light-kanban

# 3. 构建与测试（Makefile）
make test                        # 全量红绿
make cross                       # 产出 dist/ 四个平台二进制
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
