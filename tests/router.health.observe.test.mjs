// Plan 24-02 Task 1 — HLTH-03 full observation capture. Covers all 9
// outcome_kind derivations from telemetry + workflow-state diff + downstream
// invocation signals, cursor idempotency + rotation reset, and the privacy
// posture (outcome_kind field, sha256-or-null prompt_signature, no raw prompt
// text in any persisted record).
//
// Fixtures: synthetic telemetry.jsonl + workflow-state.json written into a
// mkdtempSync health root; ingestTelemetryEvidence is called once (or twice
// for the idempotency/rotation tests) and outcomes.jsonl is asserted.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { ingestTelemetryEvidence, HEALTH_POLICY_VERSION } from '../src/health/observe.mjs';
import { createHealthStore } from '../src/health/store.mjs';
import { stableCapabilityId } from '../src/registry/identity.mjs';

const SIG = createHash('sha256').update('observe-fixture-prompt').digest('hex');
const CAP = 'skill:debug';
const SUGGESTED_SKILL = [{ canonical_identity: 'skill:debug', scope: { kind: 'global' } }];

function makeRecord({
  ts = 1_700_000_000_000,
  route_id = 'route-001',
  confidence_tier = 'high',
  downstream_invocations = null,
  suggested_skills = SUGGESTED_SKILL,
  prompt_signature = SIG,
  guards_fired = [],
} = {}) {
  return {
    ts,
    prompt_signature,
    suggested_mode: 'gsd-debug',
    suggested_skills,
    suggested_agents: [],
    confidence_tier,
    guards_fired,
    route_id,
    downstream_invocations,
  };
}

function setup({ records, workflowState, cursor = null, now = 1_700_000_000_000 } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'router-health-observe-'));
  const telemetryPath = join(root, 'telemetry.jsonl');
  const workflowStatePath = join(root, 'workflow-state.json');
  const cursorPath = join(root, 'cursor.json');
  writeFileSync(telemetryPath, records.map((r) => JSON.stringify(r)).join('\n') + '\n', { mode: 0o600 });
  if (workflowState !== undefined) {
    writeFileSync(workflowStatePath, JSON.stringify(workflowState) + '\n', { mode: 0o600 });
  }
  if (cursor) writeFileSync(cursorPath, JSON.stringify(cursor), { mode: 0o600 });
  const store = createHealthStore({ root: join(root, 'health') });
  return { root, telemetryPath, workflowStatePath, cursorPath, store, now };
}

function readOutcomes(store) {
  const lines = readFileSync(store.outcomesPath, 'utf8').split('\n').filter((l) => l.length > 0);
  return lines.map((l) => JSON.parse(l));
}

// ---- HLTH-03: all 9 outcome_kind values derivable ----

test('HLTH-03 selected: telemetry record with route_id but no completion signal yields selected', () => {
  const { store, telemetryPath, workflowStatePath, cursorPath, now } = setup({
    records: [makeRecord({ route_id: 'route-sel' })],
    workflowState: { status: 'active', freshness: 'fresh', position: { family: 'gsd', state: 'discussed' }, dependencies_safe: true, gates: {}, last_transition_id: 'gsd.discuss', history: [{ state: 'discussed', ts: 1_700_000_000_000 }] },
  });
  const result = ingestTelemetryEvidence({ store, telemetryPath, workflowStatePath, cursorPath, now });
  assert.equal(result.ingested, 1);
  assert.equal(result.denied, 0);
  assert.equal(result.kind_counts.selected, 1);
  const outcomes = readOutcomes(store);
  assert.equal(outcomes[0].outcome_kind, 'selected');
  assert.equal(outcomes[0].capability_id, CAP);
  assert.equal(outcomes[0].route_id, 'route-sel');
});

