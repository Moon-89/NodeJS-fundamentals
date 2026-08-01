'use strict';

/**
 * A plain Error carrying an HTTP status code, so any layer of the app can
 * throw and let the top-level request handler turn it into a response.
 */
class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    if (details) this.details = details;
  }
}

function httpError(status, message, details) {
  return new HttpError(status, message, details);
}

module.exports = { HttpError, httpError };
