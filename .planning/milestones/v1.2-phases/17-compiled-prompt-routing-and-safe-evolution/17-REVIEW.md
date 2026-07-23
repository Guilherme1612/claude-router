---
phase: 17-compiled-prompt-routing-and-safe-evolution
reviewed: 2026-07-16T22:37:05Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - src/prompt/compile-index.mjs
  - src/context/prompt-route.mjs
  - src/evolution/evidence.mjs
  - src/evolution/canary-controller.mjs
  - src/evolution/perf-measure.mjs
  - tests/router.compiled-index.test.mjs
  - tests/router.evolution-canary.test.mjs
  - tests/router.perf-calibration.test.mjs
  - tests/router.compiled-evolution.test.mjs
findings:
  critical: 4
  warning: 2
  info: 0
  total: 6
status: issues_found
---

# Phase 17: Code Review Report

**Reviewed:** 2026-07-16T22:37:05Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

The compiled-index, contextual-routing, evidence, canary, and calibration paths were reviewed adversarially with their Phase 17 tests. Four release-blocking defects remain: compiled route records are not schema-validated, aggregate evidence can be read without the explicit eligibility capability, the context-budget gate trusts a route's self-reported boolean instead of measuring output bytes, and compiled-index reads are vulnerable to a symlink-swap race. Two additional reliability defects affect deterministic timestamps and candidate/evidence integrity.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Verified compiled indexes can contain malformed route records that still authorize dispatch

**File:** `src/prompt/compile-index.mjs:71-76` (consumed at `src/context/prompt-route.mjs:103-124`)

**Issue:** `verifyVersion` validates only that `routes` is a non-array object. It does not validate each route key or require bounded `workflow_id`, `transition_id`, and `reason_code` fields, nor require the record's `workflow_id` to match its key. `routeContextPrompt` treats any truthy value at `routes[workflowId]` as authorization, so an index containing `{ "gsd-execute-phase": {} }` or even a string passes cryptographic verification and allows dispatch while returning undefined compiled authority fields. Hash integrity proves the malformed payload is unchanged; it does not make it contract-compatible.

**Fix:** Add a strict projection schema check in `verifyVersion` before returning the index. Reject unknown fields, non-object records, unbounded identifiers, mismatched route keys, and missing transition/reason fields. Add negative tests for `{}`, strings, arrays, mismatched `workflow_id`, and missing fields.

### CR-02: Aggregate evidence can be read without explicit aggregate eligibility

**File:** `src/evolution/evidence.mjs:103-107`

**Issue:** `append` correctly requires `aggregate_eligible === true` for aggregate records, but `window({ scope: 'aggregate' })` constructs an aggregate scope without checking that capability. Any caller with the store can therefore read and use cross-project aggregate evidence without the explicit eligibility signal required by the write path and by D-07's isolation contract. The Phase 17 test only proves eligibility is required on append and does not exercise unauthorized aggregate reads.

**Fix:** Route `window` through the same `scopeFor(options)` authorization logic as `append`, returning `aggregate_eligibility_required` unless `aggregate_eligible === true`. Add a test asserting `store.window({ scope: 'aggregate' })` is denied and the eligible form succeeds.

### CR-03: Context-budget hard gate trusts self-reported route output

**File:** `src/evolution/perf-measure.mjs:34-46`

**Issue:** The context-budget evaluation never measures serialized output size or compares it with `fixture.max_context_bytes`. It accepts `actual.context_within_budget === true`, a boolean supplied by the implementation under evaluation. A candidate can emit arbitrarily large context and simply return that flag, causing the independent `context_budget` hard gate to pass. The byte-locked fixture includes `max_context_bytes`, but the evaluator never uses it.

**Fix:** Serialize the actual injected context (or require the route adapter to return the exact context bytes), calculate `Buffer.byteLength`, and compare that measured value to the validated fixture limit. Do not accept a candidate-authored pass boolean as evidence. Add a regression test with oversized context plus `context_within_budget: true` and require failure.

### CR-04: Compiled-index no-symlink check has a time-of-check/time-of-use escape

**File:** `src/prompt/compile-index.mjs:34-41`

**Issue:** `boundedJson` calls `lstatSync(path)` and then opens the path separately via `readFileSync(path)`. A concurrent writer can replace the checked regular file with a symlink between those operations. The loader can then read attacker-selected JSON outside `ownedRoot`, defeating both the symlink rejection and containment intent and potentially authorizing routes from an external payload. The post-read size check limits bytes but does not restore path authority.

**Fix:** Open once with no-follow semantics (`O_RDONLY | O_NOFOLLOW` where supported), `fstat` the opened descriptor, read from that descriptor, and close it in `finally`. Alternatively, use an immutable directory/file publication protocol whose opened inode is verified. Inject descriptor-based IO in tests and add a symlink-swap regression case.

## Warnings

### WR-01: Injected clock is ignored when persisting refreshed or overridden capsules

**File:** `src/context/prompt-route.mjs:22-27,30-38,84-114`

**Issue:** `routeContextPrompt` accepts `now` and uses it to validate the compiled index, but both capsule constructors stamp `captured_at` with ambient `Date.now()`. Deterministic callers can therefore validate at one instant and persist freshness at another; tests using a fixed clock cannot reliably assert freshness, and clock jumps can make a newly saved capsule appear from the future or immediately stale.

**Fix:** Pass the validated `now` value into `refreshedCapsule` and `overrideCapsule` and use it for `captured_at`. Reject non-finite/non-safe timestamps consistently before any save.

### WR-02: Candidate evaluation accepts fabricated or unrelated evidence-window objects

**File:** `src/evolution/canary-controller.mjs:90-117`

**Issue:** `evaluateCandidate` checks only `status === 'validated'` and `sufficient === true` before using the caller-provided evidence window. It does not validate sample counts, weighted values, scope, observation shape, or bind the window to `candidate.source_evidence_fingerprint`. An accidental or malicious caller can pass a tiny fabricated object and satisfy the evidence gate; the current tests do exactly that, so they do not prove end-to-end evidence provenance.

**Fix:** Have `createEvidenceStore.window` produce a frozen, content-addressed envelope with scope and fingerprint, validate its complete schema here, and require the fingerprint/scope expected by the candidate. At minimum validate safe nonnegative counts and `sample_count >= minimum_samples`; add an integration test that uses a real store window and rejects forged/unrelated windows.

---

_Reviewed: 2026-07-16T22:37:05Z_
_Reviewer: the agent (gsd-code-reviewer; generic-agent workaround)_
_Depth: standard_
