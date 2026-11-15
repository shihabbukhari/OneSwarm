const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p28.js');
const fixtures = require('../fixtures.js');

test("p28 Dash list", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p28.js');
  for (const row of fixtures["p28"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
