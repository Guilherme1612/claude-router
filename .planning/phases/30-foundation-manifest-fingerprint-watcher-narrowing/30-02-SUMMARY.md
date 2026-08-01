---
phase: 30-foundation-manifest-fingerprint-watcher-narrowing
plan: 2
subsystem: watcher-narrowing + plugin-fingerprint
tags: [watcher, fingerprint, installed_plugins, noise-ignore, INVC-04]
dependency_graph:
  requires: [30-01]
  provides: [30-03]
  affects: [src/registry/watcher.mjs (consumer of roots config), build-manifest.mjs (fingerprint consumer)]
tech-stack:
  added: []
  patterns: [prefix-specific ignoredRelativePaths, builder spawn env-override seam]
key-files:
  created:
    - tests/router.plugins-fingerprint.test.mjs
  modified:
    - src/lifecycle/router-lifecycle.mjs
    - tests/router.registry-watcher.test.mjs
decisions:
  - "No bare 'plugins' prefix — installed_plugins.json must stay visible to the watcher (authoritative add/remove signal)"
  - "installed_at/installPath excluded from fingerprint at the computeCompositeEpoch level (semantic fields only)"
metrics:
  duration: "~12 min"
  completed: "2026-08-01"
status: complete
actuals:
  tokens: 2114   # chars/4 over realized diff (8455 added chars)
  tasks: 2
  commits: 2
---

# Phase 30 Plan 2: Watcher Noise Narrowing + Authoritative Plugin Signal Summary

Narrowed watcher scan noise (sqlite/WAL + plugin-catalog caches) via roots config and established plugins/installed_plugins.json as the authoritative plugin add/remove signal feeding the manifest_fingerprint epoch (INVC-04).

## What Was Built

**Task 1 — Noise ignore prefixes on watcher roots.** Extended both `claude_global` and `codex_home` root entries in `src/lifecycle/router-lifecycle.mjs` with prefix-specific `ignoredRelativePaths`: kept `'router'` and added `context-mode`, `plugins/plugin-catalog-cache.json`, `plugins/known_marketplaces.json`, `plugins/cache`, `plugins/data`, `plugins/marketplaces`. The bare `'plugins'` prefix was deliberately **not** added so `plugins/installed_plugins.json` remains visible. This is a pure roots-config change — no watcher core change (the matched filter in watcher.mjs:318-329 is untouched). Added a dirty-roots test (`tests/router.registry-watcher.test.mjs`) that drives the matched filter and proves noise events never dirty `claude_global` while an `installed_plugins.json` event does, plus an exact-list assertion guarding against accidental `installed_plugins.json` coverage.

**Task 2 — installed_plugins.json authority proven at the builder level.** New `tests/router.plugins-fingerprint.test.mjs` with a local `runBuilder` helper (env-var HOME override, spawn `build-manifest.mjs`). Four tests: (1) identical installed_plugins.json → identical fingerprint, (2) plugin add bumps fingerprint, (3) plugin remove bumps fingerprint, (4) timestamp-only edit (installedAt/lastUpdated/installPath) leaves the fingerprint byte-identical. Timestamp exclusion is enforced by `computeCompositeEpoch` which hashes only name/marketplace/version/scope of installed plugins.

## Deviations from Plan

None — plan executed exactly as written.

## Tests

- `node --test tests/router.registry-watcher.test.mjs` — 25 pass (incl. new INVC-04 noise/authoritative test)
- `node --test tests/router.plugins-fingerprint.test.mjs` — 4 pass
- Combined run: 29 pass / 0 fail
- grep gate: no bare `ignoredRelativePaths: ['router']` remains on watch roots

## Constraints Honored

- stdlib-only (no npm deps)
- fail-open, <100ms hot path untouched
- no watcher core change (roots-config only)
- installed_plugins.json never ignored (prefix-specific list)
- fingerprints/content-hash + atomic-write patterns reused; no timestamps/paths folded

## Self-Check: PASSED