test('HLTH-03 completed: workflow-state advanced (new state not in prior history) yields completed', () => {
  const priorWorkflowState = {
    status: 'active', freshness: 'fresh',
    position: { family: 'gsd', state: 'discussed' },
    dependencies_safe: true, gates: { discussion_complete: true },
    last_transition_id: 'gsd.discuss',
    history: [{ state: 'discussed', ts: 1_700_000_000_000 }],
  };
  const currentWorkflowState = {
    status: 'active', freshness: 'fresh',
    position: { family: 'gsd', state: 'plan' },
    dependencies_safe: true, gates: { plan_approved: false },
    last_transition_id: 'gsd.plan',
    history: [{ state: 'discussed', ts: 1_700_000_000_000 }, { state: 'plan', ts: 1_700_000_001_000 }],
  };
  const cursor = {
    size: 0, mtimeMs: 0, lineCount: 0,
    workflowStateMtimeMs: 0,
    priorWorkflowState,
  };
  const { store, telemetryPath, workflowStatePath, cursorPath, now } = setup({
    records: [makeRecord({ route_id: 'route-comp', ts: 1_700_000_000_500 })],
    workflowState: currentWorkflowState,
    cursor,
  });
  const result = ingestTelemetryEvidence({ store, telemetryPath, workflowStatePath, cursorPath, now });
  assert.equal(result.kind_counts.completed, 1, `expected completed, got ${JSON.stringify(result.kind_counts)}`);
  const outcomes = readOutcomes(store);
  assert.equal(outcomes[0].outcome_kind, 'completed');
  assert.equal(outcomes[0].reason_code, 'workflow_advanced');
});

test('HLTH-03 corrected: workflow-state regressed (revisited prior state) yields corrected', () => {
  const priorWorkflowState = {
    status: 'active', freshness: 'fresh',
    position: { family: 'gsd', state: 'plan' },
    dependencies_safe: true, gates: {},
    last_transition_id: 'gsd.plan',
    history: [{ state: 'discussed', ts: 1_000 }, { state: 'plan', ts: 2_000 }],
  };
  // Regressed — workflow went BACK to 'discussed' (a state already in prior history).
  const currentWorkflowState = {
    status: 'active', freshness: 'fresh',
    position: { family: 'gsd', state: 'discussed' },
    dependencies_safe: true, gates: {},
    last_transition_id: 'gsd.discuss',
    history: [{ state: 'discussed', ts: 1_000 }, { state: 'plan', ts: 2_000 }, { state: 'discussed', ts: 3_000 }],
  };
  const cursor = { size: 0, mtimeMs: 0, lineCount: 0, workflowStateMtimeMs: 0, priorWorkflowState };
  const { store, telemetryPath, workflowStatePath, cursorPath, now } = setup({
    records: [makeRecord({ route_id: 'route-corr', ts: 2_500 })],
    workflowState: currentWorkflowState,
    cursor,
  });
  const result = ingestTelemetryEvidence({ store, telemetryPath, workflowStatePath, cursorPath, now });
  assert.equal(result.kind_counts.corrected, 1, `expected corrected, got ${JSON.stringify(result.kind_counts)}`);
  const outcomes = readOutcomes(store);
  assert.equal(outcomes[0].outcome_kind, 'corrected');
  assert.equal(outcomes[0].reason_code, 'workflow_regression');
});

test('HLTH-03 retried: same-state re-dispatch with same transition id yields retried', () => {
  const priorWorkflowState = {
    status: 'active', freshness: 'fresh',
    position: { family: 'gsd', state: 'discussed' },
    dependencies_safe: true, gates: {},
    last_transition_id: 'gsd.discuss',
    history: [{ state: 'discussed', ts: 1_000 }],
  };
  const currentWorkflowState = {
    status: 'active', freshness: 'fresh',
    position: { family: 'gsd', state: 'discussed' },
    dependencies_safe: true, gates: {},
    last_transition_id: 'gsd.discuss',
    history: [{ state: 'discussed', ts: 1_000 }],
  };
  const cursor = { size: 0, mtimeMs: 0, lineCount: 0, workflowStateMtimeMs: 0, priorWorkflowState };
  // now must be WITHIN the 24h evidence window of the record's ts so the
  // abandoned check does not fire before the retried check.
  const { store, telemetryPath, workflowStatePath, cursorPath, now } = setup({
    records: [makeRecord({ route_id: 'route-retry', ts: 1_500 })],
    workflowState: currentWorkflowState,
    cursor,
    now: 1_500 + 60_000, // 1 minute later — well within the 24h window
  });
  const result = ingestTelemetryEvidence({ store, telemetryPath, workflowStatePath, cursorPath, now });
  assert.equal(result.kind_counts.retried, 1, `expected retried, got ${JSON.stringify(result.kind_counts)}`);
  const outcomes = readOutcomes(store);
  assert.equal(outcomes[0].outcome_kind, 'retried');
});

