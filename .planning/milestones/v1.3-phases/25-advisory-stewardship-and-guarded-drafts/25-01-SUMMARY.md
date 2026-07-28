---
phase: 25-advisory-stewardship-and-guarded-drafts
plan: 01
subsystem: advisory
tags: [node, deterministic-policy, atomic-state, privacy]
requires:
  - phase: 24-privacy-safe-outcomes-and-capability-health
    provides: bounded health observations and versioned cooldown policy
provides:
  - deterministic one-item advisory selection with semantic fingerprints
  - private suppression state and immutable correction proposals
affects: [25-02, 25-03, 25-04, steward-cli, startup-pointer]
tech-stack:
  added: []
  patterns: [filter-before-rank, semantic-sha256-identity, atomic-private-json]
key-files:
  created:
    - src/steward/suggestion.mjs
    - src/steward/state.mjs
    - tests/router.steward-suggestion.test.mjs
    - tests/router.steward-state.test.mjs
  modified: []
key-decisions:
  - "Suggestion identity hashes only bounded semantic observation fields; wall-clock and presentation values remain state beside the fingerprint."
  - "Correction records are immutable content-addressed proposals under the steward root and report routing unchanged."
patterns-established:
  - "Filter all observations before an explicit total-order sort and expose only index zero."
  - "Fail closed on corrupt optional interaction state while retaining 0700 directories and durable atomic 0600 files."
requirements-completed: [UX-01, UX-02, UX-03, UX-04, UX-05, UX-06, UX-07, UX-08, UX-09]
coverage:
  - id: D1
    description: "Deterministic privacy-bounded suggestion policy selects at most one actionable observation."
    requirement: UX-03
    verification:
      - kind: unit
        ref: "tests/router.steward-suggestion.test.mjs"
        status: pass
    human_judgment: false
  - id: D2
    description: "Local dismiss, snooze, cooldown, and correction state persists without routing mutation."
    requirement: UX-05
    verification:
      - kind: integration
        ref: "tests/router.steward-state.test.mjs"
        status: pass
      - kind: integration
        ref: "tests/router.health.privacy.test.mjs"
        status: pass
    human_judgment: false
duration: 12min
completed: 2026-07-28
status: complete
---

# Phase 25 Plan 01: Advisory Policy and Private State Summary

**Deterministic one-item advisory selection with stable semantic identity and atomic private interaction state**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-28T15:20:00Z
- **Completed:** 2026-07-28T15:32:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Filters malformed, stale, low-confidence, non-actionable, and suppressed observations before deterministic ranking.
- Projects exactly one bounded suggestion with aggregate evidence, fixed benefit/risk/action tokens, and clock-independent SHA-256 identity.
- Persists idempotent dismissal, bounded snooze, cooldown, and immutable correction proposals with restrictive permissions and no routing authority.

## Task Commits

1. **Task 1 RED: suggestion policy tests** - `8017bfc`
2. **Task 1 GREEN: deterministic suggestion policy** - `8f0f7f6`
3. **Task 2 RED: steward state tests** - `81f2284`
4. **Task 2 GREEN: private interaction store** - `f397a7b`

## Files Created/Modified

- `src/steward/suggestion.mjs` - bounded eligibility, total ordering, projection, fingerprint, and startup metadata.
- `src/steward/state.mjs` - locked atomic interaction state and immutable correction proposal persistence.
- `tests/router.steward-suggestion.test.mjs` - selection, privacy, suppression, identity, and validation coverage.
- `tests/router.steward-state.test.mjs` - permissions, atomicity, corruption, lock, and isolation coverage.

## Decisions Made

- Confidence eligibility uses the existing 8500 basis-point relationship confidence floor.
- Snooze expiry is bounded to 30 days; cooldown reuses `COOLDOWN_MS`.
- No shared storage abstraction or dependency was added; the proven health-store durability pattern was copied into the isolated steward module.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 25-02 can bind preview-only drafts to semantic suggestion fingerprints and persist them beneath the existing steward root.
- Plan 25-03 can call `selectSuggestion` and `createStewardStore` without gaining routing mutation authority.

## Self-Check: PASSED

- All four created files exist.
- Commits `8017bfc`, `81f2284`, `8f0f7f6`, and `f397a7b` exist.
- Focused plan tests and Phase 24 privacy regression pass.

---
*Phase: 25-advisory-stewardship-and-guarded-drafts*
*Completed: 2026-07-28*
