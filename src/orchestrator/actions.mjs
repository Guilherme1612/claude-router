// Phase 23: Action mapper — resolve an execute intent against fresh
// authoritative state and the installed registry to exactly one
// contract-passing, eligibility-passing capability.
//
// Authority for dispatch comes ONLY from contract.fields.workflow_transitions
// (EXEC-01). No hardcoded framework command names. Hooks are excluded before
// contract matching (EXEC-09). Three verb families are parsed from the
// prompt: "next phase" (EXEC-02), "debug" (EXEC-03), "create a phase about X"
// (EXEC-04). Ties/stale/terminal/missing-dep/empty all produce stable
// blocked/clarify reason codes (EXEC-06).

import { stableCapabilityId } from '../registry/identity.mjs';
import { validateContractFieldValue } from '../registry/contract.mjs';
import { nextValidTransitions } from './transitions.mjs';

export const ACTION_POLICY_VERSION = 'action-policy-v1';

// Reason codes mapped from nextValidTransitions' vocabulary to the EXEC-06
// action-mapper vocabulary. `dependency_unsafe` from the transition gate is
// surfaced as `dependency_unavailable` (missing-dep) per the plan's done-gate.
// WR-02: ALL hard-gate reason codes are mapped so they apply to EVERY verb
// (including debug), matching the phase context's "Hard gates apply to every
// verb: stale/terminal/invalid/missing-dep". Previously the debug branch
// returned before the `status !== 'candidates_available'` backstop, so
// invalid_workflow_status / no_valid_transition / required_gate_missing
// were silently bypassed and a debug capability was selected on a paused /
// no-transition / missing-gate workflow.
const TRANSITION_REASON_MAP = {
  authoritative_evidence_stale: 'authoritative_evidence_stale',
  terminal_workflow: 'terminal_workflow',
  invalid_authoritative_evidence: 'invalid_authoritative_evidence',
  invalid_workflow_status: 'invalid_workflow_status',
  no_valid_transition: 'no_valid_transition',
  required_gate_missing: 'required_gate_missing',
  dependency_unsafe: 'dependency_unavailable',
};

const NEXT_PHASE_VERB = /\b(next\s+phase|go\s+to\s+.*\bnext\b|continue|resume)\b/i;
const DEBUG_VERB = /\b(debug|bug|troubleshoot)\b/i;
const CREATE_PHASE_VERB = /\b(?:create|plan)\s+(?:a\s+)?phase\s+(?:about|for|on)\s+(.+)$/i;

const DEBUG_TOKENS = /\b(debug|debugging|troubleshoot|troubleshooting|bug)\b/i;
// WR-03: the phase-creation transition is identified by a stable `role`
// marker on the transition row (set in the workflow-transition policy),
// NOT a hardcoded workflow-state `to` literal. Framework-neutral: the role
// is a policy-level annotation, not a framework command name.
const PHASE_CREATION_ROLE = 'phase_creation';

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

function textField(record, name) {
  const envelope = record?.contract?.fields?.[name];
  if (!envelope || envelope.state !== 'known') return null;
  if (envelope.freshness !== 'fresh') return null;
  if (validateContractFieldValue(name, envelope.value)) return null;
  return envelope.value;
}

function safeEligible(registry, id) {
  const eligibility = registry?.eligibility;
  if (!eligibility || typeof eligibility !== 'object') return false;
  const entry = eligibility[id];
  return entry?.eligible === true;
}

function parseVerb(prompt) {
  if (typeof prompt !== 'string' || prompt.trim().length === 0) return { kind: 'next_phase' };
  if (CREATE_PHASE_VERB.test(prompt)) {
    const match = prompt.match(CREATE_PHASE_VERB);
    const topic = match[1] ? match[1].trim().replace(/[.?!]+$/, '') : '';
    return { kind: 'create_phase', topic };
  }
  if (DEBUG_VERB.test(prompt)) return { kind: 'debug' };
  if (NEXT_PHASE_VERB.test(prompt)) return { kind: 'next_phase' };
  return { kind: 'next_phase' };
}

