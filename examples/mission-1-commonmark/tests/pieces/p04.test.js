const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p04.js');
const fixtures = require('../fixtures.js');

test("p04 ATX heading level 1", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p04.js');
  for (const row of fixtures["p04"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
