import { stableCapabilityId } from '../registry/identity.mjs';
import { retrieveSemanticCandidates } from '../registry/semantic.mjs';
import { applyPreferences } from './preferences.mjs';

export const COMPOSITION_POLICY_VERSION = 'composition-policy-v1';
export const COMPOSITION_LIMITS = Object.freeze({
  max_capabilities: 4,
  max_context_bytes: 12288,
  max_tool_calls: 8,
});

const RISK_ORDER = Object.freeze({ unknown: 0, low: 1, medium: 2, high: 3, critical: 4, unacceptable: 5 });

function textList(value) {
  return typeof value === 'string' ? [value] : Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
}

function candidateRecord(candidate, records) {
  if (candidate?.record) return candidate.record;
  const id = candidate?.stable_id || candidate?.canonical_id;
  return (Array.isArray(records) ? records : []).find(record => {
    try { return stableCapabilityId(record) === id; } catch { return false; }
  }) || null;
}

function rolesFor(candidate, record) {
  return [...new Set([
    ...textList(candidate?.workflow_coverage?.covered_roles),
    ...textList(record?.composition?.roles),
  ])].sort();
}

function conflictsWith(candidate, selected, records) {
  const record = candidateRecord(candidate, records);
  const conflicts = new Set(textList(candidate?.conflicts).concat(textList(record?.composition?.conflicts)));
  const selectedIds = new Set(selected.map(item => item.stable_id));
  return [...conflicts].some(value => selectedIds.has(value) || selected.some(item => rolesFor(item, candidateRecord(item, records)).includes(value)));
}

function candidateScore(candidate) {
  const score = Number.isFinite(candidate?.score) ? candidate.score : (candidate?.intent_fit || 0);
  return score + (candidate?.preference_rank > -1 ? (candidate.preference_rank + 1) / 100000 : 0);
}

function ordered(selected, requiredRoles) {
  const order = new Map(requiredRoles.map((role, index) => [role, index]));
  return [...selected].sort((left, right) => {
    const leftRole = Math.min(...rolesFor(left, left.record).map(role => order.get(role) ?? 999));
    const rightRole = Math.min(...rolesFor(right, right.record).map(role => order.get(role) ?? 999));
    return leftRole - rightRole || left.stable_id.localeCompare(right.stable_id);
  });
}

function blocked(reason_code, facts = {}) {
  return { schema_version: 1, policy_version: COMPOSITION_POLICY_VERSION, status: 'blocked', dispatch_eligible: false, reason_code, ...facts };
}

/**
 * Select the least sufficient compatible set. A complete single candidate wins;
 * otherwise this is a bounded deterministic set-cover pass over eligible
 * candidates. It never makes an ineligible record executable.
 */
export function composeCapabilities({ workflow, candidates = [], records = [], limits = COMPOSITION_LIMITS, runtime } = {}) {
  const requiredRoles = textList(workflow?.roles || workflow?.required_roles);
  if (!requiredRoles.length) return blocked('workflow_roles_missing');
  const cap = Number.isSafeInteger(limits.max_capabilities) ? limits.max_capabilities : COMPOSITION_LIMITS.max_capabilities;
  const eligible = (Array.isArray(candidates) ? candidates : [])
    .filter(candidate => candidate?.eligibility?.eligible === true)
    .map(candidate => ({ ...candidate, record: candidateRecord(candidate, records) }))
    .filter(candidate => candidate.record || candidate.native_invocation);
  if (!eligible.length) return blocked('no_eligible_capability');

  const selected = [];
  const covered = new Set();
  const remaining = [...eligible].sort((left, right) => {
    const gain = rolesFor(right, right.record).length - rolesFor(left, left.record).length;
    return gain || candidateScore(right) - candidateScore(left) || left.stable_id.localeCompare(right.stable_id);
  });
  while (covered.size < requiredRoles.length && selected.length < cap) {
    const next = remaining.find(candidate => {
      const roles = rolesFor(candidate, candidate.record);
      return roles.some(role => requiredRoles.includes(role) && !covered.has(role))
        && !conflictsWith(candidate, selected, records);
    });
    if (!next) break;
    selected.push(next);
    for (const role of rolesFor(next, next.record)) if (requiredRoles.includes(role)) covered.add(role);
    remaining.splice(remaining.indexOf(next), 1);
  }
  if (covered.size !== requiredRoles.length) {
    return blocked('required_workflow_role_missing', {
      missing_roles: requiredRoles.filter(role => !covered.has(role)).sort(),
      selected: selected.map(item => item.stable_id).sort(),
    });
  }
  const orderedSelected = ordered(selected, requiredRoles);
  const contextBytes = orderedSelected.reduce((sum, item) => sum + (item.cost?.context_bytes ?? item.record?.cost?.context_bytes ?? 0), 0);
  const toolCalls = orderedSelected.reduce((sum, item) => sum + (item.cost?.tool_calls ?? item.record?.cost?.tool_calls ?? 0), 0);
  if (contextBytes > (limits.max_context_bytes || COMPOSITION_LIMITS.max_context_bytes)) return blocked('context_cap_exceeded', { context_bytes: contextBytes });
  if (toolCalls > (limits.max_tool_calls || COMPOSITION_LIMITS.max_tool_calls)) return blocked('tool_call_cap_exceeded', { tool_calls: toolCalls });
  const effects = [...new Set(orderedSelected.flatMap(item => textList(item.record?.effects)))].sort();
  const risks = orderedSelected.map(item => item.risk?.value || item.record?.risk?.level || 'unknown');
  const risk = risks.sort((left, right) => (RISK_ORDER[right] || 0) - (RISK_ORDER[left] || 0))[0] || 'unknown';
  const nativeInvocations = orderedSelected.map(item => item.record?.invocation || item.native_invocation || null).filter(Boolean);
  if (runtime && nativeInvocations.some(invocation => invocation.runtime !== runtime)) return blocked('native_runtime_mismatch', { runtime });
  return {
    schema_version: 1,
    policy_version: COMPOSITION_POLICY_VERSION,
    status: 'resolved',
    dispatch_eligible: true,
    reason_code: selected.length === 1 ? 'single_capability_sufficient' : 'least_sufficient_composition',
    workflow_id: workflow.workflow_id,
    selected: orderedSelected.map(item => item.stable_id),
    roles: requiredRoles.map(role => ({ role, capability_id: orderedSelected.find(item => rolesFor(item, item.record).includes(role))?.stable_id || null })),
    native_invocations: nativeInvocations,
    effects,
    risk,
    bounds: { max_capabilities: cap, max_context_bytes: limits.max_context_bytes, max_tool_calls: limits.max_tool_calls, context_bytes: contextBytes, tool_calls: toolCalls },
  };
}

