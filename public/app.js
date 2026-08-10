// Frontend logic with robust edge-case handling and offline/demo fallback.

const form = document.getElementById('note-form');
const titleInput = document.getElementById('title');
const bodyInput = document.getElementById('body');
const notesDiv = document.getElementById('notes');
const message = document.getElementById('message');

let demoMode = false;
const DEMO_KEY = 'demo-notes-v1';

function showMessage(text, isError = true) {
  message.textContent = text;
  message.style.color = isError ? 'crimson' : 'green';
}

function clearMessage() {
  message.textContent = '';
}

function saveDemoNotes(notes) {
  localStorage.setItem(DEMO_KEY, JSON.stringify(notes));
}

function loadDemoNotes() {
  try {
    return JSON.parse(localStorage.getItem(DEMO_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

async function tryFetch(path, options) {
  try {
    const res = await fetch(path, options);
    if (!res.ok) throw new Error('Network response was not OK');
    return await res.json();
  } catch (err) {
    throw err;
  }
}

function renderNotes(notes) {
  if (!notes || notes.length === 0) {
    notesDiv.innerHTML = '<p class="empty">No notes yet. Add one above.</p>';
    return;
  }

  // newest first
  notes = notes.slice().reverse();
  notesDiv.innerHTML = '';

  for (const note of notes) {
    const div = document.createElement('div');
    div.className = 'note';

    const button = document.createElement('button');
    button.className = 'delete';
    button.textContent = 'delete';
    button.onclick = () => confirmDelete(note.id);

    const h3 = document.createElement('h3');
    h3.textContent = note.title;

    const p = document.createElement('p');
    p.textContent = note.body;

    const date = document.createElement('div');
    date.className = 'date';
    date.textContent = new Date(note.createdAt).toLocaleString();

    div.appendChild(button);
    div.appendChild(h3);
    div.appendChild(p);
    div.appendChild(date);
    notesDiv.appendChild(div);
  }
}

async function loadNotes() {
  clearMessage();
  // Try network first
  try {
    const notes = await tryFetch('/api/notes');
    demoMode = false;
    renderNotes(notes);
    return;
  } catch (err) {
    // fallback to demo mode
    demoMode = true;
    showMessage('Backend not reachable — running in demo mode (data stored in your browser).', false);
    const notes = loadDemoNotes();
    renderNotes(notes);
  }
}

function nextId(notes) {
  return notes.length === 0 ? 1 : Math.max(...notes.map(n => n.id)) + 1;
}

async function confirmDelete(id) {
  if (!confirm('Delete this note? This cannot be undone.')) return;
  clearMessage();
  if (demoMode) {
    const notes = loadDemoNotes().filter(n => n.id !== id);
    saveDemoNotes(notes);
    renderNotes(notes);
    return;
  }

  try {
    await fetch('/api/notes/' + id, { method: 'DELETE' });
    loadNotes();
  } catch (err) {
    showMessage('Failed to delete note. Try again or use demo mode.');
  }
}

form.onsubmit = async (event) => {
  event.preventDefault();
  clearMessage();

  const title = titleInput.value && titleInput.value.trim();
  const body = bodyInput.value && bodyInput.value.trim();

  if (!title) {
    showMessage('Please enter a title for the note.');
    return;
  }

  const newNote = {
    title,
    body,
    createdAt: new Date().toISOString(),
  };

  if (demoMode) {
    const notes = loadDemoNotes();
    newNote.id = nextId(notes);
    notes.push(newNote);
    saveDemoNotes(notes);
    titleInput.value = '';
    bodyInput.value = '';
    renderNotes(notes);
    return;
  }

  try {
    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newNote.title, body: newNote.body }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showMessage(err.error || 'Failed to save note.');
      return;
    }

    titleInput.value = '';
    bodyInput.value = '';
    loadNotes();
  } catch (err) {
    // if network fails mid-request, switch to demo fallback
    demoMode = true;
    showMessage('Network error while saving — switched to demo mode.', false);
    const notes = loadDemoNotes();
    newNote.id = nextId(notes);
    notes.push(newNote);
    saveDemoNotes(notes);
    renderNotes(notes);
  }
};

loadNotes();
