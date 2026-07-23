---
phase: 14-deterministic-mapping-activation-and-rollback
verified: 2026-07-16T00:30:00Z
status: passed
score: 12/12 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 3/12
  gaps_closed:
    - "Installed controllers automatically map and activate eligible safe candidates"
    - "Ambiguous mappings fail closed before verification or activation"
    - "Activation accepts only complete fresh production verification bound to the exact candidate, reconciliation, mapping, and policy"
    - "Required equivalence and calibration gates test the behavior named by each gate"
    - "Pointer publication is a cross-process compare-and-swap"
    - "Failed validation or blocked recovery preserves prior authority"
    - "Recovery and rollback select only compatible verified known-good versions"
    - "Rollback failure changes nothing and rollback success has durable truthful audit evidence"
    - "Operator inspection and rollback preview remain complete and stable for large and corrupt histories"
  gaps_remaining: []
  regressions: []
non_blocking_findings:
  - "WR-03: mapping policy exposes lexical_maximum but lexicalScore still uses the default 8000 ceiling"
---

# Phase 14: Deterministic Mapping, Activation, and Rollback Verification Report

**Phase Goal:** Users get explainable automatic mappings for safe changes and can atomically activate or restore verified registry versions.
**Verified:** 2026-07-16T00:30:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure plans 14-04 through 14-07

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Explicit aliases, stable identities, inheritance, lexical signals, and advisory evidence are evaluated in deterministic non-overriding order. | ✓ VERIFIED | `src/registry/map.mjs` implements ordered authority tiers and canonical bounded inputs. `router.registry-map.test.mjs` exercises D-01 through D-09 plus 127/128/129 permutation boundaries. |
| 2 | Mapping reports expose confidence and evidence, and every mapped target is safe and present in the exact candidate. | ✓ VERIFIED | Mapping subjects carry dispositions, scores, evidence, and target-safety decisions. Exact-candidate safety and absent/unsafe targets are behaviorally rejected by the focused mapper suite. |
| 3 | Installed controllers automatically map, verify, and activate eligible safe candidates. | ✓ VERIFIED | `router-lifecycle.mjs` owns `activation_root` and `active_path`; the watcher runs map → production verification → activation. Installer/watcher tests bootstrap an immutable version and `active.json`. |
| 4 | Ambiguous mappings fail closed before verification and activation. | ✓ VERIFIED | `isCanonicalMappingSafe` checks `summary.disposition`, ambiguity count, and every canonical subject. Watcher tests prove real ambiguity and malformed optimistic summaries stop before verifier/activator calls. |
| 5 | Activation evidence is production-only, authentic, fresh, and bound to exact inputs. | ✓ VERIFIED | `activate.mjs` independently validates production disposition, runner identities, freshness, gate completeness, verification fingerprint, and candidate/reconciliation/mapping/policy fingerprints. Substitution and unauthenticated evidence tests pass. |
| 6 | Incremental/full equivalence and mapping calibration gates exercise their named behavior. | ✓ VERIFIED | The equivalence runner compares canonical candidate, incremental, and full registry bytes. Mapper calibration fixtures are evaluated through `mapCandidateRegistry`; calibration reports Phase 14 mapping 2/2 and combined 31/32 against threshold 23. |
| 7 | Immutable bundles are fully written and directory-synced before pointer publication. | ✓ VERIFIED | Manifest-last bundle staging, file/directory fsync, atomic rename, destination reverification, and failure preservation are implemented and covered by activation tests. |
| 8 | Pointer publication is a cross-process compare-and-swap. | ✓ VERIFIED | One owned mutation lock spans pointer reread, expected-sequence comparison, rename, and directory sync. A two-process race test proves exactly one winner for a shared expected sequence. |
| 9 | Failed validation or blocked recovery preserves prior authority. | ✓ VERIFIED | Invalid/stale verification and watcher recovery-block tests assert exact active-pointer preservation and retry recovery before later activation. |
| 10 | Recovery and rollback choose only compatible verified known-good versions in immutable deterministic order. | ✓ VERIFIED | Semantic verification rejects integrity-valid but test-only/policy-incompatible history; equal timestamps order by stable version ID rather than mutable mtime. Focused recovery/rollback tests pass. |
| 11 | Rollback failure changes nothing and rollback success has durable truthful audit evidence. | ✓ VERIFIED | A durable pending journal precedes CAS; completion is fsynced after publication and interrupted completion is recoverable. Failure-injection tests cover pre-publication and post-publication boundaries. |
| 12 | Operator status, diff, evidence, verification, and rollback previews are complete and stable for bounded, large, and corrupt histories. | ✓ VERIFIED | The CLI emits totals, returned counts, truncation limits, and next offsets from one canonical result for JSON/text. Large-history parity and corrupt-active-source subprocess tests pass with stable unsafe verdicts and exits. |

