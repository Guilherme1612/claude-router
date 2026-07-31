---
phase: 27-mutation-safety-infrastructure
plan: 01
subsystem: infra
tags: [router, cache, mutation-safety, bm25, hot-path, telemetry, tdd]

requires:
  - phase: 26-router-cache-telemetry
    provides: cacheKey mtime-folding pattern, validateRouteTargets, buildTargetIndexes, formatInjection, hot-path cache-hit block
provides:
  - cacheKey folds weightsMtime as 7th positional component (SAF-01)
  - readWeightsMtime best-effort mtime reader mirroring readSurfaceMtime
  - routeTargetsExist single-route stale-target predicate factored from validateRouteTargets (SAF-02)
  - capRouteRender hard render-count cap (1 mode / 3 skills / 2 agents) before formatInjection (SAF-04)
  - routing_version derived mtime fingerprint observable in telemetry + inspect output
  - cache.invalidation_mtimes.weights + cache.status stale_target_recompute + render:cap_truncated decision_trace
affects: [28-mode-map-mutation, 29-weights-mutation, router-evolution, ship-gate]

tech-stack:
  added: []
  patterns:
    - "Mtime-folding cache key: 7th positional default param keeps older callers backward-compatible; hot-path call site passes the real mtime (Pitfall 2 guard)"
    - "Single-route stale-target predicate: factor from validateRouteTargets reusing buildTargetIndexes/knownSkillTargets (no second Set builder); fail-open returns true on error"
    - "Hard render-count cap before formatInjection on both cache-hit and fresh-route paths; telemetry-only _render_cap_truncated flag stripped before injection"
    - "Derived observability string routing_version = `${modeMapMtime}:${manifestMtime}:${weightsMtime}` — never stored on disk"

key-files:
  created:
    - tests/router.mutation-safety.test.mjs
  modified:
    - tests/router.mjs.snapshot
    - tests/router.cache.test.mjs
    - tests/router.inspect.test.mjs

key-decisions:
  - "routeTargetsExist checks route.mode (not route.id) against commands — matches validateRouteTargets semantics; entry.id is the mode-map identifier, not necessarily a command name"
  - "routeTargetsExist builds indexes inside the try block (not as a default param) so a malformed manifest fails open instead of throwing out of default-parameter evaluation"
  - "capRouteRender stores the uncapped finalRoute to cache (full author-priority lists) and caps only at render time, so future cache hits hold the complete lists"
  - "Committed tests/router.mjs.snapshot (git-tracked canonical source) as the router.mjs path; synced to ~/.claude/hooks/router.mjs via cp to keep tests against the global passing (known gap: global path is outside the repo)"

patterns-established:
  - "Pattern: mtime-folded sha256 cache key extended with a new trailing default param — backward-compatible, hot-path passes real mtime"
  - "Pattern: hot-path guard inserts as if/else-if around the cache-hit block — stale target falls through to recompute, never assigns state.route"
  - "Pattern: pure render-cap helper called before formatInjection on both paths; telemetry-only flag stripped before injection output"

requirements-completed: [SAF-01, SAF-02, SAF-04]

