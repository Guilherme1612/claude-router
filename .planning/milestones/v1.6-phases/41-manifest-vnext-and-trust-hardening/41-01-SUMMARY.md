---
phase: 41-manifest-vnext-and-trust-hardening
plan: 01
subsystem: registry
tags: [trust, contract-envelope, provenance, evidence-class, untrusted-evidence, stdlib-only]

# Dependency graph
requires:
  - phase: 22-contract-system
    provides: CONTRACT_FIELDS, envelope(), validateCapabilityContract, buildCapabilityContract
  - phase: 38-native-dispatch-feasibility
    provides: dispatch adapter contract, deploy-list moduleNames flatMap
provides:
  - "Contract envelope evidence_class (explicit/inferred/conflicting/unknown) per field"
  - "4 new contract fields: action, cost, completion, native_invocation (18 total)"
  - "trust.mjs untrusted-evidence policy: classifyEvidence, AUTHORITY_CRITICAL_FIELDS, TRUSTED_PROVENANCE"
  - "Envelope integration: untrusted evidence retained in rejected_evidence with reason codes"
  - "CLI inspection surfaces evidence_class via fieldProjection"
affects: [41-02, 41-03, contract-inspection, eligibility-gates, dispatch-pregate]

actuals:
  tokens: 4769
  tasks: 2
  commits: 4

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Evidence class derivation: explicit (adapter@10000) / inferred (manifest|correction>=8500) / conflicting (assertedValues>1) / unknown (no eligible)"
    - "Untrusted-evidence policy module: pure-function classifyEvidence with frozen-set provenance classification"
    - "Circular ESM import (contract.mjs <-> trust.mjs) safe via live bindings accessed only at runtime"

key-files:
  created:
    - src/registry/trust.mjs
    - tests/router.trust-contract.test.mjs
    - tests/router.trust-evidence.test.mjs
  modified:
    - src/registry/contract.mjs
    - src/cli/router-control.mjs
    - src/lifecycle/router-lifecycle.mjs
    - tests/helpers/inventory-fixture.mjs
    - tests/router.contract-inspection.test.mjs

key-decisions:
  - "evidence_class is additive alongside the existing state/freshness fields, not a replacement — preserves the known/unknown + fresh/stale/unknown contract invariant"
  - "classifyEvidence preserves the existing authored rejection (authored_evidence_rejected) for ALL fields and extends it with untrusted_evidence_rejected for authority-critical fields, avoiding a regression in the phase-22 rejected-evidence test"
  - "cost and action are enum fields (matching risk/reversibility); completion and native_invocation are object fields (matching scope) — reuses the existing validateContractFieldValue dispatch"
  - "trust.mjs imports CONTRACT_POLICY from contract.mjs creating a circular ESM dependency that is safe because both modules only access each other's bindings at runtime (inside envelope/classifyEvidence), never at module-evaluation time"

patterns-established:
  - "Pattern: evidence_class 4-value taxonomy (explicit/inferred/conflicting/unknown) derivable from existing envelope state"
  - "Pattern: untrusted-evidence policy as a pure-function module (no I/O) with frozen-set provenance classification"
  - "Pattern: validate-if-present for additive envelope fields in validateCapabilityContract (non-breaking for manually constructed contracts)"

requirements-completed: [TRUST-01, TRUST-02]

