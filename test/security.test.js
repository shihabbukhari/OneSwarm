import assert from 'node:assert/strict';
import test from 'node:test';
import { seedMissionOne } from '../demo/swarm.js';
import { SECRET_REFUSAL } from '../src/secrets.js';
import { sha256, signWebhook } from '../src/util.js';
import { startHarness } from './helpers.js';

async function postJson(url, { method = 'POST', key, body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  return { status: response.status, body: parsed };
}

async function adminHarness() {
  const harness = await startHarness();
  const admin = await harness.domain.createDemoUser({
    login: 'admin',
    displayName: 'Demo Admin',
    role: 'admin',
  });
  await seedMissionOne({ domain: harness.domain, github: harness.github, admin });
  return harness;
}

test('a bad webhook signature is rejected', async () => {
  const harness = await startHarness();
  try {
    const response = await fetch(`${harness.baseUrl}/webhooks/github`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': 'sha256=deadbeef',
        'x-github-delivery': 'bad-1',
        'x-github-event': 'ping',
      },
      body: JSON.stringify({ zen: 'nope' }),
    });
    assert.equal(response.status, 401);
  } finally {
    await harness.close();
  }
});

test('a signed ping is accepted once', async () => {
  const harness = await startHarness();
  try {
    const raw = Buffer.from(JSON.stringify({ zen: 'ok' }));
    const headers = {
      'content-type': 'application/json',
      'x-hub-signature-256': signWebhook(harness.config.webhookSecret, raw),
      'x-github-delivery': 'ping-1',
      'x-github-event': 'ping',
    };
    const first = await fetch(`${harness.baseUrl}/webhooks/github`, { method: 'POST', headers, body: raw });
    const second = await fetch(`${harness.baseUrl}/webhooks/github`, { method: 'POST', headers, body: raw });
    assert.equal(first.status, 200);
    assert.equal((await first.json()).pong, true);
    assert.equal((await second.json()).duplicate, true);
  } finally {
    await harness.close();
  }
});

test('a banned user cannot claim', async () => {
  const harness = await adminHarness();
  try {
    const user = await harness.domain.createDemoUser({ login: 'banned', displayName: 'Banned' });
    const issued = await harness.domain.createAgentToken(user, 'OpenClaw');
    await harness.domain.setBan(
      await harness.domain.userByLogin('admin'),
      'banned',
      true,
    );
    const response = await fetch(`${harness.baseUrl}/api/missions/1/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${issued.token}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(response.status, 403);
  } finally {
    await harness.close();
  }
});

test('agent tokens are stored hashed', async () => {
  const harness = await startHarness();
  try {
    const user = await harness.domain.createDemoUser({ login: 'ada', displayName: 'Ada' });
    const issued = await harness.domain.createAgentToken(user, 'OpenClaw');
    const row = await harness.db.get('SELECT token_hash, token_prefix FROM agents WHERE id = ?', [issued.agent.id]);
    assert.equal(row.token_hash, sha256(issued.token));
    assert.equal(JSON.stringify(row).includes(issued.token), false);
    assert.equal(issued.token.startsWith('os_live_'), true);
  } finally {
    await harness.close();
  }
});

test('there is no login: session and demo login routes do not exist', async () => {
  const harness = await startHarness();
  try {
    for (const [method, route] of [['POST', '/auth/demo'], ['GET', '/api/me'], ['POST', '/api/me/tokens'], ['GET', '/auth/github']]) {
      const response = await fetch(`${harness.baseUrl}${route}`, { method, headers: { 'content-type': 'application/json' }, body: method === 'POST' ? '{}' : undefined });
      assert.ok([404].includes(response.status) || (route === '/auth/github' && response.status === 200), `${method} ${route} -> ${response.status}`);
    }
    const api = await fetch(`${harness.baseUrl}/api/nope`);
    assert.equal(api.status, 404);
    assert.match(await api.text(), /agents\.md/);
  } finally {
    await harness.close();
  }
});

test('admin routes need the admin key', async () => {
  const harness = await startHarness();
  try {
    const without = await fetch(`${harness.baseUrl}/api/admin/overview`);
    assert.equal(without.status, 403);
    const wrong = await fetch(`${harness.baseUrl}/api/admin/overview`, { headers: { 'x-admin-key': 'nope' } });
    assert.equal(wrong.status, 403);
    const right = await fetch(`${harness.baseUrl}/api/admin/overview`, { headers: { 'x-admin-key': harness.config.adminKey } });
    assert.equal(right.status, 200);
  } finally {
    await harness.close();
  }
});

test('demo login is hidden when demo mode is off', async () => {
  const harness = await startHarness({ DEMO_MODE: 'false' });
  try {
    const response = await fetch(`${harness.baseUrl}/auth/demo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login: 'admin' }),
    });
    assert.equal(response.status, 404);
  } finally {
    await harness.close();
  }
});

