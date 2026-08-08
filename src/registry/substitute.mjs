// src/registry/substitute.mjs — Phase 42 SEM-04: contract-compatible substitution resolver.
//
// A failed selected capability can be substituted only by a contract-compatible
// candidate that stays inside unchanged authority, risk, scope, and resource
// bounds, with both routes retained for attribution. The substitute's
// AUTHORITY_CRITICAL_FIELDS (permissions, side_effects, risk, reversibility,
// invocation_kind) must not exceed the original's bounds — permission laundering
// is rejected (T-42-07). Both original_route and substitute_route are retained
// for repudiation protection (T-42-08). RECEIPT_STATES is NOT extended here —
// Phase 44 (RCPT-02) owns the 'substituted' receipt state (T-42-10 scope boundary).

import { stableCapabilityId } from './identity.mjs';
import { stableStringify } from './schema.mjs';
import { evaluateEligibility } from './eligibility.mjs';
import { AUTHORITY_CRITICAL_FIELDS } from './trust.mjs';
import { validateContractFieldValue } from './contract.mjs';

export const SUBSTITUTION_REASONS = Object.freeze([
  'ambiguous_substitute',
  'no_compatible_substitute',
  'substitution_permissions_expanded',
  'substitution_risk_escalation',
  'substitution_reversibility_escalation',
  'substitution_scope_expansion',
  'substitution_within_bounds',
]);

const RISK_ORDER = ['unknown', 'low', 'medium', 'high', 'critical', 'unacceptable'];
const REVERSIBILITY_ORDER = ['unknown', 'reversible', 'irreversible'];
const SUBSTITUTE_EDGE_TYPES = new Set(['substitute', 'fallback']);

function field(record, name) {
  return record?.contract?.fields?.[name];
}

function fieldState(record, name) {
  const envelope = field(record, name);
  if (!record?.contract) return 'unknown';
  if (!envelope || envelope.state !== 'known') return 'unknown';
  if (validateContractFieldValue(name, envelope.value)) return 'unknown';
  return 'known';
}

function fieldValue(record, name) {
  return field(record, name)?.value;
}

function computeBoundsViolations(original, substitute) {
  const violations = [];

  // scope: must be identical (stableStringify equality — copy eligibility.mjs:215-217)
  if (stableStringify(substitute?.scope) !== stableStringify(original?.scope)) {
    violations.push('substitution_scope_expansion');
  }

  for (const fieldName of AUTHORITY_CRITICAL_FIELDS) {
    const origState = fieldState(original, fieldName);
    const subState = fieldState(substitute, fieldName);

    // Conservative: if either side is unknown, cannot verify bounds.
    if (origState === 'unknown' || subState === 'unknown') {
      violations.push(`substitution_${fieldName}_unknown`);
      continue;
    }

    const origValue = fieldValue(original, fieldName);
    const subValue = fieldValue(substitute, fieldName);

    if (fieldName === 'permissions') {
      // substitute must be a subset of original (string array)
      const origSet = new Set(Array.isArray(origValue) ? origValue : []);
      const subArr = Array.isArray(subValue) ? subValue : [];
      if (subArr.some(perm => !origSet.has(perm))) {
        violations.push('substitution_permissions_expanded');
      }
    } else if (fieldName === 'side_effects') {
      // substitute side_effects must not contain tokens original doesn't have
      const origSet = new Set(Array.isArray(origValue) ? origValue : []);
      const subArr = Array.isArray(subValue) ? subValue : [];
      if (subArr.some(effect => !origSet.has(effect))) {
        violations.push('substitution_side_effects_expanded');
      }
    } else if (fieldName === 'risk') {
      // substitute risk must be <= original risk (RISK_ORDER ordering)
      const origLevel = RISK_ORDER.indexOf(origValue);
      const subLevel = RISK_ORDER.indexOf(subValue);
      if (subLevel > origLevel) {
        violations.push('substitution_risk_escalation');
      }
    } else if (fieldName === 'reversibility') {
      // substitute must be at least as safe (reversible is safest)
      // safety ordering: reversible < unknown < irreversible (lower = safer)
      // But we want "at least as safe" meaning substitute should not be less safe.
      // 'reversible' is safest, 'irreversible' is least safe.
      // If original is 'reversible', substitute must be 'reversible'.
      // If original is 'irreversible', substitute can be anything.
      const origLevel = REVERSIBILITY_ORDER.indexOf(origValue);
      const subLevel = REVERSIBILITY_ORDER.indexOf(subValue);
      if (subLevel > origLevel) {
        violations.push('substitution_reversibility_escalation');
      }
    } else if (fieldName === 'invocation_kind') {
      // substitute invocation_kind must equal original
      if (subValue !== origValue) {
        violations.push('substitution_invocation_kind_changed');
      }
    }
  }

  return violations;
}

