---
phase: 41-manifest-vnext-and-trust-hardening
plan: 03
subsystem: registry
tags: [trust, quarantine, eligibility, per-capability, injection-bearing, scope-escaping, stdlib-only]

# Dependency graph
requires:
  - phase: 22-contract-system
    provides: evaluateEligibility gate evaluator, ELIGIBILITY_GATES, validateEligibility, CONTRACT_FIELDS
  - phase: 41-manifest-vnext-and-trust-hardening
    provides: "Plan 01 contract envelope evidence_class + trust.mjs untrusted-evidence policy + hasUnsafeAuthoredContent"
  - phase: 41-manifest-vnext-and-trust-hardening
    provides: "Plan 02 RECEIPT_STATES 'blocked' state + validateInvocation + preDispatchGate"
provides:
  - "Per-capability quarantine disposition: evaluateEligibility returns quarantined (boolean) + quarantine_reasons (string[])"
  - "Quarantine reason codes: injection_bearing, scope_escaping, stale_unavailable"
  - "isQuarantined(record) helper exported from eligibility.mjs"
  - "validateEligibility in schema.mjs accepts quarantined + quarantine_reasons (validate-if-present)"
  - "RECEIPT_STATES extended with 'quarantined' state (additive to existing 7)"
  - "hasUnsafeAuthoredContent exported from contract.mjs for cross-module reuse"
affects: [dispatch-integration, quarantine-gates, contract-inspection, fallback-eligibility]

actuals:
  tokens: 3300
  tasks: 2
  commits: 3

# Tech tracking
tech-stack:
  added: []
patterns:
  - "Per-capability quarantine disposition: quarantine is computed per-record in evaluateEligibility, NOT per-route — siblings with the same semantic_type but different stableCapabilityId remain eligible independently (Pitfall 5 backstop)"
  - "Quarantine as disposition not gate: quarantined/quarantine_reasons are additive return fields, not a new ELIGIBILITY_GATES entry — preserves the gate-set invariant"
  - "Validate-if-present for quarantine fields in validateEligibility: existing pre-TRUST-05 eligibility objects without quarantined/quarantine_reasons still validate (backward compatible)"
  - "Quarantined records can have eligible=false even when all gates pass: validateEligibility adjusted to skip the eligible-vs-gate-results check when quarantined===true"

key-files:
  created:
    - tests/router.trust-quarantine.test.mjs
  modified:
    - src/registry/eligibility.mjs
    - src/registry/schema.mjs
    - src/adapters/dispatch/contract.mjs
    - src/registry/contract.mjs
    - tests/router.contract-eligibility.test.mjs

key-decisions:
  - "Quarantine is a disposition (additive return fields), not a new gate — avoids the Pitfall 1 gate-set invariant and keeps ELIGIBILITY_GATES unchanged at 10 gates"
  - "hasUnsafeAuthoredContent exported from contract.mjs rather than reimplemented in eligibility.mjs — follows the Don't Hand-Roll principle and reuses the existing injection detection pattern"
  - "validateEligibility uses validate-if-present for quarantine fields: quarantined===undefined is accepted (legacy objects), quarantined===true requires eligible===false and non-empty quarantine_reasons array of valid reason tokens"
  - "reason_codes stays gate-based even for quarantined records — quarantine_reasons is a separate field; a quarantined record with all gates passing has reason_codes=['eligibility_all_gates_passed'] and quarantined=true"
  - "stale_unavailable checks dispatch field freshness==='stale' — redundant with field_confidence gate returning 'unknown' for stale fields, but provides an attributable quarantine reason code distinct from the gate-level failure"

patterns-established:
  - "Pattern: per-capability quarantine disposition computed from contract inspection only (no sibling reads) — structurally guarantees Pitfall 5 compliance since evaluateEligibility operates per-record"
  - "Pattern: validate-if-present for additive eligibility fields — extends validateEligibility without breaking pre-existing eligibility objects that lack the new fields"
  - "Pattern: quarantine reason tokens follow the reason-code convention /^[a-z0-9][a-z0-9._-]{0,63}$/i alongside existing gate reason codes"

requirements-completed: [TRUST-05]

