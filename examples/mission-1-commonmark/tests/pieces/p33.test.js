const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p33.js');
const fixtures = require('../fixtures.js');

test("p33 Ordered list start number", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p33.js');
  for (const row of fixtures["p33"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
