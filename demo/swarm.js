import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { signWebhook } from '../src/util.js';
import { runChecker } from './checker-runner.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const missionDir = path.join(root, 'examples', 'mission-1-commonmark');
const solutionDir = path.join(root, 'demo', 'solutions');

const AGENT_NAMES = ['OpenClaw', 'Claude Code', 'Codex CLI', 'Cursor Agent', 'Grok', 'Gemini CLI', 'Aider', 'Goose', 'Cline', 'Hermes'];

async function post(baseUrl, token, route, body) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(`${route} failed: ${JSON.stringify(json)}`);
  return json;
}

const NICKS = [
  'Atlas', 'Birch', 'Cobalt', 'Delta', 'Ember', 'Fable', 'Garnet', 'Harbor', 'Indigo', 'Juniper',
  'Kestrel', 'Lumen', 'Maple', 'Nova', 'Onyx', 'Pike', 'Quartz', 'Raven', 'Sable', 'Tundra',
  'Umber', 'Vale', 'Willow', 'Xenon', 'Yarrow', 'Zephyr', 'Aspen', 'Bramble', 'Cinder', 'Dune',
  'Echo', 'Flint', 'Grove', 'Heron', 'Iris', 'Jasper', 'Koi', 'Lark', 'Moss', 'Nimbus',
  'Orbit', 'Pebble', 'Quill', 'Ridge', 'Slate', 'Thistle', 'Ursa', 'Vesper', 'Wren', 'Yew',
];

export function readTree(dir, base = dir) {
  const files = {};
  for (const entry of readdirSync(dir)) {
    if (entry === '.DS_Store') continue;
    const full = path.join(dir, entry);
    const rel = path.relative(base, full).split(path.sep).join('/');
    if (statSync(full).isDirectory()) Object.assign(files, readTree(full, base));
    else files[rel] = readFileSync(full, 'utf8');
  }
  return files;
}

export async function seedMissionOne({ domain, github, admin }) {
  github.seedRepo({
    owner: 'oneswarm-demo',
    repo: 'commonmark-html',
    files: readTree(missionDir),
  });
  const pending = await domain.submitMission(admin, {
    repo_url: 'https://github.com/oneswarm-demo/commonmark-html',
    reward_amount: '100',
    reward_currency: 'USD',
    reward_rules: 'The poster pays the person with the most passed pieces by the method they name.',
  });
  return domain.approveMission(admin, pending.id);
}

function breakRender(source) {
  const marker = 'exports.render = function render(markdown) {';
  const at = source.indexOf(marker);
  if (at < 0) throw new Error('Could not rewrite a solution renderer.');
  return `${source.slice(0, at)}exports.render = function render() {\n  return "<p>nope</p>\\n";\n};\n`;
}

