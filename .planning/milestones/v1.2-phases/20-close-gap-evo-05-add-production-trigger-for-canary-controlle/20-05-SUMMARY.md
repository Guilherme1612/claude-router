---
phase: 20-close-gap-evo-05-add-production-trigger-for-canary-controlle
plan: 05
subsystem: cli/evolution
tags: [canary, cli, router-control, production-trigger, gap-closure, CR-02a, CR-02b, stdlib, node-test]

# Dependency graph
requires:
  - phase: 20-close-gap-evo-05-add-production-trigger-for-canary-controlle
    plan: 03
    provides: canary {status|promote|rollback} subcommands in router-control.mjs + applyCanaryDecision rollback_reason param
provides:
  - Closed CR-02a (canary promote --execute gates on window.sufficient; insufficient evidence returns insufficient_evidence_samples and does NOT call applyCanaryDecision — no surprise rollback)
  - Closed CR-02b (canary rollback --execute passes rollback_reason='canary_rollback' to applyCanaryDecision so the audit trail records reason='canary_rollback' distinct from the generic 'rollback')
affects: [EVO-05 closure, operator-driven canary trigger surface, audit-trail traceability]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Operator CLI promote path mirrors the watcher's evidence-sufficiency gate (window.sufficient !== true -> short-circuit before applyDecision) — one safety contract, two trigger surfaces
    - Canary rollback audit reason is carried via the applyCanaryDecision `rollback_reason` param (distinct from the activation.reason field) so the audit trail distinguishes canary rollback from registry rollback

key-files:
  created: []
  modified:
    - src/cli/router-control.mjs
    - tests/router.router-control-canary.test.mjs

key-decisions:
  - "CR-02a gate placement: immediately after the dry-run preview return and BEFORE the confirmation check — short-circuits before asking the operator to confirm a promote that cannot run (fail-fast, mirrors watcher.mjs:394-395)."
  - "CR-02b is a one-property addition (rollback_reason='canary_rollback') to the existing applyDecision call; the activation.reason field (also 'canary_rollback') is left unchanged — it is a separate field (activation reason, not rollback audit reason)."
  - "src/evolution/canary-controller.mjs is NOT modified — the rollback_reason param already exists there (line 155, added in 20-03); the CLI was simply not passing it."

patterns-established:
  - "Pattern: gap-closure plans fix the CLI surface to match the watcher's safety contract verbatim (same window.sufficient gate), so operator-driven and automatic triggers preserve identically on insufficient evidence."

requirements-completed: [EVO-05]

coverage:
  - id: CR-02a
    description: "canary promote --execute with insufficient evidence returns reason_code='insufficient_evidence_samples' and does NOT call applyCanaryDecision (no surprise rollback)"
    requirement: "EVO-05"
    verification:
      - kind: integration
        ref: "tests/router.router-control-canary.test.mjs#Test 7: canary promote --execute with insufficient evidence returns insufficient_evidence_samples and does NOT call applyCanaryDecision (CR-02a)"
        status: pass
    human_judgment: false
  - id: CR-02b
    description: "canary rollback --execute passes rollback_reason='canary_rollback' to applyCanaryDecision so the audit trail records reason='canary_rollback'"
    requirement: "EVO-05"
    verification:
      - kind: integration
        ref: "tests/router.router-control-canary.test.mjs#Test 8: canary rollback --execute passes rollback_reason=canary_rollback to applyCanaryDecision (CR-02b)"
        status: pass
    human_judgment: false

# Metrics
duration: ~8min
completed: 2026-07-22
status: complete
---

# Phase 20: Close gap EVO-05 — Plan 05 Summary

**Surgical fix closing CR-02a (promote surprise-rollback on insufficient evidence) and CR-02b (canary rollback records wrong audit reason) in `router-control canary` — the operator-driven EVO-05 trigger surface.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-07-22T16:55Z
- **Completed:** 2026-07-22T17:03Z
- **Tasks:** 1 (TDD: RED -> GREEN)
- **Files modified:** 2 (1 source, 1 test)

## Accomplishments
- **CR-02a closed:** `canary promote --execute` now gates on `window.sufficient` before the confirmation check and before `applyCanaryDecision` is called. When evidence is insufficient, the branch returns `reason_code='insufficient_evidence_samples'` with `exitCode=EXIT.invalid` and does NOT call `applyCanaryDecision` — restoring the "insufficient evidence preserves (no promotion, no rollback)" safety contract. Mirrors the watcher's Pitfall 5 behavior (`src/registry/watcher.mjs:394-395`).
- **CR-02b closed:** `canary rollback --execute` now passes `rollback_reason: 'canary_rollback'` to `applyCanaryDecision`. `canary-controller.mjs:188` (`reason: rollback_reason || 'rollback'`) now records `reason: 'canary_rollback'` in the audit trail — distinct from the generic `'rollback'` default. The canary rollback verb is now distinguishable from the registry rollback verb in the audit trail (20-03 truth 4). The `activation.reason: 'canary_rollback'` field is left unchanged (it is a separate field — the activation reason, not the rollback audit reason).
- **Hot path untouched:** `src/context/prompt-route.mjs` has zero references to `canary|evidence|telemetry-bridge|buildCandidateCalibrationRoute` (grep = 0).
- **canary-controller.mjs untouched:** The `rollback_reason` param already existed there (line 155, added in 20-03); the CLI was simply not passing it. No double-modification.
- **No cross-plan regression:** `tests/router.watcher-canary-trigger.test.mjs` still passes 8/8.

