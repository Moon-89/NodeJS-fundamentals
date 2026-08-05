// A notes server using only Node's built-in modules - no Express.
// Start it with: npm start

const http = require('http');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

const notes = require('./notes');

const PORT = 3000;
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

// The request body arrives in chunks, so collect them and wait for 'end'.
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

const CONTENT_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
};

// Serve files from public/. Using createReadStream instead of readFile
// because a stream sends the file in chunks instead of loading the whole
// thing into memory first.
function serveFile(url, res, done) {
  const filePath = path.join(PUBLIC, url === '/' ? 'index.html' : url);

  // Don't let someone ask for ../../secret.txt
  if (!filePath.startsWith(PUBLIC)) {
    sendJson(res, 403, { error: 'Forbidden' });
    done(403);
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      sendJson(res, 404, { error: 'Not found' });
      done(404);
      return;
    }

    const type = CONTENT_TYPES[path.extname(filePath)] || 'text/plain';
    res.writeHead(200, { 'Content-Type': type });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    stream.on('error', () => res.end());

    done(200);
  });
}

// --- the server ---

const server = http.createServer(async (req, res) => {
  // req.url includes the query string, and I only want the path part
  const url = req.url.split('?')[0];
  const method = req.method;

  // logging happens here so I don't have to repeat it in every branch
  const log = (status) => logger.emit('request', method, url, status);

  try {
    if (url === '/api/notes' && method === 'GET') {
      const all = await notes.getAll();
      sendJson(res, 200, all);
      log(200);
      return;
    }

    if (url === '/api/notes' && method === 'POST') {
      const body = await readBody(req);
      let data;

      try {
        data = JSON.parse(body);
      } catch {
        sendJson(res, 400, { error: 'Body must be valid JSON' });
        log(400);
        return;
      }

      if (!data.title || typeof data.title !== 'string') {
        sendJson(res, 400, { error: 'title is required' });
        log(400);
        return;
      }

      const note = await notes.add(data.title, data.body);
      sendJson(res, 201, note);
      log(201);
      return;
    }

    // /api/notes/:id - grab the id off the end of the url
    if (url.startsWith('/api/notes/')) {
      const id = url.split('/')[3];

      if (method === 'GET') {
        const note = await notes.getOne(id);
        if (!note) {
          sendJson(res, 404, { error: 'Note not found' });
          log(404);
          return;
        }
        sendJson(res, 200, note);
        log(200);
        return;
      }

      if (method === 'PUT') {
        const body = await readBody(req);
        let data;

        try {
          data = JSON.parse(body);
        } catch {
          sendJson(res, 400, { error: 'Body must be valid JSON' });
          log(400);
          return;
        }

        const note = await notes.update(id, data.title, data.body);
        if (!note) {
          sendJson(res, 404, { error: 'Note not found' });
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
          sendJson(res, 404, { error: 'Note not found' });
          log(404);
          return;
        }
        sendJson(res, 200, { deleted: true });
        log(200);
        return;
      }
    }

    // not an API route, so try to serve a file from public/
    serveFile(url, res, log);
  } catch (err) {
    console.error('Something went wrong:', err.message);
    sendJson(res, 500, { error: 'Server error' });
    log(500);
  }
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop');
});

module.exports = server;
