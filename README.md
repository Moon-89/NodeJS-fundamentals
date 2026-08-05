# Notes app

A small notes app I built while going through the Node.js fundamentals videos.
It uses only Node's built-in modules - `http`, `fs`, `path`, `events` and
streams. No Express, no npm packages.

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
  event-loop-demo.js    prints callback order so you can see the loop
public/                 the web page (html, css, js)
data/notes.json         where the notes are saved
test/notes.test.js      tests for the API
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
