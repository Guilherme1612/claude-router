import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runRouterControl } from '../src/cli/router-control.mjs';
import { createEvidenceStore } from '../src/evolution/evidence.mjs';
import { COMPILED_INDEX_COMPATIBILITY } from '../src/prompt/compile-index.mjs';

const NOW = 1_750_000_000_000;
// Version IDs must match VERSION_ID = /^v1-[a-f0-9]{16}$/ (router-control.mjs:21)
const KNOWN_GOOD = 'v1-abcdef0000000000';
const PUBLISHED = 'v1-1234567890abcdef';
const CANDIDATE_ID = 'candidate-' + 'b'.repeat(64);

// Pre-populated in-memory evidence store duck-typed as a persistent store
// (the CLI only calls window({project_id})). sufficient=true when n>=30.
function makeEvidenceStore(records = 30) {
  const store = createEvidenceStore({ now: () => NOW, minimum_samples: 30 });
  for (let i = 0; i < records; i += 1) {
    const result = store.append({
      timestamp_ms: NOW - i,
      route_id: 'gsd-debug',
      confidence_band: 'high',
      guard_codes: [],
      reason_code: 'route_selected',
      fixture_class: 'dependency',
      latency_us: 24_000,
      candidate_version: 'candidate-v1',
      policy_version: 'workflow-transitions-v1',
      verdict: 'success',
      prompt_signature: 'a'.repeat(64),
    }, { project_id: 'global' });
    assert.equal(result.status, 'stored');
  }
  return store;
}

// Tagged route fns so the evaluate/measure stubs can distinguish candidate
// vs known-good (mirrors tests/router.watcher-canary-trigger.test.mjs).
function candidateRoute() { return { outcome: 'resume', dispatch_eligible: true }; }
candidateRoute.__role = 'candidate';
function knownGoodRoute() { return { outcome: 'resume', dispatch_eligible: true }; }
knownGoodRoute.__role = 'known-good';

function buildCandidateRoute() {
  return { route: candidateRoute, captures: new Map(), cleanup: () => {}, versionId: 'candidate-v1' };
}
function buildKnownGoodRoute() {
  return { route: knownGoodRoute, captures: new Map(), cleanup: () => {} };
}

function evalCorpus({ route }) {
  if (route.__role === 'candidate') {
    return {
      quality: { pass: true, reason_code: 'quality_pass' },
      context_budget: { pass: true, reason_code: 'context_budget_pass' },
    };
  }
  return {
    quality: { pass: false, reason_code: 'quality_regression' },
    context_budget: { pass: true, reason_code: 'context_budget_pass' },
  };
}
function measure() { return { warm: { p50_ms: 1, p95_ms: 2, max_ms: 3 }, baseline_delta: null, samples: [] }; }
function assess() {
  return {
    pass: true,
    quality: { pass: true, reason_code: 'quality_pass' },
    context_budget: { pass: true, reason_code: 'context_budget_pass' },
    latency: { pass: true, reason_code: 'latency_pass' },
  };
}

// The canary decision spy: records every call and returns the configured status.
function makeCanarySpy(statusImpl) {
  const calls = [];
  const apply = (args) => {
    calls.push(args);
    return statusImpl(args);
  };
  return { apply, calls };
}

// Default promoted stub: status='promoted', active_version=<known_good>+1.
function promotedStub() {
  return () => ({ status: 'promoted', candidate_id: CANDIDATE_ID, reason_code: 'quality_improved', active_version: 'v1-new00000000000a' });
}
function rolledBackStub() {
  return () => ({ status: 'rolled_back', candidate_id: null, reason_code: 'operator_canary_rollback', active_version: KNOWN_GOOD });
}

// Build the full canary dependencies seam for the CLI (mirrors the watcher's
// createRegistryReconciler dependency injection keys).
function makeCanaryDeps({ evidenceStore = makeEvidenceStore(30), canaryDecisionImpl = promotedStub() } = {}) {
  const { apply: applyDecision, calls } = makeCanarySpy(canaryDecisionImpl);
  return {
    deps: {
      recoverActiveVersion: () => ({ recovery_status: 'healthy', version_id: KNOWN_GOOD }),
      createPersistentEvidenceStore: () => evidenceStore,
      buildCandidateCalibrationRoute: buildCandidateRoute,
      buildKnownGoodCalibrationRoute: buildKnownGoodRoute,
      evaluateCalibrationCorpus: evalCorpus,
      measureRoutes: measure,
      assessCalibration: assess,
      compatible: () => true,
      applyCanaryDecision: applyDecision,
    },
    calls,
  };
}

