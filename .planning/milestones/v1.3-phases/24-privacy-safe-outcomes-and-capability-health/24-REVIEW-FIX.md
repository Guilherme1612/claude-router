---
phase: 24-privacy-safe-outcomes-and-capability-health
fixed_at: 2026-07-28T15:01:14Z
review_path: .planning/phases/24-privacy-safe-outcomes-and-capability-health/24-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 24: Code Review Fix Report

**Fixed at:** 2026-07-28T15:01:14Z
**Source review:** `.planning/phases/24-privacy-safe-outcomes-and-capability-health/24-REVIEW.md`
**Iteration:** 1

**Summary:**

- Findings in scope: 5
- Fixed: 5
- Skipped: 0
- Verification: 145 focused health tests passed

## Fixed Issues

### CR-01: Abandoned and overridden outcomes are double-counted in the opportunity denominator

**Files modified:** `src/health/score.mjs`, `tests/router.health.score.test.mjs`
**Commit:** cf42a81
**Status:** fixed: requires human verification
**Applied fix:** Compute addressed opportunities from the existing sample total and cover the all-abandoned boundary.

### CR-02: Workflow-state-only changes can never update an already selected outcome

**Files modified:** `src/health/observe.mjs`, `tests/router.health.observe.test.mjs`
**Commit:** ba7a6d7
**Status:** fixed: requires human verification
**Applied fix:** Persist privacy-safe pending selections, reconcile the relevant route on workflow-only changes, and apply a batch transition to only one relevant record.

### CR-03: The canary bridge hard-codes four gates as passing without evaluating them

**Files modified:** `src/health/canary-bridge.mjs`, `tests/router.health.canary.test.mjs`
**Commit:** bbf7c66
**Status:** fixed: requires human verification
**Applied fix:** Derive all required gates from candidate-specific validated evidence and reject missing measurements.

### CR-04: Version loader accepts path-traversal policy identifiers

**Files modified:** `src/health/thresholds.mjs`, `tests/router.health.canary.test.mjs`
**Commit:** 5ccddff
**Applied fix:** Validate policy identifiers before active-pointer acceptance or path construction.

### CR-05: Compaction can discard outcomes appended during the rewrite

**Files modified:** `src/health/store.mjs`, `tests/router.health.privacy.test.mjs`
**Commit:** e50a29e
**Status:** fixed: requires human verification
**Applied fix:** Serialize append and compaction through one owned-root mutation lock with bounded contention and stale-owner recovery.

---

_Fixed: 2026-07-28T15:01:14Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
