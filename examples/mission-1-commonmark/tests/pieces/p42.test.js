const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p42.js');
const fixtures = require('../fixtures.js');

test("p42 Inline link", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p42.js');
  for (const row of fixtures["p42"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
