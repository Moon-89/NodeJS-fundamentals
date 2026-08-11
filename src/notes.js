// All the file reading/writing happens here.
// I kept it separate from server.js so the server file only deals with HTTP.

const fs = require('fs').promises;
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'notes.json');

// Read the notes file and parse it.
// If the file doesn't exist yet, that's not really an error - it just
// means we have no notes yet, so return an empty array.
//
// A file that exists but holds broken JSON (half-written, hand-edited) would
// otherwise crash every single request, so treat it the same as "no notes"
// and warn instead of throwing.
async function readNotes() {
  let data;

  try {
    data = await fs.readFile(FILE, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }

  if (data.trim() === '') {
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(data);
  } catch {
    console.warn(`${FILE} is not valid JSON — starting from an empty list.`);
    return [];
  }

  // The file is meant to hold an array. If it holds an object or a string,
  // .find/.filter below would blow up in a confusing way.
  if (!Array.isArray(parsed)) {
    console.warn(`${FILE} does not contain an array — starting from an empty list.`);
    return [];
  }

  return parsed;
}

// Write to a temp file first, then rename over the real one. rename is atomic,
// so a crash mid-write can't leave notes.json truncated.
async function writeNotes(notes) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });

  const temp = `${FILE}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(notes, null, 2));

  try {
    await fs.rename(temp, FILE);
  } catch (err) {
    // clean up the temp file so a failed write doesn't leave litter behind
    await fs.unlink(temp).catch(() => {});
    throw err;
  }
}

// add/update/remove are all read-then-write. Two requests arriving together
// would both read the same list and the second write would clobber the first
// (and could hand out a duplicate id). Chaining them through one promise makes
// each read-modify-write run to completion before the next one starts.
let chain = Promise.resolve();

function withLock(task) {
  // The second argument means a failed task doesn't jam the queue.
  const result = chain.then(task, task);
  chain = result.then(
    () => {},
    () => {}
  );
  return result;
}

async function getAll() {
  return readNotes();
}

async function getOne(id) {
  const notes = await readNotes();
  return notes.find((note) => String(note.id) === String(id));
}

// title/body are expected to be already validated and trimmed by the caller
// (see src/validate.js).
async function add(title, body) {
  return withLock(async () => {
    const notes = await readNotes();

    const note = {
      id: nextId(notes),
      title: title,
      body: body || '',
      createdAt: new Date().toISOString(),
    };

    notes.push(note);
    await writeNotes(notes);
    return note;
  });
}

// Date.now() alone can collide when two notes are added in the same
// millisecond, which would make two notes share an id and break delete.
// Bumping past the highest existing id guarantees uniqueness.
function nextId(notes) {
  let id = Date.now();

  for (const note of notes) {
    const existing = Number(note.id);
    if (Number.isFinite(existing) && existing >= id) {
      id = existing + 1;
    }
  }

  return String(id);
}

async function update(id, title, body) {
  return withLock(async () => {
    const notes = await readNotes();
    const note = notes.find((n) => String(n.id) === String(id));

    if (!note) {
      return null;
    }

    if (title !== undefined) note.title = title;
    if (body !== undefined) note.body = body;
    note.updatedAt = new Date().toISOString();

    await writeNotes(notes);
    return note;
  });
}

// Returns true if something was actually deleted, false if the id was not found.
async function remove(id) {
  return withLock(async () => {
    const notes = await readNotes();
    const left = notes.filter((note) => String(note.id) !== String(id));

    if (left.length === notes.length) {
      return false;
    }

    await writeNotes(left);
    return true;
  });
}

module.exports = { getAll, getOne, add, update, remove };
