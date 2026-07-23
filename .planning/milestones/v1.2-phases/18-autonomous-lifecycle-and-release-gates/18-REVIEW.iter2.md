---
phase: 18-autonomous-lifecycle-and-release-gates
reviewed: 2026-07-17T00:00:00Z
depth: standard
files_reviewed: 14
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
  warning: 7
  info: 3
  total: 10
status: issues_found
---

# Phase 18: Code Review Report

**Reviewed:** 2026-07-17T00:00:00Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Reviewed the Phase 18 gap-closure pass: (1) the opt-in `test_mode`/`verification_runners` seam in the activation path, (2) the five-verb coexistence matrix, and (3) the release runner's real TAP/RELEASE_METRICS parsing.

**Test_mode seam default-off invariant: VERIFIED.** The production hot path is untouched when `test_mode` is not set. `installRouter` only adds `test_mode`/`verification_runners` to the controller config when `options.testMode === true` (router-lifecycle.mjs:353); the `verification_runners` strip before fingerprinting is a no-op in production (router-lifecycle.mjs:358); `runRegistryWatcher` only swaps in `createTestActivationVerifier` when `config.test_mode === true` (watcher.mjs:194); and `trusted()` rejects `test_only:true` verifications unless `options.test_mode === true` (activate.mjs:87-90). No I/O perturbation occurs in the production path.

**Release runner stdout parsing: robust against injection and malformed input.** `parseChildEvidence` uses `JSON.parse` (no code execution), validates numbers via `Number.isFinite`, and fails closed on missing/malformed TAP summaries and metrics. One over-aggressive skip-detection behavior noted below.

**Coexistence test teardown: has cleanup gaps.** Multiple test files call `holder.child?.kill()` without awaiting the returned promise before `rmSync(root, ...)`. The in-process controller's async `close()` continues after `rmSync`, and its `publish('stopped')` call recreates the deleted controller directory via `atomicJson`'s `mkdir(dirname(path), {recursive: true})`, partially leaking the temp dir. One test (reinstall) also leaks a second controller holder on assertion failure.

No BLOCKERs found. Seven WARNINGs and three INFO items below.

## Warnings

### WR-01: Test cleanup races — `holder.child.kill()` not awaited before `rmSync`

**File:** `tests/router.autonomous-lifecycle.test.mjs:135`; `tests/router.lifecycle-recovery.test.mjs:165,213,253,291,338,378`; `tests/router.test-mode-seam.test.mjs:98`
**Issue:** The in-process controller launcher's `kill()` returns a promise that resolves once `runRegistryWatcher`'s `close()` completes (clearing heartbeat/control intervals + `publish('stopped')`). These finally blocks call `try { holder.child?.kill(); } catch {}` WITHOUT `await`, then immediately `rmSync(root, { recursive: true, force: true })`. The un-awaited `close()` continues in the background: its `publish('stopped')` calls `atomicJson(config.status_path, ...)` which does `await mkdir(dirname(path), { recursive: true })` — RECREATING the deleted controller directory inside the just-removed temp root. This partially leaks the temp dir (`<root>/.claude/router/controller/status.json` reappears) and can surface as an unhandled promise rejection if `publish('stopped')` fails for other reasons.

The `installer-coexistence.test.mjs` tests use `safeStopController` which DOES `await holder.child?.kill()` — proving the correct pattern exists. The other test files were not updated to match.

**Fix:**
```javascript
// In every finally block that currently does:
try { holder.child?.kill(); } catch {}
rmSync(root, { recursive: true, force: true });

// Replace with:
try { await holder.child?.kill(); } catch {}
rmSync(root, { recursive: true, force: true });
```

### WR-02: Reinstall verb test leaks `reinstallHolder` controller on assertion failure

**File:** `tests/router.installer-coexistence.test.mjs:220-259`
**Issue:** The 'reinstall verb' test creates two holders: `holder` (first install) and `reinstallHolder` (reinstall after uninstall). The finally block only calls `safeStopController(f, holder)` — it does NOT kill `reinstallHolder`. The `safeStopController(f, reinstallHolder)` call on line 254 is inside the `try` block; if any assertion between line 245 and 254 fails (e.g., `assert.ok(result.status === 'installed', ...)`), `reinstallHolder.child` is never killed. The leaked controller's heartbeat interval keeps firing (`publish('ready')` every `heartbeatMs`), keeping the event loop alive and potentially causing the test process to hang or time out. The `rmSync(f.root, ...)` in finally removes the root, but the leaked controller's `atomicJson` recreates the controller dir on the next heartbeat tick.

