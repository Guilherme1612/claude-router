---
phase: 46-migration-and-release-lifecycle
status: complete
---

# Phase 46 Research

## Existing seams

- `src/lifecycle/router-lifecycle.mjs` already owns immutable install generations, atomic active pointers, disable/enable, uninstall, and recovery of incomplete generations.
- `src/registry/activate.mjs` already owns durable rollback journals and complete known-good restoration for compiled tuples.
- `src/release/run-release.mjs` already validates staged release matrices and publishes release reports atomically.
- `src/adapters/dispatch/claude.mjs` and `codex.mjs` preserve runtime-specific roots and native-dispatch evidence.

## Gap

The repository has lifecycle primitives but no single migration contract that classifies every persisted record before v1.6 authority is enabled, journals an old-or-new generation switch, recovers an interrupted switch, and verifies dual-runtime release evidence.

## Safety boundary

Legacy v1.5 records remain historical or quarantined; they never become v1.6 leases, permissions, or outcome credit. Unrelated runtime/user files are outside the owned root and must remain byte-identical.
