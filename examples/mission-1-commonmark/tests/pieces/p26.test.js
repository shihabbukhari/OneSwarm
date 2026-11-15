const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p26.js');
const fixtures = require('../fixtures.js');

test("p26 Nested block quote", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p26.js');
  for (const row of fixtures["p26"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
