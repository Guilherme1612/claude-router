---
phase: 21-authoritative-personalized-inventory
plan: 06
subsystem: registry-identity-contract
tags: [identity, provenance, continuity, regression]
requires:
  - phase: 21-03
    provides: portable path-separated identity and exact-fingerprint continuity
  - phase: 21-05
    provides: Phase 21 focused and repository-suite baseline
provides:
  - D-09-aligned full portable fallback-ID assertions
  - Separate semantic-byte and exact-source continuity regression contracts
  - Current focused Phase 21 and repository-suite evidence
affects: [phase-21-verification, registry-schema-regressions]
tech-stack:
  added: []
  patterns: [full deterministic identity assertions, exact-source continuity evidence]
key-files:
  created:
    - .planning/phases/21-authoritative-personalized-inventory/21-06-SUMMARY.md
  modified:
    - tests/router.registry-schema.test.mjs
key-decisions:
  - "Production identity behavior remains authoritative; only stale Phase 11 expectations were corrected."
  - "Canonical semantic bytes track invocation and precedence order, while continuity fingerprints track authored content or exact source fingerprints."
metrics:
  duration: 8 min
  completed: 2026-07-26
status: complete
---

# Phase 21 Plan 06: D-09 Schema Contract Reconciliation Summary

**Portable full-path fallback identities and exact-source continuity assertions now match the approved Phase 21 identity contract without changing production code.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-26T18:04:49Z
- **Completed:** 2026-07-26T18:12:49Z
- **Tasks:** 2
- **Files modified:** 1 test file

## Accomplishments

- Replaced stale name-derived Claude and Codex ID literals with their complete deterministic portable source-path fallback IDs.
- Kept the explicit proof that equal names and equal live content at separate paths remain distinct capabilities.
- Split semantic ordering from continuity: canonical bytes change with invocation/precedence order, unchanged exact source evidence preserves the continuity fingerprint, and changed source evidence changes it.
- Removed both schema-contract failures from the exact 116-test Phase 21 slice.

## Task Commits

1. **Task 1: Reconcile stale schema assertions with D-09 identity semantics** — `8221087` (`test`)
2. **Task 2: Re-run the focused Phase 21 gate and classify repository regressions** — verification-only; no file changes or separate commit

## Files Created/Modified

- `tests/router.registry-schema.test.mjs` — Full portable fallback-ID assertions and separated semantic-byte/exact-source continuity assertions.
- `.planning/phases/21-authoritative-personalized-inventory/21-06-SUMMARY.md` — Focused and repository verification evidence.

## Decisions Made

- Kept `src/registry/identity.mjs`, canonicalization, and fixture provenance unchanged because the verified Phase 21 production contract is authoritative.
- Used exact complete ID literals rather than prefix matching so regressions in runtime, scope, logical root, or relative path remain detectable.
- Treated repository failures outside `tests/router.registry-schema.test.mjs` as pre-existing/out-of-scope rather than widening this corrective plan.

## Verification Evidence

### Owned schema contract

- `rtk node --test tests/router.registry-schema.test.mjs`
- Result: **17 passed, 0 failed, 0 skipped**

### Exact Phase 21 focused slice

- `rtk node --test tests/router.adapters.test.mjs tests/router.registry-schema.test.mjs tests/router.registry-diff.test.mjs tests/router.registry-reconcile.test.mjs tests/router.registry-build.test.mjs tests/router.registry-watcher.test.mjs tests/router.registry-activate.test.mjs tests/router.control-cli.test.mjs tests/router.inventory-*.test.mjs`
- Result: **115 passed, 1 failed, 0 skipped out of 116**
- Both formerly stale `router.registry-schema.test.mjs` tests pass.
- Sole failure: `mode-map stamping seeds record mapping.explicit_subjects so the mapper publishes dispatch routes` in untouched `tests/router.registry-build.test.mjs`, failing with the previously documented `tuple_validation_failed` publication seam.

### Full repository suite

