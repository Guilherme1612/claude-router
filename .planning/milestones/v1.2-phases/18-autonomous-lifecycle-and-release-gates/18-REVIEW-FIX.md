---
phase: 18-autonomous-lifecycle-and-release-gates
fixed_at: 2026-07-17T13:30:00Z
review_path: .planning/phases/18-autonomous-lifecycle-and-release-gates/18-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 18: Code Review Fix Report

**Fixed at:** 2026-07-17T13:30:00Z
**Source review:** .planning/phases/18-autonomous-lifecycle-and-release-gates/18-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (0 critical + 7 warnings; info findings out of scope)
- Fixed: 7
- Skipped: 0

## Fixed Issues

| ID | Title | Files Modified | Commit | Notes |
|----|-------|-----------------|--------|-------|
| WR-01 | Test cleanup races — `holder.child.kill()` not awaited before `rmSync` | `tests/router.autonomous-lifecycle.test.mjs`, `tests/router.lifecycle-recovery.test.mjs`, `tests/router.test-mode-seam.test.mjs` | `683490c` | Added `await` to all 8 finally-block `holder.child?.kill()` calls (1 in autonomous-lifecycle, 6 in lifecycle-recovery, 1 in test-mode-seam). Verified all 18 affected tests pass. |
| WR-02 | Reinstall verb test leaks `reinstallHolder` controller on assertion failure | `tests/router.installer-coexistence.test.mjs` | `c6d5f9b` | Hoisted `reinstallHolder` to top scope with `let reinstallHolder = null` so the finally block can clean it up unconditionally if an in-try assertion fails; cleared to `null` after the in-try `safeStopController` call. |
| WR-03 | Rollback functions don't accept `test_mode` | `src/registry/activate.mjs` | `788cebe` | Added `test_mode = false` parameter to `previewRollback` and `executeRollback`, threading it through to `verifyVersion` and `replaceActivePointer`. Mirrors `recoverActiveVersion`. |
| WR-04 | Release runner skip detection marks entire stage as skipped when any single test has `# SKIP` | `src/release/run-release.mjs` | `74b6d5c` | Restricted `skipped` to the case where pass count is 0 (computed from `# pass N` in TAP output), so a stage with passing tests plus a single platform-specific `# SKIP` no longer fails the gate. |
| WR-05 | Coexistence sentinel tests don't perform the verbs they claim to test | `tests/router.coexistence.test.mjs` | `3271b80` | Renamed the five tests from `sentinel distinctness after ${verb} verb: re-import hook and re-assert` to `sentinel is stable across re-imports (${verb} verb label)` and updated the section comment to make explicit that these are a re-import stability proxy, not verb-execution coverage (which lives in `router.installer-coexistence.test.mjs`). |
| WR-06 | `test-mode-seam.mjs` `kill()` can surface unhandled promise rejection | `tests/helpers/test-mode-seam.mjs` | `5174674` | Wrapped `handle.close()` (both immediate and polled paths) in `.catch(() => {})` so a rejecting `publish('stopped')` (e.g., on a removed controller dir) does not surface as an unhandled promise rejection. |
| WR-07 | `safeStopController` uses a non-deterministic 20ms sleep after `await kill()` | `tests/router.installer-coexistence.test.mjs` | `e6157d3` | Removed the redundant `await new Promise(resolve => setTimeout(resolve, 20))` — `await kill()` already waits for `close()` which awaits `publish('stopped')`. Comment updated to explain why no sleep is needed. |

## Skipped Issues

None — all in-scope findings were fixed and committed.

## Verification Performed

For each fix:
- **Tier 1 (re-read):** Confirmed the fix text is present and surrounding code is intact.
- **Tier 2 (syntax check + test run):** `node --check` passed for every modified `.mjs` file; the affected `node --test` suites were run and reported `pass=N fail=0`:
  - WR-01: 18/18 pass across the three modified test files.
  - WR-02: 15/15 pass in `router.installer-coexistence.test.mjs`.
  - WR-03: 8/8 pass in `router.registry-activate.test.mjs`.
  - WR-04: 17/17 pass in `router.v12-release.test.mjs`.
  - WR-05: 16/16 pass in `router.coexistence.test.mjs`.
  - WR-06: 33/33 pass across the four test files that use the seam helper.
  - WR-07: 15/15 pass in `router.installer-coexistence.test.mjs`.
- **Invariant check:** No production hot path was perturbed — all fixes are confined to test helpers and the rollback/skip-detection seams. Settings fingerprint stability, uninstall completeness, telemetry privacy (no raw prompt logging), and the fail-open hook contract are untouched.

---

_Fixed: 2026-07-17T13:30:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_