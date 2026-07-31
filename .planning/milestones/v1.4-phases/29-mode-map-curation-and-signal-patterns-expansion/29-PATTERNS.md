# Phase 29: Mode-Map Curation and Signal Patterns Expansion - Pattern Map

**Mapped:** 2026-07-29
**Files analyzed:** 10 proposed new/modified artifacts
**Analogs found:** 10 / 10

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `/Users/guilherme/.claude/hooks/router.mjs` | utility / provider | transform + request-response | existing `loadModeMap`, `validateRouteTargets`, `buildCorpus`, `inspectDecision` in the same file | exact |
| `/Users/guilherme/.claude/router/mode-map.json` | config | transform | existing v2 entries in the same file | exact |
| `src/coverage/audit.mjs` | utility | batch + transform | `typedMappings()` in the same file and `validateRouteTargets()` in `router.mjs` | exact |
| `router.calibrate.mjs` | utility / CLI | batch + transform | existing `dryRun()`, fixture loop, and wrong-high report in the same file | exact |
| `calibration-tasks.json` | test fixture / config | batch | existing original, coverage, codebase, and mapping fixtures in the same file | exact |
| `tests/router.mode-map-v3.test.mjs` | test | transform | `tests/router.route-targets.test.mjs` | role-match |
| `tests/router.mode-map-curation.test.mjs` | test | request-response | `tests/router.route-targets.test.mjs` plus `tests/router.coverage-audit.test.mjs` | exact |
| `tests/router.calibration-thresholds.test.mjs` | test | batch + transform | `tests/router.calibrate-importable.test.mjs` and `tests/router.calibrate.test.mjs` | role-match |
| `tests/router.route-targets.test.mjs` | test | transform | existing synthetic manifest and blocked-agent cases in the same file | exact |
| `coverage-report.json` | generated evidence | batch | Phase 28 builder publication exercised by `tests/router.coverage-audit.test.mjs` | exact |

## Pattern Assignments

### `/Users/guilherme/.claude/hooks/router.mjs` (utility/provider, transform + request-response)

**Analog:** Existing trust-boundary loaders, validator, corpus builder, and read-only inspection path in the same file.

**Fail-open loader pattern** (lines 466-482):

```javascript
export function loadManifest(path = MANIFEST) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

export function loadModeMap(path = MODE_MAP) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}
```

Add the shared v2/v3 pattern normalizer next to this boundary. Preserve `null`/diagnostic fail-open behavior; do not add a parser module or dependency.

**Validation pattern** (lines 656-669):

```javascript
export function validateRouteTargets(manifest, modeMap, indexes = buildTargetIndexes(manifest)) {
  const rows = [];
  const routeIds = new Set((modeMap?.entries || []).map((entry) => stripLeadingSlash(entry?.id)).filter(Boolean));
  const skills = knownSkillTargets(indexes);

  for (const entry of modeMap?.entries || []) {
    const shapeErrors = [];
    if (!entry?.id) shapeErrors.push(['<entry>', 'missing id']);
    if (!entry?.invoke_kind || !ROUTE_INVOKE_KINDS.has(entry.invoke_kind)) shapeErrors.push([entry?.invoke_kind || '<invoke_kind>', 'invalid invoke_kind']);
    if (!Array.isArray(entry?.signal_patterns) || entry.signal_patterns.length === 0) shapeErrors.push(['signal_patterns', 'must be a non-empty array']);
```

Extend this loop with normalized pattern validity, the global 1–6 cap, and canonical collision diagnostics. Reuse the same normalizer in every consumer.

**Blocked-agent guard pattern** (lines 695-709):

```javascript
if (entry.invoke_kind !== 'warn') {
  for (const target of entry.recommended_skills) {
    const name = stripLeadingSlash(target);
    if (!skills.has(name)) rows.push(routeDiagnostic(entry, 'stale_target', name, 'recommended skill is not in global/plugin/global-agents-store skill inventory'));
  }
}

for (const target of entry.recommended_agents) {
  const name = stripLeadingSlash(target);
  if (indexes.blockedAgents.has(name)) {
    rows.push(routeDiagnostic(entry, 'blocked_dispatch_agent', name, entry.invoke_kind === 'warn'
      ? 'warn route must not carry missing-MCP agents as dispatch targets'
      : 'agent requires_mcp_not_in_manifest and cannot be a dispatch target'));
  }
}
```

