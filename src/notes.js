// All the file reading/writing happens here.
// I kept it separate from server.js so the server file only deals with HTTP.

const fs = require('fs').promises;
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'notes.json');

// Read the notes file and parse it.
// If the file doesn't exist yet, that's not really an error - it just
// means we have no notes yet, so return an empty array.
async function readNotes() {
  try {
    const data = await fs.readFile(FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

async function writeNotes(notes) {
  // make sure the data folder exists before writing
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(notes, null, 2));
}

async function getAll() {
  return readNotes();
}

async function getOne(id) {
  const notes = await readNotes();
  return notes.find((note) => note.id === id);
}

async function add(title, body) {
  const notes = await readNotes();

  const note = {
    id: Date.now().toString(),
    title: title,
    body: body || '',
    createdAt: new Date().toISOString(),
  };

  notes.push(note);
  await writeNotes(notes);
  return note;
}

async function update(id, title, body) {
  const notes = await readNotes();
  const note = notes.find((n) => n.id === id);

  if (!note) {
    return null;
  }

  if (title !== undefined) note.title = title;
  if (body !== undefined) note.body = body;

  await writeNotes(notes);
  return note;
}

// Returns true if something was actually deleted, false if the id was not found.
async function remove(id) {
  const notes = await readNotes();
  const left = notes.filter((note) => note.id !== id);

  if (left.length === notes.length) {
    return false;
  }

  await writeNotes(left);
  return true;
}

module.exports = { getAll, getOne, add, update, remove };