coverage:
  - id: D1
    description: "Contract envelope extended with evidence_class (explicit/inferred/conflicting/unknown) and 4 new fields (action, cost, completion, native_invocation) visible in CLI inspection"
    requirement: TRUST-01
    verification:
      - kind: unit
        ref: "tests/router.trust-contract.test.mjs#adapter-provenance evidence yields evidence_class=explicit"
        status: pass
      - kind: unit
        ref: "tests/router.trust-contract.test.mjs#manifest-provenance evidence at inferred threshold yields evidence_class=inferred"
        status: pass
      - kind: unit
        ref: "tests/router.trust-contract.test.mjs#two distinct asserted values yield evidence_class=conflicting (not unknown)"
        status: pass
      - kind: unit
        ref: "tests/router.trust-contract.test.mjs#no eligible evidence yields evidence_class=unknown"
        status: pass
      - kind: unit
        ref: "tests/router.trust-contract.test.mjs#CONTRACT_FIELDS contains action cost completion native_invocation"
        status: pass
      - kind: unit
        ref: "tests/router.trust-contract.test.mjs#contractDetailProjection includes evidence_class for each projected field"
        status: pass
      - kind: unit
        ref: "tests/router.contract-inspection.test.mjs#contract detail projects evidence_class and new fields for every CONTRACT_FIELDS entry"
        status: pass
    human_judgment: false
  - id: D2
    description: "Untrusted-evidence policy module (trust.mjs) prevents manifest/plugin/private/learned provenance from populating authority-critical fields, integrated into envelope and deployed to both runtimes"
    requirement: TRUST-02
    verification:
      - kind: unit
        ref: "tests/router.trust-evidence.test.mjs#manifest provenance for authority-critical field is untrusted"
        status: pass
      - kind: unit
        ref: "tests/router.trust-evidence.test.mjs#adapter provenance for authority-critical field is trusted"
        status: pass
      - kind: unit
        ref: "tests/router.trust-evidence.test.mjs#correction provenance for authority-critical field is trusted"
        status: pass
      - kind: unit
        ref: "tests/router.trust-evidence.test.mjs#informational field accepts inferred manifest evidence"
        status: pass
      - kind: unit
        ref: "tests/router.trust-evidence.test.mjs#manifest permissions claim does not reach envelope value"
        status: pass
      - kind: unit
        ref: "tests/router.trust-evidence.test.mjs#plugin private and learned provenance for side_effects are rejected"
        status: pass
      - kind: unit
        ref: "tests/router.trust-evidence.test.mjs#untrusted evidence for risk yields unknown state and class"
        status: pass
      - kind: integration
        ref: "src/lifecycle/router-lifecycle.mjs moduleNames contains registry/trust.mjs (grep verified)"
        status: pass
      - kind: integration
        ref: "tests/router.deployed-bundle.test.mjs passes with trust.mjs in deploy list"
        status: pass
    human_judgment: false

# Metrics
duration: 10min
completed: 2026-08-08
status: complete
---

# Phase 41 Plan 01: Manifest vNext and Trust Hardening Summary

**Contract envelope extended with provenance-class evidence states (explicit/inferred/conflicting/unknown) + 4 new fields, and a trust.mjs untrusted-evidence policy that prevents manifest/plugin/private/learned provenance from populating authority-critical fields**

## Performance

- **Duration:** 10 min
- **Started:** 2026-08-08T15:58:15Z
- **Completed:** 2026-08-08T16:07:59Z
- **Tasks:** 2 (both TDD: RED then GREEN)
- **Files modified:** 8 (3 created, 5 modified)

## Accomplishments
- Contract envelope now carries `evidence_class` (explicit/inferred/conflicting/unknown) as an additive field alongside the existing state/freshness — conflicting is surfaced as a distinct class instead of collapsed to unknown
- 4 new contract fields added to CONTRACT_FIELDS (14 -> 18): `action` (enum), `cost` (enum), `completion` (object), `native_invocation` (object) — all dispatch-relevant, all populated by authoritativeEvidence and the test fixture
- New `src/registry/trust.mjs` module exports `classifyEvidence`, `AUTHORITY_CRITICAL_FIELDS` (permissions/side_effects/risk/reversibility/invocation_kind), and `TRUSTED_PROVENANCE` (adapter/correction) — pure functions, no I/O, stdlib-only
- Envelope integration: the single authored-provenance rejection is generalized via classifyEvidence, which rejects manifest/plugin/private/learned for authority-critical fields with `untrusted_evidence_rejected` and requires structural-minimum confidence for trusted provenance (`below_structural_minimum`)
- CLI inspection (`fieldProjection`) surfaces `evidence_class` for every projected contract field
- `registry/trust.mjs` added to the moduleNames deploy list, deploying to both `~/.claude/router/modules/` and `~/.codex/router/modules/` via the existing moduleValues flatMap
- All existing contract, eligibility, inspection, and overlay tests remain green (42/42 across 6 test files)

