# Phase 56 Context: Live Installer and Upgrade Truth

## Goal

Prove that the v1.8 bundle installed in the operator's Claude and Codex homes is upgraded by the existing owned installer, remains current and internally consistent, and can be recovered or removed without touching user-owned state.

## Decisions

### D-01: Reuse the existing lifecycle boundary

Use `install-router.mjs` and the exported lifecycle functions in `src/lifecycle/router-lifecycle.mjs` as the only live mutation path. Do not add a second installer, deployment service, daemon, database, or remote control plane.

### D-02: Snapshot before mutation

Add one standard-library-only snapshot command that reads exact Claude/Codex paths but persists only allowlisted metadata: existence, size, SHA-256, schema/state fields, hook counts and managed binding identities, controller readiness fields, tuple identifiers, and ownership paths. It must never serialize prompt, telemetry, audit, or session bodies.

### D-03: Fail closed before the first live write

The live run must take a snapshot, execute the installer's dry-run, and stop if ownership, root, manifest, hook, or source checks are ambiguous. No broad cleanup, opportunistic config normalization, or direct hook edits are allowed.

### D-04: Separate live upgrade proof from destructive recovery proof

Run the live upgrade and preservation checks against the current owned installation. Exercise crash/rollback/uninstall/reinstall recovery with the existing isolated lifecycle matrix first; only run live uninstall/reinstall after the snapshot, ownership validation, and recovery path have all passed.

### D-05: Exact source and installed identity

Record the source router/evolve fingerprints and compare them to the installer manifest and deployed runtime files. A ready controller alone is insufficient evidence of a current installation.

## Existing source of truth

- `install-router.mjs`: production CLI, path defaults, dry-run, readiness timeout, uninstall/restart routing.
- `src/lifecycle/router-lifecycle.mjs`: owned roots, manifest schema, hook preservation, transaction snapshot/restore, controller readiness, install and uninstall behavior.
- `tests/router.installer-coexistence.test.mjs`: preservation and lifecycle verb matrix.
- `tests/router.lifecycle-recovery.test.mjs`: crash, corrupt tuple, controller, and last-known-good recovery behavior.
- `tests/router.phase26-lifecycle.test.mjs`: atomic publication and restart recovery invariants.
- `scripts/v18-release-preflight.mjs` and `src/release/preflight.mjs`: release evidence contract to extend in a later phase, not replace here.

## Constraints and non-goals

- No raw prompt/session/telemetry bodies in committed evidence.
- No automatic installation of third-party capabilities.
- No new routing semantics or ranking behavior.
- No network service, daemon, database, embeddings store, second watcher, or fleet deployment.
- Preserve unrelated dirty work and do not reset, clean, stash, or overwrite it.

## Deferred ideas

- Fleet-wide deployment and remote observability belong to FUTR-01.
- Per-root adaptive polling belongs to FUTR-02 and requires measured fleet evidence.
- Outcome and graph correlation belongs to Phase 58.
