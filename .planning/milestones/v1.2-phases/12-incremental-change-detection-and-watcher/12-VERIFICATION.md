---
phase: 12-incremental-change-detection-and-watcher
verified: 2026-07-15T13:26:12Z
status: passed
score: 13/13 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 9/10
  gaps_closed:
    - "Normal filesystem changes trigger one scan/reconcile within two seconds across every supported inventory root."
    - "The deployed watcher consumes the evidence-gated lifecycle diff through incremental construction rather than bypassing the incremental path."
  gaps_remaining: []
  regressions: []
---

# Phase 12: Incremental Change Detection and Watcher Verification Report

**Phase Goal:** Users see additions, edits, moves, disables, dependency changes, and deletions reflected promptly with full-build-equivalent results.
**Verified:** 2026-07-15T13:26:12Z
**Status:** passed
**Re-verification:** Yes — after Plan 12-04 gap closure
**Verifier:** generic-agent workaround following the `gsd-verifier` role contract

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Every supported mutation receives one deterministic primary lifecycle classification with ordered facets. | VERIFIED | `diffFingerprintTrees` remains the sole classifier; add/edit/disable/dependency/permission/scope/delete and D-01–D-04 behavioral tests pass. |
| 2 | Strong evidence preserves identity across rename/move while weak similarity never establishes continuity. | VERIFIED | Rename/move provenance and remove-plus-add possible-match tests pass. |
| 3 | Fingerprint snapshots and lifecycle output are portable and deterministic. | VERIFIED | Reversed-order, containment, cache validation, access-denial, and portable-byte tests pass. |
| 4 | Full and incremental construction return byte-identical complete results after every supported mutation sequence. | VERIFIED | REG-03 mutation-sequence test passes and both paths converge through `assembleRegistry`. |
| 5 | Incremental acquisition reuses unchanged observations without forking canonical semantics. | VERIFIED | `refreshIncrementalAcquisition` replaces only evidence-named logical-root slices; composition and REG-03 tests pass. |
| 6 | Removal/replacement consumes evidence-gated lifecycle output and keeps candidates inactive. | VERIFIED | Diff validation, dirty-root selection, and `summary.activated: false` are exercised by focused tests. |
| 7 | Normal changes reconcile within two seconds despite duplicate, continuous, or filename-less hints. | VERIFIED | Debounce/flood fake-clock test passes; global and project live controller tests complete within the two-second assertion window. |
| 8 | Startup and periodic repair detect missed changes within five minutes independently of watch creation success. | VERIFIED | Startup is unconditional, repair defaults to 300,000 ms, the exact boundary test passes, and restart repair passes. |
| 9 | Reconciliation is single-flight, schedules one follow-up, preserves the fingerprint baseline on failure, and closes resources. | VERIFIED | Named concurrency, failure, and close behavioral tests pass. |
| 10 | Installation owns a live detached controller with readiness, restart, rollback, uninstall, and prompt-time separation. | VERIFIED | Lifecycle subprocess, transaction, ownership, and prompt-hook isolation tests pass. |
| 11 | The installed controller passes the authoritative lifecycle diff into incremental acquisition and canonical assembly. | VERIFIED | `createRegistryWatcher` computes the real diff; `runRegistryWatcher` wires `createRegistryReconciler`; the deployed reconciler test proves exact diff identity and no `buildFullRegistry` call exists in post-construction reconciliation. |
| 12 | Initially absent project Claude/Codex inventories reconcile through ancestor hints within two seconds. | VERIFIED | Installed config contains both adapter-compatible project logical roots, `.claude`/`.codex` filters, and common ancestor watch path; live creation of each inventory succeeds under a 2,000 ms timeout while repair is 10,000 ms. |
| 13 | Startup/repair share incremental reconciliation and failed publication preserves both baselines. | VERIFIED | All watcher work routes through one reconcile callback; the behavioral test proves report-publication failure retains the acquisition baseline, while coordinator failure tests prove fingerprint baseline preservation. |

**Score:** 13/13 truths verified (0 present-but-behavior-unverified)

## Required Artifacts

| Artifact | L1 Existence | L2 Substance | L3 Wiring | Status |
|---|---|---|---|---|
| `src/registry/fingerprint.mjs` | 231 lines | Portable scan/cache plus stable `root_missing` evidence | Used by watcher scans and state persistence | VERIFIED |
| `src/registry/diff.mjs` | 169 lines | Deterministic D-01–D-04 classifier | Imported directly by deployed watcher | VERIFIED |
| `src/registry/build.mjs` | 206 lines | Acquisition, dirty-root refresh, full/incremental entry points, canonical assembly | Imported by installer and deployed reconciler | VERIFIED |
| `src/registry/watcher.mjs` | 251 lines | Debounce, repair, single-flight, ancestor routing, incremental reconciler | Installed and launched by lifecycle controller | VERIFIED |
| `src/lifecycle/router-lifecycle.mjs` | 410 lines | Transactional install and global/project controller configuration | Wired through CLI and live subprocess tests | VERIFIED |
| Phase 12 test files | Present | 58 focused tests across schema, adapters, diff, build, watcher, lifecycle | Included in repository suite | VERIFIED |

