import { test } from 'node:test';
import assert from 'node:assert/strict';

const bridgeUrl = new URL('../src/evolution/telemetry-bridge.mjs', import.meta.url);
const evidenceUrl = new URL('../src/evolution/evidence.mjs', import.meta.url);

function baseTelemetryRecord(overrides = {}) {
  return {
    ts: 1_700_000_000_000,
    prompt_signature: 'a'.repeat(64),
    suggested_mode: 'gsd-debug',
    suggested_skills: [],
    suggested_agents: [],
    confidence_tier: 'high',
    invoke_kind: 'skill',
    graphify_queried: false,
    guards_fired: ['route_selected'],
    downstream_invocations: null,
    outcome: null,
    latency_ms: 12,
    ...overrides,
  };
}

test('Task1.1 telemetry→evidence field mapping produces an accepted envelope', async () => {
  const { telemetryRecordToEvidence } = await import(bridgeUrl);
  const { validateEvidenceEnvelope } = await import(evidenceUrl);
  const record = baseTelemetryRecord();
  const result = telemetryRecordToEvidence(record);
  assert.equal(result.status, 'accepted', `expected accepted, got ${JSON.stringify(result)}`);
  const sig = result.signal;
  assert.equal(sig.timestamp_ms, 1_700_000_000_000);
  assert.equal(sig.route_id, 'gsd-debug');
  assert.equal(sig.confidence_band, 'high');
  assert.deepEqual(sig.guard_codes, ['route_selected']);
  assert.equal(sig.reason_code, 'route_selected');
  assert.equal(sig.fixture_class, 'minimal-prompt');
  assert.equal(sig.latency_us, 12_000);
  assert.equal(sig.verdict, 'success');
  assert.equal(sig.policy_version, 'workflow-transitions-v1');
  assert.equal(sig.candidate_version, 'steady-state-v1');
  assert.equal(sig.prompt_signature, 'a'.repeat(64));
  // validateEvidenceEnvelope independently accepts the same envelope shape
  const direct = validateEvidenceEnvelope({
    timestamp_ms: sig.timestamp_ms,
    route_id: sig.route_id,
    confidence_band: sig.confidence_band,
    guard_codes: sig.guard_codes,
    reason_code: sig.reason_code,
    fixture_class: sig.fixture_class,
    latency_us: sig.latency_us,
    candidate_version: sig.candidate_version,
    policy_version: sig.policy_version,
    verdict: sig.verdict,
    prompt_signature: sig.prompt_signature,
  });
  assert.equal(direct.status, 'accepted');
});

test('Task1.2 privacy-denied records are skipped, not emitted as envelopes', async () => {
  const { telemetryRecordToEvidence } = await import(bridgeUrl);
  // deny_filtered confidence_tier
  const deniedTier = telemetryRecordToEvidence(baseTelemetryRecord({ confidence_tier: 'deny_filtered', prompt_signature: null }));
  assert.equal(deniedTier.status, 'skipped');
  assert.equal(deniedTier.reason_code, 'not_canary_evidence');
  // privacy guard code in guards_fired
  const deniedGuard = telemetryRecordToEvidence(baseTelemetryRecord({ guards_fired: ['deny_filtered', 'route_selected'], prompt_signature: null }));
  assert.equal(deniedGuard.status, 'skipped');
  assert.equal(deniedGuard.reason_code, 'not_canary_evidence');
});

