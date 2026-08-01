'use strict';

/**
 * Copy the committed seed data over the working data file.
 * Run with: npm run seed
 */

const fs = require('node:fs/promises');
const path = require('node:path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SEED = path.join(DATA_DIR, 'notes.seed.json');
const TARGET = process.env.DATA_FILE ?? path.join(DATA_DIR, 'notes.json');

async function main() {
  const raw = await fs.readFile(SEED, 'utf8');
  const notes = JSON.parse(raw); // parse first so we never write invalid JSON

  await fs.mkdir(path.dirname(TARGET), { recursive: true });
  await fs.writeFile(TARGET, JSON.stringify(notes, null, 2) + '\n', 'utf8');

  console.log(`Seeded ${notes.length} notes into ${path.relative(process.cwd(), TARGET)}`);
}

main().catch((err) => {
  console.error(`Seed failed: ${err.message}`);
  process.exitCode = 1;
});
