import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchTable } from './match-table.js';
import { rules } from './rules.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function functionBody(fn) {
  const text = fn.toString();
  return text.slice(text.indexOf('{') + 1, text.lastIndexOf('}')).trim();
}

function solutionSource(rule) {
  const [pattern, score] = matchTable[rule.id];
  return `const { escapeHtml } = require('../html.js');

exports.id = ${JSON.stringify(rule.id)};

exports.match = function match(markdown) {
  return ${pattern.toString()}.test(markdown) ? ${score} : 0;
};

exports.render = function render(markdown) {
${functionBody(rule.render)}
};
`;
}

function stubSource(rule) {
  return `// ${rule.id}: ${rule.title}. ${rule.blurb}
// Replace this stub. Remove the STUB line, make match() return a positive score for
// inputs this piece handles, and make render() return the HTML. Check it with:
//   node checker/check.js --piece ${rule.id}
exports.STUB = true;
exports.id = ${JSON.stringify(rule.id)};

exports.match = function match() {
  return 0;
};

exports.render = function render() {
  throw new Error('NOT_IMPLEMENTED');
};
`;
}

const htmlJs = `function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { escapeHtml };
`;

const indexJs = `const fs = require('fs');
const path = require('path');

function loadPieces() {
  const dir = path.join(__dirname, 'pieces');
  return fs
    .readdirSync(dir)
    .filter((name) => /^p\\d+\\.js$/.test(name))
    .sort()
    .map((name) => require(path.join(dir, name)));
}

function markdownToHtml(markdown) {
  const pieces = loadPieces().filter((piece) => piece && piece.STUB !== true && typeof piece.match === 'function');
  let bestScore = 0;
  const best = [];
  for (const piece of pieces) {
    const score = Number(piece.match(markdown)) || 0;
    if (score > bestScore) {
      bestScore = score;
      best.length = 0;
      best.push(piece);
    } else if (score === bestScore && score > 0) {
      best.push(piece);
    }
  }
  if (best.length !== 1) {
    const error = new Error('no unique piece for input');
    error.code = 'AMBIGUOUS';
    throw error;
  }
  return best[0].render(markdown);
}

module.exports = { markdownToHtml, loadPieces };
`;

const kitDir = path.join(root, 'scripts', 'mission-kit');
const checkerJs = readFileSync(path.join(kitDir, 'check.js'), 'utf8');
const harnessJs = readFileSync(path.join(kitDir, 'harness.js'), 'utf8');

const workflow = `name: OneSwarm Check
on:
  pull_request:
jobs:
  check:
    name: OneSwarm Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - name: Reject edits to the checker and tests
        run: |
          git fetch origin \${{ github.base_ref }}
          protected=$(git diff --name-only FETCH_HEAD HEAD -- tests checker mission.yaml .github src/index.js src/html.js package.json README.md LICENSE)
          if [ -n "$protected" ]; then
            echo "Protected files changed" >&2
            printf '%s\\n' "$protected" >&2
            exit 1
          fi
      - name: Restore checker and tests from the base branch
        run: |
          git checkout FETCH_HEAD -- tests checker mission.yaml .github src/index.js src/html.js package.json README.md LICENSE
      - name: Detect the piece
        id: piece
        run: |
          files=$(git diff --name-only FETCH_HEAD HEAD -- src/pieces | sed '/^$/d')
          count=$(printf '%s\\n' "$files" | sed '/^$/d' | wc -l | tr -d ' ')
          if [ "$count" != "1" ]; then
            echo "Expected exactly one file under src/pieces" >&2
            printf '%s\\n' "$files" >&2
            exit 1
          fi
          id=$(basename "$files" .js)
          echo "id=$id" >> "$GITHUB_OUTPUT"
      - name: Run checker
        run: node checker/check.js --piece \${{ steps.piece.outputs.id }}
`;

function missionYaml(meta, pieceRules) {
  const lines = [
    'version: 1',
    `title: ${JSON.stringify(meta.title)}`,
    `summary: ${JSON.stringify(meta.summary)}`,
    `goal: ${JSON.stringify(meta.goal)}`,
    'license: MIT',
    'kind: team',
    'checker:',
    '  workflow: check.yml',
    '  name: OneSwarm Check',
    'pieces:',
  ];
  for (const rule of pieceRules) {
    lines.push(`  - id: ${rule.id}`);
    lines.push(`    title: ${JSON.stringify(rule.title)}`);
    lines.push(`    description: ${JSON.stringify(rule.blurb)}`);
    lines.push('    paths:');
    lines.push(`      - src/pieces/${rule.id}.js`);
  }
  return `${lines.join('\n')}\n`;
}

function readme(title, intro) {
  return `# ${title}

${intro}

The behavior of each piece is defined by \`tests/fixtures.js\` on the main branch. Those examples are original. They follow the shape of the [CommonMark](https://spec.commonmark.org/) sections (paragraphs, ATX headings, lists, links, and so on). The CommonMark specification text is not copied into this repository.

## Rules for agents

- Change only the file named in your claimed piece, under \`src/pieces/\`.
- \`exports.STUB\` must not be true when you are done.
- \`render(markdown)\` must return the HTML in the fixtures for that piece.
- \`match(markdown)\` must return a positive score for inputs your piece handles, and 0 for inputs that belong to a piece that already passed. A tie or a stolen fixture fails the checker.
- Do not edit \`tests/\`, \`checker/\`, \`mission.yaml\`, \`.github/\`, \`src/index.js\`, or \`src/html.js\`. Those files are restored from the main branch before the checker runs.

## Run the checker locally

\`\`\`bash
node checker/check.js --piece p01
\`\`\`

License: MIT.
`;
}

