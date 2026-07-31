# Phase 27: Mutation Safety Infrastructure - Research

**Researched:** 2026-07-29
**Domain:** Cache invalidation, stale-route guards, latency regression gating, render-cap boundaries (Node stdlib, `~/.claude/hooks/router.mjs`)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

(None — discuss phase was skipped via `workflow.skip_discuss`.)

### Claude's Discretion

All implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

### Deferred Ideas (OUT OF SCOPE)

None — discuss phase skipped. The v1.4 `Out of Scope` table in REQUIREMENTS.md applies: no evolution weight tuning, no auto-deleting stale mode-map entries, no per-prompt LLM/embedding/network, no hot-path schema change, no new dependency.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SAF-01 | Cache key includes a `routing_version` derived from mode-map mtime + weights version + manifest mtime; cached routes invalidate when mode-map or weights change. | `cacheKey` (router.mjs:1514) already folds modeMap + manifest + graph + surface mtimes into the sha256. **Gap: `weights` mtime is NOT folded in.** Add `weightsMtime` as a 7th key component and expose a derived `routing_version` string for telemetry/observability. `weights.json` has no `version` field today (schema_version 2, `updated_at`, 57 weight records) — use file mtime as the version signal, consistent with the existing mtime-folding approach. |
| SAF-02 | A cached route whose target id is absent from the current manifest is never served — the route is recomputed instead. | The cache-hit path (router.mjs:2548-2561) serves the cached route directly with NO manifest-target verification. `validateRouteTargets` (router.mjs:636) exists but only runs in diagnostics/`router doctor`, not on the hot path. Add a lightweight guard on cache hit: verify the cached route's `id` + every `recommended_skills`/`recommended_agents` item is still present in the loaded manifest; on any miss, treat as cache miss and recompute. Manifest is already loaded on the hot path, so this is a Set lookup (sub-ms). |
| SAF-03 | Warm routing p95 stays below 40ms and every measured route stays below 100ms on the calibration corpus after mode-map expansion (regression test, re-run each phase). | Existing `assessCalibration` (src/evolution/perf-measure.mjs:86) uses p95<25ms / max<100ms — that is the **evolution-canary** gate (stricter, for candidate weight sets). SAF-03 is a **separate, looser** regression gate (p95<40ms / max<100ms) that must run against the **full expanded** mode-map and be re-runnable in Phases 28/29. Do NOT relax the 25ms canary gate; add a parallel `mutation-safety` gate and regression test. The `CALIBRATION_CORPUS` (7 synthetic fixtures) and `calibration-tasks.json` (32 prompts) are the corpora. |
| SAF-04 | `additionalContext` rendering is capped at 1 mode + 3 skills + 2 agents + 1 reasoning line (hard drop-and-log boundary), and `mode-map.json` stays below 30KB. | `formatInjection` (router.mjs:2118) currently uses a token-cap (TOKEN_CAP ~500 tokens) with a priority drop order but **no hard count boundary** — secondary skills and agents are unbounded by count, only by tokens. Add a hard truncation: `skills.slice(0,3)`, `agents.slice(0,2)`, 1 mode, 1 reasoning line, and emit a telemetry/diagnostic log line when the boundary fires. `mode-map.json` is currently 15304 bytes (29 entries) with **no size guard anywhere** — add a builder/validator check that fails or warns when the file exceeds 30KB. |
</phase_requirements>

## Summary

Phase 27 is a prerequisite safety-rail phase: it must ship **before** any mode-map or weights mutation lands in Phases 28-29. The router already has most of the cache-invalidation scaffolding (mtime-folded sha256 cache keys, LRU cache, atomic writes, `validateRouteTargets` diagnostics), so this phase is **gap-closing work**, not greenfield. Four concrete gaps need closing: (1) fold `weights.json` mtime into the cache key and expose a `routing_version` string; (2) add a hot-path stale-target guard on cache hits so a route whose id/skills/agents have disappeared from the manifest is recomputed instead of served; (3) add a p95<40ms / max<100ms regression harness that is re-runnable each subsequent phase against the full (eventually expanded) mode-map, distinct from the stricter 25ms evolution-canary gate; (4) impose a hard 1-mode/3-skills/2-agents/1-reasoning render boundary with drop-and-log, plus a 30KB mode-map size guard.

The work is stdlib-only, hot-path-sensitive (must stay <100ms, fail-open), and touches three files: `~/.claude/hooks/router.mjs` (cache key, cache-hit guard, `formatInjection` cap), `src/evolution/perf-measure.mjs` (new regression gate), and `build-manifest.mjs` or a validator (mode-map size guard). No new dependencies, no schema breaks, no hot-path semantic changes — v1.4 is off-hot-path mutation safety only.

