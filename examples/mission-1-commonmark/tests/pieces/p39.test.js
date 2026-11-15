const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p39.js');
const fixtures = require('../fixtures.js');

test("p39 Strong emphasis with underscores", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p39.js');
  for (const row of fixtures["p39"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
