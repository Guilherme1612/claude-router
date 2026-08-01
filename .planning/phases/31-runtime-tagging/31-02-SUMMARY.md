---
phase: 31-runtime-tagging
plan: 02
subsystem: runtime-detection
tags: [runtime-detection, config-dir, parity, mirror-guard, tracer, wave-1]

# Dependency graph
requires:
  - phase: 31-runtime-tagging
    plan: 01
    provides: RED spec for detection precedence (PARITY-01) + mirror-desync guard + 16-field outcome-schema guard
provides:
  - detectRuntime() + module-load RUNTIME constant (D-01/D-02/D-04) — PARITY-01 satisfied
  - runtime-conditional RUNTIME_CONFIG_DIR/ROUTER_DIR/HOOKS_DIR + all descendants (D-03) — PARITY-02 path isolation
  - build-manifest ROUTER_RUNTIME pin (D-04) — codex home derivation for install/builder
  - Precise runtime/epoch threading site for 31-03 (telemetry-bridge envelope map + evidence.mjs FIELDS + OUTCOME_FIELDS)
affects: [31-03 (cacheKey runtime slot + telemetry runtime field + schema bumps), 32-intent-first-routing, 33-shadow-log]

# Actuals (#2632) — chars/4 over the realized diff (2 tracked files, +50/-7)
actuals:
  tokens: 1429
  tasks: 3
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-load detection cached into a constant (D-01): zero hot-path IO, zero per-prompt branching"
    - "Single runtime-conditional config root (D-03): every data path derives from RUNTIME_CONFIG_DIR"
    - "Enum-clamped runtime value bounds path construction (T-31-01/T-31-02): attacker-controlled env cannot escape the ~/.claude|~/.codex segment"

key-files:
  created: []
  modified:
    - tests/router.mjs.snapshot
    - ~/.claude/hooks/router.mjs
    - build-manifest.mjs

key-decisions:
  - "Detection precedence (D-01/D-04): ROUTER_RUNTIME env override wins when exactly 'claude'|'codex'; else codex marker (CODEX_HOME set, or argv[1] under .codex/); else default 'claude' (fail-open). Out-of-enum clamps to 'claude' (T-31-01)."
  - "RUNTIME_CONFIG_DIR exported and runtime-conditional via runtimeBaseDir(RUNTIME) (D-03); ROUTER_DIR/HOOKS_DIR and all child constants rewired off the .claude hardcode — no join(homedir(), '.claude') remains in the hook constant block."

requirements-completed: [PARITY-01]  # PARITY-02 partial: path isolation done, cache/telemetry tagging lands in 31-03

coverage:
  - id: C1
    description: "31-01 detection group GREEN — RUNTIME enum, ROUTER_RUNTIME=codex override, absent→claude, enum clamp, RUNTIME_CONFIG_DIR runtime-scoped"
    verification:
      - kind: unit
        ref: "tests/router.runtime-tagging.test.mjs#detection (5 tests)"
        status: pass
    human_judgment: false
  - id: C2
    description: "Mirror-desync guard stays GREEN — tests/router.mjs.snapshot byte-identical to ~/.claude/hooks/router.mjs"
    verification:
      - kind: unit
        ref: "tests/router.mjs.snapshot.diff.test.mjs"
        status: pass
    human_judgment: false
  - id: C3
    description: "cacheKey runtime identity (codex !== claude) — intentionally RED, 31-03 target"
    verification:
      - kind: unit
        ref: "tests/router.runtime-tagging.test.mjs#cacheKey + tests/router.cache.test.mjs#cross-runtime"
        status: fail
    human_judgment: true
  - id: C4
    description: "telemetry runtime field — intentionally RED, 31-03 target"
    verification:
      - kind: unit
        ref: "tests/router.runtime-tagging.test.mjs#telemetry"
        status: fail
    human_judgment: true
  - id: C5
    description: "HLTH-01 OUTCOME_FIELDS frozen (16) — intentionally RED against 14-field schema, deliberate 31-03 bump target"
    verification:
      - kind: unit
        ref: "tests/router.health.outcome-schema.test.mjs#HLTH-01"
        status: fail
    human_judgment: true

# Metrics
duration: ~50min
completed: 2026-08-01
status: complete
---

# Phase 31 Plan 2: Runtime Detection + Runtime-Conditional Config-Dir Resolution Summary

**Tracer-first vertical slice that proves runtime detection end-to-end: the hook resolves its active runtime (claude|codex) once at module load with zero hot-path IO, and every data path (ROUTER_DIR, HOOKS_DIR, SURFACE_FILE, GSD_CORE_DIR and all children) now derives from a single runtime-conditional root instead of the hardcoded `.claude` — plus the install/builder honors a `ROUTER_RUNTIME` pin for Codex homes.**

## Performance

