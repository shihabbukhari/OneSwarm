const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p50.js');
const fixtures = require('../fixtures.js');

test("p50 Escape ampersands", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p50.js');
  for (const row of fixtures["p50"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
