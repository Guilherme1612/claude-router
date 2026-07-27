import assert from 'node:assert/strict';
import { canonicalizeCapability, stableStringify } from '../../src/registry/schema.mjs';

export const syntheticRoots = Object.freeze({
  home: 'fixture_home',
  project: 'fixture_project',
  worktree: 'fixture_worktree',
});

export const mutationPlayback = Object.freeze([
  'add',
  'edit',
  'rename',
  'move',
  'disable',
  'replace',
  'dependency-loss',
  'removal',
]);

function record(name, overrides = {}) {
  const runtime = overrides.runtime || 'claude';
  const scope = overrides.scope || { kind: 'global' };
  const nativeType = overrides.native_type || `${runtime}:skill`;
  return {
    schema_version: 1,
    type: 'skill',
    native_type: nativeType,
    semantic_type: overrides.semantic_type || 'skill',
    lifecycle: 'ready',
    lifecycle_role: overrides.lifecycle_role || 'invocable',
    name,
    scope,
    enabled: overrides.enabled ?? true,
    dispatchable: overrides.dispatchable ?? true,
    invocation: overrides.invocation || {
      availability: 'available',
      runtime,
      command: 'Skill',
      args: [name],
    },
    dependencies: overrides.dependencies || { state: 'unknown', items: [] },
    provenance: [{
      runtime,
      scope: scope.kind,
      logical_root: scope.kind === 'global' ? syntheticRoots.home : syntheticRoots.project,
      relative_path: `capabilities/${name}/manifest.md`,
      source_fingerprint: `fixture-${name}`,
      adapter: `${runtime}@fixture`,
      parser: 'frontmatter@fixture',
    }],
    adapter_evidence: [{
      namespace: runtime,
      native_type: nativeType,
      adapter: `${runtime}@fixture`,
      parser: 'frontmatter@fixture',
    }],
    runtime_variants: [{ runtime, native_identity: name, native: { fixture: true } }],
    conflicts: [],
    diagnostics: [],
    ...overrides,
  };
}

export function buildClaudeHeavyProfile() {
  return [
    record('atlas'),
    record('beacon'),
    record('cairn', { native_type: 'claude:agent', semantic_type: 'agent' }),
    record('dock', {
      native_type: 'claude:instructions',
      semantic_type: 'instruction',
      lifecycle_role: 'instruction',
      dispatchable: false,
      invocation: { availability: 'unavailable', reason: 'inert-artifact' },
    }),
  ];
}

export function buildCodexHeavyProfile() {
  return [
    record('ember', { runtime: 'codex', native_type: 'codex:skill' }),
    record('flint', { runtime: 'codex', native_type: 'codex:agent', semantic_type: 'agent' }),
    record('grove', {
      runtime: 'codex',
      native_type: 'codex:config',
      semantic_type: 'configuration',
      lifecycle_role: 'configuration',
      dispatchable: false,
      invocation: { availability: 'unavailable', reason: 'inert-artifact' },
    }),
  ];
}

export function buildMixedCustomProfile() {
  return [
    record('harbor'),
    record('islet', { runtime: 'codex', native_type: 'codex:tool', semantic_type: 'tool' }),
    record('junction', {
      native_type: 'vendor.example:bundle',
      semantic_type: 'container',
      lifecycle_role: 'container',
      dispatchable: false,
      invocation: { availability: 'unavailable', reason: 'container-only' },
      container_id: 'vendor.example:bundle:junction',
    }),
  ];
}

export function buildUnknownFutureProfile() {
  return [
    record('keystone', {
      native_type: 'future.runtime:oracle',
      semantic_type: 'unknown',
      lifecycle_role: 'opaque',
      dispatchable: false,
      invocation: { availability: 'unavailable', reason: 'unknown-semantic-type' },
    }),
  ];
}

export function playbackMutation(profile, mutation, mutate = value => value) {
  if (!mutationPlayback.includes(mutation)) throw new TypeError(`unknown fixture mutation: ${mutation}`);
  return mutate(structuredClone(profile), mutation);
}

export function assertSemanticBytesEqual(left, right) {
  const bytes = value => stableStringify(value.map(canonicalizeCapability)
    .sort((a, b) => stableStringify(a).localeCompare(stableStringify(b))));
  assert.equal(bytes(left), bytes(right));
}

export function contractEvidence(record, variant = 'accepted') {
  const structural = {
    purpose: record.name,
    triggers: [record.name],
    inputs: [],
    outputs: [],
    preconditions: [],
    dependencies: record.dependencies.items.map(item => item.id),
    permissions: [],
    side_effects: [],
    reversibility: 'unknown',
    risk: 'unknown',
    invocation_kind: record.invocation.availability === 'available' ? record.semantic_type : 'none',
    lifecycle_role: record.lifecycle_role,
    scope: record.scope,
    workflow_transitions: [],
  };
  const evidence = Object.fromEntries(Object.entries(structural).map(([field, value]) => [field, [{
    value,
    provenance: 'adapter',
    confidence_basis_points: 10000,
    freshness: 'fresh',
    rule: `adapter-${field}-v1`,
  }]]));
  if (variant === 'missing') evidence.invocation_kind = [];
  if (variant === 'conflicting') evidence.invocation_kind.push({
    value: 'command',
    provenance: 'authored',
    confidence_basis_points: 9000,
    freshness: 'fresh',
    rule: 'authored-invocation-kind-v1',
  });
  if (variant === 'stale') evidence.invocation_kind[0].freshness = 'stale';
  if (variant === 'below-threshold') evidence.invocation_kind[0].confidence_basis_points = 8499;
  if (variant === 'rejected') evidence.purpose.push({
    value: 'SECRET=/Users/example/private authored body',
    provenance: 'authored',
    confidence_basis_points: 10000,
    freshness: 'fresh',
    rule: 'authored-purpose-v1',
  });
  if (variant === 'workflow-transitions') {
    evidence.workflow_transitions[0].value = ['gsd.execute'];
  }
  if (!['accepted', 'missing', 'conflicting', 'stale', 'below-threshold', 'rejected', 'workflow-transitions'].includes(variant)) {
    throw new TypeError(`unknown contract evidence variant: ${variant}`);
  }
  return evidence;
}
