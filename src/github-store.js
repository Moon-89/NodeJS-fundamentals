// Shared GitHub-file-storage helper for the serverless functions.
//
// This lives in src/ rather than api/ on purpose: Vercel turns *every* file
// under api/ into an endpoint, and this module exports a bag of helpers, not
// a request handler.
//
// Environment variables expected on Vercel:
// - GH_PAT : GitHub personal access token with repo contents write access
// - GITHUB_REPO (optional) : owner/repo. Falls back to the VERCEL_GIT_* vars.

const GH_PAT = process.env.GH_PAT;
const REPO =
  process.env.GITHUB_REPO ||
  (process.env.VERCEL_GIT_REPO_OWNER &&
    process.env.VERCEL_GIT_REPO_SLUG &&
    `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`);
const BRANCH = process.env.GIT_BRANCH || 'main';
const FILE_PATH = 'data/notes.json';

function isConfigured() {
  return Boolean(GH_PAT && REPO);
}

async function githubRequest(method, apiPath, body) {
  const res = await fetch(`https://api.github.com${apiPath}`, {
    method,
    headers: {
      Authorization: `token ${GH_PAT}`,
      'User-Agent': 'notes-app',
      Accept: 'application/vnd.github.v3+json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

function decodeBase64(str) {
  return Buffer.from(str, 'base64').toString('utf8');
}

function encodeBase64(str) {
  return Buffer.from(str, 'utf8').toString('base64');
}

// Reads notes.json out of the repo.
// Returns { ok, notes, sha, status, details }. A missing file is not an error —
// it just means there are no notes yet.
async function readNotes() {
  const r = await githubRequest('GET', `/repos/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`);

  if (r.status === 404) {
    return { ok: true, notes: [], sha: undefined };
  }

  if (r.status !== 200 || !r.data || !r.data.content) {
    return { ok: false, status: r.status, details: r.data };
  }

  let notes;
  try {
    const content = decodeBase64(String(r.data.content).replace(/\n/g, ''));
    notes = content.trim() === '' ? [] : JSON.parse(content);
  } catch {
    // A corrupt file shouldn't take the whole API down.
    return { ok: true, notes: [], sha: r.data.sha };
  }

  if (!Array.isArray(notes)) notes = [];

  return { ok: true, notes, sha: r.data.sha };
}

async function writeNotes(notes, sha, message) {
  return githubRequest('PUT', `/repos/${REPO}/contents/${FILE_PATH}`, {
    message,
    content: encodeBase64(JSON.stringify(notes, null, 2)),
    sha,
    branch: BRANCH,
  });
}

// Date.now() can collide if two notes are created in the same millisecond,
// which would give two notes the same id and break delete. Step past the
// highest id already in use.
function nextId(notes) {
  let id = Date.now();
  for (const note of notes) {
    const existing = Number(note.id);
    if (Number.isFinite(existing) && existing >= id) id = existing + 1;
  }
  return String(id);
}

// Same error shape as the local server: { error, details? }
function sendError(res, status, error, details) {
  const payload = { error };
  if (details && details.length) payload.details = details;
  return res.status(status).json(payload);
}

// Serverless handlers get req.body pre-parsed when the Content-Type is JSON,
// but not when it's missing or the body came through as a raw string.
function parseBody(req) {
  if (req.body === undefined || req.body === null || req.body === '') {
    return { ok: false, errors: ['Request body is empty'], data: null };
  }
  if (typeof req.body === 'object') {
    return { ok: true, errors: [], data: req.body };
  }
  try {
    return { ok: true, errors: [], data: JSON.parse(req.body) };
  } catch {
    return { ok: false, errors: ['Body must be valid JSON'], data: null };
  }
}

module.exports = {
  isConfigured,
  readNotes,
  writeNotes,
  nextId,
  sendError,
  parseBody,
};
