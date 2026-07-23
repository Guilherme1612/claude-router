---
phase: 20-close-gap-evo-05-add-production-trigger-for-canary-controller
fixed_at: 2026-07-22T00:00:00Z
review_path: .planning/phases/20-close-gap-evo-05-add-production-trigger-for-canary-controlle/20-REVIEW.md
iteration: 1
findings_in_scope: 14
fixed: 8
skipped: 6
status: partial
---

# Phase 20: Code Review Fix Report

**Fixed at:** 2026-07-22T00:00:00Z
**Source review:** .planning/phases/20-close-gap-evo-05-add-production-trigger-for-canary-controlle/20-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 14 (1 critical, 7 warnings, 6 info)
- Fixed: 8 (CR-01, WR-01, WR-02, WR-03, WR-04, WR-05, WR-06, IN-05)
- Skipped: 6 (WR-07, IN-01, IN-02, IN-03, IN-04, IN-06)

All fixes verified with Tier 1 (re-read) + Tier 2 (`node -c` syntax check) + the
relevant node:test suites. 54 tests across the affected modules pass.

## Fixed Issues

### CR-01: Path traversal via `project_id` in persistent evidence store

**Files modified:** `src/evolution/evidence.mjs`
**Commit:** a61ac83
**Applied fix:** Tightened the global `TOKEN` regex from
`/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/` to `/^[A-Za-z0-9][A-Za-z0-9._:-]*$/` (removed
`/`). All `boundedToken` consumers are flat identifiers (route_id, reason_code,
candidate_version, policy_version, guard_codes, project_id) — none
legitimately contain `/`. Verified empirically that `boundedToken('a/../../../etc')`
now returns `false` while existing valid tokens (`global`, `proj-A`, `gsd-debug`,
`workflow-transitions-v1`) still pass. Option A from the review (tighten the
global TOKEN) was chosen over Option B because every consumer is a flat token;
a separate path-safe validator would duplicate the boundary for no gain.

### WR-01: CLI `canary promote` defaults `reconciliation` to `eligible` when report file is missing

**Files modified:** `src/cli/router-control.mjs`
**Commit:** 0f58295
**Applied fix:** When `report.json` is missing, the fallback `reconciliation`
now consults the candidate file's embedded `disposition` (written by the watcher
at `watcher.mjs:325-333`) and defaults to `'quarantined'` when absent, rather than
silently defaulting to `'eligible'`. If even the candidate file carries no
`disposition`, promote now fails closed with `missing_reconciliation_report`
instead of bypassing the safety gate. Existing tests write both files atomically
together, so they continue to pass.

### WR-02: CLI `canary promote` missing `knownGood` null gate

