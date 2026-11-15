const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p11.js');
const fixtures = require('../fixtures.js');

test("p11 ATX h2 with closing hashes", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p11.js');
  for (const row of fixtures["p11"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
