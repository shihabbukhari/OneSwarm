import assert from 'node:assert/strict';
import test from 'node:test';
import { REWARD_NOTICE } from '../src/constants.js';
import { signWebhook } from '../src/util.js';
import { startHarness } from './helpers.js';

const yaml = `version: 1
title: "Score the answer"
summary: "Higher score wins."
goal: "Submit a higher score."
license: MIT
kind: challenge
problem: "The checker prints score:<number>."
deadline: "2020-01-01T00:00:00.000Z"
score_order: higher
checker:
  workflow: check.yml
  name: OneSwarm Check
`;

test('a poster promise can be confirmed by the winner', async () => {
  const harness = await startHarness();
  try {
    const admin = await harness.domain.createDemoUser({
      login: 'admin',
      displayName: 'Demo Admin',
      role: 'admin',
    });
    harness.github.seedRepo({
      owner: 'poster',
      repo: 'score',
      files: {
        'mission.yaml': yaml,
        'README.md': 'readme\n',
        'LICENSE': 'MIT\n',
        'package.json': '{}\n',
        'src/index.js': 'module.exports = {};\n',
        'src/html.js': 'module.exports = {};\n',
        'src/answer.txt': 'todo\n',
        'checker/check.js': 'console.log("ok")\n',
        'tests/fixtures.js': 'module.exports = {};\n',
        '.github/workflows/check.yml': 'name: OneSwarm Check\n',
      },
    });
    const pending = await harness.domain.submitMission(admin, {
      repo_url: 'https://github.com/poster/score',
      reward_amount: '25',
      reward_currency: 'USD',
      reward_rules: 'The poster pays the winner directly.',
    });
    await harness.domain.approveMission(admin, pending.id);
    const ada = await harness.domain.createDemoUser({ login: 'ada', displayName: 'Ada', countryCode: 'BD' });
    const bo = await harness.domain.createDemoUser({ login: 'bo', displayName: 'Bo', countryCode: 'IN' });
    const tokenA = (await harness.domain.createAgentToken(ada, 'Bot')).token;
    const tokenB = (await harness.domain.createAgentToken(bo, 'Bot')).token;

    async function score(token, content, value, delivery) {
      const pull = await harness.github.openPullRequest({
        owner: 'poster',
        repo: 'score',
        title: `score ${value}`,
        files: [{ filename: 'src/answer.txt', content }],
      });
      const report = await fetch(`${harness.baseUrl}/api/missions/1/submissions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pr_number: pull.number }),
      });
      assert.equal(report.status, 201);
      await harness.github.setCheck({
        owner: 'poster',
        repo: 'score',
        sha: pull.headSha,
        name: 'OneSwarm Check',
        path: '.github/workflows/check.yml',
        conclusion: 'success',
        summary: `score: ${value}`,
      });
      const payload = {
        action: 'completed',
        repository: { name: 'score', owner: { login: 'poster' } },
        check_run: {
          name: 'OneSwarm Check',
          conclusion: 'success',
          head_sha: pull.headSha,
          pull_requests: [{ number: pull.number }],
        },
      };
      const raw = Buffer.from(JSON.stringify(payload));
      const hook = await fetch(`${harness.baseUrl}/webhooks/github`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': signWebhook(harness.config.webhookSecret, raw),
          'x-github-delivery': delivery,
          'x-github-event': 'check_run',
        },
        body: raw,
      });
      const body = await hook.json();
      assert.equal(body.status, 'scored', JSON.stringify(body));
    }

    await score(tokenA, 'ten\n', 10, 'score-10');
    await score(tokenB, 'twelve\n', 12, 'score-12');
    const mission = await harness.domain.missionDetail(1, null);
    assert.equal(mission.winner, 'bo');
    assert.equal(mission.reward.notice, REWARD_NOTICE);
    assert.equal(mission.reward.amount, '25');

    const received = await fetch(`${harness.baseUrl}/api/missions/1/reward/received`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenB}`, 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(received.status, 200);
    const poster = await harness.domain.publicProfile('admin');
    assert.equal(poster.kept_promises, 1);
    assert.equal(poster.rewards_promised, 1);
    const winner = await harness.domain.publicProfile('bo');
    assert.equal(winner.wins, 1);
  } finally {
    await harness.close();
  }
});
