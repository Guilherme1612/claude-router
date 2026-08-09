---
phase: 57-native-runtime-health-and-watcher-resilience
plan: 01
subsystem: native-runtime
tags: [health, deployment, verification, privacy]
requires:
  - phase: 56-live-installer-and-upgrade-truth
    provides: explicit-root live installation and snapshot evidence
provides:
  - truthful Claude hook discovery for root package metadata
  - deployed latency-gate runtime source closure for Claude and Codex
  - bounded watcher verification evidence in controller projections
affects: [phase-57-plan-02, phase-59-production-acceptance]
tech-stack:
  added: []
  patterns: [bounded verification projection, owned runtime mirror closure]
requirements-completed: [HEALTH-01, HEALTH-04]
completed: 2026-08-09
status: complete
---

# Phase 57 Plan 01: Native Health Truth

The native controller now reports the actual verification result and the deployed gate fixtures execute against the same runtime source boundary as the repository tests.

## Accomplishments

- Excluded Claude root `hooks/package.json` from hook capability discovery; the live candidate moved from hook-invalid quarantine to eligible.
- Added the runtime hook and evolution worker to the installer-owned module and `src` mirror sets for both runtimes; the production latency gate no longer fails from an installed-root `ENOENT`.
- Added bounded verification evidence to watcher reconciliation and the privacy-safe live snapshot.
- Preserved fail-closed activation: the live candidate is eligible and all eight gates pass, but zero dispatchable records prevent publication of an empty compiled tuple.

## Verification

- `tests/router.adapters.test.mjs`: 11/11.
- `tests/router.registry-watcher.test.mjs`: 29/29.
- `tests/router.deployed-bundle.test.mjs`: 4/4.
- `tests/router.lifecycle.test.mjs`: 17/17.
- `tests/router.v19-live-snapshot.test.mjs`: 2/2.
- Installed manifest: 331 owned files; source and installed module hashes match.
