# Phase 21: Authoritative Personalized Inventory - Pattern Map

**Mapped:** 2026-07-26
**Files analyzed:** 23 new/modified files
**Analogs found:** 23 / 23

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/adapters/claude.mjs` | service / adapter | file-I/O → transform | `src/adapters/claude.mjs` | exact, in-place |
| `src/adapters/codex.mjs` | service / adapter | file-I/O → transform | `src/adapters/claude.mjs` | exact shared factory |
| `src/registry/schema.mjs` | model / utility | transform | `src/registry/schema.mjs` | exact, in-place |
| `src/registry/fingerprint.mjs` | service | file-I/O → batch | `src/registry/fingerprint.mjs` | exact, in-place |
| `src/registry/identity.mjs` | utility | transform | `src/registry/identity.mjs` | exact, in-place |
| `src/registry/diff.mjs` | service | batch → event-driven | `src/registry/diff.mjs` | exact, in-place |
| `src/registry/reconcile.mjs` | service | batch → transform | `src/registry/reconcile.mjs` | exact, in-place |
| `src/registry/build.mjs` | service | batch → transform | `src/registry/build.mjs` | exact, in-place |
| `src/registry/watcher.mjs` | service | event-driven → file-I/O | `src/registry/watcher.mjs` | exact, in-place |
| `src/registry/validate.mjs` | service | batch → transform | `src/registry/validate.mjs` | exact, in-place |
| `src/cli/router-control.mjs` | controller | request-response / file-I/O | `src/cli/router-control.mjs` | exact, in-place |
| `tests/router.adapters.test.mjs` | test | file-I/O → transform | `tests/router.adapters.test.mjs` | exact |
| `tests/router.registry-schema.test.mjs` | test | transform | `tests/router.registry-schema.test.mjs` | exact |
| `tests/router.registry-diff.test.mjs` | test | batch → event-driven | `tests/router.registry-diff.test.mjs` | exact |
| `tests/router.registry-reconcile.test.mjs` | test | batch → transform | `tests/router.registry-reconcile.test.mjs` | exact |
| `tests/router.registry-watcher.test.mjs` | test | event-driven → file-I/O | `tests/router.registry-watcher.test.mjs` | exact |
| `tests/router.control-cli.test.mjs` | test | request-response / file-I/O | `tests/router.control-cli.test.mjs` | exact |
| `tests/helpers/inventory-fixture.mjs` | test utility | file-I/O / batch | fixture helpers in `tests/router.adapters.test.mjs` | role-match |
| `tests/router.inventory-portability.test.mjs` | test | file-I/O → transform | `tests/router.adapters.test.mjs` | role + flow |
| `tests/router.inventory-mutations.test.mjs` | test | event-driven → batch | `tests/router.registry-diff.test.mjs` | role + flow |
| `tests/router.inventory-convergence.test.mjs` | test | event-driven → batch | `tests/router.registry-watcher.test.mjs` | role + flow |
| `tests/router.inventory-gaps.test.mjs` | test | batch → transform | `tests/router.registry-schema.test.mjs` | role-match |
| `tests/router.inventory-security.test.mjs` | test | file-I/O → transform | `tests/router.adapters.test.mjs` | role + flow |

The source list is the concrete implementation surface named in `21-CONTEXT.md` and the Research responsibility/test maps. The exact helper filename is discretionary; `tests/helpers/inventory-fixture.mjs` is the recommended boundary for the explicitly required shared synthetic-root builder.

## Pattern Assignments

### `src/adapters/claude.mjs` and `src/adapters/codex.mjs`

**Analog:** `src/adapters/claude.mjs`

Keep ecosystem layout knowledge in adapter-owned functions, then pass it through the shared `createAdapter` factory. `codex.mjs` should remain a thin configuration of that factory rather than grow Router-core conditionals.

**Imports and bounded filesystem pattern** (`src/adapters/claude.mjs:1-12`):

```js
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { stableStringify, validateCapability } from '../registry/schema.mjs';

const MAX_ARTIFACT_BYTES = 1024 * 1024;
const MAX_NESTING = 24;

