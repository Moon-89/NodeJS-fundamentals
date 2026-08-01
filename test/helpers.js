'use strict';

const http = require('node:http');
const os = require('node:os');
const fs = require('node:fs/promises');
const path = require('node:path');

const createApp = require('../src/app');
const Logger = require('../src/lib/logger');

/**
 * Boot the app on an ephemeral port (port 0 = "OS, pick a free one") backed by
 * a throwaway data file, so tests never touch data/notes.json.
 */
async function startServer() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'notes-test-'));
  const dataFile = path.join(dir, 'notes.json');
  const logger = new Logger({ silent: true });

  const server = http.createServer(createApp({ dataFile, logger }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  return {
    base,
    dataFile,

    /** fetch() wrapper that also parses the JSON body when there is one. */
    async request(pathname, { method = 'GET', body, headers } = {}) {
      const res = await fetch(base + pathname, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: typeof body === 'string' || body === undefined ? body : JSON.stringify(body),
      });
      const text = await res.text();
      let json;
      try {
        json = text ? JSON.parse(text) : undefined;
      } catch {
        json = undefined;
      }
      return { status: res.status, headers: res.headers, text, json };
    },

    /** Raw request, so a test can send a path fetch() would normalise away. */
    rawRequest(rawPath, method = 'GET') {
      return new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port, path: rawPath, method }, (res) => {
          let text = '';
          res.setEncoding('utf8');
          res.on('data', (c) => (text += c));
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
        });
        req.on('error', reject);
        req.end();
      });
    },

    async close() {
      await new Promise((resolve) => server.close(resolve));
      await logger.close();
      await fs.rm(dir, { recursive: true, force: true, maxRetries: 5 });
    },
  };
}

module.exports = { startServer };
