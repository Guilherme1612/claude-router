---
phase: 20-close-gap-evo-05-add-production-trigger-for-canary-controlle
plan: 04
subsystem: registry/evolution
tags: [canary, watcher, production-trigger, CR-01, gap-closure, stdlib, node-test]

# Dependency graph
requires:
  - phase: 20-close-gap-evo-05-add-production-trigger-for-canary-controlle
    plan: 02
    provides: watcher canary trigger wiring (proposeCandidate -> evaluateCandidate -> applyCanaryDecision) — the production canary path that CR-01 made unreachable after the first reconcile
provides:
  - watcher canary trigger reachable on EVERY eligible reconcile — the `recovered` flag resets per reconcile call so the recovery block (and thus applyCanaryDecision, the 6 REQUIRED_GATES, the evidence sufficiency gate, and the D-05 demonstrated_benefit derivation) runs on every reconcile, not just the first. Closes CR-01 and restores EVO-05's PRIMARY automatic production trigger.
affects: [20-05 (CR-02 CLI audit reason), EVO-05 phase goal]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Per-call state reset for the `recovered` flag — moved the declaration from factory scope (outside reconcile) into the reconcile function body so each reconcile re-evaluates recovery state from scratch. Restores the safety-gate invariant: the canary path is reachable on every eligible reconcile.
    - Dead-code ternary removal — `active.authority_status === 'empty' ? null : null` (both branches null) replaced with a plain `let knownGood = null;` initializer; the recovery block populates knownGood correctly.

key-files:
  created: []
  modified:
    - src/registry/watcher.mjs
    - tests/router.watcher-canary-trigger.test.mjs

key-decisions:
  - "Reset `recovered` per reconcile by moving the declaration inside the reconcile function body (rather than leaving it at factory scope and adding a reset statement). Cleaner: the flag's lifetime is scoped to a single reconcile call, matching its semantics (recovery state for THIS call). No other use of `recovered` changed."
  - "Replaced the line-337 both-branches-null ternary with `let knownGood = null;`. The ternary was a refactoring dead-code bug — both branches evaluated to null. The recovery block (line ~343 on healthy/recovered, line ~348 on no_valid_history) is the only place knownGood is populated; the initializer's only job is to start at null."
  - "Multi-reconcile regression test (Test 8) is the canonical CR-01 guard: it calls reconcile() TWICE on the same reconciler with the same eligible candidate + known-good + sufficient evidence and asserts applyCanaryDecision runs on BOTH calls (canaryCalls.length === 2) and the 2nd reconcile does NOT take the bootstrap path. The existing single-reconcile tests masked CR-01 because each called reconcile() exactly once — Test 8 closes that gap."

patterns-established:
  - "Pattern: multi-reconcile regression tests for stateful reconciler flags — any flag declared outside a function that uses it must be reset per call; the regression test calls the function twice to catch persistence bugs that single-call tests miss."

requirements-completed: [EVO-05]

coverage:
  - id: T1
    description: "Watcher canary trigger runs on EVERY eligible reconcile (multi-reconcile regression — CR-01 closed)."
    requirement: "EVO-05"
    verification:
      kind: integration
      ref: "tests/router.watcher-canary-trigger.test.mjs#Test8"
      status: pass
    human_judgment: false
  - id: T2
    description: "Existing 7 single-reconcile tests still pass (no regression in promote/preserve/bootstrap/rollback/neutral/helper/compatible edges)."
    requirement: "EVO-05"
    verification:
      kind: integration
      ref: "tests/router.watcher-canary-trigger.test.mjs#Test1..Test7"
      status: pass
    human_judgment: false
  - id: T3
    description: "Hot path (src/context/prompt-route.mjs) unchanged — imports none of the canary wiring."
    requirement: "EVO-05"
    verification:
      kind: other
      ref: "grep -v '^#' src/context/prompt-route.mjs | grep -c 'canary\\|evidence\\|telemetry-bridge\\|buildCandidateCalibrationRoute' -> 0"
      status: pass
    human_judgment: false
  - id: T4
    description: "No regression in canary/evolution/lifecycle suites (67 tests across 7 files, 0 failures)."
    requirement: "EVO-05"
    verification:
      kind: integration
      ref: "node --test tests/router.watcher-canary-trigger.test.mjs tests/router.lifecycle.test.mjs tests/router.autonomous-lifecycle.test.mjs tests/router.lifecycle-recovery.test.mjs tests/router.test-mode-seam.test.mjs tests/router.evolution-canary.test.mjs tests/router.compiled-evolution.test.mjs -> 67 pass / 0 fail"
      status: pass
    human_judgment: false

