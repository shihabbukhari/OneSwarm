const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p08.js');
const fixtures = require('../fixtures.js');

test("p08 ATX heading level 5", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p08.js');
  for (const row of fixtures["p08"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
