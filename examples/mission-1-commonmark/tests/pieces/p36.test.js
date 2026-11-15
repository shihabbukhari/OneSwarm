const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p36.js');
const fixtures = require('../fixtures.js');

test("p36 Emphasis with stars", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p36.js');
  for (const row of fixtures["p36"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
