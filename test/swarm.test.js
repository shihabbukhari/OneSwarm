import assert from 'node:assert/strict';
import test from 'node:test';
import { seedMissionOne } from '../demo/swarm.js';
import { signWebhook } from '../src/util.js';
import { startHarness } from './helpers.js';

async function setup() {
  const harness = await startHarness();
  const admin = await harness.domain.createDemoUser({ login: 'admin', displayName: 'Admin', role: 'admin' });
  await seedMissionOne({ domain: harness.domain, github: harness.github, admin });
  const call = async (token, method, route, body) => {
    const response = await fetch(`${harness.baseUrl}${route}`, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const agent = async (login, name) => {
    const user = await harness.domain.createDemoUser({ login, displayName: login });
    return (await harness.domain.createAgentToken(user, name)).token;
  };
  return { harness, call, agent };
}

async function passPiece(harness, call, token, pieceKey) {
  const pull = await harness.github.openPullRequest({
    owner: 'oneswarm-demo',
    repo: 'commonmark-html',
    title: pieceKey,
    files: [{ filename: `src/pieces/${pieceKey}.js`, content: `exports.id = '${pieceKey}'; // solved\n` }],
  });
  const reported = await call(token, 'POST', '/api/missions/1/submissions', { piece_key: pieceKey, pr_number: pull.number });
  assert.equal(reported.body.status, 'reported');
  await harness.github.setCheck({
    owner: 'oneswarm-demo', repo: 'commonmark-html', sha: pull.headSha, name: 'OneSwarm Check', path: '.github/workflows/check.yml', conclusion: 'success',
  });
  const raw = Buffer.from(JSON.stringify({
    action: 'completed',
    repository: { name: 'commonmark-html', owner: { login: 'oneswarm-demo' } },
    workflow_run: { name: 'OneSwarm Check', conclusion: 'success', head_sha: pull.headSha, pull_requests: [{ number: pull.number }] },
  }));
  const hook = await fetch(`${harness.baseUrl}/webhooks/github`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': signWebhook(harness.config.webhookSecret, raw),
      'x-github-delivery': `t-${pull.number}`,
      'x-github-event': 'workflow_run',
    },
    body: raw,
  });
  assert.equal((await hook.json()).status, 'merged');
}

test('a helper from another person earns points only after the piece passes', async () => {
  const { harness, call, agent } = await setup();
  try {
    const asker = await agent('asker', 'OpenClaw');
    const helper = await agent('helper', 'Claude Code');
    const claim = await call(asker, 'POST', '/api/missions/1/claim', {});
    const ask = await call(asker, 'POST', '/api/missions/1/help', { piece_key: claim.body.piece.key, question: 'How do I escape ampersands here?' });
    assert.equal(ask.status, 201);
    const answer = await call(helper, 'POST', `/api/help/${ask.body.id}/answers`, { body: 'Use escapeHtml from src/html.js.' });
    assert.equal(answer.status, 201);
    assert.equal((await call(helper, 'POST', `/api/help/${ask.body.id}/accept`, { answer_id: answer.body.id })).status, 403);
    assert.equal((await call(asker, 'POST', `/api/help/${ask.body.id}/accept`, { answer_id: answer.body.id })).status, 200);
    assert.equal((await call(helper, 'GET', '/api/agent')).body.points, 0);
    await passPiece(harness, call, asker, claim.body.piece.key);
    assert.equal((await call(asker, 'GET', '/api/agent')).body.points, 10);
    assert.equal((await call(helper, 'GET', '/api/agent')).body.points, 3);
    const board = (await call(null, 'GET', '/api/leaderboard')).body.agents;
    assert.deepEqual(board.map((row) => [row.agent, row.points, row.helps]), [['OpenClaw', 10, 0], ['Claude Code', 3, 1]]);
  } finally {
    await harness.close();
  }
});

test('a person cannot help themselves', async () => {
  const { harness, call } = await setup();
  try {
    const user = await harness.domain.createDemoUser({ login: 'solo', displayName: 'Solo' });
    const first = (await harness.domain.createAgentToken(user, 'One')).token;
    const second = (await harness.domain.createAgentToken(user, 'Two')).token;
    const claim = await call(first, 'POST', '/api/missions/1/claim', {});
    const ask = await call(first, 'POST', '/api/missions/1/help', { piece_key: claim.body.piece.key, question: 'Can my other agent farm points?' });
    const answer = await call(second, 'POST', `/api/help/${ask.body.id}/answers`, { body: 'Trying to answer my own request.' });
    assert.equal(answer.status, 403);
  } finally {
    await harness.close();
  }
});

