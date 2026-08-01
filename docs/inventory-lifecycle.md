# Inventory Capability Lifecycle (add / update / remove)

This document describes the full lifecycle of a **capability** — a skill, agent,
command, or plugin — from the moment its underlying file changes on disk through
every downstream stage that must react. It is the invalidation spine the v1.5
adaptive-routing features (runtime tagging, resolve freshness, per-install
auto-calibration) depend on, and is required by INVC-05.

The lifecycle has five stages:

```
watcher -> rebuild -> coverage audit -> recompute -> re-calibrate
```

Each stage is described below with the files it touches and the dispatch rules
that make the whole loop safe and cheap.

## 1. Watcher — detect the change

**Files touched:** `src/lifecycle/router-lifecycle.mjs` (roots config),
`src/registry/watcher.mjs` (matched filter), `.claude/router/cache.json`
(dirty-roots mark).

- An FS event for a capability file (e.g. `.claude/skills/demo/SKILL.md`,
  `.claude/agents/x.md`, `.claude/commands/y.md`) is matched against the watcher
  roots and the per-root `ignoredRelativePaths` filter.
- **Plugin-noise narrowing rule:** `plugins/installed_plugins.json` is the
  **authoritative** plugin add/remove signal and must stay visible. The
  `claude_global` root therefore ignores the noisy sqlite/WAL + plugin-catalog
  cache paths (`context-mode`, `plugins/plugin-catalog-cache.json`,
  `plugins/known_marketplaces.json`, `plugins/cache`, `plugins/data`,
  `plugins/marketplaces`) via prefix-specific `ignoredRelativePaths` — but never
  the bare `plugins` prefix, so `installed_plugins.json` keeps dirtying
  `claude_global`. sqlite/WAL + plugin-catalog caches never dirty a route root.
- A matched, non-ignored event marks the affected root dirty
  (`pending_changes`), which is the signal that a rebuild is due.

## 2. Rebuild — recompute the manifest + fingerprint epoch

**Files touched:** `build-manifest.mjs`, `src/registry/fingerprint.mjs`,
`.claude/router/claude-inventory-manifest.json` (OUT).

- `build-manifest.mjs` scans the resolved home (`ROUTER_CLAUDE_HOME` etc.),
  reads skills/agents/commands, mode-map (`mode-map.json`), weights
  (`weights.json`), and the authoritative plugin set from
  `plugins/installed_plugins.json`.
- `manifest.manifest_fingerprint = computeCompositeEpoch({ entries,
  installedPlugins, modeMap, weights })` — a content-sha256 over **semantic
  routing inputs only**: each entry with its `path` stripped, installed plugins
  reduced to `{name, marketplace, version, scope}`, plus mode-map and weights.
  Timestamps (`installed_at`, `lastUpdated`, `installPath`), counts, and entry
  paths are **excluded**, so an identical rebuild is byte-stable (no spurious
  cache invalidation) while any semantic inventory change bumps the epoch.
- The manifest is written atomically (temp-file + `renameSync`) to
  `.claude/router/claude-inventory-manifest.json`, and `manifest_fingerprint`
  is echoed to stdout.

## 3. Coverage audit — re-audit the rebuilt inventory

**Files touched:** `src/coverage/audit.mjs`, `build-manifest.mjs` (coverage
write), `.claude/router/coverage-report.json`.

- After the rebuild, `auditCoverage({ manifest, modeMap, baseline,
  routeDiagnostics })` runs over the freshly rebuilt manifest. It reports
  coverage vs the mode-map baseline and any route diagnostics.
- The builder writes the resulting `coverage-report.json`
  (`ROUTER_COVERAGE_REPORT_PATH`) atomically alongside the manifest, so the
  audit always reflects the current inventory, never a stale one.

## 4. Recompute — invalidate stale routes via the fingerprint

**Files touched:** `~/.claude/hooks/router.mjs` (the installed hook),
`.claude/router/cache.json` (LRU).

- The hook's `cacheKey(normalizedPrompt, intentKeywords, manifestFingerprint)`
  folds `manifest.manifest_fingerprint` into the cache key as the fingerprint
  **epoch** (default `'0'` when absent — fail-open).
- Because any semantic capability add/update/remove bumps the fingerprint, a
  previously-cached route written under an older fingerprint is a **cache miss**
  on the next decision: `state.cache.status === 'miss'` and the route is
  **recomputed** instead of being served stale. A no-op rebuild (identical
  semantic inputs) preserves the fingerprint, so the cache stays warm.
- `state.cache.invalidation_epoch = { manifest_fingerprint }` and
  `state.routing_version = manifestFingerprint` expose the epoch for
  telemetry/diagnosis (never stale-target serving; `routeTargetsExist` is an
  additional guard on top).

## 5. Re-calibrate — epoch-gate per-install thresholds

**Files touched:** `~/.claude/hooks/router.mjs` (`loadEpochCalibration` +
epoch-guarded threshold assignment), `.claude/router/calibration.json`
(Phase 34 writes it).

- The hook reads the calibration file **epoch-gated**:
  `loadEpochCalibration(manifestFingerprint, { calibrationPath })`. Only a
  calibration whose `manifest_fingerprint` matches the current manifest's
  fingerprint yields per-install thresholds.
- **mismatch / absent / corrupt** → mode-map defaults win
  (`modeMap.thresholds` or `{ T_high: 0.591, T_low: 0.291, M: 0.191 }`). The
  read is fail-open (never throws, never mutates the calibration file or the
  curated mode-map).
- Phase 34 derives per-install thresholds keyed by
  `{ manifest_fingerprint, mode_map_version, corpus_hash }`; a fingerprint
  change (a capability add/update/remove) therefore invalidates the derived
  thresholds, and only a fingerprint-matched calibration unit is trusted.

## Lifecycle invariant

A capability add/update/remove propagates the whole way down:

**fingerprint change → cache key change → stale route recomputed**, and

**fingerprint change → mismatched calibration ignored → mode-map defaults win**.

This is exactly what `tests/router.lifecycle-invc.test.mjs` proves end-to-end in
the add direction (skill add bumps F0→F1 and the F0-keyed cache entry is a miss;
plugin add bumps F1→F2), and what `tests/router.calibration-epoch.test.mjs`
proves for the epoch-gated threshold read.
