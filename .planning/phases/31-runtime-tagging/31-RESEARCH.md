<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Detect the active runtime deterministically with zero hot-path IO by reading a runtime marker already present in the process/env at module load, cached once into a module-level constant. Inspect `process.env` for a Codex-specific marker (e.g. `CODEX_HOME` / a Codex-typed `CLAUDE_CODE_ENTRYPOINT`-style env var) and default to `claude` when absent. Detection runs once at module load, not per prompt. Fall back to `claude` only when the marker is unambiguous; if both/no markers are ambiguous, prefer `claude` and fail open.
- **D-02:** Match the phase-26 test-harness convention: runtime is a string `"claude" | "codex"`, and the dual-runtime test builds separate `.claude`/`.codex` profile roots. Production detection returns the same string values so tests assert on parity.
- **D-03:** Replace the hardcoded `RUNTIME_CONFIG_DIR = join(homedir(), '.claude')` with a runtime-conditional resolution: `codex` → `~/.codex`, `claude` → `~/.claude`, resolved once at module load into the same `RUNTIME_CONFIG_DIR` constant. Everything downstream (ROUTER_DIR, HOOKS_DIR, telemetry path, cache path) keeps deriving from this one constant, so tagging the dir isolates data files per runtime. **Reversibility: costly — change surface is one assignment plus its consumers.**
- **D-04:** Runtime resolution must be overridable for tests and correct deployment: allow an explicit override (env, e.g. `ROUTER_RUNTIME`) that wins over autodetection, so the install stage can pin the runtime and tests can force either side deterministically. **Reversibility: reversible.**
- **D-05:** Fold the runtime tag into the cache key deterministically so Claude and Codex never share stale routes: append the runtime to the existing composite key (next to the Phase-30 `manifest_fingerprint` epoch slot). Cache entries and the LRU key include runtime as part of the key identity, not just metadata. **Reversibility: costly — changes key composition, invalidating any pre-existing caches (intended).**
- **D-06:** Add a `runtime` field to every telemetry record (schema extension appended to the existing record). Telemetry stays append-only JSONL; the `runtime` field enables shadow-log correlation and per-install calibration without touching existing field consumers. **Reversibility: reversible — additive field; existing named-field parsers unaffected.**
- **D-07:** Resolve evaluation must consider only the active runtime's present capabilities (cache + telemetry already runtime-scoped; additionally, capability resolution and mode-map recommendation must not pull capabilities that exist only under the other runtime). Only the active runtime's suggestion is injected into `additionalContext`. **Reversibility: reversible.**
- **D-08:** A `codex` runtime maps capabilities to their local equivalent form (cross-runtime fixture): the canonical registry entry carries a known runtime-scoped equivalent so a capability present in one runtime resolves locally in the other. Phase 26 already establishes provenance per runtime — reuse that shape. Primarily a resolve-layer behavior + a test fixture, not a second full agent inventory. **Reversibility: costly — touches the resolve layer and canonical registry entry shape; keep the fixture minimal and test-scoped.**

### Claude's Discretion
- Exact env-marker name and precedence (D-01/D-04) — pick the marker that is already reliably present in each runtime's process env; verify against the existing hooks. If no reliable Codex marker is available at module load, prefer the `ROUTER_RUNTIME` override + default-to-claude, and document the limitation.
- Exact placement of `runtime` in the cache key tuple and the telemetry record field order — keep consistent and documented.

### Deferred Ideas (OUT OF SCOPE)
- Full `build-manifest.mjs` Codex walk (`~/.codex` inventory completeness) — already deferred by REQUIREMENTS.md line 73 note (`.codex` not in use; parity ships runtime-tagged shared telemetry + presence via canonical registry runtime variants). Phase 31 ships detection + tagging; the full Codex inventory build is out of scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PARITY-01 | Router detects its active runtime (Claude vs Codex) deterministically with zero IO on the hot path | D-01/D-02/D-04: module-load detection into a constant; `ROUTER_RUNTIME` override; fail-open to `claude`. Detection cost is one-time, off hot path. |
| PARITY-02 | Telemetry and cache records carry a runtime tag; no cross-runtime cache reuse | D-05 (cache key identity slot) + D-06 (telemetry field). Runtime folds into BOTH cache key (isolation) and telemetry record (correlation) as distinct mechanisms. |
| PARITY-03 | Resolve evaluation uses only the active runtime's present capabilities; only the active runtime's suggestion is injected | **Deferred to Phase 32** (needs the resolve-first hot path that does not exist until Phase 32). Phase 31 lays the foundation (RUNTIME_CONFIG_DIR per-runtime isolation + runtime tag on cache/telemetry). See Scope Boundary below. |
| PARITY-04 | A capability present in one runtime resolves to its local equivalent in the other (cross-runtime fixture) | **Deferred to Phase 32**; Phase 31 keeps the fixture minimal + test-scoped (reuse `provenance: [{ runtime }]` from phase-26 harness). See Scope Boundary below. |
</phase_requirements>

