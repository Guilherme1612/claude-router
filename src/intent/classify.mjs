// Phase 23: Intent classifier — minimal v1 (tracer).
// Full 8-disposition matrix is expanded in task 23-01-02.

export const INTENT_POLICY_VERSION = 'intent-policy-v1';

// Eight dispositions; frozen so downstream consumers can rely on the set.
// Order in the array is NOT the precedence order — precedence is encoded in
// classifyIntent's check chain (see RESEARCH Pattern 1, Pitfall 1).
export const INTENT_DISPOSITIONS = Object.freeze([
  'execute',
  'explain',
  'hypothetical',
  'quoted',
  'negated',
  'prohibited',
  'preview',
  'ambiguous',
]);

const NEGATION = /\b(don'?t|do not|never|stop|cancel|abort|skip)\b/i;
const HYPOTHETICAL = /\b(if|suppose|imagine|what if|assuming|hypothetical)\b/i;
const PREVIEW = /\b(preview|dry[- ]?run|simulate|rehearse)\b/i;
const QUOTED = /`[^`]+`|"[^"]{1,200}"|^>[\s\S]*$/m;
const EXECUTE_VERB = /\b(run|execute|start|create|debug|fix|ship|deploy|plan|verify|review|resume|go to|continue|finish)\b/i;

function outcome(disposition, reason_code) {
  return {
    disposition,
    dispatch_eligible: disposition === 'execute',
    reason_code,
    policy_version: INTENT_POLICY_VERSION,
  };
}

/**
 * Classify a single prompt into one of eight dispositions. Pure function:
 * no prompt retention, no eval/Function, no side effects. Empty or
 * non-string prompts abstain (ambiguous) rather than silently dispatch.
 */
export function classifyIntent(prompt, { policyVersion } = {}) {
  if (policyVersion !== undefined && policyVersion !== INTENT_POLICY_VERSION) {
    return outcome('ambiguous', 'policy_version_mismatch');
  }
  const text = typeof prompt === 'string' ? prompt : '';
  if (text.trim().length === 0) {
    return outcome('ambiguous', 'empty_prompt');
  }

  // Precedence (Pitfall 1): prohibition → quoted → hypothetical → negated
  // → preview → execute. Execute additionally requires !NEGATION.test.
  if (/\b(must not|forbidden|not allowed|prohibited)\b/i.test(text)) {
    return outcome('prohibited', 'prohibition_marker');
  }
  if (QUOTED.test(text)) {
    return outcome('quoted', 'quoted_or_code_block');
  }
  if (HYPOTHETICAL.test(text)) {
    return outcome('hypothetical', 'hypothetical_marker');
  }
  if (NEGATION.test(text)) {
    return outcome('negated', 'negation_marker');
  }
  if (PREVIEW.test(text)) {
    return outcome('preview', 'preview_marker');
  }
  if (EXECUTE_VERB.test(text) && !NEGATION.test(text)) {
    return outcome('execute', 'explicit_execute_verb');
  }
  return outcome('ambiguous', 'no_execute_marker');
}