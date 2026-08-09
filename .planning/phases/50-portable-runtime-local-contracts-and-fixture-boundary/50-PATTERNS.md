# Phase 50: Portable Runtime-Local Contracts and Fixture Boundary - Pattern Map

**Mapped:** 2026-08-09
**Files analyzed:** 13 planned new/modified files
**Analogs found:** 9 / 13

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/adapters/claude.mjs` | service | file-I/O -> transform | existing `createAdapter()` and `discoverRoots()` in the same file | exact |
| `src/adapters/codex.mjs` | service | file-I/O -> transform | `src/adapters/claude.mjs` | exact |
| `src/registry/schema.mjs` | model | transform | existing `normalizeRecord()`, `validateCapability()`, and `canonicalizeCapability()` | exact |
| `src/registry/contract.mjs` | model | transform | existing `CONTRACT_FIELDS`, `buildCapabilityContract()`, and `validateCapabilityContract()` | exact |
| `src/registry/eligibility.mjs` | service | transform | existing `ELIGIBILITY_GATES` and `evaluateEligibility()` | exact |
| `src/registry/build.mjs` | service | batch | existing `assembleRegistry()` enrichment pipeline | exact |
| `src/coverage/audit.mjs` | service | batch | existing additive `auditCoverage()` report | exact |
| `tests/helpers/inventory-fixture.mjs` | test utility | file-I/O | in-memory profile builders in the same file; filesystem setup in `tests/router.phase26-dual-runtime.test.mjs` | role-match |
| `tests/router.v18-contracts.test.mjs` | test | batch + file-I/O | `tests/router.contracts.test.mjs` plus `tests/router.phase26-dual-runtime.test.mjs` | exact composite |
| `tests/fixtures/v1.8/empty-claude.json` | config fixture | file-I/O | `tests/helpers/inventory-fixture.mjs` declarative synthetic records | no file analog |
| `tests/fixtures/v1.8/minimal-codex.json` | config fixture | file-I/O | `tests/helpers/inventory-fixture.mjs` declarative synthetic records | no file analog |
| `tests/fixtures/v1.8/asymmetric-runtimes.json` | config fixture | file-I/O | `buildClaudeHeavyProfile()` / `buildCodexHeavyProfile()` | no file analog |
| `tests/fixtures/v1.8/conflicting-invalid.json` | config fixture | file-I/O | `contractEvidence(record, variant)` | no file analog |

## Pattern Assignments

### `src/adapters/claude.mjs` (service, file-I/O -> transform)

**Analog:** Existing adapter factory and runtime-root exports in `src/adapters/claude.mjs`.

**Exports to preserve:** `createAdapter`, `parseArtifact`, `normalizeArtifact`, `compileInvocation`, `discoverRoots`.

**Portable provenance pattern** (lines 439-448):

```js
const record = { schema_version: 1, type: nativeRecord.type, name: nativeRecord.name,
  // existing fields omitted
  provenance: [{ runtime, scope: scope.kind,
    logical_root: nativeRecord.logicalRoot,
    relative_path: nativeRecord.relativePath,
    source_fingerprint: nativeRecord.sourceFingerprint,
    adapter: adapterVersion,
    parser: `${nativeRecord.type}@1`,
    ...packageProvenance(nativeRecord.relativePath) }],
  adapter_evidence: [{ namespace: runtime, native_type: `${runtime}:${nativeRecord.type}`,
    adapter: adapterVersion, parser: `${nativeRecord.type}@1` }],
};
```

**Explicit-root discovery pattern** (lines 469-486, 496-500):

```js
function discover(rootSpecs) {
  const observations = [], diagnostics = [];
  for (const spec of [...rootSpecs].sort((a, b) => a.logicalRoot.localeCompare(b.logicalRoot))) {
    let canonicalRoot;
    try { canonicalRoot = realpathSync(resolve(spec.root)); }
    catch (error) { if (error?.code === 'ENOENT') continue; throw error; }
    // walk, parse, normalize, then stable-sort observations and diagnostics
  }
  return { observations, diagnostics };
}

