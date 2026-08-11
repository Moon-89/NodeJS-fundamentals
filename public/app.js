// Frontend logic.
//
// Two rules drive everything here:
//   1. Every action the user takes gets an explicit, visible response —
//      success, failure, or "working on it". Nothing happens silently.
//   2. Anything destructive asks first.
//
// If the API isn't reachable (for example on the static-only GitHub Pages
// build) the app falls back to storing notes in localStorage and says so
// clearly, so nobody thinks their data went to a server when it didn't.

const TITLE_MAX = 100;
const BODY_MAX = 2000;

const form = document.getElementById('note-form');
const titleInput = document.getElementById('title');
const bodyInput = document.getElementById('body');
const notesDiv = document.getElementById('notes');
const message = document.getElementById('message');
const submitBtn = document.getElementById('submit-btn');
const modeBanner = document.getElementById('mode-banner');
const titleCount = document.getElementById('title-count');
const bodyCount = document.getElementById('body-count');

let demoMode = false;
let busy = false;
const DEMO_KEY = 'demo-notes-v1';

// --- user feedback ---

let messageTimer;

function showMessage(text, kind = 'error', details = []) {
  clearTimeout(messageTimer);

  message.className = kind;
  message.textContent = '';

  const line = document.createElement('span');
  line.textContent = text;
  message.appendChild(line);

  // The API returns a `details` array explaining exactly what was wrong;
  // show it rather than a vague "failed".
  if (details.length) {
    const list = document.createElement('ul');
    for (const detail of details) {
      const item = document.createElement('li');
      item.textContent = detail;
      list.appendChild(item);
    }
    message.appendChild(list);
  }

  // Success notes are transient; errors stay until the user fixes them.
  if (kind === 'success') {
    messageTimer = setTimeout(clearMessage, 4000);
  }
}

function clearMessage() {
  clearTimeout(messageTimer);
  message.textContent = '';
  message.className = '';
}

function showBanner(text) {
  modeBanner.textContent = text;
  modeBanner.hidden = false;
}

function hideBanner() {
  modeBanner.hidden = true;
}

// Locks the form while a request is in flight so an impatient double-click
// can't create the same note twice.
function setBusy(isBusy, label) {
  busy = isBusy;
  submitBtn.disabled = isBusy;
  titleInput.disabled = isBusy;
  bodyInput.disabled = isBusy;
  submitBtn.textContent = isBusy ? label : 'Add note';
}

// --- character counters ---

function wireCounter(input, output, max) {
  const update = () => {
    const used = input.value.length;
    output.textContent = `${used} / ${max}`;
    output.classList.toggle('counter-full', used >= max);
  };
  input.addEventListener('input', update);
  update();
}

wireCounter(titleInput, titleCount, TITLE_MAX);
wireCounter(bodyInput, bodyCount, BODY_MAX);

// --- validation (mirrors src/validate.js so the user hears about a problem
//     before a round trip, but the server still enforces it) ---

function validate(title, body) {
  const errors = [];

  if (!title) {
    errors.push('Title is required.');
  } else if (title.length > TITLE_MAX) {
    errors.push(`Title must be ${TITLE_MAX} characters or fewer.`);
  }

  if (body.length > BODY_MAX) {
    errors.push(`Note must be ${BODY_MAX} characters or fewer.`);
  }

  return errors;
}

// --- demo (offline) storage ---

function saveDemoNotes(notes) {
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify(notes));
    return true;
  } catch {
    // Private browsing or a full quota.
    showMessage('Could not save locally — your browser is blocking storage.');
    return false;
  }
}

function loadDemoNotes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DEMO_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function enterDemoMode() {
  demoMode = true;
  showBanner('Demo mode — the backend is not reachable, so notes are saved in this browser only.');
}

// --- API ---

// Wraps fetch so every caller gets the same error shape, and so a non-JSON
// response (an HTML error page, say) doesn't throw an opaque parse error.
async function api(path, options) {
  const res = await fetch(path, options);

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.details = (data && data.details) || [];
    err.status = res.status;
    throw err;
  }

  return data;
}

// --- rendering ---

function renderNotes(notes) {
  notesDiv.setAttribute('aria-busy', 'false');
  notesDiv.textContent = '';

  if (!notes || notes.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No notes yet. Add one above.';
    notesDiv.appendChild(empty);
    return;
  }

  const count = document.createElement('p');
  count.className = 'count';
  count.textContent = `${notes.length} note${notes.length === 1 ? '' : 's'}`;
  notesDiv.appendChild(count);

  // newest first
  for (const note of notes.slice().reverse()) {
    const div = document.createElement('div');
    div.className = 'note';

    const button = document.createElement('button');
    button.className = 'delete';
    button.type = 'button';
    button.textContent = 'delete';
    // An accessible name, since "delete" on its own says nothing about which note.
    button.setAttribute('aria-label', `Delete note: ${note.title}`);
    button.onclick = () => confirmDelete(note, button);

    const h3 = document.createElement('h3');
    h3.textContent = note.title;

    const p = document.createElement('p');
    p.textContent = note.body;

    const date = document.createElement('div');
    date.className = 'date';
    date.textContent = formatDate(note.createdAt, note.updatedAt);

    div.appendChild(button);
    div.appendChild(h3);
    div.appendChild(p);
    div.appendChild(date);
    notesDiv.appendChild(div);
  }
}

