---
phase: 31-runtime-tagging
plan: 01
subsystem: testing
tags: [runtime-detection, cache-key, telemetry, red-spec, mirror-guard, parity]

# Dependency graph
requires:
  - phase: 30-foundation-manifest-fingerprint-watcher-narrowing
    provides: manifest_fingerprint epoch slot in cacheKey (the sibling slot runtime will ride next to)
provides:
  - RED spec for runtime detection precedence (PARITY-01): ROUTER_RUNTIME override, default claude, enum clamp
  - RED spec for cacheKey cross-runtime divergence (PARITY-02): runtime as key identity
  - RED spec for telemetry runtime field (PARITY-02): runtime on telemetryEntryFromState records
  - Updated outcome-schema enforcement test expecting 16 frozen fields (runtime/epoch) — the 31-03 bump guard
  - Mirror-desync guard asserting tests/router.mjs.snapshot == ~/.claude/hooks/router.mjs byte-identical
affects: [31-02 (detection + dirs), 31-03 (cache/telemetry/schema), 32-intent-first-routing, 33-shadow-log]

# Actuals (#2632) — chars/4 over the realized diff (4 files, +163/-3)
actuals:
  tokens: 2412
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Runtime-as-key-identity: runtime is a cacheKey tuple slot (D-05), not route metadata"
    - "Module-load detection: RUNTIME resolved once at import into a constant (D-01), zero hot-path IO"
    - "Frozen-schema bump discipline: enforcement test asserts size+membership so the OUTCOME_FIELDS bump cannot be silent"

key-files:
  created:
    - tests/router.runtime-tagging.test.mjs
    - tests/router.mjs.snapshot.diff.test.mjs
  modified:
    - tests/router.health.outcome-schema.test.mjs
    - tests/router.cache.test.mjs

key-decisions:
  - "Detection precedence (D-04): ROUTER_RUNTIME env override wins; absent marker -> default 'claude' (fail-open); out-of-enum clamps to 'claude' (T-31-01 enum clamp)"
  - "cacheKey gains a trailing runtime identity slot (D-05) so claude/codex never share stale routes — RED until 31-03"
  - "telemetryEntryFromState gains a runtime field (D-06) — RED until 31-03"
  - "OUTCOME_FIELDS bump 14 -> 16 (+runtime, +epoch) is enforced by a RED test, not a silent schema add (ROADMAP criterion 3)"
  - "Mirror-desync guard makes every future hook edit load-bearing: snapshot must equal the live hook"

patterns-established:
  - "RED-spec-before-feature: tests import the LIVE hook so they exercise the real deployable, and stay RED until 31-02/31-03 export the API"
  - "Subprocess env probe for module-load detection: spawn a node child that imports the hook and prints RUNTIME under a controlled env"

requirements-completed: []  # PARITY-01/02 are RED-guarded, NOT yet satisfied — feature code lands in 31-02/31-03

coverage:
  - id: D1
    description: "Mirror-desync guard asserting tests/router.mjs.snapshot is byte-identical to ~/.claude/hooks/router.mjs"
    verification:
      - kind: unit
        ref: "tests/router.mjs.snapshot.diff.test.mjs#mirror: tests/router.mjs.snapshot is byte-identical to ~/.claude/hooks/router.mjs"
        status: pass
    human_judgment: false
  - id: D2
    description: "RED runtime-tagging spec holding the Phase-31 API surface RED (detection/cacheKey/telemetry/fail-open)"
    verification:
      - kind: unit
        ref: "tests/router.runtime-tagging.test.mjs#detection: RUNTIME is exported and is one of claude|codex"
        status: fail
    human_judgment: true
    rationale: "Tests are intentionally RED awaiting the 31-02/31-03 API — a human/verifier confirms the RED state matches the plan before feature implementation proceeds"
  - id: D3
    description: "Outcome-schema enforcement test bumped to expect 16 frozen OUTCOME_FIELDS (runtime/epoch)"
    verification:
      - kind: unit
        ref: "tests/router.health.outcome-schema.test.mjs#HLTH-01: OUTCOME_FIELDS allowlist is frozen and final (16 fields)"
        status: fail
    human_judgment: true
    rationale: "Intentionally RED against the untouched 14-field schema — the deliberate 31-03 bump target"
  - id: D4
    description: "Cache spec extended with cross-runtime cacheKey divergence assertion (codex !== claude)"
    verification:
      - kind: unit
        ref: "tests/router.cache.test.mjs#cacheKey: cross-runtime divergence — codex !== claude (D-05)"
        status: fail
    human_judgment: true
    rationale: "Intentionally RED against the 6-param cacheKey (7th runtime arg dropped) — proving the runtime slot is not yet wired"