function within(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}
```

**Native layout boundary** (`src/adapters/claude.mjs:178-199`):

```js
function claudeLayout(rel) {
  if (rel.startsWith('plugins/marketplaces/')) return null;
  if (rel === 'settings.json') return { type: 'settings', format: 'json' };
  if (/^skills\/[^/]+\/SKILL\.md$/.test(rel)) return { type: 'skill', format: 'markdown' };
  if (/^agents\/[^/]+\.md$/.test(rel)) return { type: 'agent', format: 'markdown' };
  if (/^commands\/[^/]+\.md$/.test(rel)) return { type: 'command', format: 'markdown' };
  if (/^hooks\/.+\.json$/.test(rel)) return { type: 'hook', format: 'json' };
  return null;
}
```

Replace the final `null` behavior inside authorized capability roots with an opaque observation contract. Preserve explicit exclusions such as marketplace indexes, dependency trees, VCS metadata, tests, and fixtures.

**Path trust and parse failure pattern** (`src/adapters/claude.mjs:303-327`):

```js
const root = realpathSync(resolve(options.root));
const requested = resolve(path);
let actual;
try {
  actual = realpathSync(requested);
} catch (error) {
  return { diagnostic: diagnostic('unreadable_artifact', runtime, logicalRoot,
    relative(root, requested), error.message, 'build-blocking', requested) };
}
if (!within(root, actual)) {
  return { diagnostic: diagnostic('path_escape', runtime, logicalRoot,
    relative(root, requested), 'resolved artifact leaves supplied root',
    'build-blocking', requested) };
}
```

**Deterministic discovery pattern** (`src/adapters/claude.mjs:388-406`):

```js
for (const spec of [...rootSpecs].sort((a, b) => a.logicalRoot.localeCompare(b.logicalRoot))) {
  const canonicalRoot = realpathSync(resolve(spec.root));
  for (const path of walk(canonicalRoot).sort()) {
    const parsed = parseArtifact(path, {
      root: canonicalRoot,
      logicalRoot: spec.logicalRoot,
      scope: spec.scope,
    });
    if (parsed.diagnostic) diagnostics.push(parsed.diagnostic);
    if (parsed.partial) observations.push(normalizePartial(parsed.partial));
    else for (const record of parsed.records || (parsed.data ? [parsed] : [])) {
      observations.push(normalizeArtifact(record, canonicalRoot));
    }
  }
}
observations.sort((a, b) => key(a).localeCompare(key(b)));
diagnostics.sort((a, b) => key(a).localeCompare(key(b)));
```

For Phase 21, extend normalized records with native type, stable semantic type, lifecycle role, enabled state, adapter/parser evidence, optional validated invocation, and container/member provenance. Capability-authored prose must remain inert evidence.

---

### `src/registry/schema.mjs`

**Analog:** `src/registry/schema.mjs`

**Validation pattern** (`src/registry/schema.mjs:29-54`, `72-94`):

```js
function validateDependencies(record) {
  object(record.dependencies, 'capability.dependencies');
  oneOf(record.dependencies.state, DEPENDENCY_STATES, 'capability.dependencies.state');
  if (!Array.isArray(record.dependencies.items)) {
    fail('capability.dependencies.items must be an array');
  }
  if (record.dispatchable
    && record.dependencies.items.some((item) => !item.available)) {
    fail('capability.dispatchable must be false when a declared dependency is unavailable');
  }
}

export function validateCapability(record) {
  object(record, 'capability');
  nonempty(record.type, 'capability.type');
  nonempty(record.name, 'capability.name');
  validateScope(record.scope);
  if (typeof record.dispatchable !== 'boolean') {
    fail('capability.dispatchable must be a boolean');
  }
  validateDependencies(record);
  validateProvenance(record.provenance);
}
```

Make invocation conditional: require a strictly validated invocation only when `dispatchable: true`; non-dispatchable containers, configuration, instructions, disabled records, and unknown semantic types must not receive fabricated commands.

**Privacy-safe provenance guard** (`src/registry/schema.mjs:57-69`):

```js
for (const field of [
  'runtime', 'scope', 'logical_root', 'relative_path',
  'source_fingerprint', 'adapter',
]) nonempty(source[field], `${path}.${field}`);
if (isAbsolutePortablePath(source.logical_root)) {
  fail(`${path}.logical_root must be logical, not absolute`);
}
if (isAbsolutePortablePath(source.relative_path)) {
  fail(`${path}.relative_path must be relative`);
}
```

**Canonical byte pattern** (`src/registry/schema.mjs:126-151`):

```js
export function stableStringify(value) {
  return JSON.stringify(normalize(value, '$', new WeakSet()));
}

