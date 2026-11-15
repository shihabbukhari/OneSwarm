const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p47.js');
const fixtures = require('../fixtures.js');

test("p47 Escape image alt text", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p47.js');
  for (const row of fixtures["p47"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