## Task Commits

Each task was committed atomically via TDD (RED -> GREEN):

1. **Task 1: TRUST-01 — extend contract envelope with evidence_class + new fields** (tracer)
   - `f4aff9b` (test) — RED: failing tests for evidence_class derivation, new fields, projection
   - `b6191ab` (feat) — GREEN: implement evidence_class + 4 new contract fields
2. **Task 2: TRUST-02 — create trust.mjs untrusted-evidence policy, integrate into envelope, add to deploy list**
   - `eed62ae` (test) — RED: failing tests for classifyEvidence and envelope integration
   - `1e92ab8` (feat) — GREEN: implement trust.mjs, envelope integration, deploy list

_Note: Both tasks followed TDD (test -> feat). No REFACTOR commits needed — code was clean on first GREEN._

## Files Created/Modified
- `src/registry/trust.mjs` (NEW) — classifyEvidence, AUTHORITY_CRITICAL_FIELDS, TRUSTED_PROVENANCE; pure-function untrusted-evidence policy
- `src/registry/contract.mjs` — CONTRACT_FIELDS +4, DISPATCH_FIELDS +4, ENUM_FIELDS +2 (action/cost), OBJECT_FIELDS generalization, envelope() evidence_class derivation, authoritativeEvidence +4 fields, applyContractOverlays evidence_class, validateCapabilityContract validate-if-present
- `src/cli/router-control.mjs` — fieldProjection surfaces evidence_class with safeToken fallback to 'unknown'
- `src/lifecycle/router-lifecycle.mjs` — moduleNames array includes 'registry/trust.mjs' for both-runtime deploy
- `tests/helpers/inventory-fixture.mjs` — contractEvidence structural object +4 fields, variant guard unchanged
- `tests/router.trust-contract.test.mjs` (NEW) — 7 tests covering evidence_class derivation, new fields, projection, privacy
- `tests/router.trust-evidence.test.mjs` (NEW) — 8 tests covering classifyEvidence, envelope integration, frozen sets
- `tests/router.contract-inspection.test.mjs` — extended with evidence_class + new field projection test (existing assertions preserved)

