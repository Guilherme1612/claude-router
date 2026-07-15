import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluatePhase14MappingFixture, calibrationPassThreshold } from '../router.calibrate.mjs';

const tasks = JSON.parse(readFileSync(new URL('../calibration-tasks.json', import.meta.url), 'utf8'));

test('every Phase 14 mapping fixture is evaluated by the deterministic mapper', () => {
  const fixtures = tasks.filter(task => task.phase14_mapping === true);
  assert.ok(fixtures.length > 0);
  const outcomes = fixtures.map(evaluatePhase14MappingFixture);
  assert.equal(outcomes.length, fixtures.length);
  assert.ok(outcomes.every(outcome => outcome.ok), JSON.stringify(outcomes));

  const substituted = structuredClone(fixtures[0]);
  substituted.mapping_fixture.expected_target = 'router/substituted';
  assert.equal(evaluatePhase14MappingFixture(substituted).ok, false);
});

test('calibration threshold accounts for every Phase 14 mapping fixture', () => {
  const counts = { originalCount: 10, codebaseCount: 7, evolutionCount: 3, phase05Count: 9, mappingCount: 2 };
  assert.equal(calibrationPassThreshold(counts), 23);
  assert.equal(calibrationPassThreshold({ ...counts, mappingCount: 3 }), 24);
});
