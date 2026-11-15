const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p24.js');
const fixtures = require('../fixtures.js');

test("p24 Code fence keeps stars", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p24.js');
  for (const row of fixtures["p24"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
