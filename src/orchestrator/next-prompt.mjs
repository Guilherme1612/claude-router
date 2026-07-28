// Phase 23: Next-prompt synthesizer — framework-neutral.
// Builds the router-injected next-prompt from the selected capability's
// invocation shape (NOT a hardcoded framework slash — Anti-Pattern, EXEC-10).
// Wraps in the <!-- router-inject --> sentinel with <context-recovery>
// framing, bounded by MAX_CONTEXT_BYTES (overflow guard from
// prompt-route.mjs:43-56).

import { nextValidTransitions } from './transitions.mjs';

const MAX_CONTEXT_BYTES = 2048;

function invocationLabel(capability) {
  const invocation = capability?.invocation;
  if (!invocation || typeof invocation !== 'object') return '';
  const command = typeof invocation.command === 'string' ? invocation.command : '';
  const args = Array.isArray(invocation.args)
    ? invocation.args.map(arg => String(arg)).filter(value => value.length > 0)
    : [];
  const runtime = typeof invocation.runtime === 'string' ? invocation.runtime : '';
  const head = command || (typeof capability?.name === 'string' ? capability.name : '');
  const tail = args.length > 0 ? ` ${args.join(' ')}` : '';
  const prefix = runtime && command ? `${runtime}:` : '';
  return `${prefix}${head}${tail}`.trim();
}

// Re-read FRESH post-work state via nextValidTransitions (no cross-prompt
// cache — T-23-08). The prompt reflects the *next* valid transition, not
// the just-completed one. Framework-neutral: transition_id comes from
// policy data, never a hardcoded framework slash (EXEC-10).
function nextTransitionLine(postWorkState) {
  if (!postWorkState || typeof postWorkState !== 'object') return null;
  const transitions = nextValidTransitions(postWorkState);
  if (transitions.status === 'candidates_available') {
    if (transitions.candidates.length === 1) {
      const c = transitions.candidates[0];
      return `Next transition: ${c.transition_id} (to: ${c.to})`;
    }
    return `Next transition: multiple candidates (clarify)`;
  }
  return `Next transition: ${transitions.reason_code || 'none'}`;
}

/**
 * Synthesize the next-prompt from a selected capability. Framework-neutral:
 * no framework slash hardcode; the label comes from capability.invocation.
 * Structured args (e.g. { next_number, topic } for the create-phase verb)
 * are surfaced as `key=value` pairs so the model can act on them without a
 * hardcoded slash command (EXEC-10).
 *
 * When `postWorkState` is provided, re-run nextValidTransitions on the
 * FRESH post-work state (no caching across the dispatch boundary, T-23-08)
 * and surface the next valid transition_id — the prompt reflects the NEXT
 * transition, not the just-completed one (EXEC-10).
 */
export function synthesizeNextPrompt({ selection, capability, args, postWorkState } = {}) {
  const cap = capability || selection?.capability;
  const reason = selection?.reason_code || 'unique_eligible_capability';
  const label = invocationLabel(cap);
  const name = typeof cap?.name === 'string' && cap.name ? cap.name : 'capability';

  const fields = [
    '<!-- router-inject -->',
    `<context-recovery outcome="selected" reason="${reason}" dispatch="true">`,
    `Next capability: ${label || name}`,
    `Capability: ${name}`,
  ];
  if (args && typeof args === 'object') {
    const pairs = Object.entries(args)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`);
    if (pairs.length > 0) fields.push(`Args: ${pairs.join(' ')}`);
  }
  const nextLine = nextTransitionLine(postWorkState);
  if (nextLine) fields.push(nextLine);
  fields.push('</context-recovery>');
  const value = fields.join('\n');
  if (Buffer.byteLength(value) <= MAX_CONTEXT_BYTES) return value;
  return '<!-- router-inject -->\n<context-recovery outcome="clarify" reason="bounded_output">Which capability should I run next?</context-recovery>';
}