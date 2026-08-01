---
phase: 31-runtime-tagging
plan: 03
subsystem: cache-isolation-and-telemetry-tagging
tags: [parity-02, cache-key, telemetry-runtime, outcome-schema, policy-version-bump, mirror-guard, wave-2]

# Dependency graph
requires:
  - phase: 31-runtime-tagging
    plan: 01
    provides: RED spec for cacheKey runtime slot + telemetry runtime field + 16-field OUTCOME_FIELDS enforcement
  - phase: 31-runtime-tagging
    plan: 02
    provides: detectRuntime() + module RUNTIME + runtime-conditional dirs + precise runtime/epoch threading site (telemetry-bridge → evidence FIELDS → OUTCOME_FIELDS)
provides:
  - cacheKey runtime identity slot (D-05) — claude/codex keys never collide
  - telemetry runtime field (D-06) — every record tagged with active runtime, append-only JSONL preserved
  - OUTCOME_FIELDS 14 → 16 (+runtime, +epoch) with HEALTH_POLICY_VERSION bumped to v2 — ROADMAP criterion 3
  - runtime/epoch survive telemetry→evidence ingest (bridge forward + FIELDS 11 → 13)
affects: [32-intent-first-routing (resolve-layer), 33-shadow-log]

# Actuals (#2632) — chars/4 over the realized diff (7 tracked files touched)
actuals:
  tokens: 3300
  tasks: 3
  commits: 4

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Runtime folded into the cache-key hashed parts tuple ALWAYS (identity, never route metadata) — D-05 anti-pattern guard"
    - "cacheKey runtime slot defaults to the module RUNTIME constant so non-pinning callers (test cache seeds) derive the SAME key as production"
    - "Schema field add is ATOMIC with its policy-version bump + enforcement test + consumer wiring (never a silent add)"

key-files:
  created: []
  modified:
    - tests/router.mjs.snapshot
    - ~/.claude/hooks/router.mjs
    - src/health/outcome-schema.mjs
    - src/health/observe.mjs
    - src/evolution/telemetry-bridge.mjs
    - src/evolution/evidence.mjs
    - tests/router.telemetry-bridge.test.mjs

key-decisions:
  - "cacheKey runtime slot placed LAST (7th param) and always folded into the hashed parts tuple; default is the module RUNTIME constant (allowed by plan) so pre-seeding tests and the production call site agree, while an explicit runtime string remains the cross-runtime isolation knob."
  - "HEALTH_POLICY_VERSION bumped 'health-policy-v1' → 'health-policy-v2' at observe.mjs; thresholds.mjs POLICY_VERSION (threshold-bundle version) left untouched because evidence/outcome schema does NOT share it — canary test stays GREEN unmodified."
  - "Runtime/epoch forwarded in telemetry-bridge.mjs envelope + evidence.mjs FIELDS bumped 11 → 13; watcher.mjs needed NO edit (it calls telemetryRecordToEvidence which now forwards)."

requirements-completed: [PARITY-02]  # cache isolation + telemetry tagging complete; D-07/D-08 resolve-layer deferred to Phase 32

coverage:
  - id: C3
    description: "cacheKey runtime identity (codex !== claude) — GREEN"
    verification:
      - kind: unit
        ref: "tests/router.runtime-tagging.test.mjs#cacheKey + tests/router.cache.test.mjs#cross-runtime"
        status: pass
  - id: C4
    description: "telemetry runtime field — GREEN"
    verification:
      - kind: unit
        ref: "tests/router.runtime-tagging.test.mjs#telemetry"
        status: pass
  - id: C5
    description: "HLTH-01 OUTCOME_FIELDS frozen (16) — GREEN"
    verification:
      - kind: unit
        ref: "tests/router.health.outcome-schema.test.mjs#HLTH-01"
        status: pass

# Metrics
duration: ~1.5h
completed: 2026-08-01
status: complete
---

# Phase 31 Plan 3: Runtime Cache-Key Identity + Telemetry Runtime Tag + Deliberate OUTCOME_FIELDS Bump Summary

**PARITY-02 completion: the runtime is folded into the cache-key hashed identity (so a Claude-served route is never returned to a Codex session and vice versa), every telemetry record carries its active runtime field, and runtime/epoch land in the evidence schema via a deliberate 14→16 OUTCOME_FIELDS policy-version bump (HEALTH_POLICY_VERSION → v2) wired through the telemetry ingest — never a silent schema add (ROADMAP criterion 3).**

## Performance