function deriveNextNumber(state, roadmap) {
  if (roadmap && Number.isInteger(roadmap.current_max_phase)) {
    return roadmap.current_max_phase + 1;
  }
  const phase = state?.position?.phase;
  const parsed = Number.parseInt(String(phase ?? ''), 10);
  if (Number.isInteger(parsed)) return parsed + 1;
  return null;
}

function collectCandidates(registry, transitionIds) {
  const ids = transitionIds instanceof Set ? transitionIds : new Set(transitionIds);
  const matches = [];
  for (const record of registry.records) {
    if (!record || record.type === 'hook') continue; // EXEC-09
    if (record.lifecycle !== 'ready') continue;
    const wt = workflowTransitionsField(record);
    if (!Array.isArray(wt)) continue;
    if (!wt.some(id => ids.has(id))) continue;
    let id;
    try { id = stableCapabilityId(record); } catch { continue; }
    if (!safeEligible(registry, id)) continue;
    matches.push(record);
  }
  return matches;
}

function collectDebugCandidates(registry) {
  const matches = [];
  for (const record of registry.records) {
    if (!record || record.type === 'hook') continue; // EXEC-09
    if (record.lifecycle !== 'ready') continue;
    const purpose = textField(record, 'purpose');
    const triggers = textField(record, 'triggers');
    const hay = [purpose, Array.isArray(triggers) ? triggers.join(' ') : '']
      .filter(value => typeof value === 'string' && value.length > 0)
      .join(' ');
    if (!DEBUG_TOKENS.test(hay)) continue;
    let id;
    try { id = stableCapabilityId(record); } catch { continue; }
    if (!safeEligible(registry, id)) continue;
    matches.push(record);
  }
  return matches;
}

function selectOne(matches, args = null) {
  if (matches.length === 0) return blocked('no_eligible_capability');
  if (matches.length !== 1) return clarify('material_capability_tie', { candidates: matches.length });
  const result = {
    status: 'selected',
    dispatch_eligible: true,
    reason_code: 'unique_eligible_capability',
    capability: matches[0],
  };
  if (args) result.args = args;
  return result;
}

/**
 * Resolve an execute intent to a single capability.
 *
 * Inputs:
 *   intent  — classifyIntent output (disposition, dispatch_eligible, ...)
 *   prompt  — optional raw prompt text; parsed for the verb family
 *             (next_phase | debug | create_phase). Absent → next_phase.
 *   state   — authoritative workflow evidence consumed by nextValidTransitions
 *   registry — { records, eligibility } where eligibility maps
 *              stableCapabilityId(record) -> evaluateEligibility result
 *   roadmap — optional { current_max_phase } for the create_phase verb
 *
 * Returns { status: 'selected'|'blocked'|'clarify', dispatch_eligible, reason_code, capability?, args? }
 */
export function resolveAction({ intent, prompt, state, registry, roadmap, transitionPolicy } = {}) {
  if (!intent || typeof intent !== 'object') {
    return blocked('invalid_intent');
  }
  if (intent.dispatch_eligible !== true) {
    return blocked('intent_not_execute');
  }
  if (!registry || !Array.isArray(registry.records)) {
    return blocked('registry_invalid');
  }

  // WR-03: accept an optional transition policy from the caller so the
  // action mapper does not couple to a single hardcoded WORKFLOW_TRANSITIONS
  // vocabulary. Defaults to the canonical policy when omitted.
  const transitions = nextValidTransitions(state, transitionPolicy);
  // Hard gates apply to every verb: stale/terminal/invalid/missing-dep.
  const mapped = TRANSITION_REASON_MAP[transitions?.reason_code];
  if (mapped) return blocked(mapped);

  const verb = parseVerb(prompt);

  if (verb.kind === 'debug') {
    // Debug is a semantic-category match, not a next-transition action. The
    // hard-gate map above (stale/terminal/invalid/missing-dep) applies to
    // every verb including debug (WR-02); the freshness/terminal/invalid/
    // missing-dep gates are the only state gates — debug does not require a
    // valid next-transition candidate, but it MUST respect the hard gates.
    const matches = collectDebugCandidates(registry);
    return selectOne(matches);
  }

  // next_phase and create_phase require valid next-transition candidates.
  if (transitions.status !== 'candidates_available') {
    return blocked(transitions?.reason_code || 'no_valid_transition');
  }
  const transitionIds = new Set(transitions.candidates.map(c => c.transition_id));

  if (verb.kind === 'create_phase') {
    // WR-03: identify the phase-creation transition by its stable `role`
    // marker ('phase_creation'), NOT by a hardcoded `to` state literal.
    // Framework-neutral: the role is a policy-level annotation, so the verb
    // resolves regardless of the policy's `to` vocabulary.
    const planCandidate = transitions.candidates.find(c => c.role === PHASE_CREATION_ROLE);
    if (!planCandidate) return blocked('no_eligible_capability');
    const planIds = new Set([planCandidate.transition_id]);
    const matches = collectCandidates(registry, planIds);
    const next_number = deriveNextNumber(state, roadmap);
    const args = { next_number, topic: verb.topic };
    if (next_number === null) return blocked('roadmap_phase_unresolved');
    return selectOne(matches, args);
  }

  // next_phase (default verb).
  const matches = collectCandidates(registry, transitionIds);
  return selectOne(matches);
}

