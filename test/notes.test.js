// Tests for the API. Run with: npm test
//
// Requiring server.js starts the server (it calls listen at the bottom),
// so I just make real requests against it and close it at the end.
//
// PORT is set before the require so these tests don't collide with a dev
// server someone left running on 3000.

process.env.PORT = process.env.TEST_PORT || '3100';

const test = require('node:test');
const assert = require('node:assert');

const server = require('../src/server');
const { TITLE_MAX, BODY_MAX, MAX_BODY_BYTES } = require('../src/validate');

const URL = `http://localhost:${process.env.PORT}`;

function post(body, options = {}) {
  return fetch(`${URL}/api/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

// keep track of what we create so we can clean up after
let createdId;

// --- the happy path ---

test('GET /api/notes returns an array', async () => {
  const res = await fetch(`${URL}/api/notes`);
  const notes = await res.json();

  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(notes));
});

test('POST /api/notes creates a note', async () => {
  const res = await post({ title: 'Test note', body: 'from the test file' });
  const note = await res.json();
  createdId = note.id;

  assert.strictEqual(res.status, 201);
  assert.strictEqual(note.title, 'Test note');
  assert.ok(note.id);
  assert.ok(note.createdAt);
});

test('GET /api/notes/:id returns the note we made', async () => {
  const res = await fetch(`${URL}/api/notes/${createdId}`);
  const note = await res.json();

  assert.strictEqual(res.status, 200);
  assert.strictEqual(note.title, 'Test note');
});

test('PUT updates only the fields that were sent', async () => {
  const res = await fetch(`${URL}/api/notes/${createdId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: 'updated body' }),
  });

  const note = await res.json();

  assert.strictEqual(res.status, 200);
  assert.strictEqual(note.body, 'updated body');
  assert.strictEqual(note.title, 'Test note', 'title should be left alone');
  assert.ok(note.updatedAt);
});

// --- input validation ---

test('POST without a title gives 400 and says why', async () => {
  const res = await post({ body: 'no title here' });
  const data = await res.json();

  assert.strictEqual(res.status, 400);
  assert.ok(data.error);
  assert.ok(Array.isArray(data.details) && data.details.length > 0);
});

test('POST with a whitespace-only title gives 400', async () => {
  const res = await post({ title: '    ' });
  assert.strictEqual(res.status, 400);
});

test('POST with a non-string title gives 400', async () => {
  const res = await post({ title: 12345 });
  assert.strictEqual(res.status, 400);
});

test('POST with an over-long title gives 400', async () => {
  const res = await post({ title: 'a'.repeat(TITLE_MAX + 1) });
  assert.strictEqual(res.status, 400);
});

test('POST with an over-long body gives 400', async () => {
  const res = await post({ title: 'ok', body: 'a'.repeat(BODY_MAX + 1) });
  assert.strictEqual(res.status, 400);
});

test('POST with broken JSON gives 400, not a crash', async () => {
  const res = await post('{ this is not json');
  const data = await res.json();

  assert.strictEqual(res.status, 400);
  assert.match(JSON.stringify(data.details), /valid JSON/);
});

test('POST with an empty body gives 400', async () => {
  const res = await post('');
  assert.strictEqual(res.status, 400);
});

test('POST with a JSON array instead of an object gives 400', async () => {
  const res = await post([{ title: 'nope' }]);
  assert.strictEqual(res.status, 400);
});

test('POST with the wrong Content-Type gives 415', async () => {
  const res = await post('title=hello', { headers: { 'Content-Type': 'text/plain' } });
  assert.strictEqual(res.status, 415);
});

test('an oversized body gives 413 instead of buffering it all', async () => {
  const res = await post({ title: 'big', body: 'a'.repeat(MAX_BODY_BYTES + 1000) });
  assert.strictEqual(res.status, 413);
});

