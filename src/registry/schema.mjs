import { posix } from 'node:path';
import { validateCapabilityContract } from './contract.mjs';

const LIFECYCLES = ['ready', 'partial', 'invalid'];
const SCOPES = ['global', 'user', 'project', 'worktree'];
const SEVERITIES = ['informational', 'dispatch-blocking', 'build-blocking'];
const DEPENDENCY_STATES = ['unknown', 'declared'];
const SEMANTIC_TYPES = [
  'command',
  'skill',
  'agent',
  'hook',
  'tool',
  'resource',
  'container',
  'configuration',
  'instruction',
  'unknown',
];
const LIFECYCLE_ROLES = [
  'invocable',
  'event-bound',
  'resource',
  'container',
  'configuration',
  'instruction',
  'opaque',
];
const INERT_SEMANTIC_TYPES = new Set(['container', 'configuration', 'instruction', 'unknown']);
const SET_LIKE_FIELDS = new Set([
  'adapter_evidence',
  'conflicts',
  'dependencies.items',
  'diagnostics',
  'provenance',
  'runtime_variants',
  'contract.reason_codes',
]);
const OPERATIONAL_FIELDS = new Set([
  'event_order',
  'generation_id',
  'operational',
  'processed_at',
  'scan_id',
  'scanned_at',
  'timestamp',
  'trigger',
]);
const ELIGIBILITY_GATES = [
  'target_existence',
  'invocation_shape',
  'adapter',
  'dependency_closure',
  'permission',
  'scope',
  'side_effects',
  'reversibility',
  'risk',
  'field_confidence',
];
const LEGACY_SEMANTIC_TYPES = Object.freeze({
  agents_store_skill: 'skill',
  binding: 'hook',
  dependency: 'tool',
  plugin_metadata: 'tool',
  plugin_skill: 'skill',
  settings: 'configuration',
});

function fail(message) {
  throw new TypeError(message);
}

