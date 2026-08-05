// Run this with: npm run demo
// I wrote this to actually see the order things run in, because reading
// about the event loop wasn't making it stick.

const fs = require('fs');

console.log('1. this runs first (normal synchronous code)');

setTimeout(() => {
  console.log('5. setTimeout callback (timers phase)');
}, 0);

setImmediate(() => {
  console.log('6. setImmediate callback (check phase, after timers)');
});

fs.readFile(__filename, () => {
  console.log('7. file read finished (poll phase - this one waited on the disk)');
});

Promise.resolve().then(() => {
  console.log('4. promise .then (microtask - runs before any timer)');
});

process.nextTick(() => {
  console.log('3. process.nextTick (jumps ahead of even promises)');
});

console.log('2. this also runs first, before any callback');

// What I learned from running this:
//
// - Lines 1 and 2 print immediately. All the callbacks have to wait for the
//   synchronous code to finish, because there is only one thread running JS.
//
// - nextTick goes before promises, and both go before any timer.
//   These are "microtasks" - Node drains them between phases.
//
// - setTimeout(0) is not really 0. It waits for the next timers phase.
//
// - setImmediate sounds like it should be first but it runs after timers,
//   because it belongs to the check phase which comes later in the loop.
//
// - The file read finishes last here because it actually had to go to disk,
//   and that happens off the main thread.
