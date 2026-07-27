// Plan 24-01 Task 1 — end-to-end tracer: telemetry fixture → observe('selected')
// → validateOutcomeEnvelope → store.append → admin.inspect.
//
// Asserts the full privacy posture on the single path: 0600 perms on
// outcomes.jsonl, no raw prompt text in any persisted record, OUTCOME_KINDS
// has exactly 9 members, and the three denials (forbidden_outcome_field,
// invalid_capability_id for a gsd- prefix, privacy_signature_forbidden for a
// deny_filtered record with a non-null signature) all fire.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { deriveSelectedOutcome, HEALTH_POLICY_VERSION } from '../src/health/observe.mjs';
import { createHealthStore } from '../src/health/store.mjs';
import { inspect } from '../src/health/admin.mjs';
import { validateOutcomeEnvelope, OUTCOME_KINDS, OUTCOME_KIND } from '../src/health/outcome-schema.mjs';
import { stableCapabilityId } from '../src/registry/identity.mjs';

const VALID_SIGNATURE = createHash('sha256').update('tracer-fixture-prompt').digest('hex');

function makeTelemetryFixture({ prompt_signature = VALID_SIGNATURE, guard_codes = [], route_id = 'route-001', suggested_skills = [{ canonical_identity: 'skill:debug', scope: { kind: 'global' } }] } = {}) {
  return {
    ts: 1700000000000,
    prompt_signature,
    suggested_mode: 'gsd-debug',
    suggested_skills,
    suggested_agents: [],
    confidence_tier: 'high',
    guards_fired: guard_codes,
    route_id,
  };
}

test('HLTH-03: OUTCOME_KINDS enum has exactly 9 members', () => {
  assert.equal(OUTCOME_KINDS.size, 9, `expected 9 outcome kinds, got ${OUTCOME_KINDS.size}`);
  const expected = ['selected', 'actually_used', 'completed', 'corrected', 'retried', 'replaced', 'abandoned', 'overridden', 'helpful_reuse'];
  for (const kind of expected) assert.ok(OUTCOME_KINDS.has(kind), `missing kind: ${kind}`);
  assert.equal(OUTCOME_KIND.SELECTED, 'selected');
  assert.equal(OUTCOME_KIND.HELPFUL_REUSE, 'helpful_reuse');
});

