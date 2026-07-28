---
phase: 24-privacy-safe-outcomes-and-capability-health
reviewed: 2026-07-28T14:54:32Z
depth: standard
files_reviewed: 18
files_reviewed_list:
  - src/cli/router-control.mjs
  - src/health/admin.mjs
  - src/health/canary-bridge.mjs
  - src/health/catalog.mjs
  - src/health/observe.mjs
  - src/health/outcome-schema.mjs
  - src/health/score.mjs
  - src/health/store.mjs
  - src/health/thresholds.mjs
  - tests/router.health.admin.test.mjs
  - tests/router.health.canary.test.mjs
  - tests/router.health.catalog.test.mjs
  - tests/router.health.observe.test.mjs
  - tests/router.health.outcome-schema.test.mjs
  - tests/router.health.privacy.test.mjs
  - tests/router.health.score.test.mjs
  - tests/router.health.tracer.test.mjs
findings:
  critical: 5
  warning: 0
  info: 0
  total: 5
status: issues_found
---

# Phase 24: Code Review Report

**Reviewed:** 2026-07-28T14:54:32Z
**Depth:** standard
**Files Reviewed:** 18
**Status:** issues_found

## Summary

The scoped health implementation and tests were reviewed at standard depth. The focused test command passes 139/139, but five shipping blockers remain: opportunity exposure is miscomputed, workflow-only outcomes are never reconciled, canary gates are fabricated as passing, threshold loaders permit path traversal, and compaction can lose concurrent appends.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Abandoned and overridden outcomes are double-counted in the opportunity denominator

**Classification:** BLOCKER
**File:** `src/health/score.mjs:150-156`
**Issue:** `sample_count` already includes `abandoned` and `overridden`, but the denominator adds those counts again. This makes `opportunity_exposure` equal `0.5` for a capability with 100% abandoned outcomes instead of `0`, materially inflating usefulness and producing incorrect health tiers.
**Fix:**
```js
const addressed = sample_count - abandoned_count - overridden_count;
const opportunity_exposure = sample_count === 0 ? 0 : addressed / sample_count;
```

### CR-02: Workflow-state-only changes can never update an already selected outcome

**Classification:** BLOCKER
**File:** `src/health/observe.mjs:279-286`
**Issue:** When workflow state advances but telemetry has no new line, the observer returns without emitting anything. The original record therefore remains permanently `selected`; `completed`, `corrected`, and `abandoned` are only derived for newly appended telemetry records. Worse, when several records are appended together, lines 334-338 apply one global prior/current state diff to every new record, so a single transition can mark unrelated records completed. This corrupts the evidence used by scoring and catalog decisions.
**Fix:** Persist pending selections in the cursor and reconcile them whenever workflow state changes, even if telemetry is unchanged. Associate a transition with the relevant pending route/record instead of applying one file-level state diff to every new line.

### CR-03: The canary bridge hard-codes four gates as passing without evaluating them

**Classification:** BLOCKER
**File:** `src/health/canary-bridge.mjs:259-274`
**Issue:** `safety`, `privacy`, `context_budget`, and `latency` are unconditionally set to `pass: true`. Consequently, any shape-compatible candidate with a nominally sufficient evidence window passes all six required gates, regardless of whether the evidence demonstrates safety, privacy, budget, or latency. Delegating these fabricated results to `evaluateCandidate` does not provide a real canary guard.
**Fix:** Derive every required gate from validated evidence produced by the existing canary evaluation pipeline. Reject candidates when any required measurement is absent; do not synthesize passing gate results.

### CR-04: Version loader accepts path-traversal policy identifiers

**Classification:** BLOCKER
**File:** `src/health/thresholds.mjs:101-104`
**Issue:** Exported `loadThresholds` and `loadCalibrationCorpus` join caller-controlled `policy_version` directly beneath the versions root. Values such as `../../other` escape the health versions directory and can read an unrelated `thresholds.json` or calibration manifest. `readActivePointer` also returns an unvalidated value that can feed these loaders.
**Fix:**
```js
const POLICY_ID = /^health-policy-v\d+$/;
if (!POLICY_ID.test(policy_version)) return null;
```
Apply the same validation to active-pointer reads and both loaders before constructing a path.

### CR-05: Compaction can discard outcomes appended during the rewrite

**Classification:** BLOCKER
**File:** `src/health/store.mjs:117-152`
**Issue:** `compact` reads the entire JSONL file, writes a replacement, then renames it over `outcomes.jsonl` without coordinating with `append`. An append from another process after `readOutcomesLines()` but before `renameSync()` succeeds and is then erased by the rename. This is direct evidence loss in an append-only audit store.
**Fix:** Serialize append and compaction with the repository's existing lock primitive, or rotate the active append file atomically and compact only the closed generation. Keep new appends directed to a file that compaction never overwrites.

---

_Reviewed: 2026-07-28T14:54:32Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
