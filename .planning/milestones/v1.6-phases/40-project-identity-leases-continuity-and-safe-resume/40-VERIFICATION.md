---
phase: 40-project-identity-leases-continuity-and-safe-resume
verified: 2026-08-08T11:00:00Z
status: passed
score: 6/6 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 40: Project Identity, Leases, Continuity, and Safe Resume Verification Report

**Phase Goal:** Operators can persist, inspect, revoke, and safely resume bounded project-goal authority without stale or foreign state acting.
**Verified:** 2026-08-08T11:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

The 6 LEASE requirements (LEASE-01..06) are the verification target. Each is mapped to its Roadmap Success Criterion and verified against the codebase + the phase-40 lease test files (not the flaky install/perf/dual-runtime suite).

| # | Truth (Requirement) | Status | Evidence |
|---|----------------------|--------|----------|
| 1 | LEASE-01: Continuity/authority bind to repo, worktree, runtime, goal, schema generation, project fingerprint so foreign/stale state cannot authorize | ✓ VERIFIED (with deviation note) | `src/lease/identity.mjs` `computeLeaseFingerprint` hashes 5 axes (repo, worktree, runtime, schema_generation, project_fingerprint) via sha256+stableStringify; rejects null projectFingerprint. `findByFingerprint` matches only the exact hash. Test `router.lease-identity.test.mjs` ok 32 asserts each axis changes the hash and isolation holds. **Deviation:** `goal` is demoted to metadata (CR-01) — see Deviation Note below; the safety outcome ("foreign or stale state cannot authorize work") is fully achieved and the 40-REVIEW.md explicitly accepted CR-01 as sound. |
| 2 | LEASE-02: Only explicit outcome-persistent instruction creates a lease; ordinary action is one-turn | ✓ VERIFIED | `src/lease/policy.mjs` `shouldCreateLease` returns true ONLY for `authority_class==='persistent_goal_action' && explicitInstruction===true`; fail-closes on unknown class. Test `router.lease-creation.test.mjs` ok 2 ("true ONLY for persistent_goal_action + explicit instruction") + ok 3 (fail-closes on unknown/missing). Prohibition: no raw prompt stored (test ok "no unredacted operator-prompt content"). |
| 3 | LEASE-03: Inspect each lease's 9 fields + durable status transitions | ✓ VERIFIED | `src/lease/store.mjs` `inspect` rebuilds the record in 9-field declaration order (goal, scope, allowed_effects, confirmation_effects, resource_bounds, status, expiry, authority_source, last_safe_checkpoint, freshness_evidence) + is_expired/is_revoked. `setStatus` validates against `LEASE_STATUS_SET` (active/paused/completed/blocked/expired/revoked). Test `router.lease-inspect.test.mjs` ok 1 (all 9 fields) + ok 2 (durable transitions paused/completed/revoked) + ok 4 (rejects unknown status). |
| 4 | LEASE-04: Revocation takes precedence over cached/confidence/recommendations/pending-startup/learned | ✓ VERIFIED (behavioral) | `src/lease/policy.mjs` `resolveLeaseAuthority` returns `authGranted:false, source:'lease:revoked'` (and expired/foreign) overriding eligible. `src/runtime/router.mjs` (line ~1943) consults resolveLeaseAuthority BEFORE deriving authGranted from eligible; sets `authGranted=false` for revoked/expired/foreign. Named test `router.lease-revoke.test.mjs` ok 9 ("LEASE-04 precedence: revoked lease + high confidence + eligible route → authority_not_granted (block)") PASSES — behavioral evidence for the state transition. |
| 5 | LEASE-05: Valid unfinished lease resumes each action at most once via durable checkpoint claims | ✓ VERIFIED (behavioral) | `src/lease/store.mjs` `claimCheckpoint` mutates the on-disk `claimed_actions` array under the mutation lock (durable). `src/adapters/dispatch/claude.mjs` `resumeImpl` (line ~395) consults the durable claim as the authoritative gate; `_idempotencySeen` Set is hot-path fast-path only. Named tests PASS: `router.lease-resume.test.mjs` ok 6 ("survives re-read from disk (durable)") + ok 9 ("LEASE-05 at-most-once: second resume with same key is rejected by the durable claim") — behavioral evidence for the at-most-once invariant across restart. |
| 6 | LEASE-06: First visit silent; returning project gets one evidence-backed briefing; 8 invalid states never auto-run | ✓ VERIFIED | `src/lease/briefing.mjs` `composeBriefing` returns null on no lease (first visit) + for INVALID_SET (completed/blocked/expired/revoked) + derived (expired/foreign). Wired into `router.mjs` hot path (line ~1993, only when `lease_active`) + `formatBriefingBlock` (WR-01 sanitizes leaseId + receiptId). Test `router.lease-briefing.test.mjs` ok 2 (first visit null) + ok 3 (one briefing on return) + ok 15 ("all eight invalid states produce null") + ok 16 (references receipt IDs, never raw prompt). |

