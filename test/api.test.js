'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');

const { startServer } = require('./helpers');

test('notes API', async (t) => {
  const server = await startServer();
  t.after(() => server.close());

  await t.test('GET /api/health reports ok', async () => {
    const { status, json } = await server.request('/api/health');
    assert.equal(status, 200);
    assert.equal(json.status, 'ok');
    assert.equal(json.node, process.version);
  });

  await t.test('starts with an empty list when no data file exists', async () => {
    const { status, json } = await server.request('/api/notes');
    assert.equal(status, 200);
    assert.deepEqual(json, { count: 0, notes: [] });
  });

  let created;

  await t.test('POST /api/notes creates a note and writes it to disk', async () => {
    const { status, json, headers } = await server.request('/api/notes', {
      method: 'POST',
      body: { title: '  Streams beat readFile  ', body: 'Flat memory use.', tags: ['FS', ' fs ', 'streams'] },
    });

    assert.equal(status, 201);
    assert.equal(headers.get('location'), `/api/notes/${json.id}`);
    assert.equal(json.title, 'Streams beat readFile', 'title is trimmed');
    assert.deepEqual(json.tags, ['fs', 'streams'], 'tags are lowercased and de-duplicated');
    assert.match(json.id, /^[0-9a-f-]{36}$/);
    assert.equal(json.createdAt, json.updatedAt);

    const onDisk = JSON.parse(await fs.readFile(server.dataFile, 'utf8'));
    assert.equal(onDisk.length, 1);
    assert.equal(onDisk[0].id, json.id);

    created = json;
  });

  await t.test('GET /api/notes/:id returns the note', async () => {
    const { status, json } = await server.request(`/api/notes/${created.id}`);
    assert.equal(status, 200);
    assert.deepEqual(json, created);
  });

  await t.test('GET /api/notes/:id 404s for an unknown id', async () => {
    const { status, json } = await server.request('/api/notes/does-not-exist');
    assert.equal(status, 404);
    assert.equal(json.error.status, 404);
  });

  await t.test('PATCH updates only the given fields and bumps updatedAt', async () => {
    const { status, json } = await server.request(`/api/notes/${created.id}`, {
      method: 'PATCH',
      body: { body: 'Updated body.' },
    });
    assert.equal(status, 200);
    assert.equal(json.body, 'Updated body.');
    assert.equal(json.title, created.title, 'title untouched');
    assert.equal(json.createdAt, created.createdAt);
    assert.ok(json.updatedAt >= created.updatedAt);
  });

  await t.test('POST rejects a missing title with 422 and details', async () => {
    const { status, json } = await server.request('/api/notes', {
      method: 'POST',
      body: { body: 'no title' },
    });
    assert.equal(status, 422);
    assert.equal(json.error.message, 'Validation failed');
    assert.ok(json.error.details.some((d) => d.includes('title')));
  });

  await t.test('POST rejects malformed JSON with 400', async () => {
    const { status, json } = await server.request('/api/notes', {
      method: 'POST',
      body: '{ nope',
    });
    assert.equal(status, 400);
    assert.match(json.error.message, /not valid JSON/);
  });

  await t.test('POST rejects a body over the size cap with 413', async () => {
    const { status } = await server.request('/api/notes', {
      method: 'POST',
      body: { title: 'big', body: 'x'.repeat(70 * 1024) },
    });
    assert.equal(status, 413);
  });

  await t.test('search and tag filters work', async () => {
    await server.request('/api/notes', {
      method: 'POST',
      body: { title: 'Event loop phases', body: 'timers, poll, check', tags: ['event-loop'] },
    });

    const byQuery = await server.request('/api/notes?q=phases');
    assert.equal(byQuery.json.count, 1);
    assert.equal(byQuery.json.notes[0].title, 'Event loop phases');

    const byTag = await server.request('/api/notes?tag=fs');
    assert.equal(byTag.json.count, 1);
    assert.equal(byTag.json.notes[0].id, created.id);

    const noMatch = await server.request('/api/notes?q=zzzz');
    assert.equal(noMatch.json.count, 0);
  });

  await t.test('GET /api/stats counts notes and tags', async () => {
    const { json } = await server.request('/api/stats');
    assert.equal(json.count, 2);
    assert.ok(json.tags.some((t2) => t2.name === 'fs' && t2.count === 1));
  });

  await t.test('DELETE removes the note, second delete 404s', async () => {
    const first = await server.request(`/api/notes/${created.id}`, { method: 'DELETE' });
    assert.equal(first.status, 200);
    assert.deepEqual(first.json, { id: created.id, deleted: true });

    const second = await server.request(`/api/notes/${created.id}`, { method: 'DELETE' });
    assert.equal(second.status, 404);
  });

  await t.test('wrong method on a known path returns 405 with Allow', async () => {
    const { status, headers, json } = await server.request('/api/health', { method: 'DELETE' });
    assert.equal(status, 405);
    assert.equal(headers.get('allow'), 'GET, HEAD');
    assert.deepEqual(json.error.details.allowed, ['GET', 'HEAD']);
  });

  await t.test('HEAD sends headers without a body', async () => {
    const { status, text, headers } = await server.request('/api/health', { method: 'HEAD' });
    assert.equal(status, 200);
    assert.equal(text, '');
    assert.ok(Number(headers.get('content-length')) > 0);
  });

  await t.test('unknown API path returns a JSON 404', async () => {
    const { status, json } = await server.request('/api/nope');
    assert.equal(status, 404);
    assert.equal(json.error.status, 404);
  });
});
