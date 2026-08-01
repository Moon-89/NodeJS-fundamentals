'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Serve a file out of `rootDir`, streamed rather than buffered.
 *
 * `fs.readFile` would pull the whole file into memory before sending a byte.
 * `createReadStream` + `pipeline` sends it in chunks, so memory use stays flat
 * no matter how big the file is, and `pipeline` cleans up both streams if the
 * client hangs up halfway through.
 *
 * @returns {Promise<boolean>} true if a file was served, false if not found
 *   (so the caller can fall through to its own 404).
 */
async function serveStatic(req, res, rootDir, pathname) {
  const root = path.resolve(rootDir);
  const relative = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html';
  let target = path.resolve(root, relative);

  // Directory traversal guard: after resolving "..", the path must still be
  // inside the public directory.
  if (target !== root && !target.startsWith(root + path.sep)) return false;

  let stats;
  try {
    stats = await fsp.stat(target);
    if (stats.isDirectory()) {
      target = path.join(target, 'index.html');
      stats = await fsp.stat(target);
    }
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return false;
    throw err;
  }

  res.writeHead(200, {
    'Content-Type': MIME_TYPES[path.extname(target).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': stats.size,
    'Last-Modified': stats.mtime.toUTCString(),
  });

  if (req.method === 'HEAD') {
    res.end();
    return true;
  }

  try {
    await pipeline(fs.createReadStream(target), res);
  } catch (err) {
    // ERR_STREAM_PREMATURE_CLOSE just means the browser navigated away
    // mid-download. Nothing is broken, so don't escalate it.
    if (err.code !== 'ERR_STREAM_PREMATURE_CLOSE') throw err;
  }
  return true;
}

module.exports = { serveStatic, MIME_TYPES };