**Files modified:** `src/cli/router-control.mjs`
**Commit:** f958504
**Applied fix:** Added a `!knownGood` gate immediately after the candidate-file
validation, mirroring the watcher's bootstrap gate (`watcher.mjs: if knownGood
=== null` → bootstrap path). Promote now refuses with `no_known_good_version`
and `next_action: 'run_registry_recovery_or_bootstrap'` rather than running
`applyCanaryDecision` with no rollback target.

### WR-03: Duplicated D-05 `demonstrated_benefit` derivation between router-control.mjs and watcher.mjs

**Files modified:** `src/evolution/canary-controller.mjs`, `src/cli/router-control.mjs`, `src/registry/watcher.mjs`
**Commit:** bbd7c65
**Applied fix:** Extracted `isSafetyFix` and `deriveDemonstratedBenefit` as
exported functions in `evolution/canary-controller.mjs` — the single source of
truth for the D-05 promotion predicate. Both call sites (CLI promote path and
watcher canary path) now import and call the shared helpers; the two local
`isSafetyFix` definitions and the two inline `demonstrated_benefit` derivation
blocks were removed. The helper defensively preserves the CLI's historical
optional-chaining semantics (`knownGoodEvaluation?.quality.pass ?? true`) so
the behavior is unchanged on both paths.

### WR-04: `runRouterControl` lacks top-level error handling for the canary branch

**Files modified:** `src/cli/router-control.mjs`
**Commit:** 5f461bb
**Applied fix:** Wrapped the canary subcommand body (after the subcommand
validation) in a `try { ... } catch (error) { return canonical('canary', false,
'internal_error', { error: error.message }), exitCode: EXIT.mutation }`. A
throwing `createPersistentEvidenceStore` (permission denied, read-only fs, disk
full) now produces a structured canonical failure for programmatic callers
instead of propagating a raw exception through `runRouterControl` to the CLI
entry point's generic `ROUTER CONTROL FAILED: internal_error` handler.

### WR-05: Discarded `measureRoutes` call in watcher canary path

**Files modified:** `src/registry/watcher.mjs`
**Commit:** 70cb953
**Applied fix:** Removed the dead `measure({ fixtures: CALIBRATION_CORPUS, route:
knownGoodCtx.route, ... })` call whose result was never assigned or consulted.
`measureRoutes` is pure (it invokes the route fn and returns a frozen metrics
object — no telemetry, no persistent cache warming), so the discarded call added
warmup-run + measured-run latency to every eligible reconcile for nothing. The
test stub has no side effect either, so this is pure dead code removal.

### WR-06: Watcher canary path does not pass `rollback_reason`

**Files modified:** `src/registry/watcher.mjs`
**Commit:** c30c611
**Applied fix:** Added `rollback_reason: 'canary_rollback'` to the watcher's
`canaryDecision({ ... })` call, matching the CR-02b fix applied to the CLI
promote path. Watcher-triggered canary rollbacks are now distinguishable from
registry rollbacks in the audit trail (`canary-controller.mjs:188` records
`reason: rollback_reason || 'rollback'`).

### IN-05: Deployed-bundle test does not assert `candidate-calibration-route.mjs` is listed in `moduleNames`

**Files modified:** `tests/router.deployed-bundle.test.mjs`
**Commit:** dcb2912
**Applied fix:** Added `'evolution/candidate-calibration-route.mjs'` to
`EXPECTED_EVOLUTION_MODULES` so the explicit string-literal assertion covers it
(already present in `moduleNames` at `router-lifecycle.mjs:325`). Gives a clearer
failure message than the implicit count assertion if the module were ever
accidentally removed.

## Skipped Issues

### WR-07: Evidence store is never populated in production — canary path always fails the sufficiency gate

**File:** `src/registry/watcher.mjs:399-402`, `src/cli/router-control.mjs:307-350`
**Reason:** skipped: by-design / requires larger architectural change outside this phase's scope
**Original issue:** Neither production code path calls `store.append(...)` or
`ingestTelemetryFile(...)`, so `~/.claude/router/evidence/` has no JSONL files in
production and `window.sufficient` is always `false`.

This phase's stated goal is closing the gap on the canary *trigger surface*
(adding the production canary trigger), not building the evidence ingestion
pipeline. Wiring `ingestTelemetryFile` into the watcher's reconcile cycle is a
non-trivial architectural addition requiring decisions that are out of scope
for a code-review fix:
- WHEN to ingest (every reconcile would couple ingestion to the watch cadence;
  a separate ingestion cadence is the natural design but has not been specified)
- HOW to deduplicate against already-ingested telemetry records (state file?
  offset cursor? fingerprint journal?)
- WHAT `candidate_version` to attribute ingested evidence to (the bridge needs
  this context, which is only meaningful at promotion time, not ingestion time)

The reviewer explicitly notes "This may be by design for this phase" and offers
"document explicitly that evidence ingestion is a separate phase" as an
acceptable resolution. Forcing the ingestion wiring into the watcher now would
risk locking in an ingestion contract (cadence, dedup state, attribution) that
the follow-on phase should be free to design. This should be tracked as a
follow-on phase gap, not a code-review fix. The sufficiency gate behaves
fail-safe (preserves rather than promotes) in the meantime, so no incorrect
promotion can result from the gap.

### IN-01: `canary status` creates the evidence directory as a side effect

**File:** `src/cli/router-control.mjs:308`
**Reason:** skipped: benign, not a correctness bug (reviewer's own assessment)
**Original issue:** `createPersistentEvidenceStore` calls `mkdirSync(root,
{ recursive: true, mode: 0o700 })` in its constructor, so the read-only
`canary status` verb creates the `evidence/` directory on first invocation.

The reviewer explicitly classifies this as "a benign mutation but surprising for
a status verb. Not a correctness bug." Splitting the store construction from the
directory creation (or adding a read-only store variant) would touch the
evidence-store contract used by both CLI and watcher for a purely cosmetic
concern. Not worth the risk.

### IN-02: `classifyFixtureClass` `deny_filtered` branch is unreachable

**File:** `src/evolution/telemetry-bridge.mjs:33`
**Reason:** skipped: harmless defensive dead code (reviewer's own assessment)
**Original issue:** `telemetryRecordToEvidence` returns `{ status: 'skipped' }`
for privacy-denied records (including `deny_filtered`) at line 58 before
`classifyFixtureClass` is called, so the `deny_filtered` branch in
`classifyFixtureClass` is unreachable.

The reviewer notes "The branch is defensive dead code. Harmless but worth a
comment if intentional." Removing the defensive check would make
`classifyFixtureClass` rely on the caller's precondition; keeping it is the
safer choice for a security-sensitive privacy boundary. The duplication of the
`deny_filtered` check at two layers is defense-in-depth, not a bug.

### IN-03: `canary rollback` silently ignores extra positional arguments

**File:** `src/cli/router-control.mjs:462`
**Reason:** skipped: intentional per existing comments (reviewer's own assessment)
**Original issue:** The `canary rollback` branch does not check
`positional.length`; Test 6 explicitly verifies the silent-ignore behavior.

The reviewer notes "This is intentional per the comments (lines 462-467)." The
existing comments and test lock the behavior in deliberately (destination is
`knownGood` only — no arbitrary operator-chosen version). Changing this would
break Test 6 and the locked-in safety contract.

### IN-04: Inconsistent exit codes between promote and rollback for non-success outcomes

**File:** `src/cli/router-control.mjs:443,459,508`
**Reason:** skipped: defensible asymmetry (reviewer's own assessment)
**Original issue:** Promote failures return `EXIT.invalid` (3); rollback failures
return `EXIT.unsafe` (4).

The reviewer notes "The asymmetry is defensible (rollback failure is a safety
concern; promote failure is a policy decision)." No fix is proposed — this is
an observation for operators scripting against the CLI, not a bug.

### IN-06: `PRIVACY_GUARDS` set duplicated four times across modules

**File:** `src/evolution/evidence.mjs:14`, `src/evolution/telemetry-bridge.mjs:20`, `src/registry/watcher.mjs:417`, `src/cli/router-control.mjs:375`
**Reason:** skipped: documented duplication; reviewer accepts either resolution
**Original issue:** The privacy guard code set is defined in four locations.

The reviewer offers "Export `PRIVACY_GUARDS` from `evidence.mjs` and import it in
the other three files, or accept the duplication with the existing
documentation" — explicitly accepting the status quo. The `telemetry-bridge.mjs`
comment (lines 17-19) already documents the duplication as intentional ("Mirrors
evidence.mjs:12 PRIVACY_GUARDS (not exported there)"). Exporting would touch
four files for a stylistic DRY change with no correctness benefit; the four
copies are frozen literal sets that have not diverged across the codebase. Per
the project's "Surgical Changes" guideline ("Don't refactor things that aren't
broken"), leaving the documented duplication in place is the lower-risk choice.

---

_Fixed: 2026-07-22T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_