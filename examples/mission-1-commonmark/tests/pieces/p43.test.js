const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p43.js');
const fixtures = require('../fixtures.js');

test("p43 Link with a title", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p43.js');
  for (const row of fixtures["p43"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
