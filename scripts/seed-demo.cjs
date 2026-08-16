#!/usr/bin/env node
/*
 * Seed a RUNNING Light-Kanban with realistic demo data (density test +
 * screenshot-ready board). API-only: drives the same endpoints agents use.
 *
 *   node scripts/seed-demo.cjs                # seed http://localhost:8080
 *   LK_BASE=http://localhost:9090 node scripts/seed-demo.cjs
 *   node scripts/seed-demo.cjs --force        # seed even if tasks exist
 *
 * Covers: 12+ todo, 4+ in_progress, 3 blocked (with reasons), 12+ awaiting
 * confirmation, a few archived; 2 agents (Codex, Claude Code) with their real
 * icon images (scripts/demo-assets/, uploaded via POST /api/avatars);
 * 4 workspaces; long/short titles; no/long descriptions; single/multi tags;
 * due today / overdue / future.
 *
 * Note: "suspected stuck" (in_progress untouched >24h) is time-based and
 * cannot be set via the API. To demo it, age one task directly, e.g.:
 *   sqlite3 kanban.db "UPDATE tasks SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now','-2 days') WHERE title LIKE 'Refactor agent claim%'"
 */
'use strict'

const fs = require('fs')
const path = require('path')

const BASE = (process.env.LK_BASE || 'http://localhost:8080').replace(/\/$/, '')
const FORCE = process.argv.includes('--force')
const HOME = process.env.HOME
const P = `${HOME}/Documents/Projects`
const WS = {
  kanban: `${P}/light-kanban`,
  pae: `${P}/PAE-Agent`,
  site: `${P}/Personal-Website`,
  ai: `${P}/AIForFreshmen`,
}

// Demo agents use their real product icons (scripts/demo-assets/).
const ASSETS = path.resolve(__dirname, 'demo-assets')
const AGENTS = [
  { agentId: 'codex', name: 'Codex', icon: path.join(ASSETS, 'codex.png') },
  { agentId: 'claude-code', name: 'Claude Code', icon: path.join(ASSETS, 'claude-code.png') },
]

// Demo cards point at these workspaces; create any missing ones so the
// card's "open project folder" button works during acceptance.
for (const ws of Object.values(WS)) fs.mkdirSync(ws, { recursive: true })

function dueIn(days, hour = 18) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}

async function uploadAvatar(file) {
  const buf = fs.readFileSync(file)
  const fd = new FormData()
  fd.append('file', new Blob([buf], { type: 'image/png' }), path.basename(file))
  const res = await fetch(`${BASE}/api/avatars`, { method: 'POST', body: fd })
  if (!res.ok) throw new Error(`avatar upload → ${res.status}`)
  return (await res.json()).path
}

