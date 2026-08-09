---
phase: 40-project-identity-leases-continuity-and-safe-resume
fixed_at: 2026-08-08T00:00:00Z
review_path: .planning/phases/40-project-identity-leases-continuity-and-safe-resume/40-REVIEW.md
iteration: 3
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 40: Code Review Fix Report

**Fixed at:** 2026-08-08
**Source review:** `.planning/phases/40-project-identity-leases-continuity-and-safe-resume/40-REVIEW.md`
**Iteration:** 3
**Fix scope:** critical_warning (4 warnings; 0 critical; 2 info findings out of scope)

**Summary:**
- Findings in scope: 4
- Fixed: 4
- Skipped: 0
- Out of scope (info, not fixed): 2 (IN-01, IN-02)

**Worktree mode:** `workflow.use_worktrees=false` — fixes were applied and committed directly in the main checkout (no isolated worktree, no temp branch, no recovery sentinel, no cleanup tail).

**Verification:** All fixes verified with Tier 1 (re-read modified section) + Tier 2 (`node --check` syntax check on every modified file). Additionally, the phase 40 test suite (8 test files, 111 tests) was run after all fixes — 111 pass / 0 fail. Tests ran in the main checkout (no worktree was created, so the numbers are reproducible from this tree).

## Fixed Issues

### WR-01: `formatBriefingBlock` interpolates `leaseId` unsanitized (receiptId is sanitized but leaseId is not)

**Files modified:** `src/runtime/router.mjs`
**Commit:** `bdd5e7a`
**Applied fix:** Applied the same charset + sentinel-breakout sanitization to `leaseId` that `receiptId` already receives. The sanitized `safeLeaseId` is interpolated into the briefing body (which previously used the raw `leaseId` twice). `store.readLease` validates `lease_id` is a string but does not restrict its charset, so a crafted lease file in the 0o700 lease dir could otherwise break the `router-inject` sentinel and inject content into the model's `additionalContext`. This closes the inconsistency in the existing mitigation.

### WR-02: Dead code — unreachable `if (subcommand === '')` guard in `leasesCommand`

**Files modified:** `src/cli/router-control.mjs`
**Commit:** `9cdfeed`
**Applied fix:** Removed the dead `if (subcommand === '')` block at the former lines 736-738. The preceding `!['inspect','show','revoke','create'].includes(subcommand)` guard already returns `invalid_arguments` for the no-subcommand case (because `positional[1] || ''` is `''`, which is not in the list), making the immediately-following `subcommand === ''` branch unreachable. The test `leases with no subcommand -> invalid_arguments` still passes via the first guard.

### WR-03: `briefing.mjs` INVALID_SET contained 4 out-of-enum entries that could never match a stored `lease.status`

**Files modified:** `src/lease/briefing.mjs`
**Commit:** `4df2627`
**Applied fix:** Applied option (a) from the review. Removed the 4 dead entries (`corrupt`, `stale`, `unauthorized`, `foreign`) from the `INVALID` array. These could never match a stored `lease.status` because `store.readLease` validates status against `LEASE_STATUS_SET = [active, paused, completed, blocked, expired, revoked]` and fail-closes (returns null) on any out-of-enum value, so `findByFingerprint` returns null and `composeBriefing` returns null on the first-visit silent path before reaching `INVALID_SET.has`. The derived `briefing_status='foreign'` is still reachable via the separate `freshness_evidence.fingerprint_match` else-if branch. Updated the file-header comment, the `INVALID` declaration comment, and the inline `composeBriefing` comment to document the two layers (enum-backed via `INVALID_SET`; derived via else-if branches). The test `all eight invalid states produce null` still passes: the 4 out-of-enum statuses are rejected by `readLease`'s schema validation, the 4 enum-backed statuses by `INVALID_SET`. No external consumer imports `BRIEFING_INVALID_STATES` (only the export definition references it), so the array length change is safe.

### WR-04: `leases create` did not validate positional count; silently ignored extra positionals

**Files modified:** `src/cli/router-control.mjs`
**Commit:** `42bd647`
**Applied fix:** Added a `positional.length !== 2` check at the top of the `create` branch (before the option parsing), returning `invalid_arguments` / `EXIT.usage` on mismatch. This is consistent with `inspect` (`=== 2`) and `show`/`revoke` (`=== 3`), which already validate positional length. A valid `create` invocation produces `positional = ['leases', 'create']` (length 2) with inputs from `--goal`/`--project-fingerprint` options, so the check passes the valid path. Extra positionals (e.g. `leases create accidental-positional`) now surface as `invalid_arguments` instead of silently creating a lease.

## Out of Scope (Info)

The following Info-tier findings were NOT fixed (fix_scope = critical_warning):

- **IN-01:** `releaseCheckpoint` is exported but has no production caller (test-only). Forward-looking API hook.
- **IN-02:** `mutationLock` stale-PID recovery cannot break a lock with a non-numeric `started_at`. Defense-in-depth gap (lock dir is 0o700).

---

_Fixed: 2026-08-08_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 3_