test('HLTH-03 abandoned: no advancement within evidence_window_ms yields abandoned', () => {
  const priorWorkflowState = {
    status: 'active', freshness: 'fresh',
    position: { family: 'gsd', state: 'discussed' },
    dependencies_safe: true, gates: {}, last_transition_id: 'gsd.discuss',
    history: [{ state: 'discussed', ts: 1_000 }],
  };
  const currentWorkflowState = priorWorkflowState; // no advancement
  const cursor = { size: 0, mtimeMs: 0, lineCount: 0, workflowStateMtimeMs: 0, priorWorkflowState };
  const oldTs = 1_000_000; // very old
  // now is 25h after oldTs — beyond the 24h HALF_LIFE_MS window.
  const now = oldTs + 25 * 60 * 60 * 1000;
  const { store, telemetryPath, workflowStatePath, cursorPath } = setup({
    records: [makeRecord({ route_id: 'route-abandon', ts: oldTs })],
    workflowState: currentWorkflowState,
    cursor,
  });
  const result = ingestTelemetryEvidence({ store, telemetryPath, workflowStatePath, cursorPath, now });
  assert.equal(result.kind_counts.abandoned, 1, `expected abandoned, got ${JSON.stringify(result.kind_counts)}`);
  const outcomes = readOutcomes(store);
  assert.equal(outcomes[0].outcome_kind, 'abandoned');
});

test('HLTH-03 actually_used: next record downstream_invocations contains this capability', () => {
  const { store, telemetryPath, workflowStatePath, cursorPath, now } = setup({
    records: [
      makeRecord({ route_id: 'route-a', ts: 1_000 }),
      makeRecord({ route_id: 'route-b', ts: 2_000, downstream_invocations: [CAP] }),
    ],
    workflowState: null, // no workflow-state → fail-open, downstream signal still fires
  });
  const result = ingestTelemetryEvidence({ store, telemetryPath, workflowStatePath, cursorPath, now });
  assert.equal(result.kind_counts.actually_used, 1, `expected actually_used, got ${JSON.stringify(result.kind_counts)}`);
  const outcomes = readOutcomes(store);
  assert.equal(outcomes[0].outcome_kind, 'actually_used');
  assert.equal(outcomes[0].capability_id, CAP);
});

test('HLTH-03 replaced: next record downstream_invocations shows a different capability', () => {
  const { store, telemetryPath, workflowStatePath, cursorPath, now } = setup({
    records: [
      makeRecord({ route_id: 'route-a', ts: 1_000 }),
      makeRecord({ route_id: 'route-b', ts: 2_000, downstream_invocations: ['skill:other'] }),
    ],
    workflowState: null,
  });
  const result = ingestTelemetryEvidence({ store, telemetryPath, workflowStatePath, cursorPath, now });
  assert.equal(result.kind_counts.replaced, 1, `expected replaced, got ${JSON.stringify(result.kind_counts)}`);
  const outcomes = readOutcomes(store);
  assert.equal(outcomes[0].outcome_kind, 'replaced');
});

