import { createHash } from 'node:crypto';
import { closeSync, fstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { stableStringify } from '../src/registry/schema.mjs';
import {
  COMPILED_INDEX_COMPATIBILITY,
  COMPILED_INDEX_LIMITS,
  COMPILED_INDEX_SCHEMA_VERSION,
  loadCompiledIndex,
} from '../src/prompt/compile-index.mjs';

// CONTEXT_CONTRACT_VERSION literal is inlined in compile-index.mjs per D-08.
// Mirror the same literal here so the test asserts the frozen constant matches
// the budget.mjs export without importing orchestrator/* into the test graph
// (the test imports compile-index.mjs, which is hook-reachable).
const CONTEXT_CONTRACT_VERSION = 'workflow-context-contract-v1';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const NOW = 1_800_000_000_000;
const TUPLE_VERSION = 't1-0123456789abcdef';
const REGISTRY_VERSION = 'v1-aaaaaaaaaaaaaaaa';
const COMPILED_VERSION = 'v1-bbbbbbbbbbbbbbbb';

const ROUTES = {
  'gsd-execute-phase': {
    workflow_id: 'gsd-execute-phase',
    transition_id: 'gsd.execute',
    reason_code: 'unique_valid_transition',
    dispatch_eligible: true,
    target_id: 'capability-1',
    scope: { kind: 'global' },
    invocation: { runtime: 'claude', command: 'execute', args: [] },
    dependencies: { state: 'ready', items: [] },
  },
};

const REGISTRY = { schema_version: 1, records: [{
  id: 'capability-1', name: 'execute', lifecycle: 'ready', dispatchable: true,
  scope: { kind: 'global' }, invocation: { runtime: 'claude', command: 'execute', args: [] },
  dependencies: { state: 'ready', items: [] },
}] };

function tupleEntry(workflowId, overrides = {}) {
  return {
    selected_transition: { transition_id: 'gsd.execute', workflow_id: workflowId, family: 'gsd', from: 'planned', to: 'execute' },
    candidates: [{ transition_id: 'gsd.execute', workflow_id: workflowId, family: 'gsd', from: 'planned', to: 'execute' }],
    closure: [{ kind: 'agent', canonical_id: 'router/executor', provenance: [] }],
    invokable_capabilities: [{ kind: 'agent', canonical_id: 'router/executor', provenance: [] }],
    required_models: [],
    required_permissions: [],
    lifecycle_bindings: [],
    dispatch_eligible: true,
    reason_code: 'dependency_closure_safe',
    ...overrides,
  };
}

function writeTuple(root, { closure = { schema_version: 1, by_workflow: { 'gsd-execute-phase': tupleEntry('gsd-execute-phase') } }, budget = { schema_version: 1, by_workflow: { 'gsd-execute-phase': { report: { contract_version: CONTEXT_CONTRACT_VERSION, estimator_version: 'utf8-bytes-v1-ceil-div-3', total_max_bytes: 12288, canonical_bytes: 0, estimated_tokens: 0, included_sources: [], omitted_sources: [], regression_delta: null }, dispatch_eligible: true, reason_code: 'context_load_planned' } } }, summaryIndex = { schema_version: 1, by_workflow: { 'gsd-execute-phase': null } }, compatibility = COMPILED_INDEX_COMPATIBILITY, tupleVersion = TUPLE_VERSION, manifestOverrides = {} } = {}) {
  const versionRoot = join(root, 'release-tuples', 'versions', tupleVersion);
  mkdirSync(versionRoot, { recursive: true });
  const registryBytes = `${stableStringify(REGISTRY)}\n`;
  const index = {
    schema_version: COMPILED_INDEX_SCHEMA_VERSION, version_id: COMPILED_VERSION,
    policy_version: COMPILED_INDEX_COMPATIBILITY.policy_version,
    capsule_contract_version: COMPILED_INDEX_COMPATIBILITY.capsule_schema_version, routes: ROUTES,
  };
  const indexBytes = `${stableStringify(index)}\n`;
  const closureBytes = `${stableStringify(closure)}\n`;
  const budgetBytes = `${stableStringify(budget)}\n`;
  const summaryIndexBytes = `${stableStringify(summaryIndex)}\n`;
  const manifest = {
    schema_version: 1, state: 'verified', tuple_version_id: tupleVersion,
    registry: { version_id: REGISTRY_VERSION, payload_sha256: sha256(registryBytes) },
    compiled: { version_id: COMPILED_VERSION, payload_sha256: sha256(indexBytes) },
    closure: { payload_sha256: sha256(closureBytes) },
    budget: { payload_sha256: sha256(budgetBytes) },
    summary_index: { payload_sha256: sha256(summaryIndexBytes) },
    policy_fingerprint: sha256('{}'), mapping_fingerprint: sha256('{}'),
    compatibility, verification: { disposition: 'passing', complete: true },
    created_at: NOW - 1000, expires_at: NOW + 60_000,
    ...manifestOverrides,
  };
  const write = (name, bytes) => {
    const fd = openSync(join(versionRoot, name), 'w', 0o600);
    try { writeFileSync(fd, bytes); } finally { closeSync(fd); }
  };
  write('registry.json', registryBytes);
  write('index.json', indexBytes);
  write('closure.json', closureBytes);
  write('budget.json', budgetBytes);
  write('summary-index.json', summaryIndexBytes);
  write('manifest.json', `${stableStringify(manifest)}\n`);
  return { versionRoot, manifest, closureBytes, budgetBytes, summaryIndexBytes };
}

function pointer(version = TUPLE_VERSION) {
  return { schema_version: 2, tuple_version_id: version };
}

function writeActivePointer(root, version = TUPLE_VERSION) {
  mkdirSync(join(root, 'release-tuples'), { recursive: true });
  writeFileSync(join(root, 'release-tuples', 'active.json'), `${stableStringify(pointer(version))}\n`);
}

test('schema version is bumped 1 -> 2', () => {
  assert.equal(COMPILED_INDEX_SCHEMA_VERSION, 2);
});

test('compatibility has orchestrator_contract_version and context_contract_version members', () => {
  assert.equal(COMPILED_INDEX_COMPATIBILITY.orchestrator_contract_version, 'workflow-first-v1');
  assert.equal(COMPILED_INDEX_COMPATIBILITY.context_contract_version, CONTEXT_CONTRACT_VERSION);
});

test('compatible() accepts schema-2 tuple with both new members', () => {
  // Indirect: build a tuple with full COMPILED_INDEX_COMPATIBILITY and load it — ready means compatible() returned true.
  const root = mkdtempSync(join(tmpdir(), 'router-schema2-compat-'));
  try {
    writeTuple(root);
    writeActivePointer(root);
    const loaded = loadCompiledIndex({ ownedRoot: root, now: NOW });
    assert.equal(loaded.status, 'ready');
    assert.equal(loaded.reason_code, 'release_tuple_active');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('compatible() rejects schema-1 tuple missing the new members (schema downgrade rejected)', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-schema2-downgrade-'));
  try {
    const legacyCompatibility = {
      router_contract: 'prompt-route-v1',
      policy_version: 'workflow-transitions-v1',
      capsule_schema_version: 1,
    };
    writeTuple(root, { compatibility: legacyCompatibility });
    writeActivePointer(root);
    const loaded = loadCompiledIndex({ ownedRoot: root, now: NOW });
    assert.equal(loaded.status, 'blocked');
    assert.equal(loaded.dispatch_eligible, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('COMPILED_INDEX_LIMITS has three new independent sibling bounds', () => {
  assert.equal(COMPILED_INDEX_LIMITS.closure_bytes, 64 * 1024);
  assert.equal(COMPILED_INDEX_LIMITS.budget_bytes, 32 * 1024);
  assert.equal(COMPILED_INDEX_LIMITS.summary_index_bytes, 16 * 1024);
});

test('verifyTuple rejects a tuple whose closure.payload_sha256 mismatches the actual closure bytes', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-schema2-tamper-closure-'));
  try {
    const { versionRoot } = writeTuple(root);
    // Tamper with closure.json contents after publish.
    writeFileSync(join(versionRoot, 'closure.json'), `${stableStringify({ schema_version: 1, by_workflow: {} })}\n`);
    writeActivePointer(root);
    const loaded = loadCompiledIndex({ ownedRoot: root, now: NOW });
    assert.equal(loaded.status, 'blocked');
    assert.equal(loaded.dispatch_eligible, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('verifyTuple rejects a tuple whose manifest lacks closure.payload_sha256 entirely', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-schema2-missing-hash-'));
  try {
    // Build a tuple, then rewrite the manifest with the closure field stripped.
    const { versionRoot, manifest } = writeTuple(root);
    const tamperedManifest = { ...manifest };
    delete tamperedManifest.closure;
    writeFileSync(join(versionRoot, 'manifest.json'), `${stableStringify(tamperedManifest)}\n`);
    writeActivePointer(root);
    const loaded = loadCompiledIndex({ ownedRoot: root, now: NOW });
    assert.equal(loaded.status, 'blocked');
    assert.equal(loaded.dispatch_eligible, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('loadCompiledIndex ready return includes closure, budget, summaryIndex keys', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-schema2-ready-keys-'));
  try {
    writeTuple(root);
    writeActivePointer(root);
    const loaded = loadCompiledIndex({ ownedRoot: root, now: NOW });
    assert.equal(loaded.status, 'ready');
    assert.deepEqual(Object.keys(loaded).sort(), [
      'budget', 'closure', 'dispatch_eligible', 'index', 'reason_code',
      'registry', 'registry_version_id', 'source', 'status', 'summaryIndex',
      'tuple_version_id', 'version_id',
    ].sort());
    assert.equal(loaded.closure.schema_version, 1);
    assert.equal(loaded.budget.schema_version, 1);
    assert.equal(loaded.summaryIndex.schema_version, 1);
    assert.deepEqual(Object.keys(loaded.closure.by_workflow), ['gsd-execute-phase']);
    assert.deepEqual(Object.keys(loaded.budget.by_workflow), ['gsd-execute-phase']);
    assert.deepEqual(Object.keys(loaded.summaryIndex.by_workflow), ['gsd-execute-phase']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('pointer with schema_version: 1 is rejected (pointer schema bumped to 2)', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-schema2-pointer-v1-'));
  try {
    writeTuple(root);
    mkdirSync(join(root, 'release-tuples'), { recursive: true });
    writeFileSync(join(root, 'release-tuples', 'active.json'), `${stableStringify({ schema_version: 1, tuple_version_id: TUPLE_VERSION })}\n`);
    const loaded = loadCompiledIndex({ ownedRoot: root, now: NOW });
    // v1 pointer falls through to the legacy compiled-index path, which has no fixture here -> blocked.
    assert.equal(loaded.status, 'blocked');
    assert.equal(loaded.dispatch_eligible, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('pointer with schema_version: 2 is accepted when tuple is otherwise valid', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-schema2-pointer-v2-'));
  try {
    writeTuple(root);
    writeActivePointer(root);
    const loaded = loadCompiledIndex({ ownedRoot: root, now: NOW });
    assert.equal(loaded.status, 'ready');
    assert.equal(loaded.tuple_version_id, TUPLE_VERSION);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('releaseTuplePointer recovery path also returns sibling keys', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-schema2-recovery-'));
  try {
    writeTuple(root);
    const loaded = loadCompiledIndex({
      ownedRoot: root, now: NOW,
      releaseTuplePointer: pointer(),
    });
    assert.equal(loaded.status, 'ready');
    assert.equal(loaded.reason_code, 'release_tuple_recovery_candidate');
    assert.equal(loaded.closure.schema_version, 1);
    assert.equal(loaded.budget.schema_version, 1);
    assert.equal(loaded.summaryIndex.schema_version, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('known-good fallback path also returns sibling keys', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-schema2-known-good-'));
  try {
    writeTuple(root);
    // active.json points at a non-existent version, so verifyTuple(active) fails and known-good is consulted.
    mkdirSync(join(root, 'release-tuples'), { recursive: true });
    writeFileSync(join(root, 'release-tuples', 'active.json'), `${stableStringify({ schema_version: 2, tuple_version_id: 't1-zzzzzzzzzzzzzzzz' })}\n`);
    writeFileSync(join(root, 'release-tuples', 'known-good.json'), `${stableStringify(pointer())}\n`);
    const loaded = loadCompiledIndex({ ownedRoot: root, now: NOW });
    assert.equal(loaded.status, 'ready');
    assert.equal(loaded.reason_code, 'release_tuple_known_good');
    assert.equal(loaded.closure.schema_version, 1);
    assert.equal(loaded.budget.schema_version, 1);
    assert.equal(loaded.summaryIndex.schema_version, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('compile-index.mjs does NOT import from src/orchestrator/* (D-08 preserved)', () => {
  const source = readFileSync(new URL('../src/prompt/compile-index.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from\s+['"]\.\.\/orchestrator\//);
});