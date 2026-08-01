'use strict';

/**
 * A ~60 line router. Express does far more, but the core idea is exactly this:
 * keep a list of {method, pattern, handler} and find the first match.
 */
class Router {
  #routes = [];

  add(method, pattern, handler) {
    const { keys, regex } = compile(pattern);
    this.#routes.push({ method: method.toUpperCase(), pattern, keys, regex, handler });
    return this;
  }

  get(pattern, handler) {
    return this.add('GET', pattern, handler);
  }
  post(pattern, handler) {
    return this.add('POST', pattern, handler);
  }
  put(pattern, handler) {
    return this.add('PUT', pattern, handler);
  }
  patch(pattern, handler) {
    return this.add('PATCH', pattern, handler);
  }
  delete(pattern, handler) {
    return this.add('DELETE', pattern, handler);
  }

  /**
   * @returns {{handler: Function, params: object}}   on a hit
   *        | {allowed: string[]}                     path exists, wrong method
   *        | null                                    no such path
   */
  match(method, pathname) {
    const allowed = new Set();

    for (const route of this.#routes) {
      const captured = route.regex.exec(pathname);
      if (!captured) continue;

      allowed.add(route.method);
      if (route.method === 'GET') allowed.add('HEAD');

      // A HEAD request is a GET that stops before the body.
      const methodMatches = route.method === method || (method === 'HEAD' && route.method === 'GET');
      if (!methodMatches) continue;

      const params = {};
      route.keys.forEach((key, i) => {
        params[key] = captured[i + 1];
      });
      return { handler: route.handler, params };
    }

    return allowed.size > 0 ? { allowed: [...allowed].sort() } : null;
  }
}

/** Turn '/api/notes/:id' into /^\/api\/notes\/([^/]+)\/?$/ plus the key list. */
function compile(pattern) {
  const keys = [];
  const source = pattern
    .split('/')
    .map((segment) => {
      if (!segment.startsWith(':')) return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      keys.push(segment.slice(1));
      return '([^/]+)';
    })
    .join('/');
  return { keys, regex: new RegExp(`^${source}/?$`) };
}

module.exports = Router;
