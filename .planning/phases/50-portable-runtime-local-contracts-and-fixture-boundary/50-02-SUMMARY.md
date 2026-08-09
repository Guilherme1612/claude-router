---
phase: 50-portable-runtime-local-contracts-and-fixture-boundary
plan: 02
subsystem: registry
tags: [node-esm, capability-contracts, eligibility, coverage, claude, codex]

requires:
  - phase: 50-01
    provides: anonymous isolated Claude and Codex inventory scenarios and portable fixture materialization
provides:
  - bounded typed capability metadata with declared-first normalization
  - fail-closed independent authority and execution-critical eligibility reasons
  - exactly-once eight-class registry coverage with additive audit output
affects: [phase-51-semantic-retrieval, phase-52-composition, phase-54-evaluation, phase-55-runtime-parity]

tech-stack:
  added: []
  patterns: [declared-first typed contracts, one coverage classifier, additive audit projection, fail-closed critical unknowns]

key-files:
  created: []
  modified:
    - src/registry/schema.mjs
    - src/registry/contract.mjs
    - src/registry/eligibility.mjs
    - src/registry/build.mjs
    - src/coverage/audit.mjs
    - src/adapters/claude.mjs
    - tests/router.v18-contracts.test.mjs

key-decisions:
  - "Retrieval semantics may be inferred, but effects, authority, risk, dependencies, and permissions require declared or structural evidence."
  - "Recommendation-only records with unknown execution-critical gates remain visible and classify as invalid with preserved reasons."
  - "Registry coverage is owned by classifyCoverage; auditCoverage projects it without reimplementing classification."

patterns-established:
  - "Portable capability truth: canonical typed defaults plus symbolic logical roots and relative paths."
  - "Runtime parity: discovered equals classified within each runtime, never Claude count equals Codex count."

requirements-completed: [CVRG-02, CVRG-03, CVRG-04]

coverage:
  - id: D1
    description: "Every assembled capability has deterministic typed semantic, input, effect, risk, authority, composition, cost, freshness, and evidence metadata."
    requirement: CVRG-02
    verification:
      - kind: integration
        ref: "tests/router.v18-contracts.test.mjs#CVRG-02/CVRG-03 portable bounded typed capability truth"
        status: pass
    human_judgment: false
  - id: D2
    description: "Unknown execution-critical effects, authority, dependencies, and risk fail closed independently while records remain inspectable."
    requirement: CVRG-04
    verification:
      - kind: integration
        ref: "tests/router.v18-contracts.test.mjs#CVRG-04 unknown execution-critical fields"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every retained record receives exactly one allowed coverage class with per-runtime completeness and no unclassified records."
    requirement: CVRG-03
    verification:
      - kind: integration
        ref: "tests/router.v18-contracts.test.mjs#CVRG-02/CVRG-05 exactly-once classification"
        status: pass
      - kind: integration
        ref: "rtk node --test --test-concurrency=1 tests/*.test.mjs (1565 passed)"
        status: pass
    human_judgment: false

duration: 35min
completed: 2026-08-09
status: complete
---

# Phase 50 Plan 02: Typed Capability Coverage Summary

**Declared-first portable capability contracts now fail closed on critical unknowns and classify every retained Claude/Codex record exactly once.**

## Performance

- **Duration:** 35 min
- **Started:** 2026-08-09T13:42:00Z
- **Completed:** 2026-08-09T14:17:11Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Added bounded deterministic semantic, input, effect, risk, authority, composition, cost, coverage, and source-freshness metadata without a schema dependency or second registry.
- Preserved declared-first authority and made unknown effects, authority, dependencies, and risk independently non-executable with stable reasons.
- Added one ordered eight-class coverage owner and an additive record-level audit projection with per-runtime completeness and `unclassified` diagnostics.
- Passed 23 focused tests and the full serial repository suite: 1,565 tests, 0 failures, 0 skips.

## Task Commits

Each task was committed atomically:

