// Shared input validation, used by both the local http server (src/server.js)
// and the Vercel serverless functions (api/notes/*).
// Keeping it in one place means the rules can't drift between the two.

const TITLE_MAX = 100;
const BODY_MAX = 2000;

// The largest request body we're willing to buffer. Without this, a client
// could stream megabytes at us and we'd hold all of it in memory.
const MAX_BODY_BYTES = 10 * 1024; // 10 KB

function isPlainString(value) {
  return typeof value === 'string';
}

// Validates the payload for a create (POST) or update (PUT).
//
// partial=true is for PUT: a field that isn't sent is simply left alone,
// but a field that IS sent still has to be valid.
//
// Returns { ok, errors, value } — errors is an array of human-readable
// strings so the client can show the user exactly what went wrong.
function validateNote(data, { partial = false } = {}) {
  const errors = [];
  const value = {};

  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, errors: ['Body must be a JSON object'], value: {} };
  }

  const hasTitle = Object.prototype.hasOwnProperty.call(data, 'title');
  const hasBody = Object.prototype.hasOwnProperty.call(data, 'body');

  if (partial && !hasTitle && !hasBody) {
    errors.push('Provide at least one of: title, body');
  }

  if (hasTitle || !partial) {
    if (!isPlainString(data.title)) {
      errors.push('title is required and must be a string');
    } else {
      const title = data.title.trim();
      if (title.length === 0) {
        errors.push('title cannot be empty or only spaces');
      } else if (title.length > TITLE_MAX) {
        errors.push(`title must be ${TITLE_MAX} characters or fewer`);
      } else {
        value.title = title;
      }
    }
  }

  if (hasBody) {
    if (data.body === null) {
      value.body = '';
    } else if (!isPlainString(data.body)) {
      errors.push('body must be a string');
    } else if (data.body.length > BODY_MAX) {
      errors.push(`body must be ${BODY_MAX} characters or fewer`);
    } else {
      value.body = data.body.trim();
    }
  } else if (!partial) {
    value.body = '';
  }

  return { ok: errors.length === 0, errors, value };
}

// Note ids are generated from Date.now(), so they're digit strings.
// Anything else can't possibly match a real note — reject it early instead
// of doing a pointless file read.
function isValidId(id) {
  return isPlainString(id) && /^[0-9]{1,20}$/.test(id);
}

// Parses a raw body string, telling the caller *why* it failed rather than
// just throwing.
function parseJsonBody(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, errors: ['Request body is empty'], data: null };
  }
  try {
    return { ok: true, errors: [], data: JSON.parse(raw) };
  } catch {
    return { ok: false, errors: ['Body must be valid JSON'], data: null };
  }
}

module.exports = {
  TITLE_MAX,
  BODY_MAX,
  MAX_BODY_BYTES,
  validateNote,
  isValidId,
  parseJsonBody,
};
