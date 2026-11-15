const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p01.js');
const fixtures = require('../fixtures.js');

test("p01 Empty document", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p01.js');
  for (const row of fixtures["p01"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