**Score:** 6/6 truths verified (0 present, behavior-unverified)

### Deviation Note (LEASE-01 / CR-01) — Override Recommended

The PLAN truth #1 and ROADMAP SC #1 list `goal` as a fingerprint binding axis ("six-axis fingerprint"). The implementation deliberately excludes `goal` from the hash (5-axis fingerprint); `goal` is stored on the lease record as operator-declared metadata only. This is documented as **CR-01** in `src/lease/identity.mjs` (lines 14-19) and asserted by test `router.lease-identity.test.mjs` ok 32 (`assert.equal(baseline, fingerprint({ goal: 'ship-router-v2' }))` — different goals produce the SAME fingerprint by design).

**Why the deviation is acceptable:** The hot path has no operator-declared goal (the prompt yields only an authority_class enum), so hashing goal would make the lookup fingerprint never match the creation fingerprint — LEASE-04 precedence would be non-functional. Keying by project identity (5 axes) is the correct binding: a lease authorizes work for the PROJECT. The safety outcome of LEASE-01 ("foreign or stale state cannot authorize work") is fully achieved and tested (cross-repo/worktree/runtime/schema/fingerprint isolation holds). The `40-REVIEW.md` explicitly accepted CR-01: "the five-axis fingerprint (with goal demoted to metadata per CR-01) round-trips through the durable store... sound."

**Recommended action:** Add a formal override to reconcile the PLAN truth wording with the implemented, review-accepted design:

```yaml
overrides:
  - must_have: "A lease created under runtime=claude with repo A / worktree W / schema-gen G yields a computeLeaseFingerprint hash that differs from one under ... a different goal; findByFingerprint matches only the exact six-axis fingerprint (LEASE-01 identity binding)."
    reason: "CR-01: goal is demoted to operator-declared metadata (5-axis fingerprint). The hot path cannot reconstruct goal, so hashing goal made LEASE-04 precedence non-functional. The 5-axis fingerprint achieves the LEASE-01 safety outcome (foreign/stale state cannot authorize); accepted by 40-REVIEW.md."
    accepted_by: "verifier-recommendation"
    accepted_at: "2026-08-08T11:00:00Z"
```

