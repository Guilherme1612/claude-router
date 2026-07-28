---
phase: 21-authoritative-personalized-inventory
verified: 2026-07-26T18:10:50Z
status: passed
score: 19/19 must-haves verified
behavior_unverified: 0
overrides_applied: 0
gaps: []
human_verification: []
re_verification:
  previous_status: gaps_found
  previous_score: 16/16
  gaps_closed:
    - "GAP-21-01: stale Phase 11 identity and continuity-fingerprint assertions now match the approved Phase 21 D-09 contract."
  gaps_remaining: []
  regressions: []
---

# Phase 21: Authoritative Personalized Inventory Verification Report

**Phase Goal:** Users can rely on Router's inventory as a current, safe, framework-neutral representation of the capabilities actually installed in their Claude and Codex environments.
**Verified:** 2026-07-26T18:10:50Z
**Status:** passed
**Re-verification:** Yes — after Plan 21-06 gap closure

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Every installed artifact has a framework-neutral normalized record with explicit type, lifecycle, enablement, invocation, dependency, scope, and provenance fields. | ✓ VERIFIED | Phase-owned schema and four-profile portability tests pass. |
| 2 | Inert, disabled, and unknown records remain inspectable without fabricated authority. | ✓ VERIFIED | Schema, mutation, portability, and security tests pass. |
| 3 | Canonical semantic bytes are order-stable, exclude operational metadata, and remain sensitive to semantic invocation and precedence ordering. | ✓ VERIFIED | Schema/convergence tests pass; an independent verifier probe changed invocation and precedence separately and each changed canonical bytes. |
| 4 | Claude and Codex authorized roots discover required native families, compounds, configuration/instructions, and opaque future types. | ✓ VERIFIED | Adapter and portability profile tests pass. |
| 5 | Unknown adapter types stay visible and non-dispatchable without core ecosystem conditionals. | ✓ VERIFIED | Unknown-future and authored-authority tests pass. |
| 6 | Discovery cannot escape canonical roots or trust unsafe/cyclic symlinks. | ✓ VERIFIED | Fingerprint containment, access-denial, portability, and security tests pass. |
| 7 | Add/edit/rename/move/disable/replace/dependency-loss/removal have deterministic outcomes. | ✓ VERIFIED | D-19 mutation matrix passes. |
| 8 | Rename/move continuity requires declared identity or a unique exact fingerprint pair. | ✓ VERIFIED | Path fallback, exact-pair, and ambiguous N-to-M tests pass. |
| 9 | Removal, disablement, replacement, or dependency loss invalidates transitive references before callbacks. | ✓ VERIFIED | Typed closure, callback ordering, and fail-closed graph tests pass. |
| 10 | Incremental and authoritative reconciliation converge byte-for-byte across mutations and event anomalies. | ✓ VERIFIED | All four profile convergence matrices pass. |
| 11 | Startup, repair, ambiguous events, restart/root/fingerprint anomalies trigger authoritative work. | ✓ VERIFIED | Watcher trigger and bounded repair tests pass. |
| 12 | Incomplete work degrades/fails without advancing complete baselines or active authority. | ✓ VERIFIED | Incomplete-scan and paired-publication-failure retention tests pass. |
| 13 | Users can inspect bounded summary, stable-ID detail, and category availability without mutation/refresh. | ✓ VERIFIED | CLI parity/read-only tests pass and projections are wired into the dispatcher. |
| 14 | Text and JSON expose the same semantic fields and exact four-state status. | ✓ VERIFIED | CLI summary/detail parity and malformed-state fail-closed tests pass. |
| 15 | Inspection excludes raw bodies, secrets, controls, and absolute paths. | ✓ VERIFIED | Allowlist, redaction, escaping, traversal, and symlink diagnostic tests pass. |
| 16 | Runtime gaps are category-first and framework-neutral. | ✓ VERIFIED | Category grouping, filtering, and runtime-label permutation tests pass. |
| 17 | Legacy schema regression accepts portable fallback identities while equal live records remain distinct. | ✓ VERIFIED | Commit `8221087`; owned schema slice passes 17/17 and exact full-ID assertions pass. |
| 18 | Semantic bytes and exact continuity fingerprints obey separate contracts. | ✓ VERIFIED | Canonical bytes change for semantic ordering; unchanged exact source evidence preserves continuity; changed source evidence changes the fingerprint. |
| 19 | The Phase 21 focused gate contains no Phase 21 schema-contract failure and remaining failures are ownership-classified. | ✓ VERIFIED | Exact slice is 115/116; sole failure is the earlier tuple-publication seam, not inventory identity/acquisition/reconciliation/inspection behavior. |

**Score:** 19/19 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

All PLAN-declared artifacts remain present and substantive. Re-verification focused on the prior failed artifact:

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `tests/router.registry-schema.test.mjs` | D-09-aligned fallback identity and exact-source continuity regression assertions | ✓ VERIFIED | Commit `8221087` changes only this file; 17/17 tests pass. |
| `src/registry/identity.mjs` | Portable identity and exact continuity fingerprint implementation | ✓ VERIFIED | `stableCapabilityId` uses declared identity, shared origin, then portable provenance plus scope suffix; `contentFingerprint` uses authored content or sorted source fingerprints. |
| Phase 21 registry/adapters/watcher/CLI modules | Authoritative discovery, reconciliation, inspection, and safe projection | ✓ VERIFIED | Exact focused slice exercises all core Phase 21 paths; 115 Phase-owned/related checks pass. |

