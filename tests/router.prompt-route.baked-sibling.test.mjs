import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { stableStringify } from '../src/registry/schema.mjs';
import { saveCapsule } from '../src/context/capsule.mjs';
import { routeContextPrompt } from '../src/context/prompt-route.mjs';
import {
  COMPILED_INDEX_COMPATIBILITY,
  COMPILED_INDEX_SCHEMA_VERSION,
} from '../src/prompt/compile-index.mjs';

// Phase 19 Plan 03 Task 2: read-only sibling projection (D-01/D-02) + dispatch_eligible
// gate (D-03) + no new imports (D-08). The route path must read baked closure/budget/
// summaryIndex siblings via the additive loadCompiledIndex return keys, observe the
// baked dispatch_eligible flag to synthesize a blocked resolution for required-overflow
// workflows (TOK-02 hot-path closure), and import NO new modules.

const sha256 = value => createHash('sha256').update(value).digest('hex');
const NOW = 1_800_000_000_000;
const TUPLE_VERSION = 't1-0123456789abcdef';
const REGISTRY_VERSION = 'v1-aaaaaaaaaaaaaaaa';
const COMPILED_VERSION = 'v1-bbbbbbbbbbbbbbbb';
const WORKFLOW_ID = 'gsd-execute-phase';

const ROUTES = {
  [WORKFLOW_ID]: {
    workflow_id: WORKFLOW_ID,
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

function closureEntry(overrides = {}) {
  return {
    selected_transition: { transition_id: 'gsd.execute', workflow_id: WORKFLOW_ID, family: 'gsd', from: 'planned', to: 'execute' },
    candidates: [{ transition_id: 'gsd.execute', workflow_id: WORKFLOW_ID, family: 'gsd', from: 'planned', to: 'execute' }],
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

function budgetEntry(overrides = {}) {
  return {
    report: {
      contract_version: 'workflow-context-contract-v1',
      estimator_version: 'utf8-bytes-v1-ceil-div-3',
      total_max_bytes: 12288, canonical_bytes: 0, estimated_tokens: 0,
      included_sources: [], omitted_sources: [], regression_delta: null,
    },
    dispatch_eligible: true,
    reason_code: 'context_load_planned',
    ...overrides,
  };
}

function writeTuple(root, { closure, budget, summaryIndex } = {}) {
  const versionRoot = join(root, 'release-tuples', 'versions', TUPLE_VERSION);
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
    schema_version: 1, state: 'verified', tuple_version_id: TUPLE_VERSION,
    registry: { version_id: REGISTRY_VERSION, payload_sha256: sha256(registryBytes) },
    compiled: { version_id: COMPILED_VERSION, payload_sha256: sha256(indexBytes) },
    closure: { payload_sha256: sha256(closureBytes) },
    budget: { payload_sha256: sha256(budgetBytes) },
    summary_index: { payload_sha256: sha256(summaryIndexBytes) },
    policy_fingerprint: sha256('{}'), mapping_fingerprint: sha256('{}'),
    compatibility: COMPILED_INDEX_COMPATIBILITY,
    verification: { disposition: 'passing', complete: true },
    created_at: NOW - 1000, expires_at: NOW + 60_000,
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
  mkdirSync(join(root, 'release-tuples'), { recursive: true });
  writeFileSync(join(root, 'release-tuples', 'active.json'), `${stableStringify({ schema_version: 2, tuple_version_id: TUPLE_VERSION })}\n`);
}

function capsule() {
  return {
    schema_version: 1, scope: { workspace_id: 'router-build', project_id: 'router' },
    goal: { id: 'phase-19', summary: 'Context recovery' },
    position: { workflow: WORKFLOW_ID, phase: '19', plan: '03', task: '2' }, status: 'active',
    artifacts: [{ ref: 'docs/design.md', type: 'design', status: 'current', witness: { kind: 'version', value: '1' }, priority: 1 }],
    blockers: [], freshness: { captured_at: 1, generation: 'phase-19' }, provenance: { source: 'workflow-state', version: '1' },
  };
}

test('dispatch_eligible:false baked budget -> blocked resolution with baked reason_code (D-03 TOK-02 hot-path closure)', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-prompt-route-baked-blocked-'));
  try {
    writeTuple(root, {
      closure: { schema_version: 1, by_workflow: { [WORKFLOW_ID]: closureEntry() } },
      budget: { schema_version: 1, by_workflow: { [WORKFLOW_ID]: budgetEntry({ dispatch_eligible: false, reason_code: 'required_context_overflow' }) } },
      summaryIndex: { schema_version: 1, by_workflow: { [WORKFLOW_ID]: null } },
    });
    saveCapsule({ ownedRoot: root, capsule: capsule() });
    const routed = routeContextPrompt({ prompt: 'continue', ownedRoot: root, projectRoot: root, now: NOW });
    assert.equal(routed.handled, true);
    assert.equal(routed.resolution.outcome, 'blocked');
    assert.equal(routed.resolution.dispatch_eligible, false);
    assert.equal(routed.resolution.reason_code, 'required_context_overflow');
    assert.match(routed.additional_context, /context-recovery/);
    // A blocked baked-budget route must NOT return a compiled projection (siblings are lazy).
    assert.equal(routed.compiled, undefined);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('dispatch_eligible:true baked budget -> compiled return includes closure/budget/summaryIndex siblings (D-01/D-02)', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-prompt-route-baked-eligible-'));
  try {
    const closure = { schema_version: 1, by_workflow: { [WORKFLOW_ID]: closureEntry() } };
    const budget = { schema_version: 1, by_workflow: { [WORKFLOW_ID]: budgetEntry() } };
    const summaryIndex = { schema_version: 1, by_workflow: { [WORKFLOW_ID]: 'summary-ref-1' } };
    writeTuple(root, { closure, budget, summaryIndex });
    saveCapsule({ ownedRoot: root, capsule: capsule() });
    const routed = routeContextPrompt({ prompt: 'continue', ownedRoot: root, projectRoot: root, now: NOW });
    assert.equal(routed.handled, true);
    assert.equal(routed.resolution.dispatch_eligible, true);
    assert.equal(routed.compiled.workflow_id, WORKFLOW_ID);
    // The three sibling projections are present and mirror the per-workflow map values.
    assert.deepEqual(routed.compiled.closure, closure.by_workflow[WORKFLOW_ID]);
    assert.deepEqual(routed.compiled.budget, budget.by_workflow[WORKFLOW_ID]);
    assert.equal(routed.compiled.summaryIndex, 'summary-ref-1');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('legacy tuple missing siblings does NOT crash prompt-route.mjs (defensive ?? null fallback)', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-prompt-route-baked-legacy-'));
  try {
    // Publish a tuple whose sibling files exist (so verifyTuple hash checks pass) but whose
    // by_workflow maps do NOT contain the routed workflow_id. The route path must fall back
    // to ?? null without throwing.
    writeTuple(root, {
      closure: { schema_version: 1, by_workflow: {} },
      budget: { schema_version: 1, by_workflow: {} },
      summaryIndex: { schema_version: 1, by_workflow: {} },
    });
    saveCapsule({ ownedRoot: root, capsule: capsule() });
    const routed = routeContextPrompt({ prompt: 'continue', ownedRoot: root, projectRoot: root, now: NOW });
    assert.equal(routed.handled, true);
    // The projection exists (routes?.[workflowId] is present), so the compiled return is built.
    // Siblings missing for this workflow_id fall back to null — no throw, no crash.
    assert.equal(routed.compiled.workflow_id, WORKFLOW_ID);
    assert.equal(routed.compiled.closure, null);
    assert.equal(routed.compiled.budget, null);
    assert.equal(routed.compiled.summaryIndex, null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('prompt-route.mjs does NOT import from src/orchestrator/* (D-08 preserved)', () => {
  const source = readFileSync(new URL('../src/context/prompt-route.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from\s+['"]\.\.\/orchestrator\//);
});