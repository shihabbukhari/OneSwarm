const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p53.js');
const fixtures = require('../fixtures.js');

test("p53 Soft line break", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p53.js');
  for (const row of fixtures["p53"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
