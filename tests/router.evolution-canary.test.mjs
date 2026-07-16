import { test } from 'node:test';
import assert from 'node:assert/strict';

const evidenceUrl = new URL('../src/evolution/evidence.mjs', import.meta.url);
const canaryUrl = new URL('../src/evolution/canary-controller.mjs', import.meta.url);

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

test('D-07 project evidence is isolated and aggregate eligibility is explicit', async () => {
  const { createEvidenceStore } = await import(evidenceUrl);
  const now = 1_750_000_000_000;
  const store = createEvidenceStore({ now: () => now });
  assert.equal(store.append(validSignal({ timestamp_ms: now }), { project_id: 'project-a' }).status, 'stored');
  assert.equal(store.append(validSignal({ timestamp_ms: now, route_id: 'route-b' }), { project_id: 'project-b' }).status, 'stored');
  assert.equal(store.window({ project_id: 'project-a' }).observations.length, 1);
  assert.equal(store.window({ project_id: 'project-a' }).observations[0].signal.route_id, 'gsd-debug');

  assert.deepEqual(
    store.append(validSignal({ timestamp_ms: now }), { scope: 'aggregate' }),
    { status: 'denied', reason_code: 'aggregate_eligibility_required' },
  );
  assert.equal(store.append(validSignal({ timestamp_ms: now }), { scope: 'aggregate', aggregate_eligible: true }).status, 'stored');
  const aggregate = store.window({ scope: 'aggregate' });
  assert.equal(aggregate.observations.length, 1);
  assert.equal('project_id' in aggregate.observations[0].scope, false);
});

test('D-08 retention and 24-hour exponential decay are deterministic', async () => {
  const { createEvidenceStore, HALF_LIFE_MS, MAX_RETENTION_MS } = await import(evidenceUrl);
  let now = 1_750_000_000_000;
  const store = createEvidenceStore({ now: () => now, minimum_samples: 1 });
  store.append(validSignal({ timestamp_ms: now }), { project_id: 'project-a' });
  now += HALF_LIFE_MS;
  store.append(validSignal({ timestamp_ms: now }), { project_id: 'project-a' });
  const decayed = store.window({ project_id: 'project-a' });
  assert.equal(decayed.observations.length, 2);
  assert.ok(Math.abs(decayed.weighted_samples - 1.5) < 1e-12);
  assert.equal(decayed.sufficient, true);

  now += MAX_RETENTION_MS;
  const pruned = store.window({ project_id: 'project-a' });
  assert.equal(pruned.observations.length, 1, 'the exact seven-day boundary remains eligible');
  assert.ok(Math.abs(pruned.weighted_samples - (2 ** -7)) < 1e-12);
});

test('D-08 fewer than 30 eligible observations cannot authorize promotion', async () => {
  const { createEvidenceStore } = await import(evidenceUrl);
  const now = 1_750_000_000_000;
  const store = createEvidenceStore({ now: () => now });
  for (let i = 0; i < 29; i += 1) {
    assert.equal(store.append(validSignal({ timestamp_ms: now - i }), { project_id: 'project-a' }).status, 'stored');
  }
  const insufficient = store.window({ project_id: 'project-a' });
  assert.equal(insufficient.sufficient, false);
  assert.equal(insufficient.reason_code, 'insufficient_evidence_samples');
  assert.equal(insufficient.sample_count, 29);

  store.append(validSignal({ timestamp_ms: now - 29 }), { project_id: 'project-a' });
  const sufficient = store.window({ project_id: 'project-a' });
  assert.equal(sufficient.sufficient, true);
  assert.equal(sufficient.reason_code, 'evidence_sufficient');
});

function candidateInput(overrides = {}) {
  return {
    source_evidence_fingerprint: 'b'.repeat(64),
    policy_version: 'policy-v1',
    compiled_index_version: 'compiled-v1',
    evaluation_inputs: {
      corpus_version: 'calibration-v1',
      fixture_ids: ['dependency-1', 'ambiguity-1'],
      baseline_version: 'known-good-v1',
    },
    proposal: { route_weights: { 'gsd-debug': 0.75 } },
    ...overrides,
  };
}