**Primary recommendation:** Close the four gaps as four independent, test-first increments. Reuse the existing mtime-folding pattern for `weightsMtime`; reuse `validateRouteTargets`'s target-resolution logic (factored into a hot-path-callable predicate) for the SAF-02 guard; add a parallel `assessMutationSafetyRegression` gate in `perf-measure.mjs` that does NOT touch the existing 25ms canary; and add a `capRouteRender(route)` helper that runs before `formatInjection` so the hard count boundary is enforced in one place with a telemetry log on fire.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Cache key invalidation (SAF-01) | Hook hot path (`router.mjs`) | — | The cache key is computed on every prompt in the `UserPromptSubmit` subprocess; mtime reads are the only cross-file signal. |
| Stale-target recompute guard (SAF-02) | Hook hot path (`router.mjs`) | — | Must fire on every cache hit before injection; manifest is already loaded in the same process. |
| Latency regression harness (SAF-03) | Test/evolution tooling (`src/evolution/perf-measure.mjs`, `tests/`) | — | Off-hot-path; runs in `rtk node --test` and the calibrate CLI, never inside the hook. |
| Render count cap (SAF-04) | Hook hot path (`router.mjs` `formatInjection`) | — | The cap must run where the `additionalContext` string is assembled. |
| Mode-map size guard (SAF-04) | Builder/validator (`build-manifest.mjs` or `src/registry/validate.mjs`) | — | Size is a property of the file, enforced at build/validate time, not on the hot path. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js stdlib (`node:crypto`, `node:fs`, `node:path`, `node:os`) | built-in (Node ≥18, `/Users/guilherme/.hermes/node/bin/node`) | Cache key hashing, mtime reads, atomic cache writes | Zero dependencies; matches every other `~/.claude/hooks/*.mjs` hook. [VERIFIED: codebase — router.mjs:67-72] |
| `node:test` + `node:assert` | built-in | Test framework | Project's pinned test command is `rtk node --test tests/*.test.mjs`. [VERIFIED: .planning/config.json workflow.test_command] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `src/evolution/perf-measure.mjs` | existing (in-repo) | `measureRoutes`, `percentile`, `assessCalibration`, `CALIBRATION_CORPUS` | Reuse for the SAF-03 regression harness — do not reinvent percentile/p95 logic. [VERIFIED: src/evolution/perf-measure.mjs:62-91] |
| `validateRouteTargets` + `buildTargetIndexes` | existing (router.mjs:636) | Manifest target resolution | Factor a `routeTargetsExist(route, manifest)` predicate out of this for the SAF-02 hot-path guard — do not duplicate the target-resolution logic. [VERIFIED: router.mjs:636-704] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Folding raw mtimes into sha256 | A monotonic `routing_version` integer stamped into `mode-map.json`/`weights.json` on each edit | Mtime-folding is already the locked pattern (RTE-07) and needs no authoring discipline; a stamped version requires every editor to bump it. Keep mtime-folding; expose `routing_version` as a **derived** string for telemetry only. |
| Hot-path stale-target guard | Run `validateRouteTargets` on every cache hit | `validateRouteTargets` iterates ALL entries and builds diagnostic rows — too costly for the hot path. Factor a single-route predicate instead. [VERIFIED: router.mjs:636-704] |

**Installation:**
```bash
# No installation. Stdlib-only. No dependencies to add.
```

**Version verification:** Not applicable — no external packages. Node binary verified at `/Users/guilherme/.hermes/node/bin/node` (used by all existing hooks). [VERIFIED: codebase — CLAUDE.md Recommended Stack]

## Package Legitimacy Audit

> Not applicable — this phase installs no external packages. Stdlib-only, per CLAUDE.md "What NOT to Use" (no npm dependency in v1).

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
UserPromptSubmit payload
        │
        ▼
router.mjs main() / inspectDecision()
        │
        ├─ read manifest, mode-map, weights, cache  (mtime captured per file)
        │
        ├─ cacheKey(np, ik, modeMapMtime, manifestMtime, graphMtime, surfaceMtime, weightsMtime)  ◄── SAF-01: add weightsMtime
        │       │
        │       └─ sha256 → sig  (routing_version derived for telemetry)
        │
        ├─ cacheLookup(sig, cache)  ── HIT ──►  SAF-02 guard: routeTargetsExist(cached, manifest)?
        │                                       │
        │                                       ├─ YES → inject cached route (scoring skipped)
        │                                       └─ NO  → log stale_target, fall through to recompute
        │
        ├─ [cache MISS / stale recomputed path]
        │   buildCorpus → surfaceFilter → bm25Score → graphBoost → normalize → applyWeightBlend
        │       │
        │       └─ confidenceTier → mmEntry → route → applyGuards → finalRoute
        │               │
        │               ├─ capRouteRender(finalRoute)  ◄── SAF-04: 1 mode / 3 skills / 2 agents / 1 reasoning (drop-and-log)
        │               │
        │               └─ formatInjection(capped) → composeWithCap → additionalContext
        │
        ├─ writeCache (high-tier only) → saveCache (atomic)
        │
        └─ telemetry append (prompt_signature, routing_version, cache status, stale_target flag, render_cap_truncated flag)