function sortSet(array) {
  return [...array].sort((left, right) =>
    stableStringify(left).localeCompare(stableStringify(right)));
}

export function canonicalizeCapability(record) {
  validateCapability(record);
  return canonicalize(record);
}
```

Add new set-like evidence/reference fields to the schema-owned sort list. Do not include generation IDs, timestamps, event order, triggers, or scan IDs in semantic bytes.

---

### `src/registry/fingerprint.mjs`

**Analog:** `src/registry/fingerprint.mjs`

**Realpath containment and diagnostic pattern** (`src/registry/fingerprint.mjs:49-101`):

```js
children.sort((a, b) => a.name.localeCompare(b.name));
for (const child of children) {
  const absolute = resolve(current, child.name);
  const relativePath = portablePath(relative(rootPath, absolute).replaceAll(sep, '/'));
  let canonical;
  try {
    canonical = await realpath(absolute);
  } catch (error) {
    diagnostics.push(diagnostic('scan_error', logicalRoot, relativePath,
      error?.code || 'UNKNOWN'));
    continue;
  }
  if (!contained(rootPath, canonical)) {
    diagnostics.push(diagnostic('path_escape', logicalRoot, relativePath,
      'outside_logical_root'));
    continue;
  }
  // Read and SHA-256 hash only contained files.
}
```

**Canonical scan result** (`src/registry/fingerprint.mjs:155-174`):

```js
entries.sort((a, b) => `${a.logical_root}:${a.relative_path}:${a.entry_type}`
  .localeCompare(`${b.logical_root}:${b.relative_path}:${b.entry_type}`));
diagnostics.sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
const canonical = {
  schema_version: SCHEMA_VERSION,
  roots,
  root_hashes: rootHashes,
  subtree_hashes: subtreeHashes,
  entries,
  diagnostics,
};
return { ...canonical, hash: hash(canonical) };
```

Add an explicit completeness projection per logical root. `access_denied`, `read_error`, `scan_error`, unresolved cycles, and ambiguous root replacement must prevent that scan from advancing the authoritative baseline.

---

### `src/registry/identity.mjs` and `src/registry/diff.mjs`

**Analogs:** `src/registry/identity.mjs`, `src/registry/diff.mjs`

**Scope-separated identity pattern** (`src/registry/identity.mjs:4-25`):

```js
function scopeSuffix(scope) {
  if (!scope || scope.kind === 'global') return '';
  return `@${scope.kind}:${encodeURIComponent(scope.repository)}:${encodeURIComponent(scope.worktree)}`;
}

export function stableCapabilityId(record) {
  const suffix = scopeSuffix(record.scope);
  if (typeof record.canonical_identity === 'string'
    && record.canonical_identity.trim()) {
    return `${record.canonical_identity.trim()}${suffix}`;
  }
  // Existing fallback follows.
}
```

Change the fallback to include source-path identity, not only runtime/type/native name. Preserve continuity only for a schema-validated declared stable ID or a unique one-to-one removed/added exact content fingerprint. Never merge simultaneously live duplicates.

**Lifecycle event ordering** (`src/registry/diff.mjs:5-8`, `66-92`):

```js
const ORDER = [
  'renamed', 'moved', 'removed', 'added', 'disabled', 'scope_changed',
  'dependency_changed', 'permission_changed', 'content_changed',
];

function lifecycleEvent(before, after, identity) {
  const changes = dimensionChanges(before, after);
  if (changes.length === 0) return null;
  return {
    canonical_id: identity.id,
    primary: changes[0],
    facets: changes.slice(1),
    old_provenance: before.provenance,
    new_provenance: after.provenance,
  };
}
```

**Partial-scan removal guard and advisory-only similarity** (`src/registry/diff.mjs:119-166`):

```js
const uncertain = diagnostics.filter(item =>
  ['access_denied', 'read_error', 'scan_error'].includes(item.code));
