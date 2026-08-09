# Phase 45 Patterns

| Need | Reuse |
|---|---|
| Causal receipt eligibility | `src/adapters/dispatch/receipt.mjs` `outcomeCredit()` |
| Evidence retention and project scope | `src/evolution/evidence.mjs` |
| Candidate determinism and hard gates | `src/evolution/canary-controller.mjs` |
| Atomic known-good restoration | `src/registry/activate.mjs` rollback tuple |
| Test style | built-in `node:test` fixtures under `tests/phase-*` |

No prompt-path hook is changed; learning remains a cold-path operation.
