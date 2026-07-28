---
phase: 25-advisory-stewardship-and-guarded-drafts
plan: 02
subsystem: advisory
tags: [node, approval-binding, immutable-drafts, privacy]
requires:
  - phase: 25-advisory-stewardship-and-guarded-drafts
    provides: deterministic suggestions and private steward state from Plan 25-01
provides:
  - bounded read-only draft approval proposals
  - fresh exact draft-file-only approval binding
  - immutable private 0600 draft bundles with complete post-approval previews
affects: [25-03, steward-cli, guarded-remediation]
tech-stack:
  added: []
  patterns: [approval-rederivation, content-addressed-private-bundle, post-approval-complete-preview]
key-files:
  created:
    - src/steward/draft.mjs
    - tests/router.steward-draft.test.mjs
  modified: []
key-decisions:
  - "The pre-approval response exposes only exact contained targets, semantic-effect tokens, draft_file_only authority, and the locked approval warning."
  - "Complete remediation details are bound into the approval fingerprint but returned only after fresh exact approval creates the immutable draft."
patterns-established:
  - "Re-derive the complete proposal and approval binding immediately before every permitted write."
  - "Draft authority ends at one content-addressed 0600 JSON artifact beneath the private steward root."
requirements-completed: [UX-01, UX-02, UX-03, UX-04, UX-05, UX-06, UX-07, UX-08, UX-09]
coverage:
  - id: D1
    description: "Missing-capability remediation yields a deterministic bounded read-only approval proposal."
    requirement: UX-06
    verification:
      - kind: unit
        ref: "tests/router.steward-draft.test.mjs#preview"
        status: pass
    human_judgment: false
  - id: D2
    description: "Only fresh exact draft-file-only approval creates an immutable private bundle and reveals the complete preview."
    requirement: UX-07
    verification:
      - kind: integration
        ref: "tests/router.steward-draft.test.mjs#approval"
        status: pass
    human_judgment: false
  - id: D3
    description: "Draft actions do not import installation or publication authority and preserve protected bytes."
    requirement: UX-08
    verification:
      - kind: integration
        ref: "tests/router.steward-draft.test.mjs#import and protected-byte assertions"
        status: pass
    human_judgment: false
duration: 6min
completed: 2026-07-28
status: complete
---

# Phase 25 Plan 02: Guarded Preview-Only Drafts Summary

**Fresh exact approval creates one immutable private draft and only then reveals the complete remediation preview, without install or publication authority**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-28T15:34:24Z
- **Completed:** 2026-07-28T15:40:24Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Produces deterministic, contained, no-write approval proposals for missing-category and missing-dependency suggestions.
- Binds current suggestion identity, complete semantic payload, exact paths, proposal version, and `draft_file_only` authority through the existing approval gate.
- Writes one idempotent content-addressed 0600 draft bundle and returns all UX-07 preview fields only after fresh exact approval.

## Task Commits

1. **Task 1 RED: draft preview tests** - `ee81eb7`
2. **Task 1 GREEN: bounded read-only draft previews** - `e7ba77a`
3. **Task 2 RED: approval and immutable bundle tests** - `08d9ef4`
4. **Task 2 GREEN: fresh approval-gated draft persistence** - `e25e521`
5. **Rule 2 RED: arbitrary payload rejection test** - `77ac634`
6. **Rule 2 GREEN: exact draft schema validation** - `5414f0d`

## Files Created/Modified

- `src/steward/draft.mjs` - bounded proposals, approval re-derivation, immutable bundle persistence, and complete post-approval preview.
- `tests/router.steward-draft.test.mjs` - proposal, containment, approval failure, permission, idempotence, protected-byte, and forbidden-import coverage.

## Decisions Made

- Derived the target path from the canonical suggestion and complete remediation payload so callers cannot nominate an arbitrary write destination.
- Kept timestamps out of immutable bundle identity so repeated approved creation remains idempotent.
- Returned stable blocked results with no complete preview for missing, mismatched, or stale approval.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Rejected arbitrary draft payload fields**
- **Found during:** Post-task trust-boundary review
- **Issue:** Unknown keys were ignored and could enter caller objects without an explicit fail-closed decision.
- **Fix:** Added exact allowlist validation before proposal hashing or approval binding.
- **Files modified:** `src/steward/draft.mjs`, `tests/router.steward-draft.test.mjs`
- **Verification:** Focused and adjacent security suites pass.
- **Committed in:** `77ac634`, `5414f0d`

**Total deviations:** 1 auto-fixed (Rule 2)
**Impact on plan:** Tightened the planned trust boundary without expanding behavior or authority.

## Issues Encountered

- The full serial repository gate completed with 1013 passing, 31 failing, and 1 skipped test. Failures are pre-existing installed-controller readiness/time-out failures in lifecycle and settings suites and do not touch Plan 25-02 files.
- The focused draft suite passes 6/6; the approval, suggestion, steward-state, and privacy regression slice passes 41/41.

## Known Stubs

None.

## User Setup Required

None - no dependency or external service configuration was added.

## Next Phase Readiness

- Plan 25-03 can expose the bounded proposal and pass its approval binding back to `approveDraftCreation`.
- No install, activate, publish, lifecycle, adapter, settings, or routing mutation module is reachable from the draft service.

## Self-Check: PASSED

- Both created files exist.
- Commits `ee81eb7`, `e7ba77a`, `08d9ef4`, `e25e521`, `77ac634`, and `5414f0d` exist.
- Focused and adjacent security regression commands pass.

---
*Phase: 25-advisory-stewardship-and-guarded-drafts*
*Completed: 2026-07-28*
