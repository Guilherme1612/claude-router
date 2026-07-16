---
phase: 17-compiled-prompt-routing-and-safe-evolution
plan: 04
subsystem: compiled-routing-and-evolution
tags: [gap-closure, tdd, security, evidence, calibration]
requires: [17-01, 17-02, 17-03]
provides:
  - descriptor-bound compiled-index reads and strict route projections
  - eligible content-addressed evidence windows bound to candidates
  - exact UTF-8 context-budget measurement
affects: [EVO-05, REL-01]
tech-stack:
  added: []
  patterns: [O_NOFOLLOW descriptor reads, deeply frozen evidence envelopes, measured context gates]
key-files:
  created: []
  modified:
    - src/prompt/compile-index.mjs
    - src/context/prompt-route.mjs
    - src/evolution/evidence.mjs
    - src/evolution/canary-controller.mjs
    - src/evolution/perf-measure.mjs
    - tests/router.compiled-index.test.mjs
    - tests/router.evolution-canary.test.mjs
    - tests/router.perf-calibration.test.mjs
key-decisions:
  - "Compiled JSON is opened once with O_NOFOLLOW, fstat-validated, read from the same descriptor, and closed in finally."
  - "Evidence windows carry a canonical SHA-256 fingerprint over scope, observations, counts, threshold, and weighting policy; candidates must declare that exact fingerprint."
  - "Context budget uses Buffer.byteLength over the routed context string or deterministic serialized result, never candidate self-attestation."
requirements-completed: [EVO-05, REL-01]
duration: 12min
completed: 2026-07-16
status: complete
---

# Phase 17 Plan 04: Verifier Gap Closure Summary

Strict compiled authority, authentic eligible canary evidence, deterministic clocks, and measured context budgets now close F-01 through F-04 without weakening Phase 17 latency or rollback gates.

## Accomplishments

- Replaced compiled-index TOCTOU reads with bounded descriptor reads using no-follow open semantics, regular-file `fstat`, same-descriptor reads, and guaranteed close handling.
- Added strict allowlisted validation for every compiled route projection, including key/workflow identity, bounded tokens, required fields, unknown fields, arrays, and empty maps.
- Made refresh and explicit-override capsule timestamps use the validated injected `now` value.
- Enforced aggregate eligibility symmetrically on append and read, and created deeply frozen content-addressed evidence-window envelopes.
- Bound candidate evaluation to authentic evidence fingerprints and rejected mutable, fabricated, count-inconsistent, scope-invalid, negative, non-finite, or unrelated windows before hard gates.
- Replaced context-budget self-attestation with exact UTF-8 byte measurement and recorded measured and maximum bytes per fixture.

## Task Commits

1. **RED: adversarial verifier-gap coverage** — `a3d5c09` (`test`)
2. **GREEN: hardened compiled/evolution authority** — `bdd9d82` (`feat`)

## Verification

- Focused Phase 17 suite: **53/53 passed**.
- Complete workspace suite: **588/588 passed** in 21.1 seconds.
- The context-mode test wrapper initially produced four path-environment failures in `router.health.test.mjs`; direct isolated verification passed 10/10, and the direct complete suite passed 588/588.

## Deviations from Plan

None - plan executed exactly as written.

## TDD Gate Compliance

- RED commit present: `a3d5c09`.
- GREEN commit present after RED: `bdd9d82`.
- No separate refactor commit was required.

## Issues Encountered

- The repository-root `AGENTS.md` and `RTK.md` referenced by the invocation were absent; no additional repository-local instructions could be loaded.
- The context-preserving test wrapper changes execution paths and caused four false health-test failures. Direct execution proved the repository suite green.

## User Setup Required

None.

## Next Phase Readiness

Plan 17-04 is implemented and regression-tested. Phase 17 still requires the independent verifier and centralized phase-completion transition; this executor did not perform verifier duties.

## Self-Check: PASSED

- Implementation and test commits exist.
- Summary exists and is committed separately.
- Plans 17-01 through 17-03 and unrelated dirty workspace files were not modified by this executor.