function blocked() {
  return {
    schema_version: 1,
    policy_version: 'substitution-v1',
    status: 'blocked',
    reason_code: 'no_compatible_substitute',
  };
}

export function resolveSubstitution({ failedRecord, records = [], relationships = {} } = {}) {
  // Non-throwing for invalid/missing failedRecord — return blocked.
  if (!failedRecord || typeof failedRecord !== 'object') return blocked();

  // TypeError only for structural shape violations (relationships not an object).
  if (relationships === null || typeof relationships !== 'object' || Array.isArray(relationships)) {
    throw new TypeError('relationships must be an object');
  }

  // Build recordsById Map with try/catch around stableCapabilityId (copy eligibility.mjs:199-206).
  const recordsById = new Map();
  for (const candidate of Array.isArray(records) ? records : []) {
    try {
      recordsById.set(stableCapabilityId(candidate), candidate);
    } catch {
      // Invalid candidates cannot participate in substitution.
    }
  }

  // Compute subjectId = stableCapabilityId(failedRecord). If this throws, return blocked.
  let subjectId;
  try {
    subjectId = stableCapabilityId(failedRecord);
  } catch {
    return blocked();
  }

  // Traverse edges: filter substitute/fallback edges where source_id or target_id matches subjectId.
  const allEdges = [
    ...(Array.isArray(relationships?.edges) ? relationships.edges : []),
    ...(Array.isArray(relationships?.candidates) ? relationships.candidates : []),
  ];

  const candidateIds = [];
  const seen = new Set();
  for (const edge of allEdges) {
    if (!edge || typeof edge !== 'object') continue;
    if (!SUBSTITUTE_EDGE_TYPES.has(edge.type)) continue;
    let candidateId = null;
    if (edge.source_id === subjectId && edge.target_id && edge.target_id !== subjectId) {
      candidateId = edge.target_id;
    } else if (edge.target_id === subjectId && edge.source_id && edge.source_id !== subjectId) {
      candidateId = edge.source_id;
    }
    if (candidateId && !seen.has(candidateId)) {
      seen.add(candidateId);
      candidateIds.push(candidateId);
    }
  }

  // For each candidate: look up in recordsById, run evaluateEligibility, check bounds.
  const passingCandidates = [];
  for (const candidateId of candidateIds) {
    const candidate = recordsById.get(candidateId);
    if (!candidate) continue;

    // Run evaluateEligibility with the destructure pattern (strip authored eligibility/dispatch_eligible).
    const { eligibility, dispatch_eligible, ...candidateRecord } = candidate;
    const eligibilityResult = evaluateEligibility({
      record: candidateRecord,
      records,
      relationships,
    });
    if (!eligibilityResult.eligible) continue;

    // Check bounds violations.
    const violations = computeBoundsViolations(failedRecord, candidate);
    if (violations.length > 0) continue;

    passingCandidates.push(candidateId);
  }

  if (passingCandidates.length === 0) {
    return blocked();
  }

  if (passingCandidates.length > 1) {
    return {
      schema_version: 1,
      policy_version: 'substitution-v1',
      status: 'ambiguous',
      reason_code: 'ambiguous_substitute',
      candidates: [...passingCandidates].sort(),
    };
  }

  // Exactly one candidate passes.
  const candidate = recordsById.get(passingCandidates[0]);
  let substituteRoute;
  try {
    substituteRoute = stableCapabilityId(candidate);
  } catch {
    return blocked();
  }

  return {
    schema_version: 1,
    policy_version: 'substitution-v1',
    status: 'substituted',
    original_route: subjectId,
    substitute_route: substituteRoute,
    bounds_unchanged: true,
    reason_codes: ['substitution_within_bounds'],
  };
}