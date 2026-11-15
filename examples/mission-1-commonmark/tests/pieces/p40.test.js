const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p40.js');
const fixtures = require('../fixtures.js');

test("p40 Inline code", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p40.js');
  for (const row of fixtures["p40"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
