const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p46.js');
const fixtures = require('../fixtures.js');

test("p46 Image with a title", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p46.js');
  for (const row of fixtures["p46"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
