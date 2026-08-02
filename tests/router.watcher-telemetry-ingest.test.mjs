import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createTestRegistryReconciler, ingestTelemetryEvidence } from '../src/registry/watcher.mjs';
import { createPersistentEvidenceStore, createEvidenceStore } from '../src/evolution/evidence.mjs';
import { COMPILED_INDEX_COMPATIBILITY } from '../src/prompt/compile-index.mjs';

const NOW = Date.now();

function validRecord(i) {
  return {
    ts: NOW - i * 1000,
    prompt_signature: 'a'.repeat(64),
    suggested_mode: 'gsd-debug',
    confidence_tier: 'high',
    invoke_kind: 'slash',
    guards_fired: [],
    latency_ms: 1.2,
    selected_route: { id: 'gsd-debug', invoke_kind: 'slash' },
  };
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
  return { schema_version: 1, records: [], compatibility: { ...COMPILED_INDEX_COMPATIBILITY } };
}

// Deps for reaching the canary path WITHOUT injecting createPersistentEvidenceStore
// (the real disk-backed store is used, populated by ingestTelemetryEvidence from
// the real telemetry.jsonl written into activation_root).
function makeCanaryDeps(canaryDecisionImpl) {
  const candidateRoute = function candidateRoute() { return { outcome: 'resume', dispatch_eligible: true }; };
  candidateRoute.__role = 'candidate';
  const knownGoodRoute = function knownGoodRoute() { return { outcome: 'resume', dispatch_eligible: true }; };
  knownGoodRoute.__role = 'known-good';
  const buildCandidateRoute = () => ({ route: candidateRoute, captures: new Map(), cleanup: () => {}, versionId: 'candidate-v1' });
  const buildKnownGoodRoute = () => ({ route: knownGoodRoute, captures: new Map(), cleanup: () => {} });
  function evalCorus({ route }) {
    return route.__role === 'candidate'
      ? { quality: { pass: true, reason_code: 'quality_pass' }, context_budget: { pass: true, reason_code: 'context_budget_pass' } }
      : { quality: { pass: false, reason_code: 'quality_regression' }, context_budget: { pass: true, reason_code: 'context_budget_pass' } };
  }
  function measure() { return { warm: { p50_ms: 1, p95_ms: 2, max_ms: 3 }, baseline_delta: null, samples: [] }; }
  function assess() {
    return { pass: true, quality: { pass: true, reason_code: 'quality_pass' }, context_budget: { pass: true, reason_code: 'context_budget_pass' }, latency: { pass: true, reason_code: 'latency_pass' } };
  }
  const canaryCalls = [];
  const canaryDecision = (args) => { canaryCalls.push(args); return canaryDecisionImpl(args); };
  return {
    deps: {
      acquireRegistry: () => ({ generation: 0 }),
      refreshIncrementalAcquisition: (p) => ({ generation: p.generation + 1 }),
      assembleRegistry: () => ({ registry: builtRegistry(), diagnostics: [], summary: {} }),
      reconcileCandidate: () => eligibleReport(),
      mapCandidateRegistry: async () => ({ schema_version: 1, subjects: [], summary: { disposition: 'complete', ambiguous: 0 }, report_fingerprint: 'map' }),
      produceActivationVerification: async () => ({ disposition: 'passing', complete: true, policy_fingerprint: 'policy-fp', generated_at: NOW }),
      writeJson: async () => {},
      recoverActiveVersion: async () => ({ recovery_status: 'healthy', version_id: 'v1-known0000000000a' }),
      readActive: async () => ({ authority_status: 'active', bytes: '{}\n', fingerprint: 'active-fp', version_id: 'v1-pub0000000000a' }),
      activateCandidate: async () => ({ activation_status: 'activated', version_id: 'v1-new0000000000a' }),
      publishCompiledIndex: async () => ({ publication_status: 'published' }),
      applyCanaryDecision: canaryDecision,
      buildCandidateCalibrationRoute: buildCandidateRoute,
      buildKnownGoodCalibrationRoute: buildKnownGoodRoute,
      measureRoutes: measure,
      assessCalibration: assess,
      evaluateCalibrationCorpus: evalCorus,
      compatible: () => true,
    },
    canaryCalls,
  };
}

function baseConfig(root) {
  return {
    candidate_path: join(root, 'candidate.json'),
    report_path: join(root, 'report.json'),
    activation_root: root,
    telemetry_path: join(root, 'telemetry.jsonl'),
    scope_id: 'global',
  };
}