// A missing or malformed createdAt shouldn't render as "Invalid Date".
function formatDate(createdAt, updatedAt) {
  const stamp = new Date(createdAt);
  if (Number.isNaN(stamp.getTime())) return 'Date unknown';

  let text = stamp.toLocaleString();
  if (updatedAt) {
    const edited = new Date(updatedAt);
    if (!Number.isNaN(edited.getTime())) text += ` · edited ${edited.toLocaleString()}`;
  }
  return text;
}

function showLoadFailure(err) {
  notesDiv.setAttribute('aria-busy', 'false');
  notesDiv.textContent = '';

  const p = document.createElement('p');
  p.className = 'empty';
  p.textContent = err.message;
  notesDiv.appendChild(p);

  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'Retry';
  retry.onclick = loadNotes;
  notesDiv.appendChild(retry);
}

// --- actions ---

async function loadNotes() {
  clearMessage();
  notesDiv.setAttribute('aria-busy', 'true');
  notesDiv.textContent = 'Loading notes…';

  // Once we're in demo mode, stay there — silently retrying the network on
  // every action would make the app feel unpredictable.
  if (demoMode) {
    renderNotes(loadDemoNotes());
    return;
  }

  try {
    const notes = await api('/api/notes');
    hideBanner();
    renderNotes(notes);
  } catch (err) {
    // A 5xx means the backend is there but broken — that's worth reporting
    // properly rather than quietly pretending to work offline.
    if (err.status && err.status >= 500) {
      showMessage(err.message, 'error', err.details);
      showLoadFailure(new Error('Could not load your notes.'));
      return;
    }

    enterDemoMode();
    renderNotes(loadDemoNotes());
  }
}

async function confirmDelete(note, button) {
  if (busy) return;

  // Explicit confirmation, naming the note so it's clear what's about to go.
  if (!confirm(`Delete "${note.title}"?\n\nThis cannot be undone.`)) {
    showMessage('Delete cancelled — nothing was removed.', 'info');
    return;
  }

  clearMessage();
  button.disabled = true;
  button.textContent = 'deleting…';

  if (demoMode) {
    const notes = loadDemoNotes().filter((n) => String(n.id) !== String(note.id));
    if (saveDemoNotes(notes)) {
      renderNotes(notes);
      showMessage(`Deleted "${note.title}".`, 'success');
    } else {
      button.disabled = false;
      button.textContent = 'delete';
    }
    return;
  }

  try {
    await api('/api/notes/' + encodeURIComponent(note.id), { method: 'DELETE' });
    await loadNotes();
    showMessage(`Deleted "${note.title}".`, 'success');
  } catch (err) {
    button.disabled = false;
    button.textContent = 'delete';

    // Already gone — someone deleted it in another tab. Resync rather than
    // leaving a note on screen that no longer exists.
    if (err.status === 404) {
      showMessage('That note was already deleted. Refreshing the list.', 'info');
      await loadNotes();
      return;
    }

    showMessage(`Could not delete "${note.title}". ${err.message}`, 'error', err.details);
  }
}

form.onsubmit = async (event) => {
  event.preventDefault();
  if (busy) return;

  clearMessage();

  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();

  const errors = validate(title, body);
  if (errors.length) {
    showMessage('Please fix the following:', 'error', errors);
    titleInput.focus();
    return;
  }

  setBusy(true, 'Saving…');

  if (demoMode) {
    const notes = loadDemoNotes();
    const note = {
      id: String(Date.now()),
      title,
      body,
      createdAt: new Date().toISOString(),
    };
    notes.push(note);

    if (saveDemoNotes(notes)) {
      form.reset();
      wireCounterReset();
      renderNotes(notes);
      showMessage(`Saved "${title}" in this browser.`, 'success');
    }

    setBusy(false);
    titleInput.focus();
    return;
  }

  try {
    const note = await api('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body }),
    });

    form.reset();
    wireCounterReset();
    setBusy(false);
    await loadNotes();
    showMessage(`Added "${note.title}".`, 'success');
    titleInput.focus();
  } catch (err) {
    setBusy(false);

    // The form still holds what the user typed, so say so — nobody should
    // have to retype a note because the network hiccuped.
    showMessage(`Could not save the note. ${err.message} Your text is still here.`, 'error', err.details);
    titleInput.focus();
  }
};

// form.reset() doesn't fire an input event, so the counters need a nudge.
function wireCounterReset() {
  titleInput.dispatchEvent(new Event('input'));
  bodyInput.dispatchEvent(new Event('input'));
}

// Warn before losing a half-typed note on refresh/close.
window.addEventListener('beforeunload', (event) => {
  if (titleInput.value.trim() || bodyInput.value.trim()) {
    event.preventDefault();
    event.returnValue = '';
  }
});

loadNotes();
