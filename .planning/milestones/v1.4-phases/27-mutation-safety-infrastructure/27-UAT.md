---
status: complete
phase: 27-mutation-safety-infrastructure
source:
  - 27-01-SUMMARY.md
  - 27-02-SUMMARY.md
started: 2026-07-29T14:04:48Z
updated: 2026-07-29T14:06:26Z
---

## Current Test

[testing complete]

## Tests

### 1. Weights Change Invalidates Cache Key
expected: Changing `weights.json` mtime produces a different route-cache key.
result: pass
source: automated
coverage_id: D1

### 2. Live Weights Mtime Reaches Hot Path
expected: The router reads the real weights mtime and includes it in hot-path cache invalidation.
result: pass
source: automated
coverage_id: D2

### 3. Stale Capability Targets Recompute
expected: A cached route whose target is absent from the current manifest is rejected and recomputed.
result: pass
source: automated
coverage_id: D3

### 4. Stale-Target Guard Fails Open Safely
expected: Null, warning, pass-through, and malformed-manifest cases do not block routing.
result: pass
source: automated
coverage_id: D4

### 5. Render Output Is Hard-Capped
expected: Router injection emits at most one mode, three skills, two agents, and one reasoning line on cache-hit and fresh-route paths.
result: pass
source: automated
coverage_id: D5

### 6. Mutation Telemetry Is Observable
expected: Inspect output exposes the routing-version fingerprint, weights invalidation mtime, stale-target recomputation, and render-cap truncation.
result: pass
source: automated
coverage_id: D6

### 7. Mutation-Safety Latency Gate
expected: Run the Phase 27 mutation-safety performance check against the current full mode-map. It passes only when warm-routing p95 is below 40 ms and every measured route is below 100 ms, while leaving the locked 25 ms calibration canary unchanged.
result: pass

### 8. Mode-Map Size Boundary
expected: Building with a mode-map at 30,000 bytes succeeds; a 30,001-byte mode-map fails with the size-cap error before oversized curation can ship.
result: pass
source: automated
verification: `rtk node --test tests/router.build-manifest.test.mjs` (8/8 passed)

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