No `TBD`, `FIXME`, or `XXX` debt markers were found in the Phase 21 implementation/test slice.

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `tests/router.registry-schema.test.mjs` | `src/registry/identity.mjs` | `stableCapabilityId` and `contentFingerprint` | ✓ WIRED | Exact IDs and fingerprint behavior are asserted and executed. |
| adapters/fingerprint | schema/watcher | normalized observations and completeness evidence | ✓ WIRED | Discovery, containment, and watcher tests pass. |
| diff/reconcile | watcher callbacks | lifecycle changes and typed invalidation closure | ✓ WIRED | Mutation and callback-order tests pass. |
| CLI dispatcher | inventory projections/state | read-only summary/detail/availability calls | ✓ WIRED | Parity, privacy, and no-mutation tests pass. |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Produces Real Data | Status |
|---|---|---|---|---|
| Inventory CLI | active/candidate state and records | persisted watcher state plus canonical registry records | Yes; fixture-backed populated, degraded, disabled, unknown, and malformed cases | ✓ FLOWING |
| Availability projection | semantic category/runtime/scope groups | normalized registry records | Yes; four synthetic profiles and runtime permutations | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Owned registry schema contract | `rtk node --test tests/router.registry-schema.test.mjs` | 17 pass, 0 fail | ✓ PASS |
| Exact Phase 21 focused slice | `rtk node --test ...Phase 21 files...` | 115 pass, 1 fail of 116; no schema failure | ✓ PHASE 21 PASS / external seam noted |
| Independent review-warning probe | `rtk node --input-type=module -e ...` | Four distinct scoped IDs; invocation and precedence each independently change bytes | ✓ PASS |
| Full repository suite | `rtk node --test tests/*.test.mjs` | 743 pass, 19 fail, 3 skip of 765 | ⚠ NON-PHASE DEBT |

The focused failure is `mode-map stamping seeds record mapping.explicit_subjects so the mapper publishes dispatch routes`, which reaches `publishCompiledIndex` and fails at `tuple_validation_failed`. Git blame attributes the test to earlier activation commit `e9147862`; the failing manifest/verification seam is Phase 16/19 code (`d8ab4153`, `29eaabbe`). The test first proves the Phase 21 registry mapping is present and only then fails while publishing a compiled release tuple. It therefore does not falsify the Phase 21 inventory goal.

The 19 repository failures reproduce the previously reported lifecycle/controller, recovery, ancestor-watch, tuple-publication, release-artifact/settings, install, and test-mode debt. None occur in Plan 21-06's sole owned file, and the current full-suite count exactly matches its recorded 743/19/3 baseline.

### Requirements Coverage

| Requirement | Status | Evidence |
|---|---|---|
| DISC-01 | ✓ SATISFIED | Claude/Codex adapters cover commands, skills, agents, hooks, MCP/tools, plugins, config, and instructions. |
| DISC-02 | ✓ SATISFIED | Normalized schema/profile and CLI detail tests cover required fields; Plan 21-06 restores the legacy schema oracle. |
| DISC-03 | ✓ SATISFIED | D-19 mutation matrix and corrected identity/continuity assertions pass. |
| DISC-04 | ✓ SATISFIED | Four-profile event-permutation convergence and last-complete retention pass. |
| DISC-05 | ✓ SATISFIED | Typed transitive invalidation and callback ordering pass. |
| DISC-06 | ✓ SATISFIED | Category-first availability and runtime-label permutation pass. |
| DISC-07 | ✓ SATISFIED | Opaque future adapter types remain visible/inert without core changes. |
| DISC-08 | ✓ SATISFIED | Escape, symlink, authored-policy, redaction, and control-injection tests pass. |

All eight requirements occur in PLAN frontmatter and map to Phase 21 in `REQUIREMENTS.md`; none are orphaned.

### Locked Decision Coverage

D-01 through D-21 are represented by the schema, adapter, mutation, convergence, watcher, inspection, portability, and security tests. The two review warnings were checked adversarially:

- WR-01 is a test-isolation weakness only. The independent verifier probe proved invocation and precedence changes separately affect canonical bytes.
- WR-02 is a missing direct assertion only. Production `scopeSuffix` handles `user`, `project`, and `worktree`, and the independent probe produced four distinct exact stable IDs.

These warnings recommend stronger regression localization but do not show missing, stubbed, unwired, or incorrect Phase 21 behavior.

### Probe Execution

No standalone `probe-*.sh` is declared or implied for Phase 21. Behavioral evidence comes from the named Node test slices above.

### Human Verification Required

None. This is deterministic CLI/data-pipeline behavior; user-visible projection, privacy, mutation, ordering, failure retention, and state transitions are exercised by automated tests.

### Gaps Summary

The previous schema-contract gap is closed. No Phase 21 goal blocker remains. The compiled tuple-publication seam and broader repository failures are real project debt, but they predate or sit downstream/outside the authoritative personalized inventory goal and are not caused by commit `8221087`.

---

_Verified: 2026-07-26T18:10:50Z_
_Verifier: gsd-verifier_