coverage:
  - id: D1
    description: "cacheKey folds weightsMtime as 7th positional component; changing it produces a different sha256 key (SAF-01)"
    requirement: SAF-01
    verification:
      - kind: unit
        ref: tests/router.mutation-safety.test.mjs#SAF-01: cacheKey changing weightsMtime produces a different key
        status: pass
      - kind: unit
        ref: tests/router.mutation-safety.test.mjs#SAF-01 Pitfall 2: non-zero weightsMtime produces a different key from the default-0 key
        status: pass
      - kind: unit
        ref: tests/router.cache.test.mjs#cacheKey: changing weightsMtime produces a different key (SAF-01 weights-mtime invalidation)
        status: pass
    human_judgment: false
  - id: D2
    description: "readWeightsMtime best-effort mtime reader (mirrors readSurfaceMtime); hot-path call site passes the real weightsMtime, not default 0 (Pitfall 2 guard)"
    requirement: SAF-01
    verification:
      - kind: unit
        ref: tests/router.mjs.snapshot#readWeightsMtime (grep -c weightsMtime >= 3; hot-path call site passes readWeightsMtime result as 7th arg)
        status: pass
    human_judgment: false
  - id: D3
    description: "routeTargetsExist guards cache hits: returns false when cached route targets are absent from the manifest; recomputes instead of serving (SAF-02)"
    requirement: SAF-02
    verification:
      - kind: unit
        ref: tests/router.mutation-safety.test.mjs#SAF-02: routeTargetsExist returns false when a recommended_skill is absent from the manifest
        status: pass
      - kind: unit
        ref: tests/router.mutation-safety.test.mjs#SAF-02: routeTargetsExist returns false when a recommended_agent is absent from the manifest
        status: pass
      - kind: unit
        ref: tests/router.mutation-safety.test.mjs#SAF-02: routeTargetsExist returns false when route.id is a slash command absent from manifest commands
        status: pass
      - kind: unit
        ref: tests/router.mutation-safety.test.mjs#SAF-02: routeTargetsExist returns false when one of two recommended_skills is absent (partial miss)
        status: pass
      - kind: unit
        ref: tests/router.mutation-safety.test.mjs#SAF-02: routeTargetsExist returns true when all targets are present
        status: pass
    human_judgment: false
  - id: D4
    description: "routeTargetsExist fail-opens: returns true for null/warn/pass-through routes and true on internal error (never blocks)"
    requirement: SAF-02
    verification:
      - kind: unit
        ref: tests/router.mutation-safety.test.mjs#SAF-02 fail-open: routeTargetsExist returns true for null, warn, and pass-through routes
        status: pass
      - kind: unit
        ref: tests/router.mutation-safety.test.mjs#SAF-02 fail-open: routeTargetsExist returns true on internal error (malformed manifest)
        status: pass
    human_judgment: false
  - id: D5
    description: "capRouteRender hard count cap (3 skills / 2 agents) before formatInjection on both cache-hit and fresh-route paths; _render_cap_truncated stripped before injection (SAF-04)"
    requirement: SAF-04
    verification:
      - kind: unit
        ref: tests/router.mutation-safety.test.mjs#SAF-04: capRouteRender truncates 5 skills to 3 and 4 agents to 2, preserving array order
        status: pass
      - kind: unit
        ref: tests/router.mutation-safety.test.mjs#SAF-04: capRouteRender sets _render_cap_truncated when input exceeds 3 skills or 2 agents
        status: pass
      - kind: unit
        ref: tests/router.mutation-safety.test.mjs#SAF-04: capRouteRender does NOT set _render_cap_truncated when input is within bounds
        status: pass
      - kind: unit
        ref: tests/router.mutation-safety.test.mjs#SAF-04 boundary: exactly 3 skills and 2 agents does NOT set _render_cap_truncated
        status: pass
      - kind: unit
        ref: tests/router.mutation-safety.test.mjs#SAF-04 boundary: 3 skills and 3 agents sets _render_cap_truncated (agents exceed)
        status: pass
      - kind: unit
        ref: tests/router.mutation-safety.test.mjs#SAF-04 integration: formatInjection(capRouteRender(overloaded)) never emits more than 3 skill lines or 2 agent lines
        status: pass
      - kind: unit
        ref: tests/router.mutation-safety.test.mjs#SAF-04: _render_cap_truncated is stripped from the injected route before formatInjection produces output
        status: pass
    human_judgment: false
  - id: D6
    description: "routing_version derived mtime fingerprint + cache.invalidation_mtimes.weights observable in telemetry/inspect; cache:stale_target + render:cap_truncated in decision_trace"
    requirement: SAF-01
    verification:
      - kind: unit
        ref: tests/router.inspect.test.mjs#router inspect JSON: cache effect distinguishes hit from miss and skipped scoring (asserts invalidation_mtimes.weights + routing_version)
        status: pass
    human_judgment: false

duration: 13min
completed: 2026-07-29
status: complete
---

# Phase 27 Plan 01: Mutation Safety Infrastructure Summary

**SAF-01/02/04 hot-path guards wired: cacheKey folds weightsMtime, routeTargetsExist guards cache hits against stale targets, capRouteRender hard-caps render counts before formatInjection — all observable via routing_version telemetry and decision_trace**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-07-29T12:10:31Z
- **Completed:** 2026-07-29T12:23:27Z
- **Tasks:** 2
- **Files modified:** 4 (1 new test file, 3 modified)

## Accomplishments
- cacheKey extended with 7th positional `weightsMtime` param (default 0, backward-compatible); hot-path call site passes the real `readWeightsMtime()` result so a weights.json edit invalidates stale cached routes (SAF-01, Pitfall 2 guard)
- `routeTargetsExist` single-route stale-target predicate factored from `validateRouteTargets` — reuses `buildTargetIndexes` + `knownSkillTargets` (no second Set builder), fail-opens on error, guards every cache hit before injection (SAF-02)
- `capRouteRender` hard count cap (1 mode / 3 skills / 2 agents) called before `formatInjection` on both the cache-hit and fresh-route paths; `_render_cap_truncated` telemetry flag stripped before injection output (SAF-04)
- `routing_version` derived mtime fingerprint (`${modeMapMtime}:${manifestMtime}:${weightsMtime}`) exposed in telemetry + inspect output; `cache.invalidation_mtimes.weights`, `cache:stale_target`, `stale_target_recompute`, and `render:cap_truncated` all observable

