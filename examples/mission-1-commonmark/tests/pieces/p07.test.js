const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p07.js');
const fixtures = require('../fixtures.js');

test("p07 ATX heading level 4", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p07.js');
  for (const row of fixtures["p07"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
