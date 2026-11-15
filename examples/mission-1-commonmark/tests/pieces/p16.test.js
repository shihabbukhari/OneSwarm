const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p16.js');
const fixtures = require('../fixtures.js');

test("p16 Thematic break of underscores", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p16.js');
  for (const row of fixtures["p16"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
