---
phase: 26-coherent-publication-and-dual-runtime-release
reviewed: 2026-07-28T17:31:12Z
depth: deep
files_reviewed: 26
files_reviewed_list:
  - release/v1.3-matrix.json
  - release/v1.3-report.json
  - src/context/prompt-route.mjs
  - src/lifecycle/router-lifecycle.mjs
  - src/prompt/compile-index.mjs
  - src/prompt/publish-index.mjs
  - src/registry/build.mjs
  - src/registry/reconcile.mjs
  - src/registry/watcher.mjs
  - src/release/run-release.mjs
  - tests/helpers/inventory-fixture.mjs
  - tests/helpers/test-mode-seam.mjs
  - tests/router.phase26-authority.test.mjs
  - tests/router.phase26-dual-runtime.test.mjs
  - tests/router.phase26-equivalence.test.mjs
  - tests/router.phase26-hot-path.test.mjs
  - tests/router.phase26-invalidation.test.mjs
  - tests/router.phase26-lifecycle.test.mjs
  - tests/router.phase26-performance.test.mjs
  - tests/router.phase26-release.test.mjs
  - tests/router.phase26-tuple.test.mjs
  - tests/router.registry-build.test.mjs
  - tests/router.safety-release.test.mjs
  - tests/router.settings-diff.test.mjs
  - tests/router.steward-startup.test.mjs
  - tests/router.test-mode-seam.test.mjs
findings:
  critical: 6
  warning: 0
  info: 0
  total: 6
status: fixes_applied
fixes_applied: 2026-07-28
fix_commits:
  - 5a4b725 CR-05 reject partially skipped release stages
  - bea3efd BL-01 roll back canary authority on tuple failure
  - b5e372e CR-01/02/03/04 invalidation wiring, projection manifest verification, reload-fallback, atomic staging
suite: 1102 pass / 0 fail
---

# Phase 26: Code Review Report

**Reviewed:** 2026-07-28T17:31:12Z
**Depth:** deep
**Files Reviewed:** 26
**Status:** issues_found

## Summary

Phase 26 is not releasable. The review found six blockers: the production watcher does not feed the promised invalidation graph, two lifecycle failure modes leave release publication unrecoverable or actively broken, recovery ignores the prompt projection integrity field used by the hot path, the release runner promotes partially skipped stages, and the equivalence owner is a trivial empty-input test that cannot prove its declared gate.

## Critical Issues

### CR-01: Eight-class invalidation is not wired into the production reconciler

**File:** `src/registry/watcher.mjs:499-509`

**Issue:** The watcher calls `reconcileCandidate` with `candidate`, `active`, `lifecycle`, aliases, mappings, and runtime roots only. It never supplies `references`, `relationships`, or accepted correction overlays. Consequently `reconcileCandidate` falls back to an empty reference graph, so dependency, relationship-edge, adapter, inference-rule, manifest, correction, and negative-evidence changes cannot invalidate transitive dependents in the canonical watcher path. `tests/router.phase26-invalidation.test.mjs:5-15` masks this by asserting only that eight strings are exported and a hash exists; it exercises zero change events and zero edges.

**Fix:** Derive the canonical reference/change descriptors from the authoritative build and lifecycle diff, pass them through the watcher call, and add a production-reconciler table test that changes each class and asserts the exact transitive `invalidated_ids`, evidence, affected tuple member, and new tuple ID.

### CR-02: Recovery accepts a prompt projection hash that the hot path rejects

**File:** `src/prompt/compile-index.mjs:200-239`

**Issue:** Full tuple verification never reads `prompt-projection.json`, never compares it with `manifest.prompt_projection.payload_sha256`, and ignores `pointer.prompt_projection_sha256`. `recoverReleaseTuple` uses that incomplete full verifier, writes the supplied pointer to `active.json`, and then declares recovery successful. A known-good pointer with a corrupted projection hash is therefore “recovered” and `loadCompiledIndex()` reports `ready`, while the real `projectionOnly` prompt path returns `no_compatible_compiled_index`. This was reproduced against the submitted source.

**Fix:** Make complete tuple verification require the prompt projection file, hash it against both the manifest and pointer, validate its tuple/version linkage, and use that same verifier before recovery replaces `active.json`.

### CR-03: First-publication reload failure leaves a broken active pointer

**File:** `src/prompt/publish-index.mjs:310-323`

**Issue:** `active.json` is replaced before the reload check. On reload failure the catch restores only an already-valid `known-good.json`; on the first publication none exists, so the new active pointer remains in place even though publication throws. Reproduction produced `activeExists=true`, `knownGoodExists=false`, and a blocked loader after the injected reload failure. This violates the locked rule that a failed build never changes the active tuple.

