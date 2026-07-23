---
phase: 15-context-capsules-and-workflow-state-recovery
plan: 01
subsystem: context
tags: [capsule, canonicalization, atomic-persistence, privacy, recovery]
requires:
  - phase: 14-deterministic-mapping-activation-and-rollback
    provides: deterministic canonical serialization and durable atomic activation patterns
provides:
  - Versioned bounded privacy-safe context capsule contract
  - Deterministic workflow identity and safe artifact references
  - Atomic active capsule storage with one last-known-good recovery copy
affects: [15-02, 15-03, workflow-recovery, prompt-routing]
tech-stack:
  added: []
  patterns: [strict allowlist projection, field-addressed private diagnostics, active-plus-LKG atomic persistence]
key-files:
  created: [src/context/capsule.mjs, tests/router.context-capsule.test.mjs]
  modified: []
key-decisions:
  - "Workflow identity hashes canonical scope, goal identity, position, and status while excluding human-readable labels."
  - "Capsule storage retains only active and one validated last-known-good copy; corrupt bytes are never reflected in diagnostics."
patterns-established:
  - "Capsule projection is allowlist-only before validation, sorting, bounding, or persistence."
  - "Owned filesystem persistence rejects symlink roots and targets before durable temporary writes and atomic rename."
requirements-completed: [CTX-01]
coverage:
  - id: D1
    description: Deterministic versioned capsule with observable artifact and blocker bounds
    requirement: CTX-01
    verification:
      - kind: unit
        ref: tests/router.context-capsule.test.mjs#capsule canonicalization is deterministic bounded and identity is label-independent
        status: pass
    human_judgment: false
  - id: D2
    description: Privacy-safe atomic active and last-known-good capsule persistence
    requirement: CTX-01
    verification:
      - kind: integration
        ref: tests/router.context-capsule.test.mjs#active and one LKG capsule persist privately and recover only corrupt active bytes
        status: pass
    human_judgment: false
duration: 12min
completed: 2026-07-16
status: complete
---

# Phase 15 Plan 01: Context Capsule Contract Summary

**Deterministic privacy-safe resumability capsules with explicit bounds, stable identity, and crash-safe active/LKG persistence**

## Performance

- **Duration:** 12 min
- **Completed:** 2026-07-16
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added strict allowlist canonicalization, stable workflow identity, safe relative references, freshness witnesses, and machine-readable truncation metadata.
- Added stable private validation diagnostics that exclude source values, prompt history, credentials, document bodies, transcripts, and tool output.
- Added restrictive, durable, atomic active storage with exactly one validated last-known-good recovery capsule and symlink containment guards.

## Task Commits

1. **Task 1: Specify and implement the canonical bounded capsule** - `2599131` (RED), `e3a8e2d` (GREEN)
2. **Task 2: Add atomic active and last-known-good persistence** - `ac5a538` (RED), `b222299` (GREEN)

## Files Created/Modified

- `src/context/capsule.mjs` - Capsule schema, canonicalization, identity, validation, bounds, and active/LKG persistence.
- `tests/router.context-capsule.test.mjs` - CTX-01 privacy, schema, deterministic bounds, unsafe-path, and owned-filesystem matrix.

## Decisions Made

- Human-readable goal summaries are excluded from stable workflow identity so label edits cannot create false workflow discontinuity.
- Missing active state does not revive LKG; LKG is consulted only when the active file exists but is corrupt.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Security] Rejected a symlinked owned root**
- **Found during:** Task 2
- **Issue:** Guarding only active/LKG leaf paths allowed an owned root symlink to redirect writes outside the explicit root.
- **Fix:** Added root-level lstat guards for save and load.
- **Verification:** Added a failing filesystem test, then confirmed no file was written through the symlink.
- **Committed in:** `b222299`

**Total deviations:** 1 auto-fixed (1 Rule 2)
**Impact on plan:** Required filesystem containment hardening; no scope expansion.

## Issues Encountered

The repository-wide parallel suite passed 504/509 tests. Four failures are sandbox `EPERM` writes to live `~/.claude/router` fixtures, and one pre-existing lifecycle watcher test exceeded its 2000 ms polling deadline under parallel load. The focused capsule suite passes 6/6; no failure references the new module.

## User Setup Required

None - no external services or dependencies were added.

## Next Phase Readiness

Plans 15-02 and 15-03 can consume the stable capsule schema, identity, structured diagnostics, and trusted active/LKG load boundary.

## Self-Check: PASSED

- Created files exist.
- All four TDD task commits exist.
- Focused capsule matrix passes 6/6.

---
*Phase: 15-context-capsules-and-workflow-state-recovery*
*Completed: 2026-07-16*
