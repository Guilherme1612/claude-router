---
phase: 56-live-installer-and-upgrade-truth
plan: 02
subsystem: infra
tags: [installer, recovery, uninstall, preservation, live-runtime]
requires:
  - phase: 56-live-installer-and-upgrade-truth
    provides: privacy-safe explicit-root live snapshot boundary
provides:
  - live dry-run, upgrade, preservation, restart, uninstall, and reinstall evidence
  - owned mutable-state cleanup for controller-mutated candidate/report and tuple state
  - full-suite proof against the redeployed live hook
affects: [phase-57-native-runtime-health, milestone-v1.9]
tech-stack:
  added: []
  patterns: [manifest-driven mutable cleanup, fail-closed quarantine handoff]
key-files:
  created:
    - .planning/evidence/v1.9/live-recovery.json
  modified:
    - src/lifecycle/router-lifecycle.mjs
    - src/runtime/router.mjs
    - tests/router.installer-coexistence.test.mjs
    - .planning/evidence/v1.9/live-after.json
requirements-completed: [LIVE-02, LIVE-03, LIVE-04]
coverage:
  - id: D1
    description: "Live dry-run and owned upgrade prove source/installed identity"
    requirement: LIVE-02
    verification:
      - kind: integration
        ref: ".planning/evidence/v1.9/live-recovery.json#preflight and upgrade"
        status: pass
    human_judgment: false
  - id: D2
    description: "Unrelated Claude/Codex state and coexisting hooks remain preserved"
    requirement: LIVE-03
    verification:
      - kind: integration
        ref: ".planning/evidence/v1.9/live-upgrade.json#preservation_recheck"
        status: pass
    human_judgment: false
  - id: D3
    description: "Owned uninstall/reinstall and recovery leave no orphaned Router roots"
    requirement: LIVE-04
    verification:
      - kind: integration
        ref: ".planning/evidence/v1.9/live-recovery.json#recovery"
        status: pass
      - kind: unit
        ref: "tests/router.installer-coexistence.test.mjs#uninstall removes controller-mutated candidate and report state as owned mutable files"
        status: pass
    human_judgment: false
duration: 2h
completed: 2026-08-09
status: complete
---

# Phase 56 Plan 02: Live Installer and Recovery Truth

**The live Claude/Codex installation now has recorded upgrade, preservation, restart, uninstall, and reinstall evidence with bounded ownership cleanup.**

## Accomplishments

- Ran dry-run before mutation, upgraded from the current source bundle, restarted the controller, and verified source/deployed hashes, manifest integrity, controller configuration identity, and no immutable ownership mismatches.
- Rechecked normalized Claude/Codex projections and external-state digests for preservation; the serial lifecycle suite passed 36/36 and the redeployed live safety matrix passed 27/27.
- Fixed the root cause of uninstall retention for controller-mutated candidate/report files and release-tuple state, with regression coverage.
- Ran the full serial suite against the redeployed live hook: 1,651/1,651 passed.

## Task Commits

1. **Task 1: Close owned live removal gaps and redeploy current source** - `ee4d8c8`

## Issues Encountered

- The first live uninstall retained `candidate/registry.json` and `candidate/report.json`; the uninstaller was not honoring their mutable ownership despite the runtime inventory declaring them mutable. The fix classifies those paths as owned mutable state.
- A subsequent recovery check exposed `release-tuples/active.json` as an unpruned owned state directory; the uninstaller now prunes `release-tuples` as part of owned recovery.
- The first full-suite run caught stale installed comments matching a static fail-open safety regex. The source comments were clarified and the live hook was redeployed; the final full suite is green.

## Next Phase Readiness

The installer truth loop is closed. The clean reinstall leaves the controller safely quarantining the live candidate with no active tuple; Phase 57 must resolve the native path-escape, cycle, and hook-invalid diagnostics before semantic activation is claimed.

---
*Phase: 56-live-installer-and-upgrade-truth*
*Plan: 02*