# Metrics
duration: 14min
completed: 2026-08-01
status: complete
---

# Phase 31 Plan 1: Runtime-Tagging Wave-0 RED Test Infrastructure Summary

**Wave-0 RED test infrastructure for Phase 31: runtime detection precedence spec, cross-runtime cacheKey divergence, telemetry runtime field, the 16-field OUTCOME_FIELDS bump guard, and the snapshot↔live-hook mirror-desync guard — holding every Phase-31 feature surface RED until plans 31-02/31-03 export the API.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-08-01
- **Completed:** 2026-08-01
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Created `tests/router.runtime-tagging.test.mjs` — RED spec importing the LIVE hook (`~/.claude/hooks/router.mjs`) with four groups: detection precedence (`RUNTIME` enum, `ROUTER_RUNTIME=codex` override, absent→`claude`, enum-clamp fail-open), cacheKey runtime identity (`codex` !== `claude`), telemetry runtime field, and RUNTIME_CONFIG_DIR runtime-scoped export.
- Created `tests/router.mjs.snapshot.diff.test.mjs` — mirror-desync guard, **GREEN at creation** (snapshot == live hook byte-identical). Becomes the load-bearing invariant for the 31-02/31-03 lockstep edits.
- Bumped `tests/router.health.outcome-schema.test.mjs` to expect `OUTCOME_FIELDS.size === 16` with `runtime`/`epoch` in the membership loop (frozen guard kept) — **RED** against the untouched 14-field schema, enforcing ROADMAP criterion 3's "never a silent schema add".
- Extended `tests/router.cache.test.mjs` with a cross-runtime cacheKey divergence block (`codex` !== `claude`; `claude` === `claude`) — **RED** against the 6-param cacheKey; all existing cache tests remain GREEN.
- No feature code written. Implementation is deferred to 31-02 (detection + runtime-conditional dirs) and 31-03 (cacheKey runtime slot + telemetry runtime field + OUTCOME_FIELDS bump).

## Task Commits

Each task was committed atomically:

1. **Task 1: Author runtime-tagging spec + mirror-desync guard (RED)** - `f1f3fc8` (test)
2. **Task 2: Bump outcome-schema enforcement test to 16 fields (RED)** - `5844dd7` (test)
3. **Task 3: Extend cache spec with cross-runtime cacheKey divergence (RED)** - `94d8bcb` (test)

## Files Created/Modified

- `tests/router.runtime-tagging.test.mjs` - New RED spec: detection precedence, cacheKey runtime identity, telemetry runtime field, fail-open enum clamp. Imports the live hook so the mirror is load-bearing.
- `tests/router.mjs.snapshot.diff.test.mjs` - New mirror-desync guard (GREEN): `tests/router.mjs.snapshot` byte-identical to `~/.claude/hooks/router.mjs`.
- `tests/router.health.outcome-schema.test.mjs` - Modified: OUTCOME_FIELDS size assertion 14→16, membership loop + `runtime`/`epoch` (RED against current schema).
- `tests/router.cache.test.mjs` - Modified: added cross-runtime cacheKey divergence + same-runtime determinism block (RED for divergence).

## Decisions Made

- Followed the plan exactly as written — no deviations, no architectural changes, no new dependencies (stdlib-only preserved).
- Detection precedence locked as: `ROUTER_RUNTIME` env → codex marker → default `claude` (fail-open), enum-clamped (D-01/D-04). The subprocess probe asserts the module-load `RUNTIME` under controlled env without triggering the hook's `isMain()` stdin entry.
- cacheKey runtime slot is the 7th positional param (next to the Phase-30 manifest_fingerprint epoch slot), so existing 6-arg call sites stay valid and RED tests use the trailing slot.
- telemetry `runtime` field is additive to `telemetryEntryFromState`'s record (D-06) — existing named-field consumers unaffected.
- OUTCOME_FIELDS bump is deliberately RED in this plan; the schema file is untouched (stays at 14) so 31-03 must land the bump in the same change that updates the enforcement test.