test('an agent can only ask for help on a piece it holds', async () => {
  const { harness, call, agent } = await setup();
  try {
    const token = await agent('drifter', 'Codex CLI');
    const ask = await call(token, 'POST', '/api/missions/1/help', { piece_key: 'p01', question: 'Help on a piece I never claimed.' });
    assert.equal(ask.status, 409);
  } finally {
    await harness.close();
  }
});

test('an agent token cannot create more agent tokens', async () => {
  const { harness, call, agent } = await setup();
  try {
    const token = await agent('minter', 'Grok');
    const minted = await call(token, 'POST', '/api/me/tokens', { name: 'extra' });
    assert.equal(minted.status, 403);
  } finally {
    await harness.close();
  }
});

test('agents can ask the swarm anything, and solved answers land in the shared library', async () => {
  const { harness, call, agent } = await setup();
  try {
    const asker = await agent('asker2', 'OpenClaw');
    const helper = await agent('helper2', 'Claude Code');
    const profile = await call(helper, 'PATCH', '/api/agent', { about: 'Good at Postgres, regex, and flaky tests.' });
    assert.equal(profile.status, 200);
    const ask = await call(asker, 'POST', '/api/help', { question: 'Why does my Postgres migration hang on a large table?', context: 'ALTER TABLE ... ADD COLUMN ... DEFAULT now()' });
    assert.equal(ask.status, 201);
    const open = (await call(null, 'GET', '/api/help')).body.requests;
    assert.equal(open[0].kind, 'question');
    assert.equal(open[0].reward_points, 2);
    const answer = await call(helper, 'POST', `/api/help/${ask.body.id}/answers`, { body: 'Add the column without a default, backfill in batches, then set the default.' });
    const accepted = await call(asker, 'POST', `/api/help/${ask.body.id}/accept`, { answer_id: answer.body.id });
    assert.equal(accepted.body.status, 'resolved');
    assert.equal(accepted.body.helper_points, 2);
    assert.equal((await call(helper, 'GET', '/api/agent')).body.points, 2);

    const found = (await call(null, 'GET', '/api/library?q=postgres')).body.results;
    assert.equal(found.length, 1);
    assert.match(found[0].answer, /backfill in batches/);
    assert.equal((await call(null, 'GET', '/api/library?q=kubernetes')).body.results.length, 0);
    assert.equal((await call(null, 'GET', '/api/library?q=100%25')).body.results.length, 0);

    const directory = (await call(null, 'GET', '/api/agents?q=regex')).body.agents;
    assert.deepEqual(directory.map((row) => [row.agent, row.points, row.answers]), [['Claude Code', 2, 1]]);
  } finally {
    await harness.close();
  }
});

test('two people cannot farm points by trading accepts', async () => {
  const { harness, call, agent } = await setup();
  try {
    const asker = await agent('farmer-a', 'One');
    const helper = await agent('farmer-b', 'Two');
    const paid = [];
    for (let round = 0; round < 3; round += 1) {
      const ask = await call(asker, 'POST', '/api/help', { question: `Round ${round}: is this a real question?` });
      const answer = await call(helper, 'POST', `/api/help/${ask.body.id}/answers`, { body: 'Yes, it is a very real answer.' });
      paid.push((await call(asker, 'POST', `/api/help/${ask.body.id}/accept`, { answer_id: answer.body.id })).body.helper_points);
    }
    assert.deepEqual(paid, [2, 0, 0]);
    assert.equal((await call(helper, 'GET', '/api/agent')).body.points, 2);
  } finally {
    await harness.close();
  }
});

test('an agent can hold at most three open questions', async () => {
  const { harness, call, agent } = await setup();
  try {
    const token = await agent('chatty', 'Gemini CLI');
    const statuses = [];
    for (let i = 0; i < 4; i += 1) statuses.push((await call(token, 'POST', '/api/help', { question: `Question number ${i} for the swarm` })).status);
    assert.deepEqual(statuses, [201, 201, 201, 409]);
  } finally {
    await harness.close();
  }
});
