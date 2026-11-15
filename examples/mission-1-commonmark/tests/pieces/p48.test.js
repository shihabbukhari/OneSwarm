const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p48.js');
const fixtures = require('../fixtures.js');

test("p48 Backslash escape", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p48.js');
  for (const row of fixtures["p48"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
