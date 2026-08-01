'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const Router = require('../src/router');

test('Router', async (t) => {
  const noop = () => {};
  const router = new Router()
    .get('/api/notes', noop)
    .post('/api/notes', noop)
    .get('/api/notes/:id', noop)
    .delete('/api/notes/:id', noop);

  await t.test('matches a static path and method', () => {
    assert.ok(router.match('GET', '/api/notes').handler);
  });

  await t.test('captures named params', () => {
    assert.deepEqual(router.match('GET', '/api/notes/abc-123').params, { id: 'abc-123' });
  });

  await t.test('tolerates a trailing slash', () => {
    assert.ok(router.match('GET', '/api/notes/').handler);
  });

  await t.test('a param does not swallow extra segments', () => {
    assert.equal(router.match('GET', '/api/notes/abc/extra'), null);
  });

  await t.test('reports the allowed methods when only the method is wrong', () => {
    assert.deepEqual(router.match('PUT', '/api/notes').allowed, ['GET', 'HEAD', 'POST']);
  });

  await t.test('HEAD is served by the GET handler', () => {
    assert.ok(router.match('HEAD', '/api/notes').handler);
  });

  await t.test('returns null for an unknown path', () => {
    assert.equal(router.match('GET', '/nothing/here'), null);
  });
});
