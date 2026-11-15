const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p30.js');
const fixtures = require('../fixtures.js');

test("p30 Plus list", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p30.js');
  for (const row of fixtures["p30"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
