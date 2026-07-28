---
phase: 25-advisory-stewardship-and-guarded-drafts
plan: 03
subsystem: cli
tags: [node, canonical-envelope, exact-approval, privacy]
requires:
  - phase: 25-advisory-stewardship-and-guarded-drafts
    provides: deterministic suggestions, private interaction state, and approval-gated drafts from Plans 25-01/02
provides:
  - one bounded canonical suggestion CLI family
  - exact-fingerprint inspect, dismiss, snooze, and correction flows
  - proposal-first draft creation with complete post-approval preview
affects: [25-04, steward-cli, terminal-ux]
tech-stack:
  added: []
  patterns: [single-command-family, dependency-injected-domain-seams, approval-before-preview]
key-files:
  created:
    - tests/router.steward-cli.test.mjs
  modified:
    - src/cli/router-control.mjs
key-decisions:
  - "Suggestion actions re-select current policy state before accepting an exact fingerprint."
  - "Draft CLI output strips the internal approval binding to one opaque token and reveals the complete preview only after approved creation."
patterns-established:
  - "Canonical advisory projection keeps aggregate overview separate from exactly one suggestion detail."
  - "The suggestion controller delegates all persistence to steward state and draft modules."
requirements-completed: [UX-01, UX-02, UX-03, UX-04, UX-05, UX-06, UX-07, UX-08, UX-09]
coverage:
  - id: D1
    description: "One canonical suggestion family exposes bounded empty, detail, dismiss, snooze, and correction states."
    requirement: UX-05
    verification:
      - kind: integration
        ref: "tests/router.steward-cli.test.mjs#suggestion interactions"
        status: pass
    human_judgment: false
  - id: D2
    description: "Draft creation remains proposal-first and exact-approval-gated with complete preview only after the write."
    requirement: UX-07
    verification:
      - kind: integration
        ref: "tests/router.steward-cli.test.mjs#suggestion draft"
        status: pass
    human_judgment: false
  - id: D3
    description: "No suggestion dashboard, list, install, publish, or maintenance action is reachable."
    requirement: UX-09
    verification:
      - kind: integration
        ref: "tests/router.steward-cli.test.mjs#forbidden actions"
        status: pass
    human_judgment: false
duration: 3min
completed: 2026-07-28
status: complete
---

# Phase 25 Plan 03: Canonical Suggestion CLI Summary

**One canonical suggestion command family with exact-fingerprint interactions and approval-gated, preview-only draft creation**

## Performance

- **Duration:** 3 min
- **Started:** 2026-07-28T15:40:49Z
- **Completed:** 2026-07-28T15:43:32Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added deterministic canonical empty and one-item suggestion projections with the approved terminal copy.
- Added strict dismiss, snooze, and correction actions that revalidate the current fingerprint and preserve routing authority.
- Added bounded draft proposals and exact approval execution that writes only beneath the steward draft root before returning the complete preview.

## Task Commits

1. **Task 1 RED: suggestion interaction tests** - `7d370a2`
2. **Task 1 GREEN: bounded suggestion interactions** - `fc8158e`
3. **Task 2 RED: guarded draft CLI tests** - `2f6ba4d`
4. **Task 2 GREEN: exact-approval draft flow** - `b1fee65`

## Files Created/Modified

- `src/cli/router-control.mjs` - strict suggestion grammar, canonical projections, rendering, and steward dependency seams.
- `tests/router.steward-cli.test.mjs` - end-to-end interaction, validation, privacy, authority, and approval-order coverage.

## Decisions Made

- Reused `--confirm` for the exact current suggestion fingerprint and added only `--until`, `--proposal-json`, and `--approval`.
- Kept observations and remediation payload production behind controller dependency seams; the CLI does not add a second health or draft engine.
- Exposed the opaque approval token but not the internal approval-binding structure or complete remediation fields before execution.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None.

## Threat Flags

| Flag | File | Description |
|---|---|---|
| threat_flag: local-file-write | `src/cli/router-control.mjs` | Exact-approved draft execution reaches the existing private steward draft writer; tests prove draft-only authority and protected-byte preservation. |

## User Setup Required

None - no dependency or external service configuration was added.

## Next Phase Readiness

- Plan 25-04 can expose the already-bounded startup pointer without duplicating suggestion detail.
- The focused and adjacent regression slice passes 66/66.

## Self-Check: PASSED

- Both changed files exist.
- Commits `7d370a2`, `fc8158e`, `2f6ba4d`, and `b1fee65` exist.
- Focused steward, control, health privacy, and health administration suites pass.

---
*Phase: 25-advisory-stewardship-and-guarded-drafts*
*Completed: 2026-07-28*