**Fix:**
```javascript
} finally {
  safeStopController(f, holder);
  safeStopController(f, reinstallHolder);  // <-- add this
  rmSync(f.root, { recursive: true, force: true });
}
```
Or declare `reinstallHolder` at the top scope alongside `holder` so the finally can clean it up unconditionally.

### WR-03: Rollback functions don't accept `test_mode` — rollback blocked for test_mode installs

**File:** `src/registry/activate.mjs:206-211` (`previewRollback`), `230-249` (`executeRollback`)
**Issue:** Phase 18 added `test_mode` to `trusted()`, `writeImmutableVersion`, `verifyVersion`, `replaceActivePointer`, and `recoverActiveVersion`. However, `previewRollback` and `executeRollback` were NOT updated to accept `test_mode`. They call `verifyVersion({ ownedRoot, versionId: destination, now })` (line 207) and `replaceActivePointer({ ownedRoot, destination, ... })` (line 238) with the default `test_mode = false`. For a test_mode install (where activated versions carry `test_only: true` verification), `trusted()` inside `verifyVersion` rejects the version (`verification_not_trusted`), so `previewRollback` returns `{ preview_status: 'blocked', reason_code: 'verification_not_trusted' }` and `executeRollback` cannot roll back. This is inconsistent with `recoverActiveVersion` (line 190), which DOES accept `test_mode`. No current test exercises rollback under test_mode, so this is latent, but the seam is incomplete.

**Fix:**
```javascript
export function previewRollback({ ownedRoot, destination, now = Date.now(), test_mode = false }) {
  ...
  const verdict = verifyVersion({ ownedRoot, versionId: destination, now, test_mode });
  ...
}

export function executeRollback({ ownedRoot, preview, confirmation, now = Date.now(), reason = 'rollback', io, test_mode = false }) {
  ...
  const fresh = previewRollback({ ownedRoot, destination: preview.destination_version_id, now: preview.generated_at, test_mode });
  ...
  const result = replaceActivePointer({ ownedRoot, destination: preview.destination_version_id, reason, expectedSequence: preview.source_sequence, io, now, test_mode });
  ...
}
```

### WR-04: Release runner skip detection marks entire stage as skipped when any single test has `# SKIP`

**File:** `src/release/run-release.mjs:133`
**Issue:** `executeChild` computes `skipped` as `/^ok .* # SKIP\b/im.test(stdout) || /^# skipped [1-9]/m.test(stdout)`. Both regexes match if ANY test in the stage's stdout has a SKIP directive — even when other tests in the same file passed. `parseChildEvidence` then checks `if (skipped) return { gate_results: [], reason_code: 'skipped' }` (line 103) BEFORE checking TAP pass/fail counts, so the pass count is never consulted. A stage with 5 passing tests and 1 platform-specific skipped test is treated as fully skipped, failing the release gate with reason `skipped`. This is fail-closed but over-strict: it blocks legitimate releases where a single test is conditionally skipped (e.g., platform-specific guard). The test on line 211 only covers the all-skipped case (`pass=0, fail=0, skipped=1`), not the mixed pass+skip case.

**Fix:** Only mark `skipped` when all tests are skipped (pass count is 0):
```javascript
const passMatch = stdout.match(/^# pass (\d+)/m);
const skipped = (/^ok .* # SKIP\b/im.test(stdout) || /^# skipped [1-9]/m.test(stdout))
  && (!passMatch || Number(passMatch[1]) === 0);
```
Or move the `skipped` check in `parseChildEvidence` to after the TAP pass/fail check, so a stage with passing tests isn't marked skipped.

### WR-05: Coexistence sentinel tests don't perform the verbs they claim to test

