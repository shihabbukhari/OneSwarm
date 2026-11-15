const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p54.js');
const fixtures = require('../fixtures.js');

test("p54 Emphasis inside a heading", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p54.js');
  for (const row of fixtures["p54"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
