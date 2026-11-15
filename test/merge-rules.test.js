import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_PROTECTED } from '../src/constants.js';
import { globMatch, reviewDiff } from '../src/merge-rules.js';

test('protected globs cover checker, tests, and workflows', () => {
  assert.equal(globMatch('.github/**', '.github/workflows/check.yml'), true);
  assert.equal(globMatch('tests/**', 'tests/pieces/p01.test.js'), true);
  assert.equal(globMatch('checker/**', 'checker/check.js'), true);
  assert.equal(globMatch('src/index.js', 'src/index.js'), true);
  assert.equal(globMatch('src/index.js', 'src/index.js.bak'), false);
});

test('a diff that edits tests is rejected', () => {
  const result = reviewDiff({
    files: [
      { filename: 'src/pieces/p01.js', status: 'modified' },
      { filename: 'tests/fixtures.js', status: 'modified' },
    ],
    protectedPatterns: DEFAULT_PROTECTED,
    allowedPaths: ['src/pieces/p01.js'],
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'protected');
});

test('a diff that edits a workflow is rejected', () => {
  const result = reviewDiff({
    files: [{ filename: '.github/workflows/check.yml', status: 'modified' }],
    protectedPatterns: DEFAULT_PROTECTED,
    allowedPaths: ['src/pieces/p01.js'],
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'protected');
});

test('a renamed protected file is rejected', () => {
  const result = reviewDiff({
    files: [{ filename: 'src/pieces/p01.js', previous_filename: 'tests/old.js', status: 'renamed' }],
    protectedPatterns: DEFAULT_PROTECTED,
    allowedPaths: ['src/pieces/p01.js'],
  });
  assert.equal(result.ok, false);
});

test('a piece file by itself can merge', () => {
  const result = reviewDiff({
    files: [{ filename: 'src/pieces/p01.js', status: 'modified' }],
    protectedPatterns: DEFAULT_PROTECTED,
    allowedPaths: ['src/pieces/p01.js'],
  });
  assert.equal(result.ok, true);
});
