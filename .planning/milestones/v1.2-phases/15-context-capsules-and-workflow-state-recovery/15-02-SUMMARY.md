---
phase: 15-context-capsules-and-workflow-state-recovery
plan: 02
subsystem: context
tags: [authoritative-sources, bounded-reads, freshness, git, recovery]
requires:
  - phase: 15-context-capsules-and-workflow-state-recovery
    provides: versioned privacy-safe context capsules and canonical witnesses
provides:
  - Exact-path bounded authoritative source adapters
  - Private bounded local git branch and dirty-summary evidence
  - Freshness classification and deterministic minimal refresh evidence
affects: [15-03, workflow-recovery, resume-resolver]
tech-stack:
  added: []
  patterns: [lstat-before-read, exact-reference containment, compact allowlist projection, explicit-source-precedence]
key-files:
  created: [src/context/sources.mjs, tests/router.context-sources.test.mjs]
  modified: []
key-decisions:
  - "Authoritative sources are selected only through fixed paths or contained exact references; recovery never enumerates planning trees."
  - "Git evidence contains only branch identity and bounded status categories, never filenames or diff bodies."
  - "Critical source diagnostics prevent dispatch while optional diagnostics remain bounded degradation evidence."
requirements-completed: [CTX-01, CTX-02]
duration: 15min
completed: 2026-07-16
status: complete
---

# Phase 15 Plan 02: Authoritative Recovery Sources Summary

**Targeted local source adapters now reconcile capsules against compact current truth under explicit read, command, entry, and privacy budgets.**

## Performance

- **Duration:** 15 min
- **Completed:** 2026-07-16
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added exact STATE, ROADMAP, active artifact, execution/checkpoint, design-reference, and local git adapters with stable structured results and SHA-256 witnesses.
- Added fail-closed containment, symlink, non-file, missing, malformed, oversized, detached-head, non-repository, timeout, and output-ceiling classifications.
- Added fresh/stale/corrupt witness comparison and explicit > live > authoritative > capsule minimal evidence precedence with non-dispatchable critical conflicts.
- Proved recovery performs no recursive planning enumeration and does not expose unrelated document content, filenames, diff bodies, or parser internals.

## Task Commits

1. **Task 1: Implement exact-path bounded authoritative readers** - `cd16fa0` (RED), `9a77dbd` (GREEN)
2. **Task 2: Classify freshness and construct minimal refresh evidence** - `d152462` (RED), `9a25463` (GREEN)

## Files Created/Modified

- `src/context/sources.mjs` - Bounded authoritative readers, git adapter, witnesses, snapshot assembly, and refresh-evidence classification.
- `tests/router.context-sources.test.mjs` - Source safety, budget, privacy, git, freshness, precedence, and critical-conflict matrix.

## Decisions Made

- Canonical SHA-256 content witnesses are used for file evidence, while git evidence hashes only its compact private projection.
- Missing design evidence degrades as optional; missing identity-critical state remains unresolved.
- Refresh evidence contains only next-action fields and bounded reason-code diagnostics.

## Deviations from Plan

None - plan executed as specified.

## Issues Encountered

None. The full repository suite passed in this execution environment.

## User Setup Required

None - no external services or dependencies were added.

## Next Phase Readiness

Plan 15-03 can consume bounded authoritative snapshots, freshness verdicts, and minimal non-dispatchable/dispatchable evidence to implement referential-prompt resolution and atomic capsule refresh.

## Verification

- `node --test tests/router.context-sources.test.mjs tests/router.context-capsule.test.mjs` - 13/13 passed.
- `node --test tests/*.test.mjs` - 515/515 passed.

## Self-Check: PASSED

- Both produced files exist.
- All four TDD commits exist in RED/GREEN order.
- Focused and repository-wide verification pass.

---
*Phase: 15-context-capsules-and-workflow-state-recovery*
*Completed: 2026-07-16*