function passingGates(overrides = {}) {
  return {
    safety: { pass: true, reason_code: 'safety_pass' },
    privacy: { pass: true, reason_code: 'privacy_pass' },
    quality: { pass: true, reason_code: 'quality_pass' },
    context_budget: { pass: true, reason_code: 'context_budget_pass' },
    compatibility: { pass: true, reason_code: 'compatibility_pass' },
    latency: { pass: true, reason_code: 'latency_pass' },
    ...overrides,
  };
}

test('D-09 candidates are immutable content-addressed reproducible state', async () => {
  const { proposeCandidate } = await import(canaryUrl);
  const first = proposeCandidate(candidateInput());
  const reordered = proposeCandidate({
    proposal: { route_weights: { 'gsd-debug': 0.75 } },
    evaluation_inputs: {
      baseline_version: 'known-good-v1',
      fixture_ids: ['dependency-1', 'ambiguity-1'],
      corpus_version: 'calibration-v1',
    },
    compiled_index_version: 'compiled-v1',
    policy_version: 'policy-v1',
    source_evidence_fingerprint: 'b'.repeat(64),
  });
  assert.equal(first.status, 'proposed');
  assert.equal(first.candidate.id, reordered.candidate.id);
  assert.match(first.candidate.id, /^candidate-[a-f0-9]{64}$/);
  assert.throws(() => { first.candidate.proposal.route_weights['gsd-debug'] = 1; }, TypeError);
  assert.throws(() => { first.candidate.evaluation_inputs.fixture_ids.push('new'); }, TypeError);
});

test('D-10 promotion requires sufficient evidence and every independent hard gate', async () => {
  const { proposeCandidate, evaluateCandidate, REQUIRED_GATES } = await import(canaryUrl);
  const candidate = proposeCandidate(candidateInput()).candidate;
  const sufficientEvidence = { status: 'validated', sufficient: true, reason_code: 'evidence_sufficient', sample_count: 30, weighted_samples: 29.99 };
  const accepted = evaluateCandidate({ candidate, evidence_window: sufficientEvidence, gates: passingGates() });
  assert.equal(accepted.promotable, true);
  assert.equal(accepted.reason_code, 'candidate_promotable');

  for (const gate of REQUIRED_GATES) {
    const rejected = evaluateCandidate({
      candidate,
      evidence_window: sufficientEvidence,
      gates: passingGates({ [gate]: { pass: false, reason_code: `${gate}_failed` } }),
    });
    assert.equal(rejected.promotable, false, `${gate} must be independently mandatory`);
    assert.equal(rejected.reason_code, `${gate}_failed`);
  }

  const lowVolume = evaluateCandidate({
    candidate,
    evidence_window: { ...sufficientEvidence, sufficient: false, reason_code: 'insufficient_evidence_samples', sample_count: 29 },
    gates: passingGates(),
  });
  assert.equal(lowVolume.promotable, false);
  assert.equal(lowVolume.reason_code, 'insufficient_evidence_samples');
});

test('D-10 uncertainty preserves known-good and weighted scores cannot compensate', async () => {
  const { proposeCandidate, evaluateCandidate } = await import(canaryUrl);
  const candidate = proposeCandidate(candidateInput()).candidate;
  const result = evaluateCandidate({
    candidate,
    evidence_window: { status: 'validated', sufficient: true, reason_code: 'evidence_sufficient', sample_count: 100, weighted_samples: 99.9 },
    gates: passingGates({ privacy: { pass: false, reason_code: 'privacy_failed', score: 0.999 } }),
    known_good_version: 'known-good-v1',
  });
  assert.equal(result.promotable, false);
  assert.equal(result.preserve_version, 'known-good-v1');
  assert.equal(result.reason_code, 'privacy_failed');
  assert.equal('active_version' in result, false, 'evaluation must not mutate publication authority');
});