1. **Task 1: Specify typed metadata, fail-closed unknowns, and exactly-once coverage** — `c8cf2ab` (test)
2. **Task 2: Normalize bounded semantic contracts without widening authority** — `af7b505` (feat)
3. **Task 3: Classify every retained record once and report exhaustive coverage** — `4a3dcfb` (feat)

## Files Created/Modified

- `src/adapters/claude.mjs` — carries bounded declared capability metadata through shared Claude/Codex normalization.
- `src/registry/schema.mjs` — validates and canonicalizes typed portable capability metadata.
- `src/registry/contract.mjs` — derives versioned declared-first contract evidence without widening execution authority.
- `src/registry/eligibility.mjs` — evaluates authority as an independent fail-closed gate.
- `src/registry/build.mjs` — owns `COVERAGE_CLASSES` and `classifyCoverage()` and stamps retained records.
- `src/coverage/audit.mjs` — projects additive record-level, per-class, per-runtime, and unclassified coverage.
- `tests/helpers/inventory-fixture.mjs` — supplies explicit safe and unknown critical contract variants.
- `tests/router.v18-contracts.test.mjs` — covers typed truth, adversarial inference, fail-closed unknowns, parity, and exactly-once coverage.
- `tests/router.contracts.test.mjs` — declares explicit safe fixture metadata under the stricter contract.
- `tests/router.contract-eligibility.test.mjs` — preserves legacy eligibility expectations with explicit authority evidence.
- `tests/router.registry-build.test.mjs` — asserts every assembled record owns a valid coverage class.

## Decisions Made

- Kept the outer capability schema compatible and changed only bounded canonical defaults and contract policy semantics.
- Classified critical recommendation-only unknowns as `invalid`; `unavailable` remains reserved for missing/disabled targets and invocations.
- Kept audit behavior backward compatible by using the registry projection only when a registry is supplied; manifest/mode-map callers retain their existing path.

## Deviations from Plan

### Auto-fixed Issues

**1. Existing compatibility fixtures needed explicit safe execution evidence**
- **Found during:** Task 2
- **Issue:** Stricter fail-closed defaults correctly made older implicit-safe fixture records recommendation-only.
- **Fix:** Updated existing contract and eligibility tests to declare the safe authority/effect metadata they intend to exercise instead of weakening production gates.
- **Files modified:** `tests/router.contracts.test.mjs`, `tests/router.contract-eligibility.test.mjs`
- **Verification:** Focused contract/eligibility tests and full serial suite pass.
- **Committed in:** `af7b505`

**2. Existing registry-build suite needed a direct coverage invariant**
- **Found during:** Task 3
- **Issue:** The new assembled-record field required an assertion in the existing registry integration test to guard all normal builders.
- **Fix:** Added the allowed-class assertion to `tests/router.registry-build.test.mjs`.
- **Files modified:** `tests/router.registry-build.test.mjs`
- **Verification:** Focused registry suite and full serial suite pass.
- **Committed in:** `4a3dcfb`

---

**Total deviations:** 2 auto-fixed compatibility/test-coverage items.
**Impact on plan:** Both changes preserve stricter production behavior and add regression evidence; no scope or dependency expansion.

## Issues Encountered

- The executor stalled during Task 3 closeout after producing valid uncommitted code. Safe-resume inspection confirmed the diff was scoped and the focused suite passed; the orchestrator committed the preserved task and independently ran the full serial suite.

## User Setup Required

None - no external services or dependencies were added.

## Known Stubs

None.

## Next Phase Readiness

- Phase 51 can rank against typed semantic contracts while keeping authority, risk, and availability as independent hard gates.
- Phase 54 has anonymous per-runtime completeness fixtures suitable for evaluation baselines.
- No open implementation blocker remains from Phase 50.

## Self-Check: PASSED

- Focused Phase 50 suite: 23 passed, 0 failed.
- Full serial repository suite: 1,565 passed, 0 failed, 0 skipped.
- Diff scope and whitespace checks passed.
- No private live-home path entered fixtures, reports, or committed output.

---
*Phase: 50-portable-runtime-local-contracts-and-fixture-boundary*
*Completed: 2026-08-09*
