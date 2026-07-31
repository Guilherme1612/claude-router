# Phase 27: Mutation Safety Infrastructure - Pattern Map

**Mapped:** 2026-07-29
**Files analyzed:** 7 (3 modified source, 1 new test, 3 extended tests)
**Analogs found:** 7 / 7

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `~/.claude/hooks/router.mjs` (modify: `cacheKey`, `readGraphMtime`-style helper, cache-hit guard, `capRouteRender`, `formatInjection` call site) | hook (hot path) | request-response | `~/.claude/hooks/router.mjs` itself (extend in place) | exact |
| `src/evolution/perf-measure.mjs` (modify: add `assessMutationSafetyRegression`) | utility / perf tooling | batch | `src/evolution/perf-measure.mjs` `assessCalibration` (lines 86-96) | exact |
| `build-manifest.mjs` (modify: add 30KB mode-map size guard) | utility / builder | file-I/O | `build-manifest.mjs` final write block (lines 525-536) | exact |
| `tests/router.mutation-safety.test.mjs` (NEW) | test | unit | `tests/router.cache.test.mjs` | exact |
| `tests/router.cache.test.mjs` (extend) | test | unit | itself | exact |
| `tests/router.perf-calibration.test.mjs` (extend) | test | perf regression | itself + `assessCalibration` test pattern | exact |
| `tests/router.build-manifest.test.mjs` (extend) | test | unit | itself | exact |

> No greenfield files. Every change extends an existing primitive; the new test file mirrors the cache-test harness. The `src/registry/validate.mjs` path is a fallback only — `build-manifest.mjs` already does a `statSync`/size log at write time and is the preferred guard location per RESEARCH Pitfall 5.

## Pattern Assignments

### `~/.claude/hooks/router.mjs` (hook, request-response / hot path)

**Analog:** itself — extend in place. Three surgical edits: (a) add `weightsMtime` 7th param to `cacheKey`, (b) add `routeTargetsExist` predicate factored from `validateRouteTargets`, (c) add `capRouteRender` helper + call it before `formatInjection` on both the cache-hit and fresh-route paths.

**Imports pattern** (lines 67-72, already present — no new imports needed):
```javascript
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
```

**Core pattern — mtime-folded sha256 cache key** (lines 1509-1519, extend with `weightsMtime = 0` trailing default):
```javascript
// Cache key (RTE-07). sha256(normalizedPrompt + "|" + intentKeywords.join(" ")
// + "|" + modeMapMtime + "|" + manifestMtime + "|" + graphMtime + "|" + surfaceMtime
// + "|" + weightsMtime). graphMtime/surfaceMtime/weightsMtime default to 0 to keep
// older callers backward-compatible.
export function cacheKey(normalizedPrompt, intentKeywords, modeMapMtime, manifestMtime, graphMtime = 0, surfaceMtime = 0, weightsMtime = 0) {
  const np = String(normalizedPrompt || '');
  const ik = Array.isArray(intentKeywords) ? intentKeywords.join(' ') : String(intentKeywords || '');
  const joined = [np, ik, modeMapMtime, manifestMtime, graphMtime, surfaceMtime, weightsMtime].join('|');
  return createHash('sha256').update(joined).digest('hex');
}
```

**Best-effort mtime reader — copy this exact shape for `readWeightsMtime`** (lines 1524-1533):
```javascript
function readGraphMtime(cwd) {
  try {
    const dir = (cwd && String(cwd)) || process.cwd();
    const p = join(dir, 'graphify-out', 'graph.json');
    if (!existsSync(p)) return 0;
    return statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}
```
Apply: add `function readWeightsMtime(weightsPath = WEIGHTS_PATH) { try { if (!existsSync(weightsPath)) return 0; return statSync(weightsPath).mtimeMs; } catch { return 0; } }` mirroring `readSurfaceMtime` (lines 1538-1546) — `readSurfaceMtime` is the closest analog because `WEIGHTS_PATH` is a single fixed file like the surface profile, not cwd-dependent like graph.

