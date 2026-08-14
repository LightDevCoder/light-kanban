// Light-Kanban board UI — vanilla JS, polling refresh, zh/en i18n.
'use strict';

const REFRESH_MS = 5000;

// A 处理中 task untouched for longer than this is flagged "suspected stuck".
const STUCK_THRESHOLD_MS = 24 * 60 * 60 * 1000;

// ---- i18n ----

const I18N = {
  zh: {
    docTitle: 'Light-Kanban 任务看板',
    'topbar.add': '＋ 添加任务',
    'topbar.wizard': '使用向导',
    'topbar.wizardTitle': '重新打开使用引导',
    'topbar.history': '归档历史',
    'topbar.historyTitle': '打开已归档任务列表',
    'topbar.langTitle': '切换语言',
    'conn.ok': '已连接',
    'conn.bad': '连接失败',
    'col.todo': '待处理',
    'col.in_progress': '处理中',
    'col.blocked': '遇到阻碍',
    'col.awaiting_confirmation': '等你确认',
    'act.claim': '接取',
    'act.edit': '编辑',
    'act.delete': '删除',
    'act.archive': '验收通过（归档）',
    'card.openFolder': '打开项目文件夹',
    'card.workspace': 'workspace 文件夹',
    'card.due': '截止',
    'card.stuck': '疑似卡住',
    'card.stuckTitle': '超过 {h} 小时未更新',
    'add.title': '添加任务',
    'add.titleField': '标题',
    'add.workspaceField': 'workspace 文件夹',
    'add.descField': '描述 / 指令正文',
    'add.tagsField': '标签（逗号分隔多个，如 go, ui）',
    'add.dueField': '截止时间（留空表示无截止）',
    'add.phTitle': '要让 agent 做什么',
    'add.phWorkspace': '任务对应的项目文件夹路径',
    'add.phDesc': '给 agent 的指令正文（可选）',
    'add.phTags': 'go, ui',
    'add.submit': '添加',
    'edit.title': '编辑任务',
    'edit.titleField': '标题',
    'edit.workspaceField': 'workspace 文件夹',
    'edit.descField': '描述 / 指令正文',
    'edit.tagsField': '标签（逗号分隔多个）',
    'edit.dueField': '截止时间（留空表示无截止）',
    'edit.statusField': '状态（人工纠正用）',
    'edit.submit': '保存',
    'status.todo': '待处理',
    'status.in_progress': '处理中',
    'status.blocked': '遇到阻碍',
    'status.awaiting_confirmation': '等你确认',
    'status.archived': '已归档',
    'common.cancel': '取消',
    'archive.title': '已归档历史',
    'archive.count': '共 {n} 条',
    'archive.selectAll': '全选',
    'archive.deleteSelected': '删除选中',
    'archive.close': '关闭',
    'archive.empty': '还没有已归档的任务。',
    'archive.checkTitle': '选择此任务',
    'archive.completedAt': '完成于',
    'archive.delete': '删除',
    'archive.deleteOneConfirm': '确定删除该条历史记录？此操作不可恢复。',
    'archive.deleteManyConfirm': '确定删除选中的 {n} 条历史记录？此操作不可恢复。',
    'browse.title': '选择 workspace 文件夹',
    'browse.browse': '浏览…',
    'browse.browseTitle': '在页面里浏览服务器文件夹',
    'browse.pick': '系统选择…',
    'browse.pickTitle': '调起服务器所在电脑的系统文件夹对话框',
    'browse.up': '上级',
    'browse.select': '选择此文件夹',
    'browse.empty': '这个文件夹下没有子文件夹',
    'browse.root': '（根目录，点击下方路径进入）',
    'wizard.welcome': '欢迎使用 Light-Kanban 任务看板',
    'wizard.skip': '跳过',
    'wizard.prev': '上一步',
    'wizard.next': '下一步',
    'wizard.finish': '开始使用',
    'wizard.step1': '<h4>① 添加任务</h4><p>点右上角「＋ 添加任务」，在弹窗里填写：</p><ul><li><b>标题</b>：要让 agent 做什么</li><li><b>workspace 文件夹</b>：该任务的项目文件夹路径（可「浏览…」或「系统选择…」）</li><li>可选：描述 / 标签 / 截止时间</li></ul><p>添加后任务出现在<b>待处理</b>列，agent 就可以接取了。</p>',
    'wizard.step2': '<h4>② Agent 接取（agent 自己做）</h4><p>告诉你的 agent 通过 API 自己注册并接取：</p><pre><code>GET  /api/tasks                     # 找到任务和它的 id\nPOST /api/avatars                   # 上传头像图片（multipart file）\nPOST /api/tasks/&lt;id&gt;/claim      # body: {"agentId","name","avatar"}</code></pre><p>接取约束：<code>name</code> 用工具名，<code>avatar</code> 必须是真实图片（上传的路径或 http(s) 图片 URL），伪造路径会被 422 拒绝。接取后卡片显示 agent 的头像和名称。</p>',
    'wizard.step3': '<h4>③ 干活与状态流转（agent 通过 API）</h4><p>agent 干活时通过 API 更新状态，你只需要看四列：</p><ul><li><code>POST /api/tasks/&lt;id&gt;/block</code> — 遇到阻碍 → <b>遇到阻碍</b>列</li><li><code>POST /api/tasks/&lt;id&gt;/unblock</code> — 解除阻碍 → <b>处理中</b>列</li><li><code>POST /api/tasks/&lt;id&gt;/complete</code> — 干完交回 → <b>等你确认</b>列</li></ul>',
    'wizard.step4': '<h4>④ 验收与归档</h4><p>任务到「等你确认」后由你验收：</p><ul><li>通过 → 点卡片上的「验收通过（归档）」，任务进入<b>归档历史</b>（右上「归档历史」弹窗，可单条 / 全选删除）</li><li>不通过 → 直接命令 agent 修改，它自己调 API 把任务退回<b>处理中</b></li></ul>',
    'alert.claimNoIdentity': '本浏览器没有保存 agent 身份：agent 应通过 API 接取（POST /api/tasks/:id/claim，携带 agentId/name/avatar）。',
    'alert.deleteTaskConfirm': '确定删除该任务？此操作不可恢复（归档历史里也会消失）。',
    'alert.addFailed': '添加任务失败：{e}',
    'alert.saveFailed': '保存失败：{e}',
    'alert.opFailed': '操作失败：{e}',
    'alert.historyLoadFailed': '加载历史失败：{e}',
    'alert.deleteFailed': '删除失败：{e}',
    'alert.browseFailed': '浏览失败：{e}',
    'alert.pickFailed': '系统选择失败：{e}',
  },
  en: {
    docTitle: 'Light-Kanban Task Board',
    'topbar.add': '+ Add Task',
    'topbar.wizard': 'Guide',
    'topbar.wizardTitle': 'Reopen the onboarding guide',
    'topbar.history': 'Archive',
    'topbar.historyTitle': 'Open archived tasks',
    'topbar.langTitle': 'Switch language',
    'conn.ok': 'Connected',
    'conn.bad': 'Connection lost',
    'col.todo': 'To Do',
    'col.in_progress': 'In Progress',
    'col.blocked': 'Blocked',
    'col.awaiting_confirmation': 'Awaiting Confirmation',
    'act.claim': 'Claim',
    'act.edit': 'Edit',
    'act.delete': 'Delete',
    'act.archive': 'Accept & Archive',
    'card.openFolder': 'Open project folder',
    'card.workspace': 'workspace folder',
    'card.due': 'Due',
    'card.stuck': 'Suspected stuck',
    'card.stuckTitle': 'not updated for {h}+ hours',
    'add.title': 'Add Task',
    'add.titleField': 'Title',
    'add.workspaceField': 'Workspace folder',
    'add.descField': 'Description / Instructions',
    'add.tagsField': 'Tags (comma-separated, e.g. go, ui)',
    'add.dueField': 'Due date (empty = none)',
    'add.phTitle': 'What should the agent do',
    'add.phWorkspace': 'Path of the project folder for this task',
    'add.phDesc': 'Instructions for the agent (optional)',
    'add.phTags': 'go, ui',
    'add.submit': 'Add',
    'edit.title': 'Edit Task',
    'edit.titleField': 'Title',
    'edit.workspaceField': 'Workspace folder',
    'edit.descField': 'Description / Instructions',
    'edit.tagsField': 'Tags (comma-separated)',
    'edit.dueField': 'Due date (empty = none)',
    'edit.statusField': 'Status (manual correction)',
    'edit.submit': 'Save',
    'status.todo': 'To Do',
    'status.in_progress': 'In Progress',
    'status.blocked': 'Blocked',
    'status.awaiting_confirmation': 'Awaiting Confirmation',
    'status.archived': 'Archived',
    'common.cancel': 'Cancel',
    'archive.title': 'Archive History',
    'archive.count': '{n} item(s)',
    'archive.selectAll': 'Select all',
    'archive.deleteSelected': 'Delete selected',
    'archive.close': 'Close',
    'archive.empty': 'No archived tasks yet.',
    'archive.checkTitle': 'Select this task',
    'archive.completedAt': 'Completed',
    'archive.delete': 'Delete',
    'archive.deleteOneConfirm': 'Delete this history entry? This cannot be undone.',
    'archive.deleteManyConfirm': 'Delete the {n} selected history entries? This cannot be undone.',
    'browse.title': 'Choose a workspace folder',
    'browse.browse': 'Browse…',
    'browse.browseTitle': 'Browse folders on the server in this page',
    'browse.pick': 'System picker…',
    'browse.pickTitle': 'Open the system folder dialog on the server machine',
    'browse.up': 'Up',
    'browse.select': 'Choose this folder',
    'browse.empty': 'This folder has no subfolders',
    'browse.root': '(root — pick a folder below)',
    'wizard.welcome': 'Welcome to Light-Kanban',
    'wizard.skip': 'Skip',
    'wizard.prev': 'Back',
    'wizard.next': 'Next',
    'wizard.finish': 'Get started',
    'wizard.step1': '<h4>① Add a task</h4><p>Click "<b>+ Add Task</b>" in the top bar and fill in:</p><ul><li><b>Title</b>: what the agent should do</li><li><b>Workspace folder</b>: the project folder for this task (browse in-page or use the system picker)</li><li>Optional: description / tags / due date</li></ul><p>The task lands in the <b>To Do</b> column, ready for an agent to claim.</p>',
    'wizard.step2': '<h4>② An agent claims it (the agent does this)</h4><p>Tell your agent to self-register and claim via the API:</p><pre><code>GET  /api/tasks                     # find the task and its id\nPOST /api/avatars                   # upload an avatar image (multipart file)\nPOST /api/tasks/&lt;id&gt;/claim      # body: {"agentId","name","avatar"}</code></pre><p>Claim constraints: <code>name</code> is your tool name; <code>avatar</code> must be a real image (an uploaded path or an http(s) image URL) — fabricated paths get a 422. The card then shows the agent&apos;s avatar and name.</p>',
    'wizard.step3': '<h4>③ Work and status transitions (agent, via API)</h4><p>The agent updates status through the API; you just watch the four columns:</p><ul><li><code>POST /api/tasks/&lt;id&gt;/block</code> — blocked → <b>Blocked</b> column</li><li><code>POST /api/tasks/&lt;id&gt;/unblock</code> — unblocked → <b>In Progress</b> column</li><li><code>POST /api/tasks/&lt;id&gt;/complete</code> — finished → <b>Awaiting Confirmation</b> column</li></ul>',
    'wizard.step4': '<h4>④ Review and archive</h4><p>When a task reaches "Awaiting Confirmation", you review it:</p><ul><li>Accept → click "<b>Accept &amp; Archive</b>" on the card; it moves to the <b>Archive</b> modal (top bar; supports single and select-all delete)</li><li>Not good enough → just tell the agent to fix it; the agent moves the task back to <b>In Progress</b> via the API</li></ul>',
    'alert.claimNoIdentity': 'No agent identity saved in this browser: agents claim via the API (POST /api/tasks/:id/claim with agentId/name/avatar).',
    'alert.deleteTaskConfirm': 'Delete this task? This cannot be undone (it will also disappear from the archive).',
    'alert.addFailed': 'Failed to add task: {e}',
    'alert.saveFailed': 'Failed to save: {e}',
    'alert.opFailed': 'Operation failed: {e}',
    'alert.historyLoadFailed': 'Failed to load history: {e}',
    'alert.deleteFailed': 'Failed to delete: {e}',
    'alert.browseFailed': 'Browse failed: {e}',
    'alert.pickFailed': 'System picker failed: {e}',
  },
};