## Task Commits

Each task was committed atomically (TDD: RED then GREEN):

1. **Task 1: Wire SAF-01/02/04 end-to-end on the hot path** — `5cca2ed` (test: RED) + `3b5d8eb` (feat: GREEN)
2. **Task 2: Extend cache + mutation-safety tests for edge cases** — `902135a` (test) + `838fa1f` (test: acceptance comment)

**Regression fix (Rule 1, between Task 1 and Task 2):** `16c7245` (fix: routeTargetsExist mode-vs-id + inspect test update)

## Files Created/Modified
- `tests/router.mutation-safety.test.mjs` (NEW) — 17 tests: 10 Task-1 RED/GREEN + 7 Task-2 edge cases (SAF-01/02/04)
- `tests/router.mjs.snapshot` (MODIFIED) — git-tracked canonical router source: cacheKey 7th param, readWeightsMtime, routeTargetsExist, capRouteRender, hot-path wiring, telemetry; synced to `~/.claude/hooks/router.mjs`
- `tests/router.cache.test.mjs` (MODIFIED) — added SAF-01 weights-mtime invalidation test parallel to surfaceMtime test
- `tests/router.inspect.test.mjs` (MODIFIED) — updated cache-hit test for SAF-01 (weightsMtime) + SAF-02 (fixture manifest so routeTargetsExist validates)

## Decisions Made
- **routeTargetsExist checks `route.mode` not `route.id`**: `validateRouteTargets` checks `entry.mode` against `indexes.commands` (the `id` is the mode-map identifier, not necessarily a command name). The RESEARCH Pattern 2 example used `id || mode`, which falsely flagged valid cached routes (e.g. `id='debug'`, `mode='gsd-debug'`); corrected to `mode || id` to match the source predicate.
- **Indexes built inside the try block**: the default-parameter form `indexes = buildTargetIndexes(manifest)` evaluates outside the try/catch, so a malformed manifest threw out of the function instead of fail-opening. Moved index construction inside the try body.
- **capRouteRender stores uncapped route to cache**: the fresh-route path writes the full `finalRoute` to cache (complete author-priority lists) and caps only the rendered copy, so future cache hits hold the complete lists and re-cap on render.
- **Committed `tests/router.mjs.snapshot` as the router.mjs path**: the plan's `files_modified` listed `~/.claude/hooks/router.mjs` (outside the repo, untracked). The git-tracked canonical source is `tests/router.mjs.snapshot` (byte-identical to the global). Edits applied to the snapshot, then synced to the global via `cp` so tests against the global pass. This is a known gap documented in the execution context.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] routeTargetsExist checked `route.id` instead of `route.mode` for slash routes**
- **Found during:** Task 1 (GREEN verification — `tests/router.inspect.test.mjs` cache-hit test regressed)
- **Issue:** The RESEARCH Pattern 2 example used `stripLeadingSlash(route.id || route.mode)` for the slash command check, but `validateRouteTargets` checks `entry.mode` against `indexes.commands`. The `id` field is the mode-map entry identifier, not necessarily a command name — so valid cached routes (e.g. `id='debug'`, `mode='gsd-debug'`) were falsely flagged stale.
- **Fix:** Changed the check to `stripLeadingSlash(route.mode || route.id)` to match `validateRouteTargets` semantics.
- **Files modified:** tests/router.mjs.snapshot
- **Verification:** `tests/router.inspect.test.mjs` cache-hit test passes; all 17 mutation-safety tests pass.
- **Committed in:** `16c7245`

**2. [Rule 1 - Bug] routeTargetsExist default-parameter evaluation escaped the fail-open try/catch**
- **Found during:** Task 1 (GREEN — the "returns true on internal error (malformed manifest)" test failed)
- **Issue:** `indexes = buildTargetIndexes(manifest)` as a default parameter evaluates outside the try block, so a throwing manifest (Proxy with throwing get-trap) escaped the fail-open catch.
- **Fix:** Moved index construction inside the try body (`const idx = indexes || buildTargetIndexes(manifest)`).
- **Files modified:** tests/router.mjs.snapshot
- **Verification:** "SAF-02 fail-open: returns true on internal error" test passes.
- **Committed in:** `16c7245`