function object(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${path} must be an object`);
}

function nonempty(value, path) {
  if (typeof value !== 'string' || !value.trim()) fail(`${path} must be a non-empty string`);
}

function oneOf(value, allowed, path) {
  if (!allowed.includes(value)) fail(`${path} must be one of: ${allowed.join(', ')}`);
}

function isAbsolutePortablePath(value) {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\');
}

function validateScope(scope) {
  object(scope, 'capability.scope');
  oneOf(scope.kind, SCOPES, 'capability.scope.kind');
  if (scope.kind === 'user') {
    nonempty(scope.identity, 'capability.scope.identity');
  } else if (scope.kind !== 'global') {
    nonempty(scope.repository, 'capability.scope.repository');
    nonempty(scope.worktree, 'capability.scope.worktree');
  }
}

function runtimeOf(record) {
  return record.invocation?.runtime || record.runtime_variants?.[0]?.runtime || record.provenance?.[0]?.runtime;
}

function normalizedSemanticType(record) {
  if (record.semantic_type !== undefined) return record.semantic_type;
  return LEGACY_SEMANTIC_TYPES[record.type]
    || (SEMANTIC_TYPES.includes(record.type) ? record.type : 'tool');
}

function normalizedLifecycleRole(record, semanticType) {
  if (record.lifecycle_role !== undefined) return record.lifecycle_role;
  if (semanticType === 'hook') return 'event-bound';
  if (semanticType === 'container') return 'container';
  if (semanticType === 'configuration') return 'configuration';
  if (semanticType === 'instruction') return 'instruction';
  if (semanticType === 'resource') return 'resource';
  if (semanticType === 'unknown') return 'opaque';
  return 'invocable';
}

function normalizeInvocation(record) {
  const invocation = record.invocation;
  if (invocation?.availability) return invocation;
  if (invocation?.runtime && invocation?.command && Array.isArray(invocation.args)) {
    return { availability: 'available', ...invocation };
  }
  return { availability: 'unavailable', reason: record.enabled === false ? 'disabled' : 'not-invocable' };
}

function normalizeAdapterEvidence(record, nativeType) {
  if (record.adapter_evidence !== undefined) return record.adapter_evidence;
  return record.provenance.map(source => ({
    namespace: nativeType.split(':', 1)[0],
    native_type: nativeType,
    adapter: source.adapter,
    parser: source.parser || 'unspecified@compat',
  }));
}

function normalizeRecord(record) {
  const runtime = runtimeOf(record);
  const nativeType = record.native_type || `${runtime}:${record.type}`;
  const semanticType = normalizedSemanticType(record);
  return {
    ...record,
    native_type: nativeType,
    semantic_type: semanticType,
    lifecycle_role: normalizedLifecycleRole(record, semanticType),
    enabled: record.enabled ?? true,
    invocation: normalizeInvocation(record),
    adapter_evidence: normalizeAdapterEvidence(record, nativeType),
    diagnostics: record.diagnostics || [],
  };
}

function validateDependencies(record) {
  object(record.dependencies, 'capability.dependencies');
  oneOf(record.dependencies.state, DEPENDENCY_STATES, 'capability.dependencies.state');
  if (!Array.isArray(record.dependencies.items)) fail('capability.dependencies.items must be an array');
  for (const [index, dependency] of record.dependencies.items.entries()) {
    object(dependency, `capability.dependencies.items[${index}]`);
    nonempty(dependency.id, `capability.dependencies.items[${index}].id`);
    if (typeof dependency.available !== 'boolean') {
      fail(`capability.dependencies.items[${index}].available must be a boolean`);
    }
  }
  if (record.dependencies.state === 'unknown' && record.dependencies.items.length) {
    fail('capability.dependencies.items must be empty when state is unknown');
  }
  if (record.dispatchable && record.dependencies.items.some((item) => !item.available)) {
    fail('capability.dispatchable must be false when a declared dependency is unavailable');
  }
}

function validateProvenance(provenance) {
  if (!Array.isArray(provenance) || provenance.length === 0) fail('capability.provenance must be a non-empty array');
  for (const [index, source] of provenance.entries()) {
    const path = `capability.provenance[${index}]`;
    object(source, path);
    for (const field of ['runtime', 'scope', 'logical_root', 'relative_path', 'source_fingerprint', 'adapter']) {
      nonempty(source[field], `${path}.${field}`);
    }
    if (isAbsolutePortablePath(source.logical_root)) fail(`${path}.logical_root must be logical, not absolute`);
    if (isAbsolutePortablePath(source.relative_path)) fail(`${path}.relative_path must be relative`);
    const normalized = posix.normalize(source.relative_path.replaceAll('\\', '/'));
    if (normalized === '..' || normalized.startsWith('../')) fail(`${path}.relative_path must remain within its logical root`);
  }
}

export function validateEligibility(eligibility) {
  object(eligibility, 'capability.eligibility');
  if (eligibility.schema_version !== 1) fail('capability.eligibility.schema_version must be 1');
  if (eligibility.policy_version !== 'eligibility-policy-v1') {
    fail('capability.eligibility.policy_version must be eligibility-policy-v1');
  }
  if (typeof eligibility.eligible !== 'boolean'
    || typeof eligibility.recommendation_only !== 'boolean'
    || eligibility.eligible === eligibility.recommendation_only) {
    fail('capability.eligibility disposition is invalid');
  }
  object(eligibility.gates, 'capability.eligibility.gates');
  if (stableStringify(Object.keys(eligibility.gates).sort()) !== stableStringify([...ELIGIBILITY_GATES].sort())) {
    fail('capability.eligibility.gates must contain the canonical gate set');
  }
  for (const gate of ELIGIBILITY_GATES) {
    oneOf(eligibility.gates[gate], ['passed', 'failed', 'unknown'], `capability.eligibility.gates.${gate}`);
  }
  if (!Array.isArray(eligibility.reason_codes)
    || eligibility.reason_codes.length < 1
    || eligibility.reason_codes.length > ELIGIBILITY_GATES.length) {
    fail('capability.eligibility.reason_codes must be a non-empty bounded array');
  }
  const expected = ELIGIBILITY_GATES
    .filter(gate => eligibility.gates[gate] !== 'passed')
    .map(gate => `${gate}_${eligibility.gates[gate]}`);
  const reasons = expected.length ? expected : ['eligibility_all_gates_passed'];
  if (stableStringify(eligibility.reason_codes) !== stableStringify(reasons)) {
    fail('capability.eligibility.reason_codes must match canonical gate results');
  }
  if (eligibility.eligible !== (expected.length === 0)) {
    fail('capability.eligibility.eligible requires every gate to pass');
  }
  return true;
}

export function validateCapability(record) {
  object(record, 'capability');
  if (record.schema_version !== 1) fail('capability.schema_version must be 1');
  nonempty(record.type, 'capability.type');
  nonempty(record.name, 'capability.name');
  oneOf(record.lifecycle, LIFECYCLES, 'capability.lifecycle');
  validateScope(record.scope);
  const normalized = normalizeRecord(record);
  nonempty(normalized.native_type, 'capability.native_type');
  if (!normalized.native_type.includes(':')) {
    fail('capability.native_type must be namespaced');
  }
  oneOf(normalized.semantic_type, SEMANTIC_TYPES, 'capability.semantic_type');
  oneOf(normalized.lifecycle_role, LIFECYCLE_ROLES, 'capability.lifecycle_role');
  if (typeof normalized.enabled !== 'boolean') fail('capability.enabled must be a boolean');
  if (typeof record.dispatchable !== 'boolean') fail('capability.dispatchable must be a boolean');
  if (!normalized.enabled && record.dispatchable) {
    fail('capability.enabled false requires capability.dispatchable false');
  }
  if (INERT_SEMANTIC_TYPES.has(normalized.semantic_type) && record.dispatchable) {
    fail(`capability.semantic_type ${normalized.semantic_type} must be non-dispatchable`);
  }
  object(normalized.invocation, 'capability.invocation');
  oneOf(normalized.invocation.availability, ['available', 'unavailable'], 'capability.invocation.availability');
  if (normalized.invocation.availability === 'available') {
    nonempty(normalized.invocation.runtime, 'capability.invocation.runtime');
    nonempty(normalized.invocation.command, 'capability.invocation.command');
    if (!Array.isArray(normalized.invocation.args)) fail('capability.invocation.args must be an array');
  } else {
    nonempty(normalized.invocation.reason, 'capability.invocation.reason');
    if (record.dispatchable) fail('capability.dispatchable requires an available invocation');
  }
  validateDependencies(record);
  validateProvenance(record.provenance);
  if (!Array.isArray(normalized.adapter_evidence) || normalized.adapter_evidence.length === 0
    || normalized.adapter_evidence.length > 64) {
    fail('capability.adapter_evidence must be a non-empty bounded array');
  }
  for (const [index, evidence] of normalized.adapter_evidence.entries()) {
    const path = `capability.adapter_evidence[${index}]`;
    object(evidence, path);
    for (const field of ['namespace', 'native_type', 'adapter', 'parser']) {
      nonempty(evidence[field], `${path}.${field}`);
    }
    if (!evidence.native_type.includes(':')) fail(`${path}.native_type must be namespaced`);
  }
  if (!Array.isArray(normalized.diagnostics) || normalized.diagnostics.length > 128) {
    fail('capability.diagnostics must be a bounded array');
  }
  if (record.container_id !== undefined) nonempty(record.container_id, 'capability.container_id');
  if (record.member_provenance !== undefined) {
    object(record.member_provenance, 'capability.member_provenance');
    nonempty(record.member_provenance.container_id, 'capability.member_provenance.container_id');
    nonempty(record.member_provenance.relative_path, 'capability.member_provenance.relative_path');
    if (record.container_id !== record.member_provenance.container_id) {
      fail('capability.member_provenance.container_id must match capability.container_id');
    }
    if (isAbsolutePortablePath(record.member_provenance.relative_path)) {
      fail('capability.member_provenance.relative_path must be relative');
    }
    const memberPath = posix.normalize(record.member_provenance.relative_path.replaceAll('\\', '/'));
    if (memberPath === '..' || memberPath.startsWith('../')) {
      fail('capability.member_provenance.relative_path must remain within its container');
    }
  }
  if (!Array.isArray(record.runtime_variants) || !record.runtime_variants.length) {
    fail('capability.runtime_variants must be a non-empty array');
  }
  for (const [index, variant] of record.runtime_variants.entries()) {
    object(variant, `capability.runtime_variants[${index}]`);
    nonempty(variant.runtime, `capability.runtime_variants[${index}].runtime`);
    nonempty(variant.native_identity, `capability.runtime_variants[${index}].native_identity`);
  }
  if (!Array.isArray(record.conflicts)) fail('capability.conflicts must be an array');
  for (const [index, conflict] of record.conflicts.entries()) {
    object(conflict, `capability.conflicts[${index}]`);
    oneOf(conflict.severity, SEVERITIES, `capability.conflicts[${index}].severity`);
  }
  if (record.contract !== undefined) validateCapabilityContract(record.contract);
  if (record.eligibility !== undefined) {
    validateEligibility(record.eligibility);
    if (record.dispatchable !== record.eligibility.eligible) {
      fail('capability.dispatchable must match derived capability.eligibility.eligible');
    }
  }
  return true;
}

function normalize(value, path, seen) {
  if (value === undefined) fail(`stableStringify does not support undefined at ${path}`);
  if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol') {
    fail(`stableStringify does not support ${typeof value} at ${path}`);
  }
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) fail(`stableStringify does not support non-finite numbers at ${path}`);
    return value;
  }
  if (seen.has(value)) fail('stableStringify does not support cyclic values');
  seen.add(value);
  let result;
  if (Array.isArray(value)) {
    result = value.map((entry, index) => normalize(entry, `${path}[${index}]`, seen));
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) fail(`stableStringify supports only plain objects at ${path}`);
    result = {};
    for (const key of Object.keys(value).sort()) result[key] = normalize(value[key], `${path}.${key}`, seen);
  }
  seen.delete(value);
  return result;
}

export function stableStringify(value) {
  return JSON.stringify(normalize(value, '$', new Set()));
}

function sortSet(array) {
  return [...array].sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)));
}

function canonicalize(value, path = '') {
  if (Array.isArray(value)) {
    const entries = value.map((entry) => canonicalize(entry, path));
    const contractSet = path.startsWith('contract.fields.')
      && ['evidence', 'rejected_evidence', 'provenance', 'reason_codes'].some(field => path.endsWith(`.${field}`));
    return SET_LIKE_FIELDS.has(path) || contractSet ? sortSet(entries) : entries;
  }
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const key of Object.keys(value).sort()) {
    if (OPERATIONAL_FIELDS.has(key)) continue;
    const childPath = path ? `${path}.${key}` : key;
    output[key] = canonicalize(value[key], childPath);
  }
  return output;
}

export function canonicalizeCapability(record) {
  validateCapability(record);
  return canonicalize(normalizeRecord(record));
}
