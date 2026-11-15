const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p23.js');
const fixtures = require('../fixtures.js');

test("p23 Escape HTML in a code fence", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p23.js');
  for (const row of fixtures["p23"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
