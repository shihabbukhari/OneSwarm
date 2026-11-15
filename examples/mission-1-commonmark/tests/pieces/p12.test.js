const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p12.js');
const fixtures = require('../fixtures.js');

test("p12 Setext heading level 1", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p12.js');
  for (const row of fixtures["p12"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
