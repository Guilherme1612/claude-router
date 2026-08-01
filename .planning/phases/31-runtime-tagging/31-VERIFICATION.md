---
phase: 31-runtime-tagging
verified: 2026-08-01T14:30:00Z
status: passed
score: 7/7 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 31: Runtime Tagging Verification Report

**Phase Goal:** The router deterministically knows which runtime it runs in (Claude vs Codex) and tags every telemetry and cache record with that runtime, so shadow-log correlation and per-install calibration never mix runtimes — fixing the hardcoded `RUNTIME_CONFIG_DIR` gap.
**Verified:** 2026-08-01
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Router detects active runtime (claude\|codex) deterministically, enum-clamped, zero hot-path IO, cached once at module load (PARITY-01) | ✓ VERIFIED | `tests/router.mjs.snapshot:83-93` — `detectRuntime()` reads only `process.env.ROUTER_RUNTIME`/`CODEX_HOME`/`process.argv[1]` (no IO, no existsSync), try/catch→`claude`; `export const RUNTIME = detectRuntime()`. Behavioral probe: default=`claude`/`~/.claude`, `ROUTER_RUNTIME=codex`→`codex`/`~/.codex`, `ROUTER_RUNTIME=bogus`→`claude` (enum clamp) |
| 2 | RUNTIME_CONFIG_DIR/ROUTER_DIR/HOOKS_DIR + children resolve to active runtime's home; no `.claude` hardcode in constant block (D-03) | ✓ VERIFIED | `snapshot:97-101,116` — `runtimeBaseDir(runtime)=join(homedir(),'.'+runtime)`; `RUNTIME_CONFIG_DIR=runtimeBaseDir(RUNTIME)`, `ROUTER_DIR=join(RUNTIME_CONFIG_DIR,'router')`, `HOOKS_DIR=join(RUNTIME_CONFIG_DIR,'hooks')`; all children (MANIFEST..TRIGGER, WORKER_PATH, SURFACE_FILE, GSD_CORE_DIR) derive from the root. grep: no `join(homedir(), '.claude')` remains in the constant block |
| 3 | Runtime folded into cache key as hashed identity (claude≠codex keys; no cross-runtime cache reuse) (D-05, PARITY-02) | ✓ VERIFIED | `snapshot:1728-1737` — `cacheKey(..., runtime=RUNTIME)` pushes `String(runtime)` into hashed `parts` tuple ALWAYS; production call site `snapshot:2828` passes `RUNTIME`. Behavioral probe: `cacheKey('claude')`≠`cacheKey('codex')`, same-runtime deterministic |
| 4 | Every telemetry record carries a runtime field (D-06), append-only JSONL, no raw prompt | ✓ VERIFIED | `snapshot:2589,2624` — `export function telemetryEntryFromState(...)` returns `runtime: RUNTIME`; `snapshot:1841-1847` `logTelemetry` = atomic `appendFileSync(flag:'a')`, chmod 0600 on first write; no prompt text (only promptSignature sha256). Probe: `telemetryEntryFromState(...).runtime === RUNTIME` |
| 5 | OUTCOME_FIELDS deliberate 14→16 bump (+runtime+epoch), policy-version bumped, enforcement test updated in same change, runtime/epoch threaded through ingest (criterion 3) | ✓ VERIFIED | `src/health/outcome-schema.mjs:33-38` — `OUTCOME_FIELDS` frozen 16 incl. runtime+epoch with Phase-31 bump comment; `observe.mjs:40` `HEALTH_POLICY_VERSION='health-policy-v2'` (emission :86/:232); `evidence.mjs:6-10` `FIELDS` 13 incl. runtime+epoch; `telemetry-bridge.mjs:77-81` forwards `runtime`/`epoch`; enforcement test `router.health.outcome-schema.test.mjs:66-73` not `Object.isFrozen` + `size===16` + membership loop |
| 6 | Mirror parity: `tests/router.mjs.snapshot` byte-identical to `~/.claude/hooks/router.mjs` | ✓ VERIFIED | `cmp` byte-identical; `router.mjs.snapshot.diff.test.mjs` passes; 31-02/31-03 edited both in lockstep |
| 7 | D-07/D-08 correctly deferred to Phase 32 (not a missed Phase-31 deliverable) | ✓ VERIFIED | REQUIREMENTS.md:102-103 maps PARITY-03/04 to Phase 32; all three plans document the resolve-first capability-resolution hot path is absent until Phase 32. Scoping correct |