export function discoverRoots(options = {}) {
  if (!options.claudeRoot) throw new TypeError('claudeRoot is required');
  const roots = [{ root: options.claudeRoot, logicalRoot: 'claude_global', scope: { kind: 'global' } }];
  // project root remains explicit and symbolic
  return adapter.discover(roots);
}
```

**Reuse constraint:** Do not add home-directory fallback. Keep absolute roots local to acquisition; emitted records retain only `logical_root` and normalized `relative_path`. Preserve existing escape, cycle, oversized-artifact, malformed-artifact, and unsupported-layout diagnostics.

---

### `src/adapters/codex.mjs` (service, file-I/O -> transform)

**Analog:** `src/adapters/claude.mjs::createAdapter()`.

**Exports to preserve:** `parseArtifact`, `normalizeArtifact`, `compileInvocation`, `discoverRoots`.

**Factory reuse pattern** (lines 1-2, 43-48):

```js
import { basename, join, resolve } from 'node:path';
import { createAdapter } from './claude.mjs';

export const parseArtifact = adapter.parseArtifact;
export const normalizeArtifact = adapter.normalizeArtifact;
export const compileInvocation = adapter.compileInvocation;
export function discoverRoots(options = {}) {
  if (!options.codexRoot) throw new TypeError('codexRoot is required');
  const roots = [{ root: options.codexRoot, logicalRoot: 'codex_home', scope: { kind: 'global' } }];
  // project root follows the same explicit-root pattern
}
```

**Reuse constraint:** Extend the shared adapter factory or Codex layout/config expander only where native Codex mechanics differ. Do not mirror Claude paths, counts, or invocation forms and do not infer cross-runtime equivalence from names.

---

### `src/registry/schema.mjs` (model, transform)

**Analog:** Existing normalization followed by trust-boundary validation and canonicalization.

**Exports to preserve:** `validateEligibility`, `validateCapability`, `stableStringify`, `canonicalizeCapability`.

**Additive defaults pattern** (lines 141-154):

```js
function normalizeRecord(record) {
  const runtime = runtimeOf(record);
  const nativeType = record.native_type || `${runtime}:${record.type}`;
  const semanticType = normalizedSemanticType(record);
  return {
    ...record,
    native_type: nativeType,
    semantic_type: semanticType,
    lifecycle_role: normalizedLifecycleRole(record, semanticType),
    enabled: record.enabled ?? true,
    invocation: normalizeInvocation(record),
    adapter_evidence: normalizeAdapterEvidence(record, nativeType),
    diagnostics: record.diagnostics || [],
  };
}
```

**Portable path validation** (lines 176-188):

```js
for (const field of ['runtime', 'scope', 'logical_root', 'relative_path', 'source_fingerprint', 'adapter']) {
  nonempty(source[field], `${path}.${field}`);
}
if (isAbsolutePortablePath(source.logical_root)) fail(`${path}.logical_root must be logical, not absolute`);
if (isAbsolutePortablePath(source.relative_path)) fail(`${path}.relative_path must be relative`);
const normalized = posix.normalize(source.relative_path.replaceAll('\\', '/'));
if (normalized === '..' || normalized.startsWith('../')) fail(`${path}.relative_path must remain within its logical root`);
```

**Canonical boundary** (lines 385-388):

```js
export function canonicalizeCapability(record) {
  validateCapability(record);
  return canonicalize(normalizeRecord(record));
}
```

**Reuse constraint:** Add bounded metadata as canonical defaults without removing or renaming existing outer fields. Deduplicate/sort arrays through existing canonicalization; use `stableStringify()` for deterministic bytes. Validation at this trust boundary must reject private absolute paths and escaping relative paths.

---

### `src/registry/contract.mjs` (model, transform)

**Analog:** Existing declared-first field-envelope contract.

**Exports to extend/preserve:** `CONTRACT_FIELDS`, `CONTRACT_POLICY`, `validateContractFieldValue`, `buildCapabilityContract`, `validateCapabilityContract`.

**Complete field-set assembly** (lines 227-245):

```js
export function buildCapabilityContract(record, fieldEvidence = {}) {
  validateCapability(record);
  const fallback = authoritativeEvidence(record);
  const fields = Object.fromEntries(CONTRACT_FIELDS.map(field => [
    field,
    envelope(field, Object.hasOwn(fieldEvidence, field) ? fieldEvidence[field] : fallback[field]),
  ]));
  const unknownDispatchFields = CONTRACT_FIELDS.filter(field => (
    DISPATCH_FIELDS.has(field) && fields[field].state !== 'known'
  ));
  return {
    schema_version: 1,
    policy_version: CONTRACT_POLICY.policy_version,
    fields,
    disposition: unknownDispatchFields.length ? 'recommendation-only' : 'dispatch-candidate',
    reason_codes: unknownDispatchFields.length
      ? unknownDispatchFields.map(field => fields[field].reason_codes[0]).sort()
      : ['contract_complete'],
  };
}
```

**Validation style** (lines 467-489): validate the exact canonical field set, known/unknown envelope state, value shape, and bounded evidence; throw `TypeError` with field-qualified messages.

**Reuse constraint:** Declared metadata wins. Names, descriptions, aliases, and paths may populate retrieval semantics only; they must not prove effects, authority, risk, dependencies, permissions, or executable eligibility. Keep migration additive and bump only the contract policy version if emitted semantics actually change.

---

### `src/registry/eligibility.mjs` (service, transform)

**Analog:** Existing independent gate map in `evaluateEligibility()`.

**Exports to extend/preserve:** `ELIGIBILITY_GATES`, `isQuarantined`, `evaluateEligibility`.

**Independent gate pattern** (lines 198-247):

```js
const gates = {
  target_existence: targetState(record, recordsById),
  invocation_shape: invocationState(record),
  adapter: adapterState(record),
  dependency_closure: dependencyState(record, recordsById, relationships),
  permission: fieldState(record, 'permissions', value => /* passed/failed */),
  scope: fieldState(record, 'scope', value => /* passed/failed */),
  side_effects: fieldState(record, 'side_effects', value => /* passed/failed */),
  reversibility: fieldState(record, 'reversibility', value => /* passed/failed/unknown */),
  risk: fieldState(record, 'risk', value => /* passed/failed/unknown */),
  field_confidence: confidenceState(record),
};
const reasonCodes = ELIGIBILITY_GATES
  .filter(name => gates[name] !== 'passed')
  .map(name => `${name}_${gates[name]}`);
