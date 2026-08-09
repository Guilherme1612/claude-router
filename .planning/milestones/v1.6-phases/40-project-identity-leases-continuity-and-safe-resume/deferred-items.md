# Phase 40 Deferred Items

## Out-of-scope discoveries (not caused by Phase 40-03 changes)

Pre-existing full-suite flaky failures under parallel execution (present at
baseline `e2636c6` before any 40-03 work). These pass in isolation; they fail
only when `rtk node --test tests/*.test.mjs` runs the whole suite in parallel
due to shared-HOME / shared-filesystem isolation collisions. They are
unrelated to the lease modules, the lifecycle deploy, and the `leases` CLI.

- `reinstall verb: uninstall followed by install with same source produces a fresh install transaction and preserves unrelated state` — fresh-onboarding.test.mjs
- `uninstall verb: owned root removed and settings.json byte-identical to pre-install snapshot` — fresh-onboarding.test.mjs
- `SAF-03 isolated full-corpus route measurement passes mutation-safety ceilings` — perf/safety suite
- `SAF-03/SAF-07: detached local evolution worker spawn remains the only hot-path child process exception` — perf/safety suite
- `SAF-02/SAF-06/SAF-07: evolved worker-trigger hot path stays below 100ms without operator diagnostics` — perf/safety suite
- `six recommendation kinds route through every installed runtime profile` — recommendation routing
- `fresh installs declare and deploy the complete dual-runtime recommendation closure` — fresh-onboarding / dual-runtime
- `CLI provides symmetric install and uninstall lifecycle` — install CLI
- `install verb across claude/codex/together fixture: install + uninstall preserves unrelated state` — install CLI

Per the executor scope-boundary rule, these are NOT auto-fixed. The
plan-specific suites (lease-briefing, lifecycle, control-cli, lease-*,
authority*, perf) are all green. Logged here for the verifier / ship gate.