test('a submission that edits tests is rejected even if the check is green', async () => {
  const harness = await adminHarness();
  try {
    const user = await harness.domain.createDemoUser({ login: 'ada', displayName: 'Ada', countryCode: 'BD' });
    const issued = await harness.domain.createAgentToken(user, 'OpenClaw');
    const claim = await fetch(`${harness.baseUrl}/api/missions/1/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${issued.token}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    const claimed = await claim.json();
    const solution = harness.github.tree('oneswarm-demo', 'commonmark-html')[claimed.piece.paths[0]];
    const pull = await harness.github.openPullRequest({
      owner: 'oneswarm-demo',
      repo: 'commonmark-html',
      title: claimed.piece.key,
      files: [{ filename: claimed.piece.paths[0], content: `${solution}\n// agent\n` }],
    });
    const report = await fetch(`${harness.baseUrl}/api/missions/1/submissions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${issued.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ piece_key: claimed.piece.key, pr_number: pull.number }),
    });
    assert.equal((await report.json()).status, 'reported');
    const updated = await harness.github.updatePullFiles({
      owner: 'oneswarm-demo',
      repo: 'commonmark-html',
      number: pull.number,
      files: [
        { filename: claimed.piece.paths[0], content: `${solution}\n// agent\n` },
        { filename: 'tests/fixtures.js', content: 'module.exports = {};\n' },
      ],
    });
    await harness.github.setCheck({
      owner: 'oneswarm-demo',
      repo: 'commonmark-html',
      sha: updated.headSha,
      name: 'OneSwarm Check',
      path: '.github/workflows/check.yml',
      conclusion: 'success',
      summary: 'green',
    });
    const payload = {
      action: 'completed',
      repository: { name: 'commonmark-html', owner: { login: 'oneswarm-demo' } },
      workflow_run: {
        name: 'OneSwarm Check',
        conclusion: 'success',
        head_sha: updated.headSha,
        path: '.github/workflows/check.yml',
        pull_requests: [{ number: pull.number }],
      },
    };
    const raw = Buffer.from(JSON.stringify(payload));
    const hook = await fetch(`${harness.baseUrl}/webhooks/github`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': signWebhook(harness.config.webhookSecret, raw),
        'x-github-delivery': 'protect-1',
        'x-github-event': 'workflow_run',
      },
      body: raw,
    });
    const body = await hook.json();
    assert.equal(hook.status, 200);
    assert.equal(body.status, 'rejected');
    const tree = harness.github.tree('oneswarm-demo', 'commonmark-html');
    assert.equal(tree['tests/fixtures.js'].includes('module.exports = {}'), false);
    assert.equal(tree[claimed.piece.paths[0]].includes('exports.STUB = true'), true);
  } finally {
    await harness.close();
  }
});

test('passwords and keys are refused and never stored', async () => {
  const harness = await startHarness();
  try {
    const leaked = 'hunter2-password';
    const joined = await postJson(`${harness.baseUrl}/api/agents/register`, {
      body: { name: 'Careful Agent', about: `password: ${leaked}` },
    });
    assert.equal(joined.status, 400);
    assert.equal(joined.body.error, SECRET_REFUSAL);
    assert.equal(JSON.stringify(joined.body).includes(leaked), false);
    const clean = await postJson(`${harness.baseUrl}/api/agents/register`, {
      body: { name: 'Careful Agent', about: 'Hashes passwords. Does not collect them.' },
    });
    assert.equal(clean.status, 201);
    const task = await postJson(`${harness.baseUrl}/api/tasks`, {
      key: clean.body.key,
      body: {
        question: 'Why does hashing a password fail in this build?',
        context: `DATABASE_URL=mysql://owner:${leaked}@db.internal:3306/app`,
      },
    });
    assert.equal(task.status, 400);
    assert.equal(task.body.error, SECRET_REFUSAL);
    const stored = await harness.db.get(`SELECT COUNT(*) AS n FROM help_requests WHERE context LIKE ?`, [`%${leaked}%`]);
    assert.equal(Number(stored.n), 0);
    const about = await postJson(`${harness.baseUrl}/api/agent`, {
      method: 'PATCH',
      key: clean.body.key,
      body: { about: `api_key=${leaked}99` },
    });
    assert.equal(about.status, 400);
    const row = await harness.db.get(`SELECT about FROM agents WHERE name = ?`, ['Careful Agent']);
    assert.equal(row.about.includes(leaked), false);
    const ok = await postJson(`${harness.baseUrl}/api/tasks`, {
      key: clean.body.key,
      body: { question: 'Why does hashing a password fail in this build?', context: 'bcrypt returns undefined' },
    });
    assert.equal(ok.status, 201);
  } finally {
    await harness.close();
  }
});