## Deviations from Plan

None - plan executed exactly as written.

## RED vs GREEN Assertion Inventory (success criteria evidence)

Targeted run: `rtk node --test tests/router.runtime-tagging.test.mjs tests/router.mjs.snapshot.diff.test.mjs tests/router.health.outcome-schema.test.mjs tests/router.cache.test.mjs` → **38 pass / 9 fail**.

**GREEN (5 new/kept):**
| Test | File |
|------|------|
| mirror: snapshot byte-identical to live hook | `router.mjs.snapshot.diff.test.mjs` |
| cacheKey: deterministic within a runtime — claude === claude (D-05) | `router.runtime-tagging.test.mjs` |
| cacheKey: deterministic within a runtime — claude === claude (D-05) | `router.cache.test.mjs` |
| all pre-existing cache tests (26) | `router.cache.test.mjs` |
| all pre-existing outcome-schema tests except the size assert (14) | `router.health.outcome-schema.test.mjs` |

**RED (9) — each awaits a specific Phase-31 symbol:**
| RED test | Awaits | Symbol/API | Landed in |
|----------|--------|------------|-----------|
| detection: RUNTIME is exported and is one of claude\|codex | `RUNTIME` module constant | 31-02 |
| detection: ROUTER_RUNTIME=codex override wins (D-04) | `detectRuntime()` honoring `ROUTER_RUNTIME` | 31-02 |
| detection: absent marker defaults to claude (fail-open) | `detectRuntime()` default branch | 31-02 |
| detection: out-of-enum ROUTER_RUNTIME clamps to claude | enum clamp in `detectRuntime()` (T-31-01) | 31-02 |
| detection: RUNTIME_CONFIG_DIR exported runtime-scoped | `runtimeBaseDir()` / rewired `RUNTIME_CONFIG_DIR` | 31-02 |
| cacheKey: runtime is key identity — codex !== claude (D-05) | cacheKey 7th `runtime` slot | 31-03 |
| cacheKey: cross-runtime divergence (cache.test.mjs) | cacheKey 7th `runtime` slot | 31-03 |
| telemetry: telemetryEntryFromState emits runtime field | `telemetryEntryFromState().runtime` export + field | 31-03 |
| HLTH-01: OUTCOME_FIELDS allowlist is frozen and final (16 fields) | `OUTCOME_FIELDS` + `runtime`/`epoch` bump | 31-03 |

## Issues Encountered

- None. The only "failures" are the intended RED assertions proving the tests are load-bearing rather than tautological.

## User Setup Required

None - no external service configuration required. The live hook `~/.claude/hooks/router.mjs` was verified byte-identical to the snapshot at execution start (mirror invariant holds).

## Next Phase Readiness

- **31-02** (detection + dirs): has a concrete failing target for every detection assertion — `detectRuntime()`, module-level `RUNTIME`, runtime-conditional `RUNTIME_CONFIG_DIR`. The mirror-desync guard is now load-bearing: 31-02 must edit `tests/router.mjs.snapshot` AND `~/.claude/hooks/router.mjs` in lockstep.
- **31-03** (cache/telemetry/schema): has RED targets for the cacheKey runtime slot, `telemetryEntryFromState().runtime`, and the 16-field OUTCOME_FIELDS bump (schema + enforcement test in the same change).
- **PARITY-01/02** are RED-guarded but NOT yet satisfied — this plan deliberately wrote no feature code.

## Self-Check: PASSED

Verified on disk: `tests/router.runtime-tagging.test.mjs`, `tests/router.mjs.snapshot.diff.test.mjs`, `tests/router.health.outcome-schema.test.mjs`, `tests/router.cache.test.mjs`, `.planning/phases/31-runtime-tagging/31-01-SUMMARY.md` all exist. Commits `f1f3fc8`, `5844dd7`, `94d8bcb` all present in `git log`. Mirror byte-identity re-verified (snapshot == live hook). Targeted run: 38 pass / 9 fail — the 9 failures are the intended RED surfaces documented in the inventory above.

---
*Phase: 31-runtime-tagging*
*Completed: 2026-08-01*
