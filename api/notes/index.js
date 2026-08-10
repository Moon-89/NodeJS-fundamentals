// Vercel Serverless function for /api/notes
// Uses Supabase REST API for persistence. Requires env vars SUPABASE_URL and SUPABASE_KEY.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn('SUPABASE_URL or SUPABASE_KEY not set - /api/notes will fail');
}

async function supabaseFetch(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      apiKey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  try { return { status: res.status, body: JSON.parse(text) } } catch { return { status: res.status, body: text } }
}

module.exports = async (req, res) => {
  const method = req.method;

  try {
    if (method === 'GET') {
      // get all notes
      const q = await supabaseFetch('/notes?select=*');
      return res.status(q.status).json(q.body);
    }

    if (method === 'POST') {
      const body = await new Promise((resolve, reject) => {
        let d=''; req.on('data', c => d+=c); req.on('end', () => resolve(JSON.parse(d))).on('error', reject);
      });

      if (!body.title || typeof body.title !== 'string') {
        return res.status(400).json({ error: 'title is required' });
      }

      const payload = { title: body.title, body: body.body || null, created_at: new Date().toISOString() };
      const q = await supabaseFetch('/notes', { method: 'POST', body: JSON.stringify(payload) });
      return res.status(q.status).json(q.body);
    }

    res.setHeader('Allow', 'GET,POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
};
