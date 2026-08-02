import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createTestRegistryReconciler } from '../src/registry/watcher.mjs';
import { createEvidenceStore } from '../src/evolution/evidence.mjs';
import { COMPILED_INDEX_COMPATIBILITY } from '../src/prompt/compile-index.mjs';

const NOW = 1_750_000_000_000;

function validSignal(i) {
  return {
    timestamp_ms: NOW - i,
    route_id: 'gsd-debug',
    confidence_band: 'high',
    guard_codes: [],
    reason_code: 'route_selected',
    fixture_class: 'dependency',
    latency_us: 24_000,
    candidate_version: 'candidate-fp-1234567890',
    epoch: 'candidate-fp-1234567890',
    policy_version: 'workflow-transitions-v1',
    verdict: 'success',
    prompt_signature: 'a'.repeat(64),
  };
}

// Pre-populated in-memory evidence store (duck-typed as a persistent store:
// the watcher only calls window({project_id})). sufficient=true when n>=30.
function makeEvidenceStore(records = 30) {
  const store = createEvidenceStore({ now: () => NOW, minimum_samples: 30 });
  for (let i = 0; i < records; i += 1) {
    const result = store.append(validSignal(i), { project_id: 'global' });
    assert.equal(result.status, 'stored');
  }
  return store;
}

function eligibleReport() {
  return {
    disposition: 'eligible',
    candidate_fingerprint: 'candidate-fp-1234567890',
    report_fingerprint: 'report-fp',
    verdicts: [],
    active_bytes: '{}\n',
    active_fingerprint: 'active-fp',
  };
}

function builtRegistry() {
  return {
    schema_version: 1,
    records: [],
    compatibility: { ...COMPILED_INDEX_COMPATIBILITY },
  };
}

// Build the injected-dependencies seam for the watcher reconciler. The
// buildCandidateCalibrationRoute / buildKnownGoodCalibrationRoute stubs return
// tagged route fns so the evaluate/measure stubs can distinguish candidate
// vs known-good (D-05 derivation needs both).
function makeCanaryDeps(scenario, evidenceStore, canaryDecisionImpl) {
  const candidateRoute = function candidateRoute() { return { outcome: 'resume', dispatch_eligible: true }; };
  candidateRoute.__role = 'candidate';
  const knownGoodRoute = function knownGoodRoute() { return { outcome: 'resume', dispatch_eligible: true }; };
  knownGoodRoute.__role = 'known-good';

  const buildCandidateRoute = () => ({
    route: candidateRoute, captures: new Map(), cleanup: () => {}, versionId: 'candidate-v1',
  });
  const buildKnownGoodRoute = () => ({
    route: knownGoodRoute, captures: new Map(), cleanup: () => {},
  });

  // scenario controls the quality/context_budget outcomes per route role.
  function evalCorus({ route }) {
    if (scenario === 'promote') {
      return route.__role === 'candidate'
        ? { quality: { pass: true, reason_code: 'quality_pass' }, context_budget: { pass: true, reason_code: 'context_budget_pass' } }
        : { quality: { pass: false, reason_code: 'quality_regression' }, context_budget: { pass: true, reason_code: 'context_budget_pass' } };
    }
    if (scenario === 'neutral') {
      return { quality: { pass: true, reason_code: 'quality_pass' }, context_budget: { pass: true, reason_code: 'context_budget_pass' } };
    }
    if (scenario === 'rollback') {
      return route.__role === 'candidate'
        ? { quality: { pass: false, reason_code: 'quality_regression' }, context_budget: { pass: true, reason_code: 'context_budget_pass' } }
        : { quality: { pass: true, reason_code: 'quality_pass' }, context_budget: { pass: true, reason_code: 'context_budget_pass' } };
    }
    return { quality: { pass: true, reason_code: 'quality_pass' }, context_budget: { pass: true, reason_code: 'context_budget_pass' } };
  }
  function measure({ route }) {
    return { warm: { p50_ms: 1, p95_ms: 2, max_ms: 3 }, baseline_delta: null, samples: [] };
  }
  function assess() {
    return {
      pass: true,
      quality: { pass: true, reason_code: 'quality_pass' },
      context_budget: { pass: true, reason_code: 'context_budget_pass' },
      latency: { pass: true, reason_code: 'latency_pass' },
    };
  }

  const canaryCalls = [];
  const canaryDecision = (args) => {
    canaryCalls.push(args);
    return canaryDecisionImpl(args);
  };

  return {
    deps: {
      acquireRegistry: () => ({ generation: 0 }),
      refreshIncrementalAcquisition: previous => ({ generation: previous.generation + 1 }),
      assembleRegistry: () => ({ registry: builtRegistry(), diagnostics: [], summary: {} }),
      reconcileCandidate: () => eligibleReport(),
      mapCandidateRegistry: async () => ({ schema_version: 1, subjects: [], summary: { disposition: 'complete', ambiguous: 0 }, report_fingerprint: 'map' }),
      produceActivationVerification: async () => ({ disposition: 'passing', complete: true, policy_fingerprint: 'policy-fp', generated_at: NOW }),
      writeJson: async () => {},
      recoverActiveVersion: async () => ({ recovery_status: 'healthy', version_id: 'v1-known0000000000a' }),
      readActive: async () => ({ authority_status: 'active', bytes: '{}\n', fingerprint: 'active-fp', version_id: 'v1-pub0000000000a' }),
      activateCandidate: async () => ({ activation_status: 'activated', version_id: 'v1-new0000000000a' }),
      publishCompiledIndex: async () => ({ publication_status: 'published' }),
      // canary seam
      applyCanaryDecision: canaryDecision,
      buildCandidateCalibrationRoute: buildCandidateRoute,
      buildKnownGoodCalibrationRoute: buildKnownGoodRoute,
      measureRoutes: measure,
      assessCalibration: assess,
      evaluateCalibrationCorpus: evalCorus,
      createPersistentEvidenceStore: () => evidenceStore,
      compatible: () => true,
    },
    canaryCalls,
  };
}