test('ingestTelemetryEvidence populates a real persistent store from telemetry.jsonl', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-ingest-unit-'));
  try {
    const store = createPersistentEvidenceStore({ root: join(root, 'evidence') });
    const telemetryPath = join(root, 'telemetry.jsonl');
    writeFileSync(telemetryPath, Array.from({ length: 35 }, (_, i) => JSON.stringify(validRecord(i))).join('\n') + '\n');
    const cursorPath = join(root, 'evidence', 'ingest-cursor.json');
    const r1 = ingestTelemetryEvidence({ store, telemetryPath, cursorPath, projectId: 'global' });
    assert.equal(r1.ingested, 35);
    assert.equal(r1.skipped, 'full');
    const window = store.window({ project_id: 'global' });
    assert.equal(window.sufficient, true);
    assert.equal(window.sample_count, 35);
    // Re-run with unchanged file -> no-op (cursor hit).
    const r2 = ingestTelemetryEvidence({ store, telemetryPath, cursorPath, projectId: 'global' });
    assert.equal(r2.ingested, 0);
    assert.equal(r2.skipped, 'unchanged');
    // Cursor persisted.
    assert.ok(existsSync(cursorPath));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ingestTelemetryEvidence skips privacy-denied and unrouted records', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-ingest-skip-'));
  try {
    const store = createPersistentEvidenceStore({ root: join(root, 'evidence') });
    const telemetryPath = join(root, 'telemetry.jsonl');
    const records = [
      validRecord(0), // accepted
      { ...validRecord(1), confidence_tier: 'deny_filtered', guards_fired: ['deny_filtered'] }, // privacy-denied
      { ...validRecord(2), suggested_mode: null }, // no route
      validRecord(3), // accepted
    ];
    writeFileSync(telemetryPath, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
    const r = ingestTelemetryEvidence({ store, telemetryPath, cursorPath: join(root, 'evidence', 'ingest-cursor.json'), projectId: 'global' });
    assert.equal(r.ingested, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ingestTelemetryEvidence consumes appended records after a newline cursor', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-ingest-append-'));
  try {
    const store = createPersistentEvidenceStore({ root: join(root, 'evidence') });
    const telemetryPath = join(root, 'telemetry.jsonl');
    const cursorPath = join(root, 'evidence', 'ingest-cursor.json');
    writeFileSync(telemetryPath, `${JSON.stringify(validRecord(0))}\n`);
    assert.equal(ingestTelemetryEvidence({ store, telemetryPath, cursorPath, projectId: 'global' }).ingested, 1);
    appendFileSync(telemetryPath, `${JSON.stringify(validRecord(1))}\n`);
    assert.equal(ingestTelemetryEvidence({ store, telemetryPath, cursorPath, projectId: 'global' }).ingested, 1);
    assert.equal(store.window({ project_id: 'global' }).sample_count, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ingestTelemetryEvidence waits for a partial line to be completed', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-ingest-partial-'));
  try {
    const store = createPersistentEvidenceStore({ root: join(root, 'evidence') });
    const telemetryPath = join(root, 'telemetry.jsonl');
    const cursorPath = join(root, 'evidence', 'ingest-cursor.json');
    const line = JSON.stringify(validRecord(0));
    writeFileSync(telemetryPath, line.slice(0, -1));
    assert.equal(ingestTelemetryEvidence({ store, telemetryPath, cursorPath, projectId: 'global' }).ingested, 0);
    appendFileSync(telemetryPath, `${line.slice(-1)}\n`);
    assert.equal(ingestTelemetryEvidence({ store, telemetryPath, cursorPath, projectId: 'global' }).ingested, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('EVO-05: watcher canary path reached with real telemetry + real persistent store', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-ingest-e2e-'));
  try {
    // 35 routed telemetry records -> ingestion makes window.sufficient=true.
    writeFileSync(join(root, 'telemetry.jsonl'), Array.from({ length: 35 }, (_, i) => JSON.stringify(validRecord(i))).join('\n') + '\n');
    const { deps, canaryCalls } = makeCanaryDeps(() => ({ status: 'promoted', reason_code: 'quality_improved', active_version: 'v1-new0000000000a' }));
    const reconcile = createTestRegistryReconciler(baseConfig(root), deps);
    await reconcile({ diff: { events: [], diagnostics: [] } });
    // The canary path was reached (applyCanaryDecision invoked) because the
    // evidence store was populated from telemetry.jsonl — proving EVO-05 closure.
    assert.equal(canaryCalls.length, 1);
    // Evidence store file exists on disk with ingested records.
    assert.ok(existsSync(join(root, 'evidence', 'project-global.jsonl')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