const confirmedRemoved = removed.filter(record => !removalUncertain(record));
events.push(...confirmedRemoved.map(record => addRemove('removed', record)));

for (const before of confirmedRemoved) {
  for (const after of added) {
    if (!weaklySimilar(before, after)) continue;
    diagnostics.push({
      code: 'possible_match',
      authoritative: false,
      old_provenance: before.provenance,
      new_provenance: after.provenance,
    });
  }
}
```

Keep similarity advisory. Add deterministic fingerprint buckets and pair continuity only when both the removed and added buckets contain exactly one member.

---

### `src/registry/build.mjs`

**Analog:** `src/registry/build.mjs`

**One assembly seam for full and incremental input** (`src/registry/build.mjs:166-175`, `239-272`):

```js
export function acquireRegistry(options = {}) {
  return {
    claude: (options.discoverClaude || discoverClaude)(options),
    codex: (options.discoverCodex || discoverCodex)(options),
  };
}

export function buildFullRegistry(options = {}) {
  return assembleRegistry(acquireRegistry(options), options);
}

export function buildIncrementalRegistry(previous, diff, options = {}) {
  return assembleRegistry(
    refreshIncrementalAcquisition(previous, diff, options),
    options,
  );
}

export function assembleRegistry(acquisition, options = {}) {
  validateAcquisition(acquisition);
  // Group, normalize, and sort through one path.
}
```

This is the canonical semantic snapshot boundary. Both event-hinted refresh and clean authoritative acquisition must terminate here and produce byte-identical records, evidence, enabled/dependency state, and retained relationship references.

**Deterministic output pattern** (`src/registry/build.mjs:311-321`):

```js
records.sort((a, b) =>
  `${a.id}:${key(a.provenance)}`.localeCompare(`${b.id}:${key(b.provenance)}`));
const diagnostics = [...claude.diagnostics, ...codex.diagnostics]
  .map(({ local_path: _local, ...portable }) => portable)
  .sort((a, b) => key(a).localeCompare(key(b)));
const registry = { schema_version: 1, records };
```

Do not preserve the current runtime-specific `annotatePrecedence` assumptions in core. Native precedence may remain namespaced adapter evidence, while same-named cross-runtime or cross-scope records remain separate identities.

---

### `src/registry/reconcile.mjs`

**Analog:** `src/registry/reconcile.mjs`

**Canonical candidate and reference input pattern** (`src/registry/reconcile.mjs:40-57`):

```js
const records = candidate.records.map(record => {
  validateCapability(record);
  return { id: stableCapabilityId(record), ...canonicalizeCapability(record) };
}).sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));

return aliases.map(alias => ({
  id: alias.id.trim(),
  target_id: alias.target_id.trim(),
})).sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
```

Generalize the alias input into a versioned, sorted reference graph covering aliases, equivalence/workflow references, corrections, mappings, and compiled routes.

**Dependency verdict pattern** (`src/registry/reconcile.mjs:90-103`):

```js
const recordsById = new Map(candidate.records.map(record => [record.id, record]));
for (const record of candidate.records) {
  for (const dependency of record.dependencies.items) {
    const target = recordsById.get(dependency.id);
    if (dependency.available
      && target
      && target.dispatchable
      && target.lifecycle === 'ready') continue;
    findings.push(targetVerdict('dependency_unavailable', record, {
      dependency_id: dependency.id,
      declared_available: dependency.available,
    }, 'A required dependency is absent or not dispatchable.',
    'Install, enable, or repair the exact declared dependency before dispatch.'));
  }
}
```

Build deterministic reverse edges, seed invalidation from removed/disabled/replaced/dependency-unhealthy records, traverse transitive dependents, and emit sorted evidence. Apply the invalidated candidate before mapper callbacks execute.

**Fail-closed transaction ordering** (`src/registry/reconcile.mjs:182-200`):

```js
const candidate = canonicalCandidate(options.candidate);
const aliases = canonicalAliases(options.aliases || []);
const recordsById = new Map(candidate.records.map(record => [record.id, record]));
const lifecycle = options.lifecycle && typeof options.lifecycle === 'object'
  ? options.lifecycle : { events: [], diagnostics: [] };