Keep this unchanged in meaning. Pattern-schema work must not widen the dispatch pool.

**Corpus enrichment pattern** (lines 1406-1435):

```javascript
const mmByName = new Map();
if (modeMap && Array.isArray(modeMap.entries)) {
  for (const me of modeMap.entries) {
    const candidates = new Set();
    if (me.id) candidates.add(String(me.id).toLowerCase());
    if (me.mode) candidates.add(String(me.mode).toLowerCase());
    for (const s of (me.recommended_skills || [])) if (s) candidates.add(String(s).toLowerCase());
    for (const a of (me.recommended_agents || [])) if (a) candidates.add(String(a).toLowerCase());
    const sp = Array.isArray(me.signal_patterns) ? me.signal_patterns : [];
    for (const c of candidates) {
      if (!mmByName.has(c)) mmByName.set(c, []);
      mmByName.get(c).push(...sp);
    }
  }
}
// ...
const sigs = mmByName.get(name.toLowerCase()) || [];
const sigText = sigs.length ? ' ' + sigs.join(' ') : '';
```

Replace raw `sp`/`join()` consumption with normalized values. Apply match semantics in this existing pipeline; do not create a second scorer. The warn-entry raw join at lines 1468-1477 must use the same values.

**Read-only fixture seam** (lines 2480-2499):

```javascript
export function inspectDecision(prompt, options = {}) {
  const opts = {
    cwd: process.cwd(),
    mutateCache: false,
    logTelemetry: false,
    emitInjection: false,
    bumpEvolution: false,
    includePrompt: false,
    manifestPath: MANIFEST,
    modeMapPath: MODE_MAP,
    ...options,
  };
```

Prefer existing explicit paths and temp files for synthetic fixtures. Add object injection only if it is smaller than temp-path setup and flows through this same function.

### `/Users/guilherme/.claude/router/mode-map.json` (config, transform)

**Analog:** Existing v2 entry schema, lines 36-65 and 188-204.

```json
{
  "id": "find-skills",
  "mode": null,
  "invoke_kind": "skill",
  "signal_patterns": [
    "find a skill",
    "is there a skill that",
    "discover skill"
  ],
  "recommended_skills": ["find-skills"],
  "recommended_agents": [],
  "args_hint": null
}
```

Raise the document to schema v3, retain strings for default `contains`, and use `{ "kind": "...", "value": "..." }` only for non-default semantics or explicit collision metadata. Curate exactly the eight named lifecycle routes and ten named design routes unless another route has distinct fixture evidence. Prune every entry to at most six artifact/outcome phrases.

The installed file is the only live mode-map found; no duplicate repository source exists. Planner must treat lifecycle/install verification as publication of this user-reviewed artifact, not invent a second canonical copy.

### `src/coverage/audit.mjs` (utility, batch + transform)

**Analog:** `typedMappings()`, lines 78-107 and 139-168.

```javascript
function typedMappings(modeMap, indexes) {
  const mapped = { command: new Set(), skill: new Set(), agent: new Set() };
  const diagnostics = [];
  if (!modeMap || !Array.isArray(modeMap.entries)) {
    diagnostics.push({ code: 'mode_map_malformed', route: '', target: '', category: 'mode_map',
      reason: 'mode-map entries must be an array' });
    return { mapped, diagnostics };
  }
  // deterministic shape and typed-target diagnostics
}
```

Reuse/export the router normalizer if the installed-module boundary permits it. Otherwise keep only a thin parity call or shared source import; do not independently define v3 semantics. Preserve deterministic sorted diagnostics and typed forward/reverse coverage.

### `router.calibrate.mjs` (utility/CLI, batch + transform)

**Analog:** Existing production-parity adapter, fixture loop, and safety report.

**Shared dry-run adapter** (lines 128-163):

```javascript
function dryRun(prompt, manifest, modeMap, cwd = process.cwd(), weights = null) {
  const out = R.inspectDecision(prompt, {
    cwd,
    mutateCache: false,
    logTelemetry: false,
    emitInjection: false,
    bumpEvolution: false,
    includePrompt: false,
    manifestPath: MANIFEST,
    modeMapPath: MODE_MAP,
    weights,
  });
  // adapt inspect output only
}
```