**File:** `tests/router.coexistence.test.mjs:133-144`
**Issue:** The tests named `sentinel distinctness after ${verb} verb: re-import hook and re-assert` (for `install`, `upgrade`, `reinstall`, `disable+enable`, `uninstall`) do NOT perform any of those verbs against a fixture. They only re-import the hook module via `importHook()` and re-assert the `SENTINEL` export. Since `SENTINEL` is a module-level constant, re-importing always yields the same value (Node's module cache). The tests prove the module cache is stable, NOT that the verbs preserve the sentinel. The actual verb execution is in `router.installer-coexistence.test.mjs`, which does NOT check the sentinel. The Phase 18 context says this suite was "extended to a full five-verb lifecycle matrix" — but the sentinel distinctness coverage across verbs is a proxy that would pass even if a verb corrupted the hook source. The comment at lines 124-129 acknowledges this is a proxy but the test names imply stronger coverage.

**Fix:** Either rename the tests to accurately describe what they verify (e.g., `sentinel is stable across re-imports`), or have the tests actually call `installRouter`/`upgradeRouter`/etc. against a temp fixture and then re-import the installed hook to verify the sentinel is preserved.

### WR-06: `test-mode-seam.mjs` `kill()` can surface unhandled promise rejection

**File:** `tests/helpers/test-mode-seam.mjs:36-52`
**Issue:** `kill()` returns `handle.close()` (a promise) when `handle` is set. `runRegistryWatcher`'s `close()` does `await controller.close(); await publish('stopped');` — if `publish('stopped')` rejects (e.g., `atomicJson` fails on a removed dir), `close()` rejects, and `kill()` returns that rejected promise. The `closeHandle` wrapper's `try/catch` (line 39-41) only catches synchronous throws from `handle.close()`, NOT async rejections from the returned promise. Callers that do `try { holder.child?.kill(); } catch {}` without `await` (WR-01) would surface an unhandled promise rejection, which on Node ≥20 can crash the test process. Even callers that `await kill()` (installer-coexistence) catch via `try { await holder.child?.kill(); } catch {}`, but the un-awaited callers do not.

**Fix:**
```javascript
const closeHandle = () => {
  try {
    return (handle ? handle.close() : Promise.resolve()).catch(() => { /* already closed or publish failed */ });
  } catch { return Promise.resolve(); }
};
```

### WR-07: `safeStopController` uses a non-deterministic 20ms sleep after `await kill()`

**File:** `tests/router.installer-coexistence.test.mjs:107-114`
**Issue:** `safeStopController` correctly awaits `holder.child?.kill()`, but then adds `await new Promise(resolve => setTimeout(resolve, 20))` before `rmSync(status.json)`. The comment says this is to "avoid racing with the close's publish('stopped) write" — but `await kill()` already waits for `close()` to complete (which includes `await publish('stopped')`). The 20ms sleep is redundant if `kill()` is properly awaited, and non-deterministic if there's some other race it's papering over. If `kill()` doesn't guarantee `publish('stopped')` is flushed (e.g., because `close()` returned before `publish`'s `atomicJson` `renameSync` landed on disk), the 20ms is a fragility — a slow CI disk could exceed 20ms. The `lifecycle-recovery.test.mjs` tests use 50-80ms sleeps for the same purpose, suggesting the timing is not well-characterized.

**Fix:** Remove the sleep if `await kill()` is sufficient (it should be — `close()` awaits `publish('stopped')`). If there's a real race, document it and use a deterministic signal (e.g., `await controller.flush()` or check the status file content) rather than a sleep.

## Info

### IN-01: `observedCells` shared mutable state couples the two tests in `autonomous-lifecycle`

**File:** `tests/router.autonomous-lifecycle.test.mjs:14,140-142`
**Issue:** `observedCells` is module-level mutable state. The runtime test pushes to it as operations complete; the "all fourteen cells" test asserts the full list. If the runtime test fails midway, the second test also fails (cascade). Not a bug — `node:test` runs tests sequentially within a file — but a test design coupling that makes failures noisy. Consider folding the coverage assertion into the runtime test's finally, or using a per-runtime counter.

### IN-02: `validateReleaseMatrix` doesn't check secondary evidence for circular self-reference

**File:** `src/release/run-release.mjs:64-71`
**Issue:** `validateCommands` for primary evidence rejects `tests/router.v12-release.test.mjs` as circular (line 42-43), but for secondary evidence (line 69) the `primary` flag is not passed, so the circular check is skipped. A secondary evidence entry could legitimately reference `tests/router.v12-release.test.mjs` without being rejected. This is not a runtime risk (`executeChild` runs it as a one-shot child, no recursion), but it's a validation gap if the matrix is meant to prevent self-dependency. Minor — the test on line 41 only covers the primary case.

### IN-03: `tests/router.coexistence.test.mjs` hardcodes the user's node binary path

**File:** `tests/router.coexistence.test.mjs:13`
**Issue:** `const NODE = '/Users/guilherme/.hermes/node/bin/node';` — hardcoded absolute path. Consistent with the project's `CLAUDE.md` (which mandates this exact binary for hook bindings), but not portable to other environments. The other test files use `process.execPath`. This is intentional for this file (it spawns the real installed hook), but a future environment change would silently break these tests. Consider deriving the path from the installed hook's settings.json binding or a `ROUTER_NODE_BINARY` env var with this as the default.

---

_Reviewed: 2026-07-17T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_