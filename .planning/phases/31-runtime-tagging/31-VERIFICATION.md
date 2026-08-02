---
phase: 31-runtime-tagging
verified: 2026-08-01T14:35:00Z
status: passed
score: 7/7 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 31: Runtime Tagging Verification Report

**Phase Goal:** The router knows which runtime it runs in and tags every telemetry/cache record with it, so shadow-log correlation and per-install calibration never mix runtimes — fixing the hardcoded `RUNTIME_CONFIG_DIR` gap.
**Verified:** 2026-08-01
**Status:** passed
**Re-verification:** No — initial independent verification (previous report also passed; this run re-confirms with independent probes)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `detectRuntime()` resolves the active runtime (claude\|codex) deterministically, zero hot-path IO, cached once at module load; ROUTER_RUNTIME override wins; enum-clamped fail-open (PARITY-01) | ✓ VERIFIED | `tests/router.mjs.snapshot:83-93` — `detectRuntime()` reads only `process.env.ROUTER_RUNTIME`/`CODEX_HOME`/`argv[1]` (no IO, no existsSync), try/catch→`claude`; `export const RUNTIME = detectRuntime()`. Behavioral probe (own process): default=`claude`/`~/.claude`, `ROUTER_RUNTIME=codex`→`codex`/`~/.codex`, `ROUTER_RUNTIME=bogus`→`claude` (enum clamp). Test `router.runtime-tagging.test.mjs` covers precedence + clamp, all pass |
| 2 | RUNTIME_CONFIG_DIR/ROUTER_DIR/HOOKS_DIR + all children runtime-conditional; no `.claude` hardcode in constant block (D-03) | ✓ VERIFIED | `snapshot:97-131` — `runtimeBaseDir(runtime)=join(homedir(),'.'+runtime)`; `RUNTIME_CONFIG_DIR=runtimeBaseDir(RUNTIME)`, `ROUTER_DIR/HOOKS_DIR/MANIFEST/CACHE/TELEMETRY/MODE_MAP/WEIGHTS/TRIGGER/WORKER_PATH/SURFACE_FILE/GSD_CORE_DIR` all derive from the root. grep: zero `join(homedir(), '.claude')` remains in snapshot |
| 3 | cacheKey folds runtime as hashed key identity — claude≠codex keys, no cross-runtime reuse (PARITY-02, D-05) | ✓ VERIFIED | `snapshot:1728-1737` — `cacheKey(..., runtime=RUNTIME)` always pushes `String(runtime)` into the hashed `parts` tuple (identity, not metadata). Production call site `:2828` passes `RUNTIME`. Behavioral probe: `cacheKey('codex')`≠`cacheKey('claude')` (differs=true), same-runtime deterministic |
| 4 | Every telemetry record carries a `runtime` field, append-only JSONL, no raw prompt (D-06) | ✓ VERIFIED | `snapshot:2624` — `telemetryEntryFromState` returns `runtime: RUNTIME`; `:1841-1849` `logTelemetry` = atomic `appendFileSync(flag:'a')` + chmod 0600 on first write, single append path (no duplicate writers); no prompt text (only promptSignature sha256). Probe: entry.runtime==='claude', hasPrompt=false |
| 5 | OUTCOME_FIELDS deliberate 14→16 (+runtime+epoch), policy-version bumped, enforcement test updated in same change, outcome producers emit runtime (WR-01) | ✓ VERIFIED | `src/health/outcome-schema.mjs:37-51` — `OUTCOME_FIELDS` frozen Set of 16 incl. `runtime`+`epoch` with PHASE-31 bump comment; runtime check confirms `size 16, frozen, has runtime, has epoch`. `observe.mjs:40` `HEALTH_POLICY_VERSION='health-policy-v2'`; producers `:92/:242` emit `runtime: telemetryRecord.runtime`. `evidence.mjs:6-10` `FIELDS` includes runtime+epoch; `telemetry-bridge.mjs:80-86` forwards both. Enforcement test `router.health.outcome-schema.test.mjs:66-73` asserts `Object.isFrozen` + `size===16` + membership loop — atomic with the bump (git log shows bump + enforcement in the phase's own commits) |
| 6 | Mirror parity: `tests/router.mjs.snapshot` byte-identical to `~/.claude/hooks/router.mjs` | ✓ VERIFIED | `cmp tests/router.mjs.snapshot ~/.claude/hooks/router.mjs` → BYTE-IDENTICAL. `tests/router.mjs.snapshot.diff.test.mjs` passes; `router.runtime-tagging.test.mjs` imports the LIVE hook (making the mirror load-bearing) |
| 7 | build-manifest ROUTER_RUNTIME pin is additive + fail-open | ✓ VERIFIED | `build-manifest.mjs:48-67` — `RUNTIME = ROUTER_RUNTIME==='codex' ? 'codex' : 'claude'`; CODEX_HOME/CONFIG_HOME/OUT/MODE_MAP_PATH/WEIGHTS_PATH/ROUTER_HOOK_PATH all runtime-conditional; unset/'claude' leaves default paths byte-identical to today (fail-open documented) |

**Score:** 7/7 truths verified (0 present, behavior-unverified)

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | PARITY-03 (resolve evaluation uses only active runtime's capabilities) | Phase 32 | REQUIREMENTS.md:102 maps PARITY-03 → Phase 32; resolve-first capability-resolution hot path absent until Phase 32 |
| 2 | PARITY-04 (cross-runtime capability-equivalent fixture) | Phase 32 | REQUIREMENTS.md:103 maps PARITY-04 → Phase 32 (D-08) |

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `tests/router.mjs.snapshot` | detectRuntime, RUNTIME, runtimeBaseDir, runtime-conditional dirs, cacheKey runtime slot, telemetryEntryFromState runtime field | ✓ VERIFIED | All present at cited lines |
| `~/.claude/hooks/router.mjs` | Byte-identical mirror | ✓ VERIFIED | `cmp` BYTE-IDENTICAL; diff guard + live-hook import GREEN |
| `src/health/outcome-schema.mjs` | OUTCOME_FIELDS 16 frozen (+runtime+epoch) | ✓ VERIFIED | size 16, frozen |
| `src/health/observe.mjs` | HEALTH_POLICY_VERSION v2 + producers emit runtime | ✓ VERIFIED | `health-policy-v2`, `runtime: telemetryRecord.runtime` at :92/:242 |
| `src/evolution/evidence.mjs` | FIELDS 13 (+runtime+epoch), runtime enum-bounded | ✓ VERIFIED | allowlist + `invalid_runtime` guard |
| `src/evolution/telemetry-bridge.mjs` | runtime/epoch forwarded | ✓ VERIFIED | envelope carries both |
| `build-manifest.mjs` | ROUTER_RUNTIME pin (fail-open) | ✓ VERIFIED | CONFIG_HOME/OUT/ROUTER_HOOK_PATH runtime-conditional |
| `tests/router.runtime-tagging.test.mjs` | RED spec → GREEN | ✓ VERIFIED | detection, cacheKey divergence, telemetry field, enum clamp |
| `tests/router.mjs.snapshot.diff.test.mjs` | Mirror guard | ✓ VERIFIED | passes |
| `tests/router.health.outcome-schema.test.mjs` | 16-field enforcement | ✓ VERIFIED | frozen+size16+membership |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| `detectRuntime()` | `RUNTIME` constant | module-load call `:93` | WIRED | cached once, zero hot-path IO |
| `RUNTIME` | RUNTIME_CONFIG_DIR/ROUTER_DIR/HOOKS_DIR | `runtimeBaseDir(RUNTIME)` + descendants | WIRED | all data paths derive from runtime root |
| `cacheKey` | runtime key identity | `parts` tuple `String(runtime)` | WIRED | always pushed; production passes RUNTIME |
| `telemetryEntryFromState` | telemetry `runtime` field | `runtime: RUNTIME` | WIRED | every record tagged |
| hook telemetry → observe | runtime forward | `telemetryRecord.runtime ?? null` | WIRED | WR-01 forward at :92/:242 |
| observe → evidence.mjs | runtime/epoch allowlist | bridge forwards both | WIRED | FIELDS include runtime+epoch |
| OUTCOME_FIELDS bump | enforcement test | atomic same-change | WIRED | frozen+size16+membership |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| telemetry record | `runtime` | `RUNTIME` constant (detectRuntime) | Yes — real detected runtime | ✓ FLOWING |
| cache key | `runtime` slot | module `RUNTIME` producer call site | Yes — real runtime in hash parts | ✓ FLOWING |
| outcome envelope | `runtime` | `telemetryRecord.runtime` via observe | Yes — forwarded from hook record | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Default detection | live-hook import, default env | claude\|~/.claude | ✓ PASS |
| ROUTER_RUNTIME override | `ROUTER_RUNTIME=codex` live-hook import | codex\|~/.codex | ✓ PASS |
| Out-of-enum clamp | `ROUTER_RUNTIME=bogus` live-hook import | claude\|~/.claude | ✓ PASS |
| cacheKey divergence | live-hook `cacheKey('codex')` vs `('claude')` | differs=true, deterministic=true | ✓ PASS |
| Telemetry runtime field | live-hook `telemetryEntryFromState` | runtime=claude, hasPrompt=false | ✓ PASS |
| Mirror parity | `cmp snapshot live-hook` | BYTE-IDENTICAL | ✓ PASS |
| Frozen schema | runtime import of outcome-schema | size16, frozen, has runtime+epoch | ✓ PASS |
| Targeted test suite | node --test (4 phase files) | 48 pass / 0 fail | ✓ PASS |

### Probe Execution

No phase-declared `probe-*.sh` scripts exist; behavioral verification used direct live-hook imports in the verifier's own process (recorded above), not SUMMARY attestations.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| PARITY-01 | 31-01/31-02 | Deterministic runtime detection, zero hot-path IO | ✓ SATISFIED | detectRuntime + RUNTIME constant; behavioral probe + test |
| PARITY-02 | 31-01/31-02/31-03 | Runtime tag on cache + telemetry; no cross-runtime reuse | ✓ SATISFIED | cacheKey identity + telemetry field + dir isolation; divergence probe |
| PARITY-03 | (defer) | Resolve uses only active runtime's capabilities | ✔️ DEFERRED (Phase 32) | Correctly scoped out; resolve layer absent until Phase 32 |
| PARITY-04 | (defer) | Cross-runtime capability-equivalent fixture | ✔️ DEFERRED (Phase 32) | Correctly deferred per D-08 / REQUIREMENTS:103 |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | none (no TBD/FIXME/XXX/PLACEHOLDER in modified files; no hardcoded `.claude` in constant block; no raw-prompt telemetry fields; fail-open guards present) | ℹ️ none | — |

### Hard-Constraint Compliance

- **<100ms hot path / fail-open:** detection runs once at module load into `RUNTIME` with zero IO; `detectRuntime()` try/catch-wrapped returning `claude` on throw; `logTelemetry` wraps perms in try/catch; build-manifest RUNTIME pin documented additive+fail-open.
- **Stdlib-only:** only `node:` built-ins — no npm deps added.
- **Deterministic runtime detection:** enum-clamped `"claude"|"codex"`, out-of-enum → `claude`; string-checks only (env/argv), no IO.
- **Runtime tag in cache AND telemetry:** two distinct mechanisms — cache-key hashed identity (D-05) + telemetry record field (D-06), both wired.
- **Deliberate schema bump:** OUTCOME_FIELDS 14→16 atomic with policy-version bump + enforcement test + consumer wiring (never a silent add).

### Gaps Summary

No gaps found. All 7 must-haves verified with independent code inspection, data-flow trace, and behavioral probes run in the verifier's own process. PARITY-01 (deterministic detection) and PARITY-02 (runtime-tagged cache + telemetry, no cross-runtime reuse) are fully implemented and wired end-to-end (hook → telemetry → bridge → evidence schema → OUTCOME_FIELDS policy-v2). PARITY-03/04 are correctly deferred to Phase 32 per REQUIREMENTS.md and D-07/D-08 — a proper scope decision, not a missed deliverable.

---

_Verified: 2026-08-01_
_Verifier: Claude (gsd-verifier)_
