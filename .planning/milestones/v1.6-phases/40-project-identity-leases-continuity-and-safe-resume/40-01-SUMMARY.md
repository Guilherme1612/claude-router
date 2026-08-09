---
phase: 40-project-identity-leases-continuity-and-safe-resume
plan: 01
requirements-completed: [LEASE-01, LEASE-02, LEASE-03]
subsystem: lease
tags: [lease, identity, storage, authority, lease-01, lease-02, lease-03]
requires:
  - src/registry/schema.mjs (stableStringify)
  - src/intent/authority.mjs (AUTHORITY_CLASSES, frozen vocabulary)
  - src/steward/state.mjs (durableWrite + mutationLock patterns, copied verbatim)
  - src/adapters/dispatch/receipt.mjs (hashPromptDerived contract reference)
provides:
  - src/lease/identity.mjs::computeLeaseFingerprint
  - src/lease/store.mjs::defaultLeaseRoot
  - src/lease/store.mjs::createLeaseStore
  - src/lease/store.mjs::isExpired
  - src/lease/policy.mjs::LEASE_POLICY_VERSION
  - src/lease/policy.mjs::shouldCreateLease
  - src/lease/policy.mjs::buildLeaseRecord
affects:
  - "Phase 40 Plan 02 (authority precedence + resume): consumes createLeaseStore + buildLeaseRecord + setStatus to drive durable resume"
  - "Phase 40 Plan 03 (briefing + deploy): consumes inspect + findByFingerprint to surface lease state in briefings"
tech-stack:
  added:
    - "src/lease/ module family (identity.mjs, store.mjs, policy.mjs) — stdlib only"
  patterns:
    - "Six-axis sha256 fingerprint over stableStringify (mirrors computeCompositeEpoch)"
    - "Per-runtime partition (~/.claude | ~/.codex)/router/leases (mirrors defaultReceiptRoot)"
    - "durableWrite (temp+fsync+rename+dir-fsync) + mutationLock (mkdir + stale-PID recovery) copied verbatim from steward/state.mjs"
    - "Fail-closed readLease (null on missing/corrupt) — T-40-03 tampering mitigation"
    - "Idempotent createLease — LEASE-03 adjacency (one record per fingerprint)"
    - "inspect rebuilds record in 9-field declaration order (on-disk is alphabetized by stableStringify)"
key-files:
  created:
    - src/lease/identity.mjs
    - src/lease/store.mjs
    - src/lease/policy.mjs
    - tests/router.lease-identity.test.mjs
    - tests/router.lease-creation.test.mjs
    - tests/router.lease-inspect.test.mjs
  modified: []
decisions:
  - "Re-export AUTHORITY_CLASSES from policy.mjs (same frozen array reference) — preserves frozen-vocabulary rule without forcing callers to reach into intent/authority.mjs"
  - "inspect rebuilds the record in 9-field declaration order rather than spreading the round-tripped lease (stableStringify alphabetizes keys on disk)"
  - "setStatus returns data:{new_status} (not data:{status}) to avoid colliding with mutate wrapper's outer status field"
metrics:
  duration: ~12min
  completed: 2026-08-07
actuals:
  tokens: 41200   # chars/4 over the realized diff (6 new files)
  tasks: 3
  commits: 6
status: complete
---

# Phase 40 Plan 01: Lease Identity + Durable Store + Creation Gate + Inspection Summary

Six-axis lease fingerprint + one-lease-per-file durable store + creation gate + 9-field inspection — the tracer slice for Phase 40, proving the storage layer end-to-end before any hot-path wiring or durable resume work.

## What Was Built

**Three new stdlib-only modules under `src/lease/`:**

