'use strict';

// Plain browser JS talking to the API in src/app.js. No build step, no framework.

const els = {
  form: document.getElementById('create-form'),
  formError: document.getElementById('form-error'),
  list: document.getElementById('notes'),
  count: document.getElementById('count'),
  empty: document.getElementById('empty'),
  search: document.getElementById('search'),
  tagBar: document.getElementById('tag-bar'),
  health: document.getElementById('health'),
};

let activeTag = '';

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const payload = res.status === 204 ? null : await res.json();
  if (!res.ok) {
    const { message, details } = payload.error;
    throw new Error([message, ...(details ?? [])].join('\n'));
  }
  return payload;
}

function noteElement(note) {
  const li = document.createElement('li');
  li.className = 'note';

  const head = document.createElement('div');
  head.className = 'note-head';

  const title = document.createElement('h3');
  title.textContent = note.title;

  const del = document.createElement('button');
  del.className = 'delete';
  del.type = 'button';
  del.title = 'Delete note';
  del.setAttribute('aria-label', `Delete ${note.title}`);
  del.textContent = '×';
  del.addEventListener('click', async () => {
    await api(`/api/notes/${note.id}`, { method: 'DELETE' });
    await refresh();
  });

  head.append(title, del);
  li.append(head);

  if (note.body) {
    const body = document.createElement('p');
    body.textContent = note.body;
    li.append(body);
  }

  const meta = document.createElement('div');
  meta.className = 'note-meta';
  for (const tag of note.tags) {
    const span = document.createElement('span');
    span.className = 'tag';
    span.textContent = tag;
    meta.append(span);
  }
  const when = document.createElement('span');
  when.textContent = new Date(note.updatedAt).toLocaleString();
  meta.append(when);
  li.append(meta);

  return li;
}

async function refresh() {
  const params = new URLSearchParams();
  if (els.search.value.trim()) params.set('q', els.search.value.trim());
  if (activeTag) params.set('tag', activeTag);

  const query = params.toString();
  const { notes, count } = await api(`/api/notes${query ? `?${query}` : ''}`);

  els.list.replaceChildren(...notes.map(noteElement));
  els.count.textContent = count ? `(${count})` : '';
  els.empty.hidden = count > 0;

  await renderTags();
}

async function renderTags() {
  const { tags } = await api('/api/stats');
  els.tagBar.replaceChildren(
    ...tags.map(({ name, count }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${name} · ${count}`;
      button.setAttribute('aria-pressed', String(activeTag === name));
      button.addEventListener('click', () => {
        activeTag = activeTag === name ? '' : name;
        refresh().catch(showError);
      });
      return button;
    }),
  );
}

function showError(err) {
  els.formError.textContent = err.message;
  els.formError.hidden = false;
}

els.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  els.formError.hidden = true;

  const data = new FormData(els.form);
  try {
    await api('/api/notes', {
      method: 'POST',
      body: JSON.stringify({
        title: data.get('title'),
        body: data.get('body'),
        tags: String(data.get('tags') ?? '')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      }),
    });
    els.form.reset();
    await refresh();
  } catch (err) {
    showError(err);
  }
});

let searchTimer;
els.search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => refresh().catch(showError), 200);
});

async function checkHealth() {
  try {
    const { status, node, uptimeSeconds } = await api('/api/health');
    els.health.textContent = `${status} · node ${node} · up ${uptimeSeconds}s`;
    els.health.classList.add('ok');
  } catch {
    els.health.textContent = 'server unreachable';
    els.health.classList.remove('ok');
  }
}

checkHealth();
setInterval(checkHealth, 15000);
refresh().catch(showError);
