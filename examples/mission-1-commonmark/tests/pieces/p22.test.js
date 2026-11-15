const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p22.js');
const fixtures = require('../fixtures.js');

test("p22 Fenced code with a language", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p22.js');
  for (const row of fixtures["p22"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