- **`identity.mjs`** — `computeLeaseFingerprint({ repo, worktree, runtime, goal, schemaGeneration, projectFingerprint })`: sha256 over `stableStringify` of the six axes. Pure function (no fs/os). Rejects null/undefined `projectFingerprint` with `invalid_project_fingerprint` rather than hashing a null axis (LEASE-03 empty edge).
- **`store.mjs`** — `defaultLeaseRoot(runtime)` partitions per runtime (`~/.claude/router/leases` vs `~/.codex/router/leases`, mirrors `receipt.mjs`). `createLeaseStore({ root, runtime, lock })` factory returning a frozen surface: `createLease` (idempotent — LEASE-03 adjacency), `readLease` (fail-closed null on missing/corrupt — T-40-03), `findByFingerprint` (exact match only — T-40-01), `mutate` (under `mutationLock`), `setStatus` (durable + idempotent + enum-validated), `isExpired` (wall-clock + `max_invocations`), `inspect` (rebuilds the record in 9-field declaration order + `is_expired`/`is_revoked`). The `durableWrite` (temp+fsync+rename+dir-fsync) and `mutationLock` (mkdir-based, stale-PID recovery) helpers are copied verbatim from `src/steward/state.mjs` so the lease store is self-contained for the deploy bundle.
- **`policy.mjs`** — `LEASE_POLICY_VERSION = 'lease-policy-v1'`, `shouldCreateLease({ authority_class, explicitInstruction })` (true only for `persistent_goal_action` + explicit instruction; fail-closed on unknown class — T-40-04), `buildLeaseRecord({ fingerprint, goal, scope, allowedEffects, confirmationEffects, resourceBounds, expiryMs, authoritySource, checkpoint })` assembling the full 9-field record + `claimed_actions: []` in declaration order. Re-exports `AUTHORITY_CLASSES` (same frozen reference) — does not redefine the vocabulary.

**Three new test files (TDD: RED → GREEN for each task):**

- `tests/router.lease-identity.test.mjs` (9 tests) — six-axis fingerprint independence, per-runtime partition, 0o700 root + 0o600 file, fail-closed read, exact-fingerprint `findByFingerprint`, idempotent `createLease`, no `.tmp-` files, no unredacted operator-prompt content.
- `tests/router.lease-creation.test.mjs` (6 tests) — `shouldCreateLease` truth table, fail-closed on unknown class, `buildLeaseRecord` produces all 9 fields in declaration order, store round-trip preserves every field.
- `tests/router.lease-inspect.test.mjs` (8 tests) — `inspect` surfaces all 9 fields + `is_expired`/`is_revoked`, `setStatus` durable transitions, `setStatus` idempotent, `setStatus` rejects unknown status (`invalid_status`), `isExpired` at wall-clock deadline and at `max_invocations`, `inspect` on missing lease returns null, no `.tmp-` files after mutations.

## Requirements Covered

- **LEASE-01** — Six-axis fingerprint independence + per-runtime partition + exact-fingerprint lookup proven by `router.lease-identity.test.mjs`.
- **LEASE-02** — Only `persistent_goal_action` + explicit instruction creates a lease; the four other classes and `explicitInstruction:false` are rejected; unknown class fail-closes (T-40-04) — proven by `router.lease-creation.test.mjs`.
- **LEASE-03** — `inspect` returns all 9 fields in declaration order + `is_expired`/`is_revoked`; `setStatus` transitions are durable and idempotent; `isExpired` enforces the deterministic wall-clock deadline and the `max_invocations` budget — proven by `router.lease-inspect.test.mjs`.

## TDD Gate Compliance

Per-task RED → GREEN cycle verified in git log:

| Task | RED commit | GREEN commit |
| ---- | ---------- | ------------ |
| 1 (tracer) | `5a0db81` test(40-01): add failing lease identity + store tests (RED) | `b2c5aab` feat(40-01): lease identity + durable store (GREEN) |
| 2 | `9c9543c` test(40-01): add failing lease creation gate + record tests (RED) | `901043d` feat(40-01): lease creation gate + 9-field record builder (GREEN) |
| 3 | `6419dd1` test(40-01): add failing inspect + status/expiry transition tests (RED) | `e5abfd8` feat(40-01): inspect + setStatus + isExpired for lease transitions (GREEN) |

All three RED commits ran tests that failed before implementation existed; all three GREEN commits ran tests that passed after implementation. No REFACTOR gate needed — code is already minimal.