# Phase 31: Runtime Tagging - Research

**Researched:** 2026-08-01
**Domain:** Runtime detection (Claude vs Codex) + per-runtime data isolation in a stdlib-only Node ESM hook
**Confidence:** HIGH

## Summary

Phase 31 makes the router know which runtime (Claude vs Codex) it runs in, determined ONCE at module load into a module-level constant, and folds that runtime into the cache key (identity — cache isolation) and the telemetry record (field — shadow-log/calibration correlation). This fixes the hardcoded `RUNTIME_CONFIG_DIR = join(homedir(), '.claude')` gap (router.mjs.snapshot:104) and prevents a Codex session from being served a Claude-derived cache route.

Key verified correction to the roadmap's claim: **not everything today derives from `RUNTIME_CONFIG_DIR`.** `ROUTER_DIR` (snapshot:75) and `HOOKS_DIR` (snapshot:90) each call `join(homedir(), '.claude', ...)` directly, NOT through `RUNTIME_CONFIG_DIR`. Only `SURFACE_FILE` (:105) and `GSD_CORE_DIR` (:106) derive from `RUNTIME_CONFIG_DIR`. So D-03's "single constant → all paths derive" is true only if the plan ALSO rewires `ROUTER_DIR`, `HOOKS_DIR` (and the constants built from `ROUTER_DIR`: `MANIFEST`, `BUILD_SCRIPT`, `COVERAGE_REPORT`, `CACHE`, `TELEMETRY`, `MODE_MAP`, `WEIGHTS`, `CALIBRATION_PATH`, `EVOLUTION_STATE`, `TRIGGER`) to derive from a runtime-conditional base. Otherwise the data files stay under `~/.claude` even in a Codex session and the cache-isolation goal fails.

**Scope boundary for D-07/D-08 (recommended):** PARITY-03 and PARITY-04 are mapped to Phase 32 in REQUIREMENTS.md (traceability table) and their behavior (resolve-first capability resolution, mode-map resolve lists) does not exist until Phase 32. Phase 31 should therefore **implement PARITY-01 + PARITY-02 fully**, and **explicitly defer D-07/D-08's resolve-layer behavior to Phase 32** while shipping the per-runtime *foundation* they build on (runtime-conditional dirs + runtime tag on cache/telemetry). D-08's cross-runtime fixture is kept minimal and test-scoped per CONTEXT D-08. The planner should mark D-07/D-08 as "deferred to Phase 32 with rationale" rather than silently unmapped.