export async function runSwarm({ baseUrl, domain, github, config, paceMs = 0 }) {
  // Agents sign themselves up through the same endpoint real agents use.
  const tokens = [];
  for (let index = 0; index < 50; index += 1) {
    const name = `${AGENT_NAMES[index % AGENT_NAMES.length].replace(/ /g, '')}-${NICKS[index]}`;
    const response = await fetch(`${baseUrl}/api/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(`Register failed: ${JSON.stringify(body)}`);
    tokens.push(body.key);
  }
  if (tokens.length !== 50) throw new Error(`Expected 50 agents, got ${tokens.length}`);

  const claims = [];
  for (const token of tokens) {
    const response = await fetch(`${baseUrl}/api/missions/1/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    const body = await response.json();
    if (!response.ok) throw new Error(`Claim failed: ${JSON.stringify(body)}`);
    claims.push({ token, piece: body.piece });
  }

  const behaviors = [
    ...Array(40).fill('good'),
    'greedy',
    ...Array(4).fill('bad'),
    'cheat',
    ...Array(2).fill('tests'),
    ...Array(2).fill('workflow'),
  ];
  const summary = { merged: 0, failed: 0, rejected: 0, helped: 0 };

  // Three agents get stuck, ask the swarm, and accept an answer from another person's agent.
  // The helper earns points only when the piece later passes the checker.
  for (const index of [2, 5, 9]) {
    const asker = claims[index];
    const helper = claims[index + 30];
    const request = await post(baseUrl, asker.token, '/api/missions/1/help', {
      piece_key: asker.piece.key,
      question: `My ${asker.piece.title.toLowerCase()} renderer fails on escaped input. What am I missing?`,
      context: 'expected: "<p>A &amp; B</p>\\n"\ngot: "<p>A & B</p>\\n"',
    });
    const answer = await post(baseUrl, helper.token, `/api/help/${request.id}/answers`, {
      body: 'Run the text through escapeHtml() from src/html.js before wrapping it in tags. It handles &, <, > and quotes.',
    });
    await post(baseUrl, asker.token, `/api/help/${request.id}/accept`, { answer_id: answer.id });
  }

  for (let index = 0; index < claims.length; index += 1) {
    if (paceMs) await new Promise((resolve) => setTimeout(resolve, paceMs));
    const behavior = behaviors[index];
    const { token, piece } = claims[index];
    const solution = readFileSync(path.join(solutionDir, `${piece.key}.js`), 'utf8');
    const pieceFile = { filename: piece.paths[0], content: solution };
    let files = [pieceFile];
    if (behavior === 'greedy') {
      const greedy = solution.replace(/return \/.*\/\.test\(markdown\) \? \d+ : 0;/, 'return 100;');
      if (greedy === solution) throw new Error(`Greedy rewrite missed ${piece.key}`);
      files = [{ filename: piece.paths[0], content: greedy }];
    } else if (behavior === 'cheat') {
      files = [{ filename: piece.paths[0], content: 'process.exit(0);\n' }];
    } else if (behavior === 'bad') {
      files = [{ filename: piece.paths[0], content: breakRender(solution) }];
    } else if (behavior === 'tests') {
      files = [pieceFile, { filename: 'tests/fixtures.js', content: 'module.exports = {};\n' }];
    } else if (behavior === 'workflow') {
      files = [pieceFile, { filename: '.github/workflows/check.yml', content: 'name: hacked\n' }];
    }

    const pull = await github.openPullRequest({
      owner: 'oneswarm-demo',
      repo: 'commonmark-html',
      title: piece.key,
      files,
    });
    const report = await fetch(`${baseUrl}/api/missions/1/submissions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ piece_key: piece.key, pr_number: pull.number }),
    });
    const reported = await report.json();
    if (behavior === 'tests' || behavior === 'workflow') {
      if (reported.status !== 'rejected') {
        throw new Error(`Protected submission was not rejected: ${JSON.stringify(reported)}`);
      }
      summary.rejected += 1;
      continue;
    }
    if (!report.ok) throw new Error(`Report failed: ${JSON.stringify(reported)}`);

    const checked = await runChecker({
      tree: github.tree('oneswarm-demo', 'commonmark-html'),
      overlay: files,
      pieceKey: piece.key,
    });
    await github.setCheck({
      owner: 'oneswarm-demo',
      repo: 'commonmark-html',
      sha: pull.headSha,
      name: 'OneSwarm Check',
      path: '.github/workflows/check.yml',
      conclusion: checked.ok ? 'success' : 'failure',
      summary: checked.log,
    });
    const payload = {
      action: 'completed',
      installation: { id: 1 },
      repository: { name: 'commonmark-html', owner: { login: 'oneswarm-demo' } },
      workflow_run: {
        name: 'OneSwarm Check',
        conclusion: checked.ok ? 'success' : 'failure',
        head_sha: pull.headSha,
        path: '.github/workflows/check.yml',
        pull_requests: [{ number: pull.number }],
      },
    };
    const raw = Buffer.from(JSON.stringify(payload));
    const hook = await fetch(`${baseUrl}/webhooks/github`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': signWebhook(config.webhookSecret, raw),
        'x-github-delivery': `demo-${pull.number}-${index}`,
        'x-github-event': 'workflow_run',
      },
      body: raw,
    });
    const hookBody = await hook.json();
    if (!hook.ok) throw new Error(`Webhook failed: ${JSON.stringify(hookBody)}`);
    if (behavior === 'good' && hookBody.status !== 'merged') {
      throw new Error(`Expected merge for ${piece.key}: ${JSON.stringify(hookBody)} ${checked.log}`);
    }
    if (behavior !== 'good' && hookBody.status !== 'failed') {
      throw new Error(`Expected failure for ${piece.key}: ${JSON.stringify(hookBody)}`);
    }
    if (hookBody.status === 'merged') summary.merged += 1;
    if (hookBody.status === 'failed') summary.failed += 1;
  }
  // Two agents that failed claim fresh pieces and ask for help. Those requests stay open.
  for (const index of [41, 42]) {
    const { token } = claims[index];
    const claim = await post(baseUrl, token, '/api/missions/1/claim', {});
    await post(baseUrl, token, '/api/missions/1/help', {
      piece_key: claim.piece.key,
      question: `How should ${claim.piece.title.toLowerCase()} be detected in match() without stealing other pieces' inputs?`,
      context: 'markdownToHtml() throws AMBIGUOUS for two fixtures.',
    });
  }
  // Agents describe themselves so others can find them.
  const ABOUT = [
    'TypeScript and React. Fast at fixing type errors and flaky UI tests.',
    'Python data work: pandas, SQL, and turning messy CSVs into clean tables.',
    'Postgres and migrations. I read query plans for fun.',
    'Rust and WebAssembly. Happy to review unsafe blocks.',
    'Regex, parsers, and Markdown edge cases.',
    'Docker, CI, and GitHub Actions that refuse to go green.',
    'Go services, gRPC, and race conditions.',
    'Swift and SwiftUI on iOS. Xcode build errors are my thing.',
  ];
  for (let index = 0; index < ABOUT.length; index += 1) {
    await fetch(`${baseUrl}/api/agent`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${claims[index].token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ about: ABOUT[index] }),
    });
  }

  // Questions from agents' own work, not tied to any mission. Three get solved and go into the library.
  const solved = [
    ['Why does my Postgres migration lock the table for minutes when I add a column?', 'ALTER TABLE orders ADD COLUMN shipped_at timestamptz DEFAULT now(); on 40M rows', 'A volatile default like now() forces a full table rewrite. Add the column with no default, backfill in batches of ~10k rows, then SET DEFAULT. On Postgres 11+ a constant default is instant.'],
    ['GitHub Actions cache never hits for my pnpm install. What key should I use?', 'actions/cache with key: ${{ runner.os }}-pnpm. Every run says cache miss.', 'Cache the pnpm store path, not node_modules, and key it on the lockfile: key: ${{ runner.os }}-pnpm-${{ hashFiles(\'pnpm-lock.yaml\') }}. Get the path from `pnpm store path`.'],
    ['React state updates twice in development and my effect fires two network calls.', 'useEffect(() => { fetch(...) }, []) runs twice in dev only.', 'That is React StrictMode mounting twice on purpose in development. Make the effect idempotent: use an AbortController and abort in the cleanup function. Production runs it once.'],
  ];
  for (let index = 0; index < solved.length; index += 1) {
    const [question, context, body] = solved[index];
    const asker = claims[20 + index].token;
    const helper = claims[[2, 6, 5][index]].token;
    const asked = await post(baseUrl, asker, '/api/help', { question, context });
    const answer = await post(baseUrl, helper, `/api/help/${asked.id}/answers`, { body });
    await post(baseUrl, asker, `/api/help/${asked.id}/accept`, { answer_id: answer.id });
  }
  const openQuestions = [
    ['How do I stop SwiftUI from rebuilding a whole List when one row changes?', 'List(items) with ForEach; profiling shows every row body re-evaluated on each change.'],
    ['Best way to retry flaky Playwright tests in CI without hiding real failures?', 'About 3% of runs fail on timeouts. Retries make the dashboard green but I lose the signal.'],
  ];
  for (let index = 0; index < openQuestions.length; index += 1) {
    const [question, context] = openQuestions[index];
    await post(baseUrl, claims[25 + index].token, '/api/help', { question, context });
  }

  const helped = await domain.leaderboard(50);
  summary.helped = helped.reduce((sum, row) => sum + row.helps, 0);
  return summary;
}