test('HLTH-03 overridden: next record confidence_tier=user_explicit yields overridden', () => {
  const { store, telemetryPath, workflowStatePath, cursorPath, now } = setup({
    records: [
      makeRecord({ route_id: 'route-a', ts: 1_000 }),
      makeRecord({ route_id: 'route-b', ts: 2_000, confidence_tier: 'user_explicit' }),
    ],
    workflowState: null,
  });
  const result = ingestTelemetryEvidence({ store, telemetryPath, workflowStatePath, cursorPath, now });
  assert.equal(result.kind_counts.overridden, 1, `expected overridden, got ${JSON.stringify(result.kind_counts)}`);
  const outcomes = readOutcomes(store);
  assert.equal(outcomes[0].outcome_kind, 'overridden');
});

test('HLTH-03 helpful_reuse: later record (after next) downstream_invocations contains this cap with different route_id', () => {
  const { store, telemetryPath, workflowStatePath, cursorPath, now } = setup({
    records: [
      makeRecord({ route_id: 'route-a', ts: 1_000 }),
      // next record — no downstream_invocations (so actually_used/replaced don't fire)
      makeRecord({ route_id: 'route-b', ts: 2_000, downstream_invocations: null }),
      // later record — reuses this cap on a different route_id
      makeRecord({ route_id: 'route-c', ts: 3_000, downstream_invocations: [CAP] }),
    ],
    workflowState: null,
  });
  const result = ingestTelemetryEvidence({ store, telemetryPath, workflowStatePath, cursorPath, now });
  assert.equal(result.kind_counts.helpful_reuse, 1, `expected helpful_reuse, got ${JSON.stringify(result.kind_counts)}`);
  const outcomes = readOutcomes(store);
  assert.equal(outcomes[0].outcome_kind, 'helpful_reuse');
});

test('HLTH-03 helpful_reuse precedence: when both replaced (next) and helpful_reuse (later) signals are present, helpful_reuse wins per documented priority 3 > 4', () => {
  const { store, telemetryPath, workflowStatePath, cursorPath, now } = setup({
    records: [
      makeRecord({ route_id: 'route-a', ts: 1_000 }),
      // next record — invokes a DIFFERENT capability (would trigger 'replaced')
      makeRecord({ route_id: 'route-b', ts: 2_000, downstream_invocations: ['skill:other'] }),
      // later record — reuses this cap on a different route_id (helpful_reuse)
      makeRecord({ route_id: 'route-c', ts: 3_000, downstream_invocations: [CAP] }),
    ],
    workflowState: null,
  });
  const result = ingestTelemetryEvidence({ store, telemetryPath, workflowStatePath, cursorPath, now });
  assert.equal(result.kind_counts.helpful_reuse, 1, `expected helpful_reuse to win over replaced, got ${JSON.stringify(result.kind_counts)}`);
  const outcomes = readOutcomes(store);
  assert.equal(outcomes[0].outcome_kind, 'helpful_reuse');
});

test('HLTH-03 actually_used precedence: when next record invokes this cap AND a later record reuses on a different route, actually_used wins per documented priority 2 > 3', () => {
  const { store, telemetryPath, workflowStatePath, cursorPath, now } = setup({
    records: [
      makeRecord({ route_id: 'route-a', ts: 1_000 }),
      // next record — invokes this capability (actually_used signal for route-a)
      makeRecord({ route_id: 'route-b', ts: 2_000, downstream_invocations: [CAP] }),
      // later record — reuses this cap on a different route_id (would trigger helpful_reuse for route-a)
      makeRecord({ route_id: 'route-c', ts: 3_000, downstream_invocations: [CAP] }),
    ],
    workflowState: null,
  });
  const result = ingestTelemetryEvidence({ store, telemetryPath, workflowStatePath, cursorPath, now });
  // The conflict case is on the first record: both signals present. Per the
  // documented priority 2 > 3, actually_used must win and helpful_reuse must
  // NOT be produced for that record. The third record has no next so it
  // falls through to 'selected'; the second record's next is the third
  // (which has CAP) so it is also actually_used — those are unrelated to the
  // conflict assertion, which is why we assert on outcomes[0] and the
  // absence of any helpful_reuse outcome.
  assert.equal(result.kind_counts.helpful_reuse, undefined, `expected no helpful_reuse (actually_used should win), got ${JSON.stringify(result.kind_counts)}`);
  const outcomes = readOutcomes(store);
  assert.equal(outcomes[0].outcome_kind, 'actually_used');
});

