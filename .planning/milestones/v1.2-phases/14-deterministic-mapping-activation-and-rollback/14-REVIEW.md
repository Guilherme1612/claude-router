---
phase: 14-deterministic-mapping-activation-and-rollback
reviewed: 2026-07-16T00:00:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - calibration-tasks.json
  - install-router.mjs
  - router.calibrate.mjs
  - src/cli/router-control.mjs
  - src/lifecycle/router-lifecycle.mjs
  - src/registry/activate.mjs
  - src/registry/map.mjs
  - src/registry/validate.mjs
  - src/registry/watcher.mjs
  - tests/router.calibration-evolution.test.mjs
  - tests/router.calibration-graph.test.mjs
  - tests/router.control-cli.test.mjs
  - tests/router.lifecycle.test.mjs
  - tests/router.registry-activate.test.mjs
  - tests/router.registry-map.test.mjs
  - tests/router.registry-watcher.test.mjs
  - tests/router.safety-release.test.mjs
findings:
  critical: 8
  warning: 3
  info: 0
  total: 11
status: issues_found
---

# Phase 14: Code Review Report

**Reviewed:** 2026-07-16T00:00:00Z
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

## Summary

The submitted implementation is not safe to ship. The installed watcher never receives the configuration that enables Phase 14 activation, and the in-repository activation path has fail-open ambiguity, evidence-binding, recovery, concurrency, and audit-durability defects. Focused re-review confirms that Phase 14 mapping fixtures now execute through the mapper and contribute to threshold 23, and bounded mapping inputs are canonical at the 127/128/129 boundary.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Installed controllers never enable activation

**Classification:** BLOCKER
**File:** `src/lifecycle/router-lifecycle.mjs:217-240`
**Proof:** `createRegistryReconciler` runs mapping, verification, recovery, and activation only inside `if (config.activation_root)` (`src/registry/watcher.mjs:284`), but the installer-generated `controllerConfig` contains neither `activation_root` nor `active_path`. Consequently the normal installed controller always skips the entire Phase 14 activation branch and also reads a synthetic empty active registry. The deployment tests only prove module importability, not that activation is configured.
**Fix:** Add the controller-owned activation root and active registry/pointer configuration to the installed config, include them in configuration fingerprint/readiness assertions, and add an installer integration test that performs an eligible reconciliation and observes an immutable version plus `active.json` replacement.

### CR-02: Ambiguous mappings pass both watcher and verification checks

**Classification:** BLOCKER
**File:** `src/registry/watcher.mjs:293-299`
**Proof:** `mapCandidateRegistry` emits ambiguity at `mapping.summary.disposition` and in `mapping.subjects` (`src/registry/map.mjs:343-364`). The watcher instead checks `mapping.disposition` and `mapping.results`, neither of which exists. `mapping_integrity` repeats the same wrong shape (`src/registry/validate.mjs:40`). Therefore a report containing ambiguous subjects is treated as unambiguous, receives a passing mapping gate, and can activate.
**Fix:** Define one validated mapping schema and check `mapping.summary.disposition === 'ambiguous'` plus `mapping.subjects.some(...)` in both watcher and gate producer. Add an end-to-end test using the real mapper with conflicting explicit claims and assert that neither verifier nor activator is called.

### CR-03: Activation accepts test-only or evidence for a different candidate

**Classification:** BLOCKER
**File:** `src/registry/activate.mjs:18-20`
**Proof:** `trusted()` checks only booleans, expiry, and gate IDs. It does not reject `verification.test_only === true`, validate `verification.verification_fingerprint`, or compare candidate, reconciliation, mapping, and policy fingerprints to the objects being activated. The exported test verifier deliberately produces `trusted: true` and `test_only: true`, and the production activation tests activate with that evidence (`tests/router.registry-activate.test.mjs:39-49`). A passing verification for candidate A can therefore authorize candidate B, or any caller can use test-only evidence.
**Fix:** Recompute and compare every bound fingerprint inside `activateCandidate`, require the production verification policy/runner identities, reject `test_only`, verify the evidence fingerprint, and move test activation behind an explicitly test-only activation factory rather than weakening the production primitive.

### CR-04: The incremental/full-equivalence gate does not test equivalence

**Classification:** BLOCKER
**File:** `src/registry/validate.mjs:38`
**Proof:** The gate named `incremental_full_equivalence` passes whenever `candidate.schema_version === 1`; it never builds a full registry or compares it with the incrementally produced candidate. Any divergent or incomplete incremental candidate with schema version 1 passes this required activation gate.
**Fix:** Run repository-owned full acquisition/build against the same snapshot and compare canonical bytes/fingerprints with the incremental candidate, emitting both fingerprints and a mismatch reason. Add a negative test with a schema-valid but divergent incremental candidate.

### CR-06: Rollback and recovery treat integrity as compatibility and known-good evidence

**Classification:** BLOCKER
**File:** `src/registry/activate.mjs:86-92`
**Proof:** Recovery selects the newest directory whose hashes match, based on mutable directory mtime. `verifyVersion` does not parse or validate `verification.json`, freshness, production runner identities, policy compatibility, or passing disposition. `previewRollback` uses the same integrity-only verdict (`src/registry/activate.mjs:102-106`). Consequently expired, test-only, policy-incompatible, or otherwise non-known-good versions are valid recovery and rollback targets, violating the compatibility and last-known-good contract.
**Fix:** Introduce a compatibility verifier that validates the exact required manifest set, parses bound production verification evidence, checks policy/schema compatibility and known-good status, and use it for recovery, preview, and execution. Select history from authenticated manifest metadata/audit sequence rather than directory mtime.