coverage:
  - id: D1
    description: "Per-capability quarantine disposition in evaluateEligibility with attributable reason codes (injection_bearing, scope_escaping, stale_unavailable) while independent valid fallbacks remain eligible"
    requirement: TRUST-05
    verification:
      - kind: unit
        ref: "tests/router.trust-quarantine.test.mjs#a quarantined record has quarantined===true and quarantine_reasons is a non-empty array"
        status: pass
      - kind: unit
        ref: "tests/router.trust-quarantine.test.mjs#a quarantined record has eligible===false and recommendation_only===true"
        status: pass
      - kind: unit
        ref: "tests/router.trust-quarantine.test.mjs#an independent valid fallback with same semantic_type but different stableCapabilityId remains eligible"
        status: pass
      - kind: unit
        ref: "tests/router.trust-quarantine.test.mjs#an injection-bearing capability is quarantined with reason_code injection_bearing"
        status: pass
      - kind: unit
        ref: "tests/router.trust-quarantine.test.mjs#a scope-escaping capability is quarantined with reason_code scope_escaping"
        status: pass
      - kind: unit
        ref: "tests/router.trust-quarantine.test.mjs#a valid non-quarantined record has quarantined===false and quarantine_reasons===[]"
        status: pass
      - kind: unit
        ref: "tests/router.trust-quarantine.test.mjs#validateEligibility accepts quarantined and quarantine_reasons fields without throwing"
        status: pass
      - kind: unit
        ref: "tests/router.trust-quarantine.test.mjs#validateEligibility accepts a non-quarantined eligibility without quarantined fields"
        status: pass
      - kind: unit
        ref: "tests/router.trust-quarantine.test.mjs#RECEIPT_STATES includes quarantined"
        status: pass
      - kind: unit
        ref: "tests/router.trust-quarantine.test.mjs#quarantine reason tokens match the reason-code convention"
        status: pass
      - kind: unit
        ref: "tests/router.trust-quarantine.test.mjs#quarantine does not propagate to other records in the same evaluateEligibility call"
        status: pass
      - kind: unit
        ref: "tests/router.trust-quarantine.test.mjs#a capability eligible before quarantine becomes quarantined after injection-bearing overlay"
        status: pass
      - kind: unit
        ref: "tests/router.trust-quarantine.test.mjs#isQuarantined is exported from eligibility.mjs"
        status: pass
      - kind: unit
        ref: "tests/router.contract-eligibility.test.mjs#[41-03:quarantine] a safe record is not quarantined"
        status: pass
      - kind: regression
        ref: "tests/router.contract-eligibility.test.mjs (9 tests pass)"
        status: pass
      - kind: regression
        ref: "tests/router.contracts.test.mjs (13 tests pass)"
        status: pass
      - kind: regression
        ref: "tests/router.dispatch-integration.test.mjs (16 tests pass)"
        status: pass
      - kind: regression
        ref: "tests/router.trust-contract.test.mjs + tests/router.trust-evidence.test.mjs + tests/router.trust-invocation.test.mjs + tests/router.trust-pregate.test.mjs + tests/router.contract-overlays.test.mjs + tests/router.contract-inspection.test.mjs (52 tests pass)"
        status: pass
    human_judgment: false

# Metrics
duration: 2min
completed: 2026-08-08
status: complete
---

# Phase 41 Plan 03: Quarantine with Fallback Eligibility Summary

**Per-capability quarantine disposition in evaluateEligibility with injection_bearing/scope_escaping/stale_unavailable reason codes, validateEligibility extended, RECEIPT_STATES gains 'quarantined' — independent valid fallbacks remain eligible (Pitfall 5 backstop)**

## Performance

- **Duration:** 2 min
- **Started:** 2026-08-08T16:28:21Z
- **Completed:** 2026-08-08T16:30:28Z
- **Tasks:** 2 (both TDD: RED then GREEN)
- **Files modified:** 6 (1 created, 5 modified)

## Accomplishments
- `evaluateEligibility` now returns `quarantined` (boolean) and `quarantine_reasons` (string[]) alongside the existing eligible/recommendation_only/gates/reason_codes fields — quarantine is a disposition, not a gate (ELIGIBILITY_GATES unchanged at 10)
- Three quarantine reason codes implemented: `injection_bearing` (unsafe content in contract field values via `hasUnsafeAuthoredContent`), `scope_escaping` (invocation_kind.value mismatches semantic_type and is not 'none'), `stale_unavailable` (dispatch field freshness is 'stale')
- Quarantine is per-capability (per-record): a quarantined record does not affect sibling fallbacks with the same semantic_type but different stableCapabilityId (Pitfall 5 backstop verified by test)
- `validateEligibility` in schema.mjs extended with validate-if-present for quarantine fields — accepts quarantined=true with eligible=false even when all gates pass; backward compatible with pre-TRUST-05 eligibility objects that lack quarantine fields
- `RECEIPT_STATES` extended with 'quarantined' (additive, now 8 states total: pending/invoked/paused/completed/failed/recommendation_only/blocked/quarantined)
- `hasUnsafeAuthoredContent` exported from contract.mjs for cross-module reuse (was internal to overlay validation)
- `isQuarantined(record)` helper exported from eligibility.mjs for testability and external callers
- All 13 quarantine tests + 9 contract-eligibility + 13 contracts + 16 dispatch-integration + 52 trust/contract regression tests pass (95 total)

## Task Commits

Each task was committed atomically via TDD (RED -> GREEN):

1. **Task 1: TRUST-05 — add quarantined disposition to eligibility + schema validation + RECEIPT_STATES extension** (combined with Task 2 tests)
   - `04ee6c5` (test) — RED: 13 failing tests for quarantine disposition, fallback eligibility, validateEligibility, RECEIPT_STATES, isQuarantined
   - `d1f0980` (feat) — GREEN: implement quarantine disposition, schema validation, RECEIPT_STATES, export hasUnsafeAuthoredContent + isQuarantined
