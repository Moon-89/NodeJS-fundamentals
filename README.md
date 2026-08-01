# Notes — a Node.js server with no dependencies

A small JSON API and static file server built with nothing but Node's standard
library: `http`, `fs`, `stream`, `events`, `path`, `url` and `crypto`. No
Express, no `node_modules`, no build step.

Written as the deliverable for **Node.js fundamentals (videos 1–31)**.

```
npm run seed     # load the sample notes
npm start        # http://127.0.0.1:3000
npm test         # 41 tests, all core modules
```

Open <http://127.0.0.1:3000> for a small UI that exercises the API.

## What is in here

```
src/
  server.js            http.createServer, port binding, graceful shutdown
  app.js               routing table + the single request handler
  router.js            pattern matching (~60 lines, no dependencies)
  lib/
    note-store.js      fs read/write, atomic writes, serialised mutations
    static.js          streamed file serving + traversal guard
    logger.js          EventEmitter-based access log
    respond.js         JSON responses, streamed request body parsing
    http-error.js      errors that carry a status code
public/                the browser UI (plain HTML/CSS/JS)
scripts/
  event-loop-demo.js   runnable walkthrough of the event loop
  seed.js / clean.js
test/                  node:test suites for the API, store, router, statics
docs/
  EVENT-LOOP.md        how the event loop works, and why this code is shaped so
  NPM-AND-MODULES.md   package.json, npm scripts, CommonJS resolution
data/
  notes.seed.json      committed sample data
  notes.json           the working file (gitignored, created on first write)
```

## The API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | status, uptime, Node version, pid |
| `GET` | `/api/stats` | note count and tag histogram |
| `GET` | `/api/notes` | list notes; `?q=` searches, `?tag=` filters |
| `POST` | `/api/notes` | create — `{ title, body?, tags? }` |
| `GET` | `/api/notes/:id` | one note |
| `PUT` / `PATCH` | `/api/notes/:id` | update the given fields |
| `DELETE` | `/api/notes/:id` | delete |

Anything else falls through to `public/`, then to a JSON 404.

```bash
curl http://127.0.0.1:3000/api/health

curl -X POST http://127.0.0.1:3000/api/notes \
  -H 'Content-Type: application/json' \
  -d '{"title":"Streams beat readFile","body":"Flat memory use.","tags":["fs","streams"]}'

curl 'http://127.0.0.1:3000/api/notes?tag=streams'

curl -X DELETE http://127.0.0.1:3000/api/notes/<id>
```

Errors are always JSON and always carry the status:

```json
{
  "error": {
    "status": 422,
    "message": "Validation failed",
    "details": ["title is required and must be a non-empty string"]
  }
}
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Run the server |
| `npm run dev` | Run with `--watch`, restarting on file changes |
| `npm test` | `node --test` over `test/` |
| `npm run seed` | Reset `data/notes.json` from the committed seed |
| `npm run demo:event-loop` | Print the event loop behaving as documented |
| `npm run clean` | Delete generated data and logs |

Configuration is via environment variables: `PORT` (3000), `HOST` (127.0.0.1),
`DATA_FILE`.

```bash
PORT=8080 npm start          # macOS / Linux
$env:PORT=8080; npm start    # PowerShell
```

## Core modules, and where each one shows up

**`http`** — [`server.js`](src/server.js) creates the server; passing a handler
to `createServer` is shorthand for `server.on('request', …)`. Requests are
readable streams, responses are writable ones. Handled by hand: HEAD, 405 with
an `Allow` header, `Content-Length` in bytes rather than characters, and
graceful shutdown on SIGINT/SIGTERM.

**`fs`** — [`note-store.js`](src/lib/note-store.js) persists to JSON with
`fs/promises`. Writes go to a temp file and are then `rename`d over the target,
so a crash mid-write cannot leave a half-written file. `ENOENT` on read is
treated as "no notes yet" rather than an error.

**`stream`** — [`static.js`](src/lib/static.js) serves files with
`createReadStream` + `pipeline`, so memory stays flat regardless of file size
and both ends get cleaned up if the client disconnects.
[`respond.js`](src/lib/respond.js) reads request bodies chunk by chunk with a
64 KB cap.

**`events`** — [`logger.js`](src/lib/logger.js) extends `EventEmitter`. The app
emits `request` and `error` and never calls the logger directly. It also logs
from `res.once('finish')`, so every response is logged exactly once no matter
which branch produced it.

**`path`** — used everywhere instead of string concatenation, which is also
what makes the traversal guard in `static.js` correct: resolve first, then
check the result is still inside the public directory.

**`crypto`** — `randomUUID()` for note ids.

## Concurrency: the part that is easy to get wrong

Node runs one line of JavaScript at a time, but `await` is a yield point.
Without care, two overlapping `POST /api/notes` requests both read the same
snapshot of the file, and the second write silently discards the first.

`NoteStore` serialises every read-modify-write cycle onto a promise chain.
[`test/note-store.test.js`](test/note-store.test.js) fires 40 concurrent
creates and asserts all 40 survive — that test fails if you remove the queue.

## Reading

- [docs/EVENT-LOOP.md](docs/EVENT-LOOP.md) — phases, microtasks,
  `setTimeout` vs `setImmediate`, the thread pool, and the three places it
  changed the code in this repo. Pairs with `npm run demo:event-loop`.
- [docs/NPM-AND-MODULES.md](docs/NPM-AND-MODULES.md) — `package.json` fields,
  npm scripts, semver ranges, the CommonJS module wrapper, `require` caching
  and resolution.

## Requirements

Node 18.17+ (uses `node:test`, `node:fs/promises`, `randomUUID`). Developed on
Node 22.

## License

MIT