- **Duration:** ~1.5h
- **Started:** 2026-08-01
- **Completed:** 2026-08-01
- **Tasks:** 3 (all tdd)
- **Commits:** 4 (3 feat + 1 fix)
- **Files modified:** 7 (2 tracked hook files + 5 src/test in-repo)

## Accomplishments

- **Task 1 — cacheKey runtime identity slot (GREEN).** Extended `cacheKey(...)` with a 7th `runtime` param that is ALWAYS folded into the hashed `parts` tuple (`[np, ik, manifestFingerprint, runtime]`), never route metadata (D-05, RESEARCH Pitfall 3 anti-pattern guard). The production call site passes the module `RUNTIME` constant. The slot defaults to the module `RUNTIME` (see Deviation 1) so `claude` vs `codex` keys always differ and an explicit runtime string is the isolation knob. Turns the 31-01 cross-runtime divergence test GREEN: same prompt+manifest under `codex` and `claude` hash differently; deterministic within a runtime.
- **Task 2 — telemetry runtime field (GREEN).** Exported `telemetryEntryFromState` and appended `runtime: RUNTIME` to the returned record (D-06), placed alongside the other observability fields (`routing_version`). Additive — existing record fields unchanged; append-only JSONL via `logTelemetry` preserved; no raw prompt text. Turns the 31-01 telemetry runtime-field test GREEN (`telemetryEntryFromState(decision, startNs).runtime` is `claude|codex`).
- **Task 3 — deliberate OUTCOME_FIELDS policy-version bump (GREEN).** `OUTCOME_FIELDS` 14 → 16 (`+runtime`, `+epoch`) in `src/health/outcome-schema.mjs` with a documented Phase-31 bump comment, kept `Object.freeze(new Set(...))`. Bumped `HEALTH_POLICY_VERSION` → `'health-policy-v2'` at `src/health/observe.mjs` (emission sites :86/:232) to reflect the new allowlist (ROADMAP criterion 3 — never a silent add). Wired `runtime`/`epoch` through ingest at the 31-02-documented site: added forwarding in `telemetryRecordToEvidence` (`src/evolution/telemetry-bridge.mjs`) and bumped `evidence.mjs` `FIELDS` 11 → 13 so `validateEvidenceEnvelope` accepts the two new fields. `src/registry/watcher.mjs` needed no edit (it calls `telemetryRecordToEvidence`, which now forwards). Updated the `telemetry-bridge` Task1.6 exact-key assertion 11 → 13 in the same change (schema + enforcement move together). Turns the 31-01 16-field outcome-schema test GREEN. `thresholds.mjs` `POLICY_VERSION` left at `health-policy-v1` (separate threshold-bundle version the outcome schema does not share) — canary test stays GREEN unmodified.

## Task Commits

1. **Task 1: Fold runtime into cache key as hashed identity** - `4979c04` (feat)
2. **Task 2: Add runtime field to every telemetry record** - `b2980c1` (feat)
3. **Task 3: Bump OUTCOME_FIELDS to 16 with runtime/epoch (policy-v2)** - `011bc99` (feat)
4. **Rule 1 fix: Default cacheKey runtime slot to module RUNTIME** - `d40f985` (fix)

## Files Created/Modified

- `tests/router.mjs.snapshot` - Modified: `cacheKey` 7th `runtime` slot folded into hashed parts; production call site passes `RUNTIME`; `telemetryEntryFromState` exported + `runtime: RUNTIME` field. Canonical hook source.
- `~/.claude/hooks/router.mjs` - Modified (outside git repo): byte-identical lockstep mirror, verified via `cmp` + mirror-guard test.
- `src/health/outcome-schema.mjs` - Modified: `OUTCOME_FIELDS` 14 → 16 (+runtime, +epoch) with Phase-31 bump comment.
- `src/health/observe.mjs` - Modified: `HEALTH_POLICY_VERSION` → `'health-policy-v2'`.
- `src/evolution/telemetry-bridge.mjs` - Modified: forwards `runtime`/`epoch` (as `String(...) ?? null`) in the evidence envelope.
- `src/evolution/evidence.mjs` - Modified: `FIELDS` allowlist 11 → 13 (+runtime, +epoch).
- `tests/router.telemetry-bridge.test.mjs` - Modified: Task1.6 exact-key assertion 11 → 13 fields.

## Decisions Made