**Hot-path cache-hit block to guard (SAF-02)** (lines 2547-2562):
```javascript
const cache = loadCache(opts.cachePath);
const cached = cacheLookup(sig, cache);
if (cached) {
  state.tier = cached.tier || 'high';
  state.route = cached;
  state.invoke_kind = cached.invoke_kind;
  state.cache.status = 'hit';
  state.cache.scoring_skipped = true;
  state.cache.cached_route = cached;
  state.passThroughReason = 'cache_hit_scoring_skipped';
  state.decision_trace.push('cache:hit', 'scoring:skipped');
  const routeBlock = formatInjection(cached, prompt, sig.slice(0, 8));
  const graphBlock = state.graphify.symbols.length ? formatGraphBlock(state.graphify.symbols) : '';
  state.finalInjectedContext = composeWithCap(routeBlock, graphBlock);
  return finish();
}
```
Apply: insert `if (cached && !routeTargetsExist(cached, manifest)) { state.cache.status = 'stale_target_recompute'; state.decision_trace.push('cache:stale_target'); /* fall through, do NOT assign state.route */ } else if (cached) { ...existing hit block... }`. Also call `capRouteRender(cached)` before `formatInjection` on the hit path, and `capRouteRender(finalRoute)` on the fresh-route path before its `formatInjection` call.

**Target-resolution predicate — factor from `validateRouteTargets`** (lines 636-697):
```javascript
export function validateRouteTargets(manifest, modeMap, indexes = buildTargetIndexes(manifest)) {
  const rows = [];
  const routeIds = new Set((modeMap?.entries || []).map((entry) => stripLeadingSlash(entry?.id)).filter(Boolean));
  const skills = knownSkillTargets(indexes);
  // ... iterates ALL entries, pushes diagnostic rows per entry ...
  for (const entry of modeMap?.entries || []) {
    // slash kind: indexes.commands.has(mode) || intentionalRouteAlias || intentionalSchemaRoute
    // skills:    skills.has(stripLeadingSlash(target))
    // agents:    !indexes.blockedAgents.has(name) && (warn || indexes.safeAgents.has(name))
  }
  return rows;
}
```
Apply: extract a single-route predicate `routeTargetsExist(route, manifest, indexes = buildTargetIndexes(manifest))` that reuses `buildTargetIndexes`, `knownSkillTargets`, `stripLeadingSlash`, `indexes.commands`, `indexes.safeAgents`, `indexes.blockedAgents` — the SAME sets, no second builder. For an individual route: verify `route.id`/`route.mode` resolves (slash kind), every `recommended_skills` entry is in `skills`, every `recommended_agents` entry is in `safeAgents` (or `blockedAgents` for warn-kind). Return `true` for null/warn/pass-through routes (nothing to verify). Do NOT call `validateRouteTargets` itself on the hot path — it iterates the whole mode-map and builds diagnostic rows (Pitfall 3, Anti-Pattern 1).

**Render cap helper — call before `formatInjection`** (lines 2150-2154 show the priority semantics to preserve):
```javascript
const skills = (route.recommended_skills || []).filter(Boolean);
const agents = (route.recommended_agents || []).filter(Boolean);
const primarySkill = skills[0] || null;
const secondarySkills = skills.slice(1);
```
Apply: add `export function capRouteRender(route) { if (!route) return route; const skills = (route.recommended_skills || []).slice(0, 3); const agents = (route.recommended_agents || []).slice(0, 2); const truncated = (route.recommended_skills?.length > 3) || (route.recommended_agents?.length > 2); return { ...route, recommended_skills: skills, recommended_agents: agents, _render_cap_truncated: truncated || undefined }; }`. The slice preserves author priority (`skills[0]` is primary) — consistent with `formatInjection`'s existing `primarySkill = skills[0]` semantics. Strip `_render_cap_truncated` before injection; log it to telemetry/decision_trace when set.

**`formatInjection` priority drop order** (lines 2157-2202) — leave intact. `capRouteRender` is the first defense (count cap), `composeWithCap`/`TOKEN_CAP` is the second (token cap). Two layers, each simple.

**Error / fail-open pattern**: Router wraps the whole hot path in try/catch and passes through the original prompt unchanged on any exception (CLAUDE.md "Fail-open"). The new guards must NOT throw — `routeTargetsExist` returns `true` on any internal error (fail-open to recompute-or-serve, never block), and `capRouteRender` is pure arithmetic on arrays. `readWeightsMtime` follows the `readGraphMtime` `try/catch → 0` pattern.

---

### `src/evolution/perf-measure.mjs` (utility / perf tooling, batch)

