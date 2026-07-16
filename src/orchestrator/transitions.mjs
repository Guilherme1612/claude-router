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

function selectionBlocked(reason_code) {
  return { status: 'blocked', dispatch_eligible: false, reason_code };
}

function semanticCandidates(values) {
  const unique = new Map();
  for (const value of Array.isArray(values) ? values : []) {
    if (!value || typeof value !== 'object') continue;
    const fields = ['transition_id', 'workflow_id', 'family', 'from', 'to'];
    if (!fields.every(field => validString(value[field]))) continue;
    const candidate = Object.fromEntries(fields.map(field => [field, value[field]]));
    const semanticKey = JSON.stringify({
      workflow_id: candidate.workflow_id,
      family: candidate.family,
      from: candidate.from,
      to: candidate.to,
    });
    const existing = unique.get(semanticKey);
    if (!existing || candidate.transition_id.localeCompare(existing.transition_id) < 0) {
      unique.set(semanticKey, candidate);
    }
  }
  return [...unique.values()].sort((a, b) => a.transition_id.localeCompare(b.transition_id));
}

function actionLabel(candidate) {
  return candidate.to.replaceAll('_', ' ');
}

function clarification(candidates, reason_code) {
  const labels = [...new Set(candidates.map(actionLabel))];
  const question = labels.length === 2
    ? `Should I ${labels[0]} or ${labels[1]} next?`
    : 'Which valid workflow should run next?';
  return { status: 'clarification_required', dispatch_eligible: false, reason_code, question };
}

/**
 * Resolve exactly one already-gated workflow token. Explicit intent may narrow
 * valid candidates, but it cannot manufacture or re-enable a transition.
 */
export function selectWorkflow(transitionResult, explicitIntent) {
  if (!transitionResult || typeof transitionResult !== 'object') {
    return selectionBlocked('invalid_transition_outcome');
  }
  if (transitionResult.status !== 'candidates_available') {
    return selectionBlocked(validString(transitionResult.reason_code)
      ? transitionResult.reason_code
      : 'invalid_transition_outcome');
  }

  const candidates = semanticCandidates(transitionResult.candidates);
  if (candidates.length === 0) return selectionBlocked('no_valid_transition');

  const hasExplicit = explicitIntent?.present === true;
  if (hasExplicit) {
    const transitionId = explicitIntent.transition_id;
    const workflowId = explicitIntent.workflow_id;
    if (explicitIntent.complete !== true || (!validString(transitionId) && !validString(workflowId))) {
      return clarification(candidates, 'explicit_transition_incomplete');
    }
    const matching = candidates.filter(candidate => (
      validString(transitionId)
        ? candidate.transition_id === transitionId
        : candidate.workflow_id === workflowId
    ));
    if (matching.length !== 1) return selectionBlocked('explicit_transition_invalid');
    return {
      status: 'selected',
      dispatch_eligible: true,
      reason_code: 'explicit_valid_transition',
      selection: matching[0],
    };
  }

  if (candidates.length !== 1) return clarification(candidates, 'material_transition_tie');
  return {
    status: 'selected',
    dispatch_eligible: true,
    reason_code: 'unique_valid_transition',
    selection: candidates[0],
  };
}
