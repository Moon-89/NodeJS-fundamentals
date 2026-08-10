// Vercel serverless function to get/update/delete a single note by id using GitHub file storage
const GH_PAT = process.env.GH_PAT;
const REPO = process.env.GITHUB_REPO || (process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG && `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`);
const BRANCH = process.env.GIT_BRANCH || 'main';
const FILE_PATH = 'data/notes.json';

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
  return githubRequest('GET', `/repos/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`);
}

async function updateFile(contentBase64, sha, message) {
  return githubRequest('PUT', `/repos/${REPO}/contents/${FILE_PATH}`, { message, content: contentBase64, sha, branch: BRANCH });
}

function encodeBase64(str) { return Buffer.from(str, 'utf8').toString('base64'); }
function decodeBase64(str) { return Buffer.from(str, 'base64').toString('utf8'); }

module.exports = async (req, res) => {
  if (!GH_PAT || !REPO) return res.status(500).json({ error: 'Server not configured: GH_PAT or GITHUB_REPO missing' });

  const id = req.query && req.query.id;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  try {
    const r = await getFile();
    if (r.status !== 200) return res.status(500).json({ error: 'Failed to read notes file', details: r.data });
    const sha = r.data.sha;
    const content = decodeBase64(r.data.content.replace(/\n/g, ''));
    const notes = JSON.parse(content || '[]');

    if (req.method === 'GET') {
      const note = notes.find(n => String(n.id) === String(id));
      if (!note) return res.status(404).json({ error: 'Note not found' });
      return res.status(200).json(note);
    }

    if (req.method === 'PUT') {
      const body = await new Promise((resolve, reject) => { let d=''; req.on('data', c => d+=c); req.on('end', () => resolve(JSON.parse(d))).on('error', reject); });
      const idx = notes.findIndex(n => String(n.id) === String(id));
      if (idx === -1) return res.status(404).json({ error: 'Note not found' });
      notes[idx].title = body.title || notes[idx].title;
      notes[idx].body = body.body || notes[idx].body;
      const newContent = JSON.stringify(notes, null, 2);
      const upd = await updateFile(encodeBase64(newContent), sha, `Update note ${id}`);
      if (upd.status >= 200 && upd.status < 300) return res.status(200).json(notes[idx]);
      return res.status(500).json({ error: 'Failed to update file', details: upd.data });
    }

    if (req.method === 'DELETE') {
      const idx = notes.findIndex(n => String(n.id) === String(id));
      if (idx === -1) return res.status(404).json({ error: 'Note not found' });
      notes.splice(idx, 1);
      const newContent = JSON.stringify(notes, null, 2);
      const upd = await updateFile(encodeBase64(newContent), sha, `Delete note ${id}`);
      if (upd.status >= 200 && upd.status < 300) return res.status(200).json({ deleted: true });
      return res.status(500).json({ error: 'Failed to update file', details: upd.data });
    }

    res.setHeader('Allow', 'GET,PUT,DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
};
