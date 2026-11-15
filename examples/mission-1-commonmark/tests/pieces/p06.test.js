const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p06.js');
const fixtures = require('../fixtures.js');

test("p06 ATX heading level 3", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p06.js');
  for (const row of fixtures["p06"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
