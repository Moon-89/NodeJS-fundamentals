// A notes server using only Node's built-in modules - no Express.
// Start it with: npm start

const http = require('http');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

const notes = require('./notes');
const { validateNote, isValidId, parseJsonBody, MAX_BODY_BYTES } = require('./validate');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, '..', 'public');

// Using EventEmitter for logging so the request handler doesn't have to
// worry about how logging works - it just emits an event.
const logger = new EventEmitter();

logger.on('request', (method, url, status) => {
  console.log(`${method} ${url} -> ${status}`);
});

// --- small helpers ---

function sendJson(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

// Every failure goes out in the same shape, so the frontend only needs one
// code path to show the user what went wrong:
//   { error: "short summary", details: ["specific problem", ...] }
function sendError(res, status, error, details) {
  const payload = { error };
  if (details && details.length) payload.details = details;
  sendJson(res, status, payload);
}

function sendMethodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed.join(', '));
  sendError(res, 405, `Method not allowed. Try: ${allowed.join(', ')}`);
}

// The request body arrives in chunks, so collect them and wait for 'end'.
// We stop early if the client sends more than MAX_BODY_BYTES — otherwise a
// single request could buffer unbounded data into memory.
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    let aborted = false;

    req.on('data', (chunk) => {
      if (aborted) return;

      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        aborted = true;
        body = '';

        // Drain the rest without buffering it. Destroying the socket here
        // would be cheaper, but then the client never gets to read our 413.
        req.removeAllListeners('data');
        req.resume();

        const err = new Error('Request body too large');
        err.code = 'BODY_TOO_LARGE';
        reject(err);
        return;
      }

      body += chunk;
    });

    req.on('end', () => {
      if (!aborted) resolve(body);
    });
    req.on('error', (err) => {
      if (!aborted) reject(err);
    });
  });
}

// Reads + parses + validates a JSON body in one go. Returns null when it has
// already answered the request itself, so callers just `return`.
async function readJson(req, res, log) {
  const type = req.headers['content-type'];
  if (type && !type.toLowerCase().includes('application/json')) {
    sendError(res, 415, 'Content-Type must be application/json');
    log(415);
    return null;
  }

  let raw;
  try {
    raw = await readBody(req);
  } catch (err) {
    if (err.code === 'BODY_TOO_LARGE') {
      sendError(res, 413, `Request body must be under ${MAX_BODY_BYTES} bytes`);
      log(413);
      return null;
    }
    throw err;
  }

  const parsed = parseJsonBody(raw);
  if (!parsed.ok) {
    sendError(res, 400, 'Invalid request body', parsed.errors);
    log(400);
    return null;
  }

  return parsed.data;
}

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

// Serve files from public/. Using createReadStream instead of readFile
// because a stream sends the file in chunks instead of loading the whole
// thing into memory first.
function serveFile(url, req, res, done) {
  let decoded;
  try {
    // "%20" style escapes have to be decoded before touching the filesystem,
    // but a malformed escape like "%zz" throws.
    decoded = decodeURIComponent(url);
  } catch {
    sendError(res, 400, 'Malformed URL');
    done(400);
    return;
  }

  // Reject NUL bytes — some filesystems truncate the path at one.
  if (decoded.includes('\0')) {
    sendError(res, 400, 'Malformed URL');
    done(400);
    return;
  }

  const filePath = path.join(PUBLIC, decoded === '/' ? 'index.html' : decoded);

  // Don't let someone ask for ../../secret.txt. The trailing separator matters:
  // without it a sibling folder like "public-backup" would also pass the check.
  if (filePath !== PUBLIC && !filePath.startsWith(PUBLIC + path.sep)) {
    sendError(res, 403, 'Forbidden');
    done(403);
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      sendError(res, 404, `Nothing found at ${url}`);
      done(404);
      return;
    }

    const type = CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'text/plain';
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': stats.size });

    // A HEAD request wants the headers but no body.
    if (req.method === 'HEAD') {
      res.end();
      done(200);
      return;
    }

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    stream.on('error', () => res.end());

    done(200);
  });
}

