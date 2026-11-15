const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p15.js');
const fixtures = require('../fixtures.js');

test("p15 Thematic break of dashes", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p15.js');
  for (const row of fixtures["p15"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
