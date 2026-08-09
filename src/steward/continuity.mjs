export const CONTINUITY_POLICY_VERSION = 'continuity-policy-v1';

const PROTECTED_EFFECTS = new Set([
  'publication', 'destructive', 'credentialed', 'billing', 'privileged', 'external', 'deploy', 'payment',
]);
const RISK_ORDER = Object.freeze({ unknown: 0, low: 1, medium: 2, high: 3, critical: 4, unacceptable: 5 });

function safeString(value) { return typeof value === 'string' && value.length > 0 ? value : null; }
function safeList(value) { return Array.isArray(value) ? value.filter(item => typeof item === 'string') : []; }

function verifiedReceipt(receipt, projectFingerprint, sourceFingerprint) {
  if (!receipt || receipt.project_fingerprint !== projectFingerprint) return false;
  if (sourceFingerprint && receipt.source_fingerprint !== sourceFingerprint) return false;
  return receipt.completion_evidence?.state === 'completed'
    && receipt.postcondition_evidence?.verified === true
    && receipt.invocation_evidence?.receipt_id === receipt.receipt_id
    && receipt.postcondition_evidence?.receipt_id === receipt.receipt_id;
}

function nextAction(state) {
  if (safeString(state?.next_action)) return state.next_action;
  const transitions = Array.isArray(state?.next_actions) ? state.next_actions.filter(item => typeof item === 'string').sort() : [];
  return transitions[0] || null;
}

function leaseAllows(lease, action) {
  if (!lease || lease.status !== 'active' || !Number.isSafeInteger(lease.expiry?.deterministic_at_ms)) return false;
  if (lease.expiry.deterministic_at_ms <= action.now) return false;
  if (lease.project_fingerprint !== action.project_fingerprint) return false;
  const leaseGoal = lease.goal_id || lease.goal;
  if (!leaseGoal || leaseGoal !== action.goal_id) return false;
  const leaseAction = lease.action_id || lease.scope?.action_id;
  if (!leaseAction || leaseAction !== action.action_id) return false;
  const effects = safeList(action.effects);
  if (effects.some(effect => PROTECTED_EFFECTS.has(effect))) return false;
  const allowed = new Set(safeList(lease.allowed_effects));
  if (effects.some(effect => !allowed.has(effect))) return false;
  const ceiling = lease.risk_ceiling || lease.scope?.risk_ceiling;
  if (!ceiling || !(action.risk in RISK_ORDER) || !(ceiling in RISK_ORDER) || RISK_ORDER[action.risk] > RISK_ORDER[ceiling]) return false;
  if (lease.resource_bounds?.max_invocations !== undefined && action.invocations > lease.resource_bounds.max_invocations) return false;
  if (lease.resource_bounds?.max_tokens !== undefined && action.tokens > lease.resource_bounds.max_tokens) return false;
  if (lease.resource_bounds?.max_wall_ms !== undefined && action.duration_ms > lease.resource_bounds.max_wall_ms) return false;
  return true;
}

/**
 * Build at most one project-bound startup digest from meaningful verified
 * evidence. Plans/prose alone never create continuity and stale evidence asks
 * for refresh rather than leaking or auto-running a next action.
 */
export function buildContinuityDigest({
  projectFingerprint, sourceFingerprint, state, receipts = [], lease = null,
  acknowledgedFingerprint = null, now = Date.now(), firstVisit = false,
} = {}) {
  if (!safeString(projectFingerprint) || firstVisit || acknowledgedFingerprint === projectFingerprint) {
    return { status: 'silent', reason_code: firstVisit ? 'first_visit' : 'acknowledged_unchanged' };
  }
  const matching = (Array.isArray(receipts) ? receipts : []).filter(receipt => receipt?.project_fingerprint === projectFingerprint);
  const fresh = matching.filter(receipt => !sourceFingerprint || receipt.source_fingerprint === sourceFingerprint);
  if (sourceFingerprint && matching.length && !fresh.length) return { status: 'refresh', reason_code: 'source_fingerprint_stale' };
  const verified = fresh.filter(receipt => verifiedReceipt(receipt, projectFingerprint, sourceFingerprint));
  if (!verified.length || state?.authoritative !== true || state?.project_fingerprint !== projectFingerprint) {
    return { status: 'silent', reason_code: 'meaningful_verified_evidence_missing' };
  }
  const last = [...verified].sort((left, right) => (right.completed_at_ms || 0) - (left.completed_at_ms || 0) || String(left.receipt_id).localeCompare(String(right.receipt_id)))[0];
  const actionName = nextAction(state);
  if (!actionName) return { status: 'silent', reason_code: 'next_action_unresolved' };
  const action = {
    now,
    project_fingerprint: projectFingerprint,
    goal_id: state.goal_id || state.goal || null,
    action_id: state.next_action_id || null,
    effects: state.next_action_effects,
    risk: state.next_action_risk || 'unknown',
    invocations: state.next_action_invocations ?? 1,
    tokens: state.next_action_tokens ?? 0,
    duration_ms: state.next_action_duration_ms ?? 0,
  };
  const resume = leaseAllows(lease, action);
  return {
    status: 'digest',
    policy_version: CONTINUITY_POLICY_VERSION,
    digest: {
      project_fingerprint: projectFingerprint,
      source_fingerprint: sourceFingerprint || last.source_fingerprint || null,
      last_verified_outcome: { receipt_id: last.receipt_id, action_id: last.action_id || null, state: 'completed' },
      authoritative_state: { phase: state.phase || null, status: state.status || null, state_fingerprint: state.state_fingerprint || null },
      likely_next_action: actionName,
      resume: { disposition: resume ? 'lease_bound_resume' : 'recommendation_only', lease_id: resume ? lease.lease_id : null },
    },
  };
}

export const composeContinuityDigest = buildContinuityDigest;
