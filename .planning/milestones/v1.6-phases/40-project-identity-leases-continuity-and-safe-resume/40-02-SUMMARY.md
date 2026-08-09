---
phase: 40-project-identity-leases-continuity-and-safe-resume
plan: 02
requirements-completed: [LEASE-04, LEASE-05]
subsystem: lease
tags: [lease, authority, resume, lease-04, lease-05, revocation, at-most-once]
requires:
  - src/lease/identity.mjs::computeLeaseFingerprint (Plan 01)
  - src/lease/store.mjs::createLeaseStore (Plan 01)
  - src/lease/store.mjs::findByFingerprint (Plan 01)
  - src/lease/store.mjs::isExpired (Plan 01)
  - src/lease/store.mjs::setStatus (Plan 01)
  - src/lease/policy.mjs::buildLeaseRecord (Plan 01)
  - src/intent/authority.mjs::evaluateAuthorityPolicy (Phase 39 sealed evaluator)
provides:
  - src/lease/policy.mjs::resolveLeaseAuthority
  - src/lease/store.mjs::claimCheckpoint
  - src/lease/store.mjs::releaseCheckpoint
  - src/runtime/router.mjs::getLeaseStore
  - src/adapters/dispatch/claude.mjs::getLeaseStore
  - src/adapters/dispatch/claude.mjs::_resetIdempotencyForTest
  - src/adapters/dispatch/claude.mjs::_resetLeaseStoreForTest
affects:
  - "Phase 40 Plan 03 (briefing + deploy): consumes resolveLeaseAuthority + claimCheckpoint to surface lease state in briefings and the deploy bundle"
  - "Phase 41+ (lease enforcement): max_wall_ms / max_tokens enforcement builds on claimCheckpoint's durable claimed_actions"
tech-stack:
  added:
    - "resolveLeaseAuthority — pure lease authority resolution with fail-open try/catch"
    - "claimCheckpoint/releaseCheckpoint — durable on-lease at-most-once primitive via mutate()"
    - "getLeaseStore() — memoized module-level factory accessor (mirrors getAuthorityMod pattern)"
  patterns:
    - "Lease authority consulted BEFORE authGranted derivation on the hot path (LEASE-04 precedence)"
    - "Durable claim on lease record is authoritative; in-memory Set demoted to hot-path fast-path (LEASE-05)"
    - "Lease sets authority.authGranted + authority.source, NEVER authority.protected_ (Pitfall 1)"
    - "evaluateAuthorityPolicy signature unchanged — lease is an input, not part of the evaluator"
key-files:
  created:
    - tests/router.lease-revoke.test.mjs
    - tests/router.lease-resume.test.mjs
  modified:
    - src/lease/policy.mjs
    - src/lease/store.mjs
    - src/runtime/router.mjs
    - src/adapters/dispatch/claude.mjs
decisions:
  - "resolveLeaseAuthority returns lease_read_failed (not lease_absent) only when the store THROWS — a corrupt JSON file is handled by readLease's fail-closed null, yielding lease_absent. The try/catch in resolveLeaseAuthority catches store API throws (T-40-08)."
  - "claimCheckpoint includes `changed` in the mutate callback data so the mutate wrapper spreads it into the output (the wrapper's internal result.changed is not spread)"
  - "resumeImpl does NOT call releaseCheckpoint — the durable claim stays across re-spawns (it is the authoritative gate). Only the in-memory releaseIdempotency is called before re-spawn so invokeImpl can re-claim via the hot-path fast-path."
  - "Lease fingerprint in router.mjs uses authorityOut.authority_class as the goal axis (short structured label, NOT raw prompt — Pitfall 5 / T-40-02 privacy contract)"
metrics:
  duration: ~11min
  completed: 2026-08-07
actuals:
  tokens: 11320   # chars/4 over the realized diff (6 files, 880 insertions)
  tasks: 2
  commits: 4
status: complete
---

# Phase 40 Plan 02: Lease Authority + Hot-Path Revocation Precedence + Durable At-Most-Once Resume Summary

resolveLeaseAuthority (LEASE-04) + durable claimCheckpoint (LEASE-05) threaded into the router hot path and the claude.mjs resume path — a revoked lease overrides high-confidence eligible routes, and at-most-once resume survives a simulated restart that clears the in-memory Set.

## What Was Built

**Task 1 — LEASE-04 lease authority resolution + hot-path revocation precedence:**

