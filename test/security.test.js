import assert from 'node:assert/strict';
import test from 'node:test';
import { seedMissionOne } from '../demo/swarm.js';
import { sha256, signWebhook } from '../src/util.js';
import { cookieFrom, startHarness } from './helpers.js';

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

test('browser mutations require a CSRF token', async () => {
  const harness = await startHarness();
  try {
    await harness.domain.createDemoUser({ login: 'admin', displayName: 'Admin', role: 'admin' });
    const login = await fetch(`${harness.baseUrl}/auth/demo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login: 'admin' }),
    });
    const cookie = cookieFrom(login);
    const missing = await fetch(`${harness.baseUrl}/api/me/tokens`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'no-csrf' }),
    });
    assert.equal(missing.status, 403);
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
