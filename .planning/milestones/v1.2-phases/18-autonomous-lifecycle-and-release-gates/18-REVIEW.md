---
phase: 18-autonomous-lifecycle-and-release-gates
reviewed: 2026-07-17T13:45:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - src/adapters/claude.mjs
  - src/lifecycle/router-lifecycle.mjs
  - src/registry/activate.mjs
  - src/registry/watcher.mjs
  - src/release/run-release.mjs
  - tests/helpers/latency-isolated.mjs
  - tests/helpers/test-mode-seam.mjs
  - tests/router.autonomous-lifecycle.test.mjs
  - tests/router.coexistence.test.mjs
  - tests/router.compiled-evolution.test.mjs
  - tests/router.installer-coexistence.test.mjs
  - tests/router.lifecycle-recovery.test.mjs
  - tests/router.test-mode-seam.test.mjs
  - tests/router.v12-release.test.mjs
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
status: clean
---

# Phase 18: Code Review Report

**Reviewed:** 2026-07-17T13:45:00Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** clean

## Summary

Iteration 2 re-review of Phase 18. The prior iteration (iteration 1) found 0 critical + 7 warning + 3 info findings. All 7 warnings were fixed in commits `683490c..e6157d3`. The 3 info findings (IN-01 observedCells coupling, IN-02 secondary-evidence circular gap, IN-03 hardcoded node binary) are out of fix scope and are NOT re-flagged as warnings — they remain info from iteration 1.

**All 7 fixes are verified sound. No regressions and no new issues found in the changed files. Status: clean.**

### Fix verification (WR-01 through WR-07)

**WR-01 — `await holder.child.kill()` in test finally blocks.** Fixed in `tests/router.autonomous-lifecycle.test.mjs:135`, `tests/router.lifecycle-recovery.test.mjs` (6 finally blocks: 165, 213, 253, 291, 338, 378), and `tests/router.test-mode-seam.test.mjs:98`. The `kill()` helper already returned a promise (the `pendingClose` handle); each finally now awaits it before `rmSync(root, ...)`, so the controller's async `close()` (which awaits `publish('stopped')` per `watcher.mjs:239`) completes before the temp root is removed. Verified: no finally block in the in-scope test files calls `holder.child?.kill()` without `await` before an `rmSync`.

**WR-02 — `reinstallHolder` leaked on assertion failure.** Fixed in `tests/router.installer-coexistence.test.mjs:228-265`. `reinstallHolder` is now declared at the top of the test body (`let reinstallHolder = null`), set to `null` after the in-try `safeStopController`, and the finally block guards `if (reinstallHolder) safeStopController(f, reinstallHolder)` before the primary holder cleanup. This closes the leak path where an assertion between the second `installRouter` and the in-try `safeStopController` could leave the second controller's heartbeat running. Sound.

**WR-03 — `test_mode` threading through rollback.** Fixed in `src/registry/activate.mjs:206-211` (`previewRollback`) and `230-249` (`executeRollback`). Both functions now accept `test_mode = false` and thread it into `verifyVersion` (line 207), the freshness re-check `previewRollback` (line 232), and `replaceActivePointer` (line 238). This makes the test-mode seam consistent with `recoverActiveVersion` (line 190) for the rollback path. Verified the `preview_fingerprint` body does not include `test_mode`, so the `stale_preview` check remains stable across matching `test_mode` settings on the caller side. No regression on the production path (`test_mode` defaults to `false`).

**WR-04 — Skip detection over-aggressive.** Fixed in `src/release/run-release.mjs:136-138`. `executeChild` now computes `passMatch` first and only marks `skipped` when a SKIP directive is present AND the pass count is zero (`(!passMatch || Number(passMatch[1]) === 0)`). A stage with 5 passing tests and 1 platform-specific `# SKIP` is no longer marked fully skipped. `parseChildEvidence` still fail-closes on the all-skipped case (pass=0, fail=0, SKIP) via the `no-tap-summary` path. No regression: a fully-skipped stage still fails the gate (skipped=true → `assertStageResult` rejects).

**WR-05 — Sentinel re-import tests renamed.** Fixed in `tests/router.coexistence.test.mjs:136`. Tests renamed from `sentinel distinctness after ${verb} verb: re-import hook and re-assert` to `sentinel is stable across re-imports (${verb} verb label)`. The comment block (lines 123-131) accurately describes the tests as a re-import stability proxy, not verb-execution coverage. No behavioral change; documentation accuracy fix only.

**WR-06 — `kill()` unhandled rejection.** Fixed in `tests/helpers/test-mode-seam.mjs:41-52`. Both close paths now wrap `handle.close()` in `.catch(() => {})`:
- The `handle`-ready path: `(handle ? handle.close() : Promise.resolve()).catch(() => { /* already closed or publish('stopped') failed */ })`
- The poll path: `handle.close().catch(() => {}).then(resolve, resolve)`

