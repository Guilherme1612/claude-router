import { posix } from 'node:path';

const LIFECYCLES = ['ready', 'partial', 'invalid'];
const SCOPES = ['global', 'project', 'worktree'];
const SEVERITIES = ['informational', 'dispatch-blocking', 'build-blocking'];
const DEPENDENCY_STATES = ['unknown', 'declared'];
const SET_LIKE_FIELDS = new Set(['conflicts', 'dependencies.items', 'provenance', 'runtime_variants']);

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
  if (scope.kind !== 'global') {
    nonempty(scope.repository, 'capability.scope.repository');
    nonempty(scope.worktree, 'capability.scope.worktree');
  }
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

export function validateCapability(record) {
  object(record, 'capability');
  if (record.schema_version !== 1) fail('capability.schema_version must be 1');
  nonempty(record.type, 'capability.type');
  nonempty(record.name, 'capability.name');
  oneOf(record.lifecycle, LIFECYCLES, 'capability.lifecycle');
  validateScope(record.scope);
  if (typeof record.dispatchable !== 'boolean') fail('capability.dispatchable must be a boolean');
  object(record.invocation, 'capability.invocation');
  nonempty(record.invocation.runtime, 'capability.invocation.runtime');
  nonempty(record.invocation.command, 'capability.invocation.command');
  if (!Array.isArray(record.invocation.args)) fail('capability.invocation.args must be an array');
  validateDependencies(record);
  validateProvenance(record.provenance);
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
    return SET_LIKE_FIELDS.has(path) ? sortSet(entries) : entries;
  }
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const key of Object.keys(value).sort()) {
    const childPath = path ? `${path}.${key}` : key;
    output[key] = canonicalize(value[key], childPath);
  }
  return output;
}

export function canonicalizeCapability(record) {
  validateCapability(record);
  return canonicalize(record);
}