**Analog:** `assessCalibration` in the same file (lines 86-96) — parallel it, do NOT modify it.

**Core pattern — latency gate** (lines 86-96, copy structure, change ceilings + reason codes):
```javascript
export function assessCalibration({ evaluation, performance: measured } = {}) {
  const p95Pass = measured?.warm?.p95_ms < 25;   // canary gate — DO NOT CHANGE
  const maxPass = measured?.warm?.max_ms < 100;
  const latency = {
    pass: p95Pass && maxPass,
    reason_code: !p95Pass ? 'warm_p95_ceiling_exceeded' : !maxPass ? 'route_ceiling_exceeded' : 'latency_pass',
  };
  const quality = evaluation?.quality ?? { pass: false, reason_code: 'quality_missing' };
  const context_budget = evaluation?.context_budget ?? { pass: false, reason_code: 'context_budget_missing' };
  return freeze({ pass: quality.pass === true && context_budget.pass === true && latency.pass, quality, context_budget, latency });
}
```
Apply: add a NEW export `assessMutationSafetyRegression({ performance: measured } = {})` with `p95_ms < 40`, `max_ms < 100`, reason codes `mutation_safety_p95_exceeded` / `mutation_safety_max_exceeded` / `mutation_safety_pass`, `ceilings: { p95_ms: 40, max_ms: 100 }`. Use the same `freeze(...)` convention. Do NOT take `evaluation` (quality/context_budget are canary-only concerns). Do NOT relax the 25ms ceiling in `assessCalibration` — Phase 26 locked decision (Anti-Pattern 2).

**Measurement reuse** (lines 62-84, `measureRoutes`) — reuse for the regression run; do not reinvent `percentile` (line 74 uses `percentile(durations, 0.95)`). `CALIBRATION_CORPUS` (referenced line 77 via `CALIBRATION_CORPUS_FINGERPRINT`) is the deterministic unit-test corpus; `calibration-tasks.json` (repo root, 32 prompts) is the fuller regression corpus — RESEARCH Open Question 1 recommends both.

---

### `build-manifest.mjs` (utility / builder, file-I/O)

**Analog:** the final atomic-write + size-log block in the same file (lines 525-536).

**Core pattern — atomic write + size check** (lines 525-536):
```javascript
function fileStatSize(p) {
  try { return statSync(p).size; } catch { return 0; }
}

// Atomic write (tmp + rename).
mkdirSync(dirname(OUT), { recursive: true });
const tmp = `${OUT}.tmp.${process.pid}`;
writeFileSync(tmp, JSON.stringify(manifest, null, 2));
renameSync(tmp, OUT);
console.log(JSON.stringify(manifest.counts, null, 2));
console.log(`manifest written: ${OUT}`);
console.log(`size: ${fileStatSize(OUT)} bytes`);
```
Apply: add a `MODE_MAP_SIZE_CEILING = 30_000` constant and, after the mode-map file is written (or as a separate validator step), `const modeMapSize = fileStatSize(MODE_MAP_PATH); if (modeMapSize > MODE_MAP_SIZE_CEILING) { console.error(\`mode-map.json exceeds 30KB: \${modeMapSize} bytes\`); process.exitCode = 1; }` — reuse the existing `fileStatSize` helper (do not add a second stat helper). Keep it off the hot path (RESEARCH Pitfall 5, A1). Prefer error exit in strict/CI, warn in local dev (Open Question 2 recommends default-error).

**Alternative location:** `src/registry/validate.mjs` exposes `compareSemanticConvergence` and `PRODUCTION_GATE_RUNNERS` (lines 85-163) — if the size guard belongs in the validation pipeline instead of the builder, add a runner there using the same `passed / reason_code` shape (line 92: `reason_code: passed ? 'passed' : 'semantic_bytes_mismatch'`). Default to `build-manifest.mjs` per RESEARCH.

---

### `tests/router.mutation-safety.test.mjs` (NEW, test, unit)

**Analog:** `tests/router.cache.test.mjs` (lines 1-60) — copy the harness structure.

