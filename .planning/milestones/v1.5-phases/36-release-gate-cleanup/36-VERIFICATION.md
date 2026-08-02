---
phase: 36-release-gate-cleanup
verified: 2026-08-01
status: passed
score: 10/10 must-haves verified
behavior_unverified: 0
deferred:
  - "Live operator activation remains unavailable because the real-home candidate is safely quarantined; the exact reason is recorded in 36-03-SUMMARY.md."
---

# Phase 36 Verification Report

## Goal Achievement

| Truth | Evidence | Status |
| --- | --- | --- |
| Installer deploys its runtime dependency closure | tie-lint gate and 225-file live manifest | VERIFIED |
| Real-home install reaches controller readiness | `INSTALL OK`; status `ready/current`; pending `[]` | VERIFIED |
| Hook snapshot and live hook remain identical | byte comparison | VERIFIED |
| Cold-start defaults remain 0.591/0.291/0.191 | fresh onboarding and calibration evidence | VERIFIED |
| Controller handoff avoids duplicate generations | lifecycle fix and live single-PID check | VERIFIED |
| Safe runtime noise does not dirty Codex continuously | wildcard/prefix watcher and fingerprint filters | VERIFIED |
| Symlink escapes remain excluded and diagnosed | fingerprint security test | VERIFIED |
| Reverse-gap baseline remains 210 | coverage audit | VERIFIED |
| Calibration and sensitivity were rerun without relaxation | 56/58; T_high range 0.301–0.591 | VERIFIED |
| Operator activation outcome is explicit | control CLI returned `invalid_active_version`; quarantine preserved | VERIFIED |

## Commands

- `node --test --test-concurrency=1 tests/*.mjs` — 1284/1284 passed
- Release-focused suite — 48/48 passed
- Lifecycle/watcher/adapters readiness suite — 55/55 passed
- `node router.calibrate.mjs` — 56/58; defaults and sensitivity recorded
- Live `node install-router.mjs` — `INSTALL OK — repaired and verified`
- Live controller audit — `ready/current`, no pending changes, 225 owned files, one controller PID

Phase 36 is complete. The v1.5 milestone is release-verified with operator activation explicitly recorded as unavailable rather than bypassed.

## Requirements Traceability

| Requirement | Evidence | Status |
| --- | --- | --- |
| REL-08 | Real-home installer, deployed readiness, snapshot parity, and release-focused suite; current live activation remains quarantined pending conflict resolution | VERIFIED WITH LIVE QUARANTINE |
| REL-09 | Fresh onboarding, cold-start threshold, and calibration-default tests | VERIFIED |
| REL-10 | Lifecycle teardown/reinstall tests plus live PID and watcher audit | VERIFIED |
