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
    renderAgentList();
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

// Avatar: explicit avatar wins; otherwise hash-color + first character of name.
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

function agentChip(task) {
  if (!task.claimedBy) return '';
  const agent = agentById(task.claimedBy) || { id: task.claimedBy, name: task.claimedBy };
  return `<span class="agent-chip" title="${esc(agent.id)}">${avatarHtml(agent)}<span class="agent-name">${esc(agent.name || agent.id)}</span></span>`;
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
  if (task.type) meta.push(`<span class="chip chip-type">${esc(task.type)}</span>`);
  if (task.dueAt) meta.push(`<span class="chip chip-due">截止 ${esc(fmtTime(task.dueAt))}</span>`);
  const stuck = isSuspectedStuck(task);
  const stuckBadge = stuck ? '<span class="stuck-badge" title="超过 ' + Math.round(STUCK_THRESHOLD_MS / 3600000) + ' 小时未更新">疑似卡住</span>' : '';
  return `
    <article class="card ${stuck ? 'card-stuck' : ''}" data-id="${esc(task.id)}">
      <h3 class="card-title">${esc(task.title)} ${stuckBadge} ${agentChip(task)}</h3>
      <div class="card-path" title="workspace 文件夹">${esc(task.workspacePath)}</div>
      ${task.description ? `<p class="card-desc">${esc(task.description)}</p>` : ''}
      <div class="card-meta">${meta.join('')}${tagsHtml(task.tags)}</div>
      <div class="card-actions">${actionsFor(task)}</div>
    </article>`;
}

// Status → available actions, shared by every card render.
const STATUS_ACTIONS = {
  todo: [['claim', '接取'], ['edit', '编辑']],
  in_progress: [['block', '阻碍'], ['complete', '完成'], ['recycle', '回收'], ['edit', '编辑']],
  blocked: [['unblock', '解除阻碍'], ['edit', '编辑']],
  awaiting_confirmation: [['archive', '验收通过（归档）'], ['reject', '退回修改'], ['edit', '编辑']],
};

function actionsFor(task) {
  const id = esc(task.id);
  return (STATUS_ACTIONS[task.status] || [])
    // 接取是 agent 通过 API 做的动作：只有保存过 agent 身份才显示按钮
    .filter(([action]) => action !== 'claim' || Boolean(identity().agentId))
    .map(([action, label]) => `<button data-action="${action}" data-id="${id}">${label}</button>`)
    .join('');
}

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
  editForm.elements.type.value = task.type || '';
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
    type: fd.get('type').trim(),
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

async function uploadAvatarFile(file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await api('/api/avatars', { method: 'POST', body: fd });
  return res.path;
}

function wireIdentityForm() {
  const form = document.getElementById('identity-form');
  if (savedIdentity.agentId) {
    form.elements.agentId.value = savedIdentity.agentId || '';
    form.elements.name.value = savedIdentity.name || '';
  }
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const agentId = form.elements.agentId.value.trim();
    if (!agentId) {
      alert('agentId 必填。');
      return;
    }
    const name = form.elements.name.value.trim();
    const file = form.elements.avatarFile.files && form.elements.avatarFile.files[0];
    try {
      let avatar = savedIdentity.avatar || '';
      if (file) {
        avatar = await uploadAvatarFile(file);
      }
      savedIdentity = { agentId, name, avatar };
      localStorage.setItem('lk-identity', JSON.stringify(savedIdentity));
      form.elements.avatarFile.value = '';
      await refresh();
    } catch (err) {
      alert('保存身份失败：' + err.message);
    }
  });
}

async function performAction(action, id) {
  const idEnc = encodeURIComponent(id);
  if (action === 'claim') {
    const me = identity();
    if (!me.agentId) {
      alert('请先在「Agent 管理」面板里填写 agentId 并保存身份（agent 通常通过 API 接取，不需要网页）。');
      document.getElementById('agents-details').open = true;
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
      : document.querySelector('#add-form input[name="workspacePath"]');
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
      : document.querySelector('#add-form input[name="workspacePath"]');
    pickSystemFolder(input);
  });
});

// ---- Agents panel ----

const agentList = document.getElementById('agent-list');
const agentForm = document.getElementById('agent-form');

function renderAgentList() {
  agentList.replaceChildren();
  for (const agent of agents) {
    const li = document.createElement('li');
    li.className = 'agent-item';
    li.innerHTML = `${avatarHtml(agent)}<span class="agent-name">${esc(agent.name || agent.id)}</span><code>${esc(agent.id)}</code>`;
    agentList.appendChild(li);
  }
}

agentForm.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const fd = new FormData(agentForm);
  const payload = { id: fd.get('id').trim() };
  const name = fd.get('name').trim();
  if (name) payload.name = name;
  const file = fd.get('avatarFile');
  try {
    if (file && file.size) {
      payload.avatar = await uploadAvatarFile(file);
    }
    await api('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    agentForm.reset();
    await refresh();
  } catch (err) {
    alert('保存 agent 失败：' + err.message);
  }
});

// ---- Archived history view ----

const historySection = document.getElementById('history');
const historyList = document.getElementById('history-list');
const historyToggle = document.getElementById('history-toggle');
let historyVisible = false;

async function renderHistory() {
  const archived = await api('/api/tasks?status=archived');
  historyList.replaceChildren();
  if (archived.length === 0) {
    historyList.innerHTML = '<p class="history-empty">还没有已归档的任务。</p>';
    return;
  }
  for (const task of archived) {
    const row = document.createElement('div');
    row.className = 'history-row';
    row.innerHTML = `
      <div class="history-main">
        <div class="history-title">${esc(task.title)} ${task.type ? `<span class="chip chip-type">${esc(task.type)}</span>` : ''}</div>
        <div class="history-path">${esc(task.workspacePath)}</div>
        <div class="history-tags">${tagsHtml(task.tags)}</div>
      </div>
      <div class="history-when">完成于 ${esc(fmtTime(task.completedAt))}</div>`;
    historyList.appendChild(row);
  }
}

async function toggleHistory() {
  historyVisible = !historyVisible;
  historySection.classList.toggle('hidden', !historyVisible);
  historyToggle.textContent = historyVisible ? '收起历史' : '归档历史';
  if (historyVisible) {
    try {
      await renderHistory();
    } catch (err) {
      alert('加载历史失败：' + err.message);
    }
  }
}

historyToggle.addEventListener('click', toggleHistory);

boardEl.addEventListener('click', async (ev) => {
  const btn = ev.target.closest('button[data-action]');
  if (!btn) return;
  try {
    await performAction(btn.dataset.action, btn.dataset.id);
  } catch (err) {
    alert('操作失败：' + err.message);
  }
});

function wireAddForm() {
  const form = document.getElementById('add-form');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const payload = {
      title: fd.get('title').trim(),
      workspacePath: fd.get('workspacePath').trim(),
    };
    const description = fd.get('description').trim();
    const type = fd.get('type').trim();
    const tags = fd.get('tags').split(',').map((s) => s.trim()).filter(Boolean);
    const dueAtRaw = fd.get('dueAt');
    if (description) payload.description = description;
    if (type) payload.type = type;
    if (tags.length) payload.tags = tags;
    if (dueAtRaw) payload.dueAt = new Date(dueAtRaw).toISOString();
    try {
      await api('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      form.reset();
      await refresh();
    } catch (err) {
      alert('添加任务失败：' + err.message);
    }
  });
}

wireIdentityForm();
wireAddForm();
refresh();
setInterval(refresh, REFRESH_MS);