**3. [Rule 1 - Regression] Existing inspect cache-hit test broke under SAF-01/02**
- **Found during:** Task 1 (full-suite regression check)
- **Issue:** The test computed its cache sig with the 6-arg `cacheKey` (weightsMtime=0) but `inspectDecision` now reads the real `weights.json` mtime on the hot path, producing a different sig → miss instead of hit. Separately, the cached route's `mode: 'gsd-debug'` is a skill in the real manifest, not a command, so `routeTargetsExist` correctly flagged it stale. The test also asserted `invalidation_mtimes` without the new `weights` field.
- **Fix:** Updated the test to pass `weightsMtime: 0` (sig matches), include `weights: 0` in the `invalidation_mtimes` deepEqual, and use a self-contained fixture manifest (with `gsd-debug` as a command + `systematic-debugging` as a skill) so `routeTargetsExist` validates the cached route. The test now exercises the cache-hit mechanics without depending on the real manifest's exact command inventory.
- **Files modified:** tests/router.inspect.test.mjs
- **Verification:** `tests/router.inspect.test.mjs` all 11 tests pass.
- **Committed in:** `16c7245`

---

**Total deviations:** 3 auto-fixed (3 x Rule 1 — bugs/regressions directly caused by this plan's changes)
**Impact on plan:** All auto-fixes necessary for correctness and to avoid regressions. No scope creep. The routeTargetsExist mode-vs-id fix is a correctness fix to match the source predicate semantics; the fail-open fix honors the plan's "never blocks" prohibition; the inspect test update is a required consequence of SAF-01/02 changing the hot path.

## Issues Encountered
- **Pre-existing `GRD-02` test failure** (`tests/router.guards.test.mjs`): "against real manifest, impeccable not in corpus" fails against the base router.mjs (commit 6e366e6) — confirmed pre-existing. CLAUDE.md notes `impeccable` was resolved to `scope: "global"` on 2026-07-29, contradicting the test's expectation that it is project-scoped. Out of scope for Plan 27-01; logged to `deferred-items.md`.
- **Flaky perf tests** (`tests/router.perf-evolved.test.mjs`): the 100ms-subprocess-budget tests occasionally tip 1–2ms over under full-suite CPU contention. Pass 3/3 in isolation and pass the full suite on most runs (run 2: 1123/1124 pass, only GRD-02 fails). Plan 27-01 adds < 1ms to the hot path (one `readWeightsMtime` statSync + sub-ms `buildTargetIndexes` on cache hits). The variance is dominated by subprocess spawn + I/O, not this plan's overhead. Logged to `deferred-items.md`.

## Known Stubs
None — all guards are fully wired to the hot path and telemetry; no placeholder data or unwired code paths.

## Threat Flags
None — no new trust-boundary surface introduced beyond what the plan's `<threat_model>` already assigned (T-27-01 through T-27-05 all mitigated as specified). `routing_version` is mtime-derived (no prompt text or secret material); existing redaction unchanged.

## TDD Gate Compliance
- RED gate: `5cca2ed` (test: 10 failing mutation-safety tests) — confirmed RED (10/10 fail before implementation).
- GREEN gate: `3b5d8eb` (feat: implementation makes all 10 pass).
- Additional test commits: `902135a`, `838fa1f` (Task 2 edge-case extensions, all pass).
- Rule 1 fix commit: `16c7245` (between GREEN and Task 2 — regression fix with its own verification).

## Self-Check: PASSED
- `tests/router.mutation-safety.test.mjs` — FOUND (17 tests, all pass)
- `tests/router.cache.test.mjs` — FOUND (19 tests, all pass; +1 new weights-mtime test)
- `tests/router.mjs.snapshot` — FOUND (cacheKey 7th param, readWeightsMtime, routeTargetsExist, capRouteRender all present; synced to global)
- Commits `5cca2ed`, `3b5d8eb`, `16c7245`, `902135a`, `838fa1f` — all FOUND in `git log`
- `grep -c weightsMtime ~/.claude/hooks/router.mjs` = 8 (>= 3) ✓
- `validateRouteTargets` not called on the hot path (cache-hit block) ✓
- `routeTargetsExist` + `capRouteRender` exported ✓
- `cacheKey('a',['b'],1,2,3,4,5)` returns 64-char hex ✓

## User Setup Required
None — no external service configuration required. All changes are in-process router guards + tests.

## Next Phase Readiness
- SAF-01/02/04 hot-path guards are live; Phases 28–29 (mode-map / weights mutation) can now ship mutations safely — cached routes self-invalidate on weights mtime change, stale-target cache hits recompute, and render output is hard-capped.
- Plan 27-02 (SAF-03 latency gate + 30KB mode-map size guard) is unblocked and parallel — the 25ms `assessCalibration` canary is untouched (prohibition honored).
- Pre-existing `GRD-02` scope contradiction should be reconciled in a future manifest/scope phase before `/gsd-ship`.

---
*Phase: 27-mutation-safety-infrastructure*
*Completed: 2026-07-29*