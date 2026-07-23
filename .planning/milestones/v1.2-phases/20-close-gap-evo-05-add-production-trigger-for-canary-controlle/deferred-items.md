# Deferred Items — Phase 20

## Pre-existing: parallel-install-test flakiness in lifecycle/settings-diff suites

**Discovered during:** Plan 20-02, Task 3 (watcher canary wiring).

**Nature:** `tests/router.lifecycle.test.mjs`, `tests/router.settings-diff.test.mjs`,
`tests/router.test-mode-seam.test.mjs`, `tests/router.autonomous-lifecycle.test.mjs`, and
`tests/router.lifecycle-recovery.test.mjs` install/uninstall the router and spawn real
controller subprocesses. `node --test` runs tests within a file CONCURRENTLY by default.
Multiple install tests running in parallel spawn competing controllers that race for
readiness; under load a controller can exit before the 5s readiness deadline, surfacing as
`controller exited before readiness with code 1`.

**Pre-existing, not introduced by 20-02:** With `src/registry/watcher.mjs` reverted to the
pre-wiring (532b5c0) state, `node --test tests/router.lifecycle.test.mjs` is also flaky
(observed 1/20 fail on one run, 0/20 on the next). The 20-02 wiring adds module-load weight
to the controller (new imports: canary-controller, evidence, perf-measure, compile-index,
candidate-calibration-route), which marginally increases the flake rate, but the root cause
is the parallel-test concurrency, not the canary logic.

**Evidence the 20-02 logic is correct:**
- `node --test --test-concurrency=1 tests/router.lifecycle.test.mjs` → 20/20 pass with the
  wired watcher (sequential execution eliminates the race).
- `node --test tests/router.watcher-canary-trigger.test.mjs` → 7/7 pass (deterministic).
- `node --test tests/router.evolution-canary.test.mjs tests/router.compiled-evolution.test.mjs tests/router.registry-watcher.test.mjs` → 44/44 pass (deterministic).
- The watcher-canary-trigger integration tests cover promote/preserve/bootstrap/rollback/
  neutral/D-04-helper/D-06-export edges and pass deterministically.

**Out of scope per executor deviation rules:** Pre-existing test-isolation failures in
unrelated files are not auto-fixed. The fix would be to serialize the install/lifecycle
tests (e.g., `test.sequential` or a shared install lock) — a test-harness change unrelated
to the EVO-05 production trigger.

**Recommendation:** Convert the install/lifecycle suites to sequential execution
(`import { test } from 'node:test'; test.sequential(...)` or a shared controller mutex) in
a future hygiene phase.