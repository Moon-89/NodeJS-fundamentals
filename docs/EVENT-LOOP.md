# The Node.js event loop

Run `npm run demo:event-loop` alongside this document — every claim below has a
matching stage in [`scripts/event-loop-demo.js`](../scripts/event-loop-demo.js)
that you can watch happen.

## The one-sentence version

Node runs your JavaScript on a single thread; anything slow (disk, network,
timers) is handed to the operating system or to libuv's thread pool, and the
event loop is the thing that keeps checking "is any of that finished yet?" and
running the callback you left behind.

## Why it exists

A classic thread-per-request server spends most of its life blocked. Ten
thousand connections mostly waiting on a database means ten thousand mostly
idle threads, each with its own stack and scheduling cost.

Node inverts that. There is one thread running JavaScript. When you ask for a
file, Node registers the request with libuv and **returns immediately** — your
thread is free to serve other requests. When the read finishes, libuv puts the
callback in a queue, and the loop picks it up on its next lap.

The trade-off is the whole story of Node: I/O concurrency is nearly free, and
CPU work is expensive, because CPU work has nowhere else to go.

## The phases

Each iteration of the loop ("tick") walks a fixed sequence of phases. Each
phase has its own callback queue, and drains it before moving on.

```
   ┌────────────────────────────┐
┌─>│           timers           │  setTimeout / setInterval callbacks whose
│  └─────────────┬──────────────┘  time has come
│  ┌─────────────┴──────────────┐
│  │     pending callbacks      │  a few deferred system callbacks
│  └─────────────┬──────────────┘  (e.g. some TCP errors)
│  ┌─────────────┴──────────────┐
│  │       idle, prepare        │  internal to Node
│  └─────────────┬──────────────┘
│  ┌─────────────┴──────────────┐      ┌───────────────┐
│  │            poll            │<─────┤   incoming    │  waits for new I/O
│  └─────────────┬──────────────┘      │  connections, │  and runs its
│  ┌─────────────┴──────────────┐      │   data, etc.  │  callbacks
│  │           check            │      └───────────────┘
│  └─────────────┬──────────────┘  setImmediate callbacks
│  ┌─────────────┴──────────────┐
└──┤      close callbacks       │  socket.on('close'), etc.
   └────────────────────────────┘
```

**poll** is where the loop spends its idle time. If there is nothing else
pending it will block here waiting for I/O — which is why an idle Node server
uses ~0% CPU rather than spinning.

The two phases worth internalising:

- **timers** — where your `setTimeout` callback runs
- **check** — where your `setImmediate` callback runs

## Microtasks cut the line

Between *every* callback — not just between phases — Node drains two extra
queues, in this order:

1. **`process.nextTick`** queue
2. **promise microtask** queue (`.then`, and everything after an `await`)

Both run to completion before the loop moves on. That is why stage 1 of the
demo prints:

```
a. synchronous line
b. synchronous line
c. process.nextTick        <- after sync code, before promises
d. promise microtask       <- after nextTick, before the loop turns
e. setTimeout 0            <- first actual phase of the loop
```

A consequence with teeth: a `process.nextTick` callback that schedules another
`process.nextTick` callback will starve the loop forever. The queue is drained
until empty, and it never becomes empty.

## setTimeout(0) vs setImmediate

The honest answer is *it depends where you call them from*.

**From the main module** the order is not guaranteed. `setTimeout(fn, 0)` is
clamped to 1ms, and whether that millisecond has already elapsed by the time
the loop reaches its first timers phase depends on how long the process took to
start. Stage 2 of the demo runs eight fresh processes to show the coin flip.

**From inside an I/O callback** the order *is* guaranteed: `setImmediate` always
runs first. You are in the **poll** phase, **check** comes immediately after it
in the same lap, and **timers** is a whole lap away.

```js
fs.readFile(file, () => {
  setTimeout(() => console.log('second'), 0); // timers -- next lap
  setImmediate(() => console.log('first'));   // check  -- this lap
});
```

And `setTimeout(fn, 10)` means *no sooner than* 10ms. It is a floor, not a
promise. Stage 4 blocks the thread for 300ms and the 10ms timer fires at 300ms.

## The thread pool

"Single threaded" describes *your JavaScript*, not the process. libuv keeps a
pool of 4 threads by default (`UV_THREADPOOL_SIZE`) used by:

- `fs` operations
- DNS lookups via `dns.lookup`
- `zlib` and `crypto` (`pbkdf2`, `randomBytes`, …)

Network I/O does **not** use the pool — it uses the OS event notification
mechanism (epoll / kqueue / IOCP) directly, which is why Node scales to many
sockets so well.

Stage 5 of the demo fires 20 concurrent file reads and they finish in about the
time one read takes.

## What this means for the server in this repo

Three concrete consequences you can see in the code:

**1. Never use the `*Sync` fs functions in a request path.**
[`note-store.js`](../src/lib/note-store.js) uses `node:fs/promises` throughout.
A `readFileSync` in a handler would stall every other in-flight request for the
duration of the read.

**2. Stream large responses instead of buffering them.**
[`static.js`](../src/lib/static.js) uses `createReadStream` piped to the
response. `readFile` would hold the entire file in memory and delay the first
byte until the last one is read.

**3. `await` yields, so shared state needs guarding.**
Node runs one line of JS at a time, but that does not make a read-modify-write
cycle atomic — the `await` in the middle is a yield point where another request
can run. Two overlapping `POST /api/notes` calls would each read the same
snapshot of the file and the second write would silently discard the first.
`NoteStore` serialises every mutation onto a promise chain to close that
window; `test/note-store.test.js` fires 40 concurrent creates and asserts all
40 survive.

## Rules of thumb

| Situation | Do this |
| --- | --- |
| Slow I/O | Use the async API. It is free concurrency. |
| CPU-heavy work (>10ms) | `worker_threads`, a child process, or a queue. |
| "Run this right after the current function" | `queueMicrotask` or `await null`. |
| "Run this after the current I/O phase" | `setImmediate`. |
| "Run this before anything else" | `process.nextTick` — and think twice. |
| Reading a whole file to send it | Stream it instead. |

## Further reading

- [The Node.js event loop](https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick) (official guide)
- [libuv design overview](https://docs.libuv.org/en/v1.x/design.html)
