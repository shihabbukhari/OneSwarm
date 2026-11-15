const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p17.js');
const fixtures = require('../fixtures.js');

test("p17 Spaced thematic break", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p17.js');
  for (const row of fixtures["p17"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
