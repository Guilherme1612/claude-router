---
phase: 12-incremental-change-detection-and-watcher
reviewed: 2026-07-15T14:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - src/lifecycle/router-lifecycle.mjs
  - src/registry/build.mjs
  - src/registry/diff.mjs
  - src/registry/fingerprint.mjs
  - src/registry/watcher.mjs
  - tests/router.lifecycle.test.mjs
  - tests/router.registry-build.test.mjs
  - tests/router.registry-diff.test.mjs
  - tests/router.registry-watcher.test.mjs
findings:
  critical: 0
  warning: 3
  info: 0
  total: 3
status: issues_found
---

# Phase 12: Code Review Report

**Reviewed:** 2026-07-15T14:00:00Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Plan 12-04 correctly introduces shared acquisition/assembly seams, routes the authoritative lifecycle diff into the deployed reconciler, preserves acquisition state across publication failure, and deduplicates ancestor watch handles. Three robustness and evidence gaps remain: startup reconciliation failures are converted into readiness, missing nested inventory roots do not receive the promised deterministic empty-root behavior, and the live test cannot disprove full-build fallback or verify report/full-build parity.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Startup reconciliation failure is swallowed and the controller publishes ready

**File:** `src/registry/watcher.mjs:100-131` (observable at `src/registry/watcher.mjs:194-195`)

**Issue:** The `ready` promise ends with `.catch(error => { report(error); })`, which resolves after reporting any `readState`, initial scan, diff, reconciliation, or fingerprint-state write failure. `runRegistryWatcher` then awaits that resolved promise and unconditionally publishes `ready`. An initially inaccessible project inventory, malformed root configuration, or failed initial candidate/report publication can therefore satisfy installer readiness while the registry and fingerprint baseline were never reconciled. This undermines startup correctness and makes the new initially-absent-root path report healthy on failures other than the intentionally tolerated watch-handle creation failure.

**Fix:** Allow watch creation failures to remain non-fatal inside their existing per-watch `try/catch`, but rethrow failures from state loading and the initial reconciliation. Remove the outer swallowing catch (or report and rethrow), and have `runRegistryWatcher` publish `error`/exit without publishing `ready` when `controller.ready` rejects. Add a test injecting an initial scan or publication failure and assert that readiness rejects and no ready status is emitted.

### WR-02: Missing-root handling fails when more than the final path component is absent

**File:** `src/registry/fingerprint.mjs:117-129`

**Issue:** On `realpath(resolvedRoot)` returning `ENOENT`, the code immediately calls `realpath(dirname(resolvedRoot))`. If the configured inventory path is nested beneath multiple absent directories, that second call also throws `ENOENT`; the function does not produce the documented stable empty root hash and `root_missing` diagnostic. The exported scanner contract is phrased for a configured root being absent, not only for a missing basename whose direct parent already exists.

**Fix:** Walk upward to the nearest existing ancestor, canonicalize that ancestor, then append and normalize the unresolved lexical suffix before applying containment. Treat the original root-level `ENOENT` as missing only after this containment check. Add a fixture whose root and direct parent are both absent, plus an outside-containment nested missing path.

### WR-03: Live gap test does not prove incremental execution or complete publication parity

**File:** `tests/router.lifecycle.test.mjs:271-293`

**Issue:** The live test proves that candidate content appears before the 2-second `waitUntil` deadline and that repair is configured to 10 seconds, but it never observes the report, compares candidate/report output with a clean full build, or instruments the installed composition to reject `buildFullRegistry` fallback. The same test passes if the controller uses a full rebuild on every hint, so it does not satisfy the plan's explicit regression purpose. The watcher unit test at `tests/router.registry-watcher.test.mjs:120-150` verifies the isolated reconciler seam, but not that the installed subprocess traverses it. The missing-root scanner test also omits the requested non-`ENOENT` root-level rejection injection.

**Fix:** Add a supported installed-controller trace/report field or dependency-injection seam that records the reconciliation strategy and lifecycle hash, assert both candidate and report change after each mutation, and compare their canonical outputs with `buildFullRegistry(options)`. Make the assertion fail on a full-build strategy. Separately inject a root-level `EACCES`/`EPERM` realpath failure (via a scanner dependency seam if necessary) and assert rejection.

---

_Reviewed: 2026-07-15T14:00:00Z_
_Reviewer: generic-agent workaround (gsd-code-reviewer role contract)_
_Depth: standard_