let lang = localStorage.getItem('lk-lang') ||
  (String(navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en');

function t(key) {
  return (I18N[lang] && I18N[lang][key]) || I18N.zh[key] || key;
}

function tpl(key, vars) {
  let s = t(key);
  for (const k in vars) s = s.replaceAll('{' + k + '}', String(vars[k]));
  return s;
}

const COLUMNS = [
  { status: 'todo', color: 'gray', icon: '' },
  { status: 'in_progress', color: 'yellow', icon: '…' },
  { status: 'blocked', color: 'red', icon: '!' },
  { status: 'awaiting_confirmation', color: 'green', icon: '✓' },
];

// Status → available actions (label keys into I18N), shared by every card render.
// 状态流转（接取/阻碍/解除阻碍/完成/回收/退回）是 agent 通过 API 做的动作，
// 界面只保留人类的真实操作：每列都有 编辑/删除，「等你确认」另有「验收通过（归档）」。
const STATUS_ACTIONS = {
  todo: [['claim', 'act.claim'], ['edit', 'act.edit'], ['delete', 'act.delete']],
  in_progress: [['edit', 'act.edit'], ['delete', 'act.delete']],
  blocked: [['edit', 'act.edit'], ['delete', 'act.delete']],
  awaiting_confirmation: [['archive', 'act.archive'], ['edit', 'act.edit'], ['delete', 'act.delete']],
};

const boardEl = document.getElementById('board');
const connectionEl = document.getElementById('connection');
const langToggle = document.getElementById('lang-toggle');

let tasks = [];
let agents = [];
let connected = true;

async function api(path, options) {
  const resp = await fetch(path, options);
  let body = null;
  try { body = await resp.json(); } catch { /* non-JSON */ }
  if (!resp.ok) {
    throw new Error((body && body.error) || `HTTP ${resp.status}`);
  }
  return body;
}

function setConnection(ok) {
  connected = ok;
  connectionEl.className = 'connection ' + (ok ? 'ok' : 'bad');
  connectionEl.title = ok ? t('conn.ok') : t('conn.bad');
}

async function refresh() {
  try {
    [tasks, agents] = await Promise.all([api('/api/tasks'), api('/api/agents')]);
    setConnection(true);
    render();
  } catch (err) {
    setConnection(false);
  }
}

function esc(s) {
  const div = document.createElement('div');
  div.textContent = s == null ? '' : String(s);
  return div.innerHTML;
}

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US');
}

function hashHue(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

function agentById(id) {
  return agents.find((a) => a.id === id) || null;
}

// Avatar: image file (URL path) wins, then legacy text/emoji, then
// hash-color + first character of name.
function isImageAvatar(v) {
  return typeof v === 'string' && (v.startsWith('/') || v.startsWith('http://') || v.startsWith('https://'));
}

function avatarHtml(agent) {
  const id = agent.id || '';
  const initial = (agent.name || id).trim().charAt(0) || '?';
  if (agent.avatar) {
    if (isImageAvatar(agent.avatar)) {
      return `<img class="avatar avatar-img" src="${esc(agent.avatar)}" alt="avatar" title="${esc(agent.name || id)}">`;
    }
    return `<span class="avatar avatar-custom">${esc(agent.avatar)}</span>`;
  }
  return `<span class="avatar" style="background:hsl(${hashHue(id)} 60% 45%)">${esc(initial)}</span>`;
}

// 卡片上的 agent 身份：头像 + 名称。agentId 只存在于 API 层（接取/归属用），界面不显示。
function agentChip(task) {
  if (!task.claimedBy) return '';
  const agent = agentById(task.claimedBy) || { id: task.claimedBy, name: task.claimedBy };
  return `<span class="agent-chip">${avatarHtml(agent)}<span class="agent-name">${esc(agent.name || agent.id)}</span></span>`;
}

function isSuspectedStuck(task) {
  if (task.status !== 'in_progress') return false;
  const updated = Date.parse(task.updatedAt);
  if (Number.isNaN(updated)) return false;
  return Date.now() - updated > STUCK_THRESHOLD_MS;
}

function tagsHtml(tags) {
  return (tags || []).map((x) => `<span class="tag">${esc(x)}</span>`).join('');
}

function cardHtml(task) {
  const meta = [];
  if (task.dueAt) meta.push(`<span class="chip chip-due">${esc(t('card.due'))} ${esc(fmtTime(task.dueAt))}</span>`);
  const stuck = isSuspectedStuck(task);
  const hours = Math.round(STUCK_THRESHOLD_MS / 3600000);
  const stuckBadge = stuck
    ? `<span class="stuck-badge" title="${esc(tpl('card.stuckTitle', { h: hours }))}">${esc(t('card.stuck'))}</span>`
    : '';
  return `
    <article class="card ${stuck ? 'card-stuck' : ''}" data-id="${esc(task.id)}">
      <h3 class="card-title">${esc(task.title)} ${stuckBadge}
        <button class="icon-btn" data-action="open-folder" data-id="${esc(task.id)}" title="${esc(t('card.openFolder'))}">📁</button>
        ${agentChip(task)}
      </h3>
      <div class="card-path" title="${esc(t('card.workspace'))}">${esc(task.workspacePath)}</div>
      ${task.description ? `<p class="card-desc">${esc(task.description)}</p>` : ''}
      <div class="card-meta">${meta.join('')}${tagsHtml(task.tags)}</div>
      <div class="card-actions">${actionsFor(task)}</div>
    </article>`;
}

function actionsFor(task) {
  const id = esc(task.id);
  return (STATUS_ACTIONS[task.status] || [])
    // 接取是 agent 通过 API 做的动作：只有本浏览器保存过 agent 身份才显示按钮
    .filter(([action]) => action !== 'claim' || Boolean(identity().agentId))
    .map(([action, labelKey]) => `<button data-action="${action}" data-id="${id}">${esc(t(labelKey))}</button>`)
    .join('');
}

// ---- 添加任务弹窗 ----

const addModal = document.getElementById('add-modal');
const addForm = document.getElementById('add-form');

function openAdd() {
  addForm.reset();
  addModal.classList.remove('hidden');
  addForm.elements.title.focus();
}

function closeAdd() {
  addModal.classList.add('hidden');
}

document.getElementById('add-task-btn').addEventListener('click', openAdd);
document.getElementById('add-cancel').addEventListener('click', closeAdd);
addModal.addEventListener('click', (ev) => {
  if (ev.target === addModal) closeAdd();
});

addForm.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const fd = new FormData(addForm);
  const payload = {
    title: fd.get('title').trim(),
    workspacePath: fd.get('workspacePath').trim(),
  };
  const description = fd.get('description').trim();
  const tags = fd.get('tags').split(',').map((s) => s.trim()).filter(Boolean);
  const dueAtRaw = fd.get('dueAt');
  if (description) payload.description = description;
  if (tags.length) payload.tags = tags;
  if (dueAtRaw) payload.dueAt = new Date(dueAtRaw).toISOString();
  try {
    await api('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    closeAdd();
    await refresh();
  } catch (err) {
    alert(tpl('alert.addFailed', { e: err.message }));
  }
});

// ---- Task editor modal ----

const editModal = document.getElementById('edit-modal');
const editForm = document.getElementById('edit-form');
let editingTask = null;

function toLocalInput(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function openEditor(task) {
  editingTask = task;
  editForm.elements.title.value = task.title || '';
  editForm.elements.workspacePath.value = task.workspacePath || '';
  editForm.elements.description.value = task.description || '';
  editForm.elements.tags.value = (task.tags || []).join(', ');
  editForm.elements.dueAt.value = toLocalInput(task.dueAt);
  editForm.elements.status.value = task.status || 'todo';
  editModal.classList.remove('hidden');
}

function closeEditor() {
  editingTask = null;
  editModal.classList.add('hidden');
}

editForm.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (!editingTask) return;
  const fd = new FormData(editForm);
  const payload = {
    title: fd.get('title').trim(),
    workspacePath: fd.get('workspacePath').trim(),
    description: fd.get('description'),
    tags: fd.get('tags').split(',').map((s) => s.trim()).filter(Boolean),
    dueAt: fd.get('dueAt') ? new Date(fd.get('dueAt')).toISOString() : '',
  };
  const status = fd.get('status');
  if (status !== editingTask.status) payload.status = status;
  try {
    await api(`/api/tasks/${encodeURIComponent(editingTask.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    closeEditor();
    await refresh();
  } catch (err) {
    alert(tpl('alert.saveFailed', { e: err.message }));
  }
});

document.getElementById('edit-cancel').addEventListener('click', closeEditor);
editModal.addEventListener('click', (ev) => {
  if (ev.target === editModal) closeEditor();
});

function render() {
  const frag = document.createDocumentFragment();
  for (const col of COLUMNS) {
    const colTasks = tasks.filter((x) => x.status === col.status);
    const section = document.createElement('section');
    section.className = 'column column-' + col.color;
    section.innerHTML = `
      <h2 class="column-title">
        <span class="title-left"><span class="status-icon status-${col.color}">${col.icon}</span>${esc(t('col.' + col.status))}</span>
        <span class="column-count">${colTasks.length}</span>
      </h2>
      <div class="column-body"></div>`;
    const body = section.querySelector('.column-body');
    for (const task of colTasks) {
      const wrap = document.createElement('div');
      wrap.innerHTML = cardHtml(task);
      body.appendChild(wrap.firstElementChild);
    }
    frag.appendChild(section);
  }
  boardEl.replaceChildren(frag);
}

// ---- Agent identity (saved locally; agents normally claim via the API) ----

let savedIdentity = loadIdentity();

function loadIdentity() {
  try {
    return JSON.parse(localStorage.getItem('lk-identity') || '{}');
  } catch {
    return {};
  }
}

function identity() {
  return savedIdentity;
}

async function performAction(action, id) {
  const idEnc = encodeURIComponent(id);
  if (action === 'claim') {
    const me = identity();
    if (!me.agentId) {
      alert(t('alert.claimNoIdentity'));
      return;
    }
    const payload = { agentId: me.agentId };
    if (me.name) payload.name = me.name;
    if (me.avatar) payload.avatar = me.avatar;
    await api(`/api/tasks/${idEnc}/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } else if (['block', 'unblock', 'complete', 'archive', 'reject', 'recycle'].includes(action)) {
    await api(`/api/tasks/${idEnc}/${action}`, { method: 'POST' });
  } else if (action === 'delete') {
    if (!confirm(t('alert.deleteTaskConfirm'))) return;
    await api(`/api/tasks/${idEnc}`, { method: 'DELETE' });
  } else if (action === 'open-folder') {
    const task = tasks.find((x) => x.id === id);
    if (task) {
      await api('/api/fs/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: task.workspacePath }),
      });
      return; // 打开文件夹不需要刷新看板
    }
  } else if (action === 'edit') {
    const task = tasks.find((x) => x.id === id);
    if (task) openEditor(task);
  }
  if (action !== 'edit') await refresh();
}

// ---- workspace 文件夹目录浏览 ----

const browseModal = document.getElementById('browse-modal');
const browsePathEl = document.getElementById('browse-path');
const browseListing = document.getElementById('browse-listing');
let browseCtx = { input: null, path: '' };

function openBrowser(input) {
  browseCtx.input = input;
  browseModal.classList.remove('hidden');
  loadBrowse('');
}

// A path the server will accept: absolute per its platform rules.
function isAbsolutePath(p) {
  return p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p);
}

