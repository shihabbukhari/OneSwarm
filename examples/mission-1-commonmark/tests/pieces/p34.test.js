const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p34.js');
const fixtures = require('../fixtures.js');

test("p34 Two-digit ordered list", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p34.js');
  for (const row of fixtures["p34"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
