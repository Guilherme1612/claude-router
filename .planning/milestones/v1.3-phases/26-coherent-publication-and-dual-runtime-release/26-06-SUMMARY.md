---
phase: 26-coherent-publication-and-dual-runtime-release
plan: 06
subsystem: release-authority
tags: [approval, fail-open, known-good, recommendation]
requires:
  - phase: 26-04
    provides: Guarded activation and complete-tuple recovery
provides:
  - Byte-identical denial evidence for missing, stale, and mismatched approval
  - Ordered safety, approval, activation, and publication evidence
  - Fail-open recommendation corruption coverage with verified known-good routing
affects: [release-verification, prompt-routing, security-audit]
tech-stack:
  added: []
  patterns: [injected gate verification, protected-tree snapshots, verified known-good fallback]
key-files:
  created: []
  modified:
    - tests/router.phase26-authority.test.mjs
key-decisions:
  - "Reuse the existing watcher verifier boundary as the approval and safety authority; add no second mutation mechanism."
  - "Treat suggestion semantics as optional while keeping prompt projection integrity and verified dispatch authoritative."
requirements-completed: [REL-09]
duration: 14min
completed: 2026-07-28
status: complete
---

# Phase 26 Plan 06: Authority Preservation and Fail-Open Recommendations Summary

Exact approval failures are byte-identical no-ops, while corrupt optional advice is suppressed without disrupting verified active or known-good routing.

## Accomplishments

- Proved missing, stale, and mismatched approval stop before activation and publication without changing owned bytes.
- Proved exact fresh approval preserves the established safety, verifier, activation, and publication order.
- Proved malformed recommendation data suppresses only the notice and does not mutate routing state.
- Proved corrupt active prompt projection falls back only to the verified known-good tuple.

## Task Commits

1. **Task 1/2 RED gates:** `f1a552d` (`test(26-06): add authority and fail-open RED gates`)
2. **Task 2 completed evidence:** `9a67edd` (`test(26-06): prove fail-open recommendation routing`)

## Deviations from Plan

None - the existing watcher verifier sequence and prompt projection loader already enforced the required behavior, so production source changes were unnecessary.

## Verification

- `rtk node --test tests/router.phase26-authority.test.mjs` — 6/6 passed.
- `rtk node --test tests/router.phase26-authority.test.mjs tests/router.approval.test.mjs` — 24/24 passed.
- Required combined command reached 36/38 passing; the two failures are pre-existing live-environment checks for an archived Phase 10 verification artifact and local `ralph-loop` enablement, recorded in `deferred-items.md`.

## Known Stubs

None.

## Threat Surface

No new production surface was introduced. T-26-13 and T-26-14 are covered by executable integration evidence.

## Self-Check: PASSED

- `tests/router.phase26-authority.test.mjs` exists.
- Commits `f1a552d` and `9a67edd` exist.
- Focused authority and approval suites pass.