The artifact-query helper incorrectly reports ESM `export function` declarations as missing when PLAN frontmatter uses an export array. Direct source inspection and successful named imports in the passing tests disprove those parser false positives.

## Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `watcher.mjs` | `diff.mjs` | `diffFingerprintTrees(baseline, current)` | WIRED | Real lifecycle object is passed unchanged to reconcile. |
| `watcher.mjs` | `build.mjs` | acquire → refresh → assemble | WIRED | Acquisition baseline advances only after both atomic publications. |
| `router-lifecycle.mjs` | project watcher roots | ancestor `watchPath` plus normalized include prefixes | WIRED | Exact/descendant routing, unrelated suppression, and filename-less fan-out pass. |
| `fingerprint.mjs` | absent project roots | root-level `ENOENT` to portable empty evidence | WIRED | Real scanner produces stable root hashes and `root_missing` while the sibling root exists. |
| full/incremental builders | canonical registry | shared `assembleRegistry` | WIRED | Complete-return byte parity passes for supported mutation sequences. |

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Phase 12 focused gate | `node --test tests/router.registry-schema.test.mjs tests/router.adapters.test.mjs tests/router.registry-diff.test.mjs tests/router.registry-build.test.mjs tests/router.registry-watcher.test.mjs tests/router.lifecycle.test.mjs` | 58 passed, 0 failed, 3.16 s | PASS |
| Full regression gate | `node --test tests/*.test.mjs` | 435 passed, 0 failed, 19.44 s | PASS |
| Initially absent project roots | Live lifecycle subtest in focused gate | Both candidate updates occurred inside the 2 s wait; repair configured to 10 s | PASS |
| Failure baseline preservation | Deployed reconciler plus watcher failure subtests | Acquisition and fingerprint baselines both retained across failure | PASS |
| Real scanner missing-root handling | Missing configured roots subtest | Stable empty hashes and portable `root_missing`; escape rejected | PASS |

## Probe Execution

No Phase 12 probe is declared and no conventional `scripts/*/tests/probe-*.sh` exists. The phase uses direct Node behavioral tests.

## Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|---|---|---|---|
| CHG-01 | 12-01, 12-02, 12-04 | SATISFIED | Complete mutation matrix, identity continuity, precedence, facets, and deterministic ordering pass. |
| REG-03 | 12-02, 12-03, 12-04 | SATISFIED | Shared acquisition/assembly and full-vs-incremental complete-return parity pass; deployed reconciliation now uses that path. |
| CHG-02 | 12-03, 12-04 | SATISFIED | Global and initially absent project roots update within 2 s; exact five-minute repair and restart evidence pass. |

No orphaned Phase 12 requirement exists.

## Prohibition and Anti-Pattern Review

- Prompt-time router source contains no `fs.watch`, fingerprint scan, full registry build, or watcher-controller work.
- Production lifecycle remains standard-library-only and offline; no watcher, database, network, or supervisor dependency was added.
- Notifications remain hints; complete scans and persisted fingerprint state remain authority.
- No raw watcher event name or similarity heuristic is used for lifecycle identity.
- No unreferenced `TBD`, `FIXME`, or `XXX` marker exists in Phase 12 production or test files.

## Disconfirmation Pass

- **Potential partial requirement checked:** initially absent project inventories could have waited for repair; the live test uses a 2 s deadline against a 10 s repair interval and passes.
- **Potential misleading test checked:** source-only diff wiring could pass while runtime still rebuilt fully; the deployed reconciler test receives the exact lifecycle object, and the executable path contains no post-construction `buildFullRegistry` call.
- **Potential uncovered error path checked:** candidate/report publication could advance only one baseline; paired behavioral tests prove neither acquisition nor fingerprint baseline advances after failure.
- **Residual observation:** the live subprocess test proves latency and candidate content but does not independently serialize a clean full result inside that same test. REG-03 is nevertheless behaviorally established by the exhaustive mutation-sequence test, and the executable key link to that shared assembly path is separately exercised; this is not a goal gap.

## Human Verification Required

None. All Phase 12 truths are deterministic and exercised by automated behavioral evidence.

## Gaps Summary

Both prior wiring gaps are closed. The deployed controller now consumes authoritative lifecycle diffs through incremental acquisition, and configured project inventories that are absent at startup are observed through filtered ancestor watches within the required latency. No blocking gaps or regressions remain.

---

_Verified: 2026-07-15T13:26:12Z_
_Verifier: generic-agent workaround for gsd-verifier_