- **cacheKey default runtime = module RUNTIME** (Deviation 1, Rule 1). The plan allowed "defaulting to the module RUNTIME constant"; this is the design that keeps pre-seeded cache integration tests (SAF-02/SAF-04) reachable while preserving cross-runtime isolation.
- **policy-version bump scope.** Only `HEALTH_POLICY_VERSION` (the version the outcome/evidence records actually write) was bumped. `thresholds.mjs POLICY_VERSION` is the threshold-bundle version, not shared by the outcome schema — left untouched so the canary test's `:49` assertion stays legitimate.
- **Wiring lives in the bridge, not the watcher.** `telemetryRecordToEvidence` forward-maps; adding the two fields there + bumping `evidence.mjs FIELDS` carries the tag into evidence automatically. `src/registry/watcher.mjs` (the plan's listed file) required no change — matching 31-02's documented conclusion.

## RED vs GREEN Turned (31-01 targets)

| Test | Before (31-01/31-02) | After (31-03) |
|------|----------------------|---------------|
| cacheKey: runtime is key identity — codex !== claude (D-05) | RED | GREEN |
| cacheKey: cross-runtime divergence (cache.test.mjs) | RED | GREEN |
| telemetry: telemetryEntryFromState emits runtime field (D-06) | RED | GREEN |
| HLTH-01: OUTCOME_FIELDS frozen and final (16 fields) | RED | GREEN |
| mirror: snapshot byte-identical to live hook | GREEN | GREEN |

Targeted verification: `router.runtime-tagging + cache + outcome-schema + mirror.diff + canary + registry-diff + privacy + telemetry-bridge + registry-watcher + health.observe + health.tracer` → **164 pass / 0 fail**.

Full suite: `rtk node --test tests/*.test.mjs` → 1226 tests / 1217 pass / 9 fail. The 9 failures are all PRE-EXISTING or full-suite-load flakes, not caused by this plan: `graphifyQuery` + 5 `router inspect` tests (confirmed pre-existing in 31-02, fail identically with the pre-change snapshot), installer tests (`uninstall verb`, `install verb across claude fixture`, `fresh installs dual-runtime` x2) and perf/timing tests (`fresh-onboarding`, `phase26-performance`, `SAF-03` mutation-safety ceiling) — all pass in isolation and appear/disappear between full-suite runs.

## Deviations from Plan

1. **[Rule 1 - Bug] cacheKey runtime default `''` broke SAF-02/SAF-04 mutation-safety integration tests.** Task 1 first shipped `runtime = ''`, which made the always-folded slot emit `''` for test-side cache seeds while production emits `'claude'` → keys diverged → the hook missed the seeded entry (SAF-02/SAF-04 failed). Fixed by defaulting the slot to the module `RUNTIME` constant (plan-sanctioned alternative): non-pinning callers now derive the SAME key as production. Mutation-safety suite green. **Commit:** `d40f985`.
2. **Out-of-scope pre-existing failures left untouched.** The `graphifyQuery` + 5 `router inspect` reshape failures are pre-existing (verified provenance in 31-02) and were NOT fixed, per the scope boundary.

## Issues Encountered

- Full-suite run shows 9 failures; all attributable to pre-existing inspect/graphify assertions or install/perf timing flakes (pass in isolation). No new failures introduced by this plan (verified SAF-02/SAF-04 fixed; SAF-03 perf ceiling passes in isolation).

## User Setup Required

None. The live hook `~/.claude/hooks/router.mjs` is byte-identical to `tests/router.mjs.snapshot` (`cmp` + mirror-guard test GREEN).

## Next Phase Readiness

- **PARITY-02 satisfied** (cache-key isolation + telemetry tagging + evidence schema reachability). **D-07/D-08** (resolve-first capability-resolution per runtime + cross-runtime fixture) explicitly deferred to Phase 32 (resolve layer) as documented in the plan.

## Self-Check: PASSED

Verified on disk:
- `tests/router.mjs.snapshot` `cacheKey` has the 7th `runtime` slot folded into `parts` and the production call site passes `RUNTIME`; `telemetryEntryFromState` is exported and returns `runtime: RUNTIME`.
- `~/.claude/hooks/router.mjs` byte-identical to snapshot (`cmp`).
- `src/health/outcome-schema.mjs` `OUTCOME_FIELDS.size === 16` + `Object.isFrozen`; `observe.mjs` `HEALTH_POLICY_VERSION === 'health-policy-v2'`; bridge forwards runtime/epoch; evidence `FIELDS` includes runtime+epoch.
- 31-01 RED targets (cacheKey divergence x2, telemetry runtime, 16-field schema) all GREEN; mirror guard GREEN.
- Commits `4979c04`, `b2980c1`, `011bc99`, `d40f985` present in `git log`.
- `.planning/phases/31-runtime-tagging/31-03-SUMMARY.md` written.

---
*Phase: 31-runtime-tagging*
*Completed: 2026-08-01*
