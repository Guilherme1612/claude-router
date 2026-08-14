import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { stableStringify } from './schema.mjs';

export const MANIFEST_SCHEMA_VERSION = 1;
export const MANIFEST_STATES = Object.freeze([
  'mapped', 'available', 'eligible', 'dispatchable', 'diagnostic-only',
  'recommendation-only', 'quarantined', 'unknown',
]);

const MAX_RECORDS = 1024;
const MAX_LIST = 64;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;
const FINGERPRINT = /^[a-f0-9]{64}$/;
const RUNTIMES = new Set(['claude', 'codex', 'unknown']);
const SCOPES = new Set(['global', 'user', 'project', 'worktree', 'unknown']);
const AUTHORITY = new Set(['advice', 'inspect', 'one-turn', 'persistent', 'unknown']);
const RISK = new Set(['unknown', 'low', 'medium', 'high', 'critical', 'unacceptable']);
const EVIDENCE = new Set(['explicit', 'inferred', 'synthetic', 'evaluation', 'installed', 'audit', 'live', 'unknown']);
const INVOCATION_METHODS = new Set(['native', 'command', 'agent', 'skill', 'module', 'mcp', 'hook', 'unknown']);

function token(value, max = 128) {
  return typeof value === 'string' && value.length > 0 && value.length <= max && TOKEN.test(value)
    ? value
    : null;
}

function list(value) {
  const values = typeof value === 'string' ? [value] : Array.isArray(value) ? value : [];
  return [...new Set(values.map(item => token(item)).filter(Boolean))].sort().slice(0, MAX_LIST);
}

function safeRelative(value) {
  if (typeof value !== 'string' || !value.trim()) return { value: null, reason: 'missing_provenance' };
  const raw = value.replaceAll('\\', '/');
  if (raw.startsWith('/') || /^[A-Za-z]:\//.test(raw) || raw.split('/').includes('..')) {
    return { value: null, reason: 'path_escape' };
  }
  const normalized = posix.normalize(raw);
  return normalized === '.' || normalized.startsWith('../')
    ? { value: null, reason: 'path_escape' }
    : { value: normalized };
}

function boundedNumber(value, maximum = 1_000_000) {
  return Number.isFinite(value) && value >= 0 && value <= maximum ? value : null;
}

function safeShape(value) {
  return list(value).map(item => item.slice(0, 64));
}

