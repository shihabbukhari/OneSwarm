const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p27.js');
const fixtures = require('../fixtures.js');

test("p27 Multi-line block quote", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p27.js');
  for (const row of fixtures["p27"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