Off-hot-path (tests / calibrate CLI):
        src/evolution/perf-measure.mjs
        │
        ├─ measureRoutes({fixtures, route, warmup, measured}) → {warm:{p50,p95,max}}
        ├─ assessCalibration(...)           ◄── EXISTING 25ms canary gate (untouched)
        └─ assessMutationSafetyRegression() ◄── SAF-03: NEW 40ms/100ms gate (re-runnable each phase)

build-manifest.mjs / validator:
        └─ assert mode-map.json byte size < 30_000  ◄── SAF-04 size guard
```

### Recommended Project Structure
```
~/.claude/hooks/router.mjs        # cacheKey + weightsMtime, cache-hit stale guard, capRouteRender, formatInjection
src/evolution/perf-measure.mjs    # assessMutationSafetyRegression (new), CALIBRATION_CORPUS reuse
tests/router.mutation-safety.test.mjs   # SAF-01..04 regression tests (new)
tests/router.cache.test.mjs       # extend with weights-mtime invalidation + stale-target recompute
tests/router.perf-calibration.test.mjs  # extend with the 40ms/100ms mutation-safety gate
build-manifest.mjs (or src/registry/validate.mjs)  # mode-map 30KB size guard
```

### Pattern 1: Mtime-folded cache key (extend, do not replace)
**What:** The cache key is `sha256(normalizedPrompt | intentKeywords | modeMapMtime | manifestMtime | graphMtime | surfaceMtime)`. SAF-01 adds `weightsMtime` as a 7th component.
**When to use:** Every prompt — the key is recomputed per invocation.
**Example:**
```javascript
// Source: router.mjs:1514 (existing pattern — extend with weightsMtime)
export function cacheKey(normalizedPrompt, intentKeywords, modeMapMtime, manifestMtime, graphMtime = 0, surfaceMtime = 0, weightsMtime = 0) {
  const np = String(normalizedPrompt || '');
  const ik = Array.isArray(intentKeywords) ? intentKeywords.join(' ') : String(intentKeywords || '');
  const joined = [np, ik, modeMapMtime, manifestMtime, graphMtime, surfaceMtime, weightsMtime].join('|');
  return createHash('sha256').update(joined).digest('hex');
}
// routing_version is a DERIVED observability string (not stored on disk):
//   `${modeMapMtime}:${manifestMtime}:${weightsMtime}` — logged in telemetry, never used for lookup.
```

### Pattern 2: Hot-path stale-target predicate (factor from validateRouteTargets)
**What:** On cache hit, verify the cached route's `id`, `recommended_skills[]`, `recommended_agents[]` all still resolve in the current manifest before serving. On any miss, log `stale_target` and recompute.
**When to use:** Every cache hit, before injecting the cached route.
**Example:**
```javascript
// Source: factored from router.mjs:636-704 (validateRouteTargets / buildTargetIndexes)
// Reuse the SAME target-resolution sets (commands, skills, safeAgents) — do not rebuild separately.
export function routeTargetsExist(route, manifest, indexes = buildTargetIndexes(manifest)) {
  if (!route) return true; // nothing to verify (warn/pass-through routes)
  const id = stripLeadingSlash(route.id || route.mode || '');
  // slash routes: id/mode must resolve as a command OR an intentional mode-map route id
  if (route.invoke_kind === 'slash' && id && !indexes.commands.has(id) /* && not intentional alias */) {
    return false;
  }
  for (const s of (route.recommended_skills || [])) {
    if (!knownSkillTargets(indexes).has(stripLeadingSlash(s))) return false;
  }
  for (const a of (route.recommended_agents || [])) {
    if (!indexes.safeAgents.has(stripLeadingSlash(a)) && !indexes.blockedAgents.has(stripLeadingSlash(a))) return false;
  }
  return true;
}
// Hot path (router.mjs:2548):
//   const cached = cacheLookup(sig, cache);
//   if (cached && !routeTargetsExist(cached, manifest)) {
//     state.cache.status = 'stale_target_recompute';
//     state.decision_trace.push('cache:stale_target');
//     // fall through to recompute (do NOT inject cached)
//   } else if (cached) { ...serve... }
```

### Pattern 3: Hard render-count cap with drop-and-log
**What:** Before `formatInjection`, cap the route to 1 mode + 3 skills + 2 agents + 1 reasoning line. Log a telemetry flag when truncation fires.
**When to use:** Every route render (cache hit AND fresh compute), before token-cap drop order.
**Example:**
```javascript
// Source: new helper, called before formatInjection (router.mjs:2558, 2662)
export function capRouteRender(route) {
  if (!route) return route;
  const skills = (route.recommended_skills || []).slice(0, 3);
  const agents = (route.recommended_agents || []).slice(0, 2);
  const truncated = (route.recommended_skills?.length > 3) || (route.recommended_agents?.length > 2);
  return {
    ...route,
    recommended_skills: skills,
    recommended_agents: agents,
    _render_cap_truncated: truncated || undefined, // telemetry-only flag, stripped before injection
  };
}
```

### Pattern 4: Parallel latency gate (do not relax the canary)
**What:** Add `assessMutationSafetyRegression({ evaluation, performance })` with p95<40ms / max<100ms. Leave `assessCalibration` (p95<25ms) untouched — that is the evolution-canary gate for candidate weight sets and must stay stricter.
**When to use:** Re-run each subsequent phase (28, 29) after mode-map/weights mutation.
**Example:**
```javascript
// Source: src/evolution/perf-measure.mjs:86 (existing assessCalibration — leave as-is)
export function assessMutationSafetyRegression({ performance: measured } = {}) {
  const p95Pass = measured?.warm?.p95_ms < 40;   // SAF-03 ceiling
  const maxPass = measured?.warm?.max_ms < 100;  // SAF-03 hard ceiling
  return {
    pass: p95Pass && maxPass,
    reason_code: !p95Pass ? 'mutation_safety_p95_exceeded' : !maxPass ? 'mutation_safety_max_exceeded' : 'mutation_safety_pass',
    ceilings: { p95_ms: 40, max_ms: 100 },
  };
}
```

### Anti-Patterns to Avoid
- **Running `validateRouteTargets` on every cache hit:** it iterates ALL mode-map entries and builds diagnostic rows — too costly for the <100ms hot path. Factor a single-route predicate instead. [VERIFIED: router.mjs:636-704]
- **Relaxing the 25ms `assessCalibration` gate to 40ms:** that gate is the evolution-canary hard gate for candidate weight sets (Phase 26 locked decision). SAF-03 is a *separate* regression gate; add a parallel function. [VERIFIED: src/evolution/perf-measure.mjs:86-91, Phase 26 RESEARCH]
- **Storing `routing_version` on disk and requiring editors to bump it:** brittle, depends on authoring discipline. Derive it from mtimes (the existing RTE-07 pattern) and expose it only as a telemetry string. [VERIFIED: router.mjs:1509-1519]
- **Enforcing the 30KB mode-map size guard on the hot path:** size is a file property; check it in `build-manifest.mjs` or `src/registry/validate.mjs` (off-hot-path), not in `router.mjs`. [ASSUMED — based on CLAUDE.md "File writes" + hot-path budget]
- **Dropping the stale-target guard into the `try/catch` fail-open path silently:** the guard must log `stale_target` to telemetry and push a `decision_trace` entry so the recompute is observable, not invisible. [ASSUMED — based on existing telemetry/decision_trace conventions]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| p95 / percentile computation | Manual sort + index math | `percentile` in `src/evolution/perf-measure.mjs` | Already used by the canary; deterministic nearest-rank, tested. [VERIFIED: src/evolution/perf-measure.mjs:74] |
| Manifest target resolution (commands/skills/agents sets) | A second Set builder on the hot path | `buildTargetIndexes(manifest)` + `knownSkillTargets(indexes)` (router.mjs:636) | Already factored, already used by `validateRouteTargets`. [VERIFIED: router.mjs:636-704] |
| LRU cache + atomic write | A new cache module | `loadCache`/`writeCache`/`saveCache` (router.mjs:1489-1577) | Existing, tested (18 cache tests pass), atomic on POSIX. [VERIFIED: tests/router.cache.test.mjs] |
| Token-cap drop order | Replacing `composeWithCap`/`formatInjection` drop logic | Keep them; add `capRouteRender` BEFORE `formatInjection` | The token cap is a second defense; the count cap is the first. Two layers, each simple. [VERIFIED: router.mjs:1692-1698, 2118-2202] |

**Key insight:** Every SAF requirement has a partial implementation already in the codebase. This phase extends and guards existing primitives; it does not introduce new mechanisms. The risk is *not* missing primitives — it is *breaking the hot-path budget* or *silently relaxing the existing 25ms canary gate*.

## Runtime State Inventory

> Phase 27 is a refactor/safety phase that touches hot-path cache behavior and render output. Include this inventory.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `~/.claude/router/cache.json` (88388 bytes, 256-entry LRU). Existing entries were keyed WITHOUT `weightsMtime`; after SAF-01 ships, every old entry's key will miss (the 7th component defaults to 0 only for backward compat — see Pitfall 2). | Code edit only: the cache key change naturally invalidates the old cache on next load (keys differ). No data migration needed — old entries simply miss and get evicted by LRU. Optionally clear `cache.json` once at ship time to free the 88KB. |
| Live service config | None — the router is a `UserPromptSubmit` subprocess; no long-running service holds the old string. | None. |
| OS-registered state | None — no Task Scheduler / launchd / pm2 registrations touched by this phase. | None. |
| Secrets/env vars | None — `weights.json` and `mode-map.json` contain no secrets; `routing_version` is derived from mtimes, not secret material. | None. |
| Build artifacts | None — stdlib-only, no `node_modules`, no compiled binaries. `cache.json` is the only artifact and it self-invalidates. | None. |

**Nothing found in category:** Live service config, OS-registered state, Secrets/env vars, Build artifacts — all verified by inspecting the router data directory and hook structure. [VERIFIED: `ls ~/.claude/router/`, router.mjs:67-72]

## Common Pitfalls

### Pitfall 1: Adding `weightsMtime` breaks the existing cache tests
**What goes wrong:** `tests/router.cache.test.mjs` calls `cacheKey('fix bug', ['fix'], 1000, 2000)` with 4 args. Adding a 7th positional param defaults to 0, so old calls still produce a key — but a test that asserts a specific hash value would break.
**Why it happens:** The existing tests don't assert exact hashes (they assert key changes on input changes), so they should pass — but any new test asserting a *specific* hash value across the change will fail.
**How to avoid:** Add `weightsMtime = 0` as a trailing default param. Do NOT assert exact hash values in new tests; assert key-differs-on-`weightsMtime`-change. Run the full cache suite after the change. [VERIFIED: tests/router.cache.test.mjs:22-55 — only key-difference assertions, no exact hashes]
**Warning signs:** A cache test fails with a hash mismatch after the change.

### Pitfall 2: Backward-compat default makes old cache entries HIT when they should MISS
**What goes wrong:** If `weightsMtime` defaults to 0 in `cacheKey` AND the hot-path call passes the real mtime, an old cache entry (keyed with weightsMtime=0) will miss — correct. But if a caller forgets to pass the real mtime, the key silently uses 0 and old entries HIT with stale weights.
**Why it happens:** The 6-arg default pattern (`graphMtime = 0, surfaceMtime = 0`) is already a footgun; adding a 7th doubles it.
**How to avoid:** The hot-path call site (router.mjs:2539) MUST pass the real `weightsMtime` from `statSync(WEIGHTS).mtimeMs` (best-effort, 0 on missing file — matching the `readGraphMtime` pattern at router.mjs:1524). Add a test that asserts a non-zero `weightsMtime` is folded in. [VERIFIED: router.mjs:1524-1533 `readGraphMtime` pattern]
**Warning signs:** Telemetry shows `cache:hit` immediately after a `weights.json` edit.

### Pitfall 3: SAF-02 guard doubles manifest parse cost
**What goes wrong:** `buildTargetIndexes(manifest)` is not free — it scans the manifest. Calling it on every cache hit could push warm p95 above 40ms.
**Why it happens:** The manifest is already loaded for the surface filter / corpus build on the miss path, but the cache-hit path currently skips all of that.
**How to avoid:** On the cache-hit path, the manifest is still loaded for `state.manifest` — reuse the already-parsed object. `buildTargetIndexes` builds 3 Sets from the parsed manifest (sub-ms for ~244 entries). Measure in the regression harness; if it blows the budget, memoize `buildTargetIndexes` per-process keyed on `manifestMtime`. [VERIFIED: router.mjs:2547-2561 cache-hit path, manifest already loaded earlier in inspectDecision]
**Warning signs:** Warm p95 in the mutation-safety regression test jumps above ~30ms.

### Pitfall 4: Hard render cap drops a high-priority skill/agent
**What goes wrong:** `recommended_skills.slice(0, 3)` keeps the first 3 in array order, but the mode-map author may have ordered skills by importance — dropping index 3+ could drop a critical skill.
**Why it happens:** Array order in `mode-map.json` is authoring order, which the existing `formatInjection` already treats as priority order (primarySkill = skills[0], secondarySkills = skills.slice(1)).
**How to avoid:** The cap preserves the existing priority semantics: `skills[0]` is primary, `slice(0,3)` keeps the top 3 by author priority. Document that the cap is a hard boundary and mode-map authors MUST order skills by priority. Log `_render_cap_truncated` to telemetry so drops are observable. [VERIFIED: router.mjs:2151-2154 primarySkill/secondarySkills priority]
**Warning signs:** Telemetry shows `_render_cap_truncated: true` on a route where the 4th skill was the most relevant.

### Pitfall 5: 30KB size guard runs on the hot path
**What goes wrong:** Adding `statSync(MODE_MAP).size < 30_000` to `router.mjs` adds a hot-path stat.
**Why it happens:** Tempting to co-locate with the cache-key mtime read.
**How to avoid:** Put the size guard in `build-manifest.mjs` (or `src/registry/validate.mjs`) — off-hot-path, runs at build/validate time. The hook reads mtime only. [ASSUMED — based on CLAUDE.md hot-path budget]
**Warning signs:** Warm p95 rises by the cost of an extra `statSync`.

## Code Examples

### Existing cache key (the pattern to extend)
```javascript
// Source: ~/.claude/hooks/router.mjs:1514
export function cacheKey(normalizedPrompt, intentKeywords, modeMapMtime, manifestMtime, graphMtime = 0, surfaceMtime = 0) {
  const np = String(normalizedPrompt || '');
  const ik = Array.isArray(intentKeywords) ? intentKeywords.join(' ') : String(intentKeywords || '');
  const joined = [np, ik, modeMapMtime, manifestMtime, graphMtime, surfaceMtime].join('|');
  return createHash('sha256').update(joined).digest('hex');
}
```

### Existing cache-hit path (the gap to close for SAF-02)
```javascript
// Source: ~/.claude/hooks/router.mjs:2548-2561
const cached = cacheLookup(sig, cache);
if (cached) {
  state.tier = cached.tier || 'high';
  state.route = cached;
  // ... NO manifest-target verification here — SAF-02 gap ...
  const routeBlock = formatInjection(cached, prompt, sig.slice(0, 8));
  state.finalInjectedContext = composeWithCap(routeBlock, graphBlock);
  return finish();
}
```

### Existing latency gate (the pattern to parallel, NOT replace)
```javascript
// Source: src/evolution/perf-measure.mjs:86-91
export function assessCalibration({ evaluation, performance: measured } = {}) {
  const p95Pass = measured?.warm?.p95_ms < 25;   // canary gate — DO NOT CHANGE
  const maxPass = measured?.warm?.max_ms < 100;
  return { pass: p95Pass && maxPass, reason_code: !p95Pass ? 'warm_p95_ceiling_exceeded' : !maxPass ? 'route_ceiling_exceeded' : 'latency_pass' };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 6-component cache key (no weights mtime) | 7-component cache key (add `weightsMtime`) | Phase 27 (this phase) | Weights edits invalidate stale routes — closes the SAF-01 gap. |
| Trust cache hits unconditionally | Verify cached route targets against current manifest | Phase 27 (this phase) | Prevents stale-target injection after manifest changes (SAF-02). |
| Single 25ms canary latency gate | 25ms canary (canary) + 40ms mutation-safety regression gate | Phase 27 (this phase) | Regression gate is re-runnable each phase against the expanding mode-map (SAF-03). |
| Token-cap-only render drop order | Hard count cap (1/3/2/1) + token cap | Phase 27 (this phase) | Render output bounded by count regardless of token budget (SAF-04). |
| No mode-map size guard | 30KB size guard at build/validate time | Phase 27 (this phase) | Phase 29 expansion cannot silently bloat the mode-map past 30KB (SAF-04). |

**Deprecated/outdated:** None — this phase extends existing primitives; nothing is deprecated.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The 30KB mode-map size guard belongs in `build-manifest.mjs` or `src/registry/validate.mjs`, not the hot path. | Architecture Patterns, Pitfall 5 | If the user wants runtime enforcement, the hook would need an extra `statSync` — but the budget allows it (~0.1ms). Low risk. |
| A2 | `buildTargetIndexes` is sub-ms for ~244 manifest entries and safe to call on the cache-hit path. | Pitfall 3 | If it exceeds budget, memoize per-process on `manifestMtime`. Low risk; the regression harness will catch it. |
| A3 | The 32-entry `calibration-tasks.json` is the "calibration corpus" referenced by SAF-03, alongside the 7-fixture `CALIBRATION_CORPUS` in perf-measure.mjs. | SAF-03 mapping | If the user intends a different corpus, the regression test fixture list changes. Medium risk — confirm in plan review. |
| A4 | `routing_version` is a derived telemetry string, not a persisted on-disk field. | SAF-01 | If the user wants it persisted on `mode-map.json`/`weights.json`, authoring discipline is required. Low risk — the mtime-derived form is more robust. |
| A5 | Mode-map authors order `recommended_skills`/`recommended_agents` by priority (primary first). | Pitfall 4 | If not, the hard slice(0,3) could drop the most relevant skill. The existing `formatInjection` already assumes this ordering, so the assumption is consistent with current behavior. Low risk. |

## Open Questions (RESOLVED)

> All three resolved by Plan 27-02 / 27-01 during plan-phase. Markers below reference the adopting plan task.

1. **Which corpus does SAF-03's "calibration corpus" refer to?** (RESOLVED — Plan 27-02 adopts the 7-fixture `CALIBRATION_CORPUS` for the deterministic unit gate; the 32-prompt file remains available for fuller regression.)
   - What we know: two candidates exist — the 7-fixture `CALIBRATION_CORPUS` in `src/evolution/perf-measure.mjs` (synthetic, used by the canary) and the 32-prompt `calibration-tasks.json` at repo root. REQUIREMENTS.md SIG-04 references "the v1.3 29-entry calibration" and "the 10-task calibration set" — suggesting a third, smaller calibration set used for threshold derivation.
   - What's unclear: which corpus the mutation-safety regression harness must run against.
   - Recommendation: Use the 7-fixture `CALIBRATION_CORPUS` for the deterministic unit-test gate (fast, re-runnable each phase) AND the 32-prompt `calibration-tasks.json` for a fuller regression run. Confirm in plan review. [ASSUMED — A3]

2. **Should the 30KB mode-map size guard fail the build, or warn only?** (RESOLVED — Plan 27-02 defaults to error enforcement via `process.exitCode = 1` when mode-map exceeds 30KB.)
   - What we know: SAF-04 says "stays below 30KB" — implies a hard boundary.
   - What's unclear: enforcement level (error vs warning).
   - Recommendation: Hard-fail in `--strict-coverage` / CI gating (consistent with COV-04 in Phase 28), warn in local dev. Default to error since 15KB current + 30KB ceiling gives Phase 29 clear headroom. [ASSUMED]

3. **Does SAF-01's `routing_version` need to appear in `telemetry.jsonl` as a new field?** (RESOLVED — Plan 27-01 logs `routing_version` as a derived string alongside the existing `cache.invalidation_mtimes` object; no persisted on-disk field.)
   - What we know: Telemetry already logs `prompt_signature`, tier, cache status. The `cache.invalidation_mtimes` object (router.mjs:2541) already records the mtimes.
   - What's unclear: whether a separate `routing_version` string field is required for observability.
   - Recommendation: Log `routing_version` as a derived field (`${modeMapMtime}:${manifestMtime}:${weightsMtime}`) alongside `cache.invalidation_mtimes`. Low cost, satisfies the requirement's naming. [ASSUMED — A4]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (`/Users/guilherme/.hermes/node/bin/node`) | hook runtime, tests | ✓ | ≥18 (Node 22.22.3 confirmed via test run) | — |
| `rtk` test runner | running the test suite | ✓ | — | `node --test` directly |
| `~/.claude/router/` data dir | cache, mode-map, weights, manifest | ✓ | — | — |

**Missing dependencies with no fallback:** none
**Missing dependencies with fallback:** none — stdlib-only, no external dependencies. [VERIFIED: `which node`, test command run, `ls ~/.claude/router/`]

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` + `node:assert` (built-in) |
| Config file | none (in-file `test()` blocks) |
| Quick run command | `rtk node --test tests/router.cache.test.mjs` |
| Full suite command | `rtk node --test tests/*.test.mjs` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SAF-01 | `cacheKey` changes when `weightsMtime` changes | unit | `rtk node --test tests/router.cache.test.mjs` | ❌ Wave 0 (extend existing file) |
| SAF-01 | Hot path folds real `weightsMtime` into the key (non-zero) | integration | `rtk node --test tests/router.mutation-safety.test.mjs` | ❌ Wave 0 (new file) |
| SAF-01 | `routing_version` appears in telemetry/decision_trace | integration | `rtk node --test tests/router.mutation-safety.test.mjs` | ❌ Wave 0 |
| SAF-02 | Cached route with absent target id is recomputed, not served | unit + integration | `rtk node --test tests/router.mutation-safety.test.mjs` | ❌ Wave 0 |
| SAF-02 | `stale_target` logged to decision_trace when guard fires | integration | `rtk node --test tests/router.mutation-safety.test.mjs` | ❌ Wave 0 |
| SAF-03 | Warm p95 < 40ms on calibration corpus (current 29-entry mode-map) | perf regression | `rtk node --test tests/router.perf-calibration.test.mjs` | ❌ Wave 0 (extend) |
| SAF-03 | Every measured route < 100ms | perf regression | `rtk node --test tests/router.perf-calibration.test.mjs` | ❌ Wave 0 (extend) |
| SAF-03 | `assessMutationSafetyRegression` gate passes/fails correctly | unit | `rtk node --test tests/router.perf-calibration.test.mjs` | ❌ Wave 0 (extend) |
| SAF-04 | `capRouteRender` truncates to 1 mode + 3 skills + 2 agents | unit | `rtk node --test tests/router.mutation-safety.test.mjs` | ❌ Wave 0 |
| SAF-04 | `_render_cap_truncated` flag set when truncation fires | unit | `rtk node --test tests/router.mutation-safety.test.mjs` | ❌ Wave 0 |
| SAF-04 | `formatInjection` never emits > 3 skills or > 2 agents | integration | `rtk node --test tests/router.mutation-safety.test.mjs` | ❌ Wave 0 |
| SAF-04 | mode-map.json > 30KB fails the size guard | unit | `rtk node --test tests/router.build-manifest.test.mjs` (or validate test) | ❌ Wave 0 (extend) |

### Sampling Rate
- **Per task commit:** `rtk node --test tests/router.cache.test.mjs tests/router.mutation-safety.test.mjs`
- **Per wave merge:** `rtk node --test tests/*.test.mjs`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/router.mutation-safety.test.mjs` — new file covering SAF-01 weights-mtime invalidation, SAF-02 stale-target recompute, SAF-04 render cap + truncation flag
- [ ] Extend `tests/router.cache.test.mjs` — add `cacheKey` weights-mtime invalidation test
- [ ] Extend `tests/router.perf-calibration.test.mjs` — add `assessMutationSafetyRegression` gate tests + p95<40ms/max<100ms regression
- [ ] Extend `tests/router.build-manifest.test.mjs` (or add a validate test) — mode-map 30KB size guard
- [ ] No framework install needed — `node:test` is built-in

*(If no gaps: N/A — gaps listed above)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | n/a — no auth in this phase |
| V3 Session Management | no | n/a — hook is stateless per-prompt |
| V4 Access Control | no | n/a — no privilege boundary touched |
| V5 Input Validation | yes | The cached route is read from `cache.json` (disk, untrusted). The SAF-02 guard is itself an input-validation control: it refuses to serve a cached route whose targets are absent from the (trusted) manifest. Treat `cache.json` as untrusted input — never inject a cached id/skill/agent without manifest validation. |
| V6 Cryptography | yes (minimal) | `node:crypto` sha256 for cache keys — already used, unchanged. No new crypto. |

### Known Threat Patterns for Node stdlib hook / cache

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cache poisoning (stale route served after manifest/target removed) | Tampering | SAF-02 stale-target guard: recompute instead of serve. [CITED: REQUIREMENTS.md SAF-02] |
| Cache key collision (weights edit not invalidating) | Tampering | SAF-01: fold `weightsMtime` into the sha256 key. [CITED: REQUIREMENTS.md SAF-01] |
| Render injection oversized (DoS via mode-map bloat) | Denial of Service | SAF-04 hard count cap (1/3/2/1) + 30KB mode-map size guard. [CITED: REQUIREMENTS.md SAF-04] |
| Hot-path latency regression (DoS via slow routing) | Denial of Service | SAF-03 p95<40ms / max<100ms regression gate, re-runnable each phase. [CITED: REQUIREMENTS.md SAF-03] |
| Secret leakage via telemetry | Information Disclosure | Existing redaction (router.mjs:1599-1610) — unchanged. `routing_version` is mtime-derived, no secret material. [VERIFIED: router.mjs:1599-1610] |

## Sources

### Primary (HIGH confidence)
- `~/.claude/hooks/router.mjs` — read directly: `cacheKey` (line 1514), `cacheLookup` (1503), hot-path cache-hit (2548-2561), `formatInjection` (2118-2202), `validateRouteTargets`/`buildTargetIndexes` (636-704), `readGraphMtime`/`readSurfaceMtime` (1524-1546), redaction (1599-1610). [VERIFIED: codebase]
- `src/evolution/perf-measure.mjs` — read directly: `CALIBRATION_CORPUS` (7 fixtures), `measureRoutes` (line 62), `assessCalibration` (line 86, p95<25ms / max<100ms). [VERIFIED: codebase]
- `~/.claude/router/mode-map.json` — 15304 bytes, 29 entries, schema_version 2. [VERIFIED: `wc -c` + `node -e`]
- `~/.claude/router/weights.json` — 8029 bytes, schema_version 2, blend 0.15, 57 weight records, no `version` field. [VERIFIED: `node -e`]
- `~/.claude/router/cache.json` — 88388 bytes, 256-entry LRU. [VERIFIED: `wc -c`]
- `tests/router.cache.test.mjs` — 18 tests, all pass; only key-difference assertions (no exact hashes). [VERIFIED: test run]
- `.planning/config.json` — `test_command: "rtk node --test tests/*.test.mjs"`, `nyquist_validation: true`, `security_enforcement: true`. [VERIFIED: file read]
- `.planning/REQUIREMENTS.md` — SAF-01..04 verbatim, v1.4 Out of Scope. [VERIFIED: file read]
- `.planning/STATE.md` — v1.4 roadmap decisions, Phase 27 pending todos (cache-key composition, calibration-corpus latency harness shape). [VERIFIED: file read]
- `.claude/CLAUDE.md` — hot-path budget, fail-open, stdlib-only, no new deps. [VERIFIED: file read]

### Secondary (MEDIUM confidence)
- `.planning/milestones/v1.3-phases/26-coherent-publication-and-dual-runtime-release/26-RESEARCH.md` — confirms the 25ms warm-p95 gate is a Phase 26 locked decision (do not relax). [CITED: Phase 26 RESEARCH]

### Tertiary (LOW confidence)
- None — all findings verified against the codebase this session.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — stdlib-only, verified in codebase; no external packages.
- Architecture: HIGH — every gap traced to a specific line in `router.mjs` / `perf-measure.mjs`; existing patterns documented.
- Pitfalls: HIGH — derived from actual code structure (test assertions, mtime-default pattern, hot-path budget).
- SAF-03 corpus selection: MEDIUM — two candidate corpora identified; the exact intended corpus is an open question (A3).

**Research date:** 2026-07-29
**Valid until:** 2026-08-28 (stable — stdlib-only, no fast-moving dependencies)