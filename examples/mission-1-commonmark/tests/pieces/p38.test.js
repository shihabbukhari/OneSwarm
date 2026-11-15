const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p38.js');
const fixtures = require('../fixtures.js');

test("p38 Strong emphasis with stars", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p38.js');
  for (const row of fixtures["p38"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
