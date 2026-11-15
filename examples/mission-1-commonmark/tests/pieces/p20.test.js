const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p20.js');
const fixtures = require('../fixtures.js');

test("p20 Fenced code with backticks", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p20.js');
  for (const row of fixtures["p20"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
