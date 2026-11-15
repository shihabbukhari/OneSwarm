const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p18.js');
const fixtures = require('../fixtures.js');

test("p18 Long thematic break", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p18.js');
  for (const row of fixtures["p18"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
