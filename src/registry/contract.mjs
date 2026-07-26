import { stableStringify, validateCapability } from './schema.mjs';

export const CONTRACT_FIELDS = Object.freeze([
  'purpose',
  'triggers',
  'inputs',
  'outputs',
  'preconditions',
  'dependencies',
  'permissions',
  'side_effects',
  'reversibility',
  'risk',
  'invocation_kind',
  'lifecycle_role',
  'scope',
  'workflow_transitions',
]);

export const CONTRACT_POLICY = Object.freeze({
  policy_version: 'contract-policy-v1',
  inferred_minimum_basis_points: 8500,
  structural_minimum_basis_points: 10000,
  max_evidence_per_field: 64,
});

const DISPATCH_FIELDS = new Set([
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
const FRESHNESS = new Set(['fresh', 'stale', 'unknown']);
const SAFE_PROVENANCE = new Set(['adapter', 'manifest', 'correction', 'authored']);

function ordered(values) {
  return [...values].sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)));
}

function reasonToken(value, fallback) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(value) ? value : fallback;
}

function portableEvidence(candidate, accepted, reasonCode) {
  return {
    provenance: SAFE_PROVENANCE.has(candidate.provenance) ? candidate.provenance : 'unknown',
    rule_version: reasonToken(candidate.rule, 'unknown-rule'),
    freshness: FRESHNESS.has(candidate.freshness) ? candidate.freshness : 'unknown',
    confidence_basis_points: Number.isInteger(candidate.confidence_basis_points)
      ? Math.max(0, Math.min(10000, candidate.confidence_basis_points))
      : 0,
    accepted,
    reason_code: reasonCode,
  };
}

function envelope(field, candidates) {
  const bounded = Array.isArray(candidates)
    ? candidates.slice(0, CONTRACT_POLICY.max_evidence_per_field)
    : [];
  const rejected = [];
  const eligible = [];
  for (const candidate of bounded) {
    if (!candidate || typeof candidate !== 'object' || candidate.provenance === 'authored') {
      rejected.push(portableEvidence(candidate || {}, false, 'authored_evidence_rejected'));
      continue;
    }
    if (candidate.freshness !== 'fresh') {
      rejected.push(portableEvidence(candidate, false, `${field}_stale`));
      continue;
    }
    const threshold = candidate.provenance === 'adapter'
      ? CONTRACT_POLICY.structural_minimum_basis_points
      : CONTRACT_POLICY.inferred_minimum_basis_points;
    if (!Number.isInteger(candidate.confidence_basis_points)
      || candidate.confidence_basis_points < threshold
      || candidate.confidence_basis_points > 10000) {
      rejected.push(portableEvidence(candidate, false, `${field}_below_threshold`));
      continue;
    }
    eligible.push(candidate);
  }
  const distinct = new Map(eligible.map(candidate => [stableStringify(candidate.value), candidate]));
  const assertedValues = new Set(bounded
    .filter(candidate => candidate && typeof candidate === 'object' && Object.hasOwn(candidate, 'value'))
    .map(candidate => stableStringify(candidate.value)));
  let reason = `${field}_accepted`;
  if (!bounded.length) reason = `${field}_missing`;
  else if (assertedValues.size > 1) reason = `${field}_conflicting`;
  else if (!eligible.length) {
    reason = rejected.find(item => item.reason_code === `${field}_stale`)
      ? `${field}_stale`
      : `${field}_below_threshold`;
  }
  const known = assertedValues.size <= 1 && distinct.size === 1;
  const accepted = known ? [...distinct.values()][0] : null;
  const evidence = known ? eligible.map(candidate => portableEvidence(candidate, true, reason)) : [];
  if (!known) {
    rejected.push(...eligible.map(candidate => portableEvidence(candidate, false, reason)));
  }
  return {
    state: known ? 'known' : 'unknown',
    ...(known ? { value: accepted.value } : {}),
    evidence: ordered(evidence),
    rejected_evidence: ordered(rejected),
    provenance: known ? [...new Set(eligible.map(item => item.provenance))].sort() : [],
    policy_version: CONTRACT_POLICY.policy_version,
    freshness: known ? 'fresh' : (reason.endsWith('_stale') ? 'stale' : 'unknown'),
    confidence_basis_points: known
      ? Math.min(...eligible.map(item => item.confidence_basis_points))
      : 0,
    reason_codes: [reason],
  };
}

