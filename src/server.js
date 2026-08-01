'use strict';

const http = require('node:http');
const path = require('node:path');

const createApp = require('./app');
const Logger = require('./lib/logger');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '127.0.0.1';

const logger = new Logger({ file: path.join(ROOT, 'logs', 'access.log') });

const app = createApp({
  dataFile: process.env.DATA_FILE ?? path.join(ROOT, 'data', 'notes.json'),
  publicDir: path.join(ROOT, 'public'),
  logger,
});

// http.createServer returns an EventEmitter. Passing a function is shorthand
// for server.on('request', fn) -- there is no framework in between.
const server = http.createServer(app);

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Try: PORT=3001 npm start`);
    process.exit(1);
  }
  logger.emit('error', err);
});

server.listen(PORT, HOST, () => {
  const { address, port } = server.address();
  console.log(`\n  Notes server running on http://${address}:${port}`);
  // Plain ASCII on purpose: the default Windows console codepage mangles
  // anything fancier.
  console.log(`  Node ${process.version} | pid ${process.pid}`);
  console.log('  Press Ctrl+C to stop\n');
});

/**
 * Graceful shutdown: stop accepting new connections, let in-flight requests
 * finish, flush the log file, then exit. Killing the process outright can
 * truncate a response or a log write mid-flight.
 */
let shuttingDown = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n${signal} received, shutting down...`);

    server.close(async () => {
      await logger.close();
      console.log('Closed cleanly.');
      process.exit(0);
    });
    server.closeIdleConnections();

    // Backstop: if something refuses to let go, leave anyway.
    // unref() keeps this timer from holding the process open on its own.
    setTimeout(() => {
      console.error('Forcing exit after 5s.');
      process.exit(1);
    }, 5000).unref();
  });
}

process.on('unhandledRejection', (reason) => {
  logger.emit('error', reason instanceof Error ? reason : new Error(String(reason)));
});

module.exports = server;
