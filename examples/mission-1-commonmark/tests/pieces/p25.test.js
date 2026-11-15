const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p25.js');
const fixtures = require('../fixtures.js');

test("p25 Block quote", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p25.js');
  for (const row of fixtures["p25"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