/**
 * Phase 39 AUTH-04/05: thin post-processor that maps an
 * evaluateAuthorityPolicy decision onto the existing action-mapper status
 * vocabulary. Composes OVER resolveAction's output — never re-implements
 * it. Only runs when resolveAction returns status 'selected'; blocked and
 * clarify results pass through unchanged (with the policy attached for
 * telemetry).
 *
 * Mapping:
 *   proceed → { status: 'proceed', dispatch_eligible: true,  reason_code, capability, policy }
 *   pause   → { status: 'paused',  dispatch_eligible: false, reason_code, capability, approval_token, policy }
 *   ask     → { status: 'clarify', dispatch_eligible: false, reason_code, policy }
 *   block   → { status: 'blocked', dispatch_eligible: false, reason_code, policy }
 *
 * `approval` (optional) is { bind: ({ capability }) => boundTokenObject },
 * exposed so the router hot path can supply bindApproval without actions.mjs
 * importing approval.mjs (avoid a cycle; approval already imports authority).
 * On pause, approval.bind is called with the resolved capability and the
 * returned token's `.token` string is surfaced as `approval_token` so the
 * paused receipt state is recoverable via verifyApproval.
 */
export function gateAction({ resolved, policy, approval = null } = {}) {
  if (!resolved || typeof resolved !== 'object') {
    return blocked('invalid_resolved');
  }
  // Pass through non-selected results (low-fit / conflicting evidence already
  // blocked/clarified by resolveAction). Attach the policy for telemetry.
  if (resolved.status !== 'selected') {
    return { ...resolved, policy };
  }

  const decision = policy && typeof policy === 'object' ? policy.decision : null;
  const reasonCode = policy && typeof policy.reason_code === 'string' ? policy.reason_code : 'no_policy_reason';
  const capability = resolved.capability;

  if (decision === 'proceed') {
    return {
      status: 'proceed',
      dispatch_eligible: true,
      reason_code: reasonCode,
      capability,
      policy,
    };
  }
  if (decision === 'pause') {
    let approvalToken = null;
    if (approval && typeof approval.bind === 'function') {
      try {
        const bound = approval.bind({ capability });
        approvalToken = bound && typeof bound.token === 'string' ? bound.token : null;
      } catch {
        approvalToken = null; // fail-open: gate still pauses; resume requires a fresh bind
      }
    }
    return {
      status: 'paused',
      dispatch_eligible: false,
      reason_code: reasonCode,
      capability,
      approval_token: approvalToken,
      policy,
    };
  }
  if (decision === 'ask') {
    return {
      status: 'clarify',
      dispatch_eligible: false,
      reason_code: reasonCode,
      policy,
    };
  }
  // block (including compatibility_unfit and authority_not_granted) or
  // unknown decision — reuse the blocked() helper shape.
  return {
    status: 'blocked',
    dispatch_eligible: false,
    reason_code: reasonCode,
    policy,
  };
}