// Vercel serverless function to list/create notes using the repository's data/notes.json
// Stores and reads notes.json directly in the GitHub repo using a Personal Access Token.
// Environment variables expected on Vercel:
// - GH_PAT : GitHub personal access token with repo access
// - GITHUB_REPO (optional) : owner/repo. If not provided, Vercel env VERCEL_GIT_REPO_OWNER and VERCEL_GIT_REPO_SLUG are used.

const path = require('path');

const GH_PAT = process.env.GH_PAT;
const REPO = process.env.GITHUB_REPO || (process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG && `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`);
const BRANCH = process.env.GIT_BRANCH || 'main';
const FILE_PATH = 'data/notes.json';

if (!GH_PAT) console.warn('GH_PAT not set — /api/notes will fail on Vercel');
if (!REPO) console.warn('GITHUB_REPO not set — repo owner/slug may be unavailable');

async function githubRequest(method, apiPath, body) {
  const url = `https://api.github.com${apiPath}`;
  const res = await fetch(url, {
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
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function getFile() {
  const apiPath = `/repos/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`;
  return githubRequest('GET', apiPath);
}

async function updateFile(contentBase64, sha, message) {
  const apiPath = `/repos/${REPO}/contents/${FILE_PATH}`;
  return githubRequest('PUT', apiPath, {
    message,
    content: contentBase64,
    sha,
    branch: BRANCH,
  });
}

function encodeBase64(str) { return Buffer.from(str, 'utf8').toString('base64'); }
function decodeBase64(str) { return Buffer.from(str, 'base64').toString('utf8'); }

module.exports = async (req, res) => {
  if (!GH_PAT || !REPO) {
    return res.status(500).json({ error: 'Server not configured: GH_PAT or GITHUB_REPO missing' });
  }

  try {
    if (req.method === 'GET') {
      const r = await getFile();
      if (r.status === 200 && r.data && r.data.content) {
        const content = decodeBase64(r.data.content.replace(/\n/g, ''));
        const notes = JSON.parse(content || '[]');
        return res.status(200).json(notes);
      }
      // if file not found, return empty list
      if (r.status === 404) return res.status(200).json([]);
      return res.status(500).json({ error: 'Failed to read notes file', details: r.data });
    }

    if (req.method === 'POST') {
      const body = await new Promise((resolve, reject) => {
        let d=''; req.on('data', c => d+=c); req.on('end', () => resolve(JSON.parse(d))).on('error', reject);
      });
      if (!body.title || typeof body.title !== 'string') return res.status(400).json({ error: 'title is required' });

      // load current file
      const r = await getFile();
      let notes = [];
      let sha = undefined;
      if (r.status === 200 && r.data && r.data.content) {
        sha = r.data.sha;
        const content = decodeBase64(r.data.content.replace(/\n/g, ''));
        notes = JSON.parse(content || '[]');
      }

      const id = Date.now().toString();
      const note = { id, title: body.title, body: body.body || '', createdAt: new Date().toISOString() };
      notes.push(note);

      const newContent = JSON.stringify(notes, null, 2);
      const upd = await updateFile(encodeBase64(newContent), sha, `Add note ${id}`);
      if (upd.status >= 200 && upd.status < 300) {
        return res.status(201).json(note);
      }
      return res.status(500).json({ error: 'Failed to update notes file', details: upd.data });
    }

    res.setHeader('Allow', 'GET,POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
};