# Metrics
duration: ~2min
completed: 2026-07-22
status: complete
---

# Phase 20 Plan 04: Close CR-01 — Watcher Production Canary Trigger (multi-reconcile) Summary

**Closed CR-01: the watcher's production canary trigger is now reachable on EVERY eligible reconcile (not just the first) by resetting the `recovered` flag per reconcile call and replacing the dead-code line-337 knownGood initializer — verified by a multi-reconcile regression test that calls reconcile() TWICE and asserts applyCanaryDecision runs on both calls.**

## Performance

- **Duration:** ~2 min
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 2 (1 source, 1 test)

## Accomplishments

- `src/registry/watcher.mjs` — surgical two-line fix: (a) moved `let recovered = false;` from factory scope (was line 304, outside the reconcile function) into the reconcile function body as its first statement, so the recovery block (and thus the canary path with its 6 REQUIRED_GATES + evidence sufficiency gate + D-05 demonstrated_benefit derivation) runs on EVERY eligible reconcile, not just the first; (b) replaced the dead-code ternary `active.authority_status === 'empty' ? null : null` (both branches returned null) with a plain `let knownGood = null;` initializer. No adjacent code refactored; the test_mode bypass, the canary path body, and the hot path src/context/prompt-route.mjs are untouched.
- `tests/router.watcher-canary-trigger.test.mjs` — added Test 8: a multi-reconcile regression test that constructs a reconciler with test_mode=false, an eligible candidate, a healthy recovery returning version_id=KNOWN_GOOD, and a sufficient evidence window (30 records), then calls `reconcile({ diff })` TWICE on the same reconciler with the same diff. Asserts `canaryCalls.length === 2` (applyCanaryDecision invoked on BOTH calls) and the 2nd reconcile does NOT take the bootstrap path (`activation_reason !== 'watcher'`; activation_status is a canary decision: activated/preserved/rolled_back/recovery_required). The test fails before the source fix (canaryCalls.length === 1 on the 2nd call) and passes after.

## Task Commits

1. **Task 1 RED: multi-reconcile regression test (failing)** — `f321f1f` (test: Test 8 added, fails with `1 !== 2`)
2. **Task 1 GREEN: reset recovered per reconcile + fix knownGood initializer** — `511b825` (fix: 2-line source fix, Test 8 passes)

## Files Created/Modified

- `src/registry/watcher.mjs` (modified) — `let recovered = false;` moved into reconcile body (now line 313, inside `const reconcile = async ({ diff }) => {`); line-337 dead-code ternary replaced with `let knownGood = null;`.
- `tests/router.watcher-canary-trigger.test.mjs` (modified) — Test 8 added (multi-reconcile regression for CR-01).

## Decisions Made

