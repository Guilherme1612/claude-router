---
phase: 49-validation-and-release-integrity
status: complete
---

# Phase 49 Research

## Current evidence

- Serial full corpus: 1608/1610 passed before stale evolution and semantic-substitution assertions were reconciled.
- The installer/coexistence suite passes standalone after recursive owned-tree pruning.
- SAF-03 timing remains a real environment-sensitive failure at roughly 42ms warm p95 against the existing 25ms target and must remain visible.
- Existing semantic substitution and evolution path assertions were red-phase expectations for contracts already implemented by the source.
- `scripts/verify-gsd-archive.mjs` already provides the archive invariant and can be reused by the release gate.

## Minimal route

Reconcile the two obsolete assertions, add a serial release-gate script with focused/full/install/planning/archive/tag checks, execute it in phase mode, then run the final form after milestone archive/tag operations.