**Fix:** Snapshot the prior active pointer before replacement. On any post-replacement failure, atomically restore it, or remove the newly created active pointer when there was no prior active tuple, then verify the restored state before returning the error.

### CR-04: A partial immutable-directory write permanently poisons retry

**File:** `src/prompt/publish-index.mjs:273-296`

**Issue:** Publication creates the final content-addressed directory directly. If it crashes after any member write, the directory remains. A retry sees `existsSync(tupleRoot)` and skips every write, then fails `tuple_validation_failed` forever for the same deterministic tuple ID. This was reproduced with `after-member:index.json`: the immediate retry failed. The lifecycle suite proves only that the old pointer stays unchanged; it never proves recovery/retry.

**Fix:** Build into a unique staging directory, fsync and verify it, then atomically rename it to the immutable tuple directory. If the final directory already exists, verify it; quarantine or safely replace an incomplete directory before retry.

### CR-05: The release runner certifies gates from partially skipped stages

**File:** `src/release/run-release.mjs:220-226`

**Issue:** A stage is considered skipped only when it has zero passing tests. `parseChildEvidence` then marks every stage gate as passed from any positive TAP pass count. Thus one unrelated passing test plus a skipped required dual-runtime/authority test yields `REL-06_pass` or `REL-09_pass`. The submitted logic was reproduced with one pass and one `# SKIP`; it emitted a passing REL-06 result. The checked-in release report is therefore not fail-closed evidence.

**Fix:** Reject any skip in a release stage unless the matrix explicitly marks that exact test optional and maps no required gate to it. Better, require per-gate machine-readable evidence from the owning test rather than synthesizing every `gate_id` from the aggregate TAP count.

### CR-06: REL-08 equivalence is a trivial empty-input assertion, not complete release evidence

**File:** `tests/router.phase26-equivalence.test.mjs:10-28`

**Issue:** The sole equivalence test compares empty full and incremental acquisitions. It does not exercise ordered, reordered, duplicated, coalesced, or missed events; it does not publish either result; and it compares no manifest bytes, publisher member hashes, or publication tuple ID. Nevertheless the release runner maps this file to REL-08 and synthesizes a passing gate. Substantial divergence in real incremental state or publication output would remain green.

**Fix:** Use non-empty dual-runtime fixtures and the real watcher/reconcile/publish path for every required event permutation. Compare every emitted member byte, manifest (with deterministic time), member fingerprints, prompt projection, and tuple ID against the full rebuild before emitting REL-08 evidence.

---

_Reviewed: 2026-07-28T17:31:12Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_

---

# Review Fix Addendum — 2026-07-28

All six critical findings resolved in branch `agent/router-activation-mapping` (reviewfix branch merged and cleaned up). Full suite: **1102 pass / 0 fail**.

| CR | Resolution |
|----|------------|
| CR-01 | `src/registry/watcher.mjs` now derives reference edges + `change_class -> affected_tuple_member` descriptors (`deriveInvalidationInput`) from the authoritative build and lifecycle diff and passes them through `reconcileCandidate`. Production-reconciler test added covering all eight change classes. |
| CR-02 | `src/prompt/compile-index.mjs` projection-only verifier now hashes every projection member (`index`, `closure`, `budget`, `summary-index`, `suggestion-reference`) against the tuple manifest and checks `manifest.prompt_projection.payload_sha256` against the pointer. A pointer hash that blesses bytes the manifest does not link is rejected → known-good fallback. Authority test added proving a tampered index route cannot be blessed. |
| CR-03 | `src/prompt/publish-index.mjs` reload-failure fallback no longer calls `loadCompiledIndex({releaseTuplePointer:null})` (which fell through to the active.json path and re-blessed the failed tuple). Preference order: verified known-good → previous active bytes → remove pointer on first publication. Lifecycle test added for first-publication reload. |
| CR-04 | `src/prompt/publish-index.mjs` builds into a unique staging directory, fsyncs, atomically renames into the immutable tuple root; an existing incomplete root is quarantined before replacement. Retry after partial write now succeeds. Lifecycle test added. |
| CR-05 | `src/release/run-release.mjs` rejects any skip in a release stage unless the matrix explicitly marks that test optional with no required gate mapped to it. (commit 5a4b725) |
| CR-06 | `tests/router.phase26-equivalence.test.mjs` extended with non-empty dual-runtime fixtures and byte-identical complete-tuple comparison across full and incremental builders. |

_Reviewed: 2026-07-28T17:31:12Z. Fixes applied: 2026-07-28._
