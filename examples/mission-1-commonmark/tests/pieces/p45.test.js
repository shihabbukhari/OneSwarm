const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p45.js');
const fixtures = require('../fixtures.js');

test("p45 Image", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p45.js');
  for (const row of fixtures["p45"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
