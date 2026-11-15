const test = require('node:test');
const assert = require('node:assert/strict');
const piece = require('../../src/pieces/p02.js');
const fixtures = require('../fixtures.js');

test("p02 Paragraph", () => {
  assert.notEqual(piece.STUB, true, 'replace the stub in src/pieces/p02.js');
  for (const row of fixtures["p02"]) {
    assert.equal(piece.render(row.in), row.out);
  }
});
