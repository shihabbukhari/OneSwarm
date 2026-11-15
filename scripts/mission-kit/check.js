// OneSwarm checker. Usage: node checker/check.js --piece p01 [--seed 123]
//
// Why it is built this way:
// 1. Submitted code never runs in this process. checker/harness.js runs it in Node's
//    permission sandbox, so it cannot read tests/, patch the comparison, or start processes.
// 2. Every fixture is also tested with fresh random words, so a piece that hard-codes the
//    public answers fails. Only code that does the real work passes.
// 3. Every piece that already passed is re-checked through src/index.js, so a new piece
//    cannot break old ones.
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function argument(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? '' : process.argv[index + 1] || '';
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const pieceId = argument('--piece');
if (!/^p\d+$/.test(pieceId)) {
  console.error('Usage: node checker/check.js --piece p01');
  process.exit(2);
}
const root = path.resolve(argument('--root') || process.cwd());
const seed = Number(argument('--seed')) || crypto.randomInt(1, 2 ** 31 - 1);
const fixtures = require(path.join(root, 'tests', 'fixtures.js'));
if (!fixtures[pieceId]) fail(`${pieceId} is not a piece in this mission.`);

function isStub(id) {
  const file = path.join(root, 'src', 'pieces', `${id}.js`);
  if (!fs.existsSync(file)) return true;
  return /exports\.STUB\s*=\s*true/.test(fs.readFileSync(file, 'utf8'));
}
if (isStub(pieceId)) fail(`src/pieces/${pieceId}.js is still a stub. Remove exports.STUB = true.`);

let state = seed;
function random() {
  state = (state * 48271) % 2147483647;
  return state / 2147483647;
}
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const RESERVED = new Set(['amp', 'lt', 'gt', 'quot', 'http', 'https']);
function randomWord(original) {
  let word = '';
  const length = 3 + Math.floor(random() * 5);
  for (let i = 0; i < length; i += 1) word += LETTERS[Math.floor(random() * LETTERS.length)];
  if (/^[A-Z]/.test(original)) word = word[0].toUpperCase() + word.slice(1);
  return RESERVED.has(word.toLowerCase()) ? randomWord(original) : word;
}
const wordPattern = (word) => new RegExp(`(?<![A-Za-z])${word}(?![A-Za-z])`, 'g');

// Swap plain-text words for random ones in both the input and the expected output.
// Words that appear inside HTML tags (tag names, URLs, languages) are left alone.
function variant(row) {
  const tags = (row.out.match(/<[^>]*>/g) || []).join(' ');
  const words = [...new Set(row.in.match(/[A-Za-z]{2,}/g) || [])].filter(
    (word) => !RESERVED.has(word.toLowerCase()) && !wordPattern(word).test(tags),
  );
  if (!words.length) return null;
  let input = row.in;
  const parts = row.out.split(/(<[^>]*>|&[a-z]+;)/);
  for (const word of words) {
    const next = randomWord(word);
    input = input.replace(wordPattern(word), next);
    for (let i = 0; i < parts.length; i += 2) parts[i] = parts[i].replace(wordPattern(word), next);
  }
  return { in: input, out: parts.join('') };
}
function expand(rows, count) {
  const out = [...rows];
  for (const row of rows) {
    for (let i = 0; i < count; i += 1) {
      const extra = variant(row);
      if (extra) out.push(extra);
    }
  }
  return out;
}

const own = expand(fixtures[pieceId], 4);
const passed = Object.keys(fixtures).filter((id) => !isStub(id));
const everyone = passed.flatMap((id) => expand(fixtures[id], 2).map((row) => ({ ...row, id })));

const marker = `ONESWARM_RESULT_${crypto.randomBytes(12).toString('hex')}:`;
const env = { PATH: process.env.PATH || '' };
const child = spawnSync(
  process.execPath,
  [
    '--permission',
    `--allow-fs-read=${path.join(root, 'src')}${path.sep}`,
    `--allow-fs-read=${path.join(root, 'checker', 'harness.js')}`,
    path.join(root, 'checker', 'harness.js'),
  ],
  {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: 20000,
    maxBuffer: 16 * 1024 * 1024,
    input: JSON.stringify({ piece: pieceId, marker, direct: own.map((r) => r.in), dispatched: everyone.map((r) => r.in) }),
  },
);
const line = String(child.stdout || '').split('\n').reverse().find((text) => text.startsWith(marker));
if (child.error || !line) {
  fail(`The piece code did not finish normally (seed ${seed}).\n${String(child.stderr || child.error || '').slice(-1500)}`);
}
const results = JSON.parse(line.slice(marker.length));
if (results.loadError) fail(`Could not load the piece: ${results.loadError}`);

const problems = [];
function compare(rows, got, label) {
  rows.forEach((row, index) => {
    const result = got[index] || {};
    if (result.value !== row.out) {
      problems.push(
        `${label}${row.id ? ` ${row.id}` : ''}\n  input:    ${JSON.stringify(row.in)}\n  expected: ${JSON.stringify(row.out)}\n  got:      ${result.error ? `error: ${result.error}` : JSON.stringify(result.value)}`,
      );
    }
  });
}
compare(own, results.direct, `${pieceId} render()`);
compare(everyone, results.dispatched, 'markdownToHtml() for');

if (problems.length) {
  console.error(`${problems.length} case(s) failed (seed ${seed}). First failures:\n\n${problems.slice(0, 6).join('\n\n')}`);
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, piece: pieceId, cases: own.length + everyone.length, seed }));
