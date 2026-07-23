# Phase 12: Incremental Change Detection and Watcher - Pattern Map

**Mapped:** 2026-07-15
**Files analyzed:** 8 new/modified files
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/registry/fingerprint.mjs` | utility / store | file-I/O, transform | `src/registry/identity.mjs`; `src/lifecycle/router-lifecycle.mjs` | role-match |
| `src/registry/diff.mjs` | service / utility | transform, event-driven | `src/registry/build.mjs`; `src/registry/identity.mjs` | role + domain match |
| `src/registry/build.mjs` | service | batch, transform | existing `src/registry/build.mjs` | exact extension |
| `src/registry/watcher.mjs` | controller / service | event-driven, file-I/O | adapter discovery in `src/adapters/claude.mjs`; lifecycle injection in `src/lifecycle/router-lifecycle.mjs` | partial match |
| `install-router.mjs` and `src/lifecycle/router-lifecycle.mjs` | route / controller / config | request-response, file-I/O | existing CLI and installer paths | exact extension |
| `tests/router.registry-diff.test.mjs` | test | transform | `tests/router.registry-schema.test.mjs`; `tests/router.registry-build.test.mjs` | role-match |
| `tests/router.registry-build.test.mjs` | test | batch, file-I/O | existing file | exact extension |
| `tests/router.registry-watcher.test.mjs` | test | event-driven, file-I/O | `tests/router.lifecycle.test.mjs` | role-match |

The phase inputs name `fingerprint.mjs`, `diff.mjs`, `build.mjs`, `watcher.mjs`, `install-router.mjs`, and the three tests directly. `router-lifecycle.mjs` is included because `install-router.mjs` is deliberately thin and all owned module deployment/configuration is implemented there.

## Pattern Assignments

### `src/registry/fingerprint.mjs` (utility/store, file-I/O + transform)

**Analogs:** `src/registry/identity.mjs` for canonical hashing; `src/lifecycle/router-lifecycle.mjs` for atomic persisted state.

**Imports and canonical hash pattern** (`src/registry/identity.mjs` lines 1-2, 28-30):

```js
import { createHash } from 'node:crypto';
import { canonicalizeCapability, stableStringify } from './schema.mjs';

