'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const NoteStore = require('../src/lib/note-store');

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'note-store-'));
  const file = path.join(dir, 'nested', 'notes.json');
  // maxRetries: Windows can hold a handle open for a moment after the last
  // write, which surfaces as ENOTEMPTY when removing the directory.
  const cleanup = () => fs.rm(dir, { recursive: true, force: true, maxRetries: 5 });
  return { store: new NoteStore(file), file, cleanup };
}

test('NoteStore', async (t) => {
  await t.test('reading a file that does not exist yields an empty list', async () => {
    const { store, cleanup } = await tempStore();
    t.after(cleanup);
    assert.deepEqual(await store.list(), []);
  });

  await t.test('creates the parent directory on first write', async () => {
    const { store, file, cleanup } = await tempStore();
    t.after(cleanup);
    await store.create({ title: 'first' });
    const onDisk = JSON.parse(await fs.readFile(file, 'utf8'));
    assert.equal(onDisk.length, 1);
  });

  await t.test('concurrent writes do not clobber each other', async () => {
    const { store, cleanup } = await tempStore();
    t.after(cleanup);

    // Without the serialising queue in NoteStore, most of these would be lost:
    // every call would read the same snapshot and the last write would win.
    await Promise.all(
      Array.from({ length: 40 }, (_, i) => store.create({ title: `note ${i}` })),
    );

    const notes = await store.list();
    assert.equal(notes.length, 40);
    assert.equal(new Set(notes.map((n) => n.id)).size, 40, 'ids are unique');
  });

  await t.test('a failed write does not wedge the queue', async () => {
    const { store, cleanup } = await tempStore();
    t.after(cleanup);

    await assert.rejects(() => store.remove('nope'), /No note with id/);
    const note = await store.create({ title: 'still works' });
    assert.equal(note.title, 'still works');
  });

  await t.test('leaves no .tmp file behind', async () => {
    const { store, file, cleanup } = await tempStore();
    t.after(cleanup);
    await store.create({ title: 'atomic' });
    await assert.rejects(() => fs.stat(`${file}.tmp`), { code: 'ENOENT' });
  });

  await t.test('surfaces a corrupt data file as a 500 rather than crashing', async () => {
    const { store, file, cleanup } = await tempStore();
    t.after(cleanup);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, '{ this is not json', 'utf8');

    await assert.rejects(() => store.list(), (err) => {
      assert.equal(err.status, 500);
      assert.match(err.message, /invalid JSON/);
      return true;
    });
  });

  await t.test('validation rejects bad input before touching the disk', async () => {
    const { store, file, cleanup } = await tempStore();
    t.after(cleanup);

    await assert.rejects(() => store.create({ title: '   ' }), (err) => err.status === 422);
    await assert.rejects(() => store.create({ title: 'ok', tags: 'nope' }), (err) => err.status === 422);
    await assert.rejects(() => store.create({ title: 'x'.repeat(200) }), (err) => err.status === 422);
    await assert.rejects(() => fs.stat(file), { code: 'ENOENT' });
  });

  await t.test('update refuses an empty patch', async () => {
    const { store, cleanup } = await tempStore();
    t.after(cleanup);
    const note = await store.create({ title: 'keep' });
    await assert.rejects(() => store.update(note.id, {}), (err) => err.status === 422);
  });

  await t.test('list sorts newest-updated first', async () => {
    const { store, cleanup } = await tempStore();
    t.after(cleanup);
    const a = await store.create({ title: 'older' });
    await new Promise((r) => setTimeout(r, 5));
    await store.create({ title: 'newer' });
    await new Promise((r) => setTimeout(r, 5));
    await store.update(a.id, { body: 'touched' });

    const [first] = await store.list();
    assert.equal(first.title, 'older', 'the just-updated note floats to the top');
  });
});