```

**Reuse constraint:** Unknown execution-critical facts fail their own gate and remain inspectable. Add only missing authority/dependency decisions to this gate owner; do not create a second eligibility decision inside coverage classification.

---

### `src/registry/build.mjs` (service, batch)

**Analog:** Existing single enrichment seam in `assembleRegistry()`.

**Exports to preserve:** `acquireRegistry`, `buildFullRegistry`, `refreshIncrementalAcquisition`, `buildIncrementalRegistry`, `assembleRegistry`.

**Assembly order** (lines 284-295, 334-360):

```js
export function assembleRegistry(acquisition, options = {}) {
  validateAcquisition(acquisition);
  const observations = [...acquisition.claude.observations, ...acquisition.codex.observations];
  // validate -> stable ID -> merge variants
  for (const record of records) {
    record.contract = buildCapabilityContract(record);
    validateCapabilityContract(record.contract);
  }
  // overlays -> relationships -> eligibility
  const enrichedRecords = overlaidRecords.map(record => {
    const eligibility = evaluateEligibility({ record: authoritative, records: overlaidRecords, relationships });
    return { ...authoritative, dispatchable: eligibility.eligible, eligibility };
  });
  enrichedRecords.sort(/* stable ID + provenance key */);
}
```

**Classification owner:** Add one deterministic private classifier at this assembly seam (suggested name `classifyCapabilityCoverage`). Call it exactly once per enriched record after contract and eligibility exist. Stamp `coverage: { classification, reasons }` on the record. Keep the function private unless a real second caller needs it; tests should prefer `assembleRegistry()` output.

**Required precedence:** `invalid` -> `unavailable` -> `excluded` -> `hook-owned` -> `project-scoped` -> `direct-only` -> `composable` -> `routable`. The first matching class wins. Retain every record, including invalid, unavailable, and recommendation-only records.

**Reuse constraint:** Do not classify from mode-map membership or explicit phrase mappings. Do not add a second registry or routing path. Preserve tuple assembly, stable sorting, fingerprints, overlays, relationships, quarantine, and last-known-good compatibility.

---

### `src/coverage/audit.mjs` (service, batch)

**Analog:** Existing additive report construction in `auditCoverage()`.

**Export to preserve:** `auditCoverage`.

**Compatible report pattern** (lines 287-327):

```js
const byClassification = {};
for (const entry of records) {
  const key = entry.classification || 'mapped';
  byClassification[key] = (byClassification[key] || 0) + 1;
}