async function loadBrowse(path) {
  try {
    // Never send a non-absolute path: reset to roots instead of a 400.
    const q = path && isAbsolutePath(path) ? '?path=' + encodeURIComponent(path) : '';
    const res = await api('/api/fs/dirs' + q);
    browseCtx.path = res.path;
    browsePathEl.textContent = res.path || t('browse.root');
    browsePathEl.title = res.path;
    browseListing.replaceChildren();
    if (!res.dirs.length) {
      browseListing.innerHTML = `<p class="history-empty">${esc(t('browse.empty'))}</p>`;
      return;
    }
    for (const dir of res.dirs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'browse-item';
      btn.textContent = dir;
      btn.title = dir;
      btn.addEventListener('click', () => loadBrowse(dir));
      browseListing.appendChild(btn);
    }
  } catch (err) {
    alert(tpl('alert.browseFailed', { e: err.message }));
  }
}

// Parent of an absolute path ('' = show roots). Handles C:\ and / style paths.
function parentOf(path) {
  if (!path) return '';
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
  parts.pop();
  if (!parts.length) return '';
  if (/^[A-Za-z]:$/.test(parts[0])) return parts[0] + ':\\';
  return '/' + parts.join('/');
}

document.getElementById('browse-up').addEventListener('click', () => loadBrowse(parentOf(browseCtx.path)));
document.getElementById('browse-select').addEventListener('click', () => {
  if (browseCtx.input) browseCtx.input.value = browseCtx.path;
  browseModal.classList.add('hidden');
});
document.getElementById('browse-cancel').addEventListener('click', () => browseModal.classList.add('hidden'));
browseModal.addEventListener('click', (ev) => {
  if (ev.target === browseModal) browseModal.classList.add('hidden');
});

