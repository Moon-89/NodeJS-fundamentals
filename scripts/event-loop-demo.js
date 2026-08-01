'use strict';

/**
 * A runnable companion to docs/EVENT-LOOP.md.
 *
 *   npm run demo:event-loop
 *
 * Each stage prints the order things actually happen in, so the explanation
 * in the docs is something you can verify rather than take on faith.
 */

const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const log = (msg) => console.log(`    ${msg}`);
const heading = (n, title) => console.log(`\n${n}. ${title}\n${'-'.repeat(60)}`);

/* ------------------------------------------------------------------ *
 * Stage 1: what runs before the loop ever turns
 * ------------------------------------------------------------------ */
function stageOne() {
  return new Promise((done) => {
    heading(1, 'Synchronous code, then nextTick, then microtasks');

    log('a. synchronous line');

    setTimeout(() => log('e. setTimeout 0  <- first turn of the loop'), 0);

    Promise.resolve().then(() => log('d. promise microtask'));

    // nextTick is NOT part of the event loop. Its queue is drained after the
    // current operation finishes, ahead of promise microtasks.
    process.nextTick(() => log('c. process.nextTick'));

    log('b. synchronous line');

    setTimeout(done, 10);
  });
}

/* ------------------------------------------------------------------ *
 * Stage 2: the famous non-deterministic pair
 * ------------------------------------------------------------------ */
function stageTwo() {
  heading(2, 'setTimeout(0) vs setImmediate from the main module');
  log('Scheduled at module scope the order is genuinely NOT guaranteed: it');
  log('depends on how long the process took to boot. We cannot show that from');
  log('inside this file -- by now we are already inside a callback -- so we');
  log('sample eight fresh processes instead.');

  const source =
    "setTimeout(()=>process.stdout.write('timeout'),0);" +
    "setImmediate(()=>process.stdout.write('immediate'));";

  const results = Array.from({ length: 8 }, () =>
    execFileSync(process.execPath, ['-e', source], { encoding: 'utf8' }).trim(),
  );

  const timeoutFirst = results.filter((r) => r === 'timeout').length;
  log('');
  log(`ran first: setTimeout ${timeoutFirst}/8, setImmediate ${8 - timeoutFirst}/8`);
  log(timeoutFirst > 0 && timeoutFirst < 8 ? 'A coin flip, as advertised.' : 'This machine is consistent today -- it still is not guaranteed.');

  return Promise.resolve();
}

/* ------------------------------------------------------------------ *
 * Stage 3: the same pair, inside an I/O callback -- now deterministic
 * ------------------------------------------------------------------ */
function stageThree() {
  return new Promise((done) => {
    heading(3, 'The same pair, but scheduled from inside an I/O callback');

    fs.readFile(__filename, () => {
      // We are now in the POLL phase. CHECK comes immediately after poll, but
      // TIMERS is a whole lap away -- so setImmediate always wins here.
      setTimeout(() => log('2nd: setTimeout 0   [timers -- next lap]'), 0);
      setImmediate(() => log('1st: setImmediate   [check -- this lap]'));
      setTimeout(done, 20);
    });
  });
}

/* ------------------------------------------------------------------ *
 * Stage 4: one thread, so blocking it delays everything
 * ------------------------------------------------------------------ */
function stageFour() {
  return new Promise((done) => {
    heading(4, 'Blocking the loop delays every pending callback');

    const start = Date.now();
    setTimeout(() => {
      log(`timer asked for 10ms, actually fired after ${Date.now() - start}ms`);
      log('setTimeout is a floor, not a promise -- the callback cannot run');
      log('until the loop reaches the timers phase and JS is free.');
      done();
    }, 10);

    const busyUntil = Date.now() + 300;
    while (Date.now() < busyUntil) {
      /* deliberately hogging the only JS thread for 300ms */
    }
    log('finished a 300ms synchronous block');
  });
}

/* ------------------------------------------------------------------ *
 * Stage 5: async I/O is handed off, so it overlaps
 * ------------------------------------------------------------------ */
function stageFive() {
  heading(5, 'Async I/O runs off-thread, so N reads cost ~1 read');

  const start = Date.now();
  const reads = Array.from({ length: 20 }, () => fs.promises.readFile(__filename));

  return Promise.all(reads).then(() => {
    log(`20 concurrent file reads finished in ${Date.now() - start}ms`);
    log('libuv ran them on its thread pool; our thread stayed free the whole time.');
  });
}

async function main() {
  console.log('\n=== Node.js event loop, observed ===');
  await stageOne();
  await stageTwo();
  await stageThree();
  await stageFour();
  await stageFive();
  console.log('\nSee docs/EVENT-LOOP.md for the why behind each stage.\n');
}

main();
