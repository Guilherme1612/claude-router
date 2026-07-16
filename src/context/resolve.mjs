import { stableStringify } from '../registry/schema.mjs';

const TERMINAL = new Set(['completed', 'cancelled', 'superseded']);
const PHRASES = new Map([
  ['continue', 'continue_workflow'],
  ['finish it', 'finish_remaining_work'],
  ['use the design', 'use_linked_design'],
]);
const EXPLICIT_FIELDS = ['goal_id', 'workflow', 'phase', 'plan', 'task', 'artifact_ref', 'action'];

function base(outcome, reason_code, dispatch_eligible, extra = {}) {
  return { outcome, reason_code, dispatch_eligible, ...extra };
}

function question(reason) {
  const questions = {
    no_active_workflow: 'Which workflow should I continue?',
    multiple_active_workflows: 'Which active workflow should I continue?',
    design_reference_missing: 'Which design should I use?',
    design_reference_ambiguous: 'Which linked design should I use?',
    terminal_workflow: 'Which new action should I take for this completed workflow?',
    explicit_instruction_incomplete: 'What exact goal and action should replace the active workflow?',
    authoritative_identity_unresolved: 'Which workflow identity should I use?',
  };
  return questions[reason] || 'Which workflow action should I take?';
}

function clarify(reason) {
  return base('clarify', reason, false, { question: question(reason) });
}

function candidatesFor({ capsule, candidates }) {
  const values = Array.isArray(candidates) ? candidates : capsule ? [capsule] : [];
  return values.filter(Boolean).sort((a, b) => stableStringify({
    identity: a.workflow_identity || '', scope: a.scope || {}, goal: a.goal?.id || '', position: a.position || {}, status: a.status || '',
  }).localeCompare(stableStringify({
    identity: b.workflow_identity || '', scope: b.scope || {}, goal: b.goal?.id || '', position: b.position || {}, status: b.status || '',
  })));
}

function explicitAction(instruction) {
  return Object.fromEntries(EXPLICIT_FIELDS.filter(key => instruction[key] !== undefined).map(key => [key, instruction[key]]));
}

function refreshedCapsule(capsule, value) {
  return {
    scope: capsule.scope,
    goal: capsule.goal,
    position: {
      workflow: value.workflow ?? capsule.position?.workflow,
      phase: value.phase ?? capsule.position?.phase,
      plan: value.plan ?? capsule.position?.plan,
      task: value.task ?? capsule.position?.task,
    },
    status: value.status ?? capsule.status,
    ...(value.artifact_ref ? { artifact_ref: value.artifact_ref } : {}),
  };
}

export function normalizeContextInstruction(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  const phrase = String(value || '').trim().toLowerCase().replace(/[.!?]+$/, '').replace(/\s+/g, ' ');
  return PHRASES.has(phrase) ? { kind: 'referential', phrase } : { kind: 'none' };
}

export function resolveContextAction({ instruction: rawInstruction, capsule, candidates, freshness = 'fresh', authoritative } = {}) {
  const instruction = normalizeContextInstruction(rawInstruction);
  if (instruction.kind === 'none') return base('none', 'instruction_not_contextual', false);

  if (instruction.kind === 'explicit') {
    if (!instruction.complete) return clarify('explicit_instruction_incomplete');
    const action = explicitAction(instruction);
    const prior = capsule || candidatesFor({ candidates })[0];
    return base('override', 'explicit_instruction_override', true, {
      action,
      ...(prior ? { supersession: {
        workflow_identity: prior.workflow_identity,
        status: prior.status,
        reason: 'explicit_instruction_override',
      } } : {}),
      source_precedence: ['explicit_instruction'],
    });
  }

  if (instruction.kind !== 'referential' || !PHRASES.has(instruction.phrase)) return base('none', 'instruction_not_contextual', false);
  const eligible = candidatesFor({ capsule, candidates }).filter(candidate => !TERMINAL.has(candidate.status));
  const terminal = candidatesFor({ capsule, candidates }).filter(candidate => TERMINAL.has(candidate.status));
  if (eligible.length === 0) return terminal.length ? clarify('terminal_workflow') : clarify('no_active_workflow');
  if (eligible.length > 1) return clarify('multiple_active_workflows');
  const active = eligible[0];

  if (freshness === 'stale') {
    if (authoritative?.status !== 'dispatchable') return clarify('authoritative_identity_unresolved');
    return base('refresh', 'authoritative_refresh_required', true, {
      action: authoritative.value?.action || PHRASES.get(instruction.phrase),
      refresh: refreshedCapsule(active, authoritative.value || {}),
      source_precedence: ['authoritative_state', 'last_valid_capsule'],
    });
  }

  if (instruction.phrase === 'use the design') {
    const designs = (active.artifacts || []).filter(entry => entry.type === 'design' && entry.ref);
    if (designs.length === 0) return clarify('design_reference_missing');
    if (designs.length > 1) return clarify('design_reference_ambiguous');
    return base('resume', 'unique_use_linked_design', true, { action: 'use_linked_design', artifact_ref: designs[0].ref, source_precedence: ['active_capsule'] });
  }
  const action = PHRASES.get(instruction.phrase);
  return base('resume', `unique_${action}`, true, { action, source_precedence: ['active_capsule'] });
}