// Seed an ownedRoot with active.json + candidate/registry.json + candidate/report.json
// so the CLI's file-reading path (for promote) finds a candidate.
function seedOwnedRoot(root) {
  writeFileSync(join(root, 'active.json'), `${JSON.stringify({ version_id: PUBLISHED, sequence: 7 })}\n`);
  mkdirSync(join(root, 'candidate'), { recursive: true });
  const registry = { schema_version: 1, records: [{ id: 'alpha', lifecycle: 'ready', dispatchable: true, invocation: { command: 'safe' } }], compatibility: { ...COMPILED_INDEX_COMPATIBILITY } };
  writeFileSync(join(root, 'candidate', 'registry.json'), `${JSON.stringify({ ...registry, disposition: 'eligible', candidate_fingerprint: 'cand-fp' })}\n`);
  writeFileSync(join(root, 'candidate', 'report.json'), `${JSON.stringify({ disposition: 'eligible', verdicts: [], candidate_fingerprint: 'cand-fp', policy_fingerprint: 'policy-fp' })}\n`);
  return registry;
}

test('Test 1: canary status prints active, known-good, and evidence window summary', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-canary-status-'));
  try {
    // Empty tmpdir: no active.json, no evidence -> nulls + insufficient.
    const empty = runRouterControl({ argv: ['canary', 'status', '--owned-root', root] });
    assert.equal(empty.result.command, 'canary status');
    assert.equal(empty.result.ok, true);
    assert.equal(empty.result.reason_code, 'canary_status_ready');
    assert.equal(empty.result.data.active_version, null);
    assert.equal(empty.result.data.known_good_version, null);
    assert.equal(empty.result.data.evidence_window.sufficient, false);
    assert.equal(empty.result.data.evidence_window.sample_count, 0);
    assert.ok(empty.result.data.evidence_window.source_evidence_fingerprint === null || typeof empty.result.data.evidence_window.source_evidence_fingerprint === 'string');

    // Seeded: active + known-good + sufficient evidence window.
    seedOwnedRoot(root);
    const { deps } = makeCanaryDeps();
    const seeded = runRouterControl({ argv: ['canary', 'status', '--owned-root', root], dependencies: deps });
    assert.equal(seeded.result.ok, true);
    assert.equal(seeded.result.data.active_version, PUBLISHED);
    assert.equal(seeded.result.data.known_good_version, KNOWN_GOOD);
    assert.equal(seeded.result.data.evidence_window.sufficient, true);
    assert.equal(seeded.result.data.evidence_window.sample_count, 30);
    assert.match(String(seeded.result.data.evidence_window.weighted_samples), /^\d/);
    assert.match(String(seeded.result.data.evidence_window.source_evidence_fingerprint), /^[a-f0-9]{64}$/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Test 2: canary promote dry-run returns preview + confirmation warning', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-canary-promote-dry-'));
  try {
    seedOwnedRoot(root);
    const { deps, calls } = makeCanaryDeps();
    const dry = runRouterControl({ argv: ['canary', 'promote', '--owned-root', root], dependencies: deps });
    assert.equal(dry.result.ok, true);
    assert.equal(dry.result.reason_code, 'canary_promote_preview_ready');
    assert.equal(dry.exitCode, 0);
    assert.ok(dry.result.warnings.includes('execution_requires_exact_candidate_confirmation'));
    assert.ok(dry.result.data.candidate, 'candidate must be present in preview');
    assert.ok(dry.result.data.evaluation, 'evaluation must be present in preview');
    assert.ok(dry.result.data.decision_preview, 'decision_preview must be present');
    // Dry-run must NOT call applyCanaryDecision.
    assert.equal(calls.length, 0, 'applyCanaryDecision must NOT be called on dry-run');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Test 3: canary promote execute calls applyCanaryDecision with known_good + published_version', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-canary-promote-exec-'));
  try {
    seedOwnedRoot(root);
    const { deps, calls } = makeCanaryDeps();
    // The candidate id is the SHA-256 of the proposed candidate; the CLI derives it
    // internally. To confirm, we first run a dry-run to discover the candidate id,
    // then execute with --confirm <candidate_id>.
    const dry = runRouterControl({ argv: ['canary', 'promote', '--owned-root', root], dependencies: deps });
    const candidateId = dry.result.data.candidate.id;
    assert.ok(candidateId, 'dry-run must expose candidate.id');
    const executed = runRouterControl({
      argv: ['canary', 'promote', '--execute', '--confirm', candidateId, '--owned-root', root],
      dependencies: deps,
    });
    assert.equal(executed.result.ok, true);
    assert.equal(executed.result.reason_code, 'canary_promote_complete');
    assert.equal(calls.length, 1, 'applyCanaryDecision must be invoked once');
    const args = calls[0];
    assert.equal(args.known_good_version, KNOWN_GOOD);
    assert.equal(args.published_version, PUBLISHED);
    assert.equal(args.activation.ownedRoot, root);
    assert.equal(args.activation.reason, 'canary_promote');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Test 4: canary promote confirmation mismatch fails closed and does NOT call applyCanaryDecision', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-canary-promote-mismatch-'));
  try {
    seedOwnedRoot(root);
    const { deps, calls } = makeCanaryDeps();
    const mismatched = runRouterControl({
      argv: ['canary', 'promote', '--execute', '--confirm', 'definitely-not-the-candidate-id', '--owned-root', root],
      dependencies: deps,
    });
    assert.equal(mismatched.result.ok, false);
    assert.equal(mismatched.result.reason_code, 'confirmation_mismatch');
    assert.equal(mismatched.exitCode, 2, 'exitCode must be EXIT.usage (2)');
    assert.equal(calls.length, 0, 'applyCanaryDecision must NOT be called on mismatch');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Test 5: canary rollback delegates through applyCanaryDecision with reason=canary_rollback (distinct from operator_rollback)', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-canary-rollback-'));
  try {
    seedOwnedRoot(root);
    const { deps, calls } = makeCanaryDeps({ canaryDecisionImpl: rolledBackStub() });
    const executed = runRouterControl({
      argv: ['canary', 'rollback', '--execute', '--confirm', KNOWN_GOOD, '--owned-root', root],
      dependencies: deps,
    });
    assert.equal(executed.result.ok, true);
    assert.equal(executed.result.reason_code, 'canary_rollback_complete');
    assert.equal(calls.length, 1, 'applyCanaryDecision must be invoked once');
    const args = calls[0];
    // Destination is the known_good_version (NOT an arbitrary operator-chosen version).
    assert.equal(args.known_good_version, KNOWN_GOOD);
    assert.equal(args.published_version, PUBLISHED);
    // The activation carries reason='canary_rollback' — distinct from the existing
    // rollback verb's reason='operator_rollback' (router-control.mjs:266).
    assert.equal(args.activation.reason, 'canary_rollback');
    // The rollback branch is forced via evaluation.promotable=false.
    assert.equal(args.evaluation.promotable, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Test 6: canary rollback destination is known_good_version only (no arbitrary positional destination)', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-canary-rollback-dest-'));
  try {
    seedOwnedRoot(root);
    const { deps, calls } = makeCanaryDeps({ canaryDecisionImpl: rolledBackStub() });
    // Pass an arbitrary version_id positional (like the existing rollback verb takes
    // positional[1] as destination). canary rollback must IGNORE it and use
    // recoverActiveVersion's known_good_version as the destination.
    const arbitraryVersion = 'v1-aaaa0000000000bb';
    const executed = runRouterControl({
      argv: ['canary', 'rollback', arbitraryVersion, '--execute', '--confirm', KNOWN_GOOD, '--owned-root', root],
      dependencies: deps,
    });
    assert.equal(executed.result.ok, true);
    assert.equal(executed.result.reason_code, 'canary_rollback_complete');
    assert.equal(calls.length, 1);
    const args = calls[0];
    assert.equal(args.known_good_version, KNOWN_GOOD, 'destination must be known_good_version, not the arbitrary positional');
    assert.notEqual(args.known_good_version, arbitraryVersion, 'must not accept arbitrary version_id as destination');
    // Also assert the data destination matches known_good (not the arbitrary positional).
    assert.equal(executed.result.data.destination, KNOWN_GOOD);
  } finally { await rm(root, { recursive: true, force: true }); }
});