- `rtk node --test tests/*.test.mjs`
- Result: **743 passed, 19 failed, 3 skipped out of 765**
- No failure is in the sole owned file, `tests/router.registry-schema.test.mjs`.
- A targeted classification rerun reproduced 18 deterministic failures in untouched files; the nineteenth was a full-suite-only concurrency/environment failure in an untouched lifecycle/install seam.

Deterministic failing tests reproduced outside plan ownership:

- `tests/router.autonomous-lifecycle.test.mjs`
  - `claude installed controller observes the seven-event lifecycle matrix via the real seam`
  - `codex installed controller observes the seven-event lifecycle matrix via the real seam`
  - `all fourteen runtime-operation cells are exercised`
  - `Phase 19 D-09: orchestrator siblings baked, ORC-01 no-fallback, TOK-02 required-overflow, Flow 11 dispatch_eligible PASS`
- `tests/router.lifecycle-recovery.test.mjs`
  - `D-04 unsafe candidate recovery through installed controller preserves the verified tuple and a later valid change advances`
  - `D-04 corrupt registry payload recovery through installed controller preserves reader safety and a later valid change advances`
  - `D-04 corrupt index payload recovery through installed controller preserves reader safety and a later valid change advances`
  - `D-04 corrupt tuple manifest/schema recovery through installed controller preserves reader safety and a later valid change advances`
  - `D-04 corrupt tuple hash recovery through installed controller preserves reader safety and a later valid change advances`
  - `D-04 controller interruption recovery through installed controller reconciles the missed event and a later valid change advances`
  - `D-04 missed/coalesced events recovery through installed controller produces one consistent tuple and a later valid change advances`
  - `D-06 startup repair recovers the corrupt active pointer from known-good and a later valid change advances`
  - `D-06 steady-state failure recovery through installed controller repairs on restart and a later valid change advances`
- `tests/router.lifecycle.test.mjs`
  - `installed project ancestor watches initially absent Claude and Codex inventories`
- `tests/router.registry-build.test.mjs`
  - `mode-map stamping seeds record mapping.explicit_subjects so the mapper publishes dispatch routes`
- `tests/router.safety-release.test.mjs`
  - `SAF-01 through SAF-08: final verification artifact records every exact release command`
  - `SAF-05/SAF-07: live JSON settings preserve router, GSD, context-mode, caveman, and ralph-loop surfaces`
- `tests/router.test-mode-seam.test.mjs`
  - `opt-in test_mode lets the installed controller publish via the real watcher→controller→compiled-index seam`

### Scope proof

- `git diff --name-only -- tests src` was empty after the task commit.
- Commit `8221087` changes only `tests/router.registry-schema.test.mjs`.
- No production file, earlier Phase 21 plan artifact, or unrelated dirty-worktree file was staged or modified by this plan.

## Deviations from Plan

None — plan scope and production behavior were preserved exactly.

## Known Stubs

None. The changed test assertions contain no placeholder or unwired behavior.

## Threat Flags

None. This plan changes regression assertions only and introduces no endpoint, authentication path, file-access pattern, schema mutation, or trust-boundary surface.

## Issues Encountered

- The focused and repository suites retain failures outside this plan's owned file. They were classified rather than changed, as required.
- The repository suite's nineteenth failure appeared only under the full concurrent run and did not reproduce in targeted classification; it remains outside the Phase 21 schema-contract ownership boundary.

## Next Phase Readiness

- GAP-21-01 is closed: both stale schema assertions now pass and the focused slice has no schema-contract failure.
- Phase verification can re-run against the corrected contract while continuing to track the tuple-publication and broader pre-existing repository failures separately.

## Self-Check: PASSED

- `tests/router.registry-schema.test.mjs` exists.
- `.planning/phases/21-authoritative-personalized-inventory/21-06-SUMMARY.md` exists.
- Task commit `8221087` exists in git history.
- Focused acceptance criteria pass for the owned schema contract.
