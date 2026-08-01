// Plan 24-01 Task 2 — HLTH-01/03/04 schema unit suite. Covers the frozen
// OUTCOME_FIELDS allowlist, the 9-value OUTCOME_KINDS enum, the privacy
// posture (deny_filtered → null signature), bounded integer ranges, the
// fingerprint 64-hex validator, the framework-prefix capability_id guard
// (Pitfall 3), and the field_too_long guard (Pitfall 5).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  validateOutcomeEnvelope,
  OUTCOME_FIELDS,
  OUTCOME_KINDS,
  OUTCOME_KIND,
} from '../src/health/outcome-schema.mjs';
import { MAX_RETENTION_MS } from '../src/evolution/evidence.mjs';
import { stableStringify } from '../src/registry/schema.mjs';

const VALID_SIG = createHash('sha256').update('schema-fixture').digest('hex');

function baseRecord(overrides = {}) {
  const canonical = {
    timestamp_ms: 1700000000000,
    capability_id: 'skill:debug',
    outcome_kind: 'selected',
    prompt_signature: VALID_SIG,
    route_id: 'route-001',
    confidence_band: 'high',
    guard_codes: [],
    reason_code: 'route_selected',
    evidence_window_ms: 0,
    sample_size: 1,
    opportunity_count: 1,
    freshness: 'fresh',
    policy_version: 'health-policy-v1',
    fingerprint: createHash('sha256').update('canonical-record').digest('hex'),
  };
  // Recompute fingerprint over the canonical record (minus fingerprint) so the
  // record is internally consistent when no fingerprint override is supplied.
  // Must use stableStringify (sorted keys) to match validateOutcomeEnvelope's
  // recomputation (CR-01: fingerprint is now a content integrity anchor).
  if (overrides.fingerprint === undefined) {
    const { fingerprint, ...rest } = { ...canonical, ...overrides };
    const recomputed = createHash('sha256').update(stableStringify(rest), 'utf8').digest('hex');
    return { ...rest, fingerprint: recomputed };
  }
  return { ...canonical, ...overrides };
}

test('HLTH-03: OUTCOME_KINDS covers all 9 dispositions', () => {
  assert.equal(OUTCOME_KINDS.size, 9);
  for (const kind of Object.values(OUTCOME_KIND)) assert.ok(OUTCOME_KINDS.has(kind), `missing ${kind}`);
});

test('HLTH-03: validateOutcomeEnvelope accepts every OUTCOME_KINDS value', () => {
  for (const kind of OUTCOME_KINDS) {
    const verdict = validateOutcomeEnvelope(baseRecord({ outcome_kind: kind }));
    assert.equal(verdict.status, 'accepted', `kind ${kind} rejected: ${verdict.reason_code}`);
  }
});

test('HLTH-03: validateOutcomeEnvelope rejects an invalid outcome_kind with invalid_outcome_kind', () => {
  const verdict = validateOutcomeEnvelope(baseRecord({ outcome_kind: 'not_a_real_kind' }));
  assert.equal(verdict.status, 'denied');
  assert.equal(verdict.reason_code, 'invalid_outcome_kind');
});

test('HLTH-01: OUTCOME_FIELDS allowlist is frozen and final (16 fields)', () => {
  assert.ok(Object.isFrozen(OUTCOME_FIELDS));
  assert.equal(OUTCOME_FIELDS.size, 16);
  for (const f of ['timestamp_ms', 'capability_id', 'outcome_kind', 'prompt_signature', 'route_id', 'confidence_band', 'guard_codes', 'reason_code', 'evidence_window_ms', 'sample_size', 'opportunity_count', 'freshness', 'policy_version', 'fingerprint', 'runtime', 'epoch']) {
    assert.ok(OUTCOME_FIELDS.has(f), `FIELDS missing ${f}`);
  }
});

test('HLTH-01: every forbidden field name is rejected with forbidden_outcome_field', () => {
  for (const field of ['prompt', 'prompt_text', 'transcript', 'output', 'content', 'source', 'argument']) {
    const verdict = validateOutcomeEnvelope(baseRecord({ [field]: 'leaked' }));
    assert.equal(verdict.status, 'denied', `${field} was accepted`);
    assert.equal(verdict.reason_code, 'forbidden_outcome_field', `${field} rejected with wrong reason: ${verdict.reason_code}`);
  }
});

test('HLTH-01: deny_filtered record with non-null prompt_signature is rejected with privacy_signature_forbidden', () => {
  const verdict = validateOutcomeEnvelope(baseRecord({ guard_codes: ['deny_filtered'], prompt_signature: VALID_SIG }));
  assert.equal(verdict.status, 'denied');
  assert.equal(verdict.reason_code, 'privacy_signature_forbidden');
});

test('HLTH-01: deny_filtered record with prompt_signature=null is accepted', () => {
  const verdict = validateOutcomeEnvelope(baseRecord({ guard_codes: ['deny_filtered'], prompt_signature: null }));
  assert.equal(verdict.status, 'accepted');
  assert.equal(verdict.signal.prompt_signature, null);
});

test('HLTH-04: evidence_window_ms bounded to [0, MAX_RETENTION_MS]', () => {
  assert.equal(validateOutcomeEnvelope(baseRecord({ evidence_window_ms: -1 })).reason_code, 'invalid_evidence_window');
  assert.equal(validateOutcomeEnvelope(baseRecord({ evidence_window_ms: MAX_RETENTION_MS + 1 })).reason_code, 'invalid_evidence_window');
  assert.equal(validateOutcomeEnvelope(baseRecord({ evidence_window_ms: MAX_RETENTION_MS })).status, 'accepted');
  assert.equal(validateOutcomeEnvelope(baseRecord({ evidence_window_ms: 0 })).status, 'accepted');
});

