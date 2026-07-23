# Phase 13: Target Safety, Hook Reconciliation, and Quarantine - Pattern Map

**Mapped:** 2026-07-15
**Files analyzed:** 9 new/modified files
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/registry/reconcile.mjs` | service / safety gate | transform, event-driven | `src/registry/diff.mjs` | exact |
| `src/registry/hook-reconcile.mjs` | service / inventory reconciler | transform, batch | `src/registry/diff.mjs`; `src/adapters/claude.mjs` | role-match |
| `src/registry/schema.mjs` | model / validation utility | transform | `src/registry/schema.mjs` | exact |
| `src/registry/watcher.mjs` | controller / publication boundary | event-driven, file-I/O | `src/registry/watcher.mjs` | exact |
| `src/adapters/claude.mjs` | provider / runtime adapter | file-I/O, transform | `src/adapters/claude.mjs` | exact |
| `src/adapters/codex.mjs` | provider / runtime adapter | file-I/O, transform | `src/adapters/codex.mjs` | exact |
| `tests/router.registry-reconcile.test.mjs` | test | transform, event-driven | `tests/router.registry-watcher.test.mjs` | role-match |
| `tests/router.hook-reconcile.test.mjs` | test | file-I/O, batch | `tests/router.adapters.test.mjs` | role-match |
| `tests/router.registry-watcher.test.mjs` and `tests/router.route-targets.test.mjs` | tests | event-driven, request-response | same files | exact |

The file list follows the research recommendation. The planner may combine `hook-reconcile.mjs` into `reconcile.mjs`, but the hook inventory contract and tests should remain independently addressable.

## Pattern Assignments

### `src/registry/reconcile.mjs` (service / safety gate, transform)

**Primary analog:** `src/registry/diff.mjs`

**Imports and deterministic hash pattern** (`src/registry/diff.mjs:1-12`):

```javascript
import { createHash } from 'node:crypto';
import { stableCapabilityId } from './identity.mjs';
import { stableStringify } from './schema.mjs';