test('Task1.3 fixture_class classification across confidence_tier + invoke_kind', async () => {
  const { telemetryRecordToEvidence } = await import(bridgeUrl);
  // user_explicit → explicit-override
  const explicit = telemetryRecordToEvidence(baseTelemetryRecord({ confidence_tier: 'user_explicit' }));
  assert.equal(explicit.status, 'accepted');
  assert.equal(explicit.signal.fixture_class, 'explicit-override');
  assert.equal(explicit.signal.reason_code, 'user_explicit');
  // stale → stale-context
  const stale = telemetryRecordToEvidence(baseTelemetryRecord({ confidence_tier: 'stale' }));
  assert.equal(stale.status, 'accepted');
  assert.equal(stale.signal.fixture_class, 'stale-context');
  assert.equal(stale.signal.reason_code, 'stale_context');
  // invoke_kind='agent' with high → dependency
  const agent = telemetryRecordToEvidence(baseTelemetryRecord({ invoke_kind: 'agent' }));
  assert.equal(agent.status, 'accepted');
  assert.equal(agent.signal.fixture_class, 'dependency');
  // trivial / reentry_skipped / manifest_missing / null suggested_mode → skipped
  const trivial = telemetryRecordToEvidence(baseTelemetryRecord({ confidence_tier: 'trivial' }));
  assert.equal(trivial.status, 'skipped');
  const reentry = telemetryRecordToEvidence(baseTelemetryRecord({ confidence_tier: 'reentry_skipped' }));
  assert.equal(reentry.status, 'skipped');
  const manifestMissing = telemetryRecordToEvidence(baseTelemetryRecord({ confidence_tier: 'manifest_missing' }));
  assert.equal(manifestMissing.status, 'skipped');
  const noMode = telemetryRecordToEvidence(baseTelemetryRecord({ suggested_mode: null }));
  assert.equal(noMode.status, 'skipped');
  assert.equal(noMode.reason_code, 'no_route');
});

test('Task1.4 verdict is always success (v1 policy)', async () => {
  const { telemetryRecordToEvidence } = await import(bridgeUrl);
  const result = telemetryRecordToEvidence(baseTelemetryRecord({ outcome: null }));
  assert.equal(result.status, 'accepted');
  assert.equal(result.signal.verdict, 'success');
  // even when telemetry outcome is null, verdict stays success
  const result2 = telemetryRecordToEvidence(baseTelemetryRecord({ outcome: null, confidence_tier: 'medium' }));
  assert.equal(result2.signal.verdict, 'success');
});

test('Task1.5 candidate_version is a parameter with steady-state-v1 default', async () => {
  const { telemetryRecordToEvidence } = await import(bridgeUrl);
  const withVersion = telemetryRecordToEvidence(baseTelemetryRecord(), { candidate_version: 'v1-canary-abc' });
  assert.equal(withVersion.status, 'accepted');
  assert.equal(withVersion.signal.candidate_version, 'v1-canary-abc');
  const defaultVersion = telemetryRecordToEvidence(baseTelemetryRecord());
  assert.equal(defaultVersion.signal.candidate_version, 'steady-state-v1');
});

test('Task1.6 bridge never emits a field outside the FIELDS set', async () => {
  const { telemetryRecordToEvidence } = await import(bridgeUrl);
  const { validateEvidenceEnvelope } = await import(evidenceUrl);
  const result = telemetryRecordToEvidence(baseTelemetryRecord());
  assert.equal(result.status, 'accepted');
  // The emitted signal must contain exactly the 11 allowlisted fields
  const allowed = new Set([
    'timestamp_ms', 'route_id', 'confidence_band', 'guard_codes', 'reason_code',
    'fixture_class', 'latency_us', 'candidate_version', 'policy_version', 'verdict',
    'prompt_signature',
  ]);
  assert.deepEqual(new Set(Object.keys(result.signal)), allowed);
  // An envelope with an extra field is denied by validateEvidenceEnvelope
  const extra = { ...result.signal, raw_prompt: 'leak' };
  const denied = validateEvidenceEnvelope(extra);
  assert.equal(denied.status, 'denied');
  assert.equal(denied.reason_code, 'forbidden_evidence_field');
});

test('Task1.7 latency_ms → latency_us unit conversion (×1000)', async () => {
  const { telemetryRecordToEvidence } = await import(bridgeUrl);
  const result = telemetryRecordToEvidence(baseTelemetryRecord({ latency_ms: 12 }));
  assert.equal(result.status, 'accepted');
  assert.equal(result.signal.latency_us, 12_000);
  // missing latency_ms defaults to 0
  const zero = telemetryRecordToEvidence(baseTelemetryRecord({ latency_ms: undefined }));
  assert.equal(zero.signal.latency_us, 0);
  // bounds enforced by validateEvidenceEnvelope (0–10_000_000)
  // 10_001 ms → 10_001_000 us → exceeds bound → denied
  const tooHigh = telemetryRecordToEvidence(baseTelemetryRecord({ latency_ms: 10_001 }));
  assert.equal(tooHigh.status, 'denied');
  assert.equal(tooHigh.reason_code, 'invalid_latency');
});