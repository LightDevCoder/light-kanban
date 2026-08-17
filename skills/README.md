# light-kanban-worker — vendored snapshot（随仓库附带的 Worker Skill 副本）

> English summary: `skills/light-kanban-worker/` is a **byte-identical snapshot** of the
> first-party `light-kanban-worker` Skill from `LightDevCoder/skills` tag `v0.1.5`
> (commit recorded in `skills/manifest.json`), vendored so users can install the Worker without running `npx`.
> The upstream repository is the behavioral authority. Integrity is pinned by
> `skills/manifest.json` and checked by `make check` (see `scripts/verify-vendored-skill.cjs`).

## 这是什么

`skills/light-kanban-worker/` 是官方第一方 Worker Skill（[LightDevCoder/skills](https://github.com/LightDevCoder/skills) → `skills/light-kanban-worker`）在 `v0.1.5` tag（commit 见 `skills/manifest.json`）上的**逐字节快照**，随 Light-Kanban 仓库一起分发，供不想（或不能）用 `npx skills add` 的用户手动安装。

**行为权威永远是上游**：`LightDevCoder/skills` 的 `skills/light-kanban-worker/SKILL.md`。本目录只是安装载体，不是第二个真相源。

## 两种安装方式

### 方式一（推荐）：从 skills 仓库安装

```bash
npx skills add LightDevCoder/skills#v0.1.5 --skill light-kanban-worker --yes --copy --agent '*'
```

### 方式二：手动复制本目录（离线 / 无 npx）

把整个包目录（不是只复制 `SKILL.md`）复制到 agent host 认可的 skills root，例如：

```bash
# 以 codex / 通用 host 的 ~/.agents/skills 为例，按你的 host 实际目录为准
mkdir -p ~/.agents/skills
cp -R skills/light-kanban-worker ~/.agents/skills/light-kanban-worker
```

然后刷新 / 重启 agent host，确认 host 的 skill 列表里能发现 `light-kanban-worker`（脱离本仓库源码目录）。

## 完整性

- `skills/manifest.json` 记录上游来源（repo / tag / commit）与全部 14 个文件的 SHA-256。
- `make check` 会运行 `scripts/verify-vendored-skill.cjs`：实际递归文件集必须与 manifest 文件集**完全一致**——本地改动（hash 漂移）、缺文件、多出未登记文件都会让门禁失败（自测模式 7 断言覆盖 positive 与三类负例，会故意篡改副本验证守卫真的会报错）。
- 升级流程：上游 skills 发布新版本后，从新 tag 重新抽取本目录、重新生成 manifest、同步本 README 中的 tag/commit，**不要**直接编辑快照里的文件。
