'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { httpError } = require('./http-error');

const MAX_TITLE = 120;
const MAX_BODY = 5000;
const MAX_TAGS = 10;

/**
 * Notes persisted to a JSON file with the fs module.
 *
 * Two details that matter more than the CRUD itself:
 *
 * 1. Writes go to a temp file and then get renamed over the real one.
 *    `rename` is atomic on the same filesystem, so a crash mid-write leaves
 *    the previous good file intact instead of a half-written one.
 *
 * 2. Every mutation is queued onto a promise chain. Node runs one line of JS
 *    at a time, but `await` yields -- two overlapping requests could both read
 *    the file, both mutate their own copy, and the second write would silently
 *    discard the first. The queue makes read-modify-write indivisible.
 */
class NoteStore {
  #file;
  #tempFile;
  #queue = Promise.resolve();

  constructor(file) {
    this.#file = path.resolve(file);
    this.#tempFile = `${this.#file}.tmp`;
  }

  get file() {
    return this.#file;
  }

  async #readAll() {
    let raw;
    try {
      raw = await fs.readFile(this.#file, 'utf8');
    } catch (err) {
      // No file yet just means no notes yet -- not an error.
      if (err.code === 'ENOENT') return [];
      throw err;
    }
    if (raw.trim() === '') return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      throw httpError(500, `Data file ${path.basename(this.#file)} contains invalid JSON`);
    }
  }

  async #writeAll(notes) {
    await fs.mkdir(path.dirname(this.#file), { recursive: true });
    await fs.writeFile(this.#tempFile, JSON.stringify(notes, null, 2) + '\n', 'utf8');
    await renameWithRetry(this.#tempFile, this.#file);
  }

  /** Serialize a read-modify-write cycle onto the queue. */
  #mutate(fn) {
    const run = this.#queue.then(async () => {
      const notes = await this.#readAll();
      const { next, result } = await fn(notes);
      if (next) await this.#writeAll(next);
      return result;
    });
    // Swallow the rejection on the *chain* only, so one failed write does not
    // poison every later one. The caller still sees the original rejection.
    this.#queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async list({ q = '', tag = '' } = {}) {
    const notes = await this.#readAll();
    const needle = q.trim().toLowerCase();
    const wantedTag = tag.trim().toLowerCase();

    return notes
      .filter((note) => {
        const matchesQuery =
          !needle ||
          note.title.toLowerCase().includes(needle) ||
          note.body.toLowerCase().includes(needle);
        const matchesTag = !wantedTag || note.tags.includes(wantedTag);
        return matchesQuery && matchesTag;
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id) {
    const notes = await this.#readAll();
    const note = notes.find((n) => n.id === id);
    if (!note) throw httpError(404, `No note with id ${id}`);
    return note;
  }

  // `async` matters here: validate() throws synchronously, and without it the
  // caller would get a thrown error from some calls and a rejected promise
  // from others. One shape for every failure is easier to handle.
  async create(input) {
    const fields = validate(input, { partial: false });
    return this.#mutate((notes) => {
      const now = new Date().toISOString();
      const note = { id: crypto.randomUUID(), ...fields, createdAt: now, updatedAt: now };
      return { next: [...notes, note], result: note };
    });
  }

  async update(id, input) {
    const fields = validate(input, { partial: true });
    return this.#mutate((notes) => {
      const index = notes.findIndex((n) => n.id === id);
      if (index === -1) throw httpError(404, `No note with id ${id}`);
      const updated = { ...notes[index], ...fields, updatedAt: new Date().toISOString() };
      const next = [...notes];
      next[index] = updated;
      return { next, result: updated };
    });
  }

  async remove(id) {
    return this.#mutate((notes) => {
      const next = notes.filter((n) => n.id !== id);
      if (next.length === notes.length) throw httpError(404, `No note with id ${id}`);
      return { next, result: { id, deleted: true } };
    });
  }

  async stats() {
    const notes = await this.#readAll();
    const tags = new Map();
    for (const note of notes) {
      for (const tag of note.tags) tags.set(tag, (tags.get(tag) ?? 0) + 1);
    }
    return {
      count: notes.length,
      tags: [...tags.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    };
  }
}

/** Transient failures Windows reports when something else holds the handle. */
const TRANSIENT_RENAME_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);
const RENAME_ATTEMPTS = 6;

/**
 * Replace `to` with `from`, retrying briefly on Windows.
 *
 * On POSIX, rename(2) over an existing path is atomic and does not fail.
 * On Windows it can return EPERM if any process has the destination open --
 * an antivirus scanner or the search indexer opening the file we just wrote is
 * enough, and it shows up intermittently under a burst of writes. The
 * condition clears in milliseconds, so back off and try again.
 */
async function renameWithRetry(from, to) {
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(from, to);
      return;
    } catch (err) {
      if (!TRANSIENT_RENAME_CODES.has(err.code) || attempt >= RENAME_ATTEMPTS - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, 5 * 2 ** attempt));
    }
  }
}

function validate(input, { partial }) {
  const errors = [];
  const out = {};

  if (!partial || 'title' in input) {
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    if (!title) errors.push('title is required and must be a non-empty string');
    else if (title.length > MAX_TITLE) errors.push(`title must be ${MAX_TITLE} characters or fewer`);
    else out.title = title;
  }

  if (!partial || 'body' in input) {
    const body = input.body ?? '';
    if (typeof body !== 'string') errors.push('body must be a string');
    else if (body.length > MAX_BODY) errors.push(`body must be ${MAX_BODY} characters or fewer`);
    else out.body = body;
  }

  if (!partial || 'tags' in input) {
    const tags = input.tags ?? [];
    if (!Array.isArray(tags) || tags.some((t) => typeof t !== 'string')) {
      errors.push('tags must be an array of strings');
    } else {
      out.tags = [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, MAX_TAGS);
    }
  }

  if (partial && Object.keys(out).length === 0 && errors.length === 0) {
    errors.push('provide at least one of: title, body, tags');
  }

  if (errors.length) throw httpError(422, 'Validation failed', errors);
  return out;
}

module.exports = NoteStore;
