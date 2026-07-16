import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { applyCanaryDecision } from '../src/evolution/canary-controller.mjs';
import { CALIBRATION_CORPUS, assessCalibration, evaluateCalibrationCorpus, measureRoutes } from '../src/evolution/perf-measure.mjs';
import { activateCandidate } from '../src/registry/activate.mjs';
import { stableStringify } from '../src/registry/schema.mjs';
import { PRODUCTION_GATE_RUNNERS, REQUIRED_ACTIVATION_GATES } from '../src/registry/validate.mjs';

const hash = value => createHash('sha256').update(stableStringify(value)).digest('hex');

function inputs(generation) {
  return {
    candidate: { schema_version: 1, records: [], generation },
    reconciliation: { disposition: 'eligible', candidate_fingerprint: null, verdicts: [] },
    mapping: { schema_version: 1, subjects: [], summary: { disposition: 'complete', ambiguous: 0 }, report_fingerprint: `mapping-${generation}` },
    policy: { version: 'fixture' },
  };
}

function verification(exact, now) {
  const gates = REQUIRED_ACTIVATION_GATES.map(id => {
    const runner = PRODUCTION_GATE_RUNNERS[id];
    const gate = { id, runner_id: runner.id, runner_version: runner.version, passed: true, reason_code: 'passed', threshold: runner.threshold, measured: {} };
    return { ...gate, evidence_fingerprint: hash(gate) };
  });
  const canonical = {
    schema_version: 1, verification_policy_version: 'activation-verification-v1', trusted: true, complete: true,
    generated_at: now, expires_at: now + 300_000, required_gate_ids: [...REQUIRED_ACTIVATION_GATES],
    candidate_fingerprint: hash(exact.candidate), reconciliation_fingerprint: hash(exact.reconciliation),
    mapping_fingerprint: hash(exact.mapping), policy_fingerprint: hash(exact.policy), gates, disposition: 'passing', test_only: false,
  };
  return { ...canonical, verification_fingerprint: hash(canonical) };
}

test('EVO-05 lifecycle atomically promotes benefit then restores known-good on regression', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-compiled-evolution-'));
  try {
    const now = Date.now();
    const baselineInputs = inputs(1);
    const baseline = activateCandidate({ ownedRoot: root, ...baselineInputs, verification: verification(baselineInputs, now), now });
    assert.equal(baseline.activation_status, 'activated');

    const candidateInputs = inputs(2);
    const activation = { ownedRoot: root, ...candidateInputs, verification: verification(candidateInputs, now + 1), now: now + 1 };
    const promoted = applyCanaryDecision({
      evaluation: { promotable: true, candidate_id: 'candidate-e2e', reason_code: 'candidate_promotable' },
      demonstrated_benefit: { status: 'demonstrated', reason_code: 'context_bytes_reduced' },
      known_good_version: baseline.version_id, activation,
    });
    assert.equal(promoted.status, 'promoted');
    assert.notEqual(promoted.active_version, baseline.version_id);
    assert.equal(JSON.parse(readFileSync(join(root, 'active.json'))).version_id, promoted.active_version);

    const rolled = applyCanaryDecision({
      evaluation: { promotable: false, candidate_id: 'candidate-e2e', reason_code: 'quality_regression' },
      published_version: promoted.active_version, known_good_version: baseline.version_id, ownedRoot: root,
    });
    assert.equal(rolled.status, 'rolled_back');
    assert.equal(JSON.parse(readFileSync(join(root, 'active.json'))).version_id, baseline.version_id);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('D-13 through D-16 fixed corpus passes independent semantic budget and REL-01 gates', () => {
  const versions = { candidate: 'candidate-e2e', compiled_index: 'compiled-v1', policy: 'policy-v1', corpus: 'router-calibration-v1' };
  const evaluation = evaluateCalibrationCorpus({ corpus: CALIBRATION_CORPUS, route: fixture => fixture.expected, versions });
  const measured = measureRoutes({ fixtures: CALIBRATION_CORPUS, route: () => {}, versions, baseline: { p50_ms: 1, p95_ms: 2 }, warmup_runs: 2, measured_runs: 14 });
  assert.equal(measured.corpus_fingerprint, '7bc53e0215dd75fdd98cb6a4b4c0df77a9360ab3194b1ccb26ae89a85e2b677d');
  assert.equal(typeof measured.baseline_delta.p95_ms, 'number');
  const result = assessCalibration({ evaluation, performance: measured });
  assert.equal(result.pass, true);
  assert.equal(result.quality.pass, true);
  assert.equal(result.context_budget.pass, true);
  assert.equal(result.latency.pass, true);
});

test('D-16 neutral speed alone cannot move active authority', () => {
  let activations = 0;
  const result = applyCanaryDecision({
    evaluation: { promotable: true, candidate_id: 'candidate-neutral', reason_code: 'candidate_promotable' },
    demonstrated_benefit: { status: 'neutral', reason_code: 'faster_only' },
    known_good_version: 'v1-known', activation: { ownedRoot: '/owned' },
    publication: {
      recoverRollbackJournal: () => ({ recovery_status: 'healthy' }),
      recoverActiveVersion: () => ({ recovery_status: 'healthy', version_id: 'v1-known' }),
      activateCandidate: () => { activations += 1; },
    },
  });
  assert.equal(result.status, 'preserved');
  assert.equal(result.active_version, 'v1-known');
  assert.equal(activations, 0);
});
