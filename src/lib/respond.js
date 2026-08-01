'use strict';

const { HttpError } = require('./http-error');

/** Reject request bodies larger than this so a client can't exhaust memory. */
const MAX_BODY_BYTES = 64 * 1024;

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload, null, 2) + '\n';
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    // Content-Length must be the BYTE length, not the character length --
    // a single emoji is one character but four bytes.
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  // HEAD responses carry the headers but no body.
  res.end(res.req && res.req.method === 'HEAD' ? undefined : body);
}

function sendError(res, error) {
  const status = error instanceof HttpError ? error.status : 500;
  const message = status >= 500 ? 'Internal server error' : error.message;
  const payload = { error: { status, message } };
  if (error.details) payload.error.details = error.details;
  sendJson(res, status, payload);
}

/**
 * Read the request body as a stream and parse it as JSON.
 *
 * `req` is a Readable stream: Node hands us the body in chunks as they arrive
 * off the socket, which is why this has to be asynchronous.
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let received = 0;
    let tooLarge = false;

    req.on('data', (chunk) => {
      if (tooLarge) return; // keep draining, but stop holding on to it
      received += chunk.length;
      if (received > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0; // release what we already buffered
        // Note: we deliberately do NOT destroy the request. Node drains the
        // rest of the body once the response ends, which lets the client
        // actually receive this 413 instead of a socket reset.
        reject(new HttpError(413, `Request body exceeds ${MAX_BODY_BYTES} bytes`));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (tooLarge) return;
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (raw === '') return resolve({});
      try {
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return reject(new HttpError(400, 'Body must be a JSON object'));
        }
        resolve(parsed);
      } catch {
        reject(new HttpError(400, 'Body is not valid JSON'));
      }
    });

    req.on('error', reject);
  });
}

module.exports = { sendJson, sendError, readJsonBody, MAX_BODY_BYTES };