This deviation does NOT block the phase goal: the goal text is bounded (stored, inspectable, one-lease-per-project), and no foreign/stale state can authorize work. The override is a wording reconciliation, not a safety gap.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lease/identity.mjs` | 5-axis fingerprint + null-pf rejection | ✓ VERIFIED | 51 lines; sha256+stableStringify; CR-01 documented |
| `src/lease/store.mjs` | durable store: create/read/findByFingerprint/mutate/setStatus/claimCheckpoint/releaseCheckpoint/isExpired/inspect | ✓ VERIFIED | 278 lines; 0o700 root, 0o600 files, mutationLock, durableWrite (temp+fsync+rename), fail-closed readLease (WR-04 schema validation), LEASE_STATUS_SET enum |
| `src/lease/policy.mjs` | shouldCreateLease gate + buildLeaseRecord (9 fields) + resolveLeaseAuthority | ✓ VERIFIED | 159 lines; imports frozen AUTHORITY_CLASSES; fail-open resolveLeaseAuthority |
| `src/lease/briefing.mjs` | composeBriefing (first-visit silent, one briefing, 8 invalid states null) | ✓ VERIFIED | 107 lines; INVALID_SET frozen (WR-03); references receipt IDs not raw prompt |
| `tests/router.lease-identity.test.mjs` | cross-axis rejection + isolation | ✓ VERIFIED | 166 lines; ok 32-44 assert 5-axis independence |
| `tests/router.lease-creation.test.mjs` | LEASE-02 gate | ✓ VERIFIED | 118 lines; 6 tests pass |
| `tests/router.lease-inspect.test.mjs` | 9-field inspect + transitions | ✓ VERIFIED | 146 lines; 8 tests pass |
| `tests/router.lease-revoke.test.mjs` | LEASE-04 precedence | ✓ VERIFIED | 304 lines; revocation precedence exercised |
| `tests/router.lease-resume.test.mjs` | LEASE-05 at-most-once | ✓ VERIFIED | 318 lines; durable claim + restart exercised |
| `tests/router.lease-briefing.test.mjs` | LEASE-06 briefing | ✓ VERIFIED | 226 lines; first-visit + 8 invalid states + receipt-ID reference |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `router.mjs` hot path | `lease/policy.mjs` resolveLeaseAuthority | `getLeaseStore()` + `_leaseMod.policy.resolveLeaseAuthority` consulted BEFORE deriving authGranted from eligible (line ~1956) | ✓ WIRED | revoked/expired/foreign override authGranted=false; absent = no change (fail-open) |
| `router.mjs` hot path | `lease/briefing.mjs` composeBriefing | called only when `leaseAuth.reason_code === 'lease_active'` (line ~1993) | ✓ WIRED | formatBriefingBlock renders with WR-01 sanitized leaseId+receiptId |
| `router.mjs` lease consultation | `protected_` flag | lease sets authGranted+source, NEVER protected_ (line ~1948 comment) | ✓ WIRED | Pitfall 1 prohibition holds — protected-effect pause still fires |
| `claude.mjs` resumeImpl | `lease/store.mjs` claimCheckpoint | `getLeaseStore().claimCheckpoint(action.lease_id, action.idempotency_key)` (line ~417) | ✓ WIRED | durable claim is authoritative; _idempotencySeen is fast-path only |
| `router-lifecycle.mjs` | 4 lease modules → both runtimes | `moduleNames` includes `lease/{identity,store,briefing,policy}.mjs`; `moduleValues` flatMap over `[ownedRoot, codexOwnedRoot]` (line ~401, ~429) | ✓ WIRED | T-39-03 dual-runtime regression backstop |
| `router-control.mjs` | `lease/store.mjs` createLeaseStore + inspect/setStatus | `leasesCommand` imports createLeaseStore; subcommands inspect/show/revoke/create (line ~721) | ✓ WIRED | WR-02 removed dead guard; WR-04 validates create positional count |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `identity.mjs` | fingerprint hash | sha256 over stableStringify of 5 caller-supplied axes | ✓ real hash | ✓ FLOWING |
| `store.mjs` | lease record | durableWrite to `<root>/<lease_id>.json`; readLease reads real file | ✓ real file I/O | ✓ FLOWING |
| `policy.mjs` | resolveLeaseAuthority verdict | leaseStore.findByFingerprint (real file scan) → status/freshness check | ✓ real store read | ✓ FLOWING |
| `briefing.mjs` | briefing payload | leaseStore.findByFingerprint → lease.last_safe_checkpoint (receipt IDs) | ✓ real lease data | ✓ FLOWING |
| `router.mjs` briefing render | additionalContext block | composeBriefing payload → formatBriefingBlock (sanitized) | ✓ real payload | ✓ FLOWING |

No static returns, hardcoded literals, or mocks terminate any rendered value chain.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Lease test suite (6 files) | `node --test tests/router.lease-*.test.mjs` | 64 pass / 0 fail | ✓ PASS |
| Lifecycle + control-cli suite | `node --test tests/router.lifecycle.test.mjs tests/router.control-cli.test.mjs` | 47 pass / 0 fail | ✓ PASS |
| Full phase-40 suite (per REVIEW-FIX) | `node --test` (8 files) | 111 pass / 0 fail | ✓ PASS |
| `router-control leases` (no subcommand) | `node src/cli/router-control.mjs leases` | `OK false / REASON invalid_arguments / EXIT 0` | ✓ PASS (fail-open, no crash) |
| LEASE-04 revocation precedence (named test) | `node --test tests/router.lease-revoke.test.mjs` ok 9 | PASS | ✓ PASS |
| LEASE-05 at-most-once across restart (named tests) | `node --test tests/router.lease-resume.test.mjs` ok 6 + ok 9 | PASS | ✓ PASS |

Note: The full-corpus `rtk node --test tests/*.test.mjs` has 9 flaky failures, ALL confirmed pre-existing (7 reproduce on pre-phase-40 baseline `e92062b`; 2 pass in isolation at HEAD). These are shared-HOME/parallel-execution collisions in the install/perf/dual-runtime suites, outside phase-40 scope, and not treated as phase-40 gaps.

### Probe Execution

No phase-specific `scripts/*/tests/probe-*.sh` probes declared for this phase. Probe execution: SKIPPED (none declared).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| LEASE-01 | 40-01 | Bind continuity/authority to repo/worktree/runtime/goal/schema-gen/fingerprint | ✓ SATISFIED | 5-axis fingerprint (CR-01; goal metadata); isolation tested |
| LEASE-02 | 40-01 | Only explicit outcome-persistent instruction creates a lease | ✓ SATISFIED | shouldCreateLease gate; creation tests pass |
| LEASE-03 | 40-01 | Inspect 9 fields + durable status transitions | ✓ SATISFIED | inspect + setStatus; inspect tests pass |
| LEASE-04 | 40-02 | Revocation precedence over cached/confidence/recommendations/pending/learned | ✓ SATISFIED | resolveLeaseAuthority + router hot-path wiring; revoke tests pass |
| LEASE-05 | 40-02 | At-most-once resume via durable checkpoint claims | ✓ SATISFIED | claimCheckpoint durable + resumeImpl wiring; resume tests pass |
| LEASE-06 | 40-03 | First visit silent; one evidence-backed briefing; 8 invalid states never auto-run | ✓ SATISFIED | composeBriefing + formatBriefingBlock; briefing tests pass |

No orphaned requirements: all LEASE-01..06 in REQUIREMENTS.md are claimed by phase-40 plans and satisfied.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | — | — | No TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER markers in any lease module or test file | 

No empty implementations, no hardcoded empty data flows to rendering, no console.log-only handlers. `releaseCheckpoint` is exported with no production caller (test-only, forward-looking API hook — IN-01 in 40-REVIEW, info-tier, not fixed by design).

### Code Review Status

The `40-REVIEW.md` still carries `status: issues_found` (stale — predates the WR fixes). The `40-REVIEW-FIX.md` records `status: all_fixed`: 4 in-scope findings (WR-01..04) fixed via commits `bdd5e7a`, `9cdfeed`, `4df2627`, `42bd647`, each re-verified with Tier 1 (re-read) + Tier 2 (`node --check`) + the 111-test phase-40 suite. 2 info-tier findings (IN-01, IN-02) out of scope, not fixed by design. The review explicitly accepted CR-01 (5-axis fingerprint) as sound.

### Human Verification Required

None. All behavior-dependent truths (LEASE-04 revocation precedence, LEASE-05 at-most-once across restart, LEASE-06 invalid-state silence) are exercised by passing named tests. No visual, real-time, or external-service items. The CR-01 deviation is a wording reconciliation (override recommendation), not a behavior to verify.

### Gaps Summary

No gaps block the phase goal. The only notable item is the CR-01 deviation (goal demoted to metadata; 5-axis fingerprint instead of 6-axis), which is a documented, review-accepted design decision. The phase goal — "Operators can persist, inspect, revoke, and safely resume bounded project-goal authority without stale or foreign state acting" — is achieved: leases are persistable (createLease), inspectable (inspect 9 fields + CLI), revocable (setStatus + CLI + hot-path precedence), and resumable at-most-once (durable claimCheckpoint). Foreign/stale state cannot authorize work (5-axis isolation + fail-closed readLease + revocation precedence). First visits are silent; returning projects get one evidence-backed briefing; invalid states never auto-run.

The recommended override (CR-01) should be formalized by the developer to reconcile the PLAN truth wording with the implemented design. It does not block progression.

---

_Verified: 2026-08-08T11:00:00Z_
_Verifier: Claude (gsd-verifier)_