'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');

/**
 * An access logger built on EventEmitter.
 *
 * The server never calls "write a log line" directly -- it emits an event and
 * walks away. Whoever cares can subscribe. That decoupling is the whole point
 * of the events module, and it is the same pattern Node itself uses for
 * sockets, streams and the HTTP server.
 *
 * One sharp edge worth knowing: 'error' is a special event name. If an
 * EventEmitter emits 'error' with no listener attached, Node throws and
 * crashes the process. This class always attaches one in the constructor.
 */
class Logger extends EventEmitter {
  #stream = null;

  /**
   * @param {object}  [options]
   * @param {string}  [options.file]   append access lines to this file
   * @param {boolean} [options.silent] suppress console output (used by tests)
   */
  constructor({ file, silent = false } = {}) {
    super();
    this.silent = silent;

    if (file) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      // A write stream keeps one file handle open and buffers for us, instead
      // of paying for an open/write/close cycle on every single request.
      this.#stream = fs.createWriteStream(file, { flags: 'a' });
      this.#stream.on('error', (err) => {
        if (!this.silent) console.error(`[logger] could not write log file: ${err.message}`);
      });
    }

    this.on('request', (entry) => this.#handleRequest(entry));
    this.on('error', (err) => this.#handleError(err));
  }

  #handleRequest({ method, url, status, durationMs }) {
    const line = `${new Date().toISOString()} ${method} ${url} ${status} ${durationMs.toFixed(1)}ms`;
    if (!this.silent) console.log(line);
    this.#stream?.write(line + '\n');
  }

  #handleError(err) {
    const line = `${new Date().toISOString()} ERROR ${err.stack || err.message}`;
    if (!this.silent) console.error(line);
    this.#stream?.write(line + '\n');
  }

  /** Flush and release the log file handle. */
  close() {
    return new Promise((resolve) => {
      if (!this.#stream) return resolve();
      this.#stream.end(resolve);
    });
  }
}

module.exports = Logger;
