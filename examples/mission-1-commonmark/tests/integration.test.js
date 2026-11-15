const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { markdownToHtml } = require('../src/index.js');
const fixtures = require('./fixtures.js');

test('pieces that already passed still render', () => {
  for (const [id, cases] of Object.entries(fixtures)) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'pieces', id + '.js'), 'utf8');
    if (/exports\.STUB\s*=\s*true/.test(source)) continue;
    for (const row of cases) {
      assert.equal(markdownToHtml(row.in), row.out, id);
    }
  }
});
