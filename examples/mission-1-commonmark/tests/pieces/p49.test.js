const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p49.js');
const fixtures = require('../fixtures.js');

test("p49 Escape raw HTML", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p49.js');
  for (const row of fixtures["p49"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
