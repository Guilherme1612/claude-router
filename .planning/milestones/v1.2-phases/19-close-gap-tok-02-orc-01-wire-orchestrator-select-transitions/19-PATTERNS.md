# Phase 19: Close gap — TOK-02 + ORC-01 — wire orchestrator {select,transitions,budget} into publish-index.mjs + prompt-route.mjs live path + deployed bundle - Pattern Map

**Mapped:** 2026-07-17
**Files analyzed:** 8 primary (4 src modifications + 3 new sibling tuple files + 2 test extensions) + ~10 fixture-update wave files
**Analogs found:** 8 / 8 primary (all primary edit surfaces have a strong in-repo analog; the sibling tuple files reuse existing `durableWrite` rather than having their own analog)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/prompt/publish-index.mjs` (MODIFY: orchestrator calls + sibling writes + fallback delete :63-67) | service (publish-time orchestrator) | transform / file-I/O | self — existing `publishCompiledIndex` is the analog; `src/orchestrator/select.mjs:160` is the call-pattern analog | exact (self) |
| `src/prompt/compile-index.mjs` (MODIFY: schema 1→2, compatible() extension, loadCompiledIndex siblings) | service (compatibility gate + tuple reader) | file-I/O / request-response | self — existing `compatible()` (`:72-76`) + `verifyTuple` (`:118-132`) + `loadCompiledIndex` (`:106-177`) | exact (self) |
| `src/context/prompt-route.mjs` (MODIFY: read-only projection of baked siblings) | service (hot-path projection) | read-only file-I/O | self — existing `routeContextPrompt` (`:84-128`) + `compiledIndex.index.routes?.[workflowId]` projection (`:104`) | exact (self) |
| `src/lifecycle/router-lifecycle.mjs` (MODIFY: moduleNames +3 entries :308-317) | config (bundle manifest) | static array | self — existing `moduleNames` array (`:308-317`) + `moduleValues` deployment (`:318-320`) | exact (self) |
| `release-tuples/versions/<id>/closure.json` (NEW sibling tuple file) | data file | file-I/O (written at publish, read at route) | `release-tuples/versions/<id>/index.json` written via `durableWrite` in `publish-index.mjs:84` | role-match (sibling reuse of durableWrite) |
| `release-tuples/versions/<id>/budget.json` (NEW sibling tuple file) | data file | file-I/O | same as above | role-match |
| `release-tuples/versions/<id>/summary-index.json` (NEW sibling tuple file) | data file | file-I/O | same as above | role-match |
| `tests/router.autonomous-lifecycle.test.mjs` (EXTEND D-09) | test (E2E) | event-driven / request-response | self — existing `test(...)` blocks at `:35-138` using `stubVerificationRunners` + `inProcessControllerLauncher` + `waitUntil`/`tupleId` | exact (self) |
| `tests/router.test-mode-seam.test.mjs` (EXTEND D-09) | test (E2E seam) | event-driven | self — existing opt-in seam test (`:56-101`) + static-invariant test (`:103-110`) | exact (self) |
| ~10 test files referencing `schema_version: 1` / `COMPILED_INDEX_COMPATIBILITY` (fixture wave) | test (fixtures) | n/a | self — each carries its own fixtures; the wave is a schema-bump sweep, not a pattern copy | exact (self, mechanical sweep) |

## Pattern Assignments

### `src/prompt/publish-index.mjs` (service, publish-time transform + file-I/O)

**Analog:** self — the existing `publishCompiledIndex` body is the integration surface. The orchestrator call pattern is borrowed from `tests/router.workflow-orchestrator.test.mjs` fixtures.

**Imports pattern** (lines 1-5):
```javascript
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { stableStringify } from '../registry/schema.mjs';
import { COMPILED_INDEX_COMPATIBILITY, COMPILED_INDEX_SCHEMA_VERSION, loadCompiledIndex } from './compile-index.mjs';
```
**NEW imports (D-01 — add alongside existing):**
```javascript
import { selectCapabilities, resolveDependencies } from '../orchestrator/select.mjs';
import { selectWorkflow, nextValidTransitions, WORKFLOW_TRANSITIONS } from '../orchestrator/transitions.mjs';
import { planContextLoad, DEFAULT_CONTEXT_CONTRACT, CONTEXT_CONTRACT_VERSION, ESTIMATOR_VERSION, validateContextContract } from '../orchestrator/budget.mjs';
```

**durableWrite pattern — reuse for new sibling files** (lines 10-14):
```javascript
function durableWrite(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  const fd = openSync(path, 'wx', 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
}
```
NEW: `durableWrite(join(tupleRoot, 'closure.json'), json(closureResult))` — same call shape as `:84` (`durableWrite(join(tupleRoot, 'index.json'), compiledBytes)`).

**Core publish pattern — the route-building loop to extend** (lines 54-67):
```javascript
export function publishCompiledIndex({ ownedRoot, registry, registryVersionId, mapping, policyFingerprint, now = Date.now(), crashAt } = {}) {
  const root = resolve(ownedRoot);
  if (!registry || !Array.isArray(registry.records) || !/^v1-[a-f0-9]{16}$/.test(registryVersionId || '')) throw new TypeError('verified registry version required');
  const records = new Map(registry.records.flatMap(record => [record.id, record.canonical_identity, record.name].filter(Boolean).map(key => [key, record])));
  const routes = {};
  for (const subject of mapping?.subjects || []) {
    const record = records.get(subject.target_id);
    if (subject.disposition === 'mapped' && record) routes[subject.subject_id] = routeFor(subject, record);
  }
  if (!Object.keys(routes).length) { /* D-06 DELETE :63-67 */ }
  if (!Object.keys(routes).length) throw new TypeError('compiled index requires at least one dispatch route');
  // ...continues at :69 with tupleRoot resolution + durableWrite calls (:81-91)
```
D-06 removes the entire `if (!Object.keys(routes).length) { for ... }` block at `:63-67`. The `:68` throw becomes the only empty-mapping path.

**Manifest shape to extend with sibling hashes** (lines 85-91):
```javascript
const manifest = { schema_version: 1, state: 'verified', tuple_version_id: tupleVersionId,
  registry: { version_id: registryVersionId, payload_sha256: registryHash },
  compiled: { version_id: compiledVersionId, payload_sha256: compiledHash },
  policy_fingerprint: policyFingerprint || sha256('{}'), mapping_fingerprint: mappingFingerprint,
  compatibility: COMPILED_INDEX_COMPATIBILITY, verification: { disposition: 'passing', complete: true },
  created_at: now, expires_at: now + 30 * 24 * 60 * 60 * 1000 };
```
NEW siblings need manifest entries (planner discretion per Security Domain V6): either extend `manifest.compiled` or add `manifest.closure` / `manifest.budget` / `manifest.summary_index` payload_sha256 fields so the fail-closed integrity gate (`compile-index.mjs:121-132`) verifies them.

**Orchestrator call pattern** (from `tests/router.workflow-orchestrator.test.mjs` fixtures — the only existing call site):
```javascript
// transitions.mjs:69,143 — bake candidate set, then select
const transitions = nextValidTransitions(evidence);   // evidence = { status, freshness, position, gates, dependencies_safe }
const selected = selectWorkflow(transitions, explicitIntent);
// select.mjs:160 — closure requires workflowDeclarations + registry
const closure = selectCapabilities({ workflow: selected, workflowDeclarations, registry, requestedScope });
// budget.mjs:131 — budget requires workflow + closure + contract + sources + summaryIndex
const budget = planContextLoad({ workflow: selected, closure, contract: DEFAULT_CONTEXT_CONTRACT, sources, summaryIndex });
```
**Per-workflow vs per-tuple scope (Pitfall 3):** Sibling file shape should be a per-workflow-keyed map (`closure.json = { "<workflow_id>": {...} }`) to mirror the existing `index.routes?.[workflowId]` projection at `prompt-route.mjs:104`. This is Claude's Discretion per CONTEXT.md.

**Error handling pattern** — fail-closed via throw (existing convention):
```javascript
if (!Object.keys(routes).length) throw new TypeError('compiled index requires at least one dispatch route'); // :68
// ... existing :94, :96, :98 — crash injection + tuple validation throws
if (!verified.dispatch_eligible || verified.tuple_version_id !== tupleVersionId) throw new Error('tuple_validation_failed');
```
NEW orchestrator-blocked paths should follow the same throw-on-bad-input convention OR bake the blocked `dispatch_eligible: false` flag into the sibling and let the route path observe it (D-03 pattern — required-overflow → non-dispatchable at publish).

**Signature extension point** (line 54): add `workflowDeclarations` and per-workflow `evidence` parameters OR derive inside from `registry` + `mapping` — the load-bearing Open Question Q1 the planner must resolve first.

---

### `src/prompt/compile-index.mjs` (service, compatibility gate + read-only tuple load)

**Analog:** self — existing `compatible()`, `verifyTuple`, `loadCompiledIndex`.

**Schema version + compatibility constants** (lines 5-10):
```javascript
export const COMPILED_INDEX_SCHEMA_VERSION = 1;  // → 2 per D-04
export const COMPILED_INDEX_COMPATIBILITY = Object.freeze({
  router_contract: 'prompt-route-v1',
  policy_version: 'workflow-transitions-v1',
  capsule_schema_version: 1,
  // NEW (D-04): extend with orchestrator contract markers, e.g.
  // orchestrator_contract_version: 'workflow-first-v1',
  // context_contract_version: CONTEXT_CONTRACT_VERSION,
});
```

**compatible() — extend with new members** (lines 72-76):
```javascript
function compatible(value) {
  return value?.router_contract === COMPILED_INDEX_COMPATIBILITY.router_contract
    && value?.policy_version === COMPILED_INDEX_COMPATIBILITY.policy_version
    && value?.capsule_schema_version === COMPILED_INDEX_COMPATIBILITY.capsule_schema_version;
    // NEW: && value?.orchestrator_contract_version === ... && value?.context_contract_version === ...
}
```
Import `CONTEXT_CONTRACT_VERSION` from `src/orchestrator/budget.mjs:4` if adding it to compatibility.

**boundedJson + verifyTuple — pattern for reading sibling files** (lines 34-52, 118-132):
```javascript
function boundedJson(path, limit, io) {
  if (!contained(io.root, path)) return null;
  // O_NOFOLLOW, size limit, atomic read, JSON.parse
}
// verifyTuple reads manifest + registry + index, verifies hashes:
const manifestRead = boundedJson(resolve(versionRoot, 'manifest.json'), COMPILED_INDEX_LIMITS.metadata_bytes, io);
const registryRead = boundedJson(resolve(versionRoot, 'registry.json'), COMPILED_INDEX_LIMITS.payload_bytes, io);
const indexRead = boundedJson(resolve(versionRoot, 'index.json'), COMPILED_INDEX_LIMITS.payload_bytes, io);
// ... sha256(registryRead?.bytes) === manifest.registry?.payload_sha256 ...
```
NEW: read `closure.json` / `budget.json` / `summary-index.json` with the same `boundedJson(...)` pattern; add size limits (e.g. extend `COMPILED_INDEX_LIMITS` with `closure_bytes`, `budget_bytes`, `summary_index_bytes` — Pitfall 5 warning).

**loadCompiledIndex return shape — additive extension** (lines 137-152):
```javascript
if (verified) return { status: 'ready', dispatch_eligible: true, reason_code: 'release_tuple_active',
  tuple_version_id: tupleActive.tuple_version_id, version_id: verified.manifest.compiled.version_id,
  registry_version_id: verified.manifest.registry.version_id, source: 'active',
  registry: verified.registry, index: verified.index };
// NEW (D-05): add closure, budget, summaryIndex to the returned object — additive, behind the
// same dispatch_eligible gate. Planner discretion: sub-object vs flat — pick whichever keeps
// validRoutes() and the hot-path read surface smallest (CONTEXT.md Claude's Discretion).
```

**validRoutes() — UNCHANGED (D-05 locks dispatch surface)** (lines 54-70): keep `routes[]` shape and the `ROUTE_FIELDS` set as-is. Sibling files are NOT part of `validRoutes()` validation.

---

### `src/context/prompt-route.mjs` (service, read-only projection)

**Analog:** self — existing `routeContextPrompt` at `:84-128`.

**Imports pattern** (lines 1-4):
```javascript
import { loadCapsule, saveCapsule } from './capsule.mjs';
import { normalizeContextInstruction, resolveContextAction } from './resolve.mjs';
import { assembleRefreshEvidence, collectAuthoritativeSnapshot } from './sources.mjs';
import { loadCompiledIndex } from '../prompt/compile-index.mjs';
```
**No new imports — D-08 locks the hook import graph unchanged.** The route path must NOT import `src/orchestrator/*` (anti-pattern, RESEARCH.md lines 236-238).

**Read-only projection pattern** (line 91, 104):
```javascript
const compiledIndex = loadCompiledIndex({ ownedRoot, now, ...(compiledFs ? { fs: compiledFs } : {}) });
// ...
const workflowId = resolution.outcome === 'override' ? resolution.action?.workflow : capsule?.position?.workflow;
const projection = compiledIndex.index.routes?.[workflowId];  // unchanged dispatch surface
```
NEW (D-05): apply the same `?.[workflowId]` projection to baked siblings:
```javascript
// Read-only projection — NO orchestrator calls (D-01/D-02)
const closure = compiledIndex.closure?.[workflowId];
const budget = compiledIndex.budget?.[workflowId];
const summaryIndex = compiledIndex.summaryIndex;
```

**compiled return field — additive extension** (lines 120-125):
```javascript
...(projection ? { compiled: {
  version_id: compiledIndex.version_id, source: compiledIndex.source,
  ...(compiledIndex.tuple_version_id ? { tuple_version_id: compiledIndex.tuple_version_id, registry_version_id: compiledIndex.registry_version_id } : {}),
  workflow_id: projection.workflow_id, transition_id: projection.transition_id,
  reason_code: projection.reason_code,
} } : {}),
```
NEW: extend with `closure`, `budget`, `summaryIndex` keys, behind the same `projection ?` gate. Pitfall 5: only read siblings when a dispatch-eligible route exists — do not load them on blocked paths.

**dispatch_eligible gate (D-03)** (lines 92-98, 105-111): the existing block-on-no-projection pattern is the model for the new `dispatch_eligible` flag from baked budget:
```javascript
if (resolution.dispatch_eligible && !projection) {
  const blockedResolution = { outcome: 'blocked', dispatch_eligible: false, reason_code: 'compiled_workflow_missing', ... };
  return { handled: true, resolution: blockedResolution, additional_context: injection(blockedResolution) };
}
```
NEW: observe `compiledIndex.budget?.[workflowId]?.dispatch_eligible === false` (required-overflow baked at publish) and synthesize the same blocked resolution.

---

### `src/lifecycle/router-lifecycle.mjs` (config, bundle manifest)

**Analog:** self — existing `moduleNames` array at `:308-317`.

**moduleNames array — the D-07 extension point** (lines 308-317):
```javascript
const moduleNames = [
  'registry/build.mjs', 'registry/schema.mjs', 'registry/identity.mjs',
  'registry/fingerprint.mjs', 'registry/diff.mjs', 'registry/watcher.mjs',
  'registry/map.mjs', 'registry/validate.mjs', 'registry/activate.mjs',
  'registry/reconcile.mjs', 'registry/hook-reconcile.mjs',
  'adapters/claude.mjs', 'adapters/codex.mjs',
  'cli/router-control.mjs',
  'context/capsule.mjs', 'context/resolve.mjs', 'context/sources.mjs',
  'context/prompt-route.mjs', 'prompt/compile-index.mjs', 'prompt/publish-index.mjs',
  // D-07 NEW: add these 3 entries so the bundled controller can import the orchestrator at publish time
  'orchestrator/select.mjs', 'orchestrator/transitions.mjs', 'orchestrator/budget.mjs',
];
```

**moduleValues deployment — unchanged pattern** (lines 318-320):
```javascript
const moduleValues = [p.ownedRoot, p.codexOwnedRoot].flatMap(runtimeRoot => (
  moduleNames.map(name => [join(runtimeRoot, 'modules', name), readFileSync(join(sourceRoot, name))])
));
```
Just adding the 3 names is sufficient — the deployment loop handles both claude and codex runtime `modules/` dirs. No other change needed.

---

### `release-tuples/versions/<id>/{closure,budget,summary-index}.json` (data files, file-I/O)

**Analog:** `release-tuples/versions/<id>/index.json` — written by `durableWrite` at `publish-index.mjs:84`, read by `boundedJson` at `compile-index.mjs:123`.

**Write pattern (publish side) — reuse existing `durableWrite`** (`publish-index.mjs:10-14` + `:84`):
```javascript
durableWrite(join(tupleRoot, 'index.json'), compiledBytes);
// NEW siblings — same call shape, inside the `if (!existsSync(tupleRoot))` block at :81-91:
durableWrite(join(tupleRoot, 'closure.json'), json(closureByWorkflow));
durableWrite(join(tupleRoot, 'budget.json'), json(budgetByWorkflow));
durableWrite(join(tupleRoot, 'summary-index.json'), json(summaryIndexRef));
```

**Hash registration — manifest extension (Security V6 requirement)** (`publish-index.mjs:85-91`):
The existing manifest carries `registry.payload_sha256` + `compiled.payload_sha256`. The new siblings MUST either get their own manifest entries (recommended — fails closed on sibling tampering) or be hashed into an aggregate. Pattern to copy:
```javascript
compiled: { version_id: compiledVersionId, payload_sha256: compiledHash },
// NEW:
closure: { payload_sha256: sha256(closureBytes) },
budget: { payload_sha256: sha256(budgetBytes) },
summary_index: { payload_sha256: sha256(summaryIndexBytes) },
```

**Read pattern (compile side) — reuse `boundedJson`** (`compile-index.mjs:34-52, :121-123`):
```javascript
const closureRead = boundedJson(resolve(versionRoot, 'closure.json'), COMPILED_INDEX_LIMITS.closure_bytes, io);
// Verify hash against manifest.closure.payload_sha256 — same pattern as :128-129
```

**Field shape (Claude's Discretion, Pitfall 3):** per-workflow-keyed map recommended to mirror `routes?.[workflowId]`:
```json
{
  "schema_version": 1,
  "by_workflow": {
    "gsd-execute-phase": { "closure": [...], "invokable_capabilities": [...], "required_models": [], ... }
  }
}
```
Align inner shapes with existing `selectCapabilities` return (`select.mjs:128-139`: `closure`, `invokable_capabilities`, `required_models`, `required_permissions`, `lifecycle_bindings`) and `planContextLoad` report (`budget.mjs:200-209`: `contract_version`, `estimator_version`, `total_max_bytes`, `canonical_bytes`, `estimated_tokens`, `included_sources`, `omitted_sources`, `regression_delta`).

---

### `tests/router.autonomous-lifecycle.test.mjs` (test, E2E — EXTEND D-09)

**Analog:** self — existing `test(...)` block at `:35-138` + `verify(operation)` helper at `:73-121`.

**Test scaffolding pattern** (lines 1-33):
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { installRouter } from '../src/lifecycle/router-lifecycle.mjs';
import { buildFullRegistry } from '../src/registry/build.mjs';
import { loadCompiledIndex } from '../src/prompt/compile-index.mjs';
import { saveCapsule } from '../src/context/capsule.mjs';
import { routeContextPrompt } from '../src/context/prompt-route.mjs';
import { stubVerificationRunners, inProcessControllerLauncher } from './helpers/test-mode-seam.mjs';

async function waitUntil(predicate, timeoutMs = 2_000) { /* :20-28 */ }
function tupleId(root) { /* :30-33 */ }
```

**installRouter + seam options pattern** (lines 45-54):
```javascript
const options = {
  claudeRoot, codexRoot, sourceRouter, settingsPath, nodeBinary: process.execPath,
  debounceMs: 10, repairMs: 60_000,
  testMode: true, verificationRunners: stubVerificationRunners,
  launchController: inProcessControllerLauncher(stubVerificationRunners, holder),
};
const installed = await installRouter(options);
const initialTuple = await waitUntil(() => tupleId(ownedRoot));
```

**Assertion pattern — D-09 extends this with closure/budget/summary-index presence** (lines 107-117):
```javascript
const compiled = loadCompiledIndex({ ownedRoot });
assert.equal(compiled.dispatch_eligible, true);
assert.equal(compiled.tuple_version_id, published);
const routed = routeContextPrompt({ prompt: 'continue', ownedRoot, projectRoot: root });
assert.equal(routed.compiled?.tuple_version_id, published);
const alphaRoute = compiled.index.routes.alpha;
assert.equal(alphaRoute.dispatch_eligible, true);
// D-09 NEW assertions:
// assert.ok(compiled.closure, 'closure sibling present');
// assert.ok(compiled.budget, 'budget sibling present');
// assert.ok(compiled.summaryIndex, 'summary-index sibling present');
// assert.equal(compiled.budget.by_workflow?.alpha?.dispatch_eligible, true);  // TOK-02
```

**ORC-01 no-fallback assertion (D-09):** add a test that publishes with an empty `mapping.subjects` and expects the `:68` throw path (no `canonical_record` route). Pattern: drive via filesystem state that produces an empty mapping, then assert `loadCompiledIndex` falls through to `blocked()` OR publish throws. The `verify('disable')` branch at `:83-96` is the model for blocked-path assertions.

**TOK-02 required-overflow assertion (D-09):** add a test where a required source exceeds `DEFAULT_CONTEXT_CONTRACT.total_max_bytes` (12288) at publish; assert `budget.by_workflow[workflowId].dispatch_eligible === false` and the route path observes it (matches `:105-110` blocked-resolution pattern).

**Flow 11 dispatch_eligible assertion (D-09):** extend the existing `assert.equal(alphaRoute.dispatch_eligible, true)` check to assert the budget-backed `dispatch_eligible` flips to PASS for a normal publish (the existing `:115` assertion is the skeleton to extend).

**Cleanup pattern (must preserve)** (lines 131-137):
```javascript
} finally {
  try { await holder.child?.kill(); } catch {}
  rmSync(root, { recursive: true, force: true });
}
```

---

### `tests/router.test-mode-seam.test.mjs` (test, E2E seam — EXTEND D-09)

**Analog:** self — existing opt-in test at `:56-101` + static-invariant test at `:103-110`.

**Existing seam assertion pattern** (lines 77-93):
```javascript
const installed = await installRouter(options);
const initialTuple = tupleId(ownedRoot);
writeFileSync(join(claudeRoot, 'skills', 'beta.json'), artifact('beta'));
const published = await waitUntil(() => {
  const current = tupleId(ownedRoot);
  return current && current !== initialTuple ? current : null;
});
const compiled = loadCompiledIndex({ ownedRoot });
assert.equal(compiled.dispatch_eligible, true);
assert.equal(compiled.tuple_version_id, published);
const config = JSON.parse(readFileSync(installed.controllerConfigPath, 'utf8'));
assert.equal(config.test_mode, true);
```

**D-09 NEW assertions — bundle presence of orchestrator modules** (extend the existing test):
```javascript
// Orchestrator modules deployed into the bundled runtime modules/ dir (D-07)
for (const name of ['orchestrator/select.mjs', 'orchestrator/transitions.mjs', 'orchestrator/budget.mjs']) {
  const deployed = join(ownedRoot, 'modules', name);
  assert.equal(readFileSync(deployed, 'utf8'), readFileSync(join('src', name), 'utf8'), `${name} deployed in bundle`);
}
// Baked closure readable from tuple (D-01)
assert.ok(compiled.closure, 'closure sibling baked by publish-time orchestrator');
```

**Static-invariant pattern — preserve** (lines 103-110):
```javascript
test('opt-in test_mode seam test file does not import the compiled-index publisher (controller publishes on its own)', () => {
  const source = readFileSync(new URL(import.meta.url), 'utf8');
  const forbidden = ['publish', 'Compiled', 'Index'].join('');
  assert.equal(source.includes(forbidden), false);
  assert.equal(source.includes('from \'../src/prompt/publish-index.mjs\''), false);
});
```
When extending this file, the new assertions must still respect this invariant — do NOT import `publishCompiledIndex` directly; the seam must prove the real watcher→controller→publish path. Also: do NOT import `src/orchestrator/*` into the test (the route path must not import them; tests asserting the route path should mirror that constraint where relevant).

---

### ~10 test files — fixture-update wave (test, mechanical sweep)

**Analog:** each file's own fixtures. This is a schema-bump sweep, not a pattern copy.

**Files (from grep):**
- `tests/router.compiled-index.test.mjs` — fixtures at `:19` (`capsule_schema_version: 1`), `:26, :49, :60, :67` (schema_version: 1 in tuples/pointers/known-good), `:80, :85, :101, :102, :112` (registry/mapping/capsule fixtures with schema_version: 1).
- `tests/router.lifecycle-recovery.test.mjs` — fixtures at `:14, :17, :21, :62, :107, :316`.
- `tests/router.evolution-visibility.test.mjs`
- `tests/router.registry-watcher.test.mjs`
- `tests/router.evolve-proposal.test.mjs`
- `tests/router.registry-diff.test.mjs`
- `tests/router.weights-blend.test.mjs`
- `tests/router.evolve-integration.test.mjs`
- `tests/router.context-prompt-integration.test.mjs`
- `tests/router.registry-schema.test.mjs`

**Pattern:** audit each for `schema_version: 1` / `COMPILED_INDEX_SCHEMA_VERSION` / `COMPILED_INDEX_COMPATIBILITY` hardcodes. Bump tuple `schema_version` to `2` and extend compatibility objects with the new members chosen in the compile-index.mjs edit. Leave registry/mapping/capsule `schema_version: 1` alone (those are unrelated schemas — careful not to bulk-replace).

**Warning (Pitfall 4):** `tests/router.lifecycle-recovery.test.mjs` and `tests/router.compiled-index.test.mjs` call `publishCompiledIndex` directly; audit for empty-`mapping.subjects` publish calls that depended on the removed `canonical_record` fallback (D-06). Every publish must now provide at least one mapped subject.

---

## Shared Patterns

### Durable write + atomic pointer + LKG recovery
**Source:** `src/prompt/publish-index.mjs:10-24` (`durableWrite`, `replacePointer`), `:40-52` (`recoverReleaseTuple`), `:81-99` (tuple write + active/known-good pointer swap).
**Apply to:** new sibling tuple files (`closure.json`, `budget.json`, `summary-index.json`).
```javascript
function durableWrite(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  const fd = openSync(path, 'wx', 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
}
```
The new siblings are written inside the existing `if (!existsSync(tupleRoot))` block at `:81-91` — they reuse the same tuple version directory, atomic pointer, and LKG recovery path. No new recovery mechanism.

### Bounded read with integrity gate
**Source:** `src/prompt/compile-index.mjs:34-52` (`boundedJson` with `O_NOFOLLOW`, size limit, atomic read), `:118-132` (`verifyTuple` hash checks).
**Apply to:** route-path read of new siblings (via `loadCompiledIndex` extension).
```javascript
function boundedJson(path, limit, io) {
  if (!contained(io.root, path)) return null;
  // O_NOFOLLOW + size limit + atomic read + JSON.parse — returns { value, bytes } or null
}
// verifyTuple: sha256(registryRead.bytes) === manifest.registry?.payload_sha256
//              sha256(indexRead.bytes) === manifest.compiled?.payload_sha256
```
NEW siblings must follow the same `boundedJson` + hash verification pattern. The `COMPILED_INDEX_LIMITS` object (`:11-18`) should be extended with per-sibling size limits.

### Fail-closed error handling
**Source:** `src/prompt/publish-index.mjs:56, :68, :94, :96, :98` (throw on invalid input / empty routes / tuple validation failure); `src/prompt/compile-index.mjs:22-27` (`blocked()` helper returning `dispatch_eligible: false`).
**Apply to:** all publish-time orchestrator-blocked paths and route-path blocked resolutions.
```javascript
const blocked = () => ({ status: 'blocked', dispatch_eligible: false, reason_code: 'no_compatible_compiled_index', diagnostic: '...' });
// OR throw at publish: throw new TypeError('compiled index requires at least one dispatch route');
```
Convention: publish-time hard failures throw (caller — the watcher — surfaces them as publication failure); route-time soft failures return `blocked()` (caller — the hook — passes through unchanged per fail-open). The orchestrator modules themselves use `blocked(reason_code, facts)` (`select.mjs:9-11`, `budget.mjs:34`, `transitions.mjs:21-23`) — bake that blocked result into the sibling file's `dispatch_eligible: false` flag rather than re-deriving.

### Orchestrator blocked-result shape (consume as-is)
**Source:** `src/orchestrator/select.mjs:9-11, :160-189`, `transitions.mjs:21-23, :143-183`, `budget.mjs:34, :131-211`.
**Apply to:** publish-time orchestrator calls inside `publishCompiledIndex`.
```javascript
// selectCapabilities returns { status: 'resolved' | 'blocked', dispatch_eligible, reason_code, closure, ... }
// selectWorkflow      returns { status: 'selected' | 'blocked' | 'clarification_required', dispatch_eligible, selection?, ... }
// planContextLoad     returns { status: 'planned' | 'blocked', dispatch_eligible, reason_code, report?, ... }
```
When a route's orchestrator result is `blocked` or `dispatch_eligible: false`, bake that flag into the per-workflow sibling entry so the route path reads `dispatch_eligible: false` and synthesizes the existing blocked resolution (`prompt-route.mjs:105-110`).

### E2E seam (test_mode opt-in)
**Source:** `tests/helpers/test-mode-seam.mjs:7-12` (`stubVerificationRunners`), `:25-80` (`inProcessControllerLauncher`); consumed in `tests/router.autonomous-lifecycle.test.mjs:45-54` and `tests/router.test-mode-seam.test.mjs:65-70`.
**Apply to:** D-09 assertions — extend the existing tests, do NOT build a new harness.
```javascript
const options = {
  // ... claudeRoot, codexRoot, sourceRouter, settingsPath, nodeBinary ...
  testMode: true, verificationRunners: stubVerificationRunners,
  launchController: inProcessControllerLauncher(stubVerificationRunners, holder),
};
const installed = await installRouter(options);
const published = await waitUntil(() => tupleId(ownedRoot));
```
D-09 asserts on `loadCompiledIndex({ ownedRoot })` output — the same surface the existing tests use. No new seam entry point.

## No Analog Found

None for the primary edit surfaces — every modification target has itself as the analog (wiring phase, not a build phase). The new sibling tuple files reuse the existing `durableWrite` / `boundedJson` patterns rather than needing a separate analog.

The single load-bearing design decision without an analog is the orchestrator-input sourcing (RESEARCH.md Open Question Q1): `workflowDeclarations` and per-workflow `evidence` have **no production source** — they appear only in `tests/router.workflow-orchestrator.test.mjs` fixtures (`workflowDeclaration()` at `:36-43`, `evidence()` at `:12-21`). The planner must resolve this before implementation. Options cited in RESEARCH.md:
- (a) new `publishCompiledIndex` parameters passed from the watcher (`src/registry/watcher.mjs:338-343` — would need extending the call site + config)
- (b) derive from registry/mapping metadata inside `publishCompiledIndex` (registry records currently lack `owners`/`requirements` — would need a static declarations file bundled with the controller)
- (c) static declarations source file

The `evidence()` fixture shape (`tests/router.workflow-orchestrator.test.mjs:12-21`) is the only concrete template for what `evidence` must contain at publish:
```javascript
{
  status: 'active',
  freshness: 'fresh',
  position: { family: 'gsd', state: 'planned' },
  gates: { plan_approved: true },
  dependencies_safe: true,
}
```
Publish bakes for all workflows, not one live capsule position — so `evidence.position.state` is ambiguous at publish time. RESEARCH.md Open Question 2 recommends option (b): bake the full `nextValidTransitions` candidate set per family so the route path filters by capsule position at read time (a pure read — D-01/D-02 compliant).

## Metadata

**Analog search scope:**
- `src/prompt/` (publish-index.mjs, compile-index.mjs)
- `src/context/` (prompt-route.mjs)
- `src/lifecycle/` (router-lifecycle.mjs)
- `src/orchestrator/` (select.mjs, transitions.mjs, budget.mjs — call-pattern analogs)
- `src/registry/` (watcher.mjs:338-343 — only `publishCompiledIndex` call site)
- `tests/` (autonomous-lifecycle, test-mode-seam, workflow-orchestrator, helpers/test-mode-seam, ~10 fixture-update candidates via grep)
- `release/v1.2-matrix.json` (Q3 — optional additive secondary evidence)

**Files scanned:** ~20 (4 src edit surfaces read in full, 3 orchestrator modules read in full, 3 test files read in full, ~10 fixture-wave candidates identified via grep)

**Pattern extraction date:** 2026-07-17