test('HLTH-04: sample_size and opportunity_count bounded to [0, 10_000_000]', () => {
  assert.equal(validateOutcomeEnvelope(baseRecord({ sample_size: -1 })).reason_code, 'invalid_sample_size');
  assert.equal(validateOutcomeEnvelope(baseRecord({ sample_size: 10_000_001 })).reason_code, 'invalid_sample_size');
  assert.equal(validateOutcomeEnvelope(baseRecord({ opportunity_count: -1 })).reason_code, 'invalid_opportunity_count');
  assert.equal(validateOutcomeEnvelope(baseRecord({ opportunity_count: 10_000_001 })).reason_code, 'invalid_opportunity_count');
  assert.equal(validateOutcomeEnvelope(baseRecord({ sample_size: 10_000_000, opportunity_count: 10_000_000 })).status, 'accepted');
});

test('HLTH-04: fingerprint must be a 64-hex sha256', () => {
  assert.equal(validateOutcomeEnvelope(baseRecord({ fingerprint: 'not-a-hash' })).reason_code, 'invalid_fingerprint');
  assert.equal(validateOutcomeEnvelope(baseRecord({ fingerprint: 'abcd'.repeat(8) + 'x' })).reason_code, 'invalid_fingerprint');
  assert.equal(validateOutcomeEnvelope(baseRecord({ fingerprint: 123 })).reason_code, 'invalid_fingerprint');
});

test('CR-01: a valid-format but content-mismatched fingerprint is rejected with fingerprint_mismatch', () => {
  // Build a canonical record with a correctly-computed fingerprint, then
  // tamper with a field after the fingerprint is set. The validator must
  // recompute the fingerprint over the canonical record (fingerprint stripped)
  // and reject the mismatch.
  const valid = baseRecord();
  // Tamper: bump timestamp_ms but keep the (now-stale) valid fingerprint.
  const tampered = { ...valid, timestamp_ms: valid.timestamp_ms + 1000 };
  const verdict = validateOutcomeEnvelope(tampered);
  assert.equal(verdict.status, 'denied', 'content-mismatched fingerprint was accepted');
  assert.equal(verdict.reason_code, 'fingerprint_mismatch');
  // Sanity: an unrelated 64-hex string also fails the content check.
  const arbitrary = { ...valid, fingerprint: '0'.repeat(64) };
  assert.equal(validateOutcomeEnvelope(arbitrary).reason_code, 'fingerprint_mismatch');
});

test('HLTH-04 / Pitfall 5: a string field longer than 128 chars is rejected with field_too_long', () => {
  const long = 'x'.repeat(129);
  for (const field of ['capability_id', 'route_id', 'reason_code', 'freshness', 'policy_version']) {
    const verdict = validateOutcomeEnvelope(baseRecord({ [field]: long }));
    assert.equal(verdict.status, 'denied', `${field} too-long value was accepted`);
    assert.equal(verdict.reason_code, 'field_too_long', `${field} rejected with wrong reason: ${verdict.reason_code}`);
  }
});

test('HLTH-03 / Pitfall 3: framework-prefixed capability_id (gsd-/gstack-/codex-) rejected with invalid_capability_id', () => {
  for (const prefix of ['gsd-', 'gstack-', 'codex-']) {
    const verdict = validateOutcomeEnvelope(baseRecord({ capability_id: `${prefix}debug` }));
    assert.equal(verdict.status, 'denied', `${prefix} prefix was accepted`);
    assert.equal(verdict.reason_code, 'invalid_capability_id');
  }
});

test('HLTH-04: invalid_timestamp rejects negative / non-integer / missing timestamp_ms', () => {
  assert.equal(validateOutcomeEnvelope(baseRecord({ timestamp_ms: -1 })).reason_code, 'invalid_timestamp');
  assert.equal(validateOutcomeEnvelope(baseRecord({ timestamp_ms: 1.5 })).reason_code, 'invalid_timestamp');
});

test('HLTH-04: invalid_guard_codes rejects non-array / over-long codes', () => {
  assert.equal(validateOutcomeEnvelope(baseRecord({ guard_codes: 'not-array' })).reason_code, 'invalid_guard_codes');
  assert.equal(validateOutcomeEnvelope(baseRecord({ guard_codes: ['x'.repeat(65)] })).reason_code, 'invalid_guard_codes');
  const tooMany = Array.from({ length: 17 }, (_, i) => `g${i}`);
  assert.equal(validateOutcomeEnvelope(baseRecord({ guard_codes: tooMany })).reason_code, 'invalid_guard_codes');
});

test('WR-02: runtime/epoch bound at the outcome trust boundary', () => {
  // Over-length values hit the generic field_too_long guard (same hardening the
  // other string fields get).
  assert.equal(validateOutcomeEnvelope(baseRecord({ runtime: 'x'.repeat(129) })).reason_code, 'field_too_long');
  assert.equal(validateOutcomeEnvelope(baseRecord({ epoch: 'x'.repeat(129) })).reason_code, 'field_too_long');
  // runtime is a short enum ('claude'|'codex'); any other string is rejected.
  assert.equal(validateOutcomeEnvelope(baseRecord({ runtime: 'not-a-runtime' })).reason_code, 'invalid_runtime');
  // Valid enum runtime + null/absent epoch stay accepted (additive, not broken).
  assert.equal(validateOutcomeEnvelope(baseRecord({ runtime: 'claude', epoch: null })).status, 'accepted');
  assert.equal(validateOutcomeEnvelope(baseRecord({ runtime: 'codex', epoch: null })).status, 'accepted');
  assert.equal(validateOutcomeEnvelope(baseRecord()).status, 'accepted');
});