### CR-07: Pointer replacement is not a cross-process compare-and-swap

**Classification:** BLOCKER
**File:** `src/registry/activate.mjs:60-74`
**Proof:** `expectedSequence` is checked before the temporary file is written and destination is reverified, but the active pointer is never reread immediately before `renameSync`. Two processes can both read sequence N, both pass the check, and both rename pointers with sequence N+1; the later process silently overwrites the earlier activation/rollback. Destination reverification does not protect pointer concurrency.
**Fix:** Serialize mutations with an owned lock created atomically (`wx`) and held through pointer directory fsync, then reread and compare the active pointer under that lock. Add a multi-process race test proving exactly one writer succeeds for a given expected sequence.

### CR-08: Blocked startup recovery still permits a new pointer publication

**Classification:** BLOCKER
**File:** `src/registry/watcher.mjs:283-299`
**Proof:** A recovery result of `blocked` is explicitly included in the accepted statuses at line 288, leaving `activation_status` as `preserved`. The subsequent condition only prevents activation for `recovery_required`, so an eligible candidate proceeds through verification and activation even though startup could not establish any valid active/known-good authority. This contradicts the fail-closed recovery contract.
**Fix:** Treat every status other than `healthy` or successfully `recovered` as activation-blocking, retain the block reason in controller status, and retry recovery rather than setting `recovered = true`. Add a test where recovery returns `blocked` and assert mapper/verifier/activator are never invoked.

### CR-09: Audit failure occurs after rollback authority has already changed

**Classification:** BLOCKER
**File:** `src/registry/activate.mjs:109-116`
**Proof:** `replaceActivePointer` commits and fsyncs `active.json` before `appendFileSync` is attempted. If the audit path is unwritable, full, or interrupted, `appendFileSync` throws after authority changed; the CLI catches this as `internal_error`, while the rollback actually succeeded and no durable audit event exists. The append itself is not fsynced, so a reported success can also lose its required audit record on crash.
**Fix:** Use a crash-consistent operation journal: durably write/fsync a pending audit record before pointer publication, fsync a completion record after publication, and recover incomplete operations deterministically. At minimum, return an explicit `recovery_required` outcome without misreporting the mutation and make audit durability part of the mutation protocol.

## Warnings

### WR-01: Diff silently omits changes beyond 256 identifiers

**Classification:** WARNING
**File:** `src/cli/router-control.mjs:70-83`
**Proof:** Record and mapping identifier sets are sliced to `MAX_DIFF` before comparison, but the result contains no truncation flag, total count, continuation token, or warning. A rollback preview can therefore claim a bounded change list while silently hiding safety-relevant changes outside the first 256 sorted IDs.
**Fix:** Report totals and `truncated: true` with a stable warning/reason, or implement deterministic pagination. Rollback preview should make truncation conspicuous before confirmation.

### WR-02: Rollback preview can crash on an invalid active source version

**Classification:** WARNING
**File:** `src/cli/router-control.mjs:161-170`
**Proof:** `previewRollback` validates only that the active pointer is syntactically present and the destination is valid. The CLI then calls `projection` on `source` even when `readVersion` returned only an invalid verdict, causing access to `source.manifest.created_at`. The top-level CLI converts this expected unsafe-state case into an opaque `internal_error` exit rather than a stable recovery verdict.
**Fix:** Require source compatibility in `previewRollback` and return a structured `invalid_active_version`/`recovery_required` result before constructing projections. Add a subprocess test with a valid pointer referencing a corrupt source version.

### WR-03: Custom lexical score ceilings are fingerprinted but ignored

**Classification:** WARNING
**File:** `src/registry/map.mjs:56, 166-174`
**Proof:** The policy exposes and fingerprints `scores.lexical_maximum`, but `lexicalScore()` multiplies overlap by the hard-coded value `8000`. A caller can lower or raise the declared ceiling and receive a report whose policy fingerprint claims the new policy while scoring with the default. Existing tests override lexical thresholds and margins, but never override `lexical_maximum`.
**Fix:** Pass the canonical policy ceiling into `lexicalScore()` (or remove the unsupported policy field), and add tests proving custom ceilings affect scores, bands, thresholds, and report fingerprints consistently.

## Resolved Findings (not counted)

### Former CR-05: Phase 14 calibration fixtures were not evaluated as mapping fixtures

**Resolution:** Resolved by the current mapper-specific calibration branch and release accounting. `tests/router.safety-release.test.mjs` now requires `Combined: ... / 32 (threshold: 23)`, and the focused release test passes with the Phase 14 mapping subset at 2/2.

### Former CR-10: Bounded mapping inputs were truncated before canonical ordering

**Resolution:** Resolved by commits `9f6c1b7` and `5382bb1`. Complete contributing collections are canonicalized before the 128-entry bound, and focused tests prove permutation stability at 127, 128, and 129 entries for advisory evidence, existing mappings, lifecycle events, and record-owned mapping arrays.

---

_Reviewed: 2026-07-16T00:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
