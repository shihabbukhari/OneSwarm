const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p55.js');
const fixtures = require('../fixtures.js');

test("p55 Emphasis inside a list item", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p55.js');
  for (const row of fixtures["p55"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