export function resolveSemanticRoute({ intent, records = [], workflows, runtime, limits, preferences = [], preferenceScope = {}, now } = {}) {
  let retrieval = retrieveSemanticCandidates({ intent, records, workflows });
  const preferenceList = Array.isArray(preferences) ? preferences : [];
  if (retrieval.status === 'ambiguous' && preferenceList.length) {
    const tiedIds = new Set(retrieval.fallback?.candidates || []);
    const tied = retrieval.candidates.filter(candidate => tiedIds.has(candidate.stable_id));
    const preferred = applyPreferences({
      candidates: tied,
      preferences: preferenceList,
      scope: { ...preferenceScope, workflow_id: preferenceScope.workflow_id || tied[0]?.workflow_id },
      now,
    });
    if (preferred.preference_applied) {
      retrieval = {
        ...retrieval,
        status: 'resolved',
        dispatch_eligible: intent.dispatch_eligible === true,
        reason_codes: ['preference_tiebreak_resolved'],
        workflow_id: preferred.selected.workflow_id,
        selected: preferred.selected,
        match: preferred.selected,
        candidates: preferred.candidates,
        preference_warnings: preferred.warnings,
      };
    } else if (preferred.warnings.length) {
      retrieval = { ...retrieval, preference_warnings: preferred.warnings };
    }
  }
  if (retrieval.status !== 'resolved') return { status: retrieval.status, dispatch_eligible: false, reason_code: retrieval.reason_codes?.[0] || 'semantic_retrieval_blocked', retrieval };
  const workflow = (workflows || []).find(item => item.workflow_id === retrieval.workflow_id)
    || { workflow_id: retrieval.workflow_id, roles: retrieval.selected.workflow_coverage.required_roles };
  const composition = composeCapabilities({
    workflow,
    candidates: retrieval.candidates.filter(candidate => candidate.workflow_id === retrieval.workflow_id),
    records,
    runtime,
    limits,
  });
  return { status: composition.status, dispatch_eligible: composition.dispatch_eligible, reason_code: composition.reason_code, retrieval, composition };
}

/**
 * Bind the decision to actual invocation/completion/verification evidence.
 * A recommendation can be displayed without proof; an executed route cannot.
 */
export function buildCausalProof({ intent, route, workflow, action, lease, invocation, completion, verification } = {}) {
  if (!route || route.status !== 'resolved') return { status: 'incomplete', reason_code: 'route_unresolved' };
  const selected = Array.isArray(route.selected) ? route.selected : [];
  const actual = invocation?.native_identity || invocation?.capability_id;
  const selectedMatch = selected.includes(actual);
  const completed = completion?.state === 'completed' && typeof completion.receipt_id === 'string';
  const verified = verification?.verified === true && verification.receipt_id === completion?.receipt_id;
  const leaseBound = !lease || !!(lease.project_id && lease.goal_id && lease.action_id);
  const proof = {
    schema_version: 1,
    intent: { policy_version: intent?.policy_version || null, workflow_hints: textList(intent?.workflow_hints) },
    route: { policy_version: route.policy_version, reason_code: route.reason_code, selected_capabilities: selected },
    workflow: workflow?.workflow_id || route.workflow_id || null,
    action: action?.action_id || action?.id || null,
    lease: lease ? { lease_id: lease.lease_id || null, project_id: lease.project_id || null, goal_id: lease.goal_id || null } : null,
    invocation: invocation ? { runtime: invocation.runtime || null, native_identity: actual || null, receipt_id: invocation.receipt_id || null } : null,
    completion: completion ? { receipt_id: completion.receipt_id || null, state: completion.state || null } : null,
    verification: verification ? { receipt_id: verification.receipt_id || null, verified: verification.verified === true } : null,
    complete: selectedMatch && completed && verified && leaseBound,
  };
  return proof.complete ? { status: 'complete', proof } : { status: 'incomplete', reason_code: 'causal_evidence_incomplete', proof };
}
