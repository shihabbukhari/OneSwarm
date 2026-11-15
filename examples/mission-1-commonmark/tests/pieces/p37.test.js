const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p37.js');
const fixtures = require('../fixtures.js');

test("p37 Emphasis with underscores", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p37.js');
  for (const row of fixtures["p37"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
