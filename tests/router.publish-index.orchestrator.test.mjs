import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { stableStringify } from '../src/registry/schema.mjs';
import { loadCompiledIndex } from '../src/prompt/compile-index.mjs';
import { publishCompiledIndex } from '../src/prompt/publish-index.mjs';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const NOW = 1_800_000_000_000;

// A registry record that satisfies resolveDependencies' ready/dispatchable/scope
// requirements, plus a workflow declaration that selects gsd-execute-phase so
// the orchestrator path reaches a resolved closure for the happy case.
function capabilityRecord(id, type = 'agent', dependencies = [], overrides = {}) {
  return {
    id, name: id, type, lifecycle: 'ready', dispatchable: true, available: true,
    scope: { kind: 'global' },
    dependencies: { state: dependencies.length ? 'declared' : 'unknown', items: dependencies.map(value => ({ id: value, available: true })) },
    permissions: { required: [], grants: [], denied: [] }, conflicts: [], provenance: [],
    invocation: { runtime: 'claude', command: 'execute', args: [] },
    ...overrides,
  };
}

function mappingFor(workflowId, targetId) {
  return {
    schema_version: 1, policy_fingerprint: 'a'.repeat(64),
    subjects: [{
      subject_id: workflowId, disposition: 'mapped', target_id: targetId,
      reason_code: 'explicit_subject',
    }],
  };
}

function registryWith(records) {
  return { schema_version: 1, records };
}

function publish(root, records, workflowId = 'gsd-execute-phase', targetId = 'router/executor', workflowEvidenceById = {
  'gsd-execute-phase': {
    status: 'active', freshness: 'fresh', position: { family: 'gsd', state: 'planned' },
    gates: { plan_approved: true }, dependencies_safe: true,
  },
}) {
  return publishCompiledIndex({
    ownedRoot: root, registry: registryWith(records), registryVersionId: 'v1-aaaaaaaaaaaaaaaa',
    mapping: mappingFor(workflowId, targetId), policyFingerprint: 'b'.repeat(64), now: NOW,
    workflowEvidenceById,
  });
}

const HAPPY_RECORDS = [
  capabilityRecord('router/executor', 'agent'),
  capabilityRecord('router/execute-command', 'command'),
];

