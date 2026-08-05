# My notes from the Node.js videos

Writing this down mostly for myself, so I don't forget it.

## The event loop

Node runs my JavaScript on **one thread**. That sounds like it should be slow,
but the trick is that Node doesn't sit and wait for slow things.

When I call `fs.readFile`, Node hands the actual reading off (to the operating
system or to a pool of background threads) and immediately moves on to the next
line. When the read is done, my callback gets put in a queue. The event loop is
the thing that keeps checking those queues and running whatever is ready.

So the thread is almost never just waiting around. That's why one Node process
can handle a lot of requests at once.

The catch: if I write a slow `for` loop, nothing else can run at all, because
there's only one thread and my loop is holding it. Slow I/O is fine, slow
*calculation* is what hurts.

### The phases

Each trip around the loop goes through the same phases in order:

1. **timers** - `setTimeout` and `setInterval` callbacks that are due
2. **poll** - I/O callbacks, like a file finishing or a request arriving
3. **check** - `setImmediate` callbacks
4. **close** - `close` event handlers

There are a couple more phases but these are the ones that come up.

In between callbacks, Node also drains the **microtask** queue - promise
`.then` callbacks and `process.nextTick`. These run *before* any timer, even a
`setTimeout(..., 0)`.

### What surprised me

`setTimeout(fn, 0)` doesn't run immediately. It waits for the next timers
phase. And `setImmediate` - despite the name - runs *after* timers, because the
check phase comes later in the loop.

`src/event-loop-demo.js` prints all of this in order. Run `npm run demo` to see
it. That's what finally made it make sense to me.

## CommonJS modules

`require()` and `module.exports`. Two things worth remembering:

**A module's code runs once.** The first `require('./notes')` runs the whole
file. Every `require` after that gets back the same exports object from a cache.
So if a module holds a variable, everyone shares it.

**`require` is synchronous.** It blocks while it reads the file. That's fine at
the top of a file when the program is starting, but it's a reason not to call
`require` inside a request handler.

Node wraps every module in a function before running it, which is where
`module`, `exports`, `__dirname` and `__filename` come from. They aren't
globals, they're arguments.

## fs

I used `fs.promises` in `src/notes.js` so I could use `async/await` instead of
nesting callbacks.

The one thing I had to handle: if `data/notes.json` doesn't exist,
`readFile` throws with `err.code === 'ENOENT'`. That's not really an error for
my app - it just means no notes yet - so I catch that specific code and return
an empty array.

## Streams

`readFile` loads the entire file into memory before you get anything.
`createReadStream` gives it to you in chunks.

For serving files in `src/server.js` I used a stream and `.pipe(res)`. With a
small CSS file it makes no difference, but if it were a large file, `readFile`
would put the whole thing in memory just to send it out again. The stream keeps
memory flat.

`.pipe()` also handles backpressure - if the client is slow to receive, the
stream slows down its reading instead of piling up in memory.

## events

`EventEmitter` is the pattern behind a lot of Node. You call `.on('name', fn)`
to listen and `.emit('name', data)` to fire.

I used it for logging in `server.js`. The request handler just emits a
`request` event and doesn't care what happens next. If I wanted to also write
logs to a file, I'd add a second `.on('request')` listener and wouldn't have to
touch the handler at all.

`http.createServer` is itself an EventEmitter - passing it a function is a
shortcut for `server.on('request', fn)`.

## npm and package.json

No dependencies in this project, everything is built into Node. But
`package.json` still matters:

- `main` - the entry point
- `scripts` - named commands, run with `npm run <name>`
  (`start` and `test` work without the `run`)
- `engines` - which Node versions this works on

`npm start` runs `node src/server.js`. `npm run dev` adds `--watch` so the
server restarts when I save a file, which saved me a lot of Ctrl+C.