async function main() {
  const existing = await call('GET', '/api/tasks')
  if (existing.length && !FORCE) {
    console.log(`board already has ${existing.length} task(s); use --force to seed anyway`)
    return
  }

  for (const a of AGENTS) a.avatar = await uploadAvatar(a.icon)

  const create = (title, ws, extra = {}) =>
    call('POST', '/api/tasks', { title, workspacePath: ws, ...extra })
  const claim = (id, agentId) => {
    const a = AGENTS.find((x) => x.agentId === agentId)
    return call('POST', `/api/tasks/${id}/claim`, { agentId: a.agentId, name: a.name, avatar: a.avatar })
  }

  // { t: title, ws, tags?, desc?, due?, agent?, blockReason?, done?: true, archived?: true }
  const plan = [
    // ---- 待处理 (13) ----
    { t: 'Redesign onboarding flow', ws: WS.site, tags: ['ui', 'onboarding'], due: dueIn(6) },
    { t: 'Add search keyboard shortcut', ws: WS.kanban, tags: ['ui'] },
    { t: 'Improve archive filtering', ws: WS.kanban, tags: ['archive'] },
    { t: '补充 PAE 知识库的中文词条与示例', ws: WS.pae, tags: ['内容'] },
    { t: 'Write ADR for frontend state caching', ws: WS.kanban, tags: ['docs'], desc: 'Record why TanStack Query polling was chosen over manual refresh / websockets.' },
    { t: '调研 EdgeOne Pages 部署看板只读视图的可行性', ws: WS.kanban, tags: ['research', 'deploy'] },
    { t: 'Fix flaky store concurrency test', ws: WS.kanban, tags: ['go', 'test'], due: dueIn(0) },
    { t: 'Design avatar crop dialog', ws: WS.kanban, tags: ['ui'] },
    { t: '整理 AIForFreshmen 课程大纲结构', ws: WS.ai, tags: ['内容', '整理'] },
    { t: 'Add board density stress fixture to CI', ws: WS.kanban, tags: ['test'] },
    { t: 'Translate manual-test-checklist to English', ws: WS.kanban, tags: ['docs', 'i18n'] },
    { t: '个人主页增加项目格子与最近动态', ws: WS.site, tags: ['ui', '主页'], due: dueIn(-1) },
    { t: 'Evaluate SQLite WAL mode for concurrent readers', ws: WS.kanban, tags: ['go', 'sqlite'], desc: 'modernc.org/sqlite supports _pragma; measure list latency with 3 concurrent pollers.' },

    // ---- 处理中 (4) ----
    { t: 'Refactor agent claim workflow', ws: WS.kanban, tags: ['agent', 'workflow'], agent: 'codex', desc: 'Split claim validation from registration; keep atomicity guarantees intact.' },
    { t: 'Improve workspace detection', ws: WS.kanban, tags: ['workspace'], agent: 'claude-code' },
    { t: '重写个人站点首页 Hero 区', ws: WS.site, tags: ['ui'], agent: 'codex' },
    { t: 'PAE 知识库数据导入管道', ws: WS.pae, tags: ['data'], agent: 'claude-code', desc: 'CSV → 清洗 → 入库 → 索引重建，全流程幂等。' },

    // ---- 遇到阻碍 (3) ----
    { t: 'GitHub authentication unavailable', ws: WS.kanban, tags: ['github'], agent: 'codex', blockReason: 'GitHub authentication required — token expired, need a fresh PAT' },
    { t: '等待新版首页设计稿确认', ws: WS.site, tags: ['设计'], agent: 'claude-code', blockReason: '需要用户确认设计稿 v3 的配色与排版' },
    { t: 'Upstream data source rate limited', ws: WS.pae, tags: ['data'], agent: 'codex', blockReason: '数据源限流 (429)，明天 10:00 后重试' },

    // ---- 等你确认 (12) ----
    { t: 'Update bilingual documentation', ws: WS.kanban, tags: ['docs', 'i18n'], agent: 'claude-code', done: true },
    { t: 'Simplify workspace folder browsing', ws: WS.kanban, tags: ['macOS', 'ui'], agent: 'codex', done: true },
    { t: 'Add compact task cards', ws: WS.kanban, tags: ['ui', 'card'], agent: 'codex', done: true },
    { t: '统一网页端与 agent 的看板持久化路径', ws: WS.kanban, tags: ['persistence'], agent: 'claude-code', done: true },
    { t: '详情页支持标签选择与创建', ws: WS.kanban, tags: ['ui', '标签'], agent: 'claude-code', done: true },
    { t: 'Remove legacy vanilla JS frontend', ws: WS.kanban, tags: ['frontend'], agent: 'codex', done: true },
    { t: '完成 v1.0.1 发布与四平台二进制', ws: WS.kanban, tags: ['release'], agent: 'codex', done: true },
    { t: 'PAE 知识库搜索索引重建', ws: WS.pae, tags: ['search'], agent: 'codex', done: true },
    { t: '个人站点暗色模式', ws: WS.site, tags: ['ui', 'darkmode'], agent: 'claude-code', done: true },
    { t: 'README 快速上手截图更新', ws: WS.kanban, tags: ['docs'], agent: 'codex', done: true },
    { t: 'Verify Windows double-click launch', ws: WS.kanban, tags: ['windows', 'release'], agent: 'codex', done: true },
    { t: '归档历史支持多选删除', ws: WS.kanban, tags: ['archive'], agent: 'claude-code', done: true },

    // ---- 已归档 (3) ----
    { t: '搭建 SQLite store 层与状态机', ws: WS.kanban, tags: ['go', 'sqlite'], agent: 'codex', done: true, archived: true },
    { t: '四列看板首版上线', ws: WS.kanban, tags: ['ui'], agent: 'claude-code', done: true, archived: true },
    { t: 'Agent 自注册与头像约束', ws: WS.kanban, tags: ['agent'], agent: 'codex', done: true, archived: true },
  ]

  for (const item of plan) {
    const task = await create(item.t, item.ws, {
      ...(item.tags ? { tags: item.tags } : {}),
      ...(item.desc ? { description: item.desc } : {}),
      ...(item.due ? { dueAt: item.due } : {}),
    })
    if (item.agent) await claim(task.id, item.agent)
    if (item.blockReason) await call('POST', `/api/tasks/${task.id}/block`, { reason: item.blockReason })
    if (item.done) await call('POST', `/api/tasks/${task.id}/complete`)
    if (item.archived) await call('POST', `/api/tasks/${task.id}/archive`)
  }

  console.log(`seeded ${plan.length} tasks + ${AGENTS.length} agents at ${BASE}`)
}

main().catch((e) => {
  console.error('seed failed:', e.message)
  process.exit(1)
})
