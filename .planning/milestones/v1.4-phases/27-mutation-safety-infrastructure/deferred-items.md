# Deferred Items (out-of-scope discoveries)

## Pre-existing test failures (not caused by Plan 27-01)

- **GRD-02: against real manifest, impeccable not in corpus** (`tests/router.guards.test.mjs`)
  - Fails against the base router.mjs (commit 6e366e6, pre-Task-1) — confirmed pre-existing.
  - Root cause: CLAUDE.md notes impeccable was resolved to `scope: "global"` on 2026-07-29
    (complete v3.9.1 skill now in ~/.agents/skills/impeccable, symlinked into claude + codex).
    The real manifest therefore reports impeccable as global, but this test asserts it is
    project-scoped and excluded from the global pool. The test's expectation contradicts the
    current manifest state. Out of scope for Plan 27-01 (mutation-safety hot-path guards);
    belongs to a manifest/scope reconciliation phase.

- **fresh installs declare and deploy the complete dual-runtime recommendation closure**
  (`tests/router.phase26-dual-runtime.test.mjs`)
  - Flaky: ENOENT rename race for `status.json.tmp` in a temp dir. Passes in isolation.
  - Environmental (parallel test contention / temp-dir rename race), not a router.mjs logic
    regression. Out of scope.

## Flaky perf tests (environmental, not a consistent regression)

- **hook with weights.json present completes < 100ms in-process** (`tests/router.perf-evolved.test.mjs`)
  - Flaky under full-suite CPU contention: 5 subprocess runs each with a 100ms wall-clock
    budget. Observed variance 78–101ms. Passes 3/3 in isolation and passes the full suite
    on most runs (e.g. run 2: 1123/1124 pass, only GRD-02 fails). Occasionally one run tips
    1–2ms over 100ms when the suite's parallel load spikes.
  - Plan 27-01 adds < 1ms to the hot path (one `readWeightsMtime` statSync per invocation;
    `routeTargetsExist` + `buildTargetIndexes` only on cache hits, sub-ms for ~244 entries).
    The budget variance is dominated by subprocess spawn + I/O, not by this plan's overhead.
  - Also flaky: `hook spawns worker on counter % 200 === 0` and `5/5 trivial-prompt
    invocations < 100ms` — same 100ms-subprocess-budget sensitivity. All pass in isolation.
