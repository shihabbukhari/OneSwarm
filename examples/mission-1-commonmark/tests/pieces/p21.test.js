const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p21.js');
const fixtures = require('../fixtures.js');

test("p21 Fenced code with tildes", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p21.js');
  for (const row of fixtures["p21"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