test('titles and bodies are trimmed before saving', async () => {
  const res = await post({ title: '  spaced out  ', body: '  padded  ' });
  const note = await res.json();

  assert.strictEqual(note.title, 'spaced out');
  assert.strictEqual(note.body, 'padded');

  await fetch(`${URL}/api/notes/${note.id}`, { method: 'DELETE' });
});

test('PUT with no fields at all gives 400', async () => {
  const res = await fetch(`${URL}/api/notes/${createdId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  assert.strictEqual(res.status, 400);
});

test('PUT with an empty title gives 400', async () => {
  const res = await fetch(`${URL}/api/notes/${createdId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '   ' }),
  });

  assert.strictEqual(res.status, 400);
});

// --- routing edge cases ---

test('GET with a well-formed but unknown id gives 404', async () => {
  const res = await fetch(`${URL}/api/notes/999999999999999`);
  assert.strictEqual(res.status, 404);
});

test('GET with a malformed id gives 404', async () => {
  const res = await fetch(`${URL}/api/notes/does-not-exist`);
  assert.strictEqual(res.status, 404);
});

test('an extra path segment gives 404', async () => {
  const res = await fetch(`${URL}/api/notes/${createdId}/extra`);
  assert.strictEqual(res.status, 404);
});

test('a trailing slash hits the same route', async () => {
  const res = await fetch(`${URL}/api/notes/`);
  const notes = await res.json();

  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(notes));
});

test('an unsupported method on /api/notes gives 405 with an Allow header', async () => {
  const res = await fetch(`${URL}/api/notes`, { method: 'PATCH' });

  assert.strictEqual(res.status, 405);
  assert.strictEqual(res.headers.get('allow'), 'GET, POST');
});

test('an unsupported method on /api/notes/:id gives 405 with an Allow header', async () => {
  const res = await fetch(`${URL}/api/notes/${createdId}`, { method: 'PATCH' });

  assert.strictEqual(res.status, 405);
  assert.strictEqual(res.headers.get('allow'), 'GET, PUT, DELETE');
});

test('an unknown /api route answers with JSON, not an HTML page', async () => {
  const res = await fetch(`${URL}/api/nope`);

  assert.strictEqual(res.status, 404);
  assert.match(res.headers.get('content-type'), /application\/json/);
});

test('a path traversal attempt does not escape public/', async () => {
  const res = await fetch(`${URL}/../package.json`, { redirect: 'manual' });

  assert.ok(res.status === 403 || res.status === 404, `got ${res.status}`);

  const text = await res.text();
  assert.ok(!text.includes('"notes-server"'), 'package.json must not be served');
});

test('a missing static file gives 404', async () => {
  const res = await fetch(`${URL}/not-a-real-file.css`);
  assert.strictEqual(res.status, 404);
});

// --- delete ---

test('DELETE removes the note', async () => {
  const res = await fetch(`${URL}/api/notes/${createdId}`, { method: 'DELETE' });
  assert.strictEqual(res.status, 200);

  // it should be gone now
  const check = await fetch(`${URL}/api/notes/${createdId}`);
  assert.strictEqual(check.status, 404);
});

test('deleting the same note twice gives 404 the second time', async () => {
  const res = await fetch(`${URL}/api/notes/${createdId}`, { method: 'DELETE' });
  assert.strictEqual(res.status, 404);
});

// --- ids ---

test('notes created in the same millisecond still get unique ids', async () => {
  const responses = await Promise.all([
    post({ title: 'race 1' }),
    post({ title: 'race 2' }),
    post({ title: 'race 3' }),
  ]);

  const notes = await Promise.all(responses.map((r) => r.json()));
  const ids = new Set(notes.map((n) => n.id));

  assert.strictEqual(ids.size, 3, 'each note should have its own id');

  for (const note of notes) {
    await fetch(`${URL}/api/notes/${note.id}`, { method: 'DELETE' });
  }
});

// --- static files ---

test('the home page is served from public/', async () => {
  const res = await fetch(`${URL}/`);
  const html = await res.text();

  assert.strictEqual(res.status, 200);
  assert.ok(html.includes('My Notes'));

  // done with the server now
  server.close();
});