test('tracer: telemetry → observe → store.append → admin.inspect end-to-end', () => {
  const healthRoot = mkdtempSync(join(tmpdir(), 'router-health-tracer-'));
  const store = createHealthStore({ root: healthRoot });
  const fixture = makeTelemetryFixture();
  const observed = deriveSelectedOutcome(fixture, { stableCapabilityIdFn: stableCapabilityId });
  assert.equal(observed.status, 'accepted', `observe denied: ${JSON.stringify(observed)}`);

  const appended = store.append(observed.signal);
  assert.equal(appended.status, 'stored', `store.append denied: ${JSON.stringify(appended)}`);

  const result = inspect({ healthRoot, limit: 100, offset: 0 });
  assert.equal(result.ok, true);
  assert.equal(result.reason_code, 'inspect_ok');
  assert.equal(result.data.total, 1);
  assert.equal(result.data.records.length, 1);

  const persisted = result.data.records[0];
  assert.equal(persisted.outcome_kind, 'selected');
  assert.equal(persisted.capability_id, 'skill:debug');
  assert.equal(persisted.route_id, 'route-001');
  assert.equal(persisted.confidence_band, 'high');
  assert.equal(persisted.policy_version, HEALTH_POLICY_VERSION);
  assert.equal(persisted.prompt_signature, VALID_SIGNATURE);
  assert.match(persisted.fingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(persisted.guard_codes, []);
});

test('tracer: outcomes.jsonl has 0600 perms (HLTH-02)', () => {
  const healthRoot = mkdtempSync(join(tmpdir(), 'router-health-perms-'));
  const store = createHealthStore({ root: healthRoot });
  const observed = deriveSelectedOutcome(makeTelemetryFixture(), { stableCapabilityIdFn: stableCapabilityId });
  store.append(observed.signal);
  const mode = statSync(store.outcomesPath).mode & 0o777;
  assert.equal(mode, 0o600, `expected 0600 perms, got 0o${mode.toString(8)}`);
});

test('tracer: no raw prompt text appears in the persisted record (HLTH-01)', () => {
  const healthRoot = mkdtempSync(join(tmpdir(), 'router-health-privacy-'));
  const store = createHealthStore({ root: healthRoot });
  const observed = deriveSelectedOutcome(makeTelemetryFixture(), { stableCapabilityIdFn: stableCapabilityId });
  store.append(observed.signal);
  const line = readFileSync(store.outcomesPath, 'utf8');
  // The fixture's prompt content ('tracer-fixture-prompt') must never appear.
  assert.ok(!line.includes('tracer-fixture-prompt'), 'raw prompt text leaked into outcomes.jsonl');
  // No field named prompt, prompt_text, transcript, output, content, source, or argument.
  assert.ok(!/"prompt"\s*:/.test(line), 'forbidden "prompt" field present');
  assert.ok(!/"prompt_text"\s*:/.test(line), 'forbidden "prompt_text" field present');
  assert.ok(!/"transcript"\s*:/.test(line), 'forbidden "transcript" field present');
  assert.ok(!/"output"\s*:/.test(line), 'forbidden "output" field present');
  assert.ok(!/"content"\s*:/.test(line), 'forbidden "content" field present');
  assert.ok(!/"source"\s*:/.test(line), 'forbidden "source" field present');
  assert.ok(!/"argument"\s*:/.test(line), 'forbidden "argument" field present');
});

test('HLTH-01: validateOutcomeEnvelope rejects an extra prompt_text field with forbidden_outcome_field', () => {
  const observed = deriveSelectedOutcome(makeTelemetryFixture(), { stableCapabilityIdFn: stableCapabilityId });
  assert.equal(observed.status, 'accepted');
  const tainted = { ...observed.signal, prompt_text: 'leaked' };
  const verdict = validateOutcomeEnvelope(tainted);
  assert.equal(verdict.status, 'denied');
  assert.equal(verdict.reason_code, 'forbidden_outcome_field');
});

test('HLTH-03 / Pitfall 3: validateOutcomeEnvelope rejects a gsd- framework-prefixed capability_id with invalid_capability_id', () => {
  const fixture = makeTelemetryFixture({
    suggested_skills: [{ canonical_identity: 'gsd-debug', scope: { kind: 'global' } }],
  });
  const observed = deriveSelectedOutcome(fixture, { stableCapabilityIdFn: stableCapabilityId });
  // stableCapabilityId returns 'gsd-debug' for canonical_identity='gsd-debug';
  // the schema's framework-prefix guard (Pitfall 3) must reject it.
  assert.equal(observed.status, 'denied');
  assert.equal(observed.reason_code, 'invalid_capability_id');
});

test('HLTH-01: privacy_signature_forbidden — deny_filtered record with non-null prompt_signature is rejected', () => {
  const fixture = makeTelemetryFixture({
    prompt_signature: VALID_SIGNATURE,
    guard_codes: ['deny_filtered'],
  });
  // The telemetry record itself is privacy-denied but carries a non-null
  // signature — the observer passes it through; the envelope validator must
  // reject it with privacy_signature_forbidden (HLTH-01).
  const observed = deriveSelectedOutcome(fixture, { stableCapabilityIdFn: stableCapabilityId });
  assert.equal(observed.status, 'denied');
  assert.equal(observed.reason_code, 'privacy_signature_forbidden');
});

test('HLTH-01: deny_filtered record with prompt_signature=null is accepted', () => {
  const fixture = makeTelemetryFixture({
    prompt_signature: null,
    guard_codes: ['deny_filtered'],
  });
  const observed = deriveSelectedOutcome(fixture, { stableCapabilityIdFn: stableCapabilityId });
  assert.equal(observed.status, 'accepted', `expected accepted, got ${JSON.stringify(observed)}`);
  assert.equal(observed.signal.prompt_signature, null);
  assert.ok(observed.signal.guard_codes.includes('deny_filtered'));
});

test('store.append rejects a denied record and does not write it', () => {
  const healthRoot = mkdtempSync(join(tmpdir(), 'router-health-deny-'));
  const store = createHealthStore({ root: healthRoot });
  // Construct a record with a forbidden field; store.append re-validates.
  const tainted = {
    timestamp_ms: 1700000000000,
    capability_id: 'skill:debug',
    outcome_kind: 'selected',
    prompt_signature: VALID_SIGNATURE,
    route_id: 'route-001',
    confidence_band: 'high',
    guard_codes: [],
    reason_code: 'route_selected',
    evidence_window_ms: 0,
    sample_size: 1,
    opportunity_count: 1,
    freshness: 'fresh',
    policy_version: HEALTH_POLICY_VERSION,
    fingerprint: createHash('sha256').update('x').digest('hex'),
    prompt_text: 'leaked',
  };
  const appended = store.append(tainted);
  assert.equal(appended.status, 'denied');
  assert.equal(appended.reason_code, 'forbidden_outcome_field');
  assert.equal(store.count(), 0);
});