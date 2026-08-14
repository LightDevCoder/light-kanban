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
    tasks = await api('/api/tasks');
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

function cardHtml(task) {
  const tags = (task.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('');
  const meta = [];
  if (task.type) meta.push(`<span class="chip chip-type">${esc(task.type)}</span>`);
  if (task.dueAt) meta.push(`<span class="chip chip-due">截止 ${esc(fmtTime(task.dueAt))}</span>`);
  return `
    <article class="card" data-id="${esc(task.id)}">
      <h3 class="card-title">${esc(task.title)}</h3>
      <div class="card-path" title="workspace 文件夹">${esc(task.workspacePath)}</div>
      ${task.description ? `<p class="card-desc">${esc(task.description)}</p>` : ''}
      <div class="card-meta">${meta.join('')}${tags}</div>
      <div class="card-actions"></div>
    </article>`;
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

wireAddForm();
refresh();
setInterval(refresh, REFRESH_MS);
