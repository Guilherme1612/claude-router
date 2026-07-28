---
phase: 22-conservative-contracts-and-relationship-graph
verified: 2026-07-26T19:25:39Z
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 0/4
  gaps_closed:
    - "Production assembleRegistry() now constructs a validated normalized contract for every authoritative record before overlays."
    - "Absent contracts and absent required field envelopes now produce unknown gates and recommendation-only eligibility."
  gaps_remaining: []
  regressions:
    - "Final review fixes e9188f8, 270f6e8, 36ec0e2, and bffd616 preserve all four roadmap truths."
    - "Conflicting corrections, invalid field values, and active/inactive relationship overflow now fail closed."
---

# Phase 22: Conservative Contracts and Relationship Graph Verification Report

**Phase Goal:** Users can understand what each installed capability can safely do, why Router believes it, and whether it is eligible for dispatch.
**Verified:** 2026-07-26T19:25:39Z
**Status:** passed
**Re-verification:** Yes — after Plan 22-06 gap closure

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | A user can inspect a normalized contract for every discovered capability, including field evidence, provenance, inference version, confidence, permissions, effects, reversibility, risk, lifecycle role, and workflow transitions. | ✓ VERIFIED | The real four-record Phase 21 fixture produced 4 records and 4 validator-approved contracts. Every contract contains all 14 canonical fields with field-level evidence, provenance, rule version, freshness, confidence, and reason codes. The active-registry CLI projection is covered by inspection tests. |
| 2 | Missing, stale, conflicting, or low-confidence dispatch fields remain visibly unknown and keep the capability recommendation-only. | ✓ VERIFIED | `eligibility.mjs:37` and `:120` now return `unknown` for absent contracts. The named missing-safety regression passes; an independent check confirmed absent and incomplete contracts are ineligible, recommendation-only, and expose stable unknown reason codes. |
| 3 | Optional manifests and approved corrections enrich only the exact installed capability identity and are rejected or invalidated when schema, fingerprint, or lineage evidence no longer matches. | ✓ VERIFIED | Production assembly constructs base contracts before `resolveContractOverlays()` (`build.mjs:320-325`). The named real-assembly test accepts an exact-bound correction without changing record identities/count; overlay mutation and invalidation regressions pass. An independently malformed binding was rejected. |
| 4 | Users can distinguish substitutes, variants, prerequisites, compositions, conflicts, fallbacks, implementations, and aliases, while only fully validated targets become dispatch eligible. | ✓ VERIFIED | Exactly eight typed relationship classes remain substantive and wired. Eligibility is derived after contracts, overlays, and relationships (`build.mjs:327-341`); missing safety evidence no longer passes. |

**Score:** 4/4 truths verified (0 present-but-behavior-unverified)

## Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/registry/contract.mjs` | Normalized field envelopes and exact-bound overlays | ✓ VERIFIED | Substantive; authoritative records provide deterministic adapter evidence while explicit evidence remains supported. |
| `src/registry/build.mjs` | Production assembly order | ✓ VERIFIED | Calls `buildCapabilityContract()` for every merged record before overlays, relationships, and eligibility. |
| `src/registry/schema.mjs` | Canonical contract/eligibility validation | ✓ VERIFIED | Validates constructed contracts and canonical eligibility shapes. |
| `src/registry/relationships.mjs` | Eight-type conservative graph | ✓ VERIFIED | Substantive and consumed by assembly/reconciliation. |
| `src/registry/eligibility.mjs` | Shared fail-closed eligibility | ✓ VERIFIED | Missing contract/field/dependency evidence produces unknown gates. |
| `src/cli/router-control.mjs` | Bounded privacy-safe inspection | ✓ VERIFIED | Reads the immutable active registry and projects contracts, rejected overlays, relationships, and eligibility in deterministic text/JSON. |
| Phase 22 focused test files | Behavioral oracles | ✓ VERIFIED | 67/67 focused Phase 22 plus Phase 21 schema/convergence checks pass after the final review fixes. |

Plan 22-06 artifact query: 5/5 artifacts passed. The generic key-link query could not resolve symbolic module descriptions, so links were verified manually below.

## Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `src/registry/build.mjs` | `src/registry/contract.mjs` | build every contract before overlays | ✓ WIRED | `buildCapabilityContract(record)` at line 320 precedes `resolveContractOverlays()` at line 325. |
| `src/registry/build.mjs` | `src/registry/eligibility.mjs` | evaluate optionally overlaid records | ✓ WIRED | Relationships derive at line 327; `evaluateEligibility()` consumes `overlaidRecords` at line 337. |
| `tests/helpers/inventory-fixture.mjs` | `src/registry/build.mjs` | real four-record acquisition | ✓ WIRED | Named test passes unmodified `buildClaudeHeavyProfile()` observations through `assembleRegistry()`. |
| `src/registry/relationships.mjs` | `src/registry/reconcile.mjs` | endpoint reference invalidation | ✓ WIRED | Existing relationship/reconciliation regression slice remains green. |
| `src/cli/router-control.mjs` | canonical active registry | read-only projections | ✓ WIRED | Default contract source remains the verified immutable `version.registry`; inspection regressions pass. |

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| Contract CLI | `version.registry.records[].contract` | discovery → merge → `buildCapabilityContract()` → overlay | Yes; 4/4 fixture records carry contracts | ✓ FLOWING |
| Relationship CLI | `version.registry.relationships` | `deriveRelationships()` during assembly | Yes | ✓ FLOWING |
| Eligibility | `record.eligibility` | contract + overlays + relationships → `evaluateEligibility()` | Yes; incomplete evidence remains recommendation-only | ✓ FLOWING |

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Full focused Phase 22/Phase 21 slice | `rtk node --test tests/router.contracts.test.mjs tests/router.contract-overlays.test.mjs tests/router.contract-eligibility.test.mjs tests/router.contract-inspection.test.mjs tests/router.relationships.test.mjs tests/router.registry-schema.test.mjs tests/router.inventory-convergence.test.mjs` | 67 passed, 0 failed | ✓ PASS |
| Production assembly transition | Named `assembleRegistry constructs and overlays every authoritative contract` test | 1 passed | ✓ PASS |
| Missing-safety transition | Named `missing contract safety evidence is recommendation-only` test | 1 passed | ✓ PASS |
| Relationship overflow fail-closed transitions | Named overflow tests in relationship and eligibility suites | 2 passed | ✓ PASS |
| Independent real assembly | Assemble the four-record Claude-heavy fixture | 4 records, 4 validated contracts; all uncertain records recommendation-only | ✓ PASS |
| Independent absent/incomplete evidence | Call shared evaluator without a contract and without `risk` | Both ineligible; contract-dependent/field-confidence gates unknown | ✓ PASS |

The historical Phase 21 wildcard mismatch described in 22-06-SUMMARY concerns a legacy dispatchability expectation superseded by evidence-gated dispatch. It is not reproduced by or causal to the owned 67-test slice and is not attributed to Phase 22.

## Probe Execution

Step 7c: SKIPPED — Phase 22 declares no probes.

## Requirements Coverage

| Requirement | Status | Evidence |
|---|---|---|
| CONT-01 | ✓ SATISFIED | Every assembled authoritative record receives the complete 14-field normalized contract. |
| CONT-02 | ✓ SATISFIED | Each field envelope independently carries evidence, provenance, rule version, freshness, confidence, and reasons. |
| CONT-03 | ✓ SATISFIED | Missing/uncertain contract evidence yields unknown gates and recommendation-only. |
| CONT-04 | ✓ SATISFIED | Optional overlays enrich only already assembled installed identities. |
| CONT-05 | ✓ SATISFIED | Overlay schema, version, exact fingerprint/scope/runtime binding, and inspection are enforced. |
| CONT-06 | ✓ SATISFIED | Existing fingerprint/identity/lineage invalidation operates on constructed production contracts. |
| CONT-07 | ✓ SATISFIED | Eight explicit relationship types with conservative evidence validation remain implemented and tested. |
| CONT-08 | ✓ SATISFIED | Shared eligibility evaluates every required gate and fails closed on failed or unknown evidence. |
| CONT-09 | ✓ SATISFIED | Active production contracts, evidence, rejected overlays, relationships, eligibility, and correction paths are exposed through bounded privacy-safe inspection. |

No Phase 22 requirements are orphaned.

## Anti-Patterns Found

No unreferenced `TBD`, `FIXME`, or `XXX` markers, placeholders, or user-visible stubs were found in Phase 22 source. The scanned `return null` paths are bounded optional-input/validation outcomes. The final standard review reports 0 critical, 0 warning, and 0 info findings.

## Human Verification Required

None. All roadmap truths are programmatically observable and have passing behavioral evidence.

## Gaps Summary

No remaining gaps. Both previous blockers are closed without regression: normalized contracts now exist in the production registry flow, exact overlays enrich those contracts, and missing safety evidence fails closed.

---

_Verified: 2026-07-26T19:25:39Z_
_Verifier: the agent (gsd-verifier)_
