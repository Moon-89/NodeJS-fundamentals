// Unit tests for the shared validation rules. No server, no filesystem —
// these run instantly and cover the edge cases the HTTP tests only sample.
//
// Run with: npm test

const test = require('node:test');
const assert = require('node:assert');

const { validateNote, isValidId, parseJsonBody, TITLE_MAX, BODY_MAX } = require('../src/validate');

test('a normal note passes and gets trimmed', () => {
  const result = validateNote({ title: '  Groceries  ', body: '  milk  ' });

  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.errors, []);
  assert.strictEqual(result.value.title, 'Groceries');
  assert.strictEqual(result.value.body, 'milk');
});

test('a missing body defaults to an empty string', () => {
  const result = validateNote({ title: 'Just a title' });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.value.body, '');
});

test('a missing title is rejected', () => {
  const result = validateNote({ body: 'no title here' });

  assert.strictEqual(result.ok, false);
  assert.match(result.errors[0], /title is required/);
});

test('a title of only spaces is rejected', () => {
  const result = validateNote({ title: '     ' });

  assert.strictEqual(result.ok, false);
  assert.match(result.errors[0], /cannot be empty/);
});

test('a non-string title is rejected', () => {
  for (const title of [42, true, null, {}, []]) {
    const result = validateNote({ title });
    assert.strictEqual(result.ok, false, `expected ${JSON.stringify(title)} to fail`);
  }
});

test('a title at the limit passes and one over it fails', () => {
  assert.strictEqual(validateNote({ title: 'a'.repeat(TITLE_MAX) }).ok, true);

  const tooLong = validateNote({ title: 'a'.repeat(TITLE_MAX + 1) });
  assert.strictEqual(tooLong.ok, false);
  assert.match(tooLong.errors[0], /100 characters or fewer/);
});

test('an over-long body is rejected', () => {
  const result = validateNote({ title: 'ok', body: 'a'.repeat(BODY_MAX + 1) });

  assert.strictEqual(result.ok, false);
  assert.match(result.errors[0], /2000 characters or fewer/);
});

test('a non-object body is rejected', () => {
  for (const data of [null, 'a string', 42, ['an', 'array']]) {
    const result = validateNote(data);
    assert.strictEqual(result.ok, false, `expected ${JSON.stringify(data)} to fail`);
    assert.match(result.errors[0], /JSON object/);
  }
});

test('several problems are all reported at once', () => {
  const result = validateNote({ title: '', body: 'a'.repeat(BODY_MAX + 1) });

  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.errors.length, 2);
});

// --- partial (PUT) mode ---

test('a partial update can send only a body', () => {
  const result = validateNote({ body: 'just the body' }, { partial: true });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.value.title, undefined);
  assert.strictEqual(result.value.body, 'just the body');
});

test('a partial update with no fields at all is rejected', () => {
  const result = validateNote({}, { partial: true });

  assert.strictEqual(result.ok, false);
  assert.match(result.errors[0], /at least one of/);
});

test('a partial update still validates the field it does send', () => {
  const result = validateNote({ title: '   ' }, { partial: true });

  assert.strictEqual(result.ok, false);
  assert.match(result.errors[0], /cannot be empty/);
});

// --- ids ---

test('only digit strings are valid ids', () => {
  assert.strictEqual(isValidId('1786417346071'), true);
  assert.strictEqual(isValidId('1'), true);

  for (const bad of ['', 'abc', '12a', '../../etc/passwd', '1.5', '-1', null, undefined, 42]) {
    assert.strictEqual(isValidId(bad), false, `expected ${JSON.stringify(bad)} to be invalid`);
  }
});

// --- body parsing ---

test('parseJsonBody explains why it failed', () => {
  assert.strictEqual(parseJsonBody('{"a":1}').ok, true);

  assert.match(parseJsonBody('').errors[0], /empty/);
  assert.match(parseJsonBody('   ').errors[0], /empty/);
  assert.match(parseJsonBody('{not json}').errors[0], /valid JSON/);
});