export function contentFingerprint(value) {
  const canonical = value?.schema_version === 1 ? canonicalizeCapability(value) : value;
  return createHash('sha256').update(stableStringify(canonical), 'utf8').digest('hex');
}
```

Copy the SHA-256-over-`stableStringify` convention. Fingerprint entries must use logical roots, normalized relative paths, entry types, and stable content/subtree hashes; exclude absolute paths, mtimes, inode/device values, scan timestamps, and directory enumeration order.

**Atomic persistence and invalid JSON pattern** (`src/lifecycle/router-lifecycle.mjs` lines 17-30):

```js
function atomicWrite(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.tmp.${process.pid}`;
  writeFileSync(temporary, value);
  renameSync(temporary, file);
}

function readJson(file, fallback, label = file) {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is invalid JSON: ${error.message}`);
  }
}
```

Persist a versioned state document through temp-file + rename. Unlike the ownership manifest, scan state is a cache: missing, malformed, incompatible, or root-set-mismatched state should return a clean-rescan outcome, not become authority and not partially merge.

**Portable-path validation pattern** (`src/registry/schema.mjs` lines 57-69): provenance requires nonempty logical/relative paths, rejects absolute logical or relative paths, normalizes separators with `posix.normalize`, and rejects `..` escape. Reuse those invariants in the persisted-state validator rather than accepting arbitrary cached paths.

### `src/registry/diff.mjs` (service/utility, transform + event-driven)

**Analogs:** `src/registry/build.mjs` for deterministic grouping/sorting; `src/registry/identity.mjs` for strong continuity.

**Strong identity pattern** (`src/registry/identity.mjs` lines 9-25):

```js
export function stableCapabilityId(record) {
  const suffix = scopeSuffix(record.scope);
  if (typeof record.canonical_identity === 'string' && record.canonical_identity.trim()) {
    return `${record.canonical_identity.trim()}${suffix}`;
  }
  if (record.shared_origin?.authority && typeof record.shared_origin.identity === 'string'
    && record.shared_origin.identity.trim()) {
    return `origin:${record.shared_origin.identity.trim()}${suffix}`;
  }
  const variant = record.runtime_variants?.find((entry) => entry.runtime === record.invocation?.runtime)
    || record.runtime_variants?.[0];
  // ...require runtime, type, and native_identity...
  return `${runtime}:${record.type}:${nativeIdentity}${suffix}`;
}
```

Use `canonical_identity` or authoritative `shared_origin` as rename/move continuity evidence. Native identity is useful only within its compatible runtime/type/scope contract. Content/name similarity alone must produce `removed` + `added`; optional correlation belongs only in a sorted diagnostic.

**Deterministic field comparison pattern** (`src/registry/build.mjs` lines 12-21, 27-50):

```js
const MATERIAL_FIELDS = [
  ['name', 'informational'],
  ['type', 'dispatch-blocking'],
  ['description', 'informational'],
  ['lifecycle', 'dispatch-blocking'],
  ['dispatchable', 'dispatch-blocking'],
  ['invocation', 'dispatch-blocking'],
  ['dependencies', 'dispatch-blocking'],
  ['scope', 'build-blocking'],
];
```

The builder groups values by stable serialized keys, deduplicates sources with `Set`, sorts sources and values, and then emits one structured conflict. Mirror that approach for changed dimensions: compute all facets first, select one primary classification by a documented precedence, sort secondary facets by fixed schema order, and emit one event per authoritative continuity pair.

Recommended precedence from research: `renamed`/`moved`, `removed`/`added`, `disabled`, `scope_changed`, `dependency_changed`, `permission_changed`, `content_changed`. Path + content under strong continuity is one move/rename event with `content_changed` facet.

### `src/registry/build.mjs` (service, batch + transform)

**Analog:** the existing file is the semantic oracle.

**Current discovery and assembly seam** (`src/registry/build.mjs` lines 87-110):

```js
export function buildFullRegistry(options = {}) {
  const claude = discoverClaude(options);
  const codex = discoverCodex(options);
  const observations = [...claude.observations, ...codex.observations];
  const groups = new Map();
  for (const record of observations) {
    validateCapability(record);
    const id = stableCapabilityId(record);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(record);
  }
  const records = [...groups.entries()].map(([id, variants]) => ({ id, ...mergeGroup(variants) }));
  annotatePrecedence(records);
  records.sort((a, b) => `${a.id}:${key(a.provenance)}`.localeCompare(`${b.id}:${key(b.provenance)}`));
  // diagnostics sorting, registry, summary, and fingerprints
  return { registry, diagnostics, summary };
}
```

Refactor only the acquisition boundary: extract a shared pure assembly function that accepts the complete Claude/Codex observation and diagnostic sets. `buildFullRegistry` discovers everything and calls it; `buildIncrementalRegistry` applies removals/replacements to the previous complete observation snapshot and calls the same function. Keep `mergeGroup`, conflict synthesis, precedence, diagnostic normalization, sorting, summary counts, and both fingerprints shared.

Do not compare only `registry.records`: REG-03 parity is `stableStringify(fullReturn) === stableStringify(incrementalReturn)` after every mutation.

### `src/registry/watcher.mjs` (controller/service, event-driven + file-I/O)

**Analogs:** adapter root scanning for authoritative truth; lifecycle dependency injection/error rollback for controllability. No current watcher exists.

**Bounded authoritative scan pattern** (`src/adapters/claude.mjs` lines 259-274):

```js
function discover(rootSpecs) {
  const observations = [], diagnostics = [];
  for (const spec of [...rootSpecs].sort((a, b) => a.logicalRoot.localeCompare(b.logicalRoot))) {
    let canonicalRoot;
    try { canonicalRoot = realpathSync(resolve(spec.root)); }
    catch (error) { if (error?.code === 'ENOENT') continue; throw error; }
    for (const path of walk(canonicalRoot).sort()) {
      // recognize, parse, normalize
    }
  }
  observations.sort((a, b) => key(a).localeCompare(key(b)));
  diagnostics.sort((a, b) => key(a).localeCompare(key(b)));
  return { observations, diagnostics };
}
```

Treat `fs.watch` callbacks only as dirty-root hints, including when filename is absent. Store logical roots in a `Set`, sort before reconciliation, debounce at configurable 250 ms, and enforce a maximum coalescing deadline below two seconds. Maintain one in-flight reconcile plus a rerun flag so bursts do not process duplicate work or race state writes.

Inject `watchFactory`, scanner/reconcile callback, clock/timer scheduler, and state reader/writer. Schedule startup repair and the no-greater-than-five-minute periodic repair independently of watcher creation, so watch failure cannot disable correctness repair. `close()` must close every watcher and clear all timers; callbacks after close must be inert.

**Error boundary convention:** lifecycle performs all preflight before mutation and wraps mutation in `try/catch`, restoring state then rethrowing (`src/lifecycle/router-lifecycle.mjs` lines 101-118 and 149-209). The watcher should similarly compute scan/diff/build before persisting the new state; a failed reconcile retains the last valid persisted baseline and reports the error through an injected handler.

### `install-router.mjs` / `src/lifecycle/router-lifecycle.mjs` (CLI/controller/config, request-response + file-I/O)

**Existing thin CLI pattern** (`install-router.mjs` lines 15-25, 54-67): parse flags with `has`/`arg`, resolve paths, construct an options object, and delegate to lifecycle functions. Keep watcher/controller policy out of this CLI entrypoint except for explicit background configuration/path options demanded by the plan.

**Owned deployment list** (`src/lifecycle/router-lifecycle.mjs` lines 124-137):

```js
const built = (options.buildRegistry || buildFullRegistry)({ /* roots */ });
const candidateValue = stableStringify(built.registry) + '\n';
const reportValue = stableStringify({ diagnostics: built.diagnostics, summary: built.summary }) + '\n';
const moduleNames = ['registry/build.mjs', 'registry/schema.mjs', 'registry/identity.mjs',
  'adapters/claude.mjs', 'adapters/codex.mjs'];