return {
  schema_version: 1,
  records,
  // preserve existing diagnostics and fields
  counts: {
    total: records.length,
    mapped: records.filter(entry => entry.coverage_status === 'mapped').length,
    unmapped: records.filter(entry => entry.coverage_status === 'unmapped').length,
    by_classification: Object.fromEntries(Object.entries(byClassification).sort(([a], [b]) => a.localeCompare(b))),
  },
  unacknowledged_gaps: unacknowledgedGaps,
  fingerprints: { /* canonical existing inputs */ },
};
```

**Reuse constraint:** Consume the classification stamped by `assembleRegistry()`; do not reimplement the decision tree. Add record-level classified output, per-runtime counts, and `unclassified` additively. Strict coverage fails only for unclassified records, duplicate/missing IDs, or tuple-integrity errors; intentional non-routable classes remain visible valid outcomes. Preserve old report keys for current callers.

---

### `tests/helpers/inventory-fixture.mjs` (test utility, file-I/O)

**Analogs:** Existing anonymous record builders in this file and temporary-root lifecycle in `tests/router.phase26-dual-runtime.test.mjs` lines 14-25, 59-62.

**Exports to preserve:** `syntheticRoots`, `mutationPlayback`, `recommendationKinds`, all `build*Profile` functions, `playbackMutation`, `assertSemanticBytesEqual`, `contractEvidence`.

**Anonymous portable data pattern** (lines 25-66):

```js
function record(name, overrides = {}) {
  const runtime = overrides.runtime || 'claude';
  const scope = overrides.scope || { kind: 'global' };
  return {
    schema_version: 1,
    name,
    scope,
    provenance: [{
      runtime,
      scope: scope.kind,
      logical_root: scope.kind === 'global' ? syntheticRoots.home : syntheticRoots.project,
      relative_path: `capabilities/${name}/manifest.md`,
      source_fingerprint: `fixture-${name}`,
      adapter: `${runtime}@fixture`,
      parser: 'frontmatter@fixture',
    }],
    ...overrides,
  };
}
```

**Temporary filesystem pattern** (`tests/router.phase26-dual-runtime.test.mjs`, lines 14-25, 59-62):

```js
function fixture(profile) {
  const root = mkdtempSync(join(tmpdir(), `router-phase26-${profile}-`));
  const claudeRoot = join(root, '.claude');
  const codexRoot = join(root, '.codex');
  mkdirSync(claudeRoot, { recursive: true });
  mkdirSync(codexRoot, { recursive: true });
  // materialize only requested files
}

try {
  // assertions
} finally {
  rmSync(f.root, { recursive: true, force: true });
}
```

**Planned helper shape:** Extend this file with one scenario loader/materializer export (one owner, no second fixture framework). Use only `node:fs`, `node:os`, and `node:path`; accept an explicit scenario/path, create one temporary root, return explicit `claudeRoot`, `codexRoot`, and cleanup handle/function.

**Reuse constraint:** Scenario names must be generic/randomized enough to defeat exact-name routing. Never read `HOME`, `CODEX_HOME`, live `.claude`, or live `.codex`. Never serialize raw prompts, credentials, private capability bodies, or absolute temporary paths.

---

### `tests/router.v18-contracts.test.mjs` (test, batch + file-I/O)

**Primary analog:** `tests/router.contracts.test.mjs`.

**Secondary analogs:** `tests/router.phase26-dual-runtime.test.mjs` for isolated dual roots and `tests/router.context-sources.test.mjs` for privacy-negative assertions.

**Imports/test style** (`tests/router.contracts.test.mjs`, lines 1-13):

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildClaudeHeavyProfile,
  buildCodexHeavyProfile,
  buildMixedCustomProfile,
  buildUnknownFutureProfile,
  contractEvidence,
} from './helpers/inventory-fixture.mjs';
import { assembleRegistry } from '../src/registry/build.mjs';
import { canonicalizeCapability, stableStringify, validateCapability } from '../src/registry/schema.mjs';
```

**Contract loop style** (`tests/router.contracts.test.mjs`, lines 69-85):

```js
test('[phase22-red:contracts] every profile receives complete field envelopes', async () => {
  const { CONTRACT_FIELDS, buildCapabilityContract, validateCapabilityContract } = await import('../src/registry/contract.mjs');
  for (const record of profiles.flat()) {
    const contract = buildCapabilityContract(record, contractEvidence(record));
    assert.deepEqual(Object.keys(contract.fields).sort(), [...CONTRACT_FIELDS].sort());
    assert.equal(validateCapabilityContract(contract), true);
  }
});
```

**Determinism/privacy style** (`tests/router.contracts.test.mjs`, lines 100-106, 109-128): use `stableStringify()`, compare canonical bytes across reversed/set permutations, and use `assert.doesNotMatch()` for `SECRET`, `private`, authored bodies, and `/Users/`.

**Required assertions:**

