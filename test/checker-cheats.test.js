import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mission = path.join(root, 'examples', 'mission-1-commonmark');
const solutions = path.join(root, 'demo', 'solutions');

function check(pieceId, source) {
  const dir = mkdtempSync(path.join(tmpdir(), 'oneswarm-cheat-'));
  try {
    cpSync(mission, dir, { recursive: true });
    for (const id of ['p01', 'p02', 'p03', 'p04']) cpSync(path.join(solutions, `${id}.js`), path.join(dir, 'src', 'pieces', `${id}.js`));
    writeFileSync(path.join(dir, 'src', 'pieces', `${pieceId}.js`), source);
    const env = { PATH: process.env.PATH };
    return spawnSync(process.execPath, ['checker/check.js', '--piece', pieceId], { cwd: dir, env, encoding: 'utf8' }).status;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const cheats = {
  'patches the assert module': 'const a = require("node:assert/strict"); a.equal = () => {}; module.exports = { render: () => "", match: () => 0 };',
  'reads the answer key from tests/': 'const fx = require("../../tests/fixtures.js").p05; module.exports = { match: (s) => fx.some((r) => r.in === s) ? 50 : 0, render: (s) => fx.find((r) => r.in === s).out };',
  'exits the process early': 'process.exit(0);',
  'hard-codes the public answers': 'const t = { "## Section": "<h2>Section</h2>\\n" }; module.exports = { match: (s) => (s in t ? 50 : 0), render: (s) => t[s] };',
  'starts another process': 'require("child_process").execSync("true"); module.exports = {};',
};

for (const [name, source] of Object.entries(cheats)) {
  test(`the checker fails a piece that ${name}`, () => {
    assert.notEqual(check('p05', source), 0);
  });
}

test('the checker passes a real solution', () => {
  assert.equal(check('p05', readFileSync(path.join(solutions, 'p05.js'), 'utf8')), 0);
});
