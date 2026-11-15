import assert from 'node:assert/strict';
import test from 'node:test';
import { runChecker } from '../demo/checker-runner.js';
import { runSwarm, seedMissionOne } from '../demo/swarm.js';
import { startHarness } from './helpers.js';

test('fifty demo agents update the live board', { timeout: 180000 }, async () => {
  const harness = await startHarness();
  try {
    const admin = await harness.domain.createDemoUser({
      login: 'admin',
      displayName: 'Demo Admin',
      role: 'admin',
      countryCode: 'BD',
    });
    await seedMissionOne({ domain: harness.domain, github: harness.github, admin });
    const summary = await runSwarm({
      baseUrl: harness.baseUrl,
      domain: harness.domain,
      github: harness.github,
      config: harness.config,
    });
    assert.deepEqual(summary, { merged: 40, failed: 6, rejected: 4, helped: 3 });

    const live = await (await fetch(`${harness.baseUrl}/api/live`)).json();
    assert.equal(live.counts.agents, 50);
    assert.equal(live.counts.people, 40);
    assert.equal(live.counts.active_agents, 50);
    assert.equal(live.counts.countries, 16);
    assert.equal(live.counts.pieces_passed, 40);
    assert.equal(live.counts.pieces_total, 55);
    assert.equal(live.counts.percent_done, 72.7);
    assert.equal(live.dots.length, 50);
    assert.ok(live.feed.length > 0);
    assert.equal(live.leaderboard_people[0].pieces, 2);
    assert.ok(live.leaderboard_countries.length >= 1);
    assert.equal(live.featured_mission_number, 1);
    assert.equal(live.swarm.points, 40 * 10 + 3 * 3);
    assert.equal(live.swarm.helps_paid, 3);
    assert.equal(live.swarm.open_help, 2);
    assert.equal(live.help_open.length, 2);
    assert.equal(live.help_open[0].context, undefined);
    assert.ok(live.leaderboard_agents.length > 0);
    const helpedEvents = await harness.db.get(`SELECT COUNT(*) AS n FROM events WHERE kind = 'helped'`);
    assert.equal(Number(helpedEvents.n), 3);

    const tasks = await (await fetch(`${harness.baseUrl}/api/tasks`)).json();
    assert.equal(tasks.missions[0].number, 1);
    assert.equal(tasks.help_requests.length, 2);
    const guide = await fetch(`${harness.baseUrl}/agents.md`);
    assert.equal(guide.status, 200);
    assert.match(await guide.text(), /api\/tasks/);

    const mission = await (await fetch(`${harness.baseUrl}/api/missions/1`)).json();
    assert.equal(mission.pieces_passed, 40);
    assert.match(mission.join_line, /^Read http:\/\/127\.0\.0\.1:3000\/agents\.md and join mission 1\.$/);
    assert.match(mission.reward.notice, /not guaranteed by OneSwarm/);

    const tree = harness.github.tree('oneswarm-demo', 'commonmark-html');
    assert.equal(tree['src/pieces/p01.js'].includes('exports.STUB'), false);
    assert.equal(tree['tests/fixtures.js'].includes('p01'), true);
    assert.equal(tree['.github/workflows/check.yml'].includes('name: hacked'), false);
    const regression = await runChecker({
      tree,
      overlay: [],
      pieceKey: 'p01',
    });
    assert.equal(regression.ok, true, regression.log);

    const profile = await (await fetch(`${harness.baseUrl}/api/profiles/pilot-0`)).json();
    assert.equal(profile.pieces_done, 2);
    assert.equal(profile.points, 20);
    assert.equal(profile.agents.length, 2);
    const share = await fetch(`${harness.baseUrl}/share/u/pilot-0.svg`);
    const svg = await share.text();
    assert.match(svg, /I lent my agent to OneSwarm/);
    assert.match(svg, /2 pieces done/);
    const badge = await (await fetch(`${harness.baseUrl}/badge/1.svg`)).text();
    assert.match(badge, /72\.7% done/);
  } finally {
    await harness.close();
  }
});
