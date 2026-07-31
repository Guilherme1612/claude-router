---
phase: 28-coverage-audit-guard
fixed_at: 2026-07-29T15:21:41Z
review_path: .planning/phases/28-coverage-audit-guard/28-REVIEW.md
iteration: 3
findings_in_scope: 1
fixed: 1
skipped: 0
status: all_fixed
---

# Phase 28: Code Review Fix Report

**Fixed at:** 2026-07-29T15:21:41Z
**Source review:** `.planning/phases/28-coverage-audit-guard/28-REVIEW.md`
**Iteration:** 3

**Summary:**

- Findings in scope: 1
- Fixed: 1
- Skipped: 0
- Verification: focused Phase 28 matrix and full serial workspace suite passed

## Fixed Issues

### CR-06: Project-scoped skills are accepted as global route targets

**Files modified:** `src/coverage/audit.mjs`, `tests/router.coverage-audit.test.mjs`
**Commit:** 86aa772
**Status:** fixed: requires human verification
**Applied fix:** Project-scoped skills no longer enter the global skill target index. The record retains `expected_scope_project`, while a global route targeting it now produces a forward stale-target diagnostic matching `validateRouteTargets` and causes strict builder mode to exit non-zero.

---

_Fixed: 2026-07-29T15:21:41Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 3_
