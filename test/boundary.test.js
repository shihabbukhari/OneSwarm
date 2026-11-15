import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');

function files(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...files(full));
    else if (entry.endsWith('.js')) found.push(full);
  }
  return found;
}

test('the server source does not spawn code or call a model API', () => {
  const source = files(src).map((file) => readFileSync(file, 'utf8')).join('\n');
  assert.equal(source.includes('child_process'), false);
  assert.equal(source.includes('node:child_process'), false);
  assert.equal(/sk-ant-|OPENAI_API_KEY|ANTHROPIC_API_KEY/i.test(source), false);
});
