// Vercel serverless function: read (GET), update (PUT) and delete (DELETE)
// a single note by id. Storage is data/notes.json via the GitHub API.

const gh = require('../../src/github-store');
const { validateNote, isValidId } = require('../../src/validate');

module.exports = async (req, res) => {
  if (!gh.isConfigured()) {
    return gh.sendError(res, 500, 'Server not configured', [
      'Set GH_PAT (and GITHUB_REPO if the repo cannot be detected) in the Vercel project settings.',
    ]);
  }

  const id = req.query && req.query.id;
  if (!isValidId(id)) {
    return gh.sendError(res, 404, `No note matches "${id}"`);
  }

  try {
    const read = await gh.readNotes();
    if (!read.ok) {
      return gh.sendError(res, 502, 'Could not read notes from storage', [
        `GitHub responded with ${read.status}`,
      ]);
    }

    const notes = read.notes;
    const idx = notes.findIndex((n) => String(n.id) === String(id));

    if (req.method === 'GET') {
      if (idx === -1) return gh.sendError(res, 404, 'Note not found');
      return res.status(200).json(notes[idx]);
    }

    if (req.method === 'PUT') {
      const parsed = gh.parseBody(req);
      if (!parsed.ok) {
        return gh.sendError(res, 400, 'Invalid request body', parsed.errors);
      }

      // partial: send just a title, or just a body — but what you send
      // still has to be valid.
      const check = validateNote(parsed.data, { partial: true });
      if (!check.ok) {
        return gh.sendError(res, 400, 'Could not update the note', check.errors);
      }

      if (idx === -1) return gh.sendError(res, 404, 'Note not found');

      if (check.value.title !== undefined) notes[idx].title = check.value.title;
      if (check.value.body !== undefined) notes[idx].body = check.value.body;
      notes[idx].updatedAt = new Date().toISOString();

      const upd = await gh.writeNotes(notes, read.sha, `Update note ${id}`);
      if (upd.status >= 200 && upd.status < 300) {
        return res.status(200).json(notes[idx]);
      }
      if (upd.status === 409) {
        return gh.sendError(res, 409, 'Someone else just changed the notes', [
          'Please refresh and try again.',
        ]);
      }
      return gh.sendError(res, 502, 'Could not save the change to storage', [
        `GitHub responded with ${upd.status}`,
      ]);
    }

    if (req.method === 'DELETE') {
      if (idx === -1) return gh.sendError(res, 404, 'Note not found');

      notes.splice(idx, 1);

      const upd = await gh.writeNotes(notes, read.sha, `Delete note ${id}`);
      if (upd.status >= 200 && upd.status < 300) {
        return res.status(200).json({ deleted: true, id });
      }
      if (upd.status === 409) {
        return gh.sendError(res, 409, 'Someone else just changed the notes', [
          'Please refresh and try again.',
        ]);
      }
      return gh.sendError(res, 502, 'Could not delete the note from storage', [
        `GitHub responded with ${upd.status}`,
      ]);
    }

    res.setHeader('Allow', 'GET, PUT, DELETE');
    return gh.sendError(res, 405, 'Method not allowed. Try: GET, PUT, DELETE');
  } catch (err) {
    console.error(err);
    return gh.sendError(res, 500, 'Server error — please try again');
  }
};
