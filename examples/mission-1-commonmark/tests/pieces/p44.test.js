const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p44.js');
const fixtures = require('../fixtures.js');

test("p44 Autolink", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p44.js');
  for (const row of fixtures["p44"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