// --- the server ---

const server = http.createServer(async (req, res) => {
  // req.url includes the query string, and I only want the path part
  const rawUrl = req.url.split('?')[0];
  const method = req.method;

  // Treat "/api/notes/" and "/api/notes" as the same route.
  const url = rawUrl.length > 1 && rawUrl.endsWith('/') ? rawUrl.slice(0, -1) : rawUrl;

  // logging happens here so I don't have to repeat it in every branch
  const log = (status) => logger.emit('request', method, url, status);

  try {
    if (url === '/api/notes') {
      if (method === 'GET') {
        const all = await notes.getAll();
        sendJson(res, 200, all);
        log(200);
        return;
      }

      if (method === 'POST') {
        const data = await readJson(req, res, log);
        if (data === null) return;

        const check = validateNote(data);
        if (!check.ok) {
          sendError(res, 400, 'Could not save the note', check.errors);
          log(400);
          return;
        }

        const note = await notes.add(check.value.title, check.value.body);
        sendJson(res, 201, note);
        log(201);
        return;
      }

      sendMethodNotAllowed(res, ['GET', 'POST']);
      log(405);
      return;
    }

    // /api/notes/:id - grab the id off the end of the url
    if (url.startsWith('/api/notes/')) {
      const segments = url.split('/').slice(3);

      // Reject a malformed id (or an extra path segment like /api/notes/1/2)
      // before doing any file work.
      if (segments.length !== 1 || !isValidId(segments[0])) {
        sendError(res, 404, `No note matches "${segments.join('/')}"`);
        log(404);
        return;
      }

      const id = segments[0];

      if (method === 'GET') {
        const note = await notes.getOne(id);
        if (!note) {
          sendError(res, 404, 'Note not found');
          log(404);
          return;
        }
        sendJson(res, 200, note);
        log(200);
        return;
      }

      if (method === 'PUT') {
        const data = await readJson(req, res, log);
        if (data === null) return;

        // partial: on an update you may send just a title, or just a body,
        // but whatever you do send still has to be valid.
        const check = validateNote(data, { partial: true });
        if (!check.ok) {
          sendError(res, 400, 'Could not update the note', check.errors);
          log(400);
          return;
        }

        const note = await notes.update(id, check.value.title, check.value.body);
        if (!note) {
          sendError(res, 404, 'Note not found');
          log(404);
          return;
        }
        sendJson(res, 200, note);
        log(200);
        return;
      }

      if (method === 'DELETE') {
        const deleted = await notes.remove(id);
        if (!deleted) {
          sendError(res, 404, 'Note not found');
          log(404);
          return;
        }
        sendJson(res, 200, { deleted: true, id });
        log(200);
        return;
      }

      sendMethodNotAllowed(res, ['GET', 'PUT', 'DELETE']);
      log(405);
      return;
    }

    // An unknown /api/... path should answer with JSON, not an HTML 404 page.
    if (url === '/api' || url.startsWith('/api/')) {
      sendError(res, 404, `No API route at ${url}`);
      log(404);
      return;
    }

    if (method !== 'GET' && method !== 'HEAD') {
      sendMethodNotAllowed(res, ['GET', 'HEAD']);
      log(405);
      return;
    }

    // not an API route, so try to serve a file from public/
    serveFile(url, req, res, log);
  } catch (err) {
    console.error('Something went wrong:', err.message);
    if (!res.headersSent) {
      sendError(res, 500, 'Server error — please try again');
    }
    log(500);
  }
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop');
});

// handle common listen errors (eg. port already in use)
server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} already in use — stop other process or set PORT env var to use a different port.`);
    process.exit(1);
  }
  console.error('Server error:', err);
  process.exit(1);
});

module.exports = server;
