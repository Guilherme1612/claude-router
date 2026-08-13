export const CONTINUITY_MAX_BYTES = 2048;

const ACTIONS = new Set(['continue_workflow', 'finish_remaining_work', 'use_linked_design', 'review_route', 'owner_confirmation_required']);
const OVERRIDES = new Set(['honored', 'available', 'none']);

function token(value, fallback = 'unknown', max = 96) {
  const text = typeof value === 'string' ? value.replace(/[\r\n\t]+/g, ' ').trim() : '';
  return text ? text.slice(0, max) : fallback;
}

function integer(value) {
  return Number.isSafeInteger(value) && value >= 0 ? String(value) : 'unknown';
}

function position(value = {}) {
  return [value.workflow, value.phase, value.plan, value.task]
    .map(item => token(item, ''))
    .filter(Boolean)
    .join(' / ') || 'unknown';
}

function blockerCount(value) {
  return Array.isArray(value) ? value.filter(item => item && item.status !== 'resolved').length : 0;
}

function sourceState(evidence) {
  return evidence?.status === 'dispatchable' || evidence?.status === 'fresh' ? 'fresh' : 'unresolved';
}

/** Format bounded technical continuity facts; raw prompts, outputs, and paths never enter. */
export function buildContinuityBriefing({
  event = 'startup', evidence = {}, route = 'unknown', budget = {}, explicitOverride = 'none',
} = {}) {
  const source = sourceState(evidence);
  const value = source === 'fresh' && evidence.value && typeof evidence.value === 'object' ? evidence.value : {};
  const override = OVERRIDES.has(explicitOverride) ? explicitOverride : 'none';
  const blockers = blockerCount(value.blockers);
  const action = ACTIONS.has(value.action) ? value.action : 'unknown';
  const lines = [
    '<!-- router-continuity -->',
    `<continuity-briefing event="${token(event, 'startup', 32)}" source="${source}" override="${override}">`,
    `Done: ${source === 'fresh' && value.status === 'completed' ? 'current workflow completed' : source === 'fresh' ? 'no completed current workflow recorded' : 'unknown (fresh evidence unavailable)'}`,
    `Current: ${position(value)}`,
    `Blocked: ${source === 'fresh' ? `${blockers} open blocker(s)` : 'unknown (fresh evidence unavailable)'}`,
    `Next: ${action}`,
    `Route: ${token(route)}`,
    `Budget: context=${integer(budget.context_bytes ?? budget.max_context_bytes)}, injected=${integer(budget.injected_bytes)}, tools=${integer(budget.tool_calls ?? budget.max_tool_calls)}`,
    `Owner action: ${blockers > 0 ? 'resolve_blockers' : source === 'fresh' ? 'none_recorded' : 'owner_confirmation_required'}`,
    '</continuity-briefing>',
  ];
  const output = lines.join('\n');
  if (Buffer.byteLength(output) <= CONTINUITY_MAX_BYTES) return output;
  return '<!-- router-continuity -->\n<continuity-briefing source="unresolved" override="none">Owner action: owner_confirmation_required</continuity-briefing>';
}