// CR-02a regression: `canary promote --execute` with INSUFFICIENT evidence must NOT
// surprise-rollback. The watcher gates on window.sufficient; the CLI promote branch
// must do the same — otherwise evaluateCandidate returns promotable=false and
// applyCanaryDecision's rollback branch fires (canary-controller.mjs:176-193) because
// published_version is non-null, rolling an operator's PROMOTE back to known_good.
// Sufficient floor is 30 samples (makeEvidenceStore default); 5 -> insufficient.
test('Test 7: canary promote --execute with insufficient evidence returns insufficient_evidence_samples and does NOT call applyCanaryDecision (CR-02a)', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-canary-promote-insufficient-'));
  try {
    seedOwnedRoot(root);
    // 5 records -> window.sufficient === false (below the 30-sample floor).
    const { deps, calls } = makeCanaryDeps({ evidenceStore: makeEvidenceStore(5) });
    // First run a dry-run to discover the candidate id (proposal still runs; the
    // gate is only on the --execute path before applyDecision).
    const dry = runRouterControl({ argv: ['canary', 'promote', '--owned-root', root], dependencies: deps });
    const candidateId = dry.result.data.candidate.id;
    assert.ok(candidateId, 'dry-run must still expose candidate.id even when evidence is insufficient');
    const executed = runRouterControl({
      argv: ['canary', 'promote', '--execute', '--confirm', candidateId, '--owned-root', root],
      dependencies: deps,
    });
    assert.equal(executed.result.ok, false, 'promote with insufficient evidence must not report ok');
    assert.equal(
      executed.result.reason_code,
      'insufficient_evidence_samples',
      'must return insufficient_evidence_samples (NOT canary_rolled_back)',
    );
    assert.notEqual(executed.result.reason_code, 'canary_rolled_back', 'must NOT surprise-rollback');
    assert.equal(calls.length, 0, 'applyCanaryDecision must NOT be called when evidence is insufficient (no surprise rollback)');
  } finally { await rm(root, { recursive: true, force: true }); }
});