This absorbs the rejection when `publish('stopped')` fails (e.g., controller dir already removed by a racing teardown). The `pendingClose` promise now always resolves rather than rejecting, so callers that `try { await holder.child?.kill(); } catch {}` (WR-01) and even un-awaited callers no longer surface an unhandled promise rejection. Sound.

**WR-07 — Redundant 20ms sleep in `safeStopController`.** Fixed in `tests/router.installer-coexistence.test.mjs:107-114`. The `await new Promise(resolve => setTimeout(resolve, 20))` was removed. Verified the rationale: `await holder.child?.kill()` awaits `close()` (`watcher.mjs:236-240`), which does `await controller.close(); await publish('stopped')`. Once `kill()` resolves, `publish('stopped')` has landed on disk (atomic temp+rename). The subsequent `rmSync(status.json)` operates on the post-close state.

  Race analysis: the heartbeat interval (`setInterval(..., 1000)`) is cleared by `close()` (`clearInterval(heartbeat)` at `watcher.mjs:238`) before `await publish('stopped')`, so no NEW heartbeat ticks fire after `close()` begins. An in-flight heartbeat `publish('ready')` started before `close()` is not awaited by `close()`, but with `heartbeat_ms = 1_000` (the default; tests do not override) and test bodies completing well under 1s, no heartbeat tick fires between the initial `publish('ready')` and `close()` in any of the in-scope tests. The 20ms was not load-bearing for any observed race; removal is safe.

### Re-review of in-scope files (no new issues)

Beyond verifying the fixes, the in-scope files were re-scanned at standard depth:

- `src/adapters/claude.mjs`: settings-fingerprint filtering strips `router.mjs` bindings from every event so install/upgrade/disable/enable/uninstall mutations do not perturb the binding observation's `source_fingerprint` (lines 285-295). Filter uses `JSON.stringify(entry).includes('router.mjs')` — a substring match that would over-strip a hypothetical non-router binding that mentions `router.mjs` in a comment, but no such binding exists in the project's settings contract. No new issue.
- `src/lifecycle/router-lifecycle.mjs`: `durableAtomicWrite` (lines 26-34) fsyncs the directory after rename; `uninstallRouter` (lines 489-572) validates the manifest before any mutation, prunes lifecycle-owned `install-state` and `versions` trees, and re-prunes the owned roots. The pointer-file detection regex (line 522) correctly matches the `upgradeRouter` import-pointer format. No new issue.
- `src/registry/watcher.mjs`: the `test_mode` opt-in (line 194) only swaps in `createTestActivationVerifier` when `config.test_mode === true`; production-default leaves the production verifier. The `verification_runners` strip before fingerprinting (line 183) matches the same strip in `installRouter` (`router-lifecycle.mjs:358`), so the fingerprint is stable across the install→controller boundary. No new issue.
- `src/release/run-release.mjs`: `parseChildEvidence` uses `JSON.parse` (no eval), `Number.isFinite` validation on measurements, and fail-closes on missing/malformed TAP summaries and metrics. `assertStageResult` requires every `gate_id` to be present AND `pass === true` AND a string `reason_code`, so a partial gate set is rejected. No new issue.
- `tests/helpers/latency-isolated.mjs`: subprocess cleans up temp roots in `finally`; no new issue.
- `tests/router.compiled-evolution.test.mjs`: latency thresholds asserted only under `ROUTER_RELEASE_STAGE === 'latency'`; the corpus fingerprint is a fixed golden value. No new issue.

### Pre-existing latent observations (NOT introduced by the fixes, not re-flagged)

For completeness, two pre-existing latent properties were re-confirmed during this re-review. They are NOT new, NOT introduced by the iteration-2 fixes, and are noted here only so they are not lost:

1. `tests/helpers/test-mode-seam.mjs:49-58` — if `kill()` is called before `runRegistryWatcher` resolves AND `runRegistryWatcher` rejects, the `poll()` loop polls indefinitely because `handle` never becomes non-null and the loop does not check `child.exitCode`. Not triggerable in the in-scope tests (every test awaits `installRouter`, which awaits `waitForController` before the test calls `kill()`), and not introduced by the WR-06 fix (the polling structure predates it). Pre-existing.
2. `src/registry/watcher.mjs:217,236-240` — an in-flight heartbeat `publish('ready')` tick that fired before `close()` is not awaited by `close()`; in principle it could land after `publish('stopped')`. Not triggerable in practice at `heartbeat_ms = 1_000` with sub-second test bodies, and not affected by the WR-07 fix. Pre-existing.

Both are out of scope for this iteration (not regressions from the 7 fixes, not new in the changed files) and are not classified as findings.

## Critical Issues

None.

## Warnings

None.

## Info

None (the 3 info findings from iteration 1 — IN-01 observedCells coupling, IN-02 secondary-evidence circular gap, IN-03 hardcoded node binary — remain info from iteration 1 and are out of fix scope per the iteration-2 brief; not re-flagged here).

---

_Reviewed: 2026-07-17T13:45:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_