const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p29.js');
const fixtures = require('../fixtures.js');

test("p29 Star list", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p29.js');
  for (const row of fixtures["p29"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
