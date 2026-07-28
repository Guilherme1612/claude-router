# Phase 26: Coherent Publication and Dual-Runtime Release - Pattern Map

**Mapped:** 2026-07-28
**Files analyzed:** 12 likely new/modified files
**Analogs found:** 12 / 12

## File Classification

Phase 26 should extend the existing control plane. No second publisher,
installer, verifier, canary, rollback, recovery, or prompt router is needed.

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/prompt/publish-index.mjs` | publisher/service | file-I/O, transform | existing tuple publisher in the same file | exact |
| `src/prompt/compile-index.mjs` | loader/validator | bounded file-I/O, request-response | existing tuple verifier and known-good loader in the same file | exact |
| `src/registry/reconcile.mjs` | service | batch, graph transform | existing transitive reference invalidation in the same file | exact |
| `src/registry/build.mjs` | service | batch, transform | `src/registry/reconcile.mjs` canonical ordering/fingerprinting | role-match |
| `src/registry/watcher.mjs` | controller | event-driven | existing watcher activation/publication seam | exact |
| `src/lifecycle/router-lifecycle.mjs` | lifecycle service | file-I/O, event-driven | existing verified installation generations in the same file | exact |
| `install-router.mjs` | CLI/controller | request-response | existing lifecycle CLI in the same file | exact |
| `src/context/prompt-route.mjs` | route/hook | request-response | existing compiled projection lookup in the same file | exact |
| `src/release/run-release.mjs` | release orchestrator | batch, subprocess | existing staged release gates in the same file | exact |
| `tests/router.registry-reconcile.test.mjs` | test | batch, transform | existing full/incremental byte-equivalence test | exact |
| `tests/router.lifecycle-recovery.test.mjs` | integration test | event-driven, file-I/O | existing installed-controller crash/recovery tests | exact |
| `tests/router.compiled-evolution.test.mjs` | performance/release test | request-response, batch | existing isolated REL-01 gate | exact |

## Pattern Assignments

### `src/prompt/publish-index.mjs` (publisher, atomic file-I/O)

**Analog:** `src/prompt/publish-index.mjs`

**Durable pointer replacement pattern** (lines 14-27):

```js
function durableWrite(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  const fd = openSync(path, 'wx', 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
}

function replacePointer(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp.${randomUUID()}`;
  const fd = openSync(temporary, 'wx', 0o600);
  try { writeFileSync(fd, json(value)); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temporary, path);
  const dir = openSync(dirname(path), 'r');
  try { fsyncSync(dir); } finally { closeSync(dir); }
}
```

**Immutable tuple assembly pattern** (lines 196-230):

```js
const registryBytes = json(registry);
const registryHash = sha256(registryBytes);
const mappingFingerprint = mapping?.policy_fingerprint || sha256(json(mapping || {}));
const seed = `${registryVersionId}:${registryHash}:${mappingFingerprint}:${policyFingerprint || ''}`;
const compiledVersionId = `v1-${sha256(seed).slice(0, 16)}`;
const compiledBytes = json(index);
const compiledHash = sha256(compiledBytes);
const tupleVersionId = `t1-${sha256(`${registryHash}:${compiledHash}`).slice(0, 16)}`;
const tupleRoot = join(root, 'release-tuples', 'versions', tupleVersionId);
if (!existsSync(tupleRoot)) {
  mkdirSync(tupleRoot, { recursive: true });
  durableWrite(join(tupleRoot, 'registry.json'), registryBytes);
  durableWrite(join(tupleRoot, 'index.json'), compiledBytes);
  // Write every sibling before publishing the pointer.
}
```

Extend the tuple manifest and tuple fingerprint with contracts,
relationships, intent policy, workflow routes, health policy, and suggestion
references. Write and verify every member before replacing `active.json`.
`crashAt` injection belongs before pointer replacement so partial work remains
inactive.

**Recovery pattern** (lines 44-55):

```js
const candidate = loadCompiledIndex({ ownedRoot: root, now, releaseTuplePointer: pointer });
if (!candidate.dispatch_eligible || !candidate.tuple_version_id) {
  throw new Error('no_verified_release_tuple');
}
replacePointer(join(root, 'release-tuples', 'active.json'), pointer);
const repaired = loadCompiledIndex({ ownedRoot: root, now });
if (!repaired.dispatch_eligible || repaired.tuple_version_id !== candidate.tuple_version_id) {
  throw new Error('tuple_recovery_failed');
}
```

### `src/prompt/compile-index.mjs` (bounded tuple loader/validator)

**Analog:** `src/prompt/compile-index.mjs`

**Bounded, no-follow reader pattern** (lines 18-38, 54-71):

```js
export const COMPILED_INDEX_LIMITS = Object.freeze({
  pointer_bytes: 4 * 1024,
  metadata_bytes: 8 * 1024,
  payload_bytes: 64 * 1024,
  registry_bytes: 1024 * 1024,
  closure_bytes: 64 * 1024,
  budget_bytes: 32 * 1024,
  summary_index_bytes: 16 * 1024,
});

fd = io.openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
const info = io.fstatSync(fd);
if (!info.isFile() || info.size > limit) return null;
```

Add explicit byte limits for new tuple siblings. Hash-check every sibling
against the one manifest and reject unknown/mixed/incomplete tuples.

**Last-known-good pattern** (lines 178-193):

```js
const tupleActive = boundedJson(tupleActivePath, COMPILED_INDEX_LIMITS.pointer_bytes, io)?.value;
if (tupleActive) {
  const verified = verifyTuple(tupleActive);
  if (verified) return { status: 'ready', dispatch_eligible: true, source: 'active', /* tuple */ };
  const knownGood = boundedJson(resolve(tupleRoot, 'known-good.json'),
    COMPILED_INDEX_LIMITS.pointer_bytes, io)?.value;
  const fallback = verifyTuple(knownGood);
  if (fallback) return { status: 'ready', dispatch_eligible: true, source: 'known_good', /* tuple */ };
  return blocked();
}
```

Recommendation-only sibling failure may omit that projection, but must never
expose mixed authority or invalidate a verified routing tuple.

### `src/registry/reconcile.mjs` and `src/registry/build.mjs`

**Analog:** `src/registry/reconcile.mjs`

**Dependency-complete reverse traversal** (lines 100-147):

```js
const seeds = new Set();
for (const event of events) {
  if (['removed', 'replaced', 'disabled'].includes(event?.primary)
      && typeof event.canonical_id === 'string') seeds.add(event.canonical_id);
}
const reverse = new Map();
for (const edge of references.edges) {
  if (!reverse.has(edge.to_id)) reverse.set(edge.to_id, []);
  reverse.get(edge.to_id).push(edge);
}
const invalidated = new Set(seeds);
const queue = [...seeds].sort();
for (let index = 0; index < queue.length; index += 1) {
  const target = queue[index];
  for (const edge of reverse.get(target) || []) {
    if (invalidated.has(edge.from_id)) continue;
    invalidated.add(edge.from_id);
    queue.push(edge.from_id);
  }
}
```

Extend seed and typed-edge coverage rather than add another invalidation
engine. Required seeds: node, edge, dependency, adapter version, inference-rule
version, manifest, correction, and negative evidence. Canonicalize and sort
inputs and outputs with `stableStringify` before hashing.

**Equivalence test pattern:** `tests/router.registry-reconcile.test.mjs`
lines 198-207:

```js
const outputs = permutations(records)
  .map(permuted => reconcileCandidate({ candidate: candidate(permuted), lifecycle }));
assert.equal(stableStringify(outputs[0]), stableStringify(outputs[1]));
assert.equal(outputs[0].report_fingerprint, outputs[1].report_fingerprint);
```

Use the same production builder for full and incremental paths; tests should
vary event order/coalescing and compare every emitted tuple member byte-for-byte.

### `src/registry/watcher.mjs` (event-driven publication controller)

**Analog:** existing watcher flow calling the Phase 18 seams:

```js
recoverActiveVersion(...)
activateCandidate(...)
publishCompiledIndex(...)
rollbackActivation(...)
```

Keep one ordered controller transaction:

1. reconcile and compile all tuple members;
2. run existing verification/canary gates;
3. write immutable version;
4. publish the tuple pointer;
5. acknowledge success only after the active tuple reloads and verifies;
6. on any failure, retain or recover last-known-good.

Do not publish registry authority before its compiled tuple is ready.

### `src/lifecycle/router-lifecycle.mjs` and `install-router.mjs`

**Analog:** `src/lifecycle/router-lifecycle.mjs`

**Verified generation pattern** (lines 36-67):

```js
const stateRoot = join(p.ownedRoot, 'install-state');
return {
  ...p,
  stateRoot,
  generationsRoot: join(stateRoot, 'generations'),
  activeGenerationPath: join(stateRoot, 'active.json'),
  knownGoodGenerationPath: join(stateRoot, 'known-good.json'),
};

const active = verifiedGeneration(p, readJson(p.activeGenerationPath, null));
if (active) return active;
const knownGood = verifiedGeneration(p, readJson(p.knownGoodGenerationPath, null));
if (!knownGood) throw new Error('no verified installation generation');
if (repair) durableAtomicWrite(p.activeGenerationPath,
  JSON.stringify({ schema_version: 1, generation_id: knownGood.generationId }) + '\n');
```

**Dual-runtime binding pattern** (lines 70 onward):

```js
function updateManagedBinding(p, options, enabled) {
  updateBindingAt(p.settingsPath, 'UserPromptSubmit', p.routerPath, options, enabled, 5);
}

function updateCodexBinding(p, options, enabled) {
  // Existing Codex-owned binding update; preserve unrelated configuration.
}
```

Extend the existing generation manifest to prove both installed runtimes and
the actual activated tuple. Keep install, repair, upgrade, rollback, recovery,
disable/enable, and uninstall in the existing verbs.

**Installer test analog:** `tests/router.installer-coexistence.test.mjs`
lines 12-16 and 18-70. Reuse its Claude-only, Codex-only, and together matrix,
ownership roots, and byte-identical unrelated-file snapshots. Add assertions
that command, skill, agent, workflow, MCP, and tool recommendations survive in
the installed runtime, not only in source fixtures.

### `src/context/prompt-route.mjs` (prompt hot path)

**Analog:** `src/context/prompt-route.mjs`

**Compiled-only projection pattern** (lines 121-153, 163-175):

```js
const compiledIndex = loadCompiledIndex({ ownedRoot, now, ...(compiledFs ? { fs: compiledFs } : {}) });
if (!compiledIndex.dispatch_eligible) {
  const resolution = {
    outcome: 'blocked',
    dispatch_eligible: false,
    reason_code: compiledIndex.reason_code,
    diagnostic: compiledIndex.diagnostic,
  };
  return projected({ handled: true, resolution, additional_context: injection(resolution) });
}
const projection = compiledIndex.index.routes?.[workflowId];
const bakedBudget = compiledIndex.budget?.by_workflow?.[workflowId];
```

```js
compiled: {
  version_id: compiledIndex.version_id,
  source: compiledIndex.source,
  tuple_version_id: compiledIndex.tuple_version_id,
  registry_version_id: compiledIndex.registry_version_id,
  workflow_id: projection.workflow_id,
  transition_id: projection.transition_id,
  closure: compiledIndex.closure?.by_workflow?.[workflowId] ?? null,
  budget: compiledIndex.budget?.by_workflow?.[workflowId] ?? null,
  summaryIndex: compiledIndex.summaryIndex?.by_workflow?.[workflowId] ?? null,
}
```

New Phase 26 decisions must already be precompiled siblings or route fields.
Do not import discovery, registry builders, contract inference, health scoring,
graph traversal, publisher, network, or model code into this module.
Recommendation/startup-pointer errors remain fail-silent; routing authority
comes from the verified tuple or its known-good fallback.

### `src/release/run-release.mjs`

**Analog:** existing release stage table and evidence parser.

**Reuse existing gate IDs and subprocess evidence** (lines 116-151):

```js
{ id: 'recovery',
  files: ['tests/router.autonomous-lifecycle.test.mjs',
    'tests/router.lifecycle-recovery.test.mjs'],
  gate_ids: ['lifecycle', 'recovery'] },
{ id: 'latency',
  files: ['tests/router.compiled-evolution.test.mjs'],
  gate_ids: ['warm-p95', 'hard-route-ceiling'],
  isolated: true },
```

```js
const warmPass = Number.isFinite(warm) && warm < 25;
const maxPass = Number.isFinite(max) && max < 100;
gate_results.push({ id: 'warm-p95', pass: warmPass,
  reason_code: warmPass ? 'warm-p95_pass' : 'threshold' });
gate_results.push({ id: 'hard-route-ceiling', pass: maxPass,
  reason_code: maxPass ? 'hard-route-ceiling_pass' : 'threshold' });
```

Add Phase 26 tuple-equivalence and installed-runtime evidence to these stages.
Do not add a parallel verifier or release command.

### Performance and realistic-registry tests

**Analog:** `src/evolution/perf-measure.mjs` lines 62-95:

```js
for (let index = 0; index < warmup_runs; index += 1) invoke(index);
const samples = Array.from({ length: measured_runs }, (_, index) => invoke(index));
const durations = samples.map(sample => sample.elapsed_ms);
const warm = {
  p50_ms: percentile(durations, 0.5),
  p95_ms: percentile(durations, 0.95),
  max_ms: Math.max(...durations),
};
```

```js
const p95Pass = measured?.warm?.p95_ms < 25;
const maxPass = measured?.warm?.max_ms < 100;
```

**Release test analog:** `tests/router.compiled-evolution.test.mjs`
lines 181-218. Keep latency isolated from concurrent workspace tests, measure
the real `routeContextPrompt`, assert UTF-8 byte budgets, and emit
`RELEASE_METRICS` for the release runner.

**Large fixture analog:** `tests/helpers/inventory-fixture.mjs` lines 21-130.
Use its canonical record builder and Claude/Codex/mixed profiles, but generate a
deterministic large registry by indexed repetition with unique stable IDs.
Do not hand-maintain hundreds of fixture records. Exercise all recommendation
kinds and both runtimes through real compile/publish/load/route seams.

## Shared Patterns

### Stable bytes and fingerprints

**Source:** `src/registry/schema.mjs`, used by registry reconciliation,
activation, and tuple publication.

Apply `stableStringify`, sorted object keys, sorted arrays, and content-derived
version IDs. Exclude timestamps, event order, temporary paths, and generation
labels from semantic byte comparisons.

### Atomic authority

**Sources:** `src/registry/activate.mjs` lines 114-187 and
`src/prompt/publish-index.mjs` lines 14-27.

Write into a private staging/version directory, fsync files and directory,
verify hashes and trusted gate evidence, then atomically replace one pointer.
Re-verify after pointer replacement. Failure before that pointer changes no
active authority.

### Verification, canary, rollback, recovery

**Sources:** `src/registry/activate.mjs`,
`src/evolution/canary-controller.mjs`, and
`src/release/run-release.mjs`.

Reuse `REQUIRED_ACTIVATION_GATES`, `activateCandidate`,
`applyCanaryDecision`, `replaceActivePointer`, `recoverActiveVersion`, and
`recoverReleaseTuple`. Explicit approval remains separate from execute intent;
speed alone cannot promote a candidate.

### Fail-closed mutation, fail-open recommendation

Publication, activation, installer ownership, and automatic mutation fail
closed. Optional suggestion/startup projection failure is silent and leaves
verified routing/last-known-good interaction available.

### Test execution

Lifecycle/install tests share controller state and must run serially:

```sh
node --test --test-concurrency=1 tests/*.test.mjs
```

Latency authority remains the isolated release stage, not a concurrent full
suite measurement.

## No Analog Found

None. Every Phase 26 responsibility has a verified existing seam. The planner
should prefer extending the files above and should reject proposals for a
second publication, release, rollback, installer, or prompt-routing engine.

## Metadata

**Analog search scope:** `src/registry`, `src/prompt`, `src/context`,
`src/lifecycle`, `src/evolution`, `src/release`, `tests`

**Strong analogs inspected:** 12 source/test files

**Pattern extraction date:** 2026-07-28