const hookResult = reconcileHookInventory(hookInventory, {
  runtimeRoots: options.runtimeRoots,
});
const verdicts = [
  ...wholeCandidateVerdicts(candidate, options),
  ...hookResult.verdicts,
];
```

Keep active bytes immutable on any validation, invalidation, mapping, or publication failure.

---

### `src/registry/watcher.mjs`

**Analog:** `src/registry/watcher.mjs`

**Single-flight scheduling pattern** (`src/registry/watcher.mjs:90-110`, `141-166`):

```js
const roots = [...options.roots]
  .sort((a, b) => a.logicalRoot.localeCompare(b.logicalRoot));
const debounceMs = options.debounceMs ?? 250;
const maxLatencyMs = options.maxLatencyMs ?? 1_500;
const repairMs = options.repairMs ?? 300_000;
let inFlight = null;
let rerun = false;

function markDirty(names, immediate = false) {
  for (const name of names) dirty.add(name);
  if (inFlight) {
    rerun = true;
    return;
  }
  const delay = immediate ? 0
    : Math.max(0, Math.min(debounceMs, firstDirtyAt + maxLatencyMs - now));
  timer = scheduler.setTimeout(() => startWork(), delay);
}
```

**Current unsafe baseline advancement to replace** (`src/registry/watcher.mjs:133-139`):

```js
async function reconcileDirty(names) {
  const current = await scan(roots);
  const lifecycle = diff(baseline, current);
  await reconcile({ roots: names, previous: baseline, current, diff: lifecycle });
  await writeState(current);
  baseline = current;
}
```

Introduce `lastCompleteFingerprintState` and `lastCompleteSemanticSnapshot`. An incomplete scan may update operational inspection state to `degraded`, but it must not write or replace either complete baseline.

**Dependency-injection pattern for testability** (`src/registry/watcher.mjs:309-343`):

```js
const acquire = dependencies.acquireRegistry || acquireRegistry;
const refresh = dependencies.refreshIncrementalAcquisition
  || refreshIncrementalAcquisition;
const assemble = dependencies.assembleRegistry || assembleRegistry;
const evaluate = dependencies.reconcileCandidate || reconcileRegistryCandidate;
const mapper = dependencies.mapCandidateRegistry || mapCandidateRegistry;
const verifier = dependencies.produceActivationVerification
  || produceActivationVerification;
const writeJson = dependencies.writeJson || atomicJson;
```

Use the same seam for a deterministic clock, generation-ID factory, trigger classification, and operational-state publisher. Expose `current`, `reconciling`, `degraded`, or `failed`, plus active/candidate generation, last complete reconciliation, pending changes, and affected roots.

---

### `src/registry/validate.mjs`

**Analog:** `src/registry/validate.mjs`

**Exact convergence gate** (`src/registry/validate.mjs:54-69`):

```js
const incremental = buildIncrementalRegistry(
  equivalence.previous, equivalence.diff, equivalence.options || {},
).registry;
const full = buildFullRegistry(equivalence.options || {}).registry;
const candidateBytes = stableStringify(candidate);
const incrementalBytes = stableStringify(incremental);
const fullBytes = stableStringify(full);
const passed = candidateBytes === incrementalBytes
  && candidateBytes === fullBytes;
```

Feed this gate the semantic snapshot only. Extend fixtures to cover dropped, duplicate, coalesced, reordered, and filename-less events and all D-19 mutations. Operational timestamps/generations belong outside the compared value.

---

### `src/cli/router-control.mjs`

**Analog:** `src/cli/router-control.mjs`

**Canonical response envelope** (`src/cli/router-control.mjs:15-31`):

```js
const EXIT = Object.freeze({
  success: 0, usage: 2, invalid: 3, unsafe: 4, mutation: 5,
});

