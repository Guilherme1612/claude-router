---
phase: 47-dispatch-and-storage-safety
plan: 03
status: complete
completed: 2026-08-09
---

# Plan 47-03 Summary

Wired both Claude and Codex adapters through the shared safety seams:

- durable claims replace process-local authority for normal and resume dispatch;
- both runtimes use the same bounded execution contract and runner;
- terminal receipts preserve bounded evidence and runtime partitioning;
- the router prompt hot path and existing fire-and-forget marker behavior remain unchanged.

Verification: Claude/Codex parity, restart, receipt, Phase 38, Phase 44, lease, and new Phase 47 tests pass.