## Task Commits

Each task was committed atomically (TDD: RED -> GREEN):

1. **Task 1 RED: add failing regression tests** - `7f9c94c` (test — 2 new failing tests: Test 7 promote-insufficient CR-02a, Test 8 rollback-reason CR-02b)
2. **Task 1 GREEN: surgical source fixes** - `fd3c63d` (fix — CR-02a sufficiency gate + CR-02b rollback_reason param; both new tests + existing 6 pass)

## TDD Gate Compliance
- RED gate: `test(20-05)` commit `7f9c94c` exists (2 failing tests added before source fix).
- GREEN gate: `fix(20-05)` commit `fd3c63d` exists after RED (source fix makes all 8 tests pass).
- Fail-fast check: Test 7 and Test 8 both failed in RED for the expected reasons (Test 7: `ok=true` because the applyCanaryDecision spy stub returned 'promoted' instead of short-circuiting; Test 8: `args.rollback_reason === undefined`). The feature did not pre-exist — the tests genuinely tested the missing behavior.
- No REFACTOR gate needed — the fix is minimal (one gate return + one property addition); no cleanup warranted.

## Files Created/Modified
- `src/cli/router-control.mjs` — CR-02a: inserted `if (window.sufficient !== true) return { result: canonical('canary promote', false, 'insufficient_evidence_samples', detail), exitCode: EXIT.invalid }` in the promote branch after the dry-run preview return and before the confirmation check. CR-02b: added `rollback_reason: 'canary_rollback'` property to the canary rollback `applyDecision` call.
- `tests/router.router-control-canary.test.mjs` — Test 7 (CR-02a regression): `canary promote --execute` with 5-record insufficient evidence window returns `reason_code='insufficient_evidence_samples'` and `calls.length === 0`. Test 8 (CR-02b regression): `canary rollback --execute` spy captured `calls[0].rollback_reason === 'canary_rollback'`.

## Decisions Made
- CR-02a gate placed BEFORE the confirmation check (after the dry-run preview return) — fail-fast, so the operator is never asked to confirm a promote that cannot run. Matches the watcher's pattern.
- CR-02b is a one-property addition; the activation.reason field was already 'canary_rollback' and is a separate field — left unchanged to avoid scope creep.
- `src/evolution/canary-controller.mjs` not modified — the `rollback_reason` param already existed there from 20-03; only the CLI call site was missing.

## Deviations from Plan

None — plan executed exactly as written. The two source insertion points and two new tests match the plan's `<action>` and `<behavior>` blocks verbatim. No Rule 1-4 deviations triggered.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three EVO-05 trigger surfaces now close their respective BLOCKER defects: 20-04 closed CR-01 (watcher recovered-flag reset), 20-05 closes CR-02a + CR-02b (CLI promote sufficiency gate + rollback audit reason).
- Phase 20 ready for final goal verification against EVO-05 must_haves (all three BLOCKER defects from 20-VERIFICATION.md now closed).

## Self-Check: PASSED

- FOUND: src/cli/router-control.mjs (modified, contains `rollback_reason` x3 and `window.sufficient`/`insufficient_evidence_samples` x3)
- FOUND: tests/router.router-control-canary.test.mjs (modified, Test 7 + Test 8 appended)
- FOUND: commit 7f9c94c (RED — test(20-05) failing regression tests)
- FOUND: commit fd3c63d (GREEN — fix(20-05) source fixes)
- `node --test tests/router.router-control-canary.test.mjs` exits 0 (8/8 pass)
- `node --test tests/router.watcher-canary-trigger.test.mjs` exits 0 (8/8 pass, no cross-plan regression)
- `grep -c "rollback_reason" src/cli/router-control.mjs` = 3 (>= 1, CR-02b)
- `grep -c "window.sufficient\|insufficient_evidence_samples" src/cli/router-control.mjs` = 3 (>= 1, CR-02a)
- `grep -v '^#' src/context/prompt-route.mjs | grep -c 'canary\|evidence\|telemetry-bridge\|buildCandidateCalibrationRoute'` = 0 (hot path untouched)

---
*Phase: 20-close-gap-evo-05-add-production-trigger-for-canary-controlle*
*Completed: 2026-07-22*