document.querySelectorAll('[data-browse-target]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.browseTarget;
    const input = target === 'edit'
      ? editForm.elements.workspacePath
      : addForm.elements.workspacePath;
    openBrowser(input);
  });
});

// ---- 系统原生文件夹选择（服务端弹窗，仅在服务器本机可见）----

async function pickSystemFolder(input) {
  try {
    const res = await api('/api/fs/pick', { method: 'POST' });
    if (res.path) input.value = res.path;
  } catch (err) {
    alert(tpl('alert.pickFailed', { e: err.message }));
  }
}

document.querySelectorAll('[data-pick-target]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.pickTarget;
    const input = target === 'edit'
      ? editForm.elements.workspacePath
      : addForm.elements.workspacePath;
    pickSystemFolder(input);
  });
});

// ---- 归档历史弹窗 ----

const archiveModal = document.getElementById('archive-modal');
const archiveList = document.getElementById('archive-list');
const archiveCount = document.getElementById('archive-count');
const archiveSelectAll = document.getElementById('archive-select-all');
const archiveDeleteSelected = document.getElementById('archive-delete-selected');
let archivedTasks = [];

async function fetchArchived() {
  archivedTasks = await api('/api/tasks?status=archived');
}

function renderArchive() {
  archiveList.replaceChildren();
  archiveCount.textContent = tpl('archive.count', { n: archivedTasks.length });
  if (!archivedTasks.length) {
    archiveList.innerHTML = `<p class="history-empty">${esc(t('archive.empty'))}</p>`;
    archiveSelectAll.checked = false;
    archiveSelectAll.disabled = true;
    archiveDeleteSelected.disabled = true;
    return;
  }
  archiveSelectAll.disabled = false;
  for (const task of archivedTasks) {
    const row = document.createElement('div');
    row.className = 'history-row';
    row.innerHTML = `
      <input type="checkbox" class="history-check" data-id="${esc(task.id)}" title="${esc(t('archive.checkTitle'))}">
      <div class="history-main">
        <div class="history-title">${esc(task.title)}</div>
        <div class="history-path">${esc(task.workspacePath)}</div>
        <div class="history-tags">${tagsHtml(task.tags)}</div>
      </div>
      <div class="history-side">
        <div class="history-when">${esc(t('archive.completedAt'))} ${esc(fmtTime(task.completedAt))}</div>
        <button type="button" class="delete-btn" data-del-id="${esc(task.id)}" title="${esc(t('archive.delete'))}">${esc(t('archive.delete'))}</button>
      </div>`;
    archiveList.appendChild(row);
  }
  syncSelectAll();
}