// CR-02b regression: `canary rollback --execute` must pass `rollback_reason: 'canary_rollback'`
// to applyCanaryDecision so the audit trail records `reason: 'canary_rollback'` (canary-controller.mjs:188
// `reason: rollback_reason || 'rollback'`). Without the param the audit records the generic 'rollback',
// making canary rollback indistinguishable from registry rollback (20-03 truth 4).
test('Test 8: canary rollback --execute passes rollback_reason=canary_rollback to applyCanaryDecision (CR-02b)', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-canary-rollback-reason-'));
  try {
    seedOwnedRoot(root);
    const { deps, calls } = makeCanaryDeps({ canaryDecisionImpl: rolledBackStub() });
    const executed = runRouterControl({
      argv: ['canary', 'rollback', '--execute', '--confirm', KNOWN_GOOD, '--owned-root', root],
      dependencies: deps,
    });
    assert.equal(executed.result.ok, true);
    assert.equal(executed.result.reason_code, 'canary_rollback_complete');
    assert.equal(calls.length, 1, 'applyCanaryDecision must be invoked once');
    const args = calls[0];
    // The rollback_reason param must be 'canary_rollback' — distinct from the default 'rollback'
    // that applyCanaryDecision uses when rollback_reason is null/undefined (canary-controller.mjs:188).
    assert.equal(
      args.rollback_reason,
      'canary_rollback',
      'rollback_reason must be passed as canary_rollback (not undefined, which defaults to rollback)',
    );
  } finally { await rm(root, { recursive: true, force: true }); }
});