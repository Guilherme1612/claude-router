---
phase: 57-native-runtime-health-and-watcher-resilience
milestone: v1.9
status: implementation
---

# Phase 57 Context

## Goal

Make native runtime health truthful under the installed Claude/Codex roots and preserve fail-closed behavior when the live inventory has no safe dispatch route.

## Locked decisions

- Root-level `hooks/package.json` is package metadata, not a hook observation; discovery excludes it.
- Symlink escapes and cycles remain bounded diagnostics and are excluded from the capability inventory. They do not become activation blockers or raw-content evidence.
- Verification requires all eight production gates. The watcher publishes only bounded verification metadata: disposition, completion, gate count, failed gate IDs, and verification fingerprint.
- Native runtime sources used by deployed latency fixtures are part of the owned module/mirror set for both runtimes.
- An eligible but recommendation-only inventory with zero dispatchable routes must not publish an empty compiled tuple. The controller remains ready and preserves the empty active authority.
- Native smoke uses only the deployed harmless fixture, isolated receipt roots, and no prompt or fixture output persistence.

## Scope boundary

In scope: adapter discovery truth, deployed gate-fixture closure, watcher verification evidence, native watcher fallback coverage, installed health projections, and safe Claude/Codex adapter smoke evidence.

Deferred to Phase 58: outcome-field completeness, graph-missing remediation, and broader log/telemetry semantics.

Deferred to Phase 59: release preflight, security/release audit, full-suite finalization, and v1.9 archival.

## Current live truth

- Controller: `ready`; candidate: `eligible`; verification: 8/8 passing.
- Activation: preserved with `bootstrap_publish_failed` because the live registry has 0 dispatchable records; no active tuple or pointer is claimed.
- Inventory: 228 records, 24 bounded diagnostics, 0 dispatchable records; path escape/cycle findings are visible and safely excluded.
- Installer manifest: 331 owned files after adding the two runtime sources required by the deployed latency gate.

## Acceptance evidence

- Adapter regression: `tests/router.adapters.test.mjs` 11/11.
- Watcher regression: `tests/router.registry-watcher.test.mjs` 29/29.
- Installer/deployed-bundle regression: `tests/router.deployed-bundle.test.mjs` 4/4 and `tests/router.lifecycle.test.mjs` 17/17.
- Snapshot regression: `tests/router.v19-live-snapshot.test.mjs` 2/2.
- Native smoke: Claude and Codex harmless fixture invocations completed with verified receipt linkage.
