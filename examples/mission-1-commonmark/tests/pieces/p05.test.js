const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p05.js');
const fixtures = require('../fixtures.js');

test("p05 ATX heading level 2", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p05.js');
  for (const row of fixtures["p05"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
