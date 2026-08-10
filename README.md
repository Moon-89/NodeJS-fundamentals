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

## Deployment

This project serves a static frontend from the `public/` folder. Two quick ways to get a live, reviewable site:

- **GitHub Pages (auto)**: a GitHub Action is included at `.github/workflows/deploy-gh-pages.yml` that publishes the `public/` folder to GitHub Pages on push to `main` or `master`. After you push, check the Actions tab — once successful, enable Pages in the repo settings (or set Pages to use the `gh-pages` branch) and the site will be live.

- **Vercel (one-click)**: import the repository at https://vercel.com/new and set the `Build & Output Settings` so the output directory is `public` (no build command required). Vercel will host the static site immediately.

- **Vercel (frontend + backend)**: This repo now includes serverless API routes under `api/notes` that proxy to Supabase for persistence. To deploy a working full-stack site on Vercel:

  1. Create a free Supabase project and create a table `notes` with columns:
    - `id` (type `text` or `uuid`, primary key)
    - `title` (text)
    - `body` (text)
    - `created_at` (timestamp)

  2. Get your Supabase `URL` and `anon` key (or a service role key if you prefer) and add them as Vercel Environment Variables in your project settings:
    - `SUPABASE_URL` set to your Supabase URL (e.g. `https://xyz.supabase.co`)
    - `SUPABASE_KEY` set to your Supabase anon or service key

  3. Push to GitHub and import the repo into Vercel. Vercel will detect the `api/` folder and deploy serverless functions automatically. The frontend will use `/api/notes` and the serverless functions will persist notes to Supabase.

  Note: If you prefer a quick reviewer demo without creating Supabase, you can keep the static-only deploy; the frontend will automatically switch to demo/localStorage mode when the backend is absent.

Notes for reviewers: the frontend now includes a demo/offline fallback. If the backend API (`/api/notes`) is not reachable on the deployed site, the app automatically switches to a demo mode that stores notes in the browser (`localStorage`) so the UI remains interactive.