const moduleValues = moduleNames.map(name => [join(p.ownedRoot, 'modules', name), readFileSync(join(sourceRoot, name))]);
const ownedValues = [...moduleValues, [p.candidatePath, candidateValue], [p.reportPath, reportValue]];
```

Extend `moduleNames` with Phase 12 modules and add only router-owned scan-state/controller configuration paths to `ownedValues` and the manifest. Preserve preflight ownership checks, dry-run reporting, transaction snapshot/restore, fingerprint verification, and uninstall's “remove only if bytes still match” behavior. Do not add scanning to `UserPromptSubmit`, activate candidates, or invent launchd/systemd registration in this phase.

### `tests/router.registry-diff.test.mjs` (test, transform)

**Analog:** table-like deterministic assertions in `tests/router.registry-build.test.mjs` lines 44-73 and identity/canonicalization tests in `tests/router.registry-schema.test.mjs`.

Use plain `node:test` plus `node:assert/strict`. Build small canonical observation factories and cover add, edit, rename, move, disable, dependency, permission, scope, and delete. Explicitly assert D-01 through D-04: preserved ID and old/new provenance under strong evidence; compound path/content single-event behavior; weak evidence yields two events plus non-authoritative diagnostic; primary plus ordered facets has no duplicates. Repeat with reversed input order and compare `stableStringify` outputs.

### `tests/router.registry-build.test.mjs` (test, batch + file-I/O)

**Existing fixture pattern** (lines 9-16, 28-41):

```js
function artifact(root, runtime, scope, category, name, data) {
  const base = scope === 'global' ? join(root, runtime) : join(root, 'project', `.${runtime}`);
  mkdirSync(join(base, category), { recursive: true });
  writeFileSync(join(base, category, `${name}.json`), JSON.stringify({ schema_version: 1, name, ...data }));
}

