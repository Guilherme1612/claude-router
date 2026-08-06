// Phase 39: Authority taxonomy + authority-policy evaluator — layered over
// classifyIntent (8 dispositions) per AUTH-01; independent-input policy
// evaluator per AUTH-03/04/05. Pure function: no eval, no Function, no prompt
// retention, no disk I/O, no spawn. Receives the disposition as a parameter
// (never pulls in classifyIntent) so the module is self-contained for the
// deploy bundle.

export const AUTHORITY_POLICY_VERSION = 'authority-policy-v1';

// Authority 5-class taxonomy (AUTH-01) — frozen, layered over INTENT_DISPOSITIONS.
// Order in the array is NOT the precedence order — precedence is encoded in
// classifyAuthority's check chain (see RESEARCH Pattern 1, Pitfall 1).
export const AUTHORITY_CLASSES = Object.freeze([
  'advice',
  'inspection',
  'one_turn_action',
  'persistent_goal_action',
  'non_authorizing_discussion',
]);

// Single source of truth for the AUTH-05 protected-effect class. Imported by
// src/orchestrator/approval.mjs (Plan 02) so the protected vocabulary is not
// duplicated across modules. Frozen so downstream token-matching cannot
// mutate the set at runtime.
export const PROTECTED_EFFECT_TOKENS = Object.freeze([
  'destructive', 'unbounded', 'external', 'privileged',
  'difficult-to-recover', 'credentialed', 'billing',
  'publication', 'published', 'deploy', 'deployed', 'deployment',
  'push', 'pr', 'costly', 'scope-expanding',
]);

