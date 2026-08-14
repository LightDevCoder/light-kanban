// Light-Kanban board UI — vanilla JS, polling refresh.
'use strict';

const REFRESH_MS = 5000;

const COLUMNS = [
  { status: 'todo', title: '待处理', color: 'gray' },
  { status: 'in_progress', title: '处理中', color: 'yellow' },
  { status: 'blocked', title: '遇到阻碍', color: 'red' },
  { status: 'awaiting_confirmation', title: '等你确认', color: 'green' },
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

// Avatar: explicit avatar wins; otherwise hash-color + first character of name.
function hashHue(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

function agentById(id) {
  return agents.find((a) => a.id === id) || null;
}

function agentChip(task) {
  if (!task.claimedBy) return '';
  const agent = agentById(task.claimedBy) || { id: task.claimedBy, name: task.claimedBy };
  const initial = (agent.name || agent.id).trim().charAt(0) || '?';
  const avatar = agent.avatar
    ? `<span class="avatar avatar-custom">${esc(agent.avatar)}</span>`
    : `<span class="avatar" style="background:hsl(${hashHue(agent.id)} 60% 45%)">${esc(initial)}</span>`;
  return `<span class="agent-chip" title="${esc(agent.id)}">${avatar}<span class="agent-name">${esc(agent.name || agent.id)}</span></span>`;
}

function cardHtml(task) {
  const tags = (task.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('');
  const meta = [];
  if (task.type) meta.push(`<span class="chip chip-type">${esc(task.type)}</span>`);
  if (task.dueAt) meta.push(`<span class="chip chip-due">截止 ${esc(fmtTime(task.dueAt))}</span>`);
  return `
    <article class="card" data-id="${esc(task.id)}">
      <h3 class="card-title">${esc(task.title)} ${agentChip(task)}</h3>
      <div class="card-path" title="workspace 文件夹">${esc(task.workspacePath)}</div>
      ${task.description ? `<p class="card-desc">${esc(task.description)}</p>` : ''}
      <div class="card-meta">${meta.join('')}${tags}</div>
      <div class="card-actions">${actionsFor(task)}</div>
    </article>`;
}

function actionsFor(task) {
  const id = esc(task.id);
  const btn = (action, label) => `<button data-action="${action}" data-id="${id}">${label}</button>`;
  switch (task.status) {
    case 'todo':
      return btn('claim', '接取');
    case 'in_progress':
      return btn('block', '阻碍') + btn('complete', '完成');
    case 'blocked':
      return btn('unblock', '解除阻碍');
    case 'awaiting_confirmation':
      return btn('archive', '验收通过（归档）') + btn('reject', '退回修改');
    default:
      return '';
  }
}

function render() {
  const frag = document.createDocumentFragment();
  for (const col of COLUMNS) {
    const colTasks = tasks.filter((t) => t.status === col.status);
    const section = document.createElement('section');
    section.className = 'column column-' + col.color;
    section.innerHTML = `
      <h2 class="column-title">${col.title} <span class="column-count">${colTasks.length}</span></h2>
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

function identity() {
  const form = document.getElementById('identity-form');
  const agentId = form.elements.agentId.value.trim();
  const name = form.elements.name.value.trim();
  const avatar = form.elements.avatar.value.trim();
  return { agentId, name, avatar };
}

function wireIdentityForm() {
  const form = document.getElementById('identity-form');
  const saved = localStorage.getItem('lk-identity');
  if (saved) {
    try {
      const id = JSON.parse(saved);
      form.elements.agentId.value = id.agentId || '';
      form.elements.name.value = id.name || '';
      form.elements.avatar.value = id.avatar || '';
    } catch { /* ignore corrupt storage */ }
  }
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    localStorage.setItem('lk-identity', JSON.stringify(identity()));
  });
}

async function performAction(action, id) {
  const idEnc = encodeURIComponent(id);
  if (action === 'claim') {
    const me = identity();
    if (!me.agentId) {
      alert('请先在顶部填写 agentId 并保存身份。');
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
  } else if (['block', 'unblock', 'complete', 'archive', 'reject'].includes(action)) {
    await api(`/api/tasks/${idEnc}/${action}`, { method: 'POST' });
  }
  await refresh();
}

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
    const tags = (task.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('');
    const row = document.createElement('div');
    row.className = 'history-row';
    row.innerHTML = `
      <div class="history-main">
        <div class="history-title">${esc(task.title)} ${task.type ? `<span class="chip chip-type">${esc(task.type)}</span>` : ''}</div>
        <div class="history-path">${esc(task.workspacePath)}</div>
        <div class="history-tags">${tags}</div>
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