**Score:** 7/7 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `tests/router.mjs.snapshot` | detectRuntime, RUNTIME, runtimeBaseDir, runtime-conditional dirs, cacheKey runtime slot, telemetryEntryFromState runtime field | ✓ VERIFIED | All present (lines cited above) |
| `~/.claude/hooks/router.mjs` | Byte-identical mirror | ✓ VERIFIED | `cmp` identical; diff guard GREEN |
| `src/health/outcome-schema.mjs` | OUTCOME_FIELDS 16 frozen (+runtime+epoch) | ✓ VERIFIED | size 16, frozen |
| `src/health/observe.mjs` | HEALTH_POLICY_VERSION v2 | ✓ VERIFIED | `'health-policy-v2'` |
| `src/evolution/evidence.mjs` | FIELDS 13 (+runtime+epoch) | ✓ VERIFIED | allowlist has both |
| `src/evolution/telemetry-bridge.mjs` | runtime/epoch forwarded | ✓ VERIFIED | envelope carries both |
| `build-manifest.mjs` | ROUTER_RUNTIME pin (codex home) | ✓ VERIFIED | CONFIG_HOME/ROUTER_HOOK_PATH runtime-conditional |
| Tests (runtime-tagging, snapshot.diff, cache, outcome-schema, canary, privacy, registry-diff, telemetry-bridge, observe) | All GREEN | ✓ VERIFIED | 130/130 pass |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Default detection | live-hook import, default env | RUNTIME=claude, DIR=~/.claude | ✓ PASS |
| ROUTER_RUNTIME override | `ROUTER_RUNTIME=codex` live-hook import | RUNTIME=codex, DIR=~/.codex | ✓ PASS |
| Out-of-enum clamp | `ROUTER_RUNTIME=bogus` live-hook import | RUNTIME=claude, DIR=~/.claude | ✓ PASS |
| cacheKey divergence | live-hook cacheKey('claude') vs ('codex') | differ=true, deterministic=true | ✓ PASS |
| Telemetry runtime field | live-hook telemetryEntryFromState | runtime==RUNTIME, no prompt | ✓ PASS |
| Mirror parity | `cmp tests/router.mjs.snapshot ~/.claude/hooks/router.mjs` | byte-identical | ✓ PASS |
| Targeted test suite | `rtk node --test` 9 phase-relevant files | 130 pass / 0 fail | ✓ PASS |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | no TBD/FIXME/XXX, no stubs, no placeholder, no hardcoded empty returns in modified files | ℹ️ none | — |

### Hard-Constraint Compliance

- **<100ms hot path / fail-open:** detection runs once at module load (`RUNTIME` constant) with zero IO; `detectRuntime()` is try/catch-wrapped returning `claude` on throw; `logTelemetry` wraps perms in try/catch. No per-prompt IO added.
- **Stdlib-only:** only `node:` built-ins (`crypto`, `fs`, `path`, `os`) — no npm deps.
- **Deterministic runtime detection:** enum-clamped `"claude"|"codex"`, out-of-enum → `claude`; marker is env/argv string checks only.
- **Runtime tag in cache AND telemetry separately:** cache key identity (parts tuple) + telemetry record field (D-06) — two distinct mechanisms, both wired.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| PARITY-01 | 31-02 | Deterministic runtime detection, zero hot-path IO | ✓ SATISFIED | detectRuntime + RUNTIME constant |
| PARITY-02 | 31-02/31-03 | runtime tag on cache + telemetry; no cross-runtime reuse | ✓ SATISFIED | cacheKey identity + telemetry field + dir isolation |
| PARITY-03 | 31-01/02/03 (defer) | Resolve uses only active runtime's capabilities | ✔️ DEFERRED (Phase 32) | Correctly scoped out; resolve layer absent until Phase 32 |
| PARITY-04 | 31-01/02/03 (defer) | Cross-runtime capability-equivalent fixture | ✔️ DEFERRED (Phase 32) | Correctly deferred per D-08 / REQUIREMENTS:103 |

### Gaps Summary

No gaps found. All 7 must-haves VERIFIED with both code-inspection and independent behavioral evidence. The phase deliverables (PARITY-01 detection + PARITY-02 runtime path isolation/cache/telemetry tagging + the deliberate OUTCOME_FIELDS policy-v2 bump) are fully implemented, wired end-to-end (hook → telemetry → bridge → evidence schema), and behaviorally confirmed. PARITY-03/04 are correctly deferred to Phase 32 per the requirements mapping and D-07/D-08 — this is a proper scope decision, not a missed deliverable.

---

_Verified: 2026-08-01_
_Verifier: Claude (gsd-verifier)_
