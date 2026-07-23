---
phase: 12-incremental-change-detection-and-watcher
fixed_at: 2026-07-15T13:52:42Z
review_path: .planning/phases/12-incremental-change-detection-and-watcher/12-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 12: Code Review Fix Report

**Fixed at:** 2026-07-15T13:52:42Z
**Source review:** `.planning/phases/12-incremental-change-detection-and-watcher/12-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 3
- Fixed: 3
- Skipped: 0

## Fixed Issues

### WR-01: Startup reconciliation failure is swallowed and the controller publishes ready

**Files modified:** `src/registry/watcher.mjs`, `tests/router.registry-watcher.test.mjs`
**Commit:** 9c8ddd4
**Applied fix:** Startup now awaits reconciliation directly, reports and rethrows initialization errors, and has regression coverage proving failed initial scans reject readiness without writing a baseline.
**Status:** fixed: requires human verification

### WR-02: Missing-root handling fails when more than the final path component is absent

**Files modified:** `src/registry/fingerprint.mjs`, `tests/router.registry-diff.test.mjs`
**Commit:** 21c15c4
**Applied fix:** Missing paths now walk to the nearest existing canonical ancestor, reconstruct the unresolved suffix for containment validation, and cover nested missing, nested escape, and root-level access-denial cases.
**Status:** fixed: requires human verification

### WR-03: Live gap test does not prove incremental execution or complete publication parity

**Files modified:** `src/registry/watcher.mjs`, `tests/router.registry-watcher.test.mjs`, `tests/router.lifecycle.test.mjs`
**Commit:** e06ba92
**Applied fix:** Controller status now exposes the installed reconciliation strategy and lifecycle hash; live tests reject non-incremental execution and compare candidate and report output with a clean full build after live and restart repair mutations.

---

_Fixed: 2026-07-15T13:52:42Z_
_Fixer: generic-agent workaround (gsd-code-fixer role contract)_
_Iteration: 1_