function canonical(command, ok, reasonCode, data = {}, warnings = []) {
  return {
    schema_version: 1,
    command,
    ok,
    reason_code: reasonCode,
    data,
    warnings: [...warnings].sort(),
  };
}
```

**Bounded projection pattern** (`src/cli/router-control.mjs:65-87`):

```js
function projection(versionId, version) {
  return {
    version_id: versionId,
    created_at: version.manifest.created_at,
    bundle_fingerprint: version.verdict.bundle_fingerprint,
    verification_fingerprint: version.verdict.verification_fingerprint,
  };
}

function boundedResult(values) {
  const ordered = values.slice(0, MAX_DIFF);
  return {
    values: ordered,
    meta: {
      total: values.length,
      returned: ordered.length,
      truncated: values.length > MAX_DIFF,
      limit: MAX_DIFF,
    },
  };
}
```

Add an allowlisted inventory projection. Show logical root, relative source path, runtime, scope, native/semantic type, enabled, dispatchable, lifecycle role, fingerprint, adapter/parser version, dependency state, provenance, and diagnostics. Redact raw instruction/config bodies, absolute local paths, and secret values by default.

---

### Existing focused tests

Modify the test closest to each source seam:

- `tests/router.adapters.test.mjs`: adapter coverage, opaque unknowns, compound container/member provenance, prose inertness, symlink escapes.
- `tests/router.registry-schema.test.mjs`: lifecycle role, enabled/dispatchable invariants, optional invocation, set-like canonical fields, path/privacy rejection.
- `tests/router.registry-diff.test.mjs`: declared-ID and unique exact-fingerprint continuity, ambiguous duplicate non-pairing, incomplete-root removal suppression.
- `tests/router.registry-reconcile.test.mjs`: multi-hop invalidation and proof that mapper/evaluator callbacks never observe stale references.
- `tests/router.registry-watcher.test.mjs`: startup/periodic/ambiguous triggers, incomplete baseline retention, generation/freshness states.
- `tests/router.control-cli.test.mjs`: bounded allowlisted inspection and secret/body/path redaction.

**Fixture and cleanup pattern** (`tests/router.adapters.test.mjs:9-24`, `57-72`):

```js
function put(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path,
    typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
}

