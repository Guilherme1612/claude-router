---
phase: 56-live-installer-and-upgrade-truth
plan: 01
subsystem: testing
tags: [live-runtime, snapshot, privacy, installer]
requires:
  - phase: 55-installer-native-parity-and-release-truth
    provides: installer ownership and installed-runtime lifecycle contracts
provides:
  - privacy-safe explicit-root live snapshot CLI
  - deterministic snapshot and invalid-ownership regression coverage
affects: [phase-56-plan-02, phase-57-native-runtime-health]
tech-stack:
  added: []
  patterns: [stdlib-only allowlisted evidence, explicit runtime roots]
key-files:
  created:
    - scripts/v19-live-snapshot.mjs
    - tests/router.v19-live-snapshot.test.mjs
  modified: []
key-decisions:
  - "Snapshot only allowlisted scalar metadata and hashes; raw prompt, session, audit, telemetry, and log bodies stay out of evidence."
  - "Ownership paths are validated against explicit Claude/Codex roots before output is created."
patterns-established:
  - "Live evidence is deterministic apart from capture time and uses a documented exclusion policy for session noise."
requirements-completed: [LIVE-01, LIVE-02]
coverage:
  - id: D1
    description: "Explicit-root privacy-safe snapshot command"
    requirement: LIVE-01
    verification:
      - kind: integration
        ref: "tests/router.v19-live-snapshot.test.mjs#live snapshot is explicit-root, allowlisted, and stable apart from capture time"
        status: pass
    human_judgment: false
  - id: D2
    description: "Invalid ownership paths fail without partial evidence"
    requirement: LIVE-02
    verification:
      - kind: unit
        ref: "tests/router.v19-live-snapshot.test.mjs#invalid ownership paths fail before creating snapshot output"
        status: pass
    human_judgment: false
duration: 30min
completed: 2026-08-09
status: complete
---

# Phase 56 Plan 01: Live Snapshot Evidence

**A reusable, privacy-safe snapshot boundary now proves live runtime identity without persisting raw user content.**

## Accomplishments

- Added a stdlib-only CLI covering source hashes, managed hook projections, ownership manifests, controller fingerprints, tuple/pointer state, candidate/report disposition, lifecycle metadata, and bounded external-state digests.
- Added anonymous dual-runtime fixtures proving deterministic output, explicit-root isolation, raw-content exclusion, and fail-closed invalid ownership handling.
- Kept the snapshot command read-only and atomic: invalid ownership is rejected before output creation.

## Task Commits

1. **Task 1: Build privacy-safe live snapshot boundary** - `3deeefe`

## Issues Encountered

None in the snapshot implementation. The live controller's quarantined candidate is recorded as bounded disposition metadata and handed to Phase 57 health work.

## Next Phase Readiness

Plan 02 can run the existing installer against the live homes using `live-before.json` and the snapshot CLI as its evidence boundary.

---
*Phase: 56-live-installer-and-upgrade-truth*
*Plan: 01*
