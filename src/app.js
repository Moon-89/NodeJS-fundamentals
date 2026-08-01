'use strict';

const path = require('node:path');

const Router = require('./router');
const NoteStore = require('./lib/note-store');
const { serveStatic } = require('./lib/static');
const { sendJson, sendError, readJsonBody } = require('./lib/respond');
const { HttpError, httpError } = require('./lib/http-error');

const ROOT = path.join(__dirname, '..');

/**
 * Build the request handler. Kept separate from server.js so tests can mount
 * it on an ephemeral port without touching the real data file or log file.
 *
 * @param {object} deps
 * @param {string} deps.dataFile   JSON file backing the notes
 * @param {string} [deps.publicDir]
 * @param {import('./lib/logger')} deps.logger
 */
function createApp({ dataFile, publicDir = path.join(ROOT, 'public'), logger }) {
  const store = new NoteStore(dataFile);
  const router = new Router();
  const startedAt = Date.now();

  router.get('/api/health', async (req, res) => {
    sendJson(res, 200, {
      status: 'ok',
      uptimeSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
      node: process.version,
      pid: process.pid,
    });
  });

  router.get('/api/stats', async (req, res) => {
    sendJson(res, 200, await store.stats());
  });

  router.get('/api/notes', async (req, res, { query }) => {
    const notes = await store.list({ q: query.get('q') ?? '', tag: query.get('tag') ?? '' });
    sendJson(res, 200, { count: notes.length, notes });
  });

  router.post('/api/notes', async (req, res) => {
    const note = await store.create(await readJsonBody(req));
    sendJson(res, 201, note, { Location: `/api/notes/${note.id}` });
  });

  router.get('/api/notes/:id', async (req, res, { params }) => {
    sendJson(res, 200, await store.get(params.id));
  });

  router.put('/api/notes/:id', async (req, res, { params }) => {
    sendJson(res, 200, await store.update(params.id, await readJsonBody(req)));
  });

  router.patch('/api/notes/:id', async (req, res, { params }) => {
    sendJson(res, 200, await store.update(params.id, await readJsonBody(req)));
  });

  router.delete('/api/notes/:id', async (req, res, { params }) => {
    sendJson(res, 200, await store.remove(params.id));
  });

  return async function handleRequest(req, res) {
    const startedNs = process.hrtime.bigint();

    // 'finish' fires once the last byte of the response is handed to the OS.
    // Logging from here means every path -- success, 404, crash -- gets logged
    // exactly once, without each handler having to remember to do it.
    res.once('finish', () => {
      logger.emit('request', {
        method: req.method,
        url: req.url,
        status: res.statusCode,
        durationMs: Number(process.hrtime.bigint() - startedNs) / 1e6,
      });
    });

    try {
      const url = parseUrl(req);
      const match = router.match(req.method, url.pathname);

      if (match?.handler) {
        await match.handler(req, res, { params: match.params, query: url.searchParams });
        return;
      }

      if (match?.allowed) {
        throw httpError(405, `${req.method} is not allowed on ${url.pathname}`, {
          allowed: match.allowed,
        });
      }

      // Not an API route: try the public directory before giving up.
      if (req.method === 'GET' || req.method === 'HEAD') {
        if (await serveStatic(req, res, publicDir, url.pathname)) return;
      }

      throw httpError(404, `Cannot ${req.method} ${url.pathname}`);
    } catch (err) {
      if (!(err instanceof HttpError)) logger.emit('error', err);
      if (res.headersSent) {
        res.destroy();
        return;
      }
      const extra = err.details?.allowed ? { Allow: err.details.allowed.join(', ') } : undefined;
      if (extra) res.setHeader('Allow', extra.Allow);
      sendError(res, err);
    }
  };
}

/** Parse the request target. req.url is only ever a path + query, never absolute. */
function parseUrl(req) {
  try {
    return new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  } catch {
    throw httpError(400, 'Malformed request URL');
  }
}

module.exports = createApp;
