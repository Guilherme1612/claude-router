# Phase 30: Foundation — Manifest Fingerprint + Watcher Narrowing - Context

**Gathered:** 2026-07-31
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Every semantic inventory change bumps a content-addressed fingerprint epoch that cache and calibration key off, and the watcher stops reconciling on noise — the invalidation spine every v1.5 feature leans on, with no hot-path semantic change.

Requirements: INVC-01, INVC-02, INVC-03, INVC-04, INVC-05

Success criteria from ROADMAP:

  1. `build-manifest.mjs` emits a content-sha256 `manifest_fingerprint` over semantic routing inputs only (timestamps excluded); an identical rebuild produces an identical fingerprint and does NOT invalidate the cache.
  2. Adding, updating, or removing any skill, plugin, or agent bumps the fingerprint, and a previously-cached route is recomputed on the next prompt rather than served stale — the cache key folds the fingerprint, replacing mtime.
  3. Watcher scans ignore noise files (sqlite/WAL, plugin-catalog caches) and `installed_plugins.json` is the authoritative plugin add/remove signal — plugin add/remove changes the fingerprint, plugin-only churn never dirties roots.
  4. Calibration data is epoch-keyed by the fingerprint: a fingerprint mismatch means mode-map default thresholds (0.591/0.291/0.191) win, never stale per-install thresholds.
  5. The full add/update/remove capability lifecycle (watcher → rebuild → coverage audit → recompute → re-calibrate) is documented and test-verified end-to-end.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

Code-verified note from ROADMAP: NOT a new fingerprint build. `src/registry/fingerprint.mjs` already ships a Merkle content-sha256 tree (`buildSubtreeHashes`) and is the live watcher diff source. Composite-epoch decision (resolves the research flag): ONE global fingerprint hash over (capability identities + `installed_plugins.json` hash + mode-map + weights), timestamps excluded — cache is a small LRU map, whole-cache recompute on inventory change is acceptable. cacheKey replaces the 7-position mtime fold with a single `manifest_fingerprint` epoch slot; translate SAF-01 mtime-invalidation tests 1:1 to epoch. `installed_plugins.json` already parsed — the gap is only the watcher noise ignore-list.

</decisions>

<code_context>
## Existing Code Insights

- `src/registry/fingerprint.mjs` — Merkle content-sha256 tree (`buildSubtreeHashes`), live watcher diff source
- `router.mjs:1648` — cacheKey 7-position mtime fold (`[np, ik, modeMapMtime, manifestMtime, graphMtime, surfaceMtime, weightsMtime]`)
- `build-manifest.mjs:268-280` — `installed_plugins.json` already parsed, authoritative plugin add/remove signal
- SAF-01 mtime-invalidation tests — translate 1:1 to epoch

Codebase context will be further gathered during plan-phase research.

</code_context>

<specifics>
## Specific Ideas

No specific requirements — discuss phase skipped. Refer to ROADMAP phase description and success criteria.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>