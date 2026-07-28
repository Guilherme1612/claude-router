---
phase: 23-intent-safe-state-aware-execution
reviewed: 2026-07-27T00:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - src/intent/classify.mjs
  - src/orchestrator/actions.mjs
  - src/orchestrator/approval.mjs
  - src/orchestrator/next-prompt.mjs
  - tests/helpers/inventory-fixture.mjs
  - tests/router.actions.test.mjs
  - tests/router.approval.test.mjs
  - tests/router.dispatch-integration.test.mjs
  - tests/router.intent-adversarial.test.mjs
  - tests/router.intent.test.mjs
findings:
  critical: 1
  warning: 3
  info: 5
  total: 9
status: issues_found
---

# Phase 23: Code Review Report

**Reviewed:** 2026-07-27T00:00:00Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Reviewed the four Phase 23 source modules (intent classifier, action mapper, approval gate, next-prompt synthesizer) plus their tests at standard depth, with security focus on the approval gate (`approval.mjs`) and the intent classifier (`classify.mjs`) per the phase context.

The approval gate is well-structured but contains one fail-open path that violates the phase's "fail CLOSED on stale or mismatched fingerprint" hard constraint: `verifyApproval` silently skips the staleness leg when the caller omits or maltypes `expected`, so a stale bound token with a matching presented token is approved. The intent classifier has a negation-bypass surface: common English negative contractions (`won't`, `can't`, `shouldn't`, `couldn't`, `isn't`, `aren't`) and Unicode curly apostrophes (U+2019, the macOS/iOS autocorrect default for `don't`) are not recognized, so negated prompts dispatch as `execute`. The debug verb path in `actions.mjs` skips the `invalid_workflow_status` / `no_valid_transition` / `required_gate_missing` gates, allowing debug dispatch on a paused/failed workflow — contradicting the phase context's "Hard gates apply to every verb."

Cross-file behavior was traced against `src/orchestrator/transitions.mjs`, `src/registry/contract.mjs`, `src/registry/identity.mjs`, and `src/registry/schema.mjs` to verify the transition reason-code vocabulary, the controlled enum vocabularies for `reversibility`/`risk`, and the determinism of `stableStringify`/`contentFingerprint`. All confirmed.

## Critical Issues

### CR-01: `verifyApproval` fail-opens on missing or malformed `expected` — staleness leg silently skipped

**File:** `src/orchestrator/approval.mjs:110-129`
**Issue:** The spec (and the phase context) require a three-leg check: (1) both tokens non-empty, (2) `bound.token` equals the re-derived `expected` token (else `approval_stale`), (3) `presented.token` equals `bound.token` (else `approval_mismatch`). The implementation makes leg 2 conditional:

```js
const expectedToken = extractExpectedToken(expected);
if (expectedToken !== null && bound.token !== expectedToken) {
  return { status: 'blocked', ..., reason_code: 'approval_stale' };
}
```

`extractExpectedToken` returns `null` for `undefined`, non-string scalars, or objects without a `token` string. When `expected` is omitted or malformed, `expectedToken === null`, so the stale check is skipped entirely and the gate falls through to leg 3 only. A destructive capability with a stale bound token + a matching presented token is then **approved** — a fail-open path in a security-critical gate. Verified empirically:

```
no-expected verdict: approved approval_bound
numeric-expected verdict: approved approval_bound
```

The plan's "Three legs checked in order (EXEC-08)" and the phase context's "Approval gate must fail CLOSED on stale or mismatched fingerprint" are both violated. The API trusts the caller to pass `expected`; a future caller that forgets (or passes a number/object) silently disables staleness detection — the exact class of oversight defensive design should catch.

**Fix:** Make `expected` mandatory and fail closed when it is missing or malformed. Replace `extractExpectedToken` with a strict extractor that returns a blocking verdict on any non-string input:

```js
function requireExpectedToken(expected) {
  if (typeof expected === 'string' && expected.length > 0) return expected;
  if (expected && typeof expected === 'object' && typeof expected.token === 'string' && expected.token.length > 0) return expected.token;
  return null; // caller MUST treat null as fail-closed
}
// ...
const expectedToken = requireExpectedToken(expected);
if (expectedToken === null) {
  return { status: 'blocked', dispatch_eligible: false, reason_code: 'approval_missing' };
}
if (bound.token !== expectedToken) {
  return { status: 'blocked', dispatch_eligible: false, reason_code: 'approval_stale' };
}
```

Add a regression test: `verifyApproval({ bound, presented: { token: bound.token } })` (no `expected`) must return `blocked` / `approval_missing`, not `approved`.

## Warnings

### WR-01: Intent classifier bypasses negation for common contractions and Unicode curly apostrophes — negated prompts dispatch as `execute`

**File:** `src/intent/classify.mjs:20, 35, 88`
**Issue:** `NEGATION = /\b(don'?t|do not|never|stop|cancel|abort|skip)\b/i` only matches the ASCII apostrophe form of `don't`/`dont` and omits the common English negative contractions `won't`, `can't`, `shouldn't`, `couldn't`, `wouldn't`, `isn't`, `aren't`, `doesn't`. It also does not match the Unicode right single quotation mark (U+2019, `’`), which is the default autocorrect output on macOS/iOS — so `don’t go to the next phase` does not match `don'?t` (the `'` in the regex is ASCII 0x27). Each of these falls through to `EXECUTE_VERB` and dispatches as `execute`:

```
"don’t go to the next phase"   -> execute explicit_execute_verb   (curly apostrophe)
"won't run the tests"          -> execute explicit_execute_verb   (missing contraction)
"can't ship the release"       -> execute explicit_execute_verb
"shouldn't deploy the bundle"  -> execute explicit_execute_verb
```

The adversarial corpus (`tests/router.intent-adversarial.test.mjs`) only covers `don't`/`never` with ASCII apostrophes, so this gap is uncaught. The phase context's "block-on-high" stance and the classifier's security role make a negation bypass a real correctness defect, even though the downstream approval gate provides defense-in-depth for destructive capabilities.

**Fix:** Broaden the negation regex to cover the missing contractions and the Unicode apostrophe:

```js
const APOS = "['’‘]"; // ASCII + curly single quotes
const NEGATION = new RegExp(
  "\\b(don" + APOS + "?t|won" + APOS + "?t|can" + APOS + "?t|shouldn" + APOS + "?t|couldn" + APOS + "?t|wouldn" + APOS + "?t|isn" + APOS + "?t|aren" + APOS + "?t|doesn" + APOS + "?t|do not|never|stop|cancel|abort|skip)\\b",
  'i'
);
```

Add minimal-pair cases for `won't`/`can't`/`shouldn't` and a curly-apostrophe `don’t` case to `MINIMAL_PAIRS` in the adversarial corpus.

### WR-02: Debug verb bypasses `invalid_workflow_status` / `no_valid_transition` / `required_gate_missing` hard gates

**File:** `src/orchestrator/actions.mjs:21-26, 162-174`
**Issue:** `TRANSITION_REASON_MAP` maps only `authoritative_evidence_stale`, `terminal_workflow`, `invalid_authoritative_evidence`, and `dependency_unsafe`. `nextValidTransitions` (transitions.mjs:70-91) can also return `invalid_workflow_status`, `no_valid_transition`, and `required_gate_missing`. For the `next_phase` and `create_phase` verbs the subsequent `if (transitions.status !== 'candidates_available')` check catches these, but the debug branch returns before that check:

```js
if (verb.kind === 'debug') {
  const matches = collectDebugCandidates(registry);
  return selectOne(matches);
}
```

So a debug capability is selected whenever the mapped reason codes are absent — even when the workflow status is `paused`, `failed`, or `unknown`, when no valid transition exists, or when required gates are missing. Verified empirically: `state.status = 'paused'` with a debug capability yields `selected` / `unique_eligible_capability`. The phase context explicitly states "Hard gates apply to every verb: stale/terminal/invalid/missing-dep", and `invalid_workflow_status` is an "invalid" hard gate. The module comment at actions.mjs:171 ("The freshness/terminal/dependency gate above is the only state gate") is also inconsistent with the code, which additionally gates on `invalid_authoritative_evidence`.

**Fix:** Either extend `TRANSITION_REASON_MAP` to cover `invalid_workflow_status`, `no_valid_transition`, and `required_gate_missing` (so they apply to every verb), or move the debug branch below the `transitions.status !== 'candidates_available'` check and document which status codes debug is permitted to bypass. The former is safer and matches the phase context:

```js
const TRANSITION_REASON_MAP = {
  authoritative_evidence_stale: 'authoritative_evidence_stale',
  terminal_workflow: 'terminal_workflow',
  invalid_authoritative_evidence: 'invalid_authoritative_evidence',
  invalid_workflow_status: 'invalid_workflow_status',
  no_valid_transition: 'no_valid_transition',
  required_gate_missing: 'required_gate_missing',
  dependency_unsafe: 'dependency_unavailable',
};
```

Add a regression test: debug verb with `state.status = 'paused'` must block with `invalid_workflow_status`, not select.

### WR-03: `PLAN_TRANSITION_TO = 'plan'` hardcodes a workflow-state literal, coupling the create_phase verb to a specific transition-policy vocabulary

**File:** `src/orchestrator/actions.mjs:33, 186`
**Issue:** The create_phase verb identifies the plan transition by `c.to === 'plan'`. The `to` value is a workflow-state name from `WORKFLOW_TRANSITIONS` (transitions.mjs:32-40). The phase context requires "Framework-neutral: no hardcoded framework command names in src/ (authority must come from contract.fields.workflow_transitions)." While `'plan'` is a state rather than a command, hardcoding it couples `actions.mjs` to the current transition policy's state vocabulary. If the policy ever evolves the `to` value (e.g., to `planning` or a framework-specific name), the create_phase verb silently fails with `no_eligible_capability` — a misleading reason that hides the real cause (the hardcoded literal drifted from the policy). The same hardcoding pattern also makes it impossible to support multiple workflow families with different plan-state names.

**Fix:** Identify the plan transition via a stable, dedicated marker on the transition row (e.g., a `kind: 'plan'` or `role: 'plan'` field added to the transition policy), or accept the plan transition_id as a parameter from the caller/contract rather than filtering by `to`. At minimum, lift `'plan'` to a named constant exported from `transitions.mjs` (the policy owner) so the coupling is localized and visible:

```js
// in transitions.mjs
export const PLAN_TRANSITION_TO = 'plan';
// in actions.mjs
import { PLAN_TRANSITION_TO } from './transitions.mjs';
```

## Info

### IN-01: `create_phase` reason priority — `roadmap_phase_unresolved` masks `no_eligible_capability`

**File:** `src/orchestrator/actions.mjs:182-194`
**Issue:** In the `create_phase` branch the `next_number === null` check runs before `selectOne(matches, args)`. If both `matches` is empty AND `next_number` is null, the block reason is `roadmap_phase_unresolved`, masking the missing-capability condition. Both are blocked, so this is a priority-ambiguity / observability issue, not a correctness bug.
**Fix:** Either compute `next_number` before `collectCandidates` and fail fast on `null`, or surface both reason codes (e.g., `roadmap_phase_unresolved` + a `candidates: 0` fact).

### IN-02: `bindApproval` does not wrap `contentFingerprint(capability)` in try/catch while `stableCapabilityId` is wrapped

**File:** `src/orchestrator/approval.mjs:67-68`
**Issue:** `contentFingerprint` (identity.mjs:37-51) calls `canonicalizeCapability` → `validateCapability`, which can throw on a malformed capability record. `capId` is wrapped in `try { ... } catch { return ''; }`, but `capFingerprint` is not. The asymmetry means a malformed capability that `stableCapabilityId` tolerates could still throw at the approval gate, propagating an exception to the caller rather than failing closed with a blocked verdict.
**Fix:** Wrap `contentFingerprint` in the same try/catch pattern, or have `bindApproval` throw a typed error and document that the caller must catch it; the security-gate contract should not rely on an exception for malformed input.

### IN-03: `verifyApproval` returns the bearer token in the approved verdict — callers must not log it

**File:** `src/orchestrator/approval.mjs:130-135`
**Issue:** The approved verdict includes `token: bound.token`. The token is a bearer token: any caller that logs the verdict (e.g., in telemetry) leaks the capability+args binding window. The module itself does no logging, but the broader telemetry policy ("never log raw prompt text") should explicitly extend to approval tokens (replay risk within the same proposalVersion/args).
**Fix:** Document on `verifyApproval` that the returned `token` MUST NOT be persisted to telemetry. Consider returning only `status`/`reason_code` and omitting `token` from the verdict (the caller already has `bound.token` if it needs it).

### IN-04: `classifyIntent` `policy_version_mismatch` path is untested

**File:** `src/intent/classify.mjs:51-54`, `tests/router.intent.test.mjs`
**Issue:** The `policyVersion` option mismatch branch (returns `ambiguous` / `policy_version_mismatch`) is not exercised by any test in the intent test files. Minor coverage gap — the branch is reachable if a future caller pins a policy version.
**Fix:** Add a test: `classifyIntent('run the tests', { policyVersion: 'intent-policy-v0' })` returns `disposition: 'ambiguous'`, `reason_code: 'policy_version_mismatch'`, `dispatch_eligible: false`.

### IN-05: `needsApproval` substring matching is brittle for `side_effects` (no controlled vocabulary)

**File:** `src/orchestrator/approval.mjs:32-35, 43-58`
**Issue:** `tokenMatches` uses `text.includes(token)` over `stableStringify(value).toLowerCase()`. For the enum fields `reversibility` and `risk`, `validateContractFieldValue` (contract.mjs:57-58, 81-83) enforces a controlled vocabulary (`['unknown','reversible','irreversible']` and `['unknown','low','medium','high','critical','unacceptable']`), so the substring match is safe. But `side_effects` is a `STRING_LIST_FIELDS` entry (contract.mjs:69-72) — any non-empty string array is valid. A capability with `side_effects: ['filesystem:write', 'git:commit']` is plainly destructive but contains none of the tokens `destructive`/`unbounded`/`external`/`privileged`, so `needsApproval` returns `false`. The gate relies on the contract author using the exact token vocabulary, which is a design brittleness worth documenting.
**Fix:** Either (a) add a controlled vocabulary for `side_effects` tokens in `validateContractFieldValue` so the gate is authoritative, or (b) document on `needsApproval` that contract authors MUST use the `destructive`/`unbounded`/`external`/`privileged` tokens for the gate to fire, and add a registry lint that warns when a `side_effects` entry lacks a recognized token.

---

_Reviewed: 2026-07-27T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_