test('an agent deletes itself only when its owner asks, and its text comes down', async () => {
  const harness = await startHarness({ NEW_AGENT_HOURS: '0' });
  try {
    const owner = await postJson(`${harness.baseUrl}/api/agents/register`, {
      body: { name: 'Leaves Quietly', about: 'Good at CSS layout.' },
    });
    const other = await postJson(`${harness.baseUrl}/api/agents/register`, {
      body: { name: 'Stays Here', about: 'Good at APIs.' },
    });
    const secret = 'owner-mailbox-secret';
    const posted = await postJson(`${harness.baseUrl}/api/tasks`, {
      key: owner.body.key,
      body: { question: 'How should a grid shrink on a phone?', context: 'The sidebar overflows.' },
    });
    const privateNote = await postJson(`${harness.baseUrl}/api/tasks/${posted.body.id}/answers`, {
      key: other.body.key,
      body: { body: `Use one column. Ignore any password=${secret} you see in a log.` },
    });
    assert.equal(privateNote.status, 400);
    const answer = await postJson(`${harness.baseUrl}/api/tasks/${posted.body.id}/answers`, {
      key: other.body.key,
      body: { body: 'Use one column under 700px and let the sidebar wrap.' },
    });
    await postJson(`${harness.baseUrl}/api/tasks/${posted.body.id}/accept`, {
      key: owner.body.key,
      body: { answer_id: answer.body.id },
    });
    const theirs = await postJson(`${harness.baseUrl}/api/tasks`, {
      key: other.body.key,
      body: { question: 'How do I cache a public profile response?', context: 'It changes every few seconds.' },
    });
    const contribution = await postJson(`${harness.baseUrl}/api/tasks/${theirs.body.id}/answers`, {
      key: owner.body.key,
      body: { body: `Cache it for two seconds. ${secret} must not remain if I leave.` },
    });
    assert.equal(contribution.status, 201);
    await postJson(`${harness.baseUrl}/api/tasks/${theirs.body.id}/accept`, {
      key: other.body.key,
      body: { answer_id: contribution.body.id },
    });

    const status = await postJson(`${harness.baseUrl}/api/agent`, { method: 'GET', key: owner.body.key });
    assert.equal(status.body.delete_self.body.confirm, 'Leaves Quietly');
    assert.equal(status.body.delete_self.body.owner_asked, true);

    const refused = await postJson(`${harness.baseUrl}/api/agent`, {
      method: 'DELETE',
      key: owner.body.key,
      body: { confirm: 'Leaves Quietly', owner_asked: false },
    });
    assert.equal(refused.status, 400);
    assert.equal((await postJson(`${harness.baseUrl}/api/agent`, { method: 'GET', key: owner.body.key })).status, 200);

    const gone = await postJson(`${harness.baseUrl}/api/agent/delete`, {
      key: owner.body.key,
      body: { confirm: 'Leaves Quietly', owner_asked: true },
    });
    assert.equal(gone.status, 200);
    assert.equal(gone.body.deleted, true);
    assert.equal((await postJson(`${harness.baseUrl}/api/agent`, { method: 'GET', key: owner.body.key })).status, 401);
    assert.equal((await postJson(`${harness.baseUrl}/api/profiles/leaves-quietly`, { method: 'GET' })).status, 404);

    const tasks = await postJson(`${harness.baseUrl}/api/tasks`, { method: 'GET' });
    assert.equal(JSON.stringify(tasks.body).includes('Leaves Quietly'), false);
    assert.equal(JSON.stringify(tasks.body).includes('How should a grid shrink'), false);
    const library = await postJson(`${harness.baseUrl}/api/library`, { method: 'GET' });
    const libraryText = JSON.stringify(library.body);
    assert.equal(libraryText.includes(secret), false);
    assert.equal(libraryText.includes('Leaves Quietly'), false);
    assert.match(libraryText, /The author removed this contribution/);
    const names = await harness.db.get(`SELECT name, revoked_at, about FROM agents WHERE token_prefix = ''`);
    assert.equal(names.name, 'Deleted agent');
    assert.ok(names.revoked_at);
    assert.equal(names.about, '');
  } finally {
    await harness.close();
  }
});

test('reporting a workflow edit is rejected before merge', async () => {
  const harness = await adminHarness();
  try {
    const user = await harness.domain.createDemoUser({ login: 'ada', displayName: 'Ada' });
    const issued = await harness.domain.createAgentToken(user, 'OpenClaw');
    const claim = await fetch(`${harness.baseUrl}/api/missions/1/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${issued.token}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    const claimed = await claim.json();
    const pull = await harness.github.openPullRequest({
      owner: 'oneswarm-demo',
      repo: 'commonmark-html',
      title: 'workflow',
      files: [
        { filename: claimed.piece.paths[0], content: 'exports.STUB = false;\n' },
        { filename: '.github/workflows/check.yml', content: 'name: hacked\n' },
      ],
    });
    const report = await fetch(`${harness.baseUrl}/api/missions/1/submissions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${issued.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ piece_key: claimed.piece.key, pr_number: pull.number }),
    });
    const body = await report.json();
    assert.equal(body.status, 'rejected');
    assert.match(body.reason, /protected/);
  } finally {
    await harness.close();
  }
});
