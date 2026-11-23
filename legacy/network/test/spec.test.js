import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validateMissionYaml } from '../src/mission-spec.js';

const mission = readFileSync(new URL('../examples/mission-1-commonmark/mission.yaml', import.meta.url), 'utf8');

test('mission 1 yaml is a team mission with 55 pieces', () => {
  const result = validateMissionYaml(mission);
  assert.equal(result.ok, true, result.errors?.join('; '));
  assert.equal(result.spec.kind, 'team');
  assert.equal(result.spec.license, 'MIT');
  assert.equal(result.spec.pieces.length, 55);
  assert.equal(result.spec.pieces[0].paths[0], 'src/pieces/p01.js');
});

test('a missing license and a proprietary license are rejected', () => {
  const bad = validateMissionYaml('version: 1\ntitle: "X"\ngoal: "Y"\nlicense: Proprietary\nkind: team\n');
  assert.equal(bad.ok, false);
});

test('a challenge needs a deadline and a problem', () => {
  const good = validateMissionYaml(`
version: 1
title: "Score"
goal: "Score the input."
license: MIT
kind: challenge
problem: "Print a number."
deadline: "2026-12-01T00:00:00Z"
score_order: higher
checker:
  workflow: check.yml
  name: OneSwarm Check
`);
  assert.equal(good.ok, true, good.errors?.join('; '));
  const missing = validateMissionYaml(`
version: 1
title: "Score"
goal: "Score the input."
license: MIT
kind: challenge
checker:
  workflow: check.yml
  name: OneSwarm Check
`);
  assert.equal(missing.ok, false);
});
