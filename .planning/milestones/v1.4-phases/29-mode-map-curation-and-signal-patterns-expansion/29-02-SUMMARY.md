---
phase: 29-mode-map-curation-and-signal-patterns-expansion
plan: 02
subsystem: routing
tags: [node-test, bm25, mode-map, validation, coverage-audit]
requires:
  - phase: 29-mode-map-curation-and-signal-patterns-expansion
    provides: Wave 0 v2/v3 schema, collision, fixture injection, and safety contracts
provides:
  - shared v2/v3 contains-pattern normalization and collision lint
  - read-only manifest and mode-map injection through inspectDecision
  - canonical pattern diagnostics at the build coverage boundary
affects: [29-03, 29-04, mode-map-curation, calibration]
tech-stack:
  added: []
  patterns: [normalize once at trust boundary, fixture objects through production inspector, diagnostic pass-through]
key-files:
  created: []
  modified:
    - /Users/guilherme/.claude/hooks/router.mjs
    - tests/router.mjs.snapshot
    - build-manifest.mjs
    - src/coverage/audit.mjs
    - tests/router.coverage-audit.test.mjs
key-decisions:
  - "Keep v2 maps fully readable; enforce the six-pattern upper bound and collision declarations when schema v3 opts into the new contract."
  - "Pass canonical pattern diagnostics into the audit instead of copying normalization or collision logic."
patterns-established:
  - "All signal consumers use normalizeSignalPattern values; raw DSL objects never enter BM25 text."
  - "inspectDecision fixture objects bypass live reads while retaining the production score and guard pipeline."
requirements-completed: [MAP-03, SIG-01, SIG-02, SIG-03]
coverage:
  - id: D1
    description: "Backward-compatible contains normalization, pattern caps, malformed diagnostics, and explicit collision groups"
    requirement: SIG-02
    verification:
      - kind: unit
        ref: "tests/router.mode-map-v3.test.mjs"
        status: pass
    human_judgment: false
  - id: D2
    description: "Read-only in-memory manifest and mode-map fixtures through production inspection"
    requirement: MAP-03
    verification:
      - kind: integration
        ref: "tests/router.mode-map-curation.test.mjs#fixture routing is isolated from live manifest and mode-map paths"
        status: pass
    human_judgment: false
  - id: D3
    description: "Coverage audit parity for canonical pattern diagnostics without weakening missing-MCP guards"
    requirement: SIG-03
    verification:
      - kind: integration
        ref: "tests/router.coverage-audit.test.mjs"
        status: pass
    human_judgment: false
duration: 8min
completed: 2026-07-29
status: complete
---

# Phase 29 Plan 02: Shared Pattern Path and Fixture Seam Summary

**One contains-only v2/v3 normalizer now feeds BM25, validation, proposals, injected inspection fixtures, and build-audit diagnostics**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-29T15:50:00Z
- **Completed:** 2026-07-29T15:58:00Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Added canonical string/object `contains` normalization, deterministic malformed/cap diagnostics, and explicit same-group collision handling.
- Added two optional, read-only fixture objects to `inspectDecision` without another router, score path, cache write, or telemetry path.
- Reused live validator results at the coverage boundary so build reports share pattern diagnostics while retaining deterministic target and missing-MCP classification.

## Task Commits

1. **Task 1: Normalize and validate patterns once** - `061f86f` (feat)
2. **Task 2: Inject fixture objects through the existing inspector** - `df96568` (feat)
3. **Task 3: Keep build audit diagnostics in parity** - `e7c8d31` (feat)

## Files Created/Modified

- `/Users/guilherme/.claude/hooks/router.mjs` - Installed shared normalizer, validation/lint, normalized corpus/proposals, and object injection.
- `tests/router.mjs.snapshot` - Reproducible installer source synchronized with the installed hook.
- `build-manifest.mjs` - Supplies canonical live pattern diagnostics to coverage generation.
- `src/coverage/audit.mjs` - Deterministically incorporates canonical pattern diagnostics.
- `tests/router.coverage-audit.test.mjs` - Covers cap, malformed-pattern, and collision diagnostic parity.

## Decisions Made

- Kept v2 compatibility exact by applying the new upper cap and collision declaration contract to schema v3 maps; non-empty v2 strings still normalize identically.
- Used `Object.hasOwn` so explicitly supplied fixture objects take precedence, while omitted values preserve current file loading.
- Passed only pattern diagnostics into the audit; existing typed target classification remains local and is not duplicated.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Synchronized the repository installer snapshot**
- **Found during:** Task 1
- **Issue:** The requested installed hook lives outside Git, so its implementation could not be committed or reproduced by installation.
- **Fix:** Synchronized the verified installed hook to the existing `tests/router.mjs.snapshot` installer source.
- **Files modified:** `tests/router.mjs.snapshot`
- **Verification:** Installed hook and snapshot are byte-identical after Tasks 1 and 2.
- **Committed in:** `061f86f`, `df96568`

**2. [Rule 2 - Missing Critical] Wired the canonical validator at the builder seam**
- **Found during:** Task 3
- **Issue:** `auditCoverage` could accept diagnostics, but publication would not gain parity unless the builder supplied them.
- **Fix:** Loaded the installed validator in `build-manifest.mjs` and passed its pattern-only diagnostics into the audit.
- **Files modified:** `build-manifest.mjs`
- **Verification:** Coverage and route-target suites pass, including strict builder cases.
- **Committed in:** `e7c8d31`

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** Both changes are required for reproducible installation and actual build-time parity; no new parser, dependency, or routing subsystem was added.

## Issues Encountered

- The live v2 map contains entries above the new cap and an existing duplicate. Backward compatibility requires those remain readable until Plan 29-03 migrates curated data to schema v3.
- The broader curation RED suite still has its planned hard-negative data failure; Plan 29-03 owns that route-data correction.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 29-03 can migrate and curate v3 entries against the shared normalizer and injected fixture path.
- Plan 29-04 can calibrate thresholds through the unchanged production scorer.

## Self-Check: PASSED

- Installed router, installer snapshot, builder, audit, parity test, and summary exist.
- Task commits `061f86f`, `df96568`, and `e7c8d31` exist.
- Full plan verification passes 40/40 tests.

---
*Phase: 29-mode-map-curation-and-signal-patterns-expansion*
*Completed: 2026-07-29*
