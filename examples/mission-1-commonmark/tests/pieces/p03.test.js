const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p03.js');
const fixtures = require('../fixtures.js');

test("p03 Two paragraphs", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p03.js');
  for (const row of fixtures["p03"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