Fix the currently unused `manifest` and `modeMap` arguments through the smallest existing seam. Threshold evaluation must reuse `dryRun()`/`inspectDecision()`, never duplicate scoring.

**Fixture classification and evaluation loop** (lines 309-321 and 338-384):

```javascript
const originalCount = tasks.filter((t) =>
  !t.codebase && !t.evolution && !t.phase14_mapping
  && !String(t?.right?.edge || '').includes('COV-')).length;
// ...
for (const task of tasks) {
  // branch by fixture class
  result = dryRun(task.prompt, manifest, modeMap, task.cwd || process.cwd());
  const ev = evaluate(task, result);
  // ...
  if (!ok && result.tier === 'high') wrongHigh.push({ id: task.id, prompt: task.prompt, detail, taxonomy });
}
```

Add a distinct Phase 29 routing/calibration fixture class. Grid-search only labeled route samples; do not treat evolution/mapping fixtures as confidence samples.

**Safety report pattern** (lines 447-456):

```javascript
if (wrongHigh.length) {
  console.log('!! Wrong HIGH-confidence auto-routes (raise T_high per D-09):');
  for (const w of wrongHigh) {
    console.log(`   #${w.id} "${w.prompt}" — ${w.detail}`);
  }
}
console.log(`Thresholds: T_high=${modeMap.thresholds.T_high} T_low=${modeMap.thresholds.T_low} M=${modeMap.thresholds.M}`);
```

Select candidates lexicographically: reject wrong-high first, maximize correct routes next, then minimize misses, then prefer current/nearest stable values. Report affected-sample counts and leave-one-out sensitivity. No isotonic/Platt implementation.

### `calibration-tasks.json` (fixture/config, batch)

**Analog:** Original positive fixtures at lines 2-36, hard negative/pass-through fixtures at lines 51-60 and 89-98, and later typed fixture branches at lines 333-461.

```json
{
  "id": 3,
  "prompt": "redesign the dashboard to look high-end",
  "right": {
    "mode": "/gsd-ui-phase",
    "skills": ["high-end-visual-design"],
    "agents": [],
    "tier": "high",
    "status": "route",
    "edge": "design cluster (skill + slash)"
  }
}
```

Append labeled Phase 29 positives, sibling near-collisions, and negatives. Keep expected mode/skills/agents explicit. Use implicit intent and output language, not literal skill names.

### `tests/router.mode-map-v3.test.mjs` (test, transform)

**Analog:** `tests/router.route-targets.test.mjs`, lines 4-27 and 49-89.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { validateRouteTargets } = await import(HOOK);

test('source branches cover slash, skill, agent, and warn invoke kinds', () => {
  const manifest = fixtureManifest();
  const modeMap = { entries: [/* minimal typed fixtures */] };
  validateModeMapTargets(manifest, modeMap);
});
```

Use table-driven minimal objects for v2 strings, v3 strings/objects, malformed values, cap violations, and canonical duplicates. Assert semantic output/diagnostic codes rather than implementation internals.

### `tests/router.mode-map-curation.test.mjs` (test, request-response)

**Analogs:**

- Synthetic typed manifest: `tests/router.route-targets.test.mjs` lines 29-40.
- Temp-root isolation: `tests/router.coverage-audit.test.mjs` lines 13-60.
- Missing-MCP adversarial assertions: `tests/router.route-targets.test.mjs` lines 91-154.

```javascript
function fixtureManifest() {
  return {
    skills: [{ id: 'fixture-skill', name: 'fixture-skill', scope: 'global' }],
    commands: [],
    agents: [
      { id: 'safe-agent', name: 'safe-agent', requires_mcp_not_in_manifest: [] },
      { id: 'blocked-agent', name: 'blocked-agent', requires_mcp_not_in_manifest: ['context7'] },
    ],
  };
}
```

Build one neutral synthetic manifest containing the 18 required skill IDs and generic descriptions. Drive all positive/hard-negative cases through `inspectDecision`/`dryRun` with explicit fixture inputs. Assert blocked agents are absent from candidates and dispatch targets.

