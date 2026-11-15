const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p51.js');
const fixtures = require('../fixtures.js');

test("p51 Escape quotes", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p51.js');
  for (const row of fixtures["p51"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
