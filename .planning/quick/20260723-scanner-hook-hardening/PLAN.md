# Quick Task: Scanner + Hook Observation Hardening

**Date:** 2026-07-23
**Scope:** `src/adapters/claude.mjs` (scanner + hook observation) + regression test in `tests/router.adapters.test.mjs`

## Plan

Harden the claude adapter scanner and hook-observation path so real-world `~/.claude` layouts stop producing false-positive quarantine diagnostics that dispatch-block the registry candidate. Five targeted fixes are applied to `src/adapters/claude.mjs`; a single self-contained regression test is appended to `tests/router.adapters.test.mjs` covering all five, then the three router test files are run green and the change is committed. Gate 6 (`hook_orphan_binding` — the v1.2 paired hook-file model mismatch with Claude Code's inline `settings.json` hooks) is explicitly out of scope for this round and deferred to a separate planning round.

## The 5 fixes

- **`walk()` prunes `node_modules`, `.git`, `tests`, `fixtures`** (PRUNE set) so JSONC `tsconfig.json` files inside plugin package caches are no longer parsed as strict JSON — this was dispatch-blocking the whole registry candidate.
- **`claudeLayout()` early-returns null for `rel.startsWith('plugins/marketplaces/')`** — marketplace subtrees hold registry metadata and test fixtures, not installed capabilities.
- **`toml()` tolerates non-strict table headers** (`/^\[+.+\]$/` → scratch section, so quoted/dotted/array-of-tables headers like `[plugins."name@scope"]` and `[[x]]` neither throw nor pollute the root table) **+ quoted keys in the pair regex** (`^("[^"]+"|[A-Za-z0-9_.-]+)\s*=\s*(.*)$`, unquoted via `rawKey`).
- **`hookObservation(nativeRecord, nativeInvocation, scope, rootPath)` accepts multiple distinct valid references**; `valid = allValid && !hasDuplicate` where `hasDuplicate` keys on `${item.command}\0${JSON.stringify(item.args)}` — `duplicate_reference` is emitted only on a real duplicate, so a normal multi-hook Claude Code event no longer quarantines.
- **`commandReference(command, rootPath)` uses `splitShellTokens`** (quote-stripping) **+ `portableTarget(value, rootPath)` accepts absolute paths resolving within `rootPath`** (returns the relative form), still rejects `..` escapes. `rootPath` is threaded from `discover` (`canonicalRoot`) → `normalizeArtifact(record, canonicalRoot)` → `hookObservation(..., rootPath)`.

## Verification

`node --test tests/router.adapters.test.mjs tests/router.hook-reconcile.test.mjs tests/router.registry-build.test.mjs` — all green (18/18).