**Score:** 12/12 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Status | Evidence |
|---|---|---|
| `src/registry/map.mjs` | VERIFIED | Substantive deterministic mapper, wired into watcher, including canonical pre-truncation ordering. |
| `src/registry/validate.mjs` | VERIFIED | Eight production gates, canonical mapping safety, behavioral equivalence, signed input/evidence fingerprints. |
| `src/registry/activate.mjs` | VERIFIED | Authenticated immutable activation, cross-process CAS, semantic known-good recovery, and durable rollback journal. |
| `src/registry/watcher.mjs` | VERIFIED | Installed fail-closed map/verify/recover/activate orchestration with retry semantics. |
| `src/cli/router-control.mjs` | VERIFIED | Canonical read/preview/rollback controls with complete bounded metadata and corrupt-state taxonomy. |
| `src/lifecycle/router-lifecycle.mjs` and `install-router.mjs` | VERIFIED | Dual-runtime module deployment plus owned activation/controller configuration. |
| Phase 14 focused tests | VERIFIED | Mapper, activation, watcher, lifecycle, CLI, calibration, and release behaviors execute successfully. |

### Key Link Verification

| From | To | Via | Status |
|---|---|---|---|
| Lifecycle installer | Watcher | Owned controller config containing activation root and active pointer path | WIRED |
| Watcher | Mapper → verifier → activator | Canonical mapping safety and exact bound production evidence | WIRED |
| Verification producer | Activation trust boundary | Gate IDs, runner identities, freshness, input fingerprints, verification fingerprint | WIRED |
| Pointer mutation paths | `active.json` | Shared cross-process mutation lock and atomic rename/directory fsync | WIRED |
| Rollback preview | Rollback execution | Semantic known-good verdict, exact typed confirmation, fresh preview fingerprint | WIRED |
| Canonical CLI result | JSON and text renderers | Shared totals, truncation metadata, reason codes, and exit taxonomy | WIRED |

### Behavioral Verification

| Command | Result |
|---|---|
| `node --test tests/router.registry-map.test.mjs tests/router.registry-activate.test.mjs tests/router.registry-watcher.test.mjs tests/router.control-cli.test.mjs tests/router.lifecycle.test.mjs tests/router.calibration-evolution.test.mjs tests/router.calibration-graph.test.mjs tests/router.safety-release.test.mjs` | 105 passed, 0 failed |
| `node --test tests/*.test.mjs` | 502 passed, 0 failed in 19.85s |
| `node --test tests/router.registry-map.test.mjs tests/router.registry-activate.test.mjs tests/router.registry-watcher.test.mjs tests/router.control-cli.test.mjs tests/router.lifecycle.test.mjs` | Independent bounded retry: 76 passed, 0 failed |
| `node router.calibrate.mjs` | 31/32; threshold 23; original 10/10; codebase 8/8; evolution 2/3; Phase 14 mapping 2/2; exit 0 |
| `git diff --check` | exit 0 |

### Requirements Coverage

| Requirement | Status | Evidence |
|---|---|---|
| MAP-01 | SATISFIED | Deterministic authority ordering, confidence/evidence, exact-candidate target safety, ambiguity fail-closed behavior, and mapper-specific calibration all pass. |
| ACT-01 | SATISFIED | Bound production verification, immutable activation, cross-process atomic pointer authority, known-good recovery, durable rollback, and complete operator controls all pass. |

### Re-verification of Review Findings

The current `14-REVIEW.md` critical findings were treated as hypotheses rather than accepted as current state. CR-01 through CR-09 and WR-01/WR-02 are contradicted by the current implementation plus named behavioral regressions above. Former CR-05 and CR-10 remain closed by calibration accounting and boundary permutation tests.

WR-03 remains a valid non-blocking follow-up: `DEFAULT_MAPPING_POLICY` exposes `scores.lexical_maximum`, while `lexicalScore()` still multiplies by the literal `8000`. The shipped default remains deterministic and its exact policy is fingerprinted, so this does not invalidate MAP-01 or any Phase 14 success criterion; callers should not treat a custom lexical ceiling as supported until the scorer consumes it or the field is removed.

### Runtime Boundary

No live controller config exists at the repository installer's normal user-level Claude/Codex controller paths in this environment, so no existing user installation was mutated during verification. The owned install/runtime boundary is instead exercised by the lifecycle and watcher integration tests, including controller-owned activation paths, immutable version bootstrap, and active-pointer publication.

### Human Verification Required

None. All behavior-dependent Phase 14 truths have executable behavioral evidence.

## Conclusion

Phase 14 achieves its goal. MAP-01 and ACT-01 are satisfied, all previous verification gaps are closed, focused and full regressions pass, and no human-only verification remains. WR-03 is retained as non-blocking technical debt for custom mapping-policy support.
