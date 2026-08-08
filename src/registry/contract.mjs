import { stableStringify, validateCapability } from './schema.mjs';
import { contentFingerprint, stableCapabilityId } from './identity.mjs';

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
  'action',
  'cost',
  'completion',
  'native_invocation',
]);

const EVIDENCE_CLASSES = new Set(['explicit', 'inferred', 'conflicting', 'unknown']);

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
  'action',
  'cost',
  'completion',
  'native_invocation',
]);
const FRESHNESS = new Set(['fresh', 'stale', 'unknown']);
const SAFE_PROVENANCE = new Set(['adapter', 'manifest', 'correction', 'authored']);
const OVERLAY_KEYS = new Set(['schema_version', 'kind', 'overlay_id', 'provenance', 'binding', 'fields']);
const BINDING_KEYS = new Set(['stable_id', 'source_fingerprint', 'scope', 'runtime']);
const CORRECTION_KEYS = new Set(['value']);
const OVERLAY_TOKEN = /^[a-z0-9][a-z0-9:._-]{0,127}$/i;
const STRING_LIST_FIELDS = new Set([
  'triggers',
  'inputs',
  'outputs',
  'preconditions',
  'dependencies',
  'permissions',
  'side_effects',
  'workflow_transitions',
]);
const ENUM_FIELDS = Object.freeze({
  reversibility: new Set(['unknown', 'reversible', 'irreversible']),
  risk: new Set(['unknown', 'low', 'medium', 'high', 'critical', 'unacceptable']),
  action: new Set(['unknown', 'invoke', 'query', 'observe', 'none']),
  cost: new Set(['unknown', 'low', 'medium', 'high', 'critical']),
});
const OBJECT_FIELDS = new Set(['scope', 'completion', 'native_invocation']);

function ordered(values) {
  return [...values].sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)));
}

function reasonToken(value, fallback) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(value) ? value : fallback;
}

export function validateContractFieldValue(field, value) {
  if (!CONTRACT_FIELDS.includes(field)) return `contract_${field}_field_invalid`;
  if (STRING_LIST_FIELDS.has(field)) {
    return Array.isArray(value) && value.every(item => typeof item === 'string' && item.length > 0)
      ? null
      : `contract_${field}_value_invalid`;
  }
  if (ENUM_FIELDS[field]) {
    return typeof value === 'string' && ENUM_FIELDS[field].has(value)
      ? null
      : `contract_${field}_value_invalid`;
  }
  if (OBJECT_FIELDS.has(field)) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? null
      : `contract_${field}_value_invalid`;
  }
  return typeof value === 'string' && value.length > 0
    ? null
    : `contract_${field}_value_invalid`;
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
  const validValues = [];
  for (const candidate of bounded) {
    if (!candidate || typeof candidate !== 'object') {
      rejected.push(portableEvidence(candidate || {}, false, 'authored_evidence_rejected'));
      continue;
    }
    const valueReason = validateContractFieldValue(field, candidate.value);
    if (valueReason) {
      rejected.push(portableEvidence(candidate, false, valueReason));
      continue;
    }
    validValues.push(candidate);
    if (candidate.provenance === 'authored') {
      rejected.push(portableEvidence(candidate, false, 'authored_evidence_rejected'));
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
  const assertedValues = new Set(validValues
    .filter(candidate => candidate && typeof candidate === 'object' && Object.hasOwn(candidate, 'value'))
    .map(candidate => stableStringify(candidate.value)));
  let reason = `${field}_accepted`;
  if (!bounded.length) reason = `${field}_missing`;
  else if (assertedValues.size > 1) reason = `${field}_conflicting`;
  else if (!eligible.length) {
    reason = rejected.find(item => item.reason_code === `${field}_stale`)
      ? `${field}_stale`
      : (rejected.find(item => item.reason_code === `contract_${field}_value_invalid`)
        ? `contract_${field}_value_invalid`
        : `${field}_below_threshold`);
  }
  const known = assertedValues.size <= 1 && distinct.size === 1;
  const accepted = known ? [...distinct.values()][0] : null;
  const evidence = known ? eligible.map(candidate => portableEvidence(candidate, true, reason)) : [];
  if (!known) {
    rejected.push(...eligible.map(candidate => portableEvidence(candidate, false, reason)));
  }
  let evidence_class;
  if (assertedValues.size > 1) evidence_class = 'conflicting';
  else if (!known) evidence_class = 'unknown';
  else if (eligible.some(item => item.provenance === 'adapter')) evidence_class = 'explicit';
  else evidence_class = 'inferred';
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
    evidence_class,
  };
}

