---
phase: 45-deterministic-local-learning
status: complete
---

# Phase 45 Research

## Existing seams

- `src/adapters/dispatch/receipt.mjs` provides stable identity, terminal state, bounded attribution, and causal outcome credit.
- `src/evolution/evidence.mjs` already provides project-scoped validated evidence, seven-day retention, 24-hour half-life weighting, and a 30-sample floor.
- `src/evolution/canary-controller.mjs` already provides content-addressed candidates, independent hard gates, rollback-journal recovery, and known-good preservation.
- `src/registry/activate.mjs` already owns immutable version activation and complete rollback tuples.

## Gap

Existing evolution code can evaluate a candidate, but no small boundary turns credited receipts plus explicit corrections into runtime/project/capability/generation partitions with a pre-registered deterministic promotion policy.

## Pre-registered thresholds

| Gate | Exact value |
|---|---:|
| minimum credited samples | 30 |
| minimum consistency | 0.95 |
| maximum evidence age | 7 days |
| minimum negative controls | 5 |
| minimum quality improvement | 0.01 |
| maximum quality regression | 0 |
| maximum latency regression | 0 ms |

Insufficient evidence remains shadowed. Any contradictory, stale, privacy-invalid, or failed canary evidence preserves the complete last-known-good tuple.