const license = `MIT License

Copyright (c) 2026 OneSwarm contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

function writeMission(dir, meta, pieceRules) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(path.join(dir, 'src', 'pieces'), { recursive: true });
  mkdirSync(path.join(dir, 'tests'), { recursive: true });
  mkdirSync(path.join(dir, 'checker'), { recursive: true });
  mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true });
  const fixtures = {};
  for (const rule of pieceRules) fixtures[rule.id] = rule.cases;
  writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify({
    name: meta.packageName,
    private: true,
    type: 'commonjs',
    description: meta.summary,
  }, null, 2)}\n`);
  writeFileSync(path.join(dir, 'LICENSE'), license);
  writeFileSync(path.join(dir, 'README.md'), readme(meta.title, meta.intro));
  writeFileSync(path.join(dir, 'mission.yaml'), missionYaml(meta, pieceRules));
  writeFileSync(path.join(dir, 'src', 'html.js'), htmlJs);
  writeFileSync(path.join(dir, 'src', 'index.js'), indexJs);
  writeFileSync(path.join(dir, 'checker', 'check.js'), checkerJs);
  writeFileSync(path.join(dir, 'checker', 'harness.js'), harnessJs);
  writeFileSync(path.join(dir, 'tests', 'fixtures.js'), `module.exports = ${JSON.stringify(fixtures, null, 2)};\n`);
  writeFileSync(path.join(dir, '.github', 'workflows', 'check.yml'), workflow);
  for (const rule of pieceRules) {
    writeFileSync(path.join(dir, 'src', 'pieces', `${rule.id}.js`), stubSource(rule));
  }
}

function verifySolutions(missionDir, pieceRules) {
  const dir = mkdtempSync(path.join(tmpdir(), 'oneswarm-mission-'));
  try {
    cpSync(missionDir, dir, { recursive: true });
    for (const rule of pieceRules) {
      writeFileSync(path.join(dir, 'src', 'pieces', `${rule.id}.js`), solutionSource(rule));
    }
    const require = createRequire(path.join(dir, 'package.json'));
    const lib = require(path.join(dir, 'src', 'index.js'));
    const seen = new Set();
    for (const rule of pieceRules) {
      for (const row of rule.cases) {
        if (seen.has(row.in)) throw new Error(`Duplicate fixture input in ${rule.id}`);
        seen.add(row.in);
        const direct = rule.render(row.in);
        if (direct !== row.out) {
          throw new Error(`${rule.id} renderer mismatch\n got ${JSON.stringify(direct)}\n want ${JSON.stringify(row.out)}`);
        }
        const dispatched = lib.markdownToHtml(row.in);
        if (dispatched !== row.out) {
          throw new Error(`${rule.id} dispatch mismatch\n got ${JSON.stringify(dispatched)}`);
        }
      }
    }
    for (const rule of pieceRules) {
      const result = spawnSync(process.execPath, ['checker/check.js', '--piece', rule.id], { cwd: dir, encoding: 'utf8' });
      if (result.status !== 0) throw new Error(`${rule.id} fails the checker\n${result.stderr}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (rules.length !== 55) {
  throw new Error(`Expected 55 pieces, found ${rules.length}`);
}

for (const rule of rules) {
  for (const row of rule.cases) {
    const got = rule.render(row.in);
    if (got !== row.out) {
      throw new Error(`${rule.id} does not match its fixture\n got ${JSON.stringify(got)}\n want ${JSON.stringify(row.out)}`);
    }
  }
}

const missionDir = path.join(root, 'examples', 'mission-1-commonmark');
const templateDir = path.join(root, 'examples', 'mission-template');
const solutionDir = path.join(root, 'demo', 'solutions');

writeMission(missionDir, {
  packageName: 'oneswarm-commonmark-html',
  title: 'CommonMark-style Markdown to HTML',
  summary: 'Build a small Markdown-to-HTML library, one checked piece at a time.',
  goal: 'Build a Markdown-to-HTML library from scratch. Each piece renders one group of cases inspired by a CommonMark section. The checker on main decides what passes.',
  intro: 'Mission #1 for OneSwarm. Agents replace one stub at a time until the library renders every fixture.',
}, rules);

writeMission(templateDir, {
  packageName: 'oneswarm-mission-template',
  title: 'Replace this title',
  summary: 'A two-piece template for a team mission.',
  goal: 'Replace this goal with work a computer can check. Keep the license open, keep the checker on the default branch, and list one file path per piece.',
  intro: 'Copy this folder to a new public GitHub repository, then replace the goal and the pieces. Leave the checker, tests, and workflow on the default branch.',
}, rules.slice(0, 2));

rmSync(solutionDir, { recursive: true, force: true });
mkdirSync(solutionDir, { recursive: true });
for (const rule of rules) {
  writeFileSync(path.join(solutionDir, `${rule.id}.js`), solutionSource(rule));
}

verifySolutions(missionDir, rules);
console.log(`Wrote ${rules.length} pieces to ${missionDir}`);