// ---- Cursor idempotency + rotation ----

test('HLTH-03 cursor idempotent: second call with no new telemetry lines returns ingested:0, skipped:unchanged', () => {
  const { store, telemetryPath, workflowStatePath, cursorPath, now } = setup({
    records: [makeRecord({ route_id: 'route-a', ts: 1_000 })],
    workflowState: { status: 'active', freshness: 'fresh', position: { family: 'gsd', state: 'discussed' }, dependencies_safe: true, gates: {}, last_transition_id: 'gsd.discuss', history: [{ state: 'discussed', ts: 1_000 }] },
  });
  const first = ingestTelemetryEvidence({ store, telemetryPath, workflowStatePath, cursorPath, now });
  assert.equal(first.ingested, 1);
  const second = ingestTelemetryEvidence({ store, telemetryPath, workflowStatePath, cursorPath, now });
  assert.equal(second.ingested, 0);
  assert.equal(second.skipped, 'unchanged');
});

test('HLTH-03 cursor rotation: telemetry.jsonl shrank resets cursor and re-ingests from line 0', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-health-observe-rot-'));
  const telemetryPath = join(root, 'telemetry.jsonl');
  const workflowStatePath = join(root, 'workflow-state.json');
  const cursorPath = join(root, 'cursor.json');
  const store = createHealthStore({ root: join(root, 'health') });
  writeFileSync(workflowStatePath, JSON.stringify({
    status: 'active', freshness: 'fresh',
    position: { family: 'gsd', state: 'discussed' },
    dependencies_safe: true, gates: {}, last_transition_id: 'gsd.discuss',
    history: [{ state: 'discussed', ts: 1_000 }],
  }) + '\n', { mode: 0o600 });

  // First ingest — two records.
  writeFileSync(telemetryPath, [makeRecord({ route_id: 'r1', ts: 1_000 }), makeRecord({ route_id: 'r2', ts: 2_000 })].map(JSON.stringify).join('\n') + '\n', { mode: 0o600 });
  const now = 1_700_000_000_000;
  const first = ingestTelemetryEvidence({ store, telemetryPath, workflowStatePath, cursorPath, now });
  assert.equal(first.ingested, 2);

  // Rotation — overwrite telemetry.jsonl with a single new record (smaller file).
  writeFileSync(telemetryPath, JSON.stringify(makeRecord({ route_id: 'r3', ts: 3_000 })) + '\n', { mode: 0o600 });
  const second = ingestTelemetryEvidence({ store, telemetryPath, workflowStatePath, cursorPath, now });
  assert.equal(second.ingested, 1, `expected 1 re-ingested after rotation, got ${second.ingested} (skipped=${second.skipped})`);
  assert.equal(second.skipped, 'full', `expected 'full' on rotation reset, got ${second.skipped}`);
});

// ---- Privacy posture ----

