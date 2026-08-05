// Talks to the API in src/server.js

const form = document.getElementById('note-form');
const titleInput = document.getElementById('title');
const bodyInput = document.getElementById('body');
const notesDiv = document.getElementById('notes');
const message = document.getElementById('message');

function showError(text) {
  message.textContent = text;
}

async function loadNotes() {
  const res = await fetch('/api/notes');
  const notes = await res.json();

  if (notes.length === 0) {
    notesDiv.innerHTML = '<p class="empty">No notes yet. Add one above.</p>';
    return;
  }

  // newest first
  notes.reverse();

  notesDiv.innerHTML = '';

  for (const note of notes) {
    const div = document.createElement('div');
    div.className = 'note';

    const button = document.createElement('button');
    button.className = 'delete';
    button.textContent = 'delete';
    button.onclick = () => deleteNote(note.id);

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

async function deleteNote(id) {
  await fetch('/api/notes/' + id, { method: 'DELETE' });
  loadNotes();
}

form.onsubmit = async (event) => {
  event.preventDefault();
  showError('');

  const res = await fetch('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: titleInput.value,
      body: bodyInput.value,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    showError(err.error);
    return;
  }

  titleInput.value = '';
  bodyInput.value = '';
  loadNotes();
};

loadNotes();
