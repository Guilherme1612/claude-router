import { stableCapabilityId } from './identity.mjs';
import { stableStringify } from './schema.mjs';
import { validateContractFieldValue, hasUnsafeAuthoredContent, CONTRACT_FIELDS } from './contract.mjs';

export const ELIGIBILITY_GATES = Object.freeze([
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
]);

const DISPATCH_FIELDS = Object.freeze([
  'inputs',
  'preconditions',
  'dependencies',
  'permissions',
  'side_effects',
  'reversibility',
  'risk',
  'invocation_kind',
  'scope',
  'workflow_transitions',
]);
const MAX_RELATIONSHIPS = 128;

function field(record, name) {
  return record?.contract?.fields?.[name];
}

function fieldState(record, name, decide) {
  const envelope = field(record, name);
  if (!record?.contract) return 'unknown';
  if (!envelope || envelope.state !== 'known') return 'unknown';
  if (validateContractFieldValue(name, envelope.value)) return 'unknown';
  return decide(envelope.value);
}

function targetState(record, recordsById) {
  if (!record || typeof record !== 'object') return 'unknown';
  if (Object.hasOwn(record, 'id') && (typeof record.id !== 'string' || !record.id)) return 'unknown';
  let id;
  try {
    id = stableCapabilityId(record);
  } catch {
    return 'unknown';
  }
  const target = recordsById.get(id);
  if (!target) return 'failed';
  return target.enabled !== false && target.lifecycle === 'ready' ? 'passed' : 'failed';
}

function invocationState(record) {
  const invocation = record?.invocation;
  if (!invocation || typeof invocation !== 'object' || typeof invocation.availability !== 'string') return 'unknown';
  if (invocation.availability !== 'available') return 'failed';
  return typeof invocation.runtime === 'string' && invocation.runtime
    && typeof invocation.command === 'string' && invocation.command
    && Array.isArray(invocation.args)
    ? 'passed'
    : 'unknown';
}

function adapterState(record) {
  if (!Array.isArray(record?.adapter_evidence) || !record.adapter_evidence.length) return 'unknown';
  const runtime = record.invocation?.runtime;
  const nativeType = record.native_type;
  const supported = record.adapter_evidence.some(value => (
    value?.native_type === nativeType
    && typeof value.adapter === 'string' && value.adapter
    && typeof value.parser === 'string' && value.parser
    && (!runtime || value.namespace === runtime)
  ));
  return supported ? 'passed' : 'failed';
}

function dependencyState(record, recordsById, relationships) {
  if (record?.dependencies?.state !== 'declared') {
    return 'unknown';
  }
  if (record.dependencies.items.some(value => value?.available !== true)) return 'failed';

  const subjectId = stableCapabilityId(record);
  const edges = Array.isArray(relationships?.edges)
    ? relationships.edges.slice(0, MAX_RELATIONSHIPS)
    : [];
  if (edges.some(edge => edge.type === 'conflict'
    && (edge.source_id === subjectId || edge.target_id === subjectId))) return 'failed';
  if (relationships?.reason_codes?.some(code => (
    code === 'relationship_active_overflow' || code === 'relationship_inactive_overflow'
  ))) return 'unknown';
  const candidates = Array.isArray(relationships?.candidates)
    ? relationships.candidates.slice(0, MAX_RELATIONSHIPS)
    : [];
  if (candidates.some(edge => edge.type === 'prerequisite'
    && (edge.source_id === subjectId || edge.target_id === subjectId))) return 'unknown';

  const prerequisites = new Map();
  for (const edge of edges) {
    if (edge.type !== 'prerequisite') continue;
    if (!prerequisites.has(edge.source_id)) prerequisites.set(edge.source_id, []);
    prerequisites.get(edge.source_id).push(edge.target_id);
  }
  const queue = [subjectId];
  const visited = new Set();
  for (let index = 0; index < queue.length && index <= MAX_RELATIONSHIPS; index += 1) {
    const current = queue[index];
    if (visited.has(current)) continue;
    visited.add(current);
    for (const dependencyId of prerequisites.get(current) || []) {
      const dependency = recordsById.get(dependencyId);
      if (!dependency || dependency.enabled === false || dependency.lifecycle !== 'ready') return 'failed';
      queue.push(dependencyId);
    }
  }
  return queue.length > MAX_RELATIONSHIPS ? 'unknown' : 'passed';
}

function confidenceState(record) {
  if (!record?.contract) return 'unknown';
  let unknown = false;
  for (const name of DISPATCH_FIELDS) {
    const envelope = field(record, name);
    if (!envelope || envelope.state !== 'known' || envelope.freshness !== 'fresh') {
      unknown = true;
      continue;
    }
    if (!Number.isInteger(envelope.confidence_basis_points)
      || envelope.confidence_basis_points < 8500
      || envelope.confidence_basis_points > 10000) return 'failed';
  }
  return unknown ? 'unknown' : 'passed';
}