- **Moved the `recovered` declaration inside reconcile (rather than leaving at factory scope + adding a reset statement).** Both forms work, but scoping the flag's lifetime to a single reconcile call matches its semantics (recovery state for THIS call) and prevents any future re-introduction of the cross-call persistence bug. No other use of `recovered` exists outside reconcile.
- **Replaced the both-branches-null ternary with a plain `let knownGood = null;`.** The ternary `active.authority_status === 'empty' ? null : null` was a refactoring dead-code bug — both branches evaluated to null. The recovery block (line ~343 `knownGood = recoveryResult.version_id || null;` on healthy/recovered, line ~348 `knownGood = null;` on no_valid_history) is the only place knownGood is populated; the initializer's only job is to start at null.
- **Test 8 is the canonical CR-01 guard.** The existing 7 single-reconcile tests masked CR-01 because each called reconcile() exactly once (first-call path exercised, recovered stayed false). Test 8 calls reconcile() TWICE, catching the persistence bug that single-call tests cannot detect.

## Deviations from Plan

None — plan executed exactly as written. The fix touched exactly the 2 lines specified (recovered declaration + line-337 initializer) plus the 1 new test case. No adjacent code was refactored; the hot path src/context/prompt-route.mjs is untouched.

Note: the RED commit (`f321f1f`) also included pre-existing staged changes to `.planning/ROADMAP.md` (Wave 4 gap-closure plan section) — legitimate phase-20 tracking-doc updates from the prior planning/re-verify session, included as expected per the execution context.

## Issues Encountered

- The git working tree is on a detached HEAD (not on `main`) — consistent with the prior Wave commits in this phase. Commits continued on the same detached HEAD; the orchestrator handles branch reattachment.

## User Setup Required

None — zero-dependency stdlib-only fix. No external services, env vars, or dashboard configuration.

## Known Stubs

None — the fix restores real control-flow correctness; no placeholder values, no unwired data flows.

## Threat Flags

None — no new security-relevant surface. The fix is internal control-flow correctness that RESTORES the 6 REQUIRED_GATES, the evidence sufficiency gate, the D-05 demonstrated_benefit derivation, and the REGISTRY_PUBLICATION-only mutation constraint in production on every eligible reconcile (threat reduction per the plan's threat model: T-20-04-01 mitigated).

## Next Phase Readiness

- **CR-01 is closed**: EVO-05's production canary trigger is reachable on every eligible reconcile. Combined with 20-05 (CR-02 CLI audit reason), this unblocks the EVO-05 phase goal ("telemetry drives canary promotion + rollback in production").
- The watcher's `createRegistryReconciler` dependency seam is unchanged — existing test fixtures (`makeCanaryDeps` / `makeEvidenceStore` / `createTestRegistryReconciler`) work verbatim.
- **Blockers:** None.

## Self-Check: PASSED

- Modified files exist: `src/registry/watcher.mjs`, `tests/router.watcher-canary-trigger.test.mjs` — FOUND.
- Commits exist: `f321f1f`, `511b825` — both FOUND in `git log`.
- `node --test tests/router.watcher-canary-trigger.test.mjs` -> 8/8 pass (Test 8 + existing 7).
- `grep -c "authority_status === 'empty' ? null : null" src/registry/watcher.mjs` = 0 (dead-code ternary removed).
- `let recovered = false;` at line 313, inside the reconcile function body (after `const reconcile = async ({ diff }) => {`) — no longer at factory scope.
- Hot path: `grep -v '^#' src/context/prompt-route.mjs | grep -c 'canary\|evidence\|telemetry-bridge\|buildCandidateCalibrationRoute'` = 0 (untouched).
- Regression: `node --test tests/router.evolution-canary.test.mjs tests/router.compiled-evolution.test.mjs` -> 20/20 pass.
- Broader regression (lifecycle-dependent suites): 67 pass / 0 fail across router.watcher-canary-trigger (8), router.lifecycle (20), router.autonomous-lifecycle (4), router.lifecycle-recovery (12), router.test-mode-seam (3), router.evolution-canary (15), router.compiled-evolution (5).
- Test 8 asserts `canaryCalls.length === 2` (applyCanaryDecision on BOTH reconciles) and 2nd reconcile `activation_reason !== 'watcher'` (not the bootstrap path).

---
*Phase: 20-close-gap-evo-05-add-production-trigger-for-canary-controlle*
*Completed: 2026-07-22*