- **Duration:** ~50 min (includes full-suite verification + concurrency reconciliation)
- **Started:** 2026-08-01
- **Completed:** 2026-08-01
- **Tasks:** 3
- **Files modified:** 3 (2 tracked in-repo + 1 live-hook mirror outside the repo)

## Accomplishments

- **Task 1 — Runtime detection + runtime-conditional dir resolution (GREEN).** Added `export function detectRuntime()` (D-01/D-02/D-04) and `export const RUNTIME = detectRuntime()` to `tests/router.mjs.snapshot`. Precedence: (1) `ROUTER_RUNTIME` override when exactly `claude|codex`; (2) codex marker (`process.env.CODEX_HOME` set, or `process.argv[1]` path containing `.codex/`); (3) default `claude`. The whole body is try/catch-wrapped and returns `claude` on any throw (fail-open). Out-of-enum `ROUTER_RUNTIME` clamps to `claude` (T-31-01). Detection uses only `process.env`/`process.argv` string checks — **no IO, no existsSync, no per-prompt cost** (D-01 zero-hot-path-IO). Replaced the hardcoded `RUNTIME_CONFIG_DIR = join(homedir(), '.claude')` with `export const RUNTIME_CONFIG_DIR = runtimeBaseDir(RUNTIME)` where `runtimeBaseDir` returns `join(homedir(), '.' + runtime)` (D-03). Rewired `ROUTER_DIR = join(RUNTIME_CONFIG_DIR, 'router')` and `HOOKS_DIR = join(RUNTIME_CONFIG_DIR, 'hooks')` so all children (MANIFEST, BUILD_SCRIPT, COVERAGE_REPORT, CACHE, TELEMETRY, MODE_MAP, WEIGHTS, CALIBRATION_PATH, EVOLUTION_STATE, TRIGGER, WORKER_PATH) flow through the runtime root. `SURFACE_FILE` and `GSD_CORE_DIR` already derived from `RUNTIME_CONFIG_DIR` and inherit the switch automatically. **No `join(homedir(), '.claude')` hardcode remains in the hook constant block.**
- **Task 1 mirror lockstep.** Applied the identical bytes to `~/.claude/hooks/router.mjs`; `cmp` confirms byte-identity and `tests/router.mjs.snapshot.diff.test.mjs` (mirror guard) stays GREEN.
- **Task 2 — Install/builder honors the runtime pin (GREEN).** `build-manifest.mjs` now reads `ROUTER_RUNTIME` (default `claude`); when `codex`, derives its config/home root from `ROUTER_CODEX_HOME || join(HOME, '.codex')` and targets the manifest, mode-map, weights, and `ROUTER_HOOK_PATH` under the codex home (D-04). Additive + fail-open: unset or `claude` leaves every default path byte-for-byte unchanged. Verified: `tests/router.fresh-onboarding.test.mjs` passes; `ROUTER_RUNTIME=claude` import writes the manifest to the default repo location; a `ROUTER_RUNTIME=codex` probe retargets the output to the codex home. The full Codex inventory walk is NOT implemented (deferred per REQUIREMENTS note).
- **Task 3 — Watcher ingest wiring-point documented (inspect-only).** Inspected `telemetryRecordToEvidence` (imported into `src/registry/watcher.mjs` from `src/evolution/telemetry-bridge.mjs`). It **explicitly maps** the hook's raw telemetry fields into a fresh envelope (it does NOT allowlist the raw record), then defers to `validateEvidenceEnvelope`. So a `runtime`/`epoch` tag on the hook's telemetry record would currently be **dropped** by the bridge mapping. No schema or watcher change was made this plan (`src/health/outcome-schema.mjs` stays at 14 fields). Exact threading site for 31-03 documented below.

## Task Commits

Each task was committed atomically. NOTE — see the Deviations section: the two `feat(31-02)` commits below were created on this shared working tree by a concurrent executor of the same plan while this executor was running; their content was verified byte-for-byte to match the plan and was independently verified GREEN here.

1. **Task 1: Wire runtime detection + runtime-conditional dir resolution** - `cf95efb` (feat)
2. **Task 2: Make the install/builder honor the runtime pin** - `8d55c9e` (feat)
3. **Task 3: Confirm watcher ingest forwards/allowlists runtime** - no commit (inspect-only; wiring point documented in this SUMMARY)

## Files Created/Modified

- `tests/router.mjs.snapshot` - Modified: added `detectRuntime()`, `export const RUNTIME`, `runtimeBaseDir()`, runtime-conditional `export const RUNTIME_CONFIG_DIR`; rewired `ROUTER_DIR`/`HOOKS_DIR` off the `.claude` hardcode. Canonical hook source.
- `~/.claude/hooks/router.mjs` - Modified (outside git repo): byte-identical mirror of the snapshot, verified via `cmp`.
- `build-manifest.mjs` - Modified: `ROUTER_RUNTIME`-aware home derivation (`ROUTER_CODEX_HOME || ~/.codex` for codex; claude default unchanged).

