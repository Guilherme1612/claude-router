import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  selectSuggestion,
  startupPointer,
  suggestionFingerprint,
} from '../src/steward/suggestion.mjs';

const NOW = 1_800_000_000_000;

function observation(overrides = {}) {
  return {
    observation_kind: 'missing_dependency',
    reason_code: 'missing_dependency',
    evidence_window_ms: 60_000,
    opportunity_count: 4,
    freshness: 'fresh',
    affected_capability_ids: ['skill:z', 'skill:a'],
    confidence_basis_points: 9000,
    remedy: 'review_contract',
    ...overrides,
  };
}

test('filters rejected observations and returns no candidate dump', () => {
  for (const candidate of [
    observation({ freshness: 'stale' }),
    observation({ confidence_basis_points: 8499 }),
    observation({ remedy: 'no_action' }),
  ]) {
    assert.deepEqual(selectSuggestion({ observations: [candidate], now: NOW }), {
      schema_version: 1,
      policy_version: 'steward-policy-v1',
      reason_code: 'suggestion_none',
      suggestion: null,
      overview: { actionable_count: 0 },
    });
  }
});

test('selection is permutation-stable and returns one bounded projection', () => {
  const high = observation();
  const lower = observation({
    observation_kind: 'unmapped',
    reason_code: 'unmapped_capability',
    affected_capability_ids: ['skill:b'],
    remedy: 'reassess_mapping',
  });
  const first = selectSuggestion({ observations: [lower, high], now: NOW });
  const second = selectSuggestion({ observations: [high, lower], now: NOW });
  assert.deepEqual(first, second);
  assert.equal(first.reason_code, 'suggestion_selected');
  assert.equal(first.overview.actionable_count, 2);
  assert.deepEqual(first.suggestion.affected_capability_ids, ['skill:a', 'skill:z']);
  assert.equal(first.suggestion.confidence_basis_points, 9000);
  assert.equal(first.suggestion.expected_benefit, 'restore_dependency_coverage');
  assert.equal(first.suggestion.risk, 'low');
  assert.equal(first.suggestion.safe_next_action, 'review_contract');
  assert.deepEqual(first.suggestion.evidence, {
    evidence_window_ms: 60_000,
    opportunity_count: 4,
  });
  assert.equal(Object.hasOwn(first, 'candidates'), false);
});

test('fingerprint is semantic and excludes clock and presentation text', () => {
  const value = observation();
  assert.equal(
    suggestionFingerprint(value),
    suggestionFingerprint({ ...value, now: NOW + 1, heading: 'arbitrary presentation' }),
  );
  assert.equal(
    selectSuggestion({ observations: [value], now: NOW }).suggestion.fingerprint,
    selectSuggestion({ observations: [value], now: NOW + 99_999 }).suggestion.fingerprint,
  );
});

test('dismissal, snooze, and cooldown suppress by fingerprint', () => {
  const value = observation();
  const fingerprint = suggestionFingerprint(value);
  for (const state of [
    { dismissed: { [fingerprint]: NOW } },
    { snoozed_until: { [fingerprint]: NOW + 1 } },
    { cooldown_at: { [fingerprint]: NOW - 1 } },
  ]) {
    assert.equal(selectSuggestion({ observations: [value], state, now: NOW }).reason_code, 'suggestion_none');
  }
  assert.equal(
    selectSuggestion({ observations: [value], state: { cooldown_at: { [fingerprint]: NOW - 3_600_001 } }, now: NOW }).reason_code,
    'suggestion_selected',
  );
});

test('startup pointer contains metadata only', () => {
  const selected = selectSuggestion({ observations: [observation()], now: NOW });
  const pointer = startupPointer(selected, {}, NOW);
  assert.deepEqual(Object.keys(pointer), [
    'schema_version', 'policy_version', 'fingerprint', 'available', 'cooldown_until_ms',
  ]);
  assert.equal(pointer.available, true);
  assert.equal(JSON.stringify(pointer).includes('affected_capability_ids'), false);
});

test('malformed trust-boundary values throw TypeError', () => {
  assert.throws(() => selectSuggestion({ observations: 'bad', now: NOW }), TypeError);
  assert.throws(() => selectSuggestion({ observations: [observation({ affected_capability_ids: [] })], now: NOW }), TypeError);
  assert.throws(() => selectSuggestion({ observations: [observation()], now: 1.5 }), TypeError);
  assert.throws(() => suggestionFingerprint(observation({ reason_code: 'x'.repeat(129) })), TypeError);
});