**Imports + module-load pattern** (lines 1-14):
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { homedir } from 'node:os';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const mod = await import(HOOK);
const { cacheKey, cacheLookup, writeCache, loadCache, saveCache } = mod;
```
Apply: import the same `HOOK` and add `routeTargetsExist`, `capRouteRender` (and any new `readWeightsMtime` if exported) to the destructured set. Use the same `withTempDir` helper (lines 16-20) for any temp-cache tests.

**Assertion style — key-difference, not exact hash** (lines 28-44):
```javascript
test('cacheKey: changing modeMapMtime produces a different key (RTE-07 invalidation)', () => {
  const a = cacheKey('fix bug', ['fix'], 1000, 2000);
  const b = cacheKey('fix bug', ['fix'], 1001, 2000);
  assert.notEqual(a, b);
});
```
Apply: add `cacheKey: changing weightsMtime produces a different key (SAF-01)` — `cacheKey('fix bug', ['fix'], 1000, 2000, 0, 0, 5000)` vs `…, 5001` — and a "non-zero weightsMtime is folded in" test (Pitfall 2 guard). For SAF-02, build a fake manifest + a cached route whose `id`/`recommended_skills`/`recommended_agents` include a missing target, assert `routeTargetsExist` returns `false`, and assert the hot-path integration logs `stale_target` to `decision_trace` (mirror the `state.decision_trace.push(...)` pattern at router.mjs:2557). For SAF-04, assert `capRouteRender` truncates to 3 skills / 2 agents and sets `_render_cap_truncated` when input exceeds, and that `formatInjection(capRouteRender(overloadedRoute))` never emits more than 3 skill lines / 2 agent lines.

---

### `tests/router.cache.test.mjs` (extend, test, unit)

**Analog:** itself. Add SAF-01 weights-mtime invalidation tests in the same style as the existing `surfaceMtime` test (lines 40-44):
```javascript
test('cacheKey: changing surfaceMtime produces a different key (surface profile invalidation)', () => {
  const a = cacheKey('fix bug', ['fix'], 1000, 2000, 3000, 4000);
  const b = cacheKey('fix bug', ['fix'], 1000, 2000, 3000, 4001);
  assert.notEqual(a, b);
});
```
Apply: add the parallel `weightsMtime` test (7th positional arg). Do NOT assert exact hash values (Pitfall 1).

---

### `tests/router.perf-calibration.test.mjs` (extend, test, perf regression)

**Analog:** the existing `assessCalibration` test (lines 59-60+ — `REL-01 quality and latency are independent hard gates`) and the `measureRoutes` deterministic-clock test (lines 43-57).

**Deterministic-clock pattern** (lines 43-57):
```javascript
test('D-14 monotonic measurement excludes warmup and computes deterministic nearest-rank percentiles', async () => {
  const { measureRoutes, percentile } = await import(perfUrl);
  assert.equal(percentile([9, 1, 5, 3], 0.5), 3);
  let clock = 0;
  const durations = [50, 10, 20, 30, 40];
  const result = measureRoutes({
    fixtures: [{ id: 'one' }], warmup_runs: 1, measured_runs: 4,
    route: () => {},
    now: () => { const value = clock; clock += durations.shift() ?? 0; return value; },
    versions: { candidate: 'c', compiled_index: 'i', policy: 'p', corpus: 'router-calibration-v1' },
  });
  assert.equal(result.samples.length, 4);
  assert.equal(result.warm.p95_ms, 40);
  assert.equal(result.warm.max_ms, 40);
});
```
Apply: add a test for `assessMutationSafetyRegression` — pass `{ performance: { warm: { p95_ms: 39, max_ms: 99 } } }` → `pass: true`; `{ p95_ms: 40 }` → `pass: false, reason_code: 'mutation_safety_p95_exceeded'`; `{ max_ms: 100 }` → `pass: false, reason_code: 'mutation_safety_max_exceeded'`. Add a regression test that runs `measureRoutes` against the full current mode-map (or `CALIBRATION_CORPUS`) and asserts `assessMutationSafetyRegression({ performance: result })` passes. Re-use `CALIBRATION_CORPUS` import (line 7) — do not invent a new corpus.

---

### `tests/router.build-manifest.test.mjs` (extend, test, unit)

**Analog:** itself. Add a test that writes a `mode-map.json` > 30KB to a temp dir, runs the builder (or the extracted size-guard function), and asserts the exit code / error is non-zero. Mirror the `withTempDir` pattern from `tests/router.cache.test.mjs:16-20` for filesystem isolation. If the guard is implemented as an exported function (e.g. `assertModeMapSize(path, ceiling = 30_000)`), test it directly; if it's inline in the builder's write block, test via subprocess exit code.

## Shared Patterns

### Fail-open error handling
**Source:** `~/.claude/hooks/router.mjs` top-level try/catch (CLAUDE.md "Fail-open": on any exception, pass through the original prompt unchanged; never exit non-zero, never `decision: "block"`).
**Apply to:** every new helper in `router.mjs` (`routeTargetsExist`, `capRouteRender`, `readWeightsMtime`). Each must be exception-safe and fail to the safer side: `routeTargetsExist` → `true` on error (fail open to recompute-or-serve, never block), `capRouteRender` → return `route` unchanged on error, `readWeightsMtime` → `0` on error (matches `readGraphMtime`).

### Mtime-folding (RTE-07 pattern)
**Source:** `~/.claude/hooks/router.mjs:1509-1546` — `cacheKey` + `readGraphMtime` + `readSurfaceMtime`.
**Apply to:** the new `weightsMtime` component of `cacheKey` and the new `readWeightsMtime` helper. Use the exact same `try { existsSync → statSync → .mtimeMs } catch { return 0 }` shape. The 7th positional default param (`weightsMtime = 0`) keeps older 6-arg callers working — the hot-path call site (router.mjs:2539 area) MUST pass the real mtime (Pitfall 2).

### Best-effort file-stat helper
**Source:** `build-manifest.mjs:525-527` `fileStatSize(p) { try { return statSync(p).size; } catch { return 0; } }`.
**Apply to:** the 30KB mode-map size guard. Reuse this helper — do not add a second one.

### Atomic write (tmp + rename)
**Source:** `build-manifest.mjs:529-533`, `router.mjs` `saveCache` (RESEARCH cites lines 1489-1577).
**Apply to:** no new atomic writes needed in Phase 27 — the cache self-invalidates because keys change (RESEARCH Runtime State Inventory). Mention only for context: the existing `saveCache` handles cache writes; do not add a second atomic-write path.

### Test isolation with `withTempDir`
**Source:** `tests/router.cache.test.mjs:16-20`.
```javascript
function withTempDir(fn) {
  const dir = join(tmpdir(), `router-cache-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  try { return fn(dir); } finally { try { rmSync(dir, { recursive: true, force: true }); } catch {} }
}
```
**Apply to:** `tests/router.mutation-safety.test.mjs` (new) and any filesystem-touching test in `tests/router.build-manifest.test.mjs` (extend). Copy the helper verbatim — do not share across files (each test file stays self-contained per project convention).

### Telemetry / decision_trace observability
**Source:** `~/.claude/hooks/router.mjs:2540-2557` — `state.cache.invalidation_mtimes = { mode_map, manifest, graph, surface }` and `state.decision_trace.push('cache:hit', 'scoring:skipped')`.
**Apply to:** SAF-01 (add `weights` to `invalidation_mtimes`; expose derived `routing_version = `${modeMapMtime}:${manifestMtime}:${weightsMtime}`` as a telemetry field), SAF-02 (push `'cache:stale_target'` to `decision_trace` and set `state.cache.status = 'stale_target_recompute'`), SAF-04 (log `_render_cap_truncated` flag when `capRouteRender` fires). Every guard must be observable in telemetry — never silent (Anti-Pattern 5).

## No Analog Found

None. Every file in this phase has an exact in-codebase analog — Phase 27 is gap-closing work on existing primitives, per RESEARCH Summary. The planner can reference the excerpts above directly.

## Metadata

**Analog search scope:**
- `~/.claude/hooks/router.mjs` (lines 67-72, 630-704, 1500-1546, 2110-2210, 2540-2580)
- `src/evolution/perf-measure.mjs` (lines 60-96)
- `build-manifest.mjs` (lines 20, 525-536)
- `src/registry/validate.mjs` (lines 48-163 — fallback location for the size guard)
- `tests/router.cache.test.mjs` (lines 1-60)
- `tests/router.perf-calibration.test.mjs` (lines 1-60)
- `tests/router.build-manifest.test.mjs` (existence confirmed; same test style)

**Files scanned:** 7 source/test files + 2 fallback candidates
**Pattern extraction date:** 2026-07-29