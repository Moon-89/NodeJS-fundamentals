// Vercel serverless function: list (GET) and create (POST) notes.
// Storage is data/notes.json in this repo, read/written through the GitHub API.
// See api/_lib/github.js for the required environment variables.

const gh = require('../../src/github-store');
const { validateNote } = require('../../src/validate');

module.exports = async (req, res) => {
  if (!gh.isConfigured()) {
    return gh.sendError(res, 500, 'Server not configured', [
      'Set GH_PAT (and GITHUB_REPO if the repo cannot be detected) in the Vercel project settings.',
    ]);
  }

  try {
    if (req.method === 'GET') {
      const read = await gh.readNotes();
      if (!read.ok) {
        return gh.sendError(res, 502, 'Could not read notes from storage', [
          `GitHub responded with ${read.status}`,
        ]);
      }
      return res.status(200).json(read.notes);
    }

    if (req.method === 'POST') {
      const parsed = gh.parseBody(req);
      if (!parsed.ok) {
        return gh.sendError(res, 400, 'Invalid request body', parsed.errors);
      }

      const check = validateNote(parsed.data);
      if (!check.ok) {
        return gh.sendError(res, 400, 'Could not save the note', check.errors);
      }

      const read = await gh.readNotes();
      if (!read.ok) {
        return gh.sendError(res, 502, 'Could not read notes from storage', [
          `GitHub responded with ${read.status}`,
        ]);
      }

      const note = {
        id: gh.nextId(read.notes),
        title: check.value.title,
        body: check.value.body,
        createdAt: new Date().toISOString(),
      };

      const notes = read.notes.concat(note);
      const upd = await gh.writeNotes(notes, read.sha, `Add note ${note.id}`);

      if (upd.status >= 200 && upd.status < 300) {
        return res.status(201).json(note);
      }

      // 409 means someone else wrote the file between our read and our write.
      if (upd.status === 409) {
        return gh.sendError(res, 409, 'Someone else just changed the notes', [
          'Please refresh and try again.',
        ]);
      }

      return gh.sendError(res, 502, 'Could not save the note to storage', [
        `GitHub responded with ${upd.status}`,
      ]);
    }

    res.setHeader('Allow', 'GET, POST');
    return gh.sendError(res, 405, 'Method not allowed. Try: GET, POST');
  } catch (err) {
    console.error(err);
    return gh.sendError(res, 500, 'Server error — please try again');
  }
};
