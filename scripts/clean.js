'use strict';

/**
 * Remove generated files (working data + logs). Run with: npm run clean
 */

const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const TARGETS = [path.join(ROOT, 'data', 'notes.json'), path.join(ROOT, 'logs')];

async function main() {
  for (const target of TARGETS) {
    try {
      await fs.rm(target, { recursive: true, force: true, maxRetries: 5 });
      console.log(`removed ${path.relative(ROOT, target)}`);
    } catch (err) {
      console.error(`could not remove ${target}: ${err.message}`);
    }
  }
}

main();