- CVRG-01: explicit temporary Claude/Codex roots discover only requested fixture artifacts.
- CVRG-02: discovered IDs equal unique classified IDs and assembled count; portable fields are complete.
- CVRG-03: routable/composable records expose the bounded typed metadata shape and deterministic canonical bytes.
- CVRG-04: independently vary effects, risk, authority, and dependencies; each unknown yields `eligible: false` and its own reason.
- CVRG-05: compare discovered and classified counts within each runtime, never Claude count against Codex count.
- CVRG-06: run all scenarios with live-home variables poisoned/redirected and reject workspace paths, `/Users/`, absolute roots, and `..` escapes in emitted values.

**Reuse constraint:** Use top-level `test()` and strict assertions; no describe framework, snapshots package, fixture package, test runner dependency, or live-home integration in the default suite. Cleanup belongs in `finally`.

---

### `tests/fixtures/v1.8/*.json` (config fixtures, file-I/O)

**Closest behavioral analog:** Synthetic record/profile data in `tests/helpers/inventory-fixture.mjs`; there is no existing committed JSON fixture format under `tests/`.

**Files:**

- `empty-claude.json`
- `minimal-codex.json`
- `asymmetric-runtimes.json`
- `conflicting-invalid.json`

**Assignment:** Define the smallest declarative schema the helper needs: requested runtime-relative files plus their anonymous contents/metadata. Keep filesystem mechanics, defaults, path validation, and cleanup in the helper rather than duplicating them in JSON.

**Reuse constraint:** Use synthetic logical roots and relative paths only. No absolute roots, user names, real capability names, credentials, private prompt bodies, or executable assumptions inferred from names. JSON object/array order must be deterministic where it affects canonical bytes.

## Shared Patterns

### One Classification Owner

**Source:** `src/registry/build.mjs::assembleRegistry()` lines 284-360.

**Apply to:** Registry assembly and coverage audit.

Contract and eligibility are already present at assembly time. Classify once there, stamp the record, and have `auditCoverage()` aggregate the stamped value. No classifier export or new module is needed unless another concrete caller appears.

### Additive Compatibility

**Sources:** `src/registry/schema.mjs::normalizeRecord()` lines 141-154 and `src/coverage/audit.mjs::auditCoverage()` lines 313-344.

Add defaults with object spread, preserve old keys and report fields, keep schema-compatible outer records, and version only changed contract semantics. Existing consumers continue reading their current fields while new consumers use typed metadata/classification.

### Portable Logical Roots

**Sources:** `src/adapters/claude.mjs` lines 439-448 and `src/registry/schema.mjs` lines 176-188.

Persist symbolic `logical_root`, normalized non-absolute `relative_path`, and source fingerprint. Absolute roots are acquisition-local diagnostics only and must not enter registry records, reports, snapshots, or committed fixtures.

### Fail-Closed Execution, Visible Records

**Sources:** `src/registry/eligibility.mjs::evaluateEligibility()` lines 198-247 and `src/registry/build.mjs::assembleRegistry()` lines 334-359.

Unknown/failed gates make records recommendation-only/non-executable, but assembly retains them. Classification describes the retained result; it never overrides eligibility.

### Existing Node Test Stack

**Sources:** `tests/router.contracts.test.mjs` lines 1-13 and `tests/router.phase26-dual-runtime.test.mjs` lines 1-8, 14-25, 59-62.

Use Node ESM, `node:test`, `node:assert/strict`, standard-library temporary directories, explicit roots, and `try/finally` cleanup. Add no dependency and no fixture framework.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `tests/fixtures/v1.8/empty-claude.json` | config fixture | file-I/O | Repository has no committed JSON test fixtures; derive the minimal format from the existing helper. |
| `tests/fixtures/v1.8/minimal-codex.json` | config fixture | file-I/O | Same boundary; do not introduce a generic fixture schema/framework. |
| `tests/fixtures/v1.8/asymmetric-runtimes.json` | config fixture | file-I/O | Existing asymmetry is expressed by JS profile builders, not JSON. |
| `tests/fixtures/v1.8/conflicting-invalid.json` | config fixture | file-I/O | Existing conflict variants are generated by `contractEvidence()`, not a file format. |

## Metadata

**Analog search scope:** `src/adapters`, `src/registry`, `src/coverage`, `tests/helpers`, focused router contract/coverage/fixture tests
**Files scanned:** 15 existing source/test files plus phase context and research
**Pattern extraction date:** 2026-08-09
**Dependency rule:** Reuse Node standard library and current modules only; add no package