function hash(value) {
  return createHash('sha256').update(stableStringify(value), 'utf8').digest('hex');
}
```

Copy this standard-library-only composition. Reconciliation should return canonical data plus its hash and should not perform filesystem writes.

**Authoritative continuity pattern** (`src/registry/diff.mjs:47-64`):

```javascript
function continuity(record) {
  if (typeof record.canonical_identity === 'string' && record.canonical_identity.trim()) {
    return { authority: 'canonical_identity', key: `${record.type}:${record.canonical_identity.trim()}`, id: record.canonical_identity.trim() };
  }
  if (record.shared_origin?.authority && typeof record.shared_origin.identity === 'string' && record.shared_origin.identity.trim()) {
    const identity = record.shared_origin.identity.trim();
    return { authority: 'shared_origin', key: `${record.type}:${record.shared_origin.authority}:${identity}`, id: `origin:${identity}` };
  }
  const native = nativeEvidence(record);
  return native ? { authority: 'native_identity', key: native, id: stableCapabilityId(record) } : null;
}
```

Use these authoritative evidence classes for alias transfer. Do not promote names or fingerprints to continuity evidence.

**Weak evidence quarantine boundary** (`src/registry/diff.mjs:146-168`):

```javascript
const confirmedRemoved = removed.filter(record => !removalUncertain(record));
events.push(...confirmedRemoved.map(record => addRemove('removed', record)));
events.push(...added.map(record => addRemove('added', record)));

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
diagnostics.sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
const canonical = { events, diagnostics };
return { ...canonical, hash: hash(canonical) };
```

Build the complete reverse alias index first, evaluate all aliases without mutating caller inputs, and return one canonical result. A `possible_match` must yield quarantine, never alias transfer.

**Candidate validation analog** (`src/registry/build.mjs:54-65`):

```javascript
function mergeGroup(records) {
  const ordered = records.map(canonicalizeCapability).sort((a, b) => key(a).localeCompare(key(b)));
  const first = structuredClone(ordered[0]);
  first.conflicts.push(...syntheticConflicts(ordered));
  for (const record of ordered.slice(1)) {
    first.provenance.push(...record.provenance);
    first.runtime_variants.push(...record.runtime_variants);
    first.conflicts.push(...record.conflicts);
    first.dispatchable &&= record.dispatchable;
    if (!record.dispatchable) first.lifecycle = record.lifecycle;
  }
  return canonicalizeCapability(first);
}
```

Mirror the clone-first, compute-then-return style. A thrown single-record validation error becomes a structured fail-closed verdict at the candidate boundary. Do not repair the record or look up a same-name fallback.

### `src/registry/hook-reconcile.mjs` (service / inventory reconciler, batch transform)

**Primary analogs:** `src/registry/diff.mjs`, `src/adapters/claude.mjs`

**Deterministic join pattern** (`src/registry/diff.mjs:129-145`):

```javascript
const oldByKey = new Map(), newByKey = new Map();
for (const record of oldEntries) {
  const evidence = continuity(record);
  if (evidence) oldByKey.set(evidence.key, { record, evidence });
}
for (const record of newEntries) {
  const evidence = continuity(record);
  if (evidence) newByKey.set(evidence.key, { record, evidence });
}
for (const key of [...oldByKey.keys()].filter(value => newByKey.has(value)).sort()) {
  // classify the exact keyed pair
}
```

Adapt this into a full outer join over the sorted union of normalized hook-file and binding keys. Preserve duplicates as ambiguity evidence rather than overwriting them in a `Map`.

**Claude binding normalization seam** (`src/adapters/claude.mjs:213-223`):

```javascript
if (recognized.type === 'settings') {
  for (const event of Object.keys(data.hooks || {}).sort()) {
    const bindings = data.hooks[event];
    const portableBindings = Array.isArray(bindings)
      ? bindings.filter((entry) => !JSON.stringify(entry).includes('router.mjs')) : bindings;
    records.push({ ...base, type: 'binding', name: `settings:${event}`,
      data: { schema_version: 1, command: event, args: [], native_invocation: { event, bindings: portableBindings } } });
  }
}
```

Keep adapter discovery inert and portable. Extend normalized evidence only as needed to derive explicit runtime/event/command/args pair keys; never execute or loosely substring-match binding commands, and never synthesize a missing file or binding.

**Hook invocation seam** (`src/adapters/claude.mjs:183-184`):

```javascript
if (type === 'hook') return {
  event: data.event || null,
  command: data.command || name,
  args: Array.isArray(data.args) ? data.args : [],
};
```

Pair normalized explicit evidence. Basename similarity is diagnostic-only. Valid pairing proves inventory consistency, not activation authority.

### `src/registry/schema.mjs` (model / validation utility, transform)

**Analog:** existing capability schema in the same module.

**Fail-closed validation style** (`src/registry/schema.mjs:9-23,72-99`):

```javascript
function fail(message) { throw new TypeError(message); }
function object(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${path} must be an object`);
}
function oneOf(value, allowed, path) {
  if (!allowed.includes(value)) fail(`${path} must be one of: ${allowed.join(', ')}`);
}
```

If reusable verdict validation belongs here, follow the small explicit validators and version every portable shape. Keep schema responsible for individual record/verdict validity; reconciliation owns cross-record authority edges.

**Canonical ordering pattern** (`src/registry/schema.mjs:126-150`):

```javascript
export function stableStringify(value) {
  return JSON.stringify(normalize(value, '$', new Set()));
}
function sortSet(array) {
  return [...array].sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)));
}
export function canonicalizeCapability(record) {
  validateCapability(record);
  return canonicalize(record);
}
```

Reuse `stableStringify`; do not add a second JSON sorter. If verdicts are canonicalized here, add their set-like paths explicitly and test permutation equivalence.

**Portable path guard** (`src/registry/schema.mjs:57-69`):

```javascript
if (isAbsolutePortablePath(source.logical_root)) fail(`${path}.logical_root must be logical, not absolute`);
if (isAbsolutePortablePath(source.relative_path)) fail(`${path}.relative_path must be relative`);
const normalized = posix.normalize(source.relative_path.replaceAll('\\', '/'));
if (normalized === '..' || normalized.startsWith('../')) fail(`${path}.relative_path must remain within its logical root`);
```

Apply the same constraints to portable reconciliation evidence. Local absolute paths may appear only in explicitly noncanonical diagnostics.

### `src/registry/watcher.mjs` (controller / publication boundary, event-driven file-I/O)

**Analog:** existing watcher reconciliation transaction.

**Atomic JSON publication pattern** (`src/registry/watcher.mjs:159-164`):

```javascript
const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
await writeFile(temporary, `${stableStringify(value)}\n`, 'utf8');
await rename(temporary, path);
```

Use this only for candidate/quarantine report publication. Reconciliation itself remains pure. Capture active canonical bytes/fingerprint before evaluation and prove quarantine does not invoke any active write or activation callback.

**Startup fail-closed analog** (`tests/router.registry-watcher.test.mjs:90`):

```javascript
test('startup reconciliation failure rejects readiness instead of publishing a healthy baseline', async () => {
  // injected reconciliation failure must prevent a misleading ready publication
});
```

Extend the watcher through an injected reconciliation callback. Successful eligible candidates may be published as candidates, but `summary.activated` remains false. Quarantined candidates publish corrective diagnostics only; immutable version pointers and rollback are Phase 14.

### `src/adapters/claude.mjs` and `src/adapters/codex.mjs` (providers, file-I/O transform)

**Analogs:** existing adapter discovery and normalization.

**Non-dispatchable malformed artifact pattern** (`src/adapters/claude.mjs:253-256`):

```javascript
const record = {
  schema_version: 1,
  type: partial.type,
  name: partial.name,
  description: null,
  lifecycle: 'invalid',
  scope: partial.scope,
  dispatchable: false,
  runtime_variants: [{ runtime, native_identity: partial.name, native_invocation: null }],
  conflicts: [{ severity: 'dispatch-blocking', type: 'parse', field: 'artifact', sources: [partial.relativePath] }],
};
```

Continue emitting observations even when malformed, with lifecycle/dispatchability made explicit. Hook reconciliation consumes normalized observations and must not bypass adapter containment or parsing rules.

**Dependency fail-closed pattern** (`src/adapters/claude.mjs:238-247`):

```javascript
const dispatchable = Boolean(command) && items.every((entry) => entry.available);
return {
  lifecycle: dispatchable ? 'ready' : 'partial',
  scope,
  dispatchable,
  runtime_variants: [{ runtime, native_identity: String(nativeRecord.data.native_identity || nativeRecord.name), native_invocation: nativeInvocation }],
  conflicts: [],
};
```

Any added hook/binding evidence should remain portable and inert. Do not change runtime settings, install hooks, or auto-register pairs.

### `tests/router.registry-reconcile.test.mjs` (test, transform/event-driven)

**Analogs:** `tests/router.registry-watcher.test.mjs`, `tests/router.route-targets.test.mjs`.

**Test imports and deterministic fingerprint helper** (`tests/router.registry-watcher.test.mjs:1-8`):

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { stableStringify } from '../src/registry/schema.mjs';

function fingerprint(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}
```

Use table-driven fixtures for alias cardinality, target state, continuity authority, permission/scope/conflict/ambiguity gates, and input-order permutations. Assert canonical bytes, codes, subject identity, reason, and corrective action.

**Route fail-closed assertion style** (`tests/router.route-targets.test.mjs:91-109`):

```javascript
test('COV-11: blocked agents cannot appear under dispatching route kinds', () => {
  assert.throws(
    () => validateModeMapTargets(manifest, modeMap),
    /agent requires_mcp_not_in_manifest and cannot be a dispatch target/
  );
});
```

Extend route-target coverage so a quarantined/missing canonical target cannot become dispatchable through alias, warn-route wording, same-name runtime fallback, or scope fallback.

### `tests/router.hook-reconcile.test.mjs` (test, batch/file-I/O)

**Analog:** `tests/router.adapters.test.mjs`.

**Contained fixture builder** (`tests/router.adapters.test.mjs:9-49`):

```javascript
function put(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'router-adapters-native-'));
  // create Claude/Codex hook and binding fixtures under isolated roots
  return { root, claudeRoot, codexRoot, projectRoot, outside };
}
```

Cover both runtimes, valid pair, each orphan direction, malformed/duplicate sides, event/runtime/scope mismatch, path escape, and order permutations. Always remove temp roots in `finally`.

**Portability assertion** (`tests/router.adapters.test.mjs:52-55`):

```javascript
function assertPortable(result, absoluteRoot) {
  assert.ok(result.observations.every((entry) => !JSON.stringify(entry).includes(absoluteRoot)));
  assert.ok(result.observations.every((entry) => entry.provenance.every((p) => !p.logical_root.startsWith('/'))));
}
```

Apply the same check to verdict and report bytes, and assert no fixture-side settings/hook files were created or modified.

## Shared Patterns

### Determinism

**Source:** `src/registry/schema.mjs`, `src/registry/diff.mjs`

Apply to every new report, verdict collection, reverse alias index, and hook pair collection:

- normalize object keys through `stableStringify`;
- sort sets by stable serialized bytes;
- sort verdicts by stable subject key, then code, then evidence bytes;
- clone caller-owned values before composition;
- test reversed/permuted inputs for byte-identical output.

### Fail-Closed Dispatch Safety

**Source:** `src/registry/schema.mjs:38-54`, `src/registry/build.mjs:12-21`, `tests/router.route-targets.test.mjs:91-153`

Missing target, invalid lifecycle/invocation, unavailable dependency, denied/missing permission, inapplicable scope, blocking collision, or ambiguity all yield `dispatchable: false`. No same-name, runtime, global, project, or worktree fallback is permitted after canonical resolution fails.

### Stable Identity and Lifecycle Evidence

**Source:** `src/registry/diff.mjs:47-64,82-103,146-168`

Only canonical identity, shared origin, or compatible native identity can authorize rename/move continuity. A content fingerprint or similar name may emit `possible_match` evidence but cannot transfer aliases.

### Portable Diagnostics

**Source:** `src/registry/schema.mjs:25-27,57-69`; `tests/router.adapters.test.mjs:52-55`

Canonical reports contain logical roots and relative paths only. Every rejection verdict includes a stable code, subject identity, reason, portable evidence, and concrete corrective action.

### Atomic Publication and Last-Known-Good Preservation

**Source:** `src/registry/watcher.mjs:159-177`; `tests/router.registry-watcher.test.mjs`

Evaluate the entire candidate first. On quarantine, publish only candidate/report diagnostics and prove active bytes/fingerprint are unchanged. Never expose a partially invalidated alias set. Phase 13 must not add active pointers, version activation, or rollback mechanics.

### Inert Runtime Adapter Behavior

**Source:** `src/adapters/claude.mjs`; `src/adapters/codex.mjs`; `tests/router.adapters.test.mjs`

Discovery parses bounded native formats without executing commands and preserves malformed artifacts as non-dispatchable observations. Reconciliation relates observations but never rewrites Claude/Codex configuration or synthesizes trust.

## Planning Boundaries

- Treat the alias source as an explicit injected contract. Do not implicitly read global live mode-map files from the pure reconciler.
- Keep hook grammar bounded and fixture-driven. Unsupported shell/string forms quarantine with corrective guidance.
- Treat the active snapshot as an explicit input. A fixture/in-memory active snapshot is sufficient until Phase 14 defines immutable versions and pointers.
- Candidate publication is not activation; preserve `activated: false`.
- Do not add packages, databases, secrets, OS registration, or automatic runtime configuration edits.

## No Analog Found

None. All proposed files have strong local analogs, although hook full-outer-join classification is a new combination of existing adapter normalization and deterministic diff patterns.

## Metadata

**Analog search scope:** `src/registry`, `src/adapters`, `tests/router.registry-*.test.mjs`, `tests/router.route-targets.test.mjs`, `tests/router.adapters.test.mjs`
**Files scanned:** 12 focused source/test files
**Pattern extraction date:** 2026-07-15
