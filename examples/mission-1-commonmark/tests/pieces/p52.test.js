const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p52.js');
const fixtures = require('../fixtures.js');

test("p52 Hard line break", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p52.js');
  for (const row of fixtures["p52"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
