# Phase 22: Conservative Contracts and Relationship Graph - Pattern Map

**Mapped:** 2026-07-26
**Files analyzed:** 12 likely new/modified files
**Analogs found:** 12 / 12

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/registry/schema.mjs` | model / utility | transform | `src/registry/schema.mjs` | exact extension |
| `src/registry/contract.mjs` | utility | transform | `src/registry/map.mjs` | role + flow |
| `src/registry/relationships.mjs` | utility / model | event-driven transform | `src/registry/reconcile.mjs` | role + flow |
| `src/registry/eligibility.mjs` | utility | transform | `src/registry/map.mjs` + `src/registry/reconcile.mjs` | composite role-match |
| `src/registry/build.mjs` | service / assembler | batch transform | `src/registry/build.mjs` | exact extension |
| `src/registry/reconcile.mjs` | service | event-driven | `src/registry/reconcile.mjs` | exact extension |
| `src/cli/router-control.mjs` | controller / projection | request-response + file-I/O | `src/cli/router-control.mjs` | exact extension |
| `tests/router.contracts.test.mjs` | test | transform | `tests/router.registry-map.test.mjs` | role + flow |
| `tests/router.relationships.test.mjs` | test | event-driven | `tests/router.registry-reconcile.test.mjs` | role + flow |
| `tests/router.contract-overlays.test.mjs` | test | transform | `tests/router.registry-map.test.mjs` | role + flow |
| `tests/router.contract-eligibility.test.mjs` | test | transform | `tests/router.registry-reconcile.test.mjs` | role + flow |
| `tests/router.contract-inspection.test.mjs` | test | request-response | `tests/router.inventory-security.test.mjs` + `tests/router.control-cli.test.mjs` | composite exact behavior |

The research lists five test files in addition to seven production touchpoints. Related test files are grouped into shared assignments below.

## Pattern Assignments

### `src/registry/schema.mjs` (model / utility, transform)

**Analog:** the existing validation and canonicalization in `src/registry/schema.mjs`.

Extend the existing schema-owned normalization rather than introducing a schema package. Keep stable enum errors, explicit bounded arrays, and dispatch invariants together.

**Validation pattern** (`src/registry/schema.mjs:177-207`):

```javascript
export function validateCapability(record) {
  object(record, 'capability');
  if (record.schema_version !== 1) fail('capability.schema_version must be 1');
  nonempty(record.type, 'capability.type');
  nonempty(record.name, 'capability.name');
  oneOf(record.lifecycle, LIFECYCLES, 'capability.lifecycle');
  validateScope(record.scope);
  const normalized = normalizeRecord(record);
  // ...
  if (!normalized.enabled && record.dispatchable) {
    fail('capability.enabled false requires capability.dispatchable false');
  }
}
```

**Canonical bytes pattern** (`src/registry/schema.mjs:282-305`):

```javascript
export function stableStringify(value) {
  return JSON.stringify(normalize(value, '$', new Set()));
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

Contract envelopes and relationship collections must declare which arrays are semantic sets; only those arrays are sorted. Ordered invocation data stays ordered.

---

### `src/registry/contract.mjs` (utility, transform)

**Analog:** `src/registry/map.mjs`.

Copy its flat pure-function module, integer basis-point policy, exact-input fingerprint, portable evidence ledger, stable reason codes, and canonical ordering. Do not create classes or a manifest service.

**Imports and hashing** (`src/registry/map.mjs:1-16`):

```javascript
import { createHash } from 'node:crypto';
import { stableCapabilityId } from './identity.mjs';
import {
  canonicalizeCapability, stableStringify, validateCapability,
} from './schema.mjs';

function fingerprint(value) {
  return createHash('sha256')
    .update(typeof value === 'string' ? value : stableStringify(value), 'utf8')
    .digest('hex');
}
```

**Versioned confidence policy** (`src/registry/map.mjs:61-107`):

```javascript
function canonicalPolicy(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const policy = {
    schema_version: 1,
    policy_version:
      typeof source.policy_version === 'string'
        ? source.policy_version
        : 'mapping-policy-v1',
    precedence: ['explicit', 'identity', 'inheritance', 'lexical', 'advisory'],
    // integer basis-point thresholds and bounds
  };
  for (const group of ['scores', 'minimum_scores', 'minimum_margins', 'bands']) {
    for (const value of Object.values(policy[group])) {
      if (!Number.isInteger(value) || value < 0 || value > 10000) {
        throw new TypeError(`${group} values must be integer basis points`);
      }
    }
  }
  return { ...policy, policy_fingerprint: fingerprint(policy) };
}
```

Use the Phase 22 precedence locked in context: exact adapter/parser evidence, approved exact-ID overlay, deterministic inference, otherwise `unknown`. Preserve rejected/stale/mismatched overlays as evidence; never let them create identity.

**Evidence envelope** (`src/registry/map.mjs:168-180`):

```javascript
function evidence({
  subjectId, targetId, tier, rule, contribution,
  accepted = false, reasonCode, provenance,
}) {
  return portable({
    schema_version: 1,
    subject_id: subjectId,
    target_id: targetId,
    tier,
    rule,
    contribution_basis_points: contribution,
    accepted,
    reason_code: reasonCode,
    ...(provenance ? { provenance } : {}),
  });
}
```

**Fail-closed invalid input** (`src/registry/map.mjs:322-338`):

```javascript
export function mapCandidateRegistry(options = {}) {
  const policy = canonicalPolicy(options.policy || DEFAULT_MAPPING_POLICY);
  let canonical;
  try {
    canonical = canonicalCandidate(options.candidate);
  } catch {
    const canonicalFailure = {
      schema_version: 1,
      policy_version: policy.policy_version,
      policy_fingerprint: policy.policy_fingerprint,
      candidate_fingerprint: null,
      subjects: [],
      evidence_ledger: [],
      advisory_requests: [],
      summary: {
        mapped: 0, unmapped: 0, ambiguous: 0,
        disposition: 'invalid_candidate',
        reason_code: 'candidate_validation_failed',
      },
    };
    return {
      ...canonicalFailure,
      report_fingerprint: fingerprint(canonicalFailure),
    };
  }
}
```

---

### `src/registry/relationships.mjs` (utility / model, event-driven transform)

**Analog:** typed reference handling in `src/registry/reconcile.mjs`.

Use strict enums, exact endpoints, canonical edge ordering, unique IDs, and dangling-target rejection. Extend the shape with evidence, provenance, confidence, freshness, validation state, and active/inactive reason codes.

**Strict edge validation** (`src/registry/reconcile.mjs:64-95`):

```javascript
function canonicalReferences(input, candidate, events) {
  if (!input || typeof input !== 'object'
    || input.schema_version !== 1 || !Array.isArray(input.edges)) {
    throw new TypeError(
      'references must be a version 1 graph with an edges array');
  }
  const edges = input.edges.map(edge => {
    if (!edge || typeof edge !== 'object') {
      throw new TypeError('reference edge must be an object');
    }
    for (const field of ['id', 'type', 'from_id', 'to_id']) {
      if (typeof edge[field] !== 'string' || !edge[field].trim()) {
        throw new TypeError(
          `reference edge ${field} must be a non-empty string`);
      }
    }
    if (!REFERENCE_TYPES.has(edge.type)) {
      throw new TypeError(`unsupported reference edge type: ${edge.type}`);
    }
    return {
      id: edge.id.trim(),
      type: edge.type,
      from_id: edge.from_id.trim(),
      to_id: edge.to_id.trim(),
    };
  }).sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
  if (new Set(edges.map(edge => edge.id)).size !== edges.length) {
    throw new TypeError('reference edge ids must be unique');
  }
  return { schema_version: 1, edges };
}
```

Use exactly the eight Phase 22 edge types. Lexical similarity may emit an inactive candidate only; it cannot establish `alias`, `substitute`, or equivalence.

**Reverse invalidation closure** (`src/registry/reconcile.mjs:97-114`):

```javascript
function invalidationClosure(candidate, events, references) {
  const seeds = new Set();
  for (const event of events) {
    if (['removed', 'replaced', 'disabled'].includes(event?.primary)
      && typeof event.canonical_id === 'string') {
      seeds.add(event.canonical_id);
    }
  }
  for (const record of candidate.records) {
    if (record.enabled === false || record.lifecycle !== 'ready'
      || record.dependencies.items.some(dependency => !dependency.available)) {
      seeds.add(record.id);
    }
  }
  const reverse = new Map();
  for (const edge of references.edges) {
    if (!reverse.has(edge.to_id)) reverse.set(edge.to_id, []);
    reverse.get(edge.to_id).push(edge);
  }
}
```

Apply the same closure to prerequisite/composition/implementation dependencies. Retain invalidated edges as inactive inspection candidates instead of deleting their evidence.

---

### `src/registry/eligibility.mjs` (utility, transform)

**Analogs:** `src/registry/map.mjs:61-107,322-349` for policy and exact-candidate binding; `src/registry/reconcile.mjs:21-32` for verdicts.

There is no exact standalone analog. Keep one exported pure function returning all gates and canonically sorted reason codes.

**Verdict shape** (`src/registry/reconcile.mjs:21-32`):

```javascript
function verdict({
  code, subject, evidence = {}, reason, correctiveAction,
  severity = 'dispatch-blocking',
}) {
  return {
    schema_version: 1,
    code,
    severity,
    dispatchable: false,
    subject: portable(subject),
    evidence: portable(evidence),
    reason,
    corrective_action: correctiveAction,
  };
}
```

**Exact upstream binding** (`src/registry/map.mjs:340-347`):

```javascript
const candidateFingerprint = fingerprint(canonical);
const reconciliation = options.reconciliation || {};
if (reconciliation.disposition
  && reconciliation.disposition !== 'eligible') {
  throw new TypeError('mapping requires an eligible reconciliation');
}
if (reconciliation.candidate_fingerprint
  && reconciliation.candidate_fingerprint !== candidateFingerprint) {
  throw new TypeError(
    'reconciliation candidate fingerprint does not match the exact candidate');
}
```

Unknown dispatch-relevant fields, stale overlays, incomplete prerequisite closure, unsupported adapter/parser evidence, scope mismatch, unacceptable side effects/risk, and active conflicts all produce `dispatch_eligible: false`. Return all failures; do not short-circuit.

---

### `src/registry/build.mjs` (service / assembler, batch transform)

**Analog:** the existing full/incremental single-assembler path.

Add exactly one enrichment call inside `assembleRegistry`; both entry points must continue to converge through it.

**One assembler** (`src/registry/build.mjs:166-187,257-263`):

```javascript
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
    refreshIncrementalAcquisition(previous, diff, options), options);
}

export function assembleRegistry(acquisition, options = {}) {
  validateAcquisition(acquisition);
  // canonical assembly and Phase 22 enrichment belong here
}
```

Do not enrich in discovery adapters or the prompt hook. Enrichment consumes the activated canonical candidate and emits canonical contract/graph/eligibility data before immutable publication.

---

### `src/registry/reconcile.mjs` (service, event-driven)

**Analog:** its existing atomic quarantine and invalidation behavior.

Wire contract/edge invalidation into the existing closure before callbacks/publication. On malformed overlays or graphs, preserve active bytes and return portable stable verdicts.

**Portable failure verdict** (`src/registry/reconcile.mjs:10-32`):

```javascript
function portable(value) {
  if (Array.isArray(value)) return value.map(portable);
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const key of Object.keys(value).sort()) {
    if (['local_path', 'path', 'absolute_path'].includes(key)) continue;
    output[key] = portable(value[key]);
  }
  return output;
}
```

Use identity/fingerprint change as invalidation seeds. Carry an approved correction across rename only when the existing authoritative continuity evidence proves the stable ID remains exact.

---

### `src/cli/router-control.mjs` (controller / projection, request-response + file-I/O)

**Analog:** inventory allowlists, bounded output, safe tokens, canonical JSON/text parity in the same file.

Add contract/relationship fields to dedicated allowlists. Do not serialize raw contract, evidence, overlay, or graph records.

**Explicit allowlists and canonical envelope** (`src/cli/router-control.mjs:22-36`):

```javascript
const INVENTORY_SUMMARY_FIELDS = [
  'state', 'active_generation_id', 'candidate_generation_id',
  'last_complete_reconciliation', 'trigger', 'pending_changes', 'stale_roots',
  'unreadable_roots', 'record_count', 'diagnostics',
];

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

**Bounded projection** (`src/cli/router-control.mjs:96-108`):

```javascript
function boundedResult(values, options = {}) {
  const limit = options.limit ?? MAX_DIFF;
  const offset = options.offset ?? 0;
  const ordered = values.slice(offset, offset + limit);
  const meta = {
    total: values.length,
    offset,
    limit,
    returned: ordered.length,
    truncated: offset + ordered.length < values.length,
  };
  return { values: ordered, meta };
}
```

**Safe diagnostic projection** (`src/cli/router-control.mjs:128-150`):

```javascript
function safeDiagnostic(item) {
  if (!item || typeof item !== 'object') return null;
  const code = safeToken(item.code || item.reason_code, '');
  if (!code) return null;
  return {
    code,
    logical_root: safeToken(item.logical_root, 'unknown'),
    relative_path: safeRelativePath(item.relative_path),
    retained_baseline: item.retained_baseline === true,
  };
}

function safeDiagnostics(values) {
  return (Array.isArray(values) ? values : [])
    .map(safeDiagnostic)
    .filter(Boolean)
    .sort((left, right) =>
      stableStringify(left).localeCompare(stableStringify(right)))
    .slice(0, MAX_VALUE);
}
```

Expose compact field state/confidence/reason, accepted and rejected overlay status, typed edge state, and eligibility gates. Never expose authored prose, raw evidence, prompts, secrets, or absolute paths.

---

### Contract and overlay tests

**Files:** `tests/router.contracts.test.mjs`,
`tests/router.contract-overlays.test.mjs`.

**Analog:** `tests/router.registry-map.test.mjs`.

Use `node:test`, `node:assert/strict`, shared fixture builders, input snapshots, permutation checks, 127/128/129 bound checks, exact fingerprints, and privacy assertions.

**Permutation pattern** (`tests/router.registry-map.test.mjs:48-64`):

```javascript
reverse.reconciliation = { disposition: 'eligible' };
assert.equal(
  stableStringify(mapCandidateRegistry(forward)),
  stableStringify(mapCandidateRegistry(reverse)),
  `${label} must be permutation-stable at ${size} entries`,
);
```

**Untrusted evidence test** (`tests/router.registry-map.test.mjs:258-278`):

```javascript
const active = {
  mappings: [{ subject_id: 'route:plan', target_id: 'router/old' }],
  opaque: 'unchanged',
};
const result = mapCandidateRegistry({
  ...eligible(records),
  existingMappings: active.mappings,
  advisoryEvidence: [{
    subject_id: 'route:plan',
    target_id: 'router/advised',
    score_basis_points: 10000,
    raw_prompt: 'secret',
    path: '/Users/private/secret',
  }],
});
assert.deepEqual(active, {
  mappings: [{ subject_id: 'route:plan', target_id: 'router/old' }],
  opaque: 'unchanged',
});
const bytes = stableStringify(result);
assert.doesNotMatch(bytes, /raw_prompt|\/Users\/|secret/);
```

Cover every contract field independently: missing, conflict, stale, rejected, below-threshold, accepted exact overlay, mismatched ID/fingerprint/scope/runtime, and rename continuity.

---

### Relationship and eligibility tests

**Files:** `tests/router.relationships.test.mjs`,
`tests/router.contract-eligibility.test.mjs`.

**Analog:** `tests/router.registry-reconcile.test.mjs`.

Reuse its candidate/capability fixture helpers and atomic active-state assertions. Test all eight edge types, dangling endpoints, duplicate IDs, cycles where invalid, ambiguous candidates, endpoint removal/replacement/disablement, dependency loss, transitive closure, and equivalent full/incremental permutations.

Required eligibility matrix: every gate independently blocks dispatch; multiple failures return a stably sorted complete reason list; every dispatch-relevant `unknown` is recommendation-only; active blocking conflicts win over high confidence.

---

### Inspection tests

**File:** `tests/router.contract-inspection.test.mjs`.

**Analogs:** `tests/router.inventory-security.test.mjs` and
`tests/router.control-cli.test.mjs`.

Use both direct `runRouterControl` JSON assertions and spawned text output. Snapshot the owned root before/after every read-only command. Assert text/JSON parity, deterministic bounds, stable exit taxonomy, control-character escaping, and absence of authored prose, raw prompts, secrets, absolute paths, and unrelated local configuration.

## Shared Patterns

### Deterministic hashing

**Source:** `src/registry/map.mjs:11-16`

Apply to policy, exact input, contract, overlay decision, relationship graph, eligibility report, and final enrichment fingerprints:

```javascript
const fingerprint = value => createHash('sha256')
  .update(typeof value === 'string' ? value : stableStringify(value), 'utf8')
  .digest('hex');
```

### Stable, portable failure evidence

**Source:** `src/registry/reconcile.mjs:10-32`

Sort object keys, remove path-bearing fields, use stable reason codes, and keep human guidance separate from machine authority.

### Fail-closed authority

**Source:** `src/registry/map.mjs:322-347`,
`src/registry/reconcile.mjs:268-315`

Malformed or mismatched candidates become inactive/quarantined reports. They never mutate active authority or silently fall back to weaker evidence.

### One canonical pipeline

**Source:** `src/registry/build.mjs:173-177,257-263`

Full and incremental acquisition must call the same assembler and produce byte-identical enrichment for equivalent input.

### Privacy-safe inspection

**Source:** `src/cli/router-control.mjs:22-32,96-150`

Allowlist, validate, sort, and bound projection fields. Never redact after dumping a raw record.

## No Exact Analog Found

| File | Role | Data Flow | Planner Guidance |
|---|---|---|---|
| `src/registry/eligibility.mjs` | utility | transform | No standalone eligibility module exists. Compose the versioned policy/exact-input pattern from `map.mjs` with the portable fail-closed verdict shape from `reconcile.mjs`; keep one pure exported validator. |

All other proposed files have a same-role or same-flow analog. No external dependency, graph engine, schema framework, class hierarchy, repository layer, or prompt-hook work is warranted.

## Metadata

**Analog search scope:** `src/registry`, `src/cli`, `tests`
**Primary analog files read:** 10
**Strong production analogs:** 5 (`schema.mjs`, `map.mjs`, `reconcile.mjs`, `build.mjs`, `router-control.mjs`)
**Pattern extraction date:** 2026-07-26
