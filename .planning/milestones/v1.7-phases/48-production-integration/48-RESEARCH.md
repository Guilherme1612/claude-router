---
phase: 48-production-integration
status: complete
---

# Phase 48 Research

## Existing seams

- `src/orchestrator/strategy.mjs` already validates proportional plans but is only directly exercised by tests and resume replanning.
- `src/adapters/dispatch/contract.mjs` validates an optional strategy contract at invocation time.
- `src/adapters/dispatch/{claude,codex}.mjs` are the real off-hot-path native workers.
- `src/evolution/local-learning.mjs` groups causal receipt observations but currently counts repeated receipt identities.
- `src/lifecycle/migration.mjs` journals pointer swaps but does not accept its own recovered-old state on a repeated recovery.
- `src/lifecycle/router-lifecycle.mjs` deploys dispatch modules but omits strategy, learning, and migration dependencies.
- `verifyDualRuntimeRelease` currently accepts caller-supplied gate booleans without installed-runtime provenance.

## Minimal route

Prepare a production strategy in the native worker, pass it through the existing dispatch contract, reject duplicate learning IDs, make migration recovery repeatable, extend the installer module list, and bind release verification to fresh installed evidence.