function hash(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function provenanceOf(input, defaults) {
  const source = token(input?.source || input?.provenance?.source || defaults.source) || 'unknown';
  const logicalRoot = token(input?.logical_root || input?.provenance?.logical_root || defaults.logical_root);
  const relative = safeRelative(input?.relative_path || input?.provenance?.relative_path || defaults.relative_path);
  const sourceFingerprint = input?.source_fingerprint || input?.provenance?.source_fingerprint;
  const symlink = input?.symlink === true || input?.provenance?.symlink === true;
  const symlinkTarget = symlink
    ? safeRelative(input?.symlink_target || input?.provenance?.symlink_target)
    : { value: null };
  return {
    source,
    logical_root: logicalRoot,
    relative_path: relative.value,
    symlink,
    symlink_target: symlinkTarget.value,
    source_fingerprint: FINGERPRINT.test(sourceFingerprint || '') ? sourceFingerprint : null,
    reasons: [...new Set([
      ...(relative.reason ? [relative.reason] : []),
      ...(symlink && (!symlinkTarget.value || symlinkTarget.reason) ? ['symlink_target_missing'] : []),
      ...(source === 'unknown' ? ['provenance_unknown'] : []),
    ])].sort(),
  };
}

function invocationOf(input) {
  const value = input?.invocation && typeof input.invocation === 'object' ? input.invocation : {};
  const method = token(value.method || value.kind) || 'unknown';
  const target = token(value.target || value.entrypoint);
  const reasons = [];
  if (!INVOCATION_METHODS.has(method)) reasons.push('invocation_method_unknown');
  if (method === 'unknown' || !target) reasons.push('invocation_missing');
  return {
    method: INVOCATION_METHODS.has(method) ? method : 'unknown',
    target,
    input: safeShape(value.input || value.input_shape),
    output: safeShape(value.output || value.output_shape),
    known: method !== 'unknown' && Boolean(target),
    reasons: [...new Set(reasons)].sort(),
  };
}

function authorityOf(input) {
  const value = input?.authority && typeof input.authority === 'object' ? input.authority : {};
  const ceiling = token(value.ceiling) || 'unknown';
  const evidence = token(value.evidence || value.evidence_class) || 'unknown';
  const reasons = [];
  if (ceiling === 'unknown' || !AUTHORITY.has(ceiling)) reasons.push('authority_unknown');
  if (!EVIDENCE.has(evidence) || evidence === 'unknown') reasons.push('authority_evidence_missing');
  return {
    ceiling: AUTHORITY.has(ceiling) ? ceiling : 'unknown',
    evidence: EVIDENCE.has(evidence) ? evidence : 'unknown',
    known: AUTHORITY.has(ceiling) && ceiling !== 'unknown' && EVIDENCE.has(evidence) && evidence !== 'unknown',
    reasons: [...new Set(reasons)].sort(),
  };
}

function costOf(input) {
  const value = input?.cost && typeof input.cost === 'object' ? input.cost : {};
  return {
    estimated_tokens: boundedNumber(value.estimated_tokens ?? value.tokens),
    context_bytes: boundedNumber(value.context_bytes),
    latency_ms: boundedNumber(value.latency_ms),
    tool_calls: boundedNumber(value.tool_calls, 256),
    retries: boundedNumber(value.retries, 32),
    downstream_ms: boundedNumber(value.downstream_ms),
  };
}

function relationshipsOf(input) {
  const value = input?.relationships && typeof input.relationships === 'object' ? input.relationships : input || {};
  return {
    aliases: list(value.aliases),
    equivalents: list(value.equivalents),
    complements: list(value.complements || value.complementary),
    conflicts: list(value.conflicts),
  };
}

function deriveState({ mapped, available, eligible, requestedDispatch, invocation, authority, reasons, diagnosticOnly, evidenceIncomplete }) {
  const quarantine = [...new Set(reasons)].sort();
  if (quarantine.length) return { state: 'quarantined', dispatchable: false, quarantine };
  if (!mapped) return { state: 'unknown', dispatchable: false, quarantine: [] };
  if (diagnosticOnly) return { state: 'diagnostic-only', dispatchable: false, quarantine: [] };
  if (requestedDispatch && evidenceIncomplete) return { state: 'recommendation-only', dispatchable: false, quarantine: [] };
  if (requestedDispatch && invocation.known && authority.known && available && eligible) {
    return { state: 'dispatchable', dispatchable: true, quarantine: [] };
  }
  if (requestedDispatch && (!invocation.known || !authority.known)) {
    return { state: 'recommendation-only', dispatchable: false, quarantine: [] };
  }
  if (eligible) return { state: 'eligible', dispatchable: false, quarantine: [] };
  if (available) return { state: 'available', dispatchable: false, quarantine: [] };
  return { state: 'mapped', dispatchable: false, quarantine: [] };
}

export function normalizeCapabilityDescriptor(input = {}, defaults = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const identity = token(source.stable_id || source.id || source.name);
  const name = token(source.name || source.id || source.stable_id);
  const type = token(source.type || source.kind) || 'unknown';
  const role = token(source.role) || null;
  const roles = list(source.roles || (role ? [role] : []));
  const runtime = token(source.runtime || defaults.runtime) || 'unknown';
  const scopeInput = source.scope || defaults.scope || { kind: 'unknown' };
  const scopeKind = token(scopeInput.kind) || 'unknown';
  const scope = {
    kind: SCOPES.has(scopeKind) ? scopeKind : 'unknown',
    ...(token(scopeInput.identity) ? { identity: token(scopeInput.identity) } : {}),
    ...(token(scopeInput.repository) ? { repository: token(scopeInput.repository) } : {}),
    ...(token(scopeInput.worktree) ? { worktree: token(scopeInput.worktree) } : {}),
  };
  const owner = token(source.owner || source.owner_id || defaults.owner);
  const provenance = provenanceOf(source, defaults);
  const invocation = invocationOf(source);
  const authority = authorityOf(source);
  const evidenceClass = token(source.evidence?.class || source.evidence_class) || 'unknown';
  const available = source.availability?.available === true || source.available === true;
  const eligible = available && (source.eligibility?.eligible === true || source.eligible === true);
  const requestedDispatch = source.dispatchable === true;
  const diagnosticOnly = source.diagnostic_only === true || source.dispatchable === false && source.invocation?.kind === 'hook';
  const reasons = [
    ...(identity && name ? [] : ['identity_missing']),
    ...(runtime === 'unknown' ? ['runtime_unknown'] : []),
    ...(scope.kind === 'unknown' ? ['scope_unknown'] : []),
    ...(owner ? [] : ['owner_missing']),
    ...provenance.reasons,
    ...invocation.reasons,
    ...authority.reasons,
    ...(EVIDENCE.has(evidenceClass) && evidenceClass !== 'unknown' ? [] : ['evidence_unknown']),
    ...(source.freshness && !['fresh', 'stale', 'unknown'].includes(source.freshness) ? ['freshness_unknown'] : []),
    ...(source.freshness === 'stale' ? ['freshness_stale'] : []),
  ];
  const identityValue = identity || `unknown:${hash({ name, type, runtime, scope, provenance }) .slice(0, 16)}`;
  const state = deriveState({
    mapped: Boolean(identity && name), available, eligible, requestedDispatch,
    invocation, authority,
    reasons: reasons.filter(reason => ['identity_missing', 'path_escape', 'freshness_unknown', 'freshness_stale', 'symlink_target_missing'].includes(reason)),
    evidenceIncomplete: reasons.some(reason => !['identity_missing', 'path_escape', 'freshness_unknown', 'freshness_stale', 'symlink_target_missing'].includes(reason)),
    diagnosticOnly,
  });
  const record = {
    schema_version: MANIFEST_SCHEMA_VERSION,
    stable_id: identityValue,
    name: name || null,
    type,
    role,
    roles,
    runtime,
    scope,
    owner: owner || null,
    provenance: {
      source: provenance.source,
      logical_root: provenance.logical_root,
      relative_path: provenance.relative_path,
      source_fingerprint: provenance.source_fingerprint,
    },
    invocation,
    input: invocation.input,
    output: invocation.output,
    dependencies: list(source.dependencies || source.requires),
    permissions: {
      required: list(source.permissions?.required),
      grants: list(source.permissions?.grants),
      denied: list(source.permissions?.denied),
    },
    authority,
    risk: {
      level: RISK.has(source.risk?.level) ? source.risk.level : 'unknown',
      evidence: token(source.risk?.evidence) || 'unknown',
    },
    reversibility: token(source.reversibility) || 'unknown',
    privacy: {
      raw_content: false,
      retention: token(source.privacy?.retention) || 'bounded',
      redaction: token(source.privacy?.redaction) || 'required',
    },
    freshness: ['fresh', 'stale', 'unknown'].includes(source.freshness) ? source.freshness : 'unknown',
    evidence: {
      class: EVIDENCE.has(evidenceClass) ? evidenceClass : 'unknown',
      verified: source.evidence?.verified === true,
      reason: token(source.evidence?.reason) || null,
    },
    availability: { available, reason: token(source.availability?.reason) || null },
    eligibility: { eligible, reasons: list(source.eligibility?.reasons) },
    dispatchable: state.dispatchable,
    cost: costOf(source),
    relationships: relationshipsOf(source),
    state: state.state,
    reason_codes: [...new Set([...reasons, ...state.quarantine])].sort().slice(0, MAX_LIST),
    quarantine: state.quarantine,
  };
  return { ...record, fingerprint: hash(record) };
}

export function validateCapabilityManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new TypeError('manifest must be an object');
  if (manifest.schema_version !== MANIFEST_SCHEMA_VERSION) throw new TypeError('manifest.schema_version is unsupported');
  if (!Array.isArray(manifest.records) || manifest.records.length > MAX_RECORDS) throw new TypeError('manifest.records is unbounded or missing');
  if (!MANIFEST_STATES.includes(manifest.status)) throw new TypeError('manifest.status is invalid');
  const ids = new Set();
  for (const record of manifest.records) {
    if (!record || typeof record !== 'object' || !token(record.stable_id)) throw new TypeError('manifest record identity is invalid');
    if (ids.has(record.stable_id)) throw new TypeError('manifest record identity is duplicated');
    ids.add(record.stable_id);
    if (!MANIFEST_STATES.includes(record.state)) throw new TypeError(`manifest record ${record.stable_id} state is invalid`);
    if (record.privacy?.raw_content !== false) throw new TypeError('manifest record privacy is unsafe');
    if (record.provenance?.relative_path && safeRelative(record.provenance.relative_path).reason) {
      throw new TypeError('manifest record provenance path is unsafe');
    }
    if (record.dispatchable === true && record.state !== 'dispatchable') throw new TypeError('dispatchability state mismatch');
  }
  const expected = manifest.records.reduce((counts, record) => {
    counts[record.state] = (counts[record.state] || 0) + 1;
    return counts;
  }, {});
  if (stableStringify(expected) !== stableStringify(manifest.counts)) throw new TypeError('manifest counts are inconsistent');
  if (manifest.safe_empty !== ((expected.dispatchable || 0) === 0)) throw new TypeError('manifest safe_empty is inconsistent');
  if (!FINGERPRINT.test(manifest.fingerprint || '')) throw new TypeError('manifest fingerprint is invalid');
  return true;
}

export function createCapabilityManifest(options = {}) {
  const { runtime = 'unknown', scope = { kind: 'unknown' }, framework = 'unknown', owner = null, epoch = 'unknown', records = [], defaults = {} } = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
  const normalized = (Array.isArray(records) ? records : []).slice(0, MAX_RECORDS)
    .map(record => normalizeCapabilityDescriptor(record, { runtime, scope, owner, ...defaults }))
    .sort((left, right) => left.stable_id.localeCompare(right.stable_id));
  const counts = normalized.reduce((result, record) => {
    result[record.state] = (result[record.state] || 0) + 1;
    return result;
  }, {});
  const manifest = {
    schema_version: MANIFEST_SCHEMA_VERSION,
    runtime: token(runtime) || 'unknown',
    scope,
    framework: token(framework) || 'unknown',
    owner: token(owner),
    epoch: token(epoch) || 'unknown',
    records: normalized,
    counts,
    safe_empty: (counts.dispatchable || 0) === 0,
    status: (counts.dispatchable || 0) === 0 ? 'unknown' : 'dispatchable',
  };
  const complete = { ...manifest, fingerprint: hash(manifest) };
  validateCapabilityManifest(complete);
  return complete;
}