## Tracer Feedback Gate

Task 1 is the Phase 40 tracer slice. Autonomous-run gate behavior: re-ran `rtk node --test tests/router.lease-identity.test.mjs` end-to-end after the GREEN commit — 9/9 pass. No HALT; continued to expansion tasks (2, 3).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `setStatus` data field collided with mutate wrapper's outer `status`**
- **Found during:** Task 3 GREEN run (3 tests failed)
- **Issue:** `setStatus` returned `data: { status }` from its mutate callback; the `mutate` wrapper spreads `...result.data` over `{ status: 'stored' }`, so the inner `status: 'paused'` overwrote the outer `status: 'stored'`. The test `assert.equal(result.status, 'stored')` saw `'paused'` instead.
- **Fix:** Renamed the callback's data field to `{ new_status: status }` so it no longer collides with the wrapper's `status` field.
- **Files modified:** `src/lease/store.mjs`
- **Commit:** `e5abfd8`

**2. [Rule 1 - Bug] `inspect` round-trip returned alphabetized key order, not declaration order**
- **Found during:** Task 3 GREEN run (test 1 failed the `deepEqual(Object.keys(inspected).slice(3), [...])` assertion)
- **Issue:** `inspect` spread `...lease` from the round-tripped record. `stableStringify` canonicalizes object keys alphabetically when writing, so `JSON.parse` reads them back in alphabetical order. The PLAN's LEASE-03 ordering-edge truth requires the inspect output to follow the 9-field declaration order.
- **Fix:** `inspect` now rebuilds the record explicitly in declaration order (schema_version, policy_version, lease_id, project_fingerprint, goal, scope, allowed_effects, confirmation_effects, resource_bounds, status, expiry, authority_source, last_safe_checkpoint, freshness_evidence, claimed_actions, is_expired, is_revoked).
- **Files modified:** `src/lease/store.mjs`
- **Commit:** `e5abfd8`

None other — plan executed as written.

## Deferred Items

- `max_wall_ms` / `max_tokens` enforcement — `resource_bounds` fields are inspectable per LEASE-03 (`buildLeaseRecord` emits `{ max_wall_ms, max_invocations, max_tokens }`; `isExpired` enforces `expiry.deterministic_at_ms` + `max_invocations` only for v1). Conscious deferral per PLAN frontmatter `deferred` — enforcement deferred to Phase 41+. Fields present, enforcement partial.

## Verification Evidence

- `rtk node --test tests/router.lease-identity.test.mjs tests/router.lease-creation.test.mjs tests/router.lease-inspect.test.mjs` → 23/23 pass.
- `rtk node --test tests/router.authority.test.mjs tests/router.authority-policy.test.mjs` (Phase 39 sealed evaluator regression backstop) → 29/29 pass.
- Grep gate: no `node:http` / `node:net` / npm imports in `src/lease/*.mjs` — clean.
- Grep gate: no hardcoded `/Users/guilherme` in `src/lease/store.mjs` — uses `os.homedir()`.
- Grep gate: `src/lease/policy.mjs` does not redefine `AUTHORITY_CLASSES` or `PERSISTENT_GOAL_MARKERS` — only re-exports `AUTHORITY_CLASSES` (frozen reference).

## Threat Surface

No new trust-boundary surface beyond what the plan's `<threat_model>` already covers. All four mitigated threats (T-40-01 spoofing, T-40-02 information disclosure, T-40-03 tampering, T-40-04 elevation of privilege) are addressed by the implementation as specified; T-40-SC (stdlib-only, no package installs) holds — no npm/pip/cargo install was attempted.

## Known Stubs

None. `max_wall_ms` / `max_tokens` enforcement is a documented deferral (fields present, partial enforcement), not a stub — see Deferred Items.

## Self-Check: PASSED

- All 6 created files exist on disk (verified via `[ -f path ]`).
- All 6 per-task commits (3 RED + 3 GREEN) exist in `git log --oneline`.
- 23/23 plan tests pass; 29/29 Phase 39 regression tests pass.
