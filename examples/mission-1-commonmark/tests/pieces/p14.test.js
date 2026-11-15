const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p14.js');
const fixtures = require('../fixtures.js');

test("p14 Thematic break of stars", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p14.js');
  for (const row of fixtures["p14"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