test('publishCompiledIndex writes closure.json/budget.json/summary-index.json siblings with the locked by_workflow shape', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-pub-orch-siblings-'));
  try {
    const result = publish(root, HAPPY_RECORDS);
    assert.equal(result.publication_status, 'published');
    const versionRoot = join(root, 'release-tuples', 'versions', result.tuple_version_id);
    for (const name of ['closure.json', 'budget.json', 'summary-index.json']) {
      assert.equal(existsSync(join(versionRoot, name)), true, `${name} should exist`);
    }
    const closure = JSON.parse(readFileSync(join(versionRoot, 'closure.json'), 'utf8'));
    const budget = JSON.parse(readFileSync(join(versionRoot, 'budget.json'), 'utf8'));
    const summaryIndex = JSON.parse(readFileSync(join(versionRoot, 'summary-index.json'), 'utf8'));
    for (const sibling of [closure, budget, summaryIndex]) {
      assert.equal(sibling.schema_version, 1);
      assert.equal('by_workflow' in sibling, true);
    }
    assert.equal('gsd-execute-phase' in closure.by_workflow, true);
    assert.equal('gsd-execute-phase' in budget.by_workflow, true);
    assert.equal('gsd-execute-phase' in summaryIndex.by_workflow, true);
    const closureEntry = closure.by_workflow['gsd-execute-phase'];
    assert.deepEqual(Object.keys(closureEntry).sort(), [
      'candidates', 'closure', 'dispatch_eligible', 'invokable_capabilities',
      'lifecycle_bindings', 'reason_code', 'required_models', 'required_permissions',
      'selected_transition',
    ].sort());
    assert.equal(typeof closureEntry.dispatch_eligible, 'boolean');
    assert.equal(typeof closureEntry.reason_code, 'string');
    // Closure succeeded for the happy case — real closure data is baked.
    assert.ok(Array.isArray(closureEntry.closure) && closureEntry.closure.length > 0,
      'closure resolution succeeded — real closure array is baked');
    assert.ok(closureEntry.selected_transition && closureEntry.selected_transition.workflow_id === 'gsd-execute-phase');
    const budgetEntry = budget.by_workflow['gsd-execute-phase'];
    assert.equal(typeof budgetEntry.dispatch_eligible, 'boolean');
    assert.equal(typeof budgetEntry.reason_code, 'string');
    // summary-index v1: ref shape present, value null until summaries are produced.
    assert.equal(summaryIndex.by_workflow['gsd-execute-phase'], null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('published manifest carries closure/budget/summary_index payload_sha256 matching sibling bytes', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-pub-orch-manifest-'));
  try {
    const result = publish(root, HAPPY_RECORDS);
    const versionRoot = join(root, 'release-tuples', 'versions', result.tuple_version_id);
    const manifest = JSON.parse(readFileSync(join(versionRoot, 'manifest.json'), 'utf8'));
    for (const [field, file] of [['closure', 'closure.json'], ['budget', 'budget.json'], ['summary_index', 'summary-index.json']]) {
      assert.ok(manifest[field] && manifest[field].payload_sha256, `manifest.${field}.payload_sha256 missing`);
      assert.equal(manifest[field].payload_sha256, sha256(readFileSync(join(versionRoot, file))));
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('loadCompiledIndex after publish returns closure/budget/summaryIndex keys with by_workflow map', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-pub-orch-load-'));
  try {
    const result = publish(root, HAPPY_RECORDS);
    const loaded = loadCompiledIndex({ ownedRoot: root, now: NOW });
    assert.equal(loaded.status, 'ready');
    assert.equal(loaded.tuple_version_id, result.tuple_version_id);
    assert.equal(loaded.closure.schema_version, 1);
    assert.equal(loaded.budget.schema_version, 1);
    assert.equal(loaded.summaryIndex.schema_version, 1);
    assert.ok('gsd-execute-phase' in loaded.closure.by_workflow);
    assert.ok('gsd-execute-phase' in loaded.budget.by_workflow);
    assert.ok('gsd-execute-phase' in loaded.summaryIndex.by_workflow);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('publishCompiledIndex with empty mapping throws and produces NO canonical_record route (D-06 ORC-01 closure)', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-pub-orch-empty-'));
  try {
    const emptyMapping = { schema_version: 1, policy_fingerprint: 'a'.repeat(64), subjects: [] };
    assert.throws(() => publishCompiledIndex({
      ownedRoot: root, registry: registryWith(HAPPY_RECORDS), registryVersionId: 'v1-aaaaaaaaaaaaaaaa',
      mapping: emptyMapping, policyFingerprint: 'b'.repeat(64), now: NOW,
    }), /compiled index requires at least one dispatch route/);
    // No tuple directory should have been written for a canonical_record fallback.
    const versionsRoot = join(root, 'release-tuples', 'versions');
    assert.equal(existsSync(versionsRoot), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('publish-index.mjs no longer contains canonical_record fallback (D-06)', () => {
  const source = readFileSync(new URL('../src/prompt/publish-index.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /canonical_record/);
});

test('publish-index.mjs wires the three orchestrator functions (D-01)', () => {
  const source = readFileSync(new URL('../src/prompt/publish-index.mjs', import.meta.url), 'utf8');
  assert.match(source, /selectCapabilities/);
  assert.match(source, /nextValidTransitions/);
  assert.match(source, /planContextLoad/);
});

test('workflow-declarations.json exists and parses with a declarations array', () => {
  const declarations = JSON.parse(readFileSync(new URL('../src/orchestrator/workflow-declarations.json', import.meta.url), 'utf8'));
  assert.equal(declarations.schema_version, 1);
  assert.equal(Array.isArray(declarations.declarations), true);
  assert.ok(declarations.declarations.length > 0);
  const gsdExecute = declarations.declarations.find(value => value.workflow_id === 'gsd-execute-phase');
  assert.ok(gsdExecute, 'gsd-execute-phase declaration must exist for the orchestrator happy path');
  assert.ok(Array.isArray(gsdExecute.owners) && gsdExecute.owners.length > 0);
  assert.ok(Array.isArray(gsdExecute.compatible));
});

test('pointer schema_version is bumped to 2 (matches compile-index verifyTuple)', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-pub-orch-pointer-'));
  try {
    publish(root, HAPPY_RECORDS);
    const activePointer = JSON.parse(readFileSync(join(root, 'release-tuples', 'active.json'), 'utf8'));
    assert.equal(activePointer.schema_version, 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('routes[] shape is unchanged — index.json routes still passes validRoutes (D-05 dispatch surface preserved)', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-pub-orch-routes-'));
  try {
    const result = publish(root, HAPPY_RECORDS);
    const index = JSON.parse(readFileSync(join(root, 'release-tuples', 'versions', result.tuple_version_id, 'index.json'), 'utf8'));
    assert.equal(index.routes['gsd-execute-phase'].workflow_id, 'gsd-execute-phase');
    assert.equal(typeof index.routes['gsd-execute-phase'].dispatch_eligible, 'boolean');
    // routes entry remains compact: orchestrator output lives in siblings only.
    assert.equal('closure' in index.routes['gsd-execute-phase'], false);
    assert.equal('candidates' in index.routes['gsd-execute-phase'], false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('when planContextLoad returns blocked (required sources missing in v1), budget.by_workflow entry is dispatch_eligible:false with reason_code (D-03 TOK-02 closure)', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-pub-orch-budget-blocked-'));
  try {
    const result = publish(root, HAPPY_RECORDS);
    const versionRoot = join(root, 'release-tuples', 'versions', result.tuple_version_id);
    const budget = JSON.parse(readFileSync(join(versionRoot, 'budget.json'), 'utf8'));
    const entry = budget.by_workflow['gsd-execute-phase'];
    // In v1, sources:[] + DEFAULT_CONTEXT_CONTRACT (3 required classes) → planContextLoad
    // returns blocked('required_source_class_missing'). The dispatch_eligible flag
    // carries that result (D-03); the route path observes it (implemented in Plan 03).
    assert.equal(entry.dispatch_eligible, false);
    assert.equal(entry.reason_code, 'required_source_class_missing');
    // The tuple is still published; the per-workflow dispatch flag is the gate.
    const loaded = loadCompiledIndex({ ownedRoot: root, now: NOW });
    assert.equal(loaded.status, 'ready');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('when selectCapabilities returns blocked (missing dependency), closure.by_workflow entry is dispatch_eligible:false with reduced shape', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-pub-orch-closure-blocked-'));
  try {
    // Declare an executor that depends on a missing capability — closure resolution fails.
    const records = [
      capabilityRecord('router/executor', 'agent', ['router/missing-dep']),
      capabilityRecord('router/execute-command', 'command'),
    ];
    const result = publish(root, records);
    const versionRoot = join(root, 'release-tuples', 'versions', result.tuple_version_id);
    const closure = JSON.parse(readFileSync(join(versionRoot, 'closure.json'), 'utf8'));
    const entry = closure.by_workflow['gsd-execute-phase'];
    assert.equal(entry.dispatch_eligible, false);
    assert.ok(entry.reason_code, 'blocked entry should carry a reason_code');
    // Reduced shape: transition + selection succeeded, but closure resolution failed.
    // The skip-on-blocked-closure path bakes empty closure/invokable_capabilities/etc.
    assert.deepEqual(entry.closure, []);
    assert.deepEqual(entry.invokable_capabilities, []);
    assert.deepEqual(entry.required_models, []);
    assert.deepEqual(entry.required_permissions, []);
    assert.deepEqual(entry.lifecycle_bindings, []);
    // The tuple is still published; the per-workflow dispatch flag is the gate.
    const loaded = loadCompiledIndex({ ownedRoot: root, now: NOW });
    assert.equal(loaded.status, 'ready');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('publication selects a non-planned transition from supplied authoritative state', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-pub-orch-executed-'));
  try {
    const result = publish(root, HAPPY_RECORDS, 'gsd-verify-work', 'router/executor', {
      'gsd-verify-work': {
        status: 'active', freshness: 'fresh', position: { family: 'gsd', state: 'executed' },
        gates: { execution_complete: true }, dependencies_safe: true,
      },
    });
    const closure = JSON.parse(readFileSync(join(root, 'release-tuples', 'versions', result.tuple_version_id, 'closure.json')));
    assert.equal(closure.by_workflow['gsd-verify-work'].selected_transition.transition_id, 'gsd.verify');
    assert.equal(closure.by_workflow['gsd-verify-work'].selected_transition.from, 'executed');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('publication blocks terminal or missing authoritative workflow state', () => {
  for (const evidence of [
    { 'gsd-execute-phase': { status: 'completed', freshness: 'fresh', position: { family: 'gsd', state: 'planned' }, gates: { plan_approved: true }, dependencies_safe: true } },
    null,
  ]) {
    const root = mkdtempSync(join(tmpdir(), 'router-pub-orch-terminal-'));
    try {
      const result = publish(root, HAPPY_RECORDS, 'gsd-execute-phase', 'router/executor', evidence);
      const closure = JSON.parse(readFileSync(join(root, 'release-tuples', 'versions', result.tuple_version_id, 'closure.json')));
      const entry = closure.by_workflow['gsd-execute-phase'];
      assert.equal(entry.dispatch_eligible, false);
      assert.equal(entry.selected_transition, null);
      assert.equal(entry.reason_code, evidence ? 'terminal_workflow' : 'authoritative_state_required');
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});