## Decisions Made
- **evidence_class is additive, not a replacement** — the existing `state` (known/unknown) and `freshness` (fresh/stale/unknown) fields are unchanged; evidence_class adds a provenance-class dimension on top. This preserves the phase-22 contract invariant and all existing tests.
- **classifyEvidence preserves authored rejection for ALL fields** — the plan's logic said "informational fields return trusted:true", which would have accepted authored evidence for `purpose` and broken the phase-22 rejected-evidence test. classifyEvidence rejects `authored` with `authored_evidence_rejected` for every field first, then applies the authority-critical policy. This preserves the existing invariant while extending coverage to manifest/plugin/private/learned.
- **cost defaults to 'unknown' (not 'low')** — matching the existing `risk` pattern where the adapter truthfully asserts 'unknown' rather than guessing a cost it cannot structurally determine. `action` defaults to availability-aware ('invoke'/'none') matching the `invocation_kind` pattern.
- **Circular ESM import (contract.mjs <-> trust.mjs)** — trust.mjs imports CONTRACT_POLICY from contract.mjs; contract.mjs imports classifyEvidence from trust.mjs. This is safe in ESM because both modules only access each other's bindings at runtime (inside envelope()/classifyEvidence), never during module evaluation. Avoids duplicating the structural-minimum constant.
- **validate-if-present for evidence_class** — validateCapabilityContract checks evidence_class only if the field is present, avoiding breakage of manually-constructed contract objects (e.g., the phase-22 inspection test's hand-built 2-field record that never goes through validation).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Preserved authored-evidence rejection for informational fields**
- **Found during:** Task 2 (classifyEvidence design)
- **Issue:** The plan's classifyEvidence logic said "For informational fields, return { trusted: true, reason_code: '' }" which would have accepted `authored` provenance for `purpose` and broken the phase-22 `rejected evidence is inspectable but privacy safe` test (which asserts `authored_evidence_rejected` appears in the output).
- **Fix:** classifyEvidence rejects `authored` with `authored_evidence_rejected` for ALL fields first, then applies the authority-critical policy. This preserves the existing invariant while extending the rejection to manifest/plugin/private/learned for authority-critical fields.
- **Files modified:** src/registry/trust.mjs
- **Verification:** tests/router.contracts.test.mjs (rejected-evidence test) passes; tests/router.trust-evidence.test.mjs passes
- **Committed in:** 1e92ab8 (Task 2 GREEN commit)

**2. [Rule 2 - Missing Critical] Added evidence_class to applyContractOverlays manual constructions**
- **Found during:** Task 1 (envelope extension)
- **Issue:** applyContractOverlays constructs field envelopes manually (not via envelope()) for overlay-accepted and overlay-conflict cases. Without evidence_class, the CLI projection would show 'unknown' (safeToken fallback) for overlay-accepted fields, misrepresenting their provenance class.
- **Fix:** Added `evidence_class: 'inferred'` to the overlay-accepted construction (correction provenance) and `evidence_class: 'conflicting'` to the overlay-conflict construction. Both pass validateCapabilityContract's validate-if-present check.
- **Files modified:** src/registry/contract.mjs
- **Verification:** tests/router.contract-overlays.test.mjs passes; tests/router.contract-inspection.test.mjs passes
- **Committed in:** b6191ab (Task 1 GREEN commit)

---

**Total deviations:** 2 auto-fixed (2 missing critical)
**Impact on plan:** Both auto-fixes necessary for correctness and regression safety. No scope creep. The authored-rejection preservation is a correctness backstop the plan's prose underspecified; the applyContractOverlays evidence_class is a consistency fix so inspection output is truthful.

## Issues Encountered
- One pre-existing flaky lifecycle subprocess test (router.lifecycle.test.mjs) intermittently reports 1 failure on first run but passes on rerun (exit 0, 26/26). Per MEMORY note, flaky full-corpus tests are pre-existing and reproduce on baseline. Not caused by this plan's changes — logged to deferred items, not fixed (scope boundary).

## User Setup Required
None - no external service configuration required. All modules are stdlib-only Node.js ESM with zero dependencies.

## Next Phase Readiness
- TRUST-01 and TRUST-02 are complete; the contract envelope now carries provenance-class evidence and untrusted evidence is quarantined with reason codes.
- Ready for Plan 41-02 (TRUST-03/04: invocation validation + pre-dispatch gate) which extends the dispatch adapter contract with validateInvocation and preDispatchGate.
- Ready for Plan 41-03 (TRUST-05: quarantine with fallback eligibility) which adds the quarantined disposition to the eligibility/contract layer.
- No blockers. The circular ESM import pattern is proven safe; future trust modules can follow the same pattern.

## TDD Gate Compliance

Both tasks followed RED -> GREEN. Git log shows the required gate commits:
1. `f4aff9b` test(41-01): RED gate for Task 1
2. `b6191ab` feat(41-01): GREEN gate for Task 1
3. `eed62ae` test(41-01): RED gate for Task 2
4. `1e92ab8` feat(41-01): GREEN gate for Task 2

No REFACTOR commits needed — implementation was clean on first GREEN. All RED tests failed before implementation; all GREEN tests passed after.

## Self-Check: PASSED

Files verified to exist:
- FOUND: src/registry/trust.mjs
- FOUND: tests/router.trust-contract.test.mjs
- FOUND: tests/router.trust-evidence.test.mjs

Commits verified in git log:
- FOUND: f4aff9b
- FOUND: b6191ab
- FOUND: eed62ae
- FOUND: 1e92ab8

---
*Phase: 41-manifest-vnext-and-trust-hardening*
*Completed: 2026-08-08*