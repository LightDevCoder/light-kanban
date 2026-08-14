// Light-Kanban board UI — vanilla JS, polling refresh.
'use strict';

const REFRESH_MS = 5000;

// A 处理中 task untouched for longer than this is flagged "suspected stuck".
const STUCK_THRESHOLD_MS = 24 * 60 * 60 * 1000;

const COLUMNS = [
  { status: 'todo', title: '待处理', color: 'gray', icon: '' },
  { status: 'in_progress', title: '处理中', color: 'yellow', icon: '…' },
  { status: 'blocked', title: '遇到阻碍', color: 'red', icon: '!' },
  { status: 'awaiting_confirmation', title: '等你确认', color: 'green', icon: '✓' },
];

const boardEl = document.getElementById('board');
const connectionEl = document.getElementById('connection');

let tasks = [];
let agents = [];

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
  connectionEl.className = 'connection ' + (ok ? 'ok' : 'bad');
  connectionEl.title = ok ? '已连接' : '连接失败';
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
  return d.toLocaleString();
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
      return `<img class="avatar avatar-img" src="${esc(agent.avatar)}" alt="头像" title="${esc(agent.name || id)}">`;
    }
    return `<span class="avatar avatar-custom">${esc(agent.avatar)}</span>`;
  }
  return `<span class="avatar" style="background:hsl(${hashHue(id)} 60% 45%)">${esc(initial)}</span>`;
}

// 卡片上的 agent 身份：头像 + 名称。agentId 只存在于 API 层（接取/归属用），
// 界面不显示——名称与 id 相同时显示 id 毫无意义，只有在需要区分同名 agent
// 的不同 session 时才需要 id，而那是 API 层的事。
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
  return (tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('');
}

function cardHtml(task) {
  const meta = [];
  if (task.dueAt) meta.push(`<span class="chip chip-due">截止 ${esc(fmtTime(task.dueAt))}</span>`);
  const stuck = isSuspectedStuck(task);
  const stuckBadge = stuck ? '<span class="stuck-badge" title="超过 ' + Math.round(STUCK_THRESHOLD_MS / 3600000) + ' 小时未更新">疑似卡住</span>' : '';
  return `
    <article class="card ${stuck ? 'card-stuck' : ''}" data-id="${esc(task.id)}">
      <h3 class="card-title">${esc(task.title)} ${stuckBadge}
        <button class="icon-btn" data-action="open-folder" data-id="${esc(task.id)}" title="打开项目文件夹">📁</button>
        ${agentChip(task)}
      </h3>
      <div class="card-path" title="workspace 文件夹">${esc(task.workspacePath)}</div>
      ${task.description ? `<p class="card-desc">${esc(task.description)}</p>` : ''}
      <div class="card-meta">${meta.join('')}${tagsHtml(task.tags)}</div>
      <div class="card-actions">${actionsFor(task)}</div>
    </article>`;
}

// Status → available actions, shared by every card render.
const STATUS_ACTIONS = {
  todo: [['claim', '接取'], ['edit', '编辑'], ['delete', '删除']],
  in_progress: [['block', '阻碍'], ['complete', '完成'], ['recycle', '回收'], ['edit', '编辑'], ['delete', '删除']],
  blocked: [['unblock', '解除阻碍'], ['edit', '编辑'], ['delete', '删除']],
  awaiting_confirmation: [['archive', '验收通过（归档）'], ['reject', '退回修改'], ['edit', '编辑'], ['delete', '删除']],
};

function actionsFor(task) {
  const id = esc(task.id);
  return (STATUS_ACTIONS[task.status] || [])
    // 接取是 agent 通过 API 做的动作：只有本浏览器保存过 agent 身份才显示按钮
    .filter(([action]) => action !== 'claim' || Boolean(identity().agentId))
    .map(([action, label]) => `<button data-action="${action}" data-id="${id}">${label}</button>`)
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
    alert('添加任务失败：' + err.message);
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
    alert('保存失败：' + err.message);
  }
});

document.getElementById('edit-cancel').addEventListener('click', closeEditor);
editModal.addEventListener('click', (ev) => {
  if (ev.target === editModal) closeEditor();
});

function render() {
  const frag = document.createDocumentFragment();
  for (const col of COLUMNS) {
    const colTasks = tasks.filter((t) => t.status === col.status);
    const section = document.createElement('section');
    section.className = 'column column-' + col.color;
    section.innerHTML = `
      <h2 class="column-title">
        <span class="title-left"><span class="status-icon status-${col.color}">${col.icon}</span>${col.title}</span>
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
// 注册是 agent 自己的事，网页不提供注册表单：卡片上会直接显示 agent
// 注册时提供的信息（头像 + 名称）。本浏览器保存过身份时，「接取」按钮才会出现。

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
      alert('本浏览器没有保存 agent 身份：agent 应通过 API 接取（POST /api/tasks/:id/claim，携带 agentId/name/avatar）。');
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
    if (!confirm('确定删除该任务？此操作不可恢复（归档历史里也会消失）。')) return;
    await api(`/api/tasks/${idEnc}`, { method: 'DELETE' });
  } else if (action === 'open-folder') {
    const task = tasks.find((t) => t.id === id);
    if (task) {
      await api('/api/fs/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: task.workspacePath }),
      });
      return; // 打开文件夹不需要刷新看板
    }
  } else if (action === 'edit') {
    const task = tasks.find((t) => t.id === id);
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
    browsePathEl.textContent = res.path || '（根目录，点击下方路径进入）';
    browsePathEl.title = res.path;
    browseListing.replaceChildren();
    if (!res.dirs.length) {
      browseListing.innerHTML = '<p class="history-empty">这个文件夹下没有子文件夹</p>';
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
    alert('浏览失败：' + err.message);
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
    alert('系统选择失败：' + err.message);
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
  archiveCount.textContent = `共 ${archivedTasks.length} 条`;
  if (!archivedTasks.length) {
    archiveList.innerHTML = '<p class="history-empty">还没有已归档的任务。</p>';
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
      <input type="checkbox" class="history-check" data-id="${esc(task.id)}" title="选择此任务">
      <div class="history-main">
        <div class="history-title">${esc(task.title)}</div>
        <div class="history-path">${esc(task.workspacePath)}</div>
        <div class="history-tags">${tagsHtml(task.tags)}</div>
      </div>
      <div class="history-side">
        <div class="history-when">完成于 ${esc(fmtTime(task.completedAt))}</div>
        <button type="button" class="delete-btn" data-del-id="${esc(task.id)}" title="删除此历史记录">删除</button>
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
  if (!confirm('确定删除该条历史记录？此操作不可恢复。')) return;
  try {
    await deleteArchived([del.dataset.delId]);
  } catch (err) {
    alert('删除失败：' + err.message);
  }
});

archiveDeleteSelected.addEventListener('click', async () => {
  const ids = checkedArchiveIds();
  if (!ids.length) return;
  if (!confirm(`确定删除选中的 ${ids.length} 条历史记录？此操作不可恢复。`)) return;
  try {
    await deleteArchived(ids);
  } catch (err) {
    alert('删除失败：' + err.message);
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
    alert('加载历史失败：' + err.message);
  }
});

boardEl.addEventListener('click', async (ev) => {
  const btn = ev.target.closest('button[data-action]');
  if (!btn) return;
  try {
    await performAction(btn.dataset.action, btn.dataset.id);
  } catch (err) {
    alert('操作失败：' + err.message);
  }
});

refresh();
setInterval(refresh, REFRESH_MS);
