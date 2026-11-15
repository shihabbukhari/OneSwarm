const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p19.js');
const fixtures = require('../fixtures.js');

test("p19 Indented code block", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p19.js');
  for (const row of fixtures["p19"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