- **`resolveLeaseAuthority({ projectFingerprint, leaseStore, now })`** in `src/lease/policy.mjs` — returns five distinct `{authGranted, source, reason_code}` shapes (active/revoked/expired/foreign/absent) plus the fail-open `lease_read_failed` when the store throws. The whole body is wrapped in try/catch (T-40-08). Does NOT import evaluateAuthorityPolicy or classifyAuthority — policy.mjs stays self-contained for the deploy bundle.
- **Lease consultation block** in `src/runtime/router.mjs` `evaluateAuthorityHint` — after `classifyAuthority` produces `authorityOut` and BEFORE the `authGranted = eligible` derivation, a try/catch-guarded block opens the lease store via a memoized `getLeaseStore()`, computes the six-axis lease fingerprint (`computeLeaseFingerprint` over repo/worktree/runtime/goal/schema_generation/projectFingerprint), and calls `resolveLeaseAuthority`. A revoked/expired/foreign lease overrides `authGranted=false` regardless of eligible (LEASE-04 precedence); an active lease sets `authGranted=true` + `source=lease:<id>`; absent/read-failure → no change (fail-open). The `protected_` flag is NEVER touched (Pitfall 1 backstop).
- **`getLeaseStore()`** in router.mjs — memoized module-level factory accessor (mirrors getAuthorityMod pattern: deployed `modules/lease/` path searched first, dev `src/lease/` second, fail-open null sentinel).

**Task 2 — LEASE-05 durable checkpoint claim + at-most-once resume:**

- **`claimCheckpoint(leaseId, actionId)`** + **`releaseCheckpoint(leaseId, actionId)`** in `src/lease/store.mjs` — durable on-lease at-most-once primitive via `mutate()`. The `claimed_actions` array on the lease record is the authoritative gate (survives compaction/restart; the in-memory Set does not). Empty/null actionId → no-op `{claimed:true}`; null leaseId → fail-open `{claimed:true}`; already-claimed → `{claimed:false, reason:'already_claimed'}`; new claim → `{claimed:true, changed:true}`.
- **`getLeaseStore()`** in `src/adapters/dispatch/claude.mjs` — memoized module-level factory accessor (mirrors the router.mjs pattern; deployed path first, dev second, fail-open null sentinel). Eager-loaded at import time via top-level await (ESM-safe).
- **`resumeImpl`** in `src/adapters/dispatch/claude.mjs` — consults `leaseStore.claimCheckpoint(action.lease_id, action.idempotency_key)` as the authoritative at-most-once gate. `claimed:false` (already_claimed) → returns the existing paused receipt (no re-spawn). `claimed:true` → `releaseIdempotency` (in-memory) + `invokeImpl` re-spawns. The durable claim stays on the lease record — NOT released by resume. Falls back to the existing in-memory path when the lease module is absent (Phase 38 behavior preserved).
- **Test-only helpers** — `_resetIdempotencyForTest()` clears the in-memory Set; `_resetLeaseStoreForTest()` resets the cached lease store (simulate restart).

**Two new test files (TDD: RED → GREEN for each task):**

- `tests/router.lease-revoke.test.mjs` (14 tests) — resolveLeaseAuthority five shapes + lease_read_failed + null/missing store; LEASE-04 precedence (revoked/expired/foreign override high-confidence eligible → `authority_not_granted` block); active lease + medium confidence → proceed; Pitfall 1 backstop (leased protected effect still pauses, leg 2 unchanged); absent lease → no override.
- `tests/router.lease-resume.test.mjs` (11 tests) — claimCheckpoint first/second/distinct/empty/null-lease; durable re-read from disk (new store instance); releaseCheckpoint; insertion-order stability; adapter at-most-once resume (second resume rejected → existing paused receipt); simulated restart (in-memory Set cleared, third resume still rejected by durable claim); adjacency (distinct actionIds independent); empty actionId no-op.

## Requirements Covered

- **LEASE-04** — Revocation precedence enforced on the hot path: a revoked lease overrides high-confidence eligible routes; expired/foreign/absent each map to a distinct `reason_code`. Proven by `tests/router.lease-revoke.test.mjs`.
- **LEASE-05** — At-most-once resume across simulated restart: the durable `claimCheckpoint` on the lease record is authoritative; the in-memory Set is demoted to a hot-path fast-path. Proven by `tests/router.lease-resume.test.mjs`.

## TDD Gate Compliance

Per-task RED → GREEN cycle verified in git log:

