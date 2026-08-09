---
phase: 45-deterministic-local-learning
plan: 01
requirements-completed: [LEARN-01, LEARN-02, LEARN-03, LEARN-04]
status: complete
completed: 2026-08-08
---

# Plan 45-01 Summary

Added the cold-path deterministic learning boundary over existing receipts, evidence, canary, and rollback primitives.

## Delivered

- Causal receipt credit is required before learning evidence is accepted.
- Evidence is partitioned by runtime, project, capability fingerprint, and mapping generation.
- Exact sample, consistency, freshness, negative-control, improvement, quality-regression, and latency thresholds are pre-registered and tested.
- Candidates are content-addressed and remain shadowed until every gate passes; canary failure restores the complete known-good tuple.
- Learned tuples cannot mutate authority, permissions, effect risk, privacy, or export fields.

## Verification

- `node --test tests/phase-45/local-learning.test.mjs`: 7 passed, 0 failed.
- Existing evolution and auto-calibration suites remained green in the combined Phase 45 gate.
