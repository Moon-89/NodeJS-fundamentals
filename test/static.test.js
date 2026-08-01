'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { startServer } = require('./helpers');

test('static file serving', async (t) => {
  const server = await startServer();
  t.after(() => server.close());

  await t.test('GET / streams public/index.html', async () => {
    const { status, text, headers } = await server.request('/');
    assert.equal(status, 200);
    assert.equal(headers.get('content-type'), 'text/html; charset=utf-8');
    assert.match(text, /<title>Notes/);
  });

  await t.test('serves css with the right content type', async () => {
    const { status, headers } = await server.request('/styles.css');
    assert.equal(status, 200);
    assert.equal(headers.get('content-type'), 'text/css; charset=utf-8');
  });

  await t.test('Content-Length matches the bytes actually sent', async () => {
    const { text, headers } = await server.request('/app.js');
    assert.equal(Number(headers.get('content-length')), Buffer.byteLength(text));
  });

  await t.test('missing file falls through to a JSON 404', async () => {
    const { status, json } = await server.request('/nope.html');
    assert.equal(status, 404);
    assert.equal(json.error.status, 404);
  });

  await t.test('directory traversal is refused', async () => {
    // Both a literal and a percent-encoded escape attempt.
    for (const attempt of ['/../package.json', '/..%2f..%2fpackage.json', '/%2e%2e/package.json']) {
      const { status, text } = await server.rawRequest(attempt);
      assert.equal(status, 404, `${attempt} should not be served`);
      assert.ok(!text.includes('"name"'), `${attempt} leaked package.json`);
    }
  });

  await t.test('HEAD on a static file returns headers only', async () => {
    const { status, text, headers } = await server.request('/styles.css', { method: 'HEAD' });
    assert.equal(status, 200);
    assert.equal(text, '');
    assert.ok(Number(headers.get('content-length')) > 0);
  });
});