// Apostrophe class mirrors classify.mjs — ASCII ' + curly U+2019/U+2018 so
// both "don't" and "dont" match the persistent-goal "don't stop" marker.
const APOS = "['’‘]";
const PERSISTENT_GOAL_MARKERS = new RegExp(
  '\\b(until\\s+done|keep\\s+going|finish\\s+(?:it\\s+)?all'
  + '|autonomously\\b.*\\buntil|end-to-end|don' + APOS + '?t\\s+stop)\\b',
  'i'
);
const INSPECTION_ONLY = /\b(inspect|show|list|what\s+(?:does|do|is)|status|audit|diagnose|inventory|coverage|health)\b/i;
// Execute verb set used to gate INSPECTION_ONLY — an executing verb overrides
// inspection-only wording (e.g. "show me then run" dispatches, not inspects).
const EXECUTE_VERB = /\b(run|execute|start|create|fix|ship|deploy|plan)\b/i;
// EXAMPLE_FRAMING: trailing \b is dropped because "e.g." ends with a
// non-word char (".") — \b between two non-word chars does not match. The
// word-phrase alternatives keep their \b via the inner non-capturing group.
const EXAMPLE_FRAMING = /(?:\be\.?g\.|\b(?:for example|such as|like when|suppose you|imagine you)\b)/i;
const RETROSPECTIVE_FRAMING = /\b(earlier|previously|last time|before you|yesterday|in the past|you\s+(?:already|just))\b/i;
const POLICY_DISCUSSION = /\b(the policy|policy says|rule says|per the rules|according to|should\s+(?:you|the router))\b/i;
const AUTONOMOUS_WORDING = /\b(autonomously|without asking|just do it|don'?t ask|no confirmation|unattended)\b/i;

// Abstaining dispositions from classifyIntent — these never produce an
// executing authority class (AUTH-02). Includes ambiguous (the no-marker
// fallback) which never authorizes an executing class; it may still resolve
// to the inspection class when the prompt carries inspection-only wording.
const ABSTAINING_DISPOSITIONS = new Set([
  'hypothetical', 'quoted', 'negated', 'prohibited', 'preview', 'ambiguous',
]);

function outcome(authority_class, disposition, reason_code) {
  return {
    authority_class,
    disposition,
    reason_code,
    policy_version: AUTHORITY_POLICY_VERSION,
  };
}

/**
 * Detect autonomous wording that appears inside an abstaining framing
 * (example / retrospective / policy discussion). When true, the autonomous
 * wording is illustrative text, not an authorizing instruction (AUTH-02
 * spoofing guard). Pure function: no side effects, no prompt retention.
 */
export function autonomousWordingIsText(text, _disposition) {
  if (typeof text !== 'string') return false;
  if (EXAMPLE_FRAMING.test(text)) return true;
  if (RETROSPECTIVE_FRAMING.test(text)) return true;
  if (POLICY_DISCUSSION.test(text)) return true;
  return false;
}

/**
 * Classify a single prompt into one of five authority classes (AUTH-01),
 * layered over classifyIntent's 8-disposition output. Pure function: no
 * eval/Function, no prompt retention, no disk I/O, no spawn. Receives the
 * disposition as a parameter (never pulls in classifyIntent) so the module
 * is self-contained for the deploy bundle.
 *
 * Precedence (AUTH-02 spoofing guard first):
 *   1. empty/whitespace       -> non_authorizing_discussion (no_authority_marker)
 *   2. explain disposition    -> advice (explain_marker)
 *   3. autonomous wording inside example/retrospective/policy framing
 *                             -> non_authorizing_discussion (abstaining_disposition)
 *                                fires even when disposition is execute (AUTH-02)
 *   4. inspection-only match AND no execute verb
 *                             -> inspection (inspection_marker)
 *   5. abstaining dispositions (hypothetical/quoted/negated/prohibited/preview/ambiguous)
 *                             -> non_authorizing_discussion (abstaining_disposition)
 *   6. execute + persistent-goal marker -> persistent_goal_action
 *   7. execute (no persistent marker)    -> one_turn_action
 *   8. otherwise              -> non_authorizing_discussion (no_authority_marker)
*
* Abstaining dispositions never resolve to an executing class
* (one_turn_action / persistent_goal_action) regardless of autonomous wording
* in the text (AUTH-02). They MAY resolve to the inspection class when the
* prompt carries inspection-only wording, because inspection is not an
* executing class.
*/
export function classifyAuthority(prompt, { intent } = {}) {
  const text = typeof prompt === 'string' ? prompt : '';
  const disposition = intent && typeof intent === 'object'
    && typeof intent.disposition === 'string'
    ? intent.disposition
    : 'ambiguous';

  if (text.trim().length === 0) {
    return outcome('non_authorizing_discussion', disposition, 'no_authority_marker');
  }

  if (disposition === 'explain') {
    return outcome('advice', disposition, 'explain_marker');
  }

  // AUTH-02 spoofing guard: autonomous wording inside an abstaining framing
  // is text, not an authorizing instruction. Fires even when classifyIntent
  // returned execute (e.g. "e.g. autonomously finish it") — the framing means
  // the wording is illustrative, not imperative.
  if (AUTONOMOUS_WORDING.test(text) && autonomousWordingIsText(text, disposition)) {
    return outcome('non_authorizing_discussion', disposition, 'abstaining_disposition');
  }

  // INSPECTION_ONLY applies when no execute verb matches — an executing verb
  // overrides inspection-only wording (e.g. "show me then run" dispatches).
  // Checked before the abstaining-disposition short-circuit so an ambiguous
  // prompt like "show me the routes" resolves to inspection rather than the
  // generic non_authorizing fallback. Inspection is not an executing class,
  // so this does not violate the abstaining-never-authorizes invariant.
  if (INSPECTION_ONLY.test(text) && !EXECUTE_VERB.test(text)) {
    return outcome('inspection', disposition, 'inspection_marker');
  }

  if (ABSTAINING_DISPOSITIONS.has(disposition)) {
    return outcome('non_authorizing_discussion', disposition, 'abstaining_disposition');
  }

  if (disposition === 'execute') {
    if (PERSISTENT_GOAL_MARKERS.test(text)) {
      return outcome('persistent_goal_action', disposition, 'persistent_goal_marker');
    }
    return outcome('one_turn_action', disposition, 'one_turn_action');
  }

  return outcome('non_authorizing_discussion', disposition, 'no_authority_marker');
}

/**
 * Independent-input authority-policy evaluator (AUTH-03/04/05).
 *
 * AUTH-03 independence invariant: confidence and historical-success weight
 * never grant permission. Enforced at the type level by a SEALED input —
 * the signature destructures only { confidence, authority, risk,
 * compatibility }; `weights` is not a parameter, and `confidence` is the
 * tier STRING ('high'|'medium'|'low'), never the numeric confidenceTier
 * score and never weights. The authority and risk legs cannot read
 * confidence or weights; only the proceed/ask branch reads the confidence
 * string, and only to modulate (never to permit).
 *
 * Decision legs checked in order (fail-closed; first match wins):
 *   1. compatibility unfit   -> block  (compatibility_unfit)
 *   2. protected effect      -> pause  (protected_effect_requires_confirmation)
 *   3. authority not granted -> block  (authority_not_granted)
 *   4. reversible + local + authorized
 *        high|medium        -> proceed (reversible_local_authorized)
 *        low                -> ask    (low_confidence_clarify)
 *   5. non-reversible or external + authorized
 *                           -> pause  (non_reversible_or_external_requires_confirmation)
 *
 * Pure function: no side effects, no I/O, no shared mutable state. The
 * same input object yields the same decision on every call (idempotent;
 * safe under concurrent invocation). Mirrors verifyApproval's
 * sealed-input + reason_code return shape (src/orchestrator/approval.mjs:120).
 */
export function evaluateAuthorityPolicy({
  confidence,
  authority = {},
  risk = {},
  compatibility = {},
} = {}) {
  const confidenceTier = typeof confidence === 'string' ? confidence : 'low';
  const authGranted = !!(authority && authority.authGranted);
  const protected_ = !!(authority && authority.protected_);
  const reversible = !!(risk && risk.reversible);
  const local = !!(risk && risk.local);
  const eligible = !!(compatibility && compatibility.eligible);
  const disposition = compatibility && typeof compatibility.disposition === 'string'
    ? compatibility.disposition
    : 'ambiguous';

  // Leg 1: compatibility unfit. eligible=false OR a non-dispatch disposition
  // means the capability cannot run regardless of authority. Fail-closed.
  if (!eligible || disposition !== 'dispatch-candidate') {
    return {
      decision: 'block',
      reason_code: 'compatibility_unfit',
      confidence: confidenceTier,
      policy_version: AUTHORITY_POLICY_VERSION,
      eligibility: eligible,
      disposition,
    };
  }

  // Leg 2: protected effect (AUTH-05 precursor). Protected surface requires
  // confirmation regardless of confidence or authority source — the
  // protected flag is the trust-boundary signal that human review is
  // required before the action proceeds.
  if (protected_) {
    return {
      decision: 'pause',
      reason_code: 'protected_effect_requires_confirmation',
      confidence: confidenceTier,
      policy_version: AUTHORITY_POLICY_VERSION,
      authGranted,
      protected_: true,
    };
  }

  // Leg 3: authority not granted. No amount of confidence or weight can
  // upgrade this — the AUTH-03 elevation-of-privilege prohibition.
  if (!authGranted) {
    return {
      decision: 'block',
      reason_code: 'authority_not_granted',
      confidence: confidenceTier,
      policy_version: AUTHORITY_POLICY_VERSION,
      authGranted: false,
    };
  }

  // Leg 4: reversible + local + authorized. High/medium confidence proceeds;
  // low confidence asks for clarification (never auto-proceeds on low
  // confidence even when authority is granted and the action is safe).
  if (reversible && local) {
    if (confidenceTier === 'high' || confidenceTier === 'medium') {
      return {
        decision: 'proceed',
        reason_code: 'reversible_local_authorized',
        confidence: confidenceTier,
        policy_version: AUTHORITY_POLICY_VERSION,
        authGranted: true,
        reversible: true,
        local: true,
      };
    }
    return {
      decision: 'ask',
      reason_code: 'low_confidence_clarify',
      confidence: confidenceTier,
      policy_version: AUTHORITY_POLICY_VERSION,
      authGranted: true,
      reversible: true,
      local: true,
    };
  }

  // Leg 5: non-reversible or external + authorized. Pause for confirmation.
  return {
    decision: 'pause',
    reason_code: 'non_reversible_or_external_requires_confirmation',
    confidence: confidenceTier,
    policy_version: AUTHORITY_POLICY_VERSION,
    authGranted: true,
    reversible,
    local,
  };
}