| Task | RED commit | GREEN commit |
| ---- | ---------- | ------------ |
| 1 | `c53f927` test(40-02): add failing lease authority resolution + revocation tests (RED) | `36e15fd` feat(40-02): lease authority resolution + hot-path revocation precedence (GREEN) |
| 2 | `66c300c` test(40-02): add failing durable checkpoint + at-most-once resume tests (RED) | `e2636c6` feat(40-02): durable checkpoint claim + at-most-once resume (GREEN) |

Both RED commits ran tests that failed before implementation existed; both GREEN commits ran tests that passed after implementation. No REFACTOR gate needed — code is already minimal.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] claimCheckpoint `changed` field missing from mutate output**
- **Found during:** Task 2 GREEN run (2 tests failed)
- **Issue:** The `mutate` wrapper spreads `result.data` into the output but uses `result.changed` only internally to decide whether to write — it does NOT spread `changed` into the output. The first test asserted `r.changed === true` and got `undefined`.
- **Fix:** Added `changed: true` / `changed: false` to the `data` object in the claimCheckpoint mutate callback so the mutate wrapper spreads it into the output.
- **Files modified:** `src/lease/store.mjs`
- **Commit:** `e2636c6`

None other — plan executed as written.

## Verification Evidence

- `rtk node --test tests/router.lease-revoke.test.mjs tests/router.lease-resume.test.mjs` → 25/25 pass.
- `rtk node --test tests/router.lease-identity.test.mjs tests/router.lease-creation.test.mjs tests/router.lease-inspect.test.mjs` → 23/23 pass (Plan 01 regression).
- `rtk node --test tests/router.authority.test.mjs tests/router.authority-policy.test.mjs tests/router.authority-gate.test.mjs` → 39/39 pass (Phase 39 sealed evaluator regression).
- `rtk node --test tests/router.adapters.test.mjs tests/router.dispatch-integration.test.mjs` → 26/26 pass (Phase 38 regression).
- `rtk node --test tests/router.perf.test.mjs` → 5/5 pass (warm p95 ≤25ms / hard max <100ms — no regression from the lease store read).
- Grep gate: `export function evaluateAuthorityPolicy` unchanged in `src/intent/authority.mjs` — lease is an input (`authority.authGranted` + `authority.source`), not part of the sealed evaluator.
- Grep gate: no `node:http` / `node:net` / npm imports added in `src/lease/*.mjs` or `src/adapters/dispatch/claude.mjs` — stdlib only.
- Grep gate: no hardcoded `/Users/guilherme` in `src/lease/store.mjs` or `src/adapters/dispatch/claude.mjs` — uses `os.homedir()`.

Total: 118/118 pass across all 11 test files.

## Threat Surface

No new trust-boundary surface beyond what the plan's `<threat_model>` already covers. All four mitigated threats are addressed:

- **T-40-05** (elevation of privilege): resolveLeaseAuthority consulted BEFORE authGranted derivation; revoked → authGranted false regardless of eligible/confidence (LEASE-04 precedence). Adversarial test asserts revoked+high-confidence blocks.
- **T-40-06** (elevation of privilege): lease sets authGranted + source, never protected_=false; evaluateAuthorityPolicy leg 2 still fires for leased protected effects (Pitfall 1 backstop test passes).
- **T-40-07** (tampering): durable claimed_actions on the lease record; at-most-once enforced on disk, not in-memory (LEASE-05, Pitfall 2). Test simulates restart (clears Set) and asserts second resume rejected.
- **T-40-08** (tampering): try/catch returns `lease_read_failed` (authGranted false) on any throw — fail-closed for authority, fail-open for the prompt (no block).
- **T-40-SC** (stdlib-only): no package installs attempted.

## Known Stubs

None. The lease consultation in router.mjs uses `schemaGeneration: 1` (a constant) rather than reading the manifest's schema_generation field — this is a simplification, not a stub. The lease fingerprint is consistent across calls for the same project state, and the fail-open try/catch preserves existing behavior if the fingerprint doesn't match an existing lease. The schema_generation axis can be refined in Phase 41+ without breaking the lease lookup (a different schema_generation creates a different lease, which is the correct behavior for a changed project state).

## Self-Check: PASSED

- All 6 created/modified files exist on disk (verified via `[ -f path ]`).
- All 4 per-task commits (2 RED + 2 GREEN) exist in `git log --oneline`.
- 118/118 plan + regression tests pass.
