import { test } from 'node:test';
import assert from 'node:assert/strict';

const evidenceUrl = new URL('../src/evolution/evidence.mjs', import.meta.url);

function validSignal(overrides = {}) {
  return {
    timestamp_ms: 1_750_000_000_000,
    route_id: 'gsd-debug',
    confidence_band: 'high',
    guard_codes: [],
    reason_code: 'route_selected',
    fixture_class: 'dependency',
    latency_us: 24_000,
    candidate_version: 'candidate-v1',
    policy_version: 'policy-v1',
    verdict: 'success',
    prompt_signature: 'a'.repeat(64),
    ...overrides,
  };
}

test('D-05 accepts only the bounded content-free telemetry vocabulary', async () => {
  const { validateEvidenceEnvelope } = await import(evidenceUrl);
  const result = validateEvidenceEnvelope(validSignal());
  assert.equal(result.status, 'accepted');
  assert.deepEqual(Object.keys(result.signal).sort(), Object.keys(validSignal()).sort());

  for (const mutation of [
    { confidence_band: 'certain' },
    { fixture_class: 'unknown' },
    { verdict: 'maybe' },
    { latency_us: 10_000_001 },
    { route_id: 'x'.repeat(129) },
    { guard_codes: Array.from({ length: 17 }, (_, i) => `g${i}`) },
  ]) {
    assert.equal(validateEvidenceEnvelope(validSignal(mutation)).status, 'denied');
  }
});

test('D-06 rejects forbidden or unknown content before hashing or persistence', async () => {
  const { createEvidenceJournal } = await import(evidenceUrl);
  const forbidden = [
    { prompt: 'debug my secret prompt' },
    { context: { body: 'conversation content' } },
    { conversation_history: ['private'] },
    { secret: 'sk-secret' },
    { capability_payload: { command: 'shell text' } },
    { reversible_text: 'raw words' },
    { unknown_field: true },
  ];

  for (const extra of forbidden) {
    let writes = 0;
    let hashes = 0;
    const journal = createEvidenceJournal({
      write: () => { writes += 1; },
      hash: () => { hashes += 1; return 'unused'; },
    });
    const result = journal.append({ ...validSignal(), ...extra }, { project_id: 'project-a' });
    assert.deepEqual(result, { status: 'denied', reason_code: 'forbidden_evidence_field' });
    assert.equal(writes, 0);
    assert.equal(hashes, 0);
  }
});

test('D-06 privacy guards suppress prompt signatures', async () => {
  const { createEvidenceJournal } = await import(evidenceUrl);
  const writes = [];
  const journal = createEvidenceJournal({ write: (record) => writes.push(record) });
  const result = journal.append(validSignal({
    confidence_band: 'deny_filtered',
    guard_codes: ['privacy_guard'],
    reason_code: 'privacy_denied',
    prompt_signature: null,
  }), { project_id: 'project-a' });
  assert.equal(result.status, 'stored');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].signal.prompt_signature, null);

  const leaked = journal.append(validSignal({
    confidence_band: 'deny_filtered',
    guard_codes: ['privacy_guard'],
  }), { project_id: 'project-a' });
  assert.deepEqual(leaked, { status: 'denied', reason_code: 'privacy_signature_forbidden' });
  assert.equal(writes.length, 1);
});
