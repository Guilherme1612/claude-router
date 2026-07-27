// Phase 23: Action mapper — resolve an execute intent against fresh
// authoritative state and the installed registry to exactly one
// contract-passing, eligibility-passing capability.
//
// Authority for dispatch comes ONLY from contract.fields.workflow_transitions
// (EXEC-01). No hardcoded framework command names. Hooks are excluded before
// contract matching (EXEC-09).

import { stableCapabilityId } from '../registry/identity.mjs';
import { validateContractFieldValue } from '../registry/contract.mjs';
import { nextValidTransitions } from './transitions.mjs';

export const ACTION_POLICY_VERSION = 'action-policy-v1';

function blocked(reason_code, facts = {}) {
  return { status: 'blocked', dispatch_eligible: false, reason_code, ...facts };
}

function clarify(reason_code, facts = {}) {
  return { status: 'clarify', dispatch_eligible: false, reason_code, ...facts };
}

function workflowTransitionsField(record) {
  const envelope = record?.contract?.fields?.workflow_transitions;
  if (!envelope || envelope.state !== 'known') return null;
  if (envelope.freshness !== 'fresh') return null;
  if (validateContractFieldValue('workflow_transitions', envelope.value)) return null;
  return envelope.value;
}

function safeEligible(registry, id) {
  const eligibility = registry?.eligibility;
  if (!eligibility || typeof eligibility !== 'object') return false;
  const entry = eligibility[id];
  return entry?.eligible === true;
}

/**
 * Resolve an execute intent to a single capability.
 *
 * Inputs:
 *   intent  — classifyIntent output (disposition, dispatch_eligible, ...)
 *   state   — authoritative workflow evidence consumed by nextValidTransitions
 *   registry — { records, eligibility } where eligibility maps
 *              stableCapabilityId(record) -> evaluateEligibility result
 *
 * Returns { status: 'selected'|'blocked'|'clarify', dispatch_eligible, reason_code, capability? }
 */
export function resolveAction({ intent, state, registry } = {}) {
  if (!intent || typeof intent !== 'object') {
    return blocked('invalid_intent');
  }
  if (intent.dispatch_eligible !== true) {
    return blocked('intent_not_execute');
  }
  if (!registry || !Array.isArray(registry.records)) {
    return blocked('registry_invalid');
  }

  const transitions = nextValidTransitions(state);
  if (!transitions || transitions.status !== 'candidates_available') {
    return blocked(transitions?.reason_code || 'no_valid_transition');
  }
  const transitionIds = new Set(transitions.candidates.map(candidate => candidate.transition_id));
  if (transitionIds.size === 0) {
    return blocked('no_valid_transition');
  }

  const matches = [];
  for (const record of registry.records) {
    if (!record || record.type === 'hook') continue; // EXEC-09
    if (record.lifecycle !== 'ready') continue;
    const ids = workflowTransitionsField(record);
    if (!Array.isArray(ids)) continue;
    if (!ids.some(id => transitionIds.has(id))) continue;
    let id;
    try {
      id = stableCapabilityId(record);
    } catch {
      continue;
    }
    if (!safeEligible(registry, id)) continue;
    matches.push(record);
  }

  if (matches.length === 0) return blocked('no_eligible_capability');
  if (matches.length !== 1) return clarify('material_capability_tie', { candidates: matches.length });

  return {
    status: 'selected',
    dispatch_eligible: true,
    reason_code: 'unique_eligible_capability',
    capability: matches[0],
  };
}