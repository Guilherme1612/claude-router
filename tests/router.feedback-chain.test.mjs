import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalObserver, correlateEvents, observerPaths } from '../src/observer/local.mjs';
import { createHealthStore } from '../src/health/store.mjs';
import { scoreCapability } from '../src/health/score.mjs';
import { stableStringify } from '../src/registry/schema.mjs';

const root = () => mkdtempSync(join(tmpdir(), 'route-feedback-'));

test('FEED-01/02: observer keeps technical identity and never persists raw content', async () => {
  const home = root();
  const observerRoot = join(home, '.route-build');
  mkdirSync(observerRoot);
  const observer = createLocalObserver({ root: observerRoot });
  observer.record({
    prompt: 'raw prompt must not persist',
    decision_id: 'decision-1', route_id: 'route-1', selection_id: 'selection-1',
    framework: { runtime: 'claude' }, source: { session_id: 'session-1' },
    metadata: { tool_input: { secret: 'downstream output must not persist' } },
  });
  await observer.flush();
  const raw = readFileSync(observerPaths(observerRoot).events, 'utf8');
  assert.equal(raw.includes('raw prompt must not persist'), false);
  assert.equal(raw.includes('downstream output must not persist'), false);
  const row = JSON.parse(raw);
  assert.equal(row.feedback.decision_id, 'decision-1');
  assert.equal(row.feedback.route_id, 'route-1');
  assert.match(row.feedback.correlation_id, /^[a-f0-9]{32}$/);
});

test('FEED-01: correlation uses stable feedback identity and observed terminal evidence', () => {
  const prompt = {
    event_type: 'prompt', event_id: 'p', ts: 1,
    feedback: { correlation_id: 'same', route_id: 'route-1' },
    source: { session_id: 'session-1' }, outcome: { status: 'routed' }, cost: {},
  };
  const stop = {
    event_type: 'hook', event_id: 's', ts: 2,
    feedback: { correlation_id: 'same' }, source: { event: 'Stop', session_id: 'session-1' },
    cost: { tool_calls: 1 },
  };
  const rows = correlateEvents([prompt, stop]);
  assert.equal(rows[0].outcome.status, 'completed');
  assert.equal(rows[0].outcome.verified, true);
  assert.equal(rows[0].outcome.correlation, 'feedback_id');
});

test('FEED-02/03: health store rejects duplicate fingerprints and selected is not verified credit', () => {
  const health = createHealthStore({ root: root() });
  const canonical = {
    timestamp_ms: 1, capability_id: 'skill:debug', outcome_kind: 'selected',
    prompt_signature: createHash('sha256').update('x').digest('hex'), route_id: 'route-1',
    confidence_band: 'medium', guard_codes: [], reason_code: 'route_selected',
    evidence_window_ms: 0, sample_size: 1, opportunity_count: 1, freshness: 'fresh',
    policy_version: 'health-policy-v2', runtime: 'claude', epoch: null,
  };
  const fingerprint = createHash('sha256').update(stableStringify(canonical)).digest('hex');
  const record = { ...canonical, fingerprint };
  assert.equal(health.append(record).status, 'stored');
  assert.equal(health.append(record).status, 'duplicate');
  const score = scoreCapability({
    outcomes: Array.from({ length: 30 }, () => ({ ...record })),
    contract: null, now: 1000,
  });
  assert.equal(score.signal_breakdown.verified_sample_count, 0);
  assert.equal(score.signal_breakdown.unverified_sample_count, 30);
  assert.equal(score.signal_breakdown.opportunity_exposure, 0);
});