### `tests/router.calibration-thresholds.test.mjs` (test, batch + transform)

**Analog:** `tests/router.calibrate-importable.test.mjs`, lines 16-42.

```javascript
const C = await import(CALIBRATE_URL);

test('dryRun is pure: same inputs produce same output, no side effects on the manifest', () => {
  const manifest = { skills: [], agents: [], commands: [] };
  const modeMap = { entries: [], thresholds: { T_high: 0.6, T_low: 0.3, M: 0.2 } };
  const r1 = C.dryRun('hello world', manifest, modeMap, '/tmp');
  const r2 = C.dryRun('hello world', manifest, modeMap, '/tmp');
  const strip = (r) => { const { elapsed_ms, ...rest } = r; return rest; };
  assert.deepStrictEqual(strip(r1), strip(r2));
});
```

Test exported pure candidate enumeration/evaluation, deterministic tie-break, `wrongHigh === 0`, and leave-one-out summary. Keep CLI smoke coverage in the existing importable test pattern.

### `tests/router.route-targets.test.mjs` (test, transform)

Extend only for validator parity that belongs to existing target safety. Keep schema parser breadth in `router.mode-map-v3.test.mjs` and routing breadth in `router.mode-map-curation.test.mjs`.

### `coverage-report.json` (generated evidence, batch)

**Analog:** Builder publication test in `tests/router.coverage-audit.test.mjs`, lines 326-350.

```javascript
const strict = runBuilder({ strict: true });
assert.equal(strict.result.status, 1);
assert.ok(strict.report.unacknowledged_gaps.length > 0,
  'the complete report must be readable after strict failure');
```

Regenerate through `build-manifest.mjs`; never hand-edit. Phase completion evidence should show the 18 mapped targets removed from unacknowledged gaps while unrelated baseline policy remains unchanged.

## Shared Patterns

### One Pattern Normalizer

**Source:** `/Users/guilherme/.claude/hooks/router.mjs` loader/validator/corpus seams, lines 466-482, 656-669, and 1398-1435.  
**Apply to:** loader validation, target validation, corpus text, warn corpus entries, proposal sanitation, collision lint, and coverage parity.

Canonical internal shape should be the minimum required:

```javascript
{ kind: 'contains', value: 'normalized phrase', collision_group?: 'explicit-group' }
```

Strings normalize to `contains`. Permit only demonstrated kinds; omit regex.

### Fail Open at Prompt Time, Fail Closed Before Publication

**Sources:** `router.mjs` lines 466-482 and `tests/router.coverage-audit.test.mjs` lines 326-350.  
**Apply to:** malformed runtime reads return no route; validators/builders emit deterministic diagnostics and strict publication exits non-zero.

### Typed Target and Missing-MCP Safety

**Sources:** `router.mjs` lines 623-643 and 695-709; `tests/router.route-targets.test.mjs` lines 91-154.  
**Apply to:** every new lifecycle/design entry and synthetic fixture. Warning routes stay targetless; missing-MCP agents never enter scoring or dispatch lists.

### Fixture Isolation

**Source:** `tests/router.coverage-audit.test.mjs` lines 13-60.  
**Apply to:** curation and calibration tests. Use `mkdtempSync`, explicit paths/environment, and cleanup. Do not read the user's live manifest to prove portability.

### Calibration Reuses Production Decisions

**Source:** `router.calibrate.mjs` lines 128-163.  
**Apply to:** grid evaluation and sensitivity. Adapt `inspectDecision`; do not reproduce BM25, normalization, guards, or tier logic.

### Deterministic Diagnostics

**Source:** `src/coverage/audit.mjs` lines 18-35.  
**Apply to:** collision lint and threshold reports. Sort by stable keys and keep JSON-ready records free of private/runtime-only fields.

## No Analog Found

None. Every proposed Phase 29 artifact has a strong existing local pattern. No new abstraction, dependency, schema framework, or calibration library is justified.

## Metadata

**Analog search scope:** `/Users/guilherme/.claude/hooks`, `/Users/guilherme/.claude/router`, repository root, `src/coverage`, and `tests`  
**Files scanned:** 52 source/test matches plus live mode-map and calibration fixtures  
**Strong analogs read:** 8 files  
**Pattern extraction date:** 2026-07-29