2. **Task 2: TRUST-05 — wire fallback eligibility verification and quarantine integration with dispatch gate**
   - `a41a197` (test) — backstop test added to contract-eligibility.test.mjs (safe record not quarantined)

_Note: Tests for both tasks were written upfront in one RED commit since they share the same test file and Task 2 builds on Task 1's implementation. The GREEN commit covers both tasks' implementation. No REFACTOR needed._

## Files Created/Modified
- `tests/router.trust-quarantine.test.mjs` (NEW) — 13 tests covering quarantined disposition, injection_bearing, scope_escaping, fallback eligibility, validateEligibility acceptance, RECEIPT_STATES, isQuarantined, reason token convention
- `src/registry/eligibility.mjs` — imported hasUnsafeAuthoredContent + CONTRACT_FIELDS, added computeQuarantineReasons + isQuarantined, extended evaluateEligibility return with quarantined + quarantine_reasons
- `src/registry/schema.mjs` — validateEligibility extended: validate-if-present for quarantined (boolean) + quarantine_reasons (reason-token array), adjusted eligible-vs-gate-results check to skip when quarantined===true
- `src/adapters/dispatch/contract.mjs` — RECEIPT_STATES gains 'quarantined' (additive, 8 total)
- `src/registry/contract.mjs` — exported hasUnsafeAuthoredContent (was internal function)
- `tests/router.contract-eligibility.test.mjs` — added backstop test: safe record has quarantined===false, quarantine_reasons===[]

## Decisions Made
- **Quarantine is a disposition, not a gate** — adding quarantined/quarantine_reasons as return fields on evaluateEligibility avoids the Pitfall 1 gate-set invariant. ELIGIBILITY_GATES stays at 10 gates; validateEligibility's canonical gate-set check is unchanged. A quarantined record can have all gates passing but still be eligible=false via the quarantine disposition.
- **hasUnsafeAuthoredContent exported from contract.mjs** — rather than reimplementing the injection detection pattern in eligibility.mjs, the existing function is exported. eligibility.mjs already imports from contract.mjs (validateContractFieldValue), so the new import is natural and follows the Don't Hand-Roll principle.
- **validate-if-present for quarantine fields** — validateEligibility checks quarantined/quarantine_reasons only if `quarantined !== undefined`. This preserves backward compatibility with pre-TRUST-05 eligibility objects (e.g., manually constructed in existing tests) that don't have the fields. When present, quarantined=true requires eligible=false and a non-empty array of valid reason tokens.
- **reason_codes stays gate-based** — for a quarantined record with all gates passing, reason_codes=['eligibility_all_gates_passed'] (gate-based) while quarantine_reasons=['injection_bearing'] (quarantine-based). These are separate concerns: reason_codes explains gate results, quarantine_reasons explains the quarantine.
- **stale_unavailable checks freshness==='stale' on dispatch fields** — this is partially redundant with the field_confidence gate (which returns 'unknown' for stale fields, making the record ineligible anyway), but provides an attributable quarantine reason code that distinguishes "stale" from "gate-failed" at the quarantine layer.

## Deviations from Plan

None - plan executed exactly as written. The quarantine disposition was implemented as a per-record return field (not a gate), validateEligibility was extended with validate-if-present, RECEIPT_STATES gained 'quarantined' additively, and all existing tests remained green. The plan's action steps were followed precisely.

## Issues Encountered
- Initial test file had a syntax error (mismatched closing brace in a for-loop) — fixed before the RED commit. No runtime issues after implementation.

## User Setup Required
None — no external service configuration required. All modules are stdlib-only Node.js ESM with zero dependencies.

## Next Phase Readiness
- TRUST-05 is complete; the eligibility layer now quarantines invalid, injection-bearing, scope-escaping, and stale capabilities with attributable reason codes while independent valid fallbacks remain eligible.
- All 5 TRUST requirements (TRUST-01 through TRUST-05) are now complete for Phase 41.
- No blockers. The per-record quarantine design is structurally guaranteed by evaluateEligibility's single-record evaluation model.

## TDD Gate Compliance

Both tasks followed RED -> GREEN. Git log shows the required gate commits:
1. `04ee6c5` test(41-03): RED gate — 13 failing tests for quarantine disposition
2. `d1f0980` feat(41-03): GREEN gate — implement quarantine disposition
3. `a41a197` test(41-03): backstop assertion for safe records

No REFACTOR commits needed — implementation was clean on first GREEN. All RED tests failed before implementation; all GREEN tests passed after.

## Self-Check: PASSED

Files verified to exist:
- FOUND: tests/router.trust-quarantine.test.mjs
- FOUND: src/registry/eligibility.mjs (modified)
- FOUND: src/registry/schema.mjs (modified)
- FOUND: src/adapters/dispatch/contract.mjs (modified)
- FOUND: src/registry/contract.mjs (modified)

Commits verified in git log:
- FOUND: 04ee6c5
- FOUND: d1f0980
- FOUND: a41a197

---
*Phase: 41-manifest-vnext-and-trust-hardening*
*Completed: 2026-08-08*