function checkedArchiveIds() {
  return Array.from(archiveList.querySelectorAll('input.history-check:checked')).map((c) => c.dataset.id);
}

function syncSelectAll() {
  const boxes = archiveList.querySelectorAll('input.history-check');
  const checked = archiveList.querySelectorAll('input.history-check:checked').length;
  archiveSelectAll.checked = boxes.length > 0 && checked === boxes.length;
  archiveDeleteSelected.disabled = checked === 0;
}

async function openArchive() {
  await fetchArchived();
  renderArchive();
  archiveModal.classList.remove('hidden');
}

function closeArchive() {
  archiveModal.classList.add('hidden');
}

async function deleteArchived(ids) {
  for (const id of ids) {
    await api(`/api/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
  await Promise.all([refresh(), fetchArchived()]);
  renderArchive();
}

archiveSelectAll.addEventListener('change', () => {
  const on = archiveSelectAll.checked;
  archiveList.querySelectorAll('input.history-check').forEach((c) => { c.checked = on; });
  syncSelectAll();
});

archiveList.addEventListener('change', (ev) => {
  if (ev.target.matches('input.history-check')) syncSelectAll();
});

archiveList.addEventListener('click', async (ev) => {
  const del = ev.target.closest('button[data-del-id]');
  if (!del) return;
  if (!confirm(t('archive.deleteOneConfirm'))) return;
  try {
    await deleteArchived([del.dataset.delId]);
  } catch (err) {
    alert(tpl('alert.deleteFailed', { e: err.message }));
  }
});

archiveDeleteSelected.addEventListener('click', async () => {
  const ids = checkedArchiveIds();
  if (!ids.length) return;
  if (!confirm(tpl('archive.deleteManyConfirm', { n: ids.length }))) return;
  try {
    await deleteArchived(ids);
  } catch (err) {
    alert(tpl('alert.deleteFailed', { e: err.message }));
  }
});

document.getElementById('archive-close').addEventListener('click', closeArchive);
archiveModal.addEventListener('click', (ev) => {
  if (ev.target === archiveModal) closeArchive();
});

document.getElementById('history-toggle').addEventListener('click', async () => {
  try {
    await openArchive();
  } catch (err) {
    alert(tpl('alert.historyLoadFailed', { e: err.message }));
  }
});

// ---- 首次使用引导向导（与 README 的 Quick Start 同一步骤）----

const WIZARD_KEY = 'lk-wizard-seen';
const wizardModal = document.getElementById('wizard-modal');
const wizardSteps = document.getElementById('wizard-steps');
const wizardDots = document.getElementById('wizard-dots');
const wizardPrev = document.getElementById('wizard-prev');
const wizardNext = document.getElementById('wizard-next');
const wizardFinish = document.getElementById('wizard-finish');
let wizardIndex = 0;
const WIZARD_STEP_COUNT = 4;

function renderWizard() {
  wizardSteps.replaceChildren();
  for (let i = 0; i < WIZARD_STEP_COUNT; i++) {
    const section = document.createElement('section');
    section.className = 'wizard-step' + (i === wizardIndex ? '' : ' hidden');
    section.innerHTML = t('wizard.step' + (i + 1));
    wizardSteps.appendChild(section);
  }
  wizardDots.replaceChildren();
  for (let i = 0; i < WIZARD_STEP_COUNT; i++) {
    const dot = document.createElement('span');
    dot.className = 'wizard-dot' + (i === wizardIndex ? ' active' : i < wizardIndex ? ' done' : '');
    wizardDots.appendChild(dot);
  }
  wizardPrev.classList.toggle('hidden', wizardIndex === 0);
  wizardNext.classList.toggle('hidden', wizardIndex === WIZARD_STEP_COUNT - 1);
  wizardFinish.classList.toggle('hidden', wizardIndex !== WIZARD_STEP_COUNT - 1);
}

function openWizard() {
  wizardIndex = 0;
  renderWizard();
  wizardModal.classList.remove('hidden');
}

function closeWizard() {
  wizardModal.classList.add('hidden');
  localStorage.setItem(WIZARD_KEY, '1');
}

wizardPrev.addEventListener('click', () => {
  if (wizardIndex > 0) {
    wizardIndex--;
    renderWizard();
  }
});
wizardNext.addEventListener('click', () => {
  if (wizardIndex < WIZARD_STEP_COUNT - 1) {
    wizardIndex++;
    renderWizard();
  }
});
wizardFinish.addEventListener('click', closeWizard);
document.getElementById('wizard-skip').addEventListener('click', closeWizard);
wizardModal.addEventListener('click', (ev) => {
  if (ev.target === wizardModal) closeWizard();
});
document.getElementById('wizard-open').addEventListener('click', openWizard);

// ---- 语言切换 ----

function applyLang() {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPh);
  });
  langToggle.textContent = lang === 'zh' ? 'EN' : '中文';
  langToggle.title = t('topbar.langTitle');
  setConnection(connected);
  render();
  if (!archiveModal.classList.contains('hidden')) renderArchive();
  if (!wizardModal.classList.contains('hidden')) renderWizard();
}

langToggle.addEventListener('click', () => {
  lang = lang === 'zh' ? 'en' : 'zh';
  localStorage.setItem('lk-lang', lang);
  applyLang();
});

boardEl.addEventListener('click', async (ev) => {
  const btn = ev.target.closest('button[data-action]');
  if (!btn) return;
  try {
    await performAction(btn.dataset.action, btn.dataset.id);
  } catch (err) {
    alert(tpl('alert.opFailed', { e: err.message }));
  }
});

applyLang();
refresh();
setInterval(refresh, REFRESH_MS);

// 首次访问自动弹出引导（点过「跳过 / 开始使用」后不再弹出，随时可点「使用向导」重开）
if (!localStorage.getItem(WIZARD_KEY)) openWizard();
