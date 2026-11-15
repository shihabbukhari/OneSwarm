const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p13.js');
const fixtures = require('../fixtures.js');

test("p13 Setext heading level 2", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p13.js');
  for (const row of fixtures["p13"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
