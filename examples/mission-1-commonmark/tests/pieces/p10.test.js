const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p10.js');
const fixtures = require('../fixtures.js');

test("p10 ATX heading with a closing hash", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p10.js');
  for (const row of fixtures["p10"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
