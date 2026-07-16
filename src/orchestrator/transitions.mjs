export const TRANSITION_POLICY_VERSION = 'workflow-transitions-v1';

const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'superseded', 'closed']);

function transition(id, family, from, to, workflow_id, requires = []) {
  return Object.freeze({ id, family, from, to, workflow_id, requires: Object.freeze([...requires]) });
}

export const WORKFLOW_TRANSITIONS = Object.freeze([
  transition('brainstorm.approve-design', 'brainstorm', 'design_ready', 'design_approval', 'brainstorming', ['design_ready']),
  transition('brainstorm.plan-implementation', 'brainstorm', 'design_approved', 'implementation_planning', 'writing-plans', ['design_approved']),
  transition('gsd.discuss', 'gsd', 'phase_ready', 'discuss', 'gsd-discuss-phase', ['phase_available']),
  transition('gsd.plan', 'gsd', 'discussed', 'plan', 'gsd-plan-phase', ['discussion_complete']),
  transition('gsd.execute', 'gsd', 'planned', 'execute', 'gsd-execute-phase', ['plan_approved']),
  transition('gsd.verify', 'gsd', 'executed', 'verify', 'gsd-verify-work', ['execution_complete']),
  transition('interrupted.resume', 'interrupted', 'interrupted', 'resume', 'gsd-resume-work', ['resumable_execution']),
  transition('verification-gap.close', 'verification-gap', 'gaps_found', 'close_gaps', 'gsd-execute-phase', ['gap_plan_ready']),
  transition('milestone.close', 'milestone', 'verified', 'closeout', 'gsd-complete-milestone', ['milestone_verified']),
]);

function blocked(reason_code) {
  return { status: 'blocked', dispatch_eligible: false, reason_code, candidates: [] };
}

function validString(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

function normalizeTransition(value) {
  if (!value || typeof value !== 'object') return null;
  const { id, family, from, to, workflow_id } = value;
  if (![id, family, from, to, workflow_id].every(validString)) return null;
  const requires = Array.isArray(value.requires) && value.requires.every(validString)
    ? [...new Set(value.requires)].sort()
    : [];
  return { id, family, from, to, workflow_id, requires };
}

function compareTransition(a, b) {
  return [a.family, a.id, a.workflow_id, a.from, a.to].join('\u0000')
    .localeCompare([b.family, b.id, b.workflow_id, b.from, b.to].join('\u0000'));
}

function canonicalPolicy(policy) {
  const unique = new Map();
  for (const value of Array.isArray(policy) ? policy : []) {
    const row = normalizeTransition(value);
    if (!row) continue;
    const key = JSON.stringify(row);
    if (!unique.has(key)) unique.set(key, row);
  }
  return [...unique.values()].sort(compareTransition);
}

function candidateFact(row) {
  return {
    transition_id: row.id,
    workflow_id: row.workflow_id,
    family: row.family,
    from: row.from,
    to: row.to,
  };
}

/**
 * Evaluate authoritative workflow evidence without reading any downstream
 * registry, capability, prompt, persistence, or filesystem surface.
 */
export function nextValidTransitions(evidence, policy = WORKFLOW_TRANSITIONS) {
  if (!evidence || typeof evidence !== 'object') return blocked('invalid_authoritative_evidence');

  const status = evidence.status;
  const freshness = evidence.freshness;
  const position = evidence.position;
  if (!validString(status) || !validString(freshness)
      || !position || typeof position !== 'object'
      || !validString(position.family) || !validString(position.state)) {
    return blocked('invalid_authoritative_evidence');
  }
  if (freshness !== 'fresh') return blocked('authoritative_evidence_stale');
  if (TERMINAL_STATUSES.has(status)) return blocked('terminal_workflow');
  if (status !== 'active') return blocked('invalid_workflow_status');
  if (evidence.dependencies_safe !== true) return blocked('dependency_unsafe');

  const matching = canonicalPolicy(policy)
    .filter(row => row.family === position.family && row.from === position.state);
  if (matching.length === 0) return blocked('no_valid_transition');

  const gates = evidence.gates && typeof evidence.gates === 'object' ? evidence.gates : {};
  const eligible = matching.filter(row => row.requires.every(gate => gates[gate] === true));
  if (eligible.length === 0) return blocked('required_gate_missing');

  return {
    status: 'candidates_available',
    dispatch_eligible: false,
    reason_code: 'valid_transitions',
    candidates: eligible.map(candidateFact),
    policy_version: TRANSITION_POLICY_VERSION,
  };
}
