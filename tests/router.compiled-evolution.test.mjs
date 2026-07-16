import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { applyCanaryDecision } from '../src/evolution/canary-controller.mjs';
import { CALIBRATION_CORPUS, assessCalibration, evaluateCalibrationCorpus, measureRoutes } from '../src/evolution/perf-measure.mjs';
import { saveCapsule } from '../src/context/capsule.mjs';
import { routeContextPrompt } from '../src/context/prompt-route.mjs';
import { activateCandidate } from '../src/registry/activate.mjs';
import { stableStringify } from '../src/registry/schema.mjs';
import { PRODUCTION_GATE_RUNNERS, REQUIRED_ACTIVATION_GATES } from '../src/registry/validate.mjs';

const hash = value => createHash('sha256').update(stableStringify(value)).digest('hex');
const COMPILED_VERSION = 'v1-fedcba9876543210';

function calibrationCapsule(fixture) {
  return {
    schema_version: 1,
    scope: { workspace_id: 'calibration', project_id: fixture.id },
    goal: { id: 'phase-17', summary: 'Compiled routing calibration' },
    position: { workflow: 'gsd-execute-phase', phase: '17', plan: '05', task: fixture.id },
    status: fixture.input.status === 'complete' ? 'completed' : 'active',
    artifacts: [], blockers: [],
    freshness: { captured_at: 1_000, generation: fixture.id },
    provenance: { source: 'calibration-fixture', version: '1' },
  };
}

function publishCompiledFixture(ownedRoot, fixture, now) {
  const versionRoot = join(ownedRoot, 'compiled-index', 'versions', COMPILED_VERSION);
  mkdirSync(versionRoot, { recursive: true });
  const index = {
    schema_version: 1, version_id: COMPILED_VERSION,
    policy_version: 'workflow-transitions-v1', capsule_contract_version: 1,
    routes: {
      'gsd-execute-phase': { workflow_id: 'gsd-execute-phase', transition_id: 'gsd.execute', dispatch_eligible: true, reason_code: 'unique_valid_transition' },
    },
  };
  const bytes = `${stableStringify(index)}\n`;
  const payload_sha256 = createHash('sha256').update(bytes).digest('hex');
  writeFileSync(join(versionRoot, 'index.json'), bytes);
  writeFileSync(join(versionRoot, 'metadata.json'), `${stableStringify({
    schema_version: 1, state: 'verified', version_id: COMPILED_VERSION,
    created_at: now - 1_000, expires_at: now + 60_000,
    compatibility: { router_contract: 'prompt-route-v1', policy_version: 'workflow-transitions-v1', capsule_schema_version: 1 },
    payload_sha256,
  })}\n`);
  writeFileSync(join(ownedRoot, 'compiled-index', 'active.json'), `${stableStringify({ schema_version: 1, version_id: COMPILED_VERSION, payload_sha256 })}\n`);
  assert.equal(saveCapsule({ ownedRoot, capsule: calibrationCapsule(fixture) }).status, 'saved');
}

function buildRealCalibrationRoute(t, corpus = CALIBRATION_CORPUS) {
  const now = 10_000;
  const states = new Map(corpus.map(fixture => {
    const ownedRoot = mkdtempSync(join(tmpdir(), `router-calibration-${fixture.fixture_class}-`));
    t.after(() => rmSync(ownedRoot, { recursive: true, force: true }));
    publishCompiledFixture(ownedRoot, fixture, now);
    return [fixture.id, { fixture, ownedRoot }];
  }));
  const captures = new Map();
  const route = fixture => {
    const state = states.get(fixture.id);
    assert.ok(state, `published fixture state for ${fixture.id}`);
    const routed = routeContextPrompt({
      prompt: fixture.input.prompt, ownedRoot: state.ownedRoot, projectRoot: state.ownedRoot, now,
      ...(fixture.input.force_stale || fixture.input.tied ? {
        forceStale: true,
        authoritative: fixture.input.tied
          ? { status: 'unresolved', reason_code: 'identity_conflict' }
          : { status: 'dispatchable', value: { workflow: 'gsd-execute-phase', phase: '17', plan: '05', task: 'refreshed-é', status: 'active', action: 'continue_workflow-é' } },
      } : {}),
    });
    captures.set(fixture.id, routed);
    const normalized = {
      outcome: routed.resolution.outcome,
      dispatch_eligible: routed.resolution.dispatch_eligible,
      ...(fixture.fixture_class === 'context_budget' ? {
        context_within_budget: Buffer.byteLength(routed.additional_context, 'utf8') <= fixture.max_context_bytes,
      } : {}),
    };
    Object.defineProperty(normalized, 'additional_context', { value: routed.additional_context, enumerable: false });
    return normalized;
  };
  return { route, captures };
}

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

