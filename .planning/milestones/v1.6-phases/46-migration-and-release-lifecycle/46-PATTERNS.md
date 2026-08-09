# Phase 46 Patterns

| Need | Reuse |
|---|---|
| Immutable generation install | `src/lifecycle/router-lifecycle.mjs` |
| Durable journal and rollback tuple | `src/registry/activate.mjs` |
| Atomic release report | `src/release/run-release.mjs` |
| Runtime isolation | Claude/Codex owned roots and installed markers |
| Verification | built-in `node:test` plus existing lifecycle/release suites |

The new boundary is a narrow classifier/recovery/release-evidence helper; it does not duplicate the existing installer.