test('HLTH-03 privacy: every persisted record carries outcome_kind (never outcome), sha256-or-null prompt_signature, no raw prompt text', () => {
  const { store, telemetryPath, workflowStatePath, cursorPath, now } = setup({
    records: [
      makeRecord({ route_id: 'route-a', ts: 1_000, prompt_signature: SIG }),
      makeRecord({ route_id: 'route-b', ts: 2_000, prompt_signature: null, guards_fired: ['deny_filtered'] }),
    ],
    workflowState: null,
  });
  ingestTelemetryEvidence({ store, telemetryPath, workflowStatePath, cursorPath, now });
  const lines = readFileSync(store.outcomesPath, 'utf8');
  // No raw prompt fixture text leaks.
  assert.ok(!lines.includes('observe-fixture-prompt'), 'raw prompt text leaked into outcomes.jsonl');
  // No bare `outcome` field (D-6) — only `outcome_kind`.
  assert.ok(!/"outcome"\s*:/.test(lines), 'forbidden bare "outcome" field present (D-6 collision)');
  assert.ok(/"outcome_kind"\s*:/.test(lines), 'outcome_kind field missing');
  // No forbidden content fields.
  for (const forbidden of ['"prompt"', '"prompt_text"', '"transcript"', '"output"', '"content"', '"source"', '"argument"']) {
    assert.ok(!lines.includes(forbidden), `forbidden field ${forbidden} present`);
  }
  const outcomes = readOutcomes(store);
  for (const o of outcomes) {
    assert.ok(typeof o.outcome_kind === 'string');
    assert.ok(o.prompt_signature === null || /^[a-f0-9]{64}$/.test(o.prompt_signature));
    assert.equal(o.policy_version, HEALTH_POLICY_VERSION);
  }
});

test('HLTH-03 cursor file has 0600 perms (T-24-09)', () => {
  const { store, telemetryPath, workflowStatePath, cursorPath, now } = setup({
    records: [makeRecord({ route_id: 'route-a', ts: 1_000 })],
    workflowState: null,
  });
  ingestTelemetryEvidence({ store, telemetryPath, workflowStatePath, cursorPath, now });
  const mode = statSync(cursorPath).mode & 0o777;
  assert.equal(mode, 0o600, `expected 0600 cursor perms, got 0o${mode.toString(8)}`);
});

test('HLTH-03 fail-open: missing workflow-state.json yields selected (T-24-11, never throws)', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-health-observe-missing-'));
  const telemetryPath = join(root, 'telemetry.jsonl');
  const workflowStatePath = join(root, 'workflow-state.json'); // never written
  const cursorPath = join(root, 'cursor.json');
  writeFileSync(telemetryPath, JSON.stringify(makeRecord({ route_id: 'route-a', ts: 1_000 })) + '\n', { mode: 0o600 });
  const store = createHealthStore({ root: join(root, 'health') });
  const result = ingestTelemetryEvidence({ store, telemetryPath, workflowStatePath, cursorPath, now: 1_700_000_000_000 });
  assert.equal(result.ingested, 1);
  assert.equal(result.kind_counts.selected, 1);
});

test('HLTH-03 fail-open: corrupt workflow-state.json yields selected (T-24-11, never throws)', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-health-observe-corrupt-'));
  const telemetryPath = join(root, 'telemetry.jsonl');
  const workflowStatePath = join(root, 'workflow-state.json');
  const cursorPath = join(root, 'cursor.json');
  writeFileSync(telemetryPath, JSON.stringify(makeRecord({ route_id: 'route-a', ts: 1_000 })) + '\n', { mode: 0o600 });
  writeFileSync(workflowStatePath, '{ this is not json', { mode: 0o600 });
  const store = createHealthStore({ root: join(root, 'health') });
  const result = ingestTelemetryEvidence({ store, telemetryPath, workflowStatePath, cursorPath, now: 1_700_000_000_000 });
  assert.equal(result.ingested, 1);
  assert.equal(result.kind_counts.selected, 1);
});

test('HLTH-03 records without route_id are skipped (not ingested, not denied)', () => {
  const { store, telemetryPath, workflowStatePath, cursorPath, now } = setup({
    records: [
      { ...makeRecord({ route_id: 'route-a', ts: 1_000 }), route_id: undefined }, // no route_id
      makeRecord({ route_id: 'route-b', ts: 2_000 }),
    ],
    workflowState: null,
  });
  const result = ingestTelemetryEvidence({ store, telemetryPath, workflowStatePath, cursorPath, now });
  assert.equal(result.ingested, 1);
  assert.equal(result.kind_counts.selected, 1);
  // The record without route_id is silently skipped (not counted as denied —
  // it is not outcome-eligible, not malformed).
  assert.equal(result.denied, 0);
});