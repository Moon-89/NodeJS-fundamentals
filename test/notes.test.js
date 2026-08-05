// Tests for the API. Run with: npm test
//
// Requiring server.js starts the server (it calls listen at the bottom),
// so I just make real requests against localhost and close it at the end.

const test = require('node:test');
const assert = require('node:assert');

const server = require('../src/server');

const URL = 'http://localhost:3000';

// keep track of what we create so we can clean up after
let createdId;

test('GET /api/notes returns an array', async () => {
  const res = await fetch(`${URL}/api/notes`);
  const notes = await res.json();

  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(notes));
});

test('POST /api/notes creates a note', async () => {
  const res = await fetch(`${URL}/api/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Test note', body: 'from the test file' }),
  });

  const note = await res.json();
  createdId = note.id;

  assert.strictEqual(res.status, 201);
  assert.strictEqual(note.title, 'Test note');
  assert.ok(note.id);
});

test('POST without a title gives 400', async () => {
  const res = await fetch(`${URL}/api/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: 'no title here' }),
  });

  assert.strictEqual(res.status, 400);
});

test('GET /api/notes/:id returns the note we made', async () => {
  const res = await fetch(`${URL}/api/notes/${createdId}`);
  const note = await res.json();

  assert.strictEqual(res.status, 200);
  assert.strictEqual(note.title, 'Test note');
});

test('GET with a bad id gives 404', async () => {
  const res = await fetch(`${URL}/api/notes/does-not-exist`);
  assert.strictEqual(res.status, 404);
});

test('DELETE removes the note', async () => {
  const res = await fetch(`${URL}/api/notes/${createdId}`, { method: 'DELETE' });
  assert.strictEqual(res.status, 200);

  // it should be gone now
  const check = await fetch(`${URL}/api/notes/${createdId}`);
  assert.strictEqual(check.status, 404);
});

test('the home page is served from public/', async () => {
  const res = await fetch(`${URL}/`);
  const html = await res.text();

  assert.strictEqual(res.status, 200);
  assert.ok(html.includes('My Notes'));

  // done with the server now
  server.close();
});