const root = mkdtempSync(join(tmpdir(), 'registry-build-'));
try {
  // mutate fixture and build
} finally { rmSync(root, { recursive: true, force: true }); }
```

Extend this file with a mutation sequence. After every mutation, compare the complete incremental return to a fresh `buildFullRegistry(options)` via `stableStringify`, including diagnostics, summary, and fingerprints. Include removal, malformed-to-valid, valid-to-malformed, rename/move with and without strong identity, and project/global precedence changes. Retain the assertion that serialized results never contain the temporary absolute root.

### `tests/router.registry-watcher.test.mjs` (test, event-driven + file-I/O)

**Analog:** `tests/router.lifecycle.test.mjs` lines 15-36 for isolated temporary roots and cleanup; lines 69-104 for injected failures and exact before/after snapshots; lines 107-125 for idempotence/repair behavior.

Use injected watch callbacks and timer scheduler or Node MockTimers, not wall-clock sleeps. Assert: 250 ms burst coalescing, one dirty root processed once, continuous events respect the under-two-second cap, missing filename works, one in-flight reconcile schedules exactly one rerun, startup detects downtime changes, periodic repair fires by five minutes, corrupt/incompatible state triggers clean baseline, watcher creation failure still leaves repair active, and `close()` releases watchers/timers and suppresses later work.

## Shared Patterns

### Determinism and validation

**Source:** `src/registry/schema.mjs` lines 102-151.

Objects are serialized with lexically sorted keys, unsupported/cyclic values fail explicitly, and schema-owned set-like arrays are sorted by their stable serialization. Apply this to snapshots, events, diagnostics, and persisted state. Never rely on `readdir` order, `Map` insertion order from unsorted input, or raw `JSON.stringify` for canonical bytes.

### Identity and provenance

**Source:** `src/registry/identity.mjs` lines 4-25 and adapter normalization at `src/adapters/claude.mjs` lines 231-250.

Scope is part of capability identity; provenance uses runtime, scope, logical root, relative path, source fingerprint, and adapter version. Preserve both old and new provenance on authoritative moves/renames. A scope transition needs separate authoritative continuity evidence because the normal stable ID suffix changes.

### Filesystem containment and privacy

**Source:** `src/adapters/claude.mjs` lines 187-211 and `src/registry/schema.mjs` lines 57-69.

Resolve configured roots, realpath requested artifacts, reject anything outside its root, and expose only logical root plus normalized relative path. Absolute local paths may be used internally for I/O but must not enter portable snapshots, lifecycle events, diagnostics, or canonical registry bytes.

### Failure handling and state authority

Persisted scan state is an optimization cache. Validate it completely before use; on corruption or incompatibility, clean-scan. Compute a new candidate in memory before atomic persistence. Parse/read failure is diagnostic evidence, not confirmed deletion. Phase 12 creates inactive candidates/reports only; quarantine, activation, and rollback decisions remain downstream.

### Standard-library and test conventions

Production imports remain `node:` or local ESM only, with no network path, matching `tests/router.lifecycle.test.mjs` lines 229-236. Tests use temporary roots and `try/finally` cleanup. Timing is controlled through injection/fake clocks.

## No Analog Found

There is no existing `fs.watch` coordinator or scheduler in the codebase. `src/registry/watcher.mjs` therefore has only partial analogs for scanning, dependency injection, failure boundaries, and lifecycle ownership. Use the Phase 12 research design for coalescing, repair scheduling, restart recovery, and shutdown while preserving the shared conventions above.

## Metadata

**Analog search scope:** `src/registry`, `src/adapters`, `src/lifecycle`, root installer, and registry/lifecycle tests
**Primary analogs read:** `src/registry/build.mjs`, `src/registry/identity.mjs`, `src/registry/schema.mjs`, `src/adapters/claude.mjs`, `src/lifecycle/router-lifecycle.mjs`, `install-router.mjs`, `tests/router.registry-build.test.mjs`, `tests/router.lifecycle.test.mjs`
**Pattern extraction date:** 2026-07-15