test('D-13 fixed corpus adapter routes every fixture through hermetic compiled state', t => {
  const { route, captures } = buildRealCalibrationRoute(t);
  for (const fixture of CALIBRATION_CORPUS) {
    const actual = route(fixture);
    const captured = captures.get(fixture.id);
    assert.equal(actual.outcome, captured.resolution.outcome);
    assert.equal(actual.dispatch_eligible, captured.resolution.dispatch_eligible);
    assert.equal(actual.additional_context, captured.additional_context);
    assert.equal(Object.prototype.propertyIsEnumerable.call(actual, 'additional_context'), false);
    assert.deepEqual(Object.keys(actual), fixture.fixture_class === 'context_budget'
      ? ['outcome', 'dispatch_eligible', 'context_within_budget']
      : ['outcome', 'dispatch_eligible']);
  }
});

test('D-13/D-15 quality and UTF-8 budgets use observed router output, never fixture expected values', t => {
  const { route, captures } = buildRealCalibrationRoute(t);
  const representative = CALIBRATION_CORPUS.find(fixture => fixture.fixture_class === 'minimal_prompt');
  const observed = route(representative);
  const sentinel = route({ ...representative, expected: { outcome: 'sentinel', dispatch_eligible: false } });
  assert.deepEqual(sentinel, observed);
  assert.notStrictEqual(sentinel, representative.expected);

  const versions = { candidate: 'candidate-e2e', compiled_index: COMPILED_VERSION, policy: 'policy-v1', corpus: 'router-calibration-v1' };
  const evaluation = evaluateCalibrationCorpus({ corpus: CALIBRATION_CORPUS, route, versions });
  assert.equal(evaluation.quality.pass, true);
  assert.equal(evaluation.context_budget.pass, true);
  for (const result of evaluation.fixtures) {
    const emitted = captures.get(result.id).additional_context;
    assert.equal(result.measured_context_bytes, Buffer.byteLength(emitted, 'utf8'));
    assert.ok(result.measured_context_bytes <= result.maximum_context_bytes);
  }
  const stale = captures.get('stale-context-v1').additional_context;
  assert.match(stale, /é/);
  assert.ok(Buffer.byteLength(stale, 'utf8') > stale.length);
});

test('D-13 through D-16 fixed corpus passes independent semantic budget and REL-01 gates', t => {
  const versions = { candidate: 'candidate-e2e', compiled_index: 'compiled-v1', policy: 'policy-v1', corpus: 'router-calibration-v1' };
  const { route } = buildRealCalibrationRoute(t);
  const evaluation = evaluateCalibrationCorpus({ corpus: CALIBRATION_CORPUS, route, versions });
  const measured = measureRoutes({ fixtures: CALIBRATION_CORPUS, route, versions, baseline: { p50_ms: 1, p95_ms: 2 }, warmup_runs: 14, measured_runs: 70 });
  assert.equal(measured.corpus_fingerprint, '3ea61ea5a997a93e1341120657d3be3c9d9b3437379390ea6c8f4b1367f3ac5f');
  assert.equal(typeof measured.baseline_delta.p95_ms, 'number');
  const result = assessCalibration({ evaluation, performance: measured });
  assert.equal(result.pass, true);
  assert.equal(result.quality.pass, true);
  assert.equal(result.context_budget.pass, true);
  assert.equal(result.latency.pass, true);
  assert.deepEqual(evaluation.versions, versions);
  assert.ok(evaluation.fixtures.every(fixture => fixture.pass && fixture.context_budget_pass));
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