function unsafeValue(value, tokens) {
  const text = stableStringify(value).toLowerCase();
  return tokens.some(token => text.includes(token));
}

// --- TRUST-05: quarantine disposition -----------------------------------------
// Per RESEARCH Pattern 5 + Pitfall 5: quarantine is per-capability (per-record),
// NOT per-route. evaluateEligibility already operates per-record; the quarantine
// flag is computed from the record's contract only and does not read siblings.
//
// Quarantine reasons:
//   injection_bearing — unsafe content (secrets, paths, control chars) in a
//                        contract field value, detected via hasUnsafeAuthoredContent.
//   scope_escaping    — invocation_kind.value does not match record.semantic_type
//                        and is not 'none' (declares an invocation outside scope).
//   stale_unavailable  — a dispatch field's freshness is 'stale' beyond threshold.
const QUARANTINE_REASON_TOKEN = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

function computeQuarantineReasons(record) {
  const reasons = [];
  if (!record?.contract?.fields) return reasons;

  // injection_bearing: scan contract field values for unsafe content
  for (const fieldName of CONTRACT_FIELDS) {
    const envelope = field(record, fieldName);
    if (envelope?.state === 'known' && envelope.value !== undefined) {
      if (hasUnsafeAuthoredContent(envelope.value, fieldName)) {
        reasons.push('injection_bearing');
        break;
      }
    }
  }

  // scope_escaping: invocation_kind.value mismatches semantic_type (and is not 'none')
  const invocationKind = field(record, 'invocation_kind');
  if (invocationKind?.state === 'known'
    && typeof invocationKind.value === 'string'
    && invocationKind.value !== 'none'
    && invocationKind.value !== record?.semantic_type) {
    reasons.push('scope_escaping');
  }

  // stale_unavailable: a dispatch field with freshness 'stale'
  for (const fieldName of DISPATCH_FIELDS) {
    const envelope = field(record, fieldName);
    if (envelope?.freshness === 'stale') {
      reasons.push('stale_unavailable');
      break;
    }
  }

  return reasons;
}

export function isQuarantined(record) {
  return computeQuarantineReasons(record).length > 0;
}

export function evaluateEligibility({ record, records = [], relationships = {} } = {}) {
  const recordsById = new Map();
  for (const candidate of Array.isArray(records) ? records : []) {
    try {
      recordsById.set(stableCapabilityId(candidate), candidate);
    } catch {
      // Invalid candidates cannot establish target existence.
    }
  }
  const gates = {
    target_existence: targetState(record, recordsById),
    invocation_shape: invocationState(record),
    adapter: adapterState(record),
    dependency_closure: dependencyState(record, recordsById, relationships),
    permission: fieldState(record, 'permissions', value => (
      unsafeValue(value, ['denied', 'forbidden', 'unauthorized']) ? 'failed' : 'passed'
    )),
    scope: fieldState(record, 'scope', value => (
      stableStringify(value) === stableStringify(record?.scope) ? 'passed' : 'failed'
    )),
    side_effects: fieldState(record, 'side_effects', value => (
      unsafeValue(value, ['destructive', 'unbounded', 'unapproved']) ? 'failed' : 'passed'
    )),
    reversibility: fieldState(record, 'reversibility', value => {
      if (unsafeValue(value, ['unknown'])) return 'unknown';
      return unsafeValue(value, ['irreversible', '"no"']) ? 'failed' : 'passed';
    }),
    risk: fieldState(record, 'risk', value => {
      if (unsafeValue(value, ['unknown'])) return 'unknown';
      return unsafeValue(value, ['high', 'critical', 'unacceptable']) ? 'failed' : 'passed';
    }),
    field_confidence: confidenceState(record),
  };
  const reasonCodes = ELIGIBILITY_GATES
    .filter(name => gates[name] !== 'passed')
    .map(name => `${name}_${gates[name]}`);
  const gateEligible = reasonCodes.length === 0;
  const quarantineReasons = computeQuarantineReasons(record);
  const quarantined = quarantineReasons.length > 0;
  const eligible = quarantined ? false : gateEligible;
  return {
    schema_version: 1,
    policy_version: 'eligibility-policy-v1',
    eligible,
    recommendation_only: !eligible,
    gates,
    reason_codes: gateEligible ? ['eligibility_all_gates_passed'] : reasonCodes,
    quarantined,
    quarantine_reasons: quarantineReasons,
  };
}
