const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p09.js');
const fixtures = require('../fixtures.js');

test("p09 ATX heading level 6", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p09.js');
  for (const row of fixtures["p09"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
