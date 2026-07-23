---
phase: 20-close-gap-evo-05-add-production-trigger-for-canary-controlle
plan: 03
subsystem: cli/evolution
tags: [canary, cli, router-control, production-trigger, D-04, D-05, D-06, stdlib, node-test]

# Dependency graph
requires:
  - phase: 20-close-gap-evo-05-add-production-trigger-for-canary-controlle
    plan: 01
    provides: createPersistentEvidenceStore (evidence.mjs) + its window({project_id}) API, evolution/* deployed bundle entries
  - phase: 20-close-gap-evo-05-add-production-trigger-for-canary-controlle
    plan: 02
    provides: buildCandidateCalibrationRoute + buildKnownGoodCalibrationRoute (src/evolution/candidate-calibration-route.mjs — the D-04 shared helper), compatible() exported from src/prompt/compile-index.mjs (D-06)
  - phase: 17-compiled-prompt-routing-and-safe-evolution
    provides: canary-controller (proposeCandidate/evaluateCandidate/applyCanaryDecision + REGISTRY_PUBLICATION), perf-measure (CALIBRATION_CORPUS/evaluateCalibrationCorpus/measureRoutes/assessCalibration), activate.mjs (recoverActiveVersion/previewRollback/executeRollback)
provides:
  - router-control `canary {status|promote|rollback}` subcommands — the operator-driven trigger surface for the canary controller (third of the three EVO-05 surfaces, after the watcher automatic trigger in 20-02)
  - applyCanaryDecision `rollback_reason` parameter (T-20-16) so canary rollback carries reason='canary_rollback' distinct from operator_rollback
affects: [EVO-05 closure, future operator runbooks]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Operator canary CLI mirrors the watcher's D-04/D-05 derivation verbatim (same buildCandidateCalibrationRoute/buildKnownGoodCalibrationRoute + evaluateCalibrationCorpus + assessCalibration + isSafetyFix predicate) so the CLI and the automatic watcher trigger reach identical promotion decisions
    - Canary rollback is deliberately NARROWER than the existing registry `rollback` verb — destination=known_good_version only (recoverActiveVersion), reason='canary_rollback'; the existing verb's reason='operator_rollback' + arbitrary valid destination is untouched
    - All canary publication mutation flows exclusively through applyCanaryDecision -> REGISTRY_PUBLICATION -> activate.mjs; router-control.mjs never writes active.json directly
    - --execute gated by exact candidate.id/destination confirmation (same V4 access-control pattern as the existing rollback verb), dry-run returns canonical preview

key-files:
  created:
    - tests/router.router-control-canary.test.mjs
  modified:
    - src/cli/router-control.mjs
    - src/evolution/canary-controller.mjs

key-decisions:
  - "Reuse the 20-02 D-04 helper (buildCandidateCalibrationRoute/buildKnownGoodCalibrationRoute) for the CLI promote path so the operator-driven trigger and the watcher automatic trigger derive demonstrated_benefit identically."
  - "canary rollback destination is known_good_version ONLY (not an arbitrary positional) — narrower than the registry `rollback` verb, matching the must_have."
  - "Added rollback_reason param to applyCanaryDecision (Rule 2 / T-20-16) so the canary rollback branch emits reason='canary_rollback' instead of the generic 'rollback'."

patterns-established:
  - "Pattern: operator CLI surface reuses watcher derivation helpers verbatim — one canary decision path, two trigger surfaces (automatic + operator)."
  - "Pattern: canary subcommands delegate publication mutation only through applyCanaryDecision; router-control.mjs stays read-only w.r.t. active.json."

requirements-completed: [EVO-05]

coverage:
  - id: D1
    description: "canary status subcommand — prints active version, known-good version, and evidence window (sufficient, sample_count, weighted_samples, source_evidence_fingerprint)"
    requirement: "EVO-05"
    verification:
      - kind: integration
        ref: "tests/router.router-control-canary.test.mjs#Test 1: canary status (empty evidence window) + Test 2: canary status (seeded evidence window)"
        status: pass
    human_judgment: false
  - id: D2
    description: "canary promote — dry-run preview + --execute with exact candidate.id confirmation, running evaluateCandidate + applyCanaryDecision promote branch via the D-04/D-05 derivation (same as the watcher)"
    requirement: "EVO-05"
    verification:
      - kind: integration
        ref: "tests/router.router-control-canary.test.mjs#Test 3: canary promote dry-run + Test 4: canary promote execute with confirmation (and confirmation mismatch)"
        status: pass
    human_judgment: false
  - id: D3
    description: "canary rollback — delegates through applyCanaryDecision rollback branch to known_good_version only with reason='canary_rollback' (distinct from operator_rollback); no arbitrary positional destination"
    requirement: "EVO-05"
    verification:
      - kind: integration
        ref: "tests/router.router-control-canary.test.mjs#Test 5: canary rollback delegates through applyCanaryDecision with reason=canary_rollback + Test 6: canary rollback destination is known_good_version only"
        status: pass
    human_judgment: false

# Metrics
duration: ~20min
completed: 2026-07-22
status: complete
---

# Phase 20: Close gap EVO-05 — Plan 03 Summary

**Operator-driven `canary {status|promote|rollback}` CLI surface in router-control that reuses the 20-02 watcher derivation helpers verbatim, closing the third EVO-05 trigger surface.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-22T14:43Z
- **Completed:** 2026-07-22T14:56Z
- **Tasks:** 2
- **Files modified:** 3 (1 new test file, 2 source)

## Accomplishments
- `router-control canary status` — reads active.json pointer + recoverActiveVersion known-good + the persistent evidence window (sufficient, sample_count, weighted_samples, source_evidence_fingerprint).
- `router-control canary promote` — builds the 6 gates (safety from reconciliation disposition, privacy from window observations, quality/context_budget/latency from assessCalibration, compatibility from the standalone `compatible()` D-06 import), derives demonstrated_benefit via the SAME D-05 predicate as the watcher (strict-improve on quality OR context_budget, latency hard gate, safety_correction on parity when the report is a safety fix, neutral otherwise), dry-run preview + `--execute --confirm <candidate.id>` exact-confirmation gate, delegates through applyCanaryDecision.
- `router-control canary rollback` — destination=known_good_version ONLY (recoverActiveVersion), reason='canary_rollback' via applyCanaryDecision rollback branch; narrower than the existing registry `rollback` verb (reason='operator_rollback', any valid destination).
- Hot path `src/context/prompt-route.mjs` unchanged — canary wiring imports none of it.

## Task Commits

Each task was committed atomically (TDD: RED -> GREEN):

1. **Task 1: CLI canary subcommands integration test (status/promote/rollback)** - `d62a7ce` (test — RED, 6 failing tests)
2. **Task 2: Add canary {status|promote|rollback} subcommands to router-control.mjs** - `6e8c33e` (feat — GREEN)

_Note: the SUMMARY was authored by the orchestrator under the "close out manually" recovery path after the executor hit a session usage limit (429) after committing both tasks but before writing SUMMARY.md. The committed work is unchanged — this SUMMARY describes the committed diff, not a re-execution._

## Files Created/Modified
- `tests/router.router-control-canary.test.mjs` - 6 integration tests: status (empty + seeded), promote dry-run, promote execute + confirmation mismatch, rollback reason='canary_rollback', rollback destination=known_good_version only.
- `src/cli/router-control.mjs` - new `canary` command dispatch (status/promote/rollback subcommands); imports proposeCandidate/evaluateCandidate/applyCanaryDecision, createPersistentEvidenceStore, assessCalibration/CALIBRATION_CORPUS/evaluateCalibrationCorpus/measureRoutes, buildCandidateCalibrationRoute/buildKnownGoodCalibrationRoute, compatible/COMPILED_INDEX_COMPATIBILITY; updated usage() string; isSafetyFix helper mirroring src/registry/watcher.mjs:35-39.
- `src/evolution/canary-controller.mjs` - added `rollback_reason` param to applyCanaryDecision (defaults to 'rollback' for back-comat), so canary rollback passes reason='canary_rollback'.

## Decisions Made
- Reuse the 20-02 D-04 helper for the CLI promote path so operator and watcher triggers reach identical promotion decisions.
- canary rollback destination is known_good_version only — deliberately narrower than the registry `rollback` verb.
- Added `rollback_reason` to applyCanaryDecision rather than hardcoding, so the existing rollback call sites keep their default 'rollback' reason and only the canary path overrides it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical / T-20-16] Added rollback_reason parameter to applyCanaryDecision**
- **Found during:** Task 2 (canary rollback wiring)
- **Issue:** The plan's must_have requires `canary rollback` to use `reason='canary_rollback'`, but applyCanaryDecision's rollback branch hardcoded `reason: 'rollback'`. Without a parameter, the canary rollback reason would be indistinguishable from any other rollback.
- **Fix:** Added a `rollback_reason` param (default `'rollback'` for back-compat) and the canary rollback subcommand passes `reason: 'canary_rollback'` via the activation context / direct arg.
- **Files modified:** src/evolution/canary-controller.mjs, src/cli/router-control.mjs
- **Verification:** Test 5 asserts the rollback delegates through applyCanaryDecision with reason=canary_rollback (distinct from operator_rollback).
- **Committed in:** 6e8c33e (Task 2 commit)

**2. [Rule 1 - Correctness] Fixed test VERSION_ID constants to match /^v1-[a-f0-9]{16}$/**
- **Found during:** Task 2 (test fixtures)
- **Issue:** Test VERSION_ID constants did not match the canonical `v1-<16 hex>` shape enforced by the real validator.
- **Fix:** Aligned the test constants with the VERSION_ID regex.
- **Files modified:** tests/router.router-control-canary.test.mjs
- **Verification:** Tests 1-6 pass against the real validator.
- **Committed in:** 6e8c33e (Task 2 commit)

**3. [Rule 3 - Blocking / T-20-25] D-04 helper temp ownedRoot cleanup in finally**
- **Found during:** Task 2 (promote path)
- **Issue:** buildCandidateCalibrationRoute/buildKnownGoodCalibrationRoute allocate per-fixture temp ownedRoots; without cleanup on every path (including throw) they leak.
- **Fix:** Wrapped helper use in try/finally calling `candidateCtx?.cleanup?.()` / `knownGoodCtx?.cleanup?.()`.
- **Files modified:** src/cli/router-control.mjs
- **Verification:** Promote tests pass; temp ownedRoots cleaned on both success and throw paths.
- **Committed in:** 6e8c33e (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 missing critical, 1 correctness, 1 blocking)
**Impact on plan:** All auto-fixes necessary for the must_have reason='canary_rollback' contract, validator conformance, and temp-resource cleanup. No scope creep — the CLI surface matches the plan exactly.

## Issues Encountered
- Executor hit a provider session usage limit (429) after committing both tasks but before writing SUMMARY.md. Recovery: orchestrator "close out manual" path — verified the committed tests pass (6/6) and authored this SUMMARY from the committed diff. No code re-executed; committed work unchanged.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three EVO-05 trigger surfaces now exist: 20-01 foundation (evidence store + bridge + bundle), 20-02 automatic watcher trigger, 20-03 operator CLI surface.
- Phase 20 ready for goal verification against EVO-05 must_haves.

---
*Phase: 20-close-gap-evo-05-add-production-trigger-for-canary-controlle*
*Completed: 2026-07-22*