const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p31.js');
const fixtures = require('../fixtures.js');

test("p31 Two-item dash list", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p31.js');
  for (const row of fixtures["p31"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