## Decisions Made

- Detection precedence locked per D-01/D-04: `ROUTER_RUNTIME` override → codex marker → default `claude`, enum-clamped (T-31-01). This matches the 31-01 RED spec exactly.
- Chose `CODEX_HOME` env presence OR `argv[1]` containing `.codex/` as the codex marker — both are process-env/argv string checks available at module load with zero IO (D-01's "marker already present in the process/env at module load"). Defaults to `claude` when neither is present, so Claude (the dominant, verified runtime) is the fail-open default per D-01.
- `RUNTIME_CONFIG_DIR` is now `export`ed (31-01 detection/dir tests import it directly) and is the single source of truth for the profile root (D-03).
- build-manifest's runtime pin is additive: `ROUTER_RUNTIME === 'codex'` is the only switch; anything else keeps the existing `~/.claude` default byte-for-byte.

## RED vs GREEN Assertion Inventory (success-criteria evidence)

Targeted run — `rtk node --test tests/router.runtime-tagging.test.mjs tests/router.mjs.snapshot.diff.test.mjs` → **7 pass / 2 fail**.

**GREEN — the 31-01 detection group this plan was spawned to turn GREEN:**
| Test | Status |
|------|--------|
| mirror: snapshot byte-identical to live hook | GREEN |
| detection: RUNTIME is exported and is one of claude\|codex | GREEN |
| detection: ROUTER_RUNTIME=codex override wins (D-04) | GREEN |
| detection: absent marker defaults to claude (fail-open) | GREEN |
| detection: RUNTIME_CONFIG_DIR is exported as a runtime-scoped string (D-03) | GREEN |
| detection: out-of-enum ROUTER_RUNTIME clamps to claude (fail-open / T-31-01) | GREEN |
| cacheKey: deterministic within a runtime — claude === claude (D-05) | GREEN |

**STILL RED — the deliberate 31-03 targets (unchanged from 31-01, NOT a failure of this wave):**
| RED test | Awaits (31-03) |
|----------|----------------|
| cacheKey: runtime is key identity — codex !== claude (D-05) | cacheKey 7th `runtime` slot |
| telemetry: telemetryEntryFromState emits runtime field (D-06) | `telemetryEntryFromState` export + field |
| HLTH-01: OUTCOME_FIELDS frozen and final (16 fields) | OUTCOME_FIELDS 14→16 bump |
| cacheKey: cross-runtime divergence (cache.test.mjs) | cacheKey 7th `runtime` slot |

**Task 2 verify:** `tests/router.fresh-onboarding.test.mjs` → 1 pass. `ROUTER_RUNTIME=claude` builder import OK (default path unchanged). `ROUTER_RUNTIME=codex` probe retargets output to the codex home.

**Task 3 verify:** `tests/router.registry-diff.test.mjs tests/router.registry-watcher.test.mjs` → 39 pass / 0 fail. `tests/router.health.outcome-schema.test.mjs` → 14 pass / 1 fail (the 1 fail is HLTH-01 expecting 16, schema has 14 — the deliberate 31-03 bump guard, EXPECTED RED).

**Full suite:** `rtk node --test tests/*.test.mjs` → 1224 tests / 1211 pass / 13 fail. The 13 failures are: 4 expected 31-03 RED (cacheKey x2, telemetry, HLTH-01), `graphifyQuery: returns <= k symbols` + 5 `router inspect` tests (confirmed PRE-EXISTING — they fail identically with the pre-change committed snapshot), and 3 flaky file-level/subtest failures (`installer-coexistence` file-level, `fresh installs declare...dual-runtime` x2) that appear/disappear between full-suite runs independent of this plan's changes.

## Task 3 — runtime/epoch threading site for 31-03 (documented, no change made)

`telemetryRecordToEvidence` lives in `src/evolution/telemetry-bridge.mjs` (lines 53-77), imported at `src/registry/watcher.mjs:23` and invoked at `src/registry/watcher.mjs:114` inside `ingestTelemetryEvidence`. It **explicitly maps** the hook's raw telemetry record into a fresh `envelope` (lines 63-75: timestamp_ms, route_id, confidence_band, guard_codes, reason_code, fixture_class, latency_us, candidate_version, policy_version, verdict, prompt_signature) and then defers to `validateEvidenceEnvelope` (`src/evolution/evidence.mjs:34`), which allowlists against `FIELDS` (`evidence.mjs:6-10`, currently 11 fields). Because the bridge maps fields explicitly, a `runtime`/`epoch` tag added to the hook's telemetry record in 31-03 would currently be **dropped** before validation.

**Exact 31-03 wiring points:**
1. `src/evolution/telemetry-bridge.mjs` — `telemetryRecordToEvidence` envelope construction (lines 63-75): add `runtime: record.runtime` and `epoch: record.epoch` forwarding so the runtime tag appears in evidence.
2. `src/evolution/evidence.mjs` — `FIELDS` allowlist (lines 6-10): bump 11 → 13 (`+runtime`, `+epoch`) so `validateEvidenceEnvelope` does not reject with `forbidden_evidence_field`.
3. `src/health/outcome-schema.mjs` — `OUTCOME_FIELDS` (lines 33-38): bump 14 → 16 (`+runtime`, `+epoch`) to satisfy the 31-01 enforcement test (the documented 31-03 bump target; the health-observer path is separate from the evidence bridge).

No `src/registry/watcher.mjs` change is required for the tag to flow — once the bridge forwards `runtime`, `ingestTelemetryEvidence` carries it into evidence automatically.

## Deviations from Plan

1. **[Rule 4-relevant — concurrency collision, surfaced not auto-fixed] A concurrent executor of the same plan is running on this shared working tree.** During this executor's session, two commits it did not create appeared in `git log`: `cf95efb feat(31-02): runtime detection + runtime-conditional dir resolution` (Task 1) and `8d55c9e feat(31-02): runtime-aware build-manifest home derivation` (Task 2). These commits contain byte-identical content to the plan's Task 1/Task 2 requirements and were independently verified GREEN here (detection group + mirror guard + fresh-onboarding + codex probe all pass). This executor's own Task 1 staging found HEAD already matched its edits (commit no-op), and its Task 2 staging raced the concurrent commit (no-op). The concurrent executor had not yet written `31-02-SUMMARY.md` at write time. Orchestrator should reconcile the two executors; this SUMMARY documents the shared result. No rollback was performed (both commits are correct and GREEN).
2. **Pre-existing failures documented (out of scope, NOT fixed).** `graphifyQuery: returns <= k symbols` and 5 `router inspect` tests fail identically with the pre-change committed snapshot (confirmed by reverting `tests/router.mjs.snapshot` + live hook to `HEAD` and re-running). These are not caused by this plan and were left untouched per the scope boundary. Full-suite runs also show flaky file-level failures (`installer-coexistence`, `fresh-onboarding` in combination, `phase26-performance`) that appear/disappear between runs independent of this plan's changes.

## Issues Encountered

- **Concurrent-executor collision (see Deviations 1).** Root cause not diagnosed here; the working tree received external commits mid-session. Managed by verifying all on-disk/committed work matches the plan and is GREEN rather than redoing or reverting it.
- Full-suite run-to-run variance in a handful of installer/perf file-level tests — pre-existing, not introduced by this plan.

## User Setup Required

None — no external service configuration. The live hook `~/.claude/hooks/router.mjs` was verified byte-identical to `tests/router.mjs.snapshot` after the lockstep edit (mirror invariant holds).

## Next Phase Readiness

- **31-03** (cache/telemetry/schema) has a concrete failing target for every remaining RED assertion: the cacheKey 7th `runtime` slot (D-05), `telemetryEntryFromState().runtime` export + field (D-06), and the 14→16 OUTCOME_FIELDS bump (schema + enforcement test in the same change). The precise runtime/epoch threading site through `telemetryRecordToEvidence` → `evidence.mjs FIELDS` → `OUTCOME_FIELDS` is documented above.
- **PARITY-01 satisfied** (deterministic runtime detection, enum-clamped, fail-open, zero hot-path IO). **PARITY-02 partially satisfied** (per-runtime path isolation via the single runtime-conditional root); the cache-key and telemetry tagging halves complete in 31-03.
- **D-07/D-08 resolve-layer behavior explicitly deferred to Phase 32** (resolve-first capability-resolution hot path absent until PARITY-03/04 ship) — referenced, not dropped.

## Self-Check: PASSED

Verified on disk:
- `tests/router.mjs.snapshot` contains `detectRuntime()`, `export const RUNTIME`, `export const RUNTIME_CONFIG_DIR`; no `join(homedir(), '.claude')` hardcode remains in the constant block.
- `~/.claude/hooks/router.mjs` is byte-identical to the snapshot (`cmp` + mirror guard test GREEN).
- `build-manifest.mjs` contains the `ROUTER_RUNTIME`/`ROUTER_CODEX_HOME`/`CONFIG_HOME` runtime pin and matches `HEAD`.
- Commits `cf95efb` (Task 1) and `8d55c9e` (Task 2) present in `git log`.
- Targeted runs: detection group GREEN (5/5), mirror guard GREEN, fresh-onboarding GREEN (1/1), registry GREEN (39/39), outcome-schema 14 pass / 1 expected-RED.
- `.planning/phases/31-runtime-tagging/31-02-SUMMARY.md` written and committed.

---
*Phase: 31-runtime-tagging*
*Completed: 2026-08-01*