function ownedRoot() {
  return mkdtempSync(join(tmpdir(), 'router-watcher-canary-'));
}

function baseConfig(root) {
  return {
    candidate_path: join(root, 'candidate.json'),
    report_path: join(root, 'report.json'),
    activation_root: root,
    scope_id: 'global',
  };
}

test('Test 1: promote path derives demonstrated_benefit.status=demonstrated via D-05', async () => {
  const root = ownedRoot();
  try {
    const store = makeEvidenceStore(30);
    const { deps, canaryCalls } = makeCanaryDeps('promote', store, () => ({
      status: 'promoted', reason_code: 'quality_improved', active_version: 'v1-new0000000000a',
    }));
    const reconcile = createTestRegistryReconciler(baseConfig(root), deps);
    await reconcile({ diff: { events: [], diagnostics: [] } });
    assert.equal(canaryCalls.length, 1, 'applyCanaryDecision must be invoked once');
    const benefit = canaryCalls[0].demonstrated_benefit;
    assert.ok(benefit, 'demonstrated_benefit must be passed');
    assert.equal(benefit.status, 'demonstrated');
    assert.ok(['quality_improved', 'context_bytes_reduced', 'latency_reduced'].includes(benefit.reason_code),
      `reason_code must be strict-improve set, got ${benefit.reason_code}`);
    assert.equal(canaryCalls[0].known_good_version, 'v1-known0000000000a');
    assert.equal(reconcile.lastReconciliation.activation_status, 'activated');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('Test 2: insufficient evidence preserves without canary eval or activator', async () => {
  const root = ownedRoot();
  try {
    const store = makeEvidenceStore(5); // sufficient=false
    const activatorCalls = [];
    const { deps, canaryCalls } = makeCanaryDeps('promote', store, () => ({
      status: 'promoted', reason_code: 'quality_improved', active_version: 'v1-new',
    }));
    deps.activateCandidate = async () => { activatorCalls.push(true); return { activation_status: 'activated' }; };
    deps.buildCandidateCalibrationRoute = () => { throw new Error('helper must not run when evidence insufficient'); };
    const reconcile = createTestRegistryReconciler(baseConfig(root), deps);
    await reconcile({ diff: { events: [], diagnostics: [] } });
    assert.equal(canaryCalls.length, 0, 'applyCanaryDecision must NOT be called');
    assert.equal(activatorCalls.length, 0, 'activateCandidate must NOT be called');
    assert.equal(reconcile.lastReconciliation.activation_status, 'preserved');
    assert.equal(reconcile.lastReconciliation.activation_reason, 'insufficient_evidence_samples');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('Test 3: bootstrap (no_valid_history) activates directly via watcher, no canary', async () => {
  const root = ownedRoot();
  try {
    const activatorCalls = [];
    const canaryCalls = [];
    const helperCalls = [];
    const deps = {
      acquireRegistry: () => ({ generation: 0 }),
      refreshIncrementalAcquisition: previous => ({ generation: previous.generation + 1 }),
      assembleRegistry: () => ({ registry: builtRegistry(), diagnostics: [], summary: {} }),
      reconcileCandidate: () => eligibleReport(),
      mapCandidateRegistry: async () => ({ schema_version: 1, subjects: [], summary: { disposition: 'complete', ambiguous: 0 }, report_fingerprint: 'map' }),
      produceActivationVerification: async () => ({ disposition: 'passing', complete: true, policy_fingerprint: 'policy-fp', generated_at: NOW }),
      writeJson: async () => {},
      recoverActiveVersion: async () => ({ recovery_status: 'blocked', reason_code: 'no_valid_history' }),
      readActive: async () => ({ authority_status: 'active', bytes: '{}\n', fingerprint: 'active-fp' }),
      activateCandidate: async (args) => { activatorCalls.push(args); return { activation_status: 'activated', version_id: 'v1-boot0000000000a' }; },
      publishCompiledIndex: async () => ({ publication_status: 'published' }),
      applyCanaryDecision: () => { canaryCalls.push(true); return { status: 'promoted' }; },
      buildCandidateCalibrationRoute: () => { helperCalls.push('candidate'); throw new Error('no helper on bootstrap'); },
      buildKnownGoodCalibrationRoute: () => { helperCalls.push('known-good'); throw new Error('no helper on bootstrap'); },
    };
    const reconcile = createTestRegistryReconciler(baseConfig(root), deps);
    await reconcile({ diff: { events: [], diagnostics: [] } });
    assert.equal(activatorCalls.length, 1, 'activator must be called directly');
    assert.equal(activatorCalls[0].reason, 'watcher', 'bootstrap reason must be watcher, not canary');
    assert.equal(canaryCalls.length, 0, 'applyCanaryDecision must NOT be called on bootstrap');
    assert.equal(helperCalls.length, 0, 'D-04 helper must NOT be called on bootstrap');
    assert.equal(reconcile.lastReconciliation.activation_status, 'activated');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('Test 4: gate failure rolls back when published_version exists (demonstrated_benefit not consulted)', async () => {
  const root = ownedRoot();
  try {
    const store = makeEvidenceStore(30);
    const activatorPromoteCalls = [];
    const { deps, canaryCalls } = makeCanaryDeps('rollback', store, () => ({
      status: 'rolled_back', reason_code: 'quality_regression', active_version: 'v1-known0000000000a',
    }));
    deps.activateCandidate = async (args) => {
      if (args.reason === 'canary') activatorPromoteCalls.push(args);
      return { activation_status: 'activated' };
    };
    const reconcile = createTestRegistryReconciler(baseConfig(root), deps);
    await reconcile({ diff: { events: [], diagnostics: [] } });
    assert.equal(canaryCalls.length, 1, 'applyCanaryDecision must be called');
    assert.equal(canaryCalls[0].demonstrated_benefit, null, 'demonstrated_benefit must be null when !promotable');
    assert.equal(canaryCalls[0].evaluation.promotable, false, 'evaluation.promotable must be false on gate failure');
    assert.equal(activatorPromoteCalls.length, 0, 'activateCandidate promote (canary) branch must NOT run on rollback');
    assert.equal(reconcile.lastReconciliation.activation_status, 'rolled_back');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('Test 5: neutral on parity preserves (never promote on equal-but-not-better)', async () => {
  const root = ownedRoot();
  try {
    const store = makeEvidenceStore(30);
    const { deps, canaryCalls } = makeCanaryDeps('neutral', store, (args) => ({
      status: 'preserved', reason_code: args.demonstrated_benefit?.reason_code ?? 'benefit_not_demonstrated', active_version: 'v1-known0000000000a',
    }));
    const reconcile = createTestRegistryReconciler(baseConfig(root), deps);
    await reconcile({ diff: { events: [], diagnostics: [] } });
    assert.equal(canaryCalls.length, 1);
    assert.equal(canaryCalls[0].demonstrated_benefit.status, 'neutral', 'parity must derive neutral');
    assert.equal(canaryCalls[0].demonstrated_benefit.reason_code, 'no_strict_improvement');
    assert.equal(reconcile.lastReconciliation.activation_status, 'preserved');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('Test 6: D-04 helper buildCandidateCalibrationRoute wraps routeContextPrompt with temp ownedRoots and cleans up', async () => {
  const helperUrl = new URL('../src/evolution/candidate-calibration-route.mjs', import.meta.url);
  const { buildCandidateCalibrationRoute } = await import(helperUrl);
  const routeCalls = [];
  const published = [];
  const saved = [];
  const tempRoots = [];
  const deps = {
    publishCompiledIndex: (args) => { published.push(args); tempRoots.push(args.ownedRoot); return { publication_status: 'published', compiled_version_id: 'v1-cand0000000000a' }; },
    saveCapsule: (args) => { saved.push(args); return { status: 'saved' }; },
    routeContextPrompt: (args) => { routeCalls.push(args); return { handled: true, resolution: { outcome: 'resume', dispatch_eligible: true }, additional_context: 'ctx' }; },
    mkdtempSync: (prefix) => { const d = mkdtempSync(prefix); tempRoots.push(d); return d; },
    rmSync: (path, opts) => rmSync(path, opts),
  };
  const ctx = buildCandidateCalibrationRoute({
    registry: builtRegistry(), mapping: { subjects: [] }, policyFingerprint: 'policy-fp', now: NOW, deps,
  });
  assert.equal(typeof ctx.route, 'function');
  assert.equal(typeof ctx.cleanup, 'function');
  // invoke route over a couple fixtures
  const fixture = { id: 'minimal-prompt-v1', fixture_class: 'minimal_prompt', input: { prompt: 'continue' }, expected: { outcome: 'resume', dispatch_eligible: true } };
  const out = ctx.route(fixture);
  assert.equal(routeCalls.length, 1);
  assert.ok(routeCalls[0].ownedRoot, 'routeContextPrompt must receive ownedRoot');
  assert.equal(routeCalls[0].projectRoot, routeCalls[0].ownedRoot, 'projectRoot bound to temp ownedRoot');
  assert.ok(['outcome', 'dispatch_eligible'].every(k => k in out), 'normalized output shape');
  // cleanup removes all tempdirs
  const created = [...tempRoots];
  ctx.cleanup();
  for (const dir of created) assert.equal(existsSync(dir), false, `tempdir ${dir} must be removed by cleanup`);
});

test('Test 8: canary path runs on EVERY eligible reconcile (multi-reconcile regression — CR-01)', async () => {
  const root = ownedRoot();
  try {
    const store = makeEvidenceStore(30);
    const { deps, canaryCalls } = makeCanaryDeps('promote', store, () => ({
      status: 'promoted', reason_code: 'quality_improved', active_version: 'v1-new0000000000a',
    }));
    const reconcile = createTestRegistryReconciler(baseConfig(root), deps);
    const diff = { events: [], diagnostics: [] };
    // First reconcile: recovery runs, knownGood populated, canary path runs.
    await reconcile({ diff });
    assert.equal(canaryCalls.length, 1, 'first reconcile must invoke applyCanaryDecision');
    assert.notEqual(reconcile.lastReconciliation.activation_reason, 'watcher',
      'first reconcile must NOT take the bootstrap path');
    // Second reconcile: CR-01 — recovered flag must reset so the recovery block
    // runs again, knownGood is re-populated, and the canary path runs again
    // (NOT the bootstrap path which bypasses applyCanaryDecision).
    await reconcile({ diff });
    assert.equal(canaryCalls.length, 2,
      'applyCanaryDecision must be invoked on BOTH reconciles (CR-01: canary path dead after first reconcile)');
    assert.notEqual(reconcile.lastReconciliation.activation_reason, 'watcher',
      'second reconcile must NOT take the bootstrap path (canary decision expected)');
    // The activation must reflect a canary decision, not the bootstrap activator.
    assert.ok(['activated', 'preserved', 'rolled_back', 'recovery_required'].includes(reconcile.lastReconciliation.activation_status),
      `second reconcile activation_status must be a canary decision, got ${reconcile.lastReconciliation.activation_status}`);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('Test 7: D-06 compatible() is exported from compile-index.mjs and imported by name in watcher.mjs', async () => {
  const compileUrl = new URL('../src/prompt/compile-index.mjs', import.meta.url);
  const mod = await import(compileUrl);
  assert.equal(typeof mod.compatible, 'function', 'compatible must be exported from compile-index.mjs');
  assert.equal(mod.compatible({ ...COMPILED_INDEX_COMPATIBILITY }), true, 'compatible recognizes the current compatibility object');

  const watcherSource = readFileSync(new URL('../src/registry/watcher.mjs', import.meta.url), 'utf8');
  assert.ok(/export function compatible/.test(readFileSync(new URL('../src/prompt/compile-index.mjs', import.meta.url), 'utf8')),
    'compile-index.mjs must contain `export function compatible`');
  assert.equal((watcherSource.match(/COMPILED_INDEX_COMPATIBILITY\.compatible/g) || []).length, 0,
    'watcher.mjs must NOT call the non-existent COMPILED_INDEX_COMPATIBILITY.compatible method');
  assert.ok(/import \{ compatible[^}]*\} from '\.\.\/prompt\/compile-index\.mjs'/.test(watcherSource),
    "watcher.mjs must import { compatible } from '../prompt/compile-index.mjs'");
});
