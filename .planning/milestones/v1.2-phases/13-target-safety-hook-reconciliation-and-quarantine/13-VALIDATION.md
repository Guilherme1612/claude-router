---
phase: 13
slug: target-safety-hook-reconciliation-and-quarantine
date: 2026-07-15
status: approved
nyquist_compliant: true
---

# Phase 13 — Validation Strategy

## Test Infrastructure

- **Framework:** Node.js built-in test runner (`node --test`)
- **Focused suites:** registry schema/diff/build/reconciliation, hook reconciliation, watcher, adapters, and route targets
- **Full suite:** `node --test tests/*.test.mjs`

## Sampling Rate

- **After every task commit:** Run the focused new or modified test file plus its closest existing regression file.
- **After every plan wave:** Run `node --test tests/router.registry-schema.test.mjs tests/router.registry-diff.test.mjs tests/router.registry-build.test.mjs tests/router.registry-reconcile.test.mjs tests/router.hook-reconcile.test.mjs tests/router.registry-watcher.test.mjs tests/router.adapters.test.mjs tests/router.route-targets.test.mjs`.
- **Before `$gsd-verify-work`:** Run `node --test tests/*.test.mjs`; the full suite must be green.
- **Max feedback latency:** 120 seconds for focused verification.

## Per-Task Verification Map

| Requirement | Automated coverage |
|---|---|
| SAF-09 | Alias-set invalidation, deleted/missing/invalid/non-invocable targets, rename/move identity, dependency and permission failures, scope leakage, collisions, and ambiguity fixtures. |
| SAF-10 | Quarantine publication failures, portable corrective verdicts, and before/after active-registry byte and fingerprint equality. |
| MAP-02 | Deterministic hook full-outer-join fixtures covering valid pairs, orphan files, orphan bindings, malformed/duplicate inputs, mismatches, path escape, and input-order permutations across both runtimes. |

Every implementation task must include an `<automated>` verification command. Full and incremental build paths must produce identical reconciliation bytes from the same acquired state and lifecycle diff.

## Wave 0 Requirements

- [x] `tests/router.registry-reconcile.test.mjs` — created as Wave 0 in Plan 13-01 before reconciliation behavior is implemented; focused fixtures cover SAF-09 and SAF-10.
- [x] `tests/router.hook-reconcile.test.mjs` — created as a passing Wave 0 fixture scaffold in Plan 13-01 so every listed wave suite exists, then expanded before hook reconciliation behavior in Plan 13-03; the focused native hook file/binding matrix covers MAP-02.
- [x] Shared fixture helpers for deterministic candidate permutations, injected failures, and active-state byte/fingerprint assertions are explicitly created in Plan 13-01 Task 1 and reused by Plans 13-02 and 13-03.

The existing Node test framework is sufficient; no new test dependency is required.

## Manual-Only Verifications

None. All phase success criteria must be demonstrated with deterministic automated fixtures, including portable-output and unchanged-active-state assertions.

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all missing references
- [x] No watch-mode flags
- [x] Feedback latency under 120 seconds (focused task commands; phase-wide full suite is the final gate)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-15 — Plans 13-01 through 13-03 provide per-task focused commands, the listed suite after each wave, and `node --test tests/*.test.mjs` at the phase gate.
