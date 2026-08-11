# Notes app

A small notes app I built while going through the Node.js fundamentals videos.
It uses only Node's built-in modules - `http`, `fs`, `path`, `events` and
streams. No Express, no npm packages.

## Live demo

| Where | Link | What works there |
| --- | --- | --- |
| **Vercel (full app)** | https://node-js-fundamentals-ten.vercel.app | Frontend **and** the API. Notes are saved to `data/notes.json` in this repo. |
| **GitHub Pages (frontend only)** | https://moon-89.github.io/NodeJS-fundamentals/ | The UI only — Pages can't run Node, so the app says so and stores notes in your browser. |

Both are deployed automatically on every push to `main`.

## Running it

```
npm start
```

Then open http://localhost:3000

```
npm test       # run the tests
npm run dev    # restarts on file changes
npm run demo   # the event loop demo
```

Needs Node 18 or newer (I used the built-in test runner and `fetch`).

## Files

```
src/
  server.js             the HTTP server and routes
  notes.js              reading and writing data/notes.json
  validate.js           input rules, shared by the server and the API routes
  event-loop-demo.js    prints callback order so you can see the loop
api/
  _lib/github.js        GitHub-file-storage helper for the serverless routes
  notes/index.js        GET/POST /api/notes on Vercel
  notes/[id].js         GET/PUT/DELETE /api/notes/:id on Vercel
public/                 the web page (html, css, js)
data/notes.json         where the notes are saved
test/notes.test.js      end-to-end tests for the API
test/validate.test.js   unit tests for the validation rules
NOTES.md                my notes on the event loop, modules, streams, events
```

## API

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/api/notes` | all notes |
| POST | `/api/notes` | add one - send `{ "title": "...", "body": "..." }` |
| GET | `/api/notes/:id` | one note |
| PUT | `/api/notes/:id` | update it |
| DELETE | `/api/notes/:id` | delete it |

Anything else is served as a file from `public/`.

Example:

```
curl http://localhost:3000/api/notes

curl -X POST http://localhost:3000/api/notes \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Hello\",\"body\":\"my first note\"}"
```

Every error comes back in the same shape, so the frontend only needs one code
path to display it:

```json
{
  "error": "Could not save the note",
  "details": ["title cannot be empty or only spaces"]
}
```

## Edge cases the server handles

| Situation | Response |
| --- | --- |
| Missing / empty / whitespace-only title | `400` with the reason in `details` |
| Title over 100 chars, body over 2000 chars | `400` |
| `title` sent as a number, object or array | `400` |
| Malformed JSON, or an empty body | `400` |
| Body is a JSON array instead of an object | `400` |
| `Content-Type` isn't `application/json` | `415` |
| Body larger than 10 KB | `413` — the rest is drained, never buffered |
| `PUT` with no fields, or with an invalid field | `400` |
| `PUT`/`DELETE` on an id that doesn't exist | `404` |
| Malformed id (`/api/notes/abc`) or an extra segment | `404`, without touching the disk |
| `PATCH /api/notes` | `405` with an `Allow` header |
| Unknown `/api/...` path | `404` as JSON, not an HTML page |
| `GET /../package.json` | `403` — path traversal can't escape `public/` |
| Malformed `%` escape or a NUL byte in the URL | `400` |
| `data/notes.json` is corrupt, empty, or not an array | Warns and starts from an empty list instead of 500-ing every request |
| Two notes created in the same millisecond | Writes are serialised, so ids stay unique and neither write is lost |
| Crash partway through a write | Writes go to a temp file and are renamed into place, so the file is never left truncated |
| Port 3000 already in use | Clear message telling you to set `PORT` |

## What the user sees

Nothing happens silently — every action gets an explicit response:

- **Validation** runs in the browser before the request and again on the
  server, with live character counters on both fields.
- **Saving** disables the form and changes the button to "Saving…", so a
  double-click can't create the same note twice.
- **Success** shows a green confirmation naming the note (`Added "Groceries".`)
  that clears itself after a few seconds.
- **Delete** asks first, naming the note, and says so if you cancel.
- **Failures** keep what you typed and say so, and list the server's `details`
  rather than a generic "failed".
- **No backend** (the GitHub Pages build) shows a banner explaining that notes
  are stored in this browser only — so nobody thinks their data reached a server.
- The feedback area is a `role="status"` live region, so screen readers
  announce all of it too.

## What I learned

The write-up is in [NOTES.md](NOTES.md) - the event loop and its phases,
why `setTimeout(fn, 0)` isn't actually immediate, how `require` caching works,
streams vs `readFile`, and `EventEmitter`.

Short version of where each module shows up:

- **http** - `createServer` in `server.js`, routing by checking
  `req.method` and `req.url` myself
- **fs** - `notes.js` reads and writes the JSON file with `fs.promises`
- **streams** - `createReadStream().pipe(res)` for serving files
- **events** - an `EventEmitter` for the request log

## Deployment

Both deployments run automatically on push to `main` — see the [live demo](#live-demo)
links at the top.

### Vercel — frontend + working API

Import the repo at https://vercel.com/new. No build command and no output
directory to set: Vercel serves `public/` at the root and turns each file under
`api/` into a serverless function on its own.

The API stores notes by committing `data/notes.json` back to this repository
through the GitHub REST API, so there's no database to sign up for. It needs one
environment variable in **Settings → Environment Variables**:

- `GH_PAT` — a GitHub personal access token with `repo` scope
  ([create one here](https://github.com/settings/tokens))

Vercel already exposes the repo owner and name via `VERCEL_GIT_REPO_OWNER` and
`VERCEL_GIT_REPO_SLUG`, so the functions work that out themselves. Set
`GITHUB_REPO` to `owner/repo` only if that detection doesn't fit your setup.

Redeploy after adding the token. Without it, `/api/notes` answers `500` with
`"Server not configured"` and the page drops into demo mode.

Caveat: every write is a git commit. That's fine for a demo, not for real
write volume.

### GitHub Pages — frontend only

`.github/workflows/deploy-gh-pages.yml` publishes `public/` on every push.
Enable it once under **Settings → Pages → Source: GitHub Actions**.

Pages can only serve static files, so there's no API there. The page detects
that, shows a banner saying so, and stores notes in `localStorage` instead —
the UI stays fully interactive for anyone who just wants to click through it.