**Primary recommendation:** Introduce a single `detectRuntime()` that returns `"claude" | "codex"` (precedence: `process.env.ROUTER_RUNTIME` → codex env/argv markers → default `claude`), resolved once at module load into `const RUNTIME = detectRuntime()`. Derive a runtime-conditional base dir from it and rewire `ROUTER_DIR`, `HOOKS_DIR`, `RUNTIME_CONFIG_DIR` (and all children) to flow through it. Fold `RUNTIME` into `cacheKey()` (identity) and into `telemetryEntryFromState()` (field), and bump the `OUTCOME_FIELDS` policy-version + its enforcement test for the `runtime`/`epoch` fields that the watcher ingest will carry.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Runtime detection (Claude vs Codex) | Frontend Server (hook) | — | The hook is the only layer with the process env/argv in scope; detection is a module-load concern, not per-request. |
| Per-runtime config-dir resolution | Frontend Server (hook) | Database / Storage | The hook resolves paths once; the storage layer (cache.json / telemetry.jsonl) is written by the hook under that dir. |
| Cache-key isolation | API / Backend (hook logic) | Database / Storage | cacheKey is a pure function inside the hook; the runtime tag is part of key identity so the cache store never mixes runtimes. |
| Telemetry runtime tagging | API / Backend | Database / Storage | Telemetry writer (`logTelemetry`) appends records; runtime field enables downstream per-runtime correlation. |
| OUTCOME_FIELDS policy bump | Database / Storage (evidence schema) | — | `src/health/outcome-schema.mjs` is the frozen evidence allowlist; adding `runtime`/`epoch` is a schema-level policy-version bump. |
| Capability resolution per runtime (PARITY-03/04) | API / Backend (resolve layer) | — | **Phase 32** concern — the resolve-first hot path does not exist yet. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js stdlib only (`node:path`, `node:os`, `node:crypto`, `node:fs`) | Node ≥18 (verified v22.22.3 on this machine) | Runtime detection, path resolution, cache key hashing, telemetry write | Project hard constraint: no npm deps, single `.mjs`. `homedir()` from `node:os`; `join()` from `node:path`; `createHash` from `node:crypto`; `appendFileSync`/`chmodSync`/`existsSync`/`renameSync` from `node:fs`. |
| `node:test` (`import test from 'node:test'`) | Node built-in | Test runner | All existing `tests/*.test.mjs` use it; run via `rtk node --test tests/*.test.mjs` (config.json `test_command`). |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `rtk` runner (wrapper) | 0.43.0 (`~/.local/bin/rtk`) | Invokes the node test runner with isolation | Always — it is the configured test_command quasi-shell (config.json:53). |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `process.argv[1]` + env markers for detection | Spawning a shell / reading files on the hot path | Rejected — any per-call IO violates the <100ms + zero-hot-path-IO constraint. Module-load env/argv reads are free. |
| Single hardcoded `.claude` dir | Dynamic per-runtime dir | Rejected by D-03 — hardcoded dir is the exact gap being fixed; without it Codex cannot isolate cache/telemetry. |

**Installation:** None. Zero dependencies. All changes are edits to `tests/router.mjs.snapshot` (mirrored to `~/.claude/hooks/router.mjs`), `src/health/outcome-schema.mjs`, and `tests/router.health.outcome-schema.test.mjs`. No registry verification needed (no new packages introduced).

## Package Legitimacy Audit

> No external packages are installed by this phase. All work uses the Node.js stdlib already in the project. This audit is therefore N/A — no packages to verify, no SLOP/SUS dispositions.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                     ┌─────────────────────────────────────────────┐
                     │  ~/.claude/hooks/router.mjs  (== snapshot) │
   UserPromptSubmit  │                                             │
  ────────────────►  │  MODULE LOAD (once, off hot path):          │
   (prompt + stdin)  │     detectRuntime() -> "claude"|"codex"     │
                     │       precedence: ROUTER_RUNTIME env        │
                     │        → codex env/argv marker              │
                     │        → default "claude" (fail-open)       │
                     │     RUNTIME_CONFIG_DIR = ~/.<runtime>       │
                     │       → ROUTER_DIR, HOOKS_DIR, CACHE,       │
                     │         TELEMETRY, MANIFEST, ...            │
                     └───────────────┬─────────────────────────────┘
                                     │ hot path (per prompt, ~15-20ms)
                                     ▼
                     cacheKey(np, ik, fingerprint, ...hashes, RUNTIME)
                          │  identity now includes runtime ◄────── no cross-runtime reuse
                          ▼
                     telemetryEntryFromState(state, startNs, RUNTIME)
                          │  record includes runtime field
                          ▼
                     ~/.<runtime>/router/telemetry.jsonl  (append-only, 0600)
                          │
                          ▼  (off-hot-path watcher ingest)
                     ingestTelemetryEvidence -> telemetryRecordToEvidence
                          └─ OUTCOME_FIELDS (bumped 14→16: +runtime, +epoch)
                             validateOutcomeEnvelope (allowlist, policy_version bump)
