# npm, package.json and CommonJS modules

Notes on the two bits of Node plumbing that are easy to use for months without
ever really looking at.

## package.json, field by field

This project's manifest, annotated:

| Field | Why it is there |
| --- | --- |
| `name`, `version` | Identity. Required before you could ever `npm publish`. |
| `private: true` | A guard rail — npm refuses to publish this package. |
| `description`, `keywords`, `author`, `license` | Metadata for humans and the registry. |
| `main` | The entry point `require('node-fundamentals-http-server')` would resolve to. |
| `type: "commonjs"` | `.js` files are CommonJS. Set `"module"` and the same files become ESM. |
| `engines` | Declares the Node versions this is known to work on. |
| `scripts` | Named commands, below. |

There are no `dependencies` or `devDependencies` here, and no
`node_modules/` — everything comes from Node's standard library. That is
unusual for a real project and completely deliberate for this one.

## The scripts

```bash
npm start                 # node src/server.js
npm run dev               # same, with --watch to restart on file changes
npm test                  # node --test "test/**/*.test.js"
npm run seed              # reset data/notes.json from data/notes.seed.json
npm run demo:event-loop   # the annotated event-loop walkthrough
npm run clean             # delete generated data and logs
```

Three things worth knowing about npm scripts:

**`start` and `test` are special.** They have shorthands — `npm start`,
`npm test`. Everything else needs `npm run <name>`.

**`node_modules/.bin` is on the PATH inside a script.** That is why real
projects write `"test": "jest"` rather than
`"test": "./node_modules/.bin/jest"`. This project has no binaries to reach,
but the mechanism is the same.

**Arguments pass through after `--`.** `npm test -- --test-name-pattern=Router`
forwards those flags to `node --test`.

**Pre/post hooks run automatically.** A script named `pretest` runs before
`test`, and `posttest` after it — no wiring required.

## package-lock.json

`package.json` records what you *asked for* (`"express": "^4.18.0"` — any 4.x).
`package-lock.json` records what you actually *got*, down to the exact version
and integrity hash of every transitive dependency.

Commit the lockfile. Use `npm ci` in CI: it installs strictly from the lockfile
and fails loudly if the two files disagree, where `npm install` would quietly
update things.

This repo has no lockfile because it has no dependencies to lock.

## Semantic versioning ranges

For `1.2.3`:

| Range | Means | Matches |
| --- | --- | --- |
| `1.2.3` | exactly this | `1.2.3` |
| `~1.2.3` | patch updates | `>=1.2.3 <1.3.0` |
| `^1.2.3` | minor + patch (npm's default) | `>=1.2.3 <2.0.0` |
| `*` | anything | please don't |

`^0.2.3` is the exception: below 1.0.0, `^` only allows patch updates, because
0.x minor bumps are allowed to break things.

## CommonJS, concretely

Every `.js` file in this project is a CommonJS module. Node wraps each one in a
function before running it:

```js
(function (exports, require, module, __filename, __dirname) {
  // your file's code lives here
});
```

Which explains a few things that otherwise look like magic:

- `require`, `module`, `__dirname` are not globals — they are parameters.
- Top-level `const` in a module is not global; it is function-scoped to
  the wrapper. Modules do not leak variables into each other.
- `this` at the top level of a CommonJS module is `module.exports`, not
  `globalThis`.

### require() caches

A module body executes **once**. Every later `require()` of the same resolved
path returns the same `module.exports` object.

```js
// src/lib/logger.js exports a class
const Logger = require('./lib/logger');   // file runs, result cached
const Again  = require('./lib/logger');   // cache hit, no re-execution
Logger === Again;                          // true
```

That is what makes a module a natural singleton — and why a module that mutates
its own state on import can surprise you.

### exports vs module.exports

`exports` starts out as an alias for `module.exports`. Adding properties to it
works; **reassigning it does not**, because you have only rebound the local
parameter.

```js
exports.foo = 1;            // works
module.exports = MyClass;   // works
exports = MyClass;          // silently does nothing
```

This project uses `module.exports = X` for single-export files
([`router.js`](../src/router.js), [`logger.js`](../src/lib/logger.js)) and
`module.exports = { a, b }` for multi-export ones
([`respond.js`](../src/lib/respond.js)).

### How require() resolves a path

1. Starts with `node:`? → built-in module, done.
2. Starts with `./` or `../` or `/`? → a file path. Node tries the exact name,
   then `.js`, `.json`, `.node`; if it is a directory, its `package.json`
   `main`, then `index.js`.
3. Anything else → walk up from the current directory looking in each
   `node_modules/`, all the way to the filesystem root.

That last step is why a missing dependency reports every directory it searched.

### CommonJS vs ESM in one table

| | CommonJS | ESM |
| --- | --- | --- |
| Import | `require()` | `import` |
| Export | `module.exports` | `export` |
| Timing | runtime, synchronous | parsed before execution |
| Dynamic import | `require(someVar)` works | `await import(someVar)` |
| Top-level await | no | yes |
| File extension | `.js` (with `"type": "commonjs"`) or `.cjs` | `.js` (with `"type": "module"`) or `.mjs` |
| `__dirname` | available | use `import.meta.dirname` |

This project uses CommonJS because the fundamentals videos do. New projects
generally start with ESM.
