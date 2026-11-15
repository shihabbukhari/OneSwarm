const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p35.js');
const fixtures = require('../fixtures.js');

test("p35 Two ordered items", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p35.js');
  for (const row of fixtures["p35"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
