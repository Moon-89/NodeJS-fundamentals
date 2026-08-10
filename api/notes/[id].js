// Vercel Serverless function for /api/notes/[id]
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

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
  // id will be available as req.query.id on Vercel
  const id = req.query && req.query.id;

  if (!id) return res.status(400).json({ error: 'Missing id' });

  try {
    if (method === 'GET') {
      const q = await supabaseFetch(`/notes?select=*&id=eq.${encodeURIComponent(id)}`);
      const note = Array.isArray(q.body) ? q.body[0] : q.body;
      if (!note) return res.status(404).json({ error: 'Note not found' });
      return res.status(200).json(note);
    }

    if (method === 'PUT') {
      const body = await new Promise((resolve, reject) => {
        let d=''; req.on('data', c => d+=c); req.on('end', () => resolve(JSON.parse(d))).on('error', reject);
      });
      const q = await supabaseFetch(`/notes?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ title: body.title, body: body.body }) });
      return res.status(q.status).json(q.body);
    }

    if (method === 'DELETE') {
      const q = await supabaseFetch(`/notes?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      return res.status(q.status).json({ deleted: true });
    }

    res.setHeader('Allow', 'GET,PUT,DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
};