```

### Recommended Project Structure (no new files — edits only)
```
tests/router.mjs.snapshot                      # canonical hook source (mirror of ~/.claude/hooks/router.mjs)
tests/router.phase26-dual-runtime.test.mjs     # reuse: dual-runtime harness + provenance[{runtime}]
src/health/outcome-schema.mjs                  # OUTCOME_FIELDS policy bump
tests/router.health.outcome-schema.test.mjs    # enforcement test size 14→16
build-manifest.mjs                             # install stage (ROUTER_HOOK_PATH) pins RUNTIME via ROUTER_RUNTIME
```

### Pattern 1: Single-Source Runtime Constant (detect once, derive everywhere)
**What:** A module-level `const RUNTIME = detectRuntime()` and `const RUNTIME_CONFIG_DIR = join(homedir(), runtimeBase(RUNTIME))` resolved once at module load. Every data path derives from these constants.
**When to use:** Per-runtime isolation of cache/telemetry; deterministic, zero hot-path IO.
**Example (detection precedence):** `ROUTER_RUNTIME` env wins → codex marker env/argv present → `"codex"` → else `"claude"`. All reads are `process.env`/`process.argv` string checks at module load — no IO, no per-call branching. Fail-open: wrap the detector in try/catch, return `"claude"` on any throw.

### Pattern 2: Runtime as Key Identity (D-05)
**What:** Fold runtime into `cacheKey()` as a sibling slot next to the manifest_fingerprint epoch, so keys are unique per runtime. See Code Examples below for the exact current signature and the flow call site.

### Pattern 3: Deliberate OUTCOME_FIELDS policy bump (D-06 consumer)
**What:** The evidence allowlist is frozen (`Object.freeze(new Set(...))`, outcome-schema.mjs:33-38) and enforce-tested to size 14. Adding `runtime` (and `epoch` per ROADMAP criterion 3) requires a deliberate bump: extend the set AND update the enforcement test at tests/router.health.outcome-schema.test.mjs:68-74 (`assert.equal(OUTCOME_FIELDS.size, 14)` → 16, and add both fields to the membership loop). Never a silent schema add — any forked field accepted without the test update fails the suite.

### Anti-Patterns to Avoid
- **Adding `runtime` to the cache key as metadata only (route object) instead of key identity:** Metadata does not partition the LRU — a Codex session can still hash-hit a Claude key. Runtime MUST be in the hashed input tuple (D-05).
- **Per-call runtime re-detection:** Any `process.env`/`process.argv` read or `existsSync` per prompt violates the zero-hot-path-IO constraint. Resolve once into a constant.
- **Silent OUTCOME_FIELDS add:** Adding `runtime`/`epoch` without bumping `policy_version` and without updating the 14-field enforcement test = the suite goes RED (the test asserts size 14). This is the ROADMAP's explicit "never a silent schema add."
- **Forgetting the lockstep mirror:** Editing `tests/router.mjs.snapshot` without `~/.claude/hooks/router.mjs` (or vice versa) desyncs byte-identical mirrors. Both MUST be updated in the same commit.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Runtime detection heuristic | Custom ambiguous string/scoring | Deterministic `ROUTER_RUNTIME` env → codex marker → default `claude` (D-01/D-04) | Determinism + fail-open are locked decisions; any ambiguous heuristic risks mis-routing between runtimes. |
| Cache-key hashing | Custom hash | Existing `createHash('sha256')` composite in `cacheKey()` (snapshot:1692-1700) | Already stdlib, sub-ms, deterministic; only need to append a runtime slot. |
| Evidence schema validation | New validator | Existing frozen `validateOutcomeEnvelope` + `OUTCOME_FIELDS` (outcome-schema.mjs) | The 14-field allowlist IS the persistence contract; extend it deliberately, don't fork a parallel schema. |

**Key insight:** This phase is about *wiring a single runtime value through existing, already-stdlib mechanisms* — no new algorithm deserves a custom implementation. The hard parts are the rewire surface (ROUTER_DIR/HOOKS_DIR currently bypass RUNTIME_CONFIG_DIR) and the schema bump discipline.

## Common Pitfalls

### Pitfall 1: ROUTER_DIR / HOOKS_DIR bypass RUNTIME_CONFIG_DIR, so the runtime switch doesn't actually isolate data
**What goes wrong:** D-03 changes only `RUNTIME_CONFIG_DIR`, but `ROUTER_DIR` (snapshot:75) and `HOOKS_DIR` (snapshot:90) each hardcode `join(homedir(), '.claude', ...)` directly. A Codex session keeps writing cache/telemetry under `~/.claude/router` → no isolation, cross-runtime reuse persists.
**Why it happens:** The roadmap assumes all paths derive from the single constant; they do not today.
**How to avoid:** In the plan, introduce a runtime-conditional base (e.g. `const RUNTIME_CONFIG_DIR = join(homedir(), runtimeBase(RUNTIME))`) and change `ROUTER_DIR = join(RUNTIME_CONFIG_DIR, 'router')` and `HOOKS_DIR = join(RUNTIME_CONFIG_DIR, 'hooks')` plus every child constant derived from `ROUTER_DIR`.
**Warning signs:** A Codex test asserting its cache path under `~/.codex/router` fails because the path is still `~/.claude/router`.

### Pitfall 2: OUTCOME_FIELDS size assertion goes RED on the bump
**What goes wrong:** Adding `runtime`/`epoch` to the frozen allowlist without updating the enforcement test (router.health.outcome-schema.test.mjs:68-74 asserts size 14) makes the suite fail.
**Why it happens:** The test is a locked guardrail enforcing the frozen schema.
**How to avoid:** Bump the set AND update size + membership assertion in the SAME change; add policy_version value bump.
**Warning signs:** `router.health.outcome-schema` test reports size mismatch.

### Pitfall 3: Cache-key runtime fold omitted → cross-runtime cache reuse
**What goes wrong:** If runtime is only added to the telemetry record but not to `cacheKey` input, a Codex session hash-hits a Claude-derived route (the exact PARITY-02 bug).
**Why it happens:** Telemetry tagging (D-06) is additive/easy; key folding (D-05) is easy to forget because cache keys are opaque hashes.
**How to avoid:** Add runtime as a named param to `cacheKey` and append it to the `parts` array; assert in a test that identical prompt+manifest under two runtimes yield different `cacheKey` values.
**Warning signs:** Two simulated runtimes with same prompt+manifest produce the same `cacheKey` hash.

### Pitfall 4: Byte-identical mirror desync (snapshot ↔ live hook)
**What goes wrong:** Editing only `tests/router.mjs.snapshot` or only `~/.claude/hooks/router.mjs` breaks the lockstep invariant.
**Why it happens:** Two copies of the same file; easy to update one.
**How to avoid:** Both files in the same atomic commit; a diff check between them is a cheap verification step.
**Warning signs:** `diff tests/router.mjs.snapshot ~/.claude/hooks/router.mjs` is non-empty.

## Code Examples

Verified patterns from the current source (all line numbers from `tests/router.mjs.snapshot`):

### Current cacheKey() to extend (D-05) — [VERIFIED: tests/router.mjs.snapshot:1692-1700]
```javascript
export function cacheKey(normalizedPrompt, intentKeywords, manifestFingerprint = '0',
  modeMapHash = '', weightsHash = '', graphHash = '') {
  const np = String(normalizedPrompt || '');
  const ik = Array.isArray(intentKeywords) ? intentKeywords.join(' ') : String(intentKeywords || '');
  const parts = [np, ik, manifestFingerprint];
  const live = [modeMapHash, weightsHash, graphHash].filter(Boolean).join('|');
  if (live) parts.push(live);
  return createHash('sha256').update(parts.join('|')).digest('hex');
}
```
Runtime should become a sibling slot, e.g. a `runtime` param appended to `parts` (before `live`), so the tuple is `[np, ik, manifestFingerprint, runtime, live]`. Same-prompt, same-manifest, different-runtime → different key. Call site (snapshot:2788): `const sig = cacheKey(state.normalizedPrompt, [], manifestFingerprint, modeMapHash, weightsHash, graphHash)`.

### Current RUNTIME_CONFIG_DIR + constants that MUST be runtime-conditional — [VERIFIED: tests/router.mjs.snapshot:74-106]
```javascript
const ROUTER_DIR = join(homedir(), '.claude', 'router');   // :75 — ln 75 bypasses RUNTIME_CONFIG_DIR
const HOOKS_DIR = join(homedir(), '.claude', 'hooks');     // :90 — bypasses RUNTIME_CONFIG_DIR
const RUNTIME_CONFIG_DIR = join(homedir(), '.claude');     // :104 — the gap
const SURFACE_FILE = join(RUNTIME_CONFIG_DIR, '.gsd-surface.json');
const GSD_CORE_DIR = join(RUNTIME_CONFIG_DIR, 'gsd-core', 'bin', 'lib');
```
`ROUTER_DIR` children to rewire: `MANIFEST`, `BUILD_SCRIPT`, `COVERAGE_REPORT`, `CACHE`, `TELEMETRY`, `MODE_MAP`, `WEIGHTS`, `CALIBRATION_PATH`, `EVOLUTION_STATE`, `TRIGGER` (snapshot:76-89).

### Current telemetry record (add `runtime`) — [VERIFIED: tests/router.mjs.snapshot:2554-2585]
`telemetryEntryFromState(decision, startNs)` returns an object with `ts`, `prompt_signature`, `suggested_mode`, `suggested_skills`, `suggested_agents`, `confidence_tier`, `invoke_kind`, `graphify_queried`, `graph_status`, `guards_fired`, `downstream_invocations`, `outcome`, `latency_ms`, `weight_applied`, `outcomes`, `evolved_after`, `surface_status`, `surface_disabled_count`, `cwd`, `routing_version`. The `runtime` field is additive to this object (D-06) — existing named-field readers unaffected.

### OUTCOME_FIELDS frozen allowlist (14 fields) to bump — [VERIFIED: src/health/outcome-schema.mjs:33-38]
```javascript
export const OUTCOME_FIELDS = Object.freeze(new Set([
  'timestamp_ms', 'capability_id', 'outcome_kind', 'prompt_signature',
  'route_id', 'confidence_band', 'guard_codes', 'reason_code',
  'evidence_window_ms', 'sample_size', 'opportunity_count', 'freshness',
  'policy_version', 'fingerprint',
]));
```
Enforcement: `tests/router.health.outcome-schema.test.mjs:68-74` asserts `Object.isFrozen(OUTCOME_FIELDS)` and `assert.equal(OUTCOME_FIELDS.size, 14)` plus membership over the 14 fields. The bump (add `runtime`, `epoch`) MUST update both size and the membership loop in the same change.

### isMain() already reads process.argv[1] (reuse pattern) — [VERIFIED: tests/router.mjs.snapshot:54-57]
```javascript
const isMain = () => {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href
      || process.argv[1]?.endsWith('/router.mjs');
  } catch {
    return false;
  }
};
```
`process.argv[1]` is already trusted at module load — the runtime detector can extend this same argv/env surface (no new IO).

### Dual-runtime harness + provenance shape to reuse (D-08 fixture) — [VERIFIED: tests/router.phase26-dual-runtime.test.mjs:14-25, 120]
Phase 26 builds separate `.claude`/`.codex` profile roots and uses `provenance: [{ runtime: profile }]` on registry records (`profile` ∈ `['claude','codex','combined']`, PROFILES at :10). The PARITY-04 cross-runtime fixture reuses this exact shape.

### install stage runtime pin (D-04) — [VERIFIED: build-manifest.mjs:49]
```javascript
const ROUTER_HOOK_PATH = process.env.ROUTER_HOOK_PATH || join(HOME, '.claude', 'hooks', 'router.mjs');
```
`HOME = homedir()` and `CLAUDE = process.env.ROUTER_CLAUDE_HOME || join(HOME, '.claude')` (:31-33) are env-overridable — the install stage can pin runtime via `ROUTER_RUNTIME` and a codex home override.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Prompts hashed by mtime-fold cache key | Content-sha256 `manifest_fingerprint` epoch in cache key | Phase 30 (shipped) | Runtime now rides as a sibling slot next to this already-stable epoch identity. |
| Client/Codex share one cache + telemetry | Runtime-partitioned cache + runtime-tagged telemetry | Phase 31 (this phase) | No cross-runtime stale-route reuse; per-runtime shadow-log correlation possible. |

**Deprecated/outdated:**
- Hardcoded `RUNTIME_CONFIG_DIR = join(homedir(), '.claude')`: replaced by runtime-conditional resolution — the explicit gap this phase fixes.

## Assumptions Log

> All claims tagged `[ASSUMED]` in this research. The planner and discuss-phase use this to identify decisions needing user confirmation.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A reliable Codex-typed marker (`CODEX_HOME` or an argv path containing `.codex/`) is present at module load in a real Codex session. | Runtime detection | If neither env nor argv reliably distinguishes runtimes, detection defaults to `claude` and Codex tagging must rely on the `ROUTER_RUNTIME` override at install (D-04) — documented limitation per Claude's Discretion. |
| A2 | The watcher `telemetryRecordToEvidence` (src/registry/watcher.mjs:114) enforces `OUTCOME_FIELDS` via `validateOutcomeEnvelope`, so the hook's `runtime` field must be added to the allowlist for it to survive ingest. | OUTCOME_FIELDS bump | If the ingest forward-maps fields instead of allowlisting the hook's raw record, the allowlist bump may be less binding — but ROADMAP criterion 3 explicitly demands the deliberate bump, so the change is required regardless. |
| A3 | `epoch` (ROADMAP criterion 3) refers to the `manifest_fingerprint` epoch already present; the bump adds a `runtime` field and keeps/relabels the epoch field. | OUTCOME_FIELDS bump | Mis-naming could double-count the epoch field; verify against ingest expectations during implementation. |

## Open Questions (RESOLVED)

1. **What is the exact reliable Codex marker at module load (A1)?**
   - What we know: `ROUTER_RUNTIME` override (D-04) is the deterministic fallback; `process.argv[1]` path / env are the candidates; `claude` is the verified dominant runtime (fail-open default).
   - What's unclear: whether a real Codex process exposes a stable env var (e.g. `CODEX_HOME`) or a `.codex/` argv path at module load.
   - Recommendation: Detect via `ROUTER_RUNTIME` env → `process.env.CODEX_HOME` presence → `process.argv[1]` containing `.codex/` → default `claude`. Verify against the live `~/.claude/hooks/*` conventions during implementation; this is Claude's Discretion.
   - **RESOLVED (31-02 Task 1):** `detectRuntime()` implements exactly this precedence chain (ROUTER_RUNTIME → CODEX_HOME → argv `.codex/` → default `claude`), enum-clamped and fail-open per D-01/D-02/D-04; the 31-01 detection test group verifies it.

2. **Does the watcher ingest forward-map or allowlist raw hook telemetry (A2)?**
   - What we know: `ingestTelemetryEvidence` reads raw lines and calls `telemetryRecordToEvidence` → `store.append`.
   - What's unclear: the exact field mapping between the hook's `telemetryEntryFromState` record and the evidence `OUTCOME_FIELDS` schema.
   - Recommendation: Read `telemetryRecordToEvidence` during implementation to place the bump precisely; keep the OUTCOME_FIELDS policy-version bump mandatory either way (ROADMAP criterion 3).
   - **RESOLVED (31-02 Task 3 + 31-03 Task 3):** the exact `telemetryRecordToEvidence` mapping/allowlist site is inspected and documented in 31-02; the runtime/epoch fields land in `OUTCOME_FIELDS` (14→16) with the policy-version bump wired through the watcher in 31-03.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Test runner + hook runtime | ✓ | v22.22.3 | — |
| `rtk` runner | `node --test tests/*.test.mjs` wrapper | ✓ | 0.43.0 (`~/.local/bin/rtk`) | `node --test tests/*.test.mjs` directly |
| `grep`/`diff` | Mirror-sync verification | ✓ | macOS | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

## Validation Architecture

> nyquist_validation is enabled (config.json `workflow.nyquist_validation: true`), so the plan-phase will derive VALIDATION.md from this section.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node built-in `node:test` (`import test from 'node:test'`) |
| Config file | none — `node --test` auto-discovers `tests/*.test.mjs` |
| Quick run command | `rtk node --test tests/router.health.outcome-schema.test.mjs tests/router.mjs.snapshot.diff.test.mjs 2>/dev/null || rtk node --test tests/*.test.mjs` (targeted) |
| Full suite command | `rtk node --test tests/*.test.mjs` (config.json:53 `test_command`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PARITY-01 | Runtime detected deterministically once at module load; `ROUTER_RUNTIME` override; fail-open to `claude`; zero hot-path IO | unit | `rtk node --test tests/router.phase26-dual-runtime.test.mjs` (+ new detection spec) | New spec — ❌ Wave 0 |
| PARITY-02 (cache) | Same prompt+manifest under `claude` vs `codex` → distinct `cacheKey` | unit | `rtk node --test tests/router.cache.test.mjs` (extend) | Extend existing |
| PARITY-02 (telemetry) | Telemetry record carries correct `runtime`; lines append to per-runtime path | unit | extend `tests/router.cache.test.mjs` / new runtime spec | New/extend |
| PARITY-02 (OUTCOME bump) | `OUTCOME_FIELDS.size === 16`; `runtime`/`epoch` in membership; frozen | unit | `rtk node --test tests/router.health.outcome-schema.test.mjs` | Update :68-74 |
| PARITY-03/04 (deferred) | Per-runtime resolve behavior — **Phase 32**, minimal fixture only | (deferred) | — | n/a |

### Sampling Rate
- **Per task commit:** `rtk node --test tests/router.health.outcome-schema.test.mjs tests/router.cache.test.mjs` + new runtime spec (targeted quick run).
- **Per wave merge:** `rtk node --test tests/*.test.mjs` (full suite).
- **Phase gate:** Full suite green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] New spec file (e.g. `tests/router.runtime-tagging.test.mjs`) — runtime detection precedence + cache-key divergence + telemetry runtime field + mirror-desync check.
- [ ] Update `tests/router.health.outcome-schema.test.mjs` (size 14 → 16, add `runtime`/`epoch` to membership loop) — this is the enforcement test that must change WITH the schema bump.
- [ ] (Extend) `tests/router.cache.test.mjs` — cross-runtime cacheKey divergence assertion.

## Security Domain

> security_enforcement is enabled (config.json `security_enforcement: true`, ASVS level 1).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — router has no auth; fail-open prompt pass-through |
| V3 Session Management | no | — no sessions; module-load runtime constant |
| V4 Access Control | no | — single-user local framework; no role model |
| V5 Input Validation | yes | Runtime value is validated to a closed enum (`"claude" | "codex"`) at the detection boundary; never trust raw env beyond that allowlist |
| V6 Cryptography | yes | `node:crypto` sha256 for cache keys + prompt signatures — never hand-rolled |

### Known Threat Patterns for {stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Env/argv tampering causing mis-detection | Spoofing | `ROUTER_RUNTIME` + detection clamped to the `"claude"|"codex"` enum; any other/ambiguous value → default `claude` (fail-open), never an unbounded string flowing to paths |
| Path traversal via runtime-derived dir | Tampering | Dir derived from `os.homedir()` + a fixed runtime base (`.claude`/`.codex`) — runtime value is enum-clamped, so the path segment can never be attacker-controlled |
| Raw prompt leakage in telemetry | Information Disclosure | Existing `promptSignature` (sha256 of redacted prompt, snapshot:1794-1798); telemetry stays append-only JSONL, 0600 perms via `logTelemetry` (snapshot:1806-1817); no raw prompt text |

## Sources

### Primary (HIGH confidence)
- `tests/router.mjs.snapshot` (read directly) — RUNTIME_CONFIG_DIR:104; ROUTER_DIR:75 / HOOKS_DIR:90 bypass; cacheKey:1692-1700; telemetryEntryFromState:2554-2585; isMain argv:54-61; logTelemetry:1806-1817.
- `src/health/outcome-schema.mjs` (read directly) — OUTCOME_FIELDS:33-38 (14 fields); validateOutcomeEnvelope allowlist enforcement.
- `tests/router.health.outcome-schema.test.mjs` (read directly) — size-14 assertion:68-74.
- `tests/router.phase26-dual-runtime.test.mjs` (read directly) — PROFILES:10; provenance[{runtime}]:120; dual `.claude`/`.codex` roots:14-25.
- `build-manifest.mjs` (read directly) — ROUTER_HOOK_PATH:49; env-overridable CLAUDE/HOME:31-33.
- `src/registry/watcher.mjs` (read directly) — ingestTelemetryEvidence:81-118.
- `.planning/config.json` (read directly) — test_command `rtk node --test tests/*.test.mjs`:53; nyquist_validation true:24; security_enforcement true:46.
- `<environment>` — Node v22.22.3; rtk 0.43.0 at `~/.local/bin/rtk`.

### Secondary (MEDIUM confidence)
- `.planning/ROADMAP.md` Phase 31 + Phase 32 sections (goal, success criteria, code-verified notes) — the locked phase spec.
- `.planning/REQUIREMENTS.md` §PARITY (PARITY-01..04) + traceability table (PARITY-03/04 → Phase 32).

### Tertiary (LOW confidence)
- Exact Codex runtime env marker name (A1) — not verified against a live Codex session; flagged as Claude's Discretion + Open Question 1.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — stdlib-only, zero new packages; verified against snapshot + config.
- Architecture: HIGH — cache key, telemetry, OUTCOME_FIELDS bump, and the ROUTER_DIR/HOOKS_DIR rewire are all directly code-verified.
- Pitfalls: HIGH — pitfall 2 (frozen schema) and 4 (mirror) are code-confirmed; pitfalls 1 (ROUTER_DIR bypass) is a code-confirmed roadmap correction.

**Research date:** 2026-08-01
**Valid until:** 2026-08-31 (stable stdlib; no fast-moving deps)
