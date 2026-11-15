const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p41.js');
const fixtures = require('../fixtures.js');

test("p41 Inline code with a longer fence", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p41.js');
  for (const row of fixtures["p41"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