export function buildCapabilityContract(record, fieldEvidence = {}) {
  validateCapability(record);
  const fields = Object.fromEntries(CONTRACT_FIELDS.map(field => [
    field,
    envelope(field, fieldEvidence[field]),
  ]));
  const unknownDispatchFields = CONTRACT_FIELDS.filter(field => (
    DISPATCH_FIELDS.has(field) && fields[field].state !== 'known'
  ));
  return {
    schema_version: 1,
    policy_version: CONTRACT_POLICY.policy_version,
    fields,
    disposition: unknownDispatchFields.length ? 'recommendation-only' : 'dispatch-candidate',
    reason_codes: unknownDispatchFields.length
      ? unknownDispatchFields.map(field => fields[field].reason_codes[0]).sort()
      : ['contract_complete'],
  };
}

export function validateCapabilityContract(contract) {
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    throw new TypeError('capability.contract must be an object');
  }
  if (contract.schema_version !== 1) throw new TypeError('capability.contract.schema_version must be 1');
  if (contract.policy_version !== CONTRACT_POLICY.policy_version) {
    throw new TypeError(`capability.contract.policy_version must be ${CONTRACT_POLICY.policy_version}`);
  }
  if (!contract.fields || typeof contract.fields !== 'object' || Array.isArray(contract.fields)) {
    throw new TypeError('capability.contract.fields must be an object');
  }
  if (stableStringify(Object.keys(contract.fields).sort()) !== stableStringify([...CONTRACT_FIELDS].sort())) {
    throw new TypeError('capability.contract.fields must contain the complete canonical field set');
  }
  for (const [field, value] of Object.entries(contract.fields)) {
    if (!['known', 'unknown'].includes(value?.state)) throw new TypeError(`capability.contract.fields.${field}.state is invalid`);
    if (value.state === 'known' && !Object.hasOwn(value, 'value')) throw new TypeError(`capability.contract.fields.${field}.value is required`);
    if (value.state === 'unknown' && Object.hasOwn(value, 'value')) throw new TypeError(`capability.contract.fields.${field}.value must be absent when unknown`);
    if (!Array.isArray(value.evidence) || value.evidence.length > CONTRACT_POLICY.max_evidence_per_field) {
      throw new TypeError(`capability.contract.fields.${field}.evidence must be bounded`);
    }
    if (!Array.isArray(value.rejected_evidence) || value.rejected_evidence.length > CONTRACT_POLICY.max_evidence_per_field) {
      throw new TypeError(`capability.contract.fields.${field}.rejected_evidence must be bounded`);
    }
    if (!Array.isArray(value.provenance) || !Array.isArray(value.reason_codes)) {
      throw new TypeError(`capability.contract.fields.${field} explanation collections are required`);
    }
    if (!FRESHNESS.has(value.freshness)) throw new TypeError(`capability.contract.fields.${field}.freshness is invalid`);
    if (!Number.isInteger(value.confidence_basis_points)
      || value.confidence_basis_points < 0
      || value.confidence_basis_points > 10000) {
      throw new TypeError(`capability.contract.fields.${field}.confidence_basis_points must be integer basis points`);
    }
    for (const item of [...value.evidence, ...value.rejected_evidence]) {
      if ('value' in item) throw new TypeError(`capability.contract.fields.${field} evidence must not expose raw values`);
      if (!Number.isInteger(item.confidence_basis_points)) {
        throw new TypeError(`capability.contract.fields.${field} evidence confidence must be integer basis points`);
      }
    }
  }
  if (!['dispatch-candidate', 'recommendation-only'].includes(contract.disposition)) {
    throw new TypeError('capability.contract.disposition is invalid');
  }
  if (CONTRACT_FIELDS.some(field => DISPATCH_FIELDS.has(field) && contract.fields[field].state === 'unknown')
    && contract.disposition !== 'recommendation-only') {
    throw new TypeError('capability.contract uncertainty requires recommendation-only disposition');
  }
  if (!Array.isArray(contract.reason_codes) || !contract.reason_codes.length) {
    throw new TypeError('capability.contract.reason_codes must be a non-empty array');
  }
  return true;
}
