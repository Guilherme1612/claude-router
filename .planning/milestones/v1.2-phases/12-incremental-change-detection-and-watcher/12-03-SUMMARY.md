---
phase: 12-incremental-change-detection-and-watcher
plan: "03"
subsystem: registry-control-plane
tags: [node, fs-watch, debounce, repair, detached-controller, rollback]
requires:
  - phase: 12-01
    provides: Portable fingerprint state and deterministic lifecycle diffs
  - phase: 12-02
    provides: Full-equivalent incremental registry assembly
provides:
  - Debounced single-flight filesystem watcher with bounded latency and five-minute repair
  - Detached owned controller deployment, readiness, restart, rollback, and uninstall lifecycle
  - Live subprocess evidence for mutation detection and downtime repair
affects: [phase-13-reconciliation, registry-control-plane, installer]
tech-stack:
  added: []
  patterns: [hint-only fs.watch, bounded debounce, single-flight rerun, owned detached Node worker]
key-files:
  created: [src/registry/watcher.mjs, tests/router.registry-watcher.test.mjs]
  modified: [src/registry/fingerprint.mjs, src/lifecycle/router-lifecycle.mjs, tests/router.lifecycle.test.mjs, install-router.mjs]
key-decisions:
  - "Filesystem notifications are hints only; every reconciliation performs a complete portable root scan before persisting the new baseline."
  - "Controller readiness requires a live PID, fresh heartbeat, matching configuration fingerprint, and ready state."
  - "Router-owned runtime paths are excluded from fingerprint acquisition to prevent self-generated controller writes from feeding reconciliation."
patterns-established:
  - "Dirty roots are sorted and coalesced with a maximum latency deadline; in-flight events produce one follow-up without concurrent state writes."
  - "Install, restart, and uninstall use one detached local Node worker contract with cooperative control records and bounded readiness."
requirements-completed: [CHG-02, REG-03]
coverage:
  - id: D1
    description: "Normal and filename-less filesystem hints reconcile once within the two-second ceiling, with deterministic dedupe and shutdown."
    requirement: CHG-02
    verification:
      - kind: unit
        ref: "tests/router.registry-watcher.test.mjs#watcher timing matrix"
        status: pass
    human_judgment: false
  - id: D2
    description: "Startup and periodic repair remain available after watcher failure and preserve the last valid state after reconcile failure."
    requirement: CHG-02
    verification:
      - kind: unit
        ref: "tests/router.registry-watcher.test.mjs#repair and failure tests"
        status: pass
    human_judgment: false
  - id: D3
    description: "Install launches a ready owned controller; live mutations and downtime changes reconcile through restart without prompt-hook work."
    requirement: REG-03
    verification:
      - kind: integration
        ref: "tests/router.lifecycle.test.mjs#live mutation reconciles within two seconds and stopped-controller mutation repairs on restart"
        status: pass
    human_judgment: false
duration: 31min
completed: 2026-07-15
status: complete
---

# Phase 12 Plan 03: Repairable Watcher and Owned Controller Summary

**A bounded single-flight filesystem watcher now drives inactive registry reconciliation through a verified detached local controller with deterministic repair, restart, rollback, and uninstall semantics.**

## Performance

- **Duration:** 31 min
- **Started:** 2026-07-15T11:50:00Z
- **Completed:** 2026-07-15T12:21:29Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added 250 ms debounce, a configurable sub-two-second maximum latency, sorted dirty-root dedupe, single-flight reconciliation, exactly-one follow-up, startup repair, five-minute periodic repair, failure-safe baseline persistence, and complete shutdown.
- Extended one-command installation to copy the watcher/fingerprint/diff modules and owned config/state/control/status records, launch a detached local Node controller, and return only after matching live readiness.
- Added cooperative restart with direct stale-controller replacement, rollback on readiness failure, and ownership-safe cooperative uninstall.
- Proved a real watched capability mutation reaches the inactive candidate within two seconds and a mutation made during controller downtime is found on restart.

## Task Commits

1. **Task 1 RED: watcher timing contract** - `3105de0` (test)
2. **Task 1 GREEN: repairable registry watcher** - `415ca2b` (feat)
3. **Task 2 RED: controller lifecycle contract** - `1b8e036` (test)
4. **Task 2 GREEN: owned watcher controller deployment** - `138fab1` (feat)

**Plan metadata:** skipped (commit_docs disabled)

## Verification

- Focused watcher/diff/build suite: 16/16 passed.
- Lifecycle/settings/watcher suite: 32/32 passed.
- Phase 12 focused gate: 53/53 passed.
- Full repository suite: 430/430 passed.

## Decisions Made

- Full portable scans remain the baseline authority; dirty roots bound scheduling and reconciliation context but never create partial persisted fingerprint state.
- Runtime controller state is mutable ownership-scoped data, while config and installed modules remain fingerprint-protected static ownership entries.
- Readiness is not inferred from spawn success: status, instance ID, PID liveness, heartbeat freshness, and configuration fingerprint must all agree.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Excluded controller-owned paths from fingerprint acquisition**
- **Found during:** Task 2
- **Issue:** Status, control, candidate, and scan-state writes reside beneath watched runtime roots and could otherwise trigger self-generated reconciliation or self-referential fingerprint churn.
- **Fix:** Added portable ignored-relative-path support to fingerprint scans and configured the owned `router` subtree as ignored while preserving filename-less repair hints.
- **Files modified:** `src/registry/fingerprint.mjs`, `src/registry/watcher.mjs`, `src/lifecycle/router-lifecycle.mjs`
- **Verification:** Live mutation, periodic repair, and full-suite tests pass.
- **Committed in:** `138fab1`

**2. [Rule 1 - Bug] Made concurrent status publication collision-safe**
- **Found during:** Task 2
- **Issue:** Watch error reporting and readiness publication could target the same deterministic temporary status filename concurrently.
- **Fix:** Gave every atomic status write a unique temporary filename before rename.
- **Files modified:** `src/registry/watcher.mjs`
- **Verification:** Controller launch/readiness and full lifecycle suite pass.
- **Committed in:** `138fab1`

## Known Stubs

None.

## Threat Review

- T-12-07 is mitigated by bounded dirty-root debounce, maximum latency, single-flight execution, and one rerun flag.
- T-12-08 is mitigated by compute/reconcile-before-write ordering and last-valid baseline retention.
- T-12-09 is mitigated by complete preflight, fingerprinted configuration, live readiness, cooperative control, bounded rollback, and ownership-safe mutable paths.
- T-12-10 is mitigated by portable logical roots and relative paths in persisted fingerprint state.
- No package manager, network service, shell supervisor, launchd/systemd integration, or prompt-hook scan path was introduced.

## Self-Check: PASSED

- All six created or modified implementation/test files exist.
- Commits `3105de0`, `415ca2b`, `1b8e036`, and `138fab1` exist in repository history.
- Focused and full repository verification passed, and no live test controller remains.

---
*Phase: 12-incremental-change-detection-and-watcher*
*Completed: 2026-07-15*