const root = mkdtempSync(join(tmpdir(), 'router-adapters-native-'));
try {
  const result = claude.discoverRoots({ claudeRoot, projectRoot });
  assert.ok(result.observations.every(entry =>
    !JSON.stringify(entry).includes(root)));
} finally {
  rmSync(root, { recursive: true, force: true });
}
```

**Stable-byte assertion pattern** (`tests/router.registry-schema.test.mjs:118-133`):

```js
const bytes = stableStringify(canonicalizeCapability(a));
assert.equal(bytes, stableStringify(canonicalizeCapability(b)));
assert.equal(contentFingerprint(a), contentFingerprint(b));
```

**Deterministic fake clock pattern** (`tests/router.registry-watcher.test.mjs:16-35`):

```js
function clock() {
  let now = 0, id = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout(fn, delay) {
      const key = ++id;
      timers.set(key, { at: now + delay, fn });
      return key;
    },
    clearTimeout(key) { timers.delete(key); },
    async advance(ms) { /* run due timers in stable order */ },
  };
}
```

### New inventory matrix tests and helper

#### `tests/helpers/inventory-fixture.mjs`

Copy the isolated temp-root, `put`, and `try/finally` cleanup style from `tests/router.adapters.test.mjs:9-50`. Export builders for:

- Claude-heavy, Codex-heavy, mixed/custom, and unknown-future profiles.
- Separate synthetic home, project, and worktree roots.
- Mutation playback: add, edit, rename, move, disable, replace, dependency loss, removal.
- Canonical semantic bytes and assertions that reject `/Users/guilherme`, live capability names, and fixed ecosystem counts.

#### `tests/router.inventory-portability.test.mjs`

Copy table-driven discovery assertions from `tests/router.adapters.test.mjs:57-86`. Each profile must vary names, counts, missing categories, scopes, and runtime mixture. Verify every artifact becomes a record and an unknown type remains visible and non-dispatchable.

#### `tests/router.inventory-mutations.test.mjs`

Copy lifecycle sorting and permutation assertions from `tests/router.registry-diff.test.mjs` and the transaction callback assertions from `tests/router.registry-reconcile.test.mjs:198-217`. Assert identity and invalidation after every D-19 mutation.

#### `tests/router.inventory-convergence.test.mjs`

Copy the injected watcher harness from `tests/router.registry-watcher.test.mjs:38-65` and the exact equivalence assertion from `tests/router.registry-watcher.test.mjs:320-340`. Compare semantic bytes after missed, duplicate, coalesced, reordered, and filename-less event sequences against a clean authoritative scan.

#### `tests/router.inventory-gaps.test.mjs`

Copy the `capability(overrides)` fixture and scope-separated assertions from `tests/router.registry-schema.test.mjs:10-30`, `44-54`, and `84-90`. Project semantic availability from normalized categories; permute runtime labels and assert results do not establish Claude, Codex, or GSD as a default.

#### `tests/router.inventory-security.test.mjs`

Copy temp-root/symlink fixtures and portable-output checks from `tests/router.adapters.test.mjs:18-55`. Cover in-root symlinks, escaping links, cycles, malicious prose/frontmatter, secret-bearing config, raw-body suppression, and absolute-path leakage.

## Shared Patterns

### Canonical semantic bytes

**Sources:** `src/registry/schema.mjs:126-151`, `src/registry/build.mjs:311-321`, `src/registry/validate.mjs:54-69`

**Apply to:** schema, build, diff, reconcile, validate, all convergence tests.

One schema-owned canonicalizer sorts objects and declared set-like arrays. Semantic snapshots exclude operational metadata. Incremental and authoritative paths compare the exact serialized semantic value.

### Path and scope safety

**Sources:** `src/registry/fingerprint.mjs:14-25`, `49-101`; `src/adapters/claude.mjs:303-317`

**Apply to:** adapters, scanner, inspection, fixture security tests.

Canonicalize with `realpath`, verify containment, retain portable logical-root-relative provenance, reject escapes, and never trust a string-prefix check on an uncanonicalized path.

### Fail-closed candidate publication

**Sources:** `src/registry/reconcile.mjs:182-235`, `src/registry/watcher.mjs:309-390`

**Apply to:** identity/invalidation, mapping handoff, watcher publication, mutation tests.

Validate and canonicalize the entire candidate, apply deterministic invalidation closure, then map, verify, and activate. Any failure preserves exact active authority.

### Complete-snapshot authority

**Sources:** `src/registry/fingerprint.mjs:155-174`, `src/registry/watcher.mjs:133-139`

**Apply to:** fingerprint scanner, watcher, CLI freshness state, convergence tests.

Filesystem events are scheduling hints. Only a complete scan advances the authoritative fingerprint and semantic baselines; partial scans update diagnostics/freshness only.

### Privacy-safe inspection

**Sources:** `src/registry/schema.mjs:57-69`, `src/cli/router-control.mjs:20-31`, `65-87`

**Apply to:** adapters, reconciliation reports, CLI, security tests.

Emit allowlisted canonical fields and bounded arrays. Strip `local_path`, raw bodies, secrets, and authored configuration values unless a future explicit secure mode is designed.

### Node test conventions

**Sources:** `tests/router.adapters.test.mjs:1-12`, `tests/router.registry-watcher.test.mjs:16-65`

**Apply to:** every Phase 21 test.

Use `node:test`, `node:assert/strict`, isolated `mkdtempSync` roots, injected dependencies/fake clocks, deterministic iteration, and unconditional `finally` cleanup. No external test package is needed.

## No Analog Found

None. Every planned file either extends its existing implementation seam or has a close Node test analog. The new cross-profile fixture helper has no existing shared module, but its complete implementation pattern already exists locally inside `tests/router.adapters.test.mjs`.

## Metadata

**Analog search scope:** `src/adapters`, `src/registry`, `src/cli`, `tests`, `tests/helpers`

**Primary analogs read:** adapter discovery, schema/identity, fingerprint/diff, reconciliation/watcher, CLI and focused tests

**Pattern extraction date:** 2026-07-26

**Planning note:** A separate `src/registry/invalidation.mjs` is optional, not required by the upstream artifacts. If the planner introduces it, use `src/registry/reconcile.mjs:40-57` for canonical input and `90-125` for sorted verdict construction; keep it pure and call it before mapping.