function authoritativeEvidence(record) {
  const values = {
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
    action: record.invocation.availability === 'available' ? 'invoke' : 'none',
    cost: 'unknown',
    completion: { evidence_type: 'exit_code' },
    native_invocation: { runtime: record.invocation.runtime || 'unknown' },
  };
  return Object.fromEntries(Object.entries(values).map(([field, value]) => [field, [{
    value,
    provenance: 'adapter',
    confidence_basis_points: 10000,
    freshness: 'fresh',
    rule: `adapter-${field}-v1`,
  }]]));
}

export function buildCapabilityContract(record, fieldEvidence = {}) {
  validateCapability(record);
  const fallback = authoritativeEvidence(record);
  const fields = Object.fromEntries(CONTRACT_FIELDS.map(field => [
    field,
    envelope(field, Object.hasOwn(fieldEvidence, field) ? fieldEvidence[field] : fallback[field]),
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

function rejection(overlay, reasonCode) {
  return {
    schema_version: 1,
    kind: 'contract-overlay-rejection-v1',
    overlay_id: OVERLAY_TOKEN.test(overlay?.overlay_id || '') ? overlay.overlay_id : 'invalid-overlay',
    provenance: SAFE_PROVENANCE.has(overlay?.provenance) ? overlay.provenance : 'unknown',
    reason_code: reasonCode,
    ...(typeof overlay?.target_id === 'string' ? { target_id: overlay.target_id } : {}),
    ...(overlay?.fields && typeof overlay.fields === 'object'
      ? { fields: Object.keys(overlay.fields).sort() }
      : {}),
  };
}

function hasUnsafeAuthoredContent(value, key = '') {
  if (/secret|token|password|raw|body|path/i.test(key)) return true;
  if (typeof value === 'string') {
    return /[\u0000-\u001f\u007f]/.test(value)
      || value.startsWith('/')
      || /^[A-Za-z]:[\\/]/.test(value)
      || value.split(/[\\/]/).includes('..');
  }
  if (Array.isArray(value)) return value.some(entry => hasUnsafeAuthoredContent(entry, key));
  return value && typeof value === 'object'
    ? Object.entries(value).some(([childKey, child]) => hasUnsafeAuthoredContent(child, childKey))
    : false;
}

function validateOverlayShape(overlay) {
  if (!overlay || typeof overlay !== 'object' || Array.isArray(overlay)) return 'overlay_malformed';
  if (overlay.schema_version !== 1 || overlay.kind !== 'contract-overlay-v1') return 'overlay_schema_unsupported';
  if (!OVERLAY_TOKEN.test(overlay.overlay_id || '')) return 'overlay_id_unsafe';
  if (!['manifest', 'correction'].includes(overlay.provenance)) return 'overlay_provenance_invalid';
  if (Object.keys(overlay).some(key => !OVERLAY_KEYS.has(key))) return 'overlay_field_disallowed';
  if (!overlay.binding || typeof overlay.binding !== 'object' || Array.isArray(overlay.binding)
    || Object.keys(overlay.binding).some(key => !BINDING_KEYS.has(key))) return 'overlay_binding_invalid';
  for (const field of ['stable_id', 'source_fingerprint', 'runtime']) {
    if (typeof overlay.binding[field] !== 'string' || !overlay.binding[field]) return 'overlay_binding_invalid';
  }
  if (!overlay.binding.scope || typeof overlay.binding.scope !== 'object' || Array.isArray(overlay.binding.scope)) {
    return 'overlay_binding_invalid';
  }
  if (!overlay.fields || typeof overlay.fields !== 'object' || Array.isArray(overlay.fields)
    || !Object.keys(overlay.fields).length || Object.keys(overlay.fields).length > CONTRACT_FIELDS.length) {
    return 'overlay_fields_invalid';
  }
  for (const [field, correction] of Object.entries(overlay.fields)) {
    if (!CONTRACT_FIELDS.includes(field)) return 'overlay_field_disallowed';
    if (!correction || typeof correction !== 'object' || Array.isArray(correction)
      || Object.keys(correction).some(key => !CORRECTION_KEYS.has(key))
      || !Object.hasOwn(correction, 'value')) return 'overlay_correction_invalid';
    if (validateContractFieldValue(field, correction.value)) return `overlay_${field}_value_invalid`;
  }
  try {
    const bytes = stableStringify(overlay);
    if (bytes.length > 32768) return 'overlay_oversized';
  } catch {
    return 'overlay_malformed';
  }
  return hasUnsafeAuthoredContent(overlay) ? 'overlay_content_unsafe' : null;
}

function exactLineageTarget(recordsById, overlay, lineage) {
  const candidates = (Array.isArray(lineage) ? lineage : []).filter(item => (
    item?.exact === true
    && item.from_id === overlay.binding.stable_id
    && item.from_fingerprint === overlay.binding.source_fingerprint
    && typeof item.to_id === 'string'
    && typeof item.to_fingerprint === 'string'
  ));
  if (candidates.length !== 1
    || candidates.some((item, index) => candidates.findIndex(other => other.to_id === item.to_id) !== index)) return null;
  const target = recordsById.get(candidates[0].to_id);
  return target && contentFingerprint(target) === candidates[0].to_fingerprint ? target : null;
}

export function resolveContractOverlays(records, overlays = [], options = {}) {
  if (!Array.isArray(records) || !Array.isArray(overlays)) throw new TypeError('records and overlays must be arrays');
  const recordsById = new Map(records.map(record => {
    validateCapability(record);
    return [stableCapabilityId(record), record];
  }));
  const accepted = [];
  const rejected = [];
  for (const overlay of overlays) {
    const shapeReason = validateOverlayShape(overlay);
    if (shapeReason) {
      rejected.push(rejection(overlay, shapeReason));
      continue;
    }
    let target = recordsById.get(overlay.binding.stable_id);
    let carriedOver = false;
    if (!target || contentFingerprint(target) !== overlay.binding.source_fingerprint) {
      target = exactLineageTarget(recordsById, overlay, options.lineage);
      carriedOver = Boolean(target);
    }
    if (!target) {
      rejected.push(rejection(overlay, recordsById.has(overlay.binding.stable_id)
        ? 'overlay_fingerprint_mismatch'
        : 'overlay_target_absent'));
      continue;
    }
    const runtime = target.invocation?.runtime || target.runtime_variants?.[0]?.runtime;
    if (runtime !== overlay.binding.runtime) {
      rejected.push(rejection(overlay, 'overlay_runtime_mismatch'));
      continue;
    }
    if (stableStringify(target.scope) !== stableStringify(overlay.binding.scope)) {
      rejected.push(rejection(overlay, 'overlay_scope_mismatch'));
      continue;
    }
    accepted.push({
      schema_version: 1,
      kind: 'contract-overlay-application-v1',
      overlay_id: overlay.overlay_id,
      provenance: overlay.provenance,
      target_id: stableCapabilityId(target),
      target_fingerprint: contentFingerprint(target),
      fields: overlay.fields,
      ...(carriedOver ? { carried_over: true } : {}),
    });
  }
  const duplicateIds = new Set(accepted
    .filter((overlay, index, values) => values.findIndex(other => other.overlay_id === overlay.overlay_id) !== index)
    .map(overlay => overlay.overlay_id));
  const corrections = new Map();
  for (const overlay of accepted) {
    for (const [field, correction] of Object.entries(overlay.fields)) {
      const key = `${overlay.target_id}\0${field}`;
      if (!corrections.has(key)) corrections.set(key, []);
      corrections.get(key).push({ overlay, value: stableStringify(correction.value) });
    }
  }
  const conflictingIds = new Set([...corrections.values()]
    .filter(values => new Set(values.map(value => value.value)).size > 1)
    .flatMap(values => values.map(value => value.overlay.overlay_id)));
  const resolved = [];
  for (const overlay of accepted) {
    if (duplicateIds.has(overlay.overlay_id)) {
      rejected.push(rejection(overlay, 'overlay_id_duplicate'));
    } else if (conflictingIds.has(overlay.overlay_id)) {
      rejected.push(rejection(overlay, 'overlay_correction_conflicting'));
    } else {
      resolved.push(overlay);
    }
  }
  return { accepted: ordered(resolved), rejected: ordered(rejected) };
}

function contractDisposition(fields) {
  const unknown = CONTRACT_FIELDS.filter(field => DISPATCH_FIELDS.has(field) && fields[field].state !== 'known');
  return {
    disposition: unknown.length ? 'recommendation-only' : 'dispatch-candidate',
    reason_codes: unknown.length
      ? unknown.map(field => fields[field].reason_codes[0]).sort()
      : ['contract_complete'],
  };
}

export function applyContractOverlays(records, resolution) {
  const accepted = Array.isArray(resolution?.accepted) ? resolution.accepted : [];
  const conflicts = Array.isArray(resolution?.rejected)
    ? resolution.rejected.filter(value => value?.reason_code === 'overlay_correction_conflicting')
    : [];
  const byTarget = new Map();
  for (const overlay of accepted) {
    if (!byTarget.has(overlay.target_id)) byTarget.set(overlay.target_id, []);
    byTarget.get(overlay.target_id).push(overlay);
  }
  return records.map(record => {
    const overlays = ordered(byTarget.get(stableCapabilityId(record)) || []);
    const recordConflicts = conflicts.filter(value => value.target_id === stableCapabilityId(record));
    if (!overlays.length && !recordConflicts.length) return record;
    const contract = structuredClone(record.contract);
    validateCapabilityContract(contract);
    for (const overlay of overlays) {
      for (const [field, correction] of Object.entries(overlay.fields)) {
        contract.fields[field] = {
          state: 'known',
          value: structuredClone(correction.value),
          evidence: [{
            provenance: overlay.provenance,
            rule_version: 'contract-overlay-v1',
            freshness: 'fresh',
            confidence_basis_points: 10000,
            accepted: true,
            reason_code: `${field}_overlay_accepted`,
          }],
          rejected_evidence: [],
          provenance: [overlay.provenance],
          policy_version: CONTRACT_POLICY.policy_version,
          freshness: 'fresh',
          confidence_basis_points: 10000,
          reason_codes: [`${field}_overlay_accepted`],
          evidence_class: 'inferred',
        };
      }
    }
    for (const conflict of recordConflicts) {
      for (const field of conflict.fields || []) {
        contract.fields[field] = {
          state: 'unknown',
          evidence: [],
          rejected_evidence: [],
          provenance: [],
          policy_version: CONTRACT_POLICY.policy_version,
          freshness: 'unknown',
          confidence_basis_points: 0,
          reason_codes: [`${field}_overlay_conflicting`],
          evidence_class: 'conflicting',
        };
      }
    }
    Object.assign(contract, contractDisposition(contract.fields));
    validateCapabilityContract(contract);
    return { ...record, contract };
  });
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
    if (value.state === 'known' && validateContractFieldValue(field, value.value)) {
      throw new TypeError(`capability.contract.fields.${field}.value is invalid`);
    }
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
    if (value.evidence_class !== undefined && !EVIDENCE_CLASSES.has(value.evidence_class)) {
      throw new TypeError(`capability.contract.fields.${field}.evidence_class is invalid`);
    }
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
