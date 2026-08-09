# Phase 42: Semantic Graph and Safe Composition - Pattern Map

**Mapped:** 2026-08-08
**Files analyzed:** 11 (6 new, 5 modified)
**Analogs found:** 11 / 11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/registry/semantic.mjs` (NEW) | service | transform | `src/registry/relationships.mjs` + `src/registry/eligibility.mjs` | exact (role + data flow) |
| `src/registry/substitute.mjs` (NEW) | service | transform | `src/registry/eligibility.mjs` (quarantine disposition) | role-match |
| `src/registry/relationships.mjs` (MODIFIED) | service | transform | itself — extend `deriveRelationships` | exact (self-extension) |
| `src/registry/build.mjs` (MODIFIED) | service | transform | itself — extend `assembleRegistry` flow | exact (self-extension) |
| `src/cli/router-control.mjs` (MODIFIED) | component | request-response | itself — `relationshipProjection` + `contractDetailProjection` | exact (self-extension) |
| `src/lifecycle/router-lifecycle.mjs` (MODIFIED) | config | batch | itself — `moduleNames` flatMap | exact (self-extension) |
| `tests/router.semantic-resolution.test.mjs` (NEW) | test | request-response | `tests/router.contract-eligibility.test.mjs` | exact |
| `tests/router.semantic-inspection.test.mjs` (NEW) | test | request-response | `tests/router.relationships.test.mjs` + `tests/router.contract-eligibility.test.mjs` | exact |
| `tests/router.semantic-compilation.test.mjs` (NEW) | test | request-response | `tests/router.relationships.test.mjs` (cycle/overflow rejection) | exact |
| `tests/router.semantic-substitution.test.mjs` (NEW) | test | request-response | `tests/router.contract-eligibility.test.mjs` (quarantine) | exact |
| `tests/router.relationships.test.mjs` (MODIFIED) | test | request-response | itself — extend with compilation coverage | exact (self-extension) |

## Pattern Assignments

### `src/registry/semantic.mjs` (service, transform)

**Analog:** `src/registry/relationships.mjs` (derivation pattern) + `src/registry/eligibility.mjs` (gate-evaluation pattern)

This module hosts two exports: `resolveSemanticOutcome` (SEM-01) and `compileRelationshipGraph` (SEM-03). Both are pure functions taking `{ records, relationships }` and returning a structured result with `schema_version`, `policy_version`, and `reason_codes` — mirroring the existing registry module shape.

**Imports pattern** (copy from `src/registry/relationships.mjs:1-2` and `src/registry/eligibility.mjs:1-3`):
```javascript
import { stableCapabilityId } from './identity.mjs';
import { stableStringify } from './schema.mjs';
import { validateContractFieldValue, CONTRACT_FIELDS } from './contract.mjs';
import { evaluateEligibility } from './eligibility.mjs';
import { AUTHORITY_CRITICAL_FIELDS } from './trust.mjs';
```
All imports are relative `./` from within `src/registry/`. No node: imports needed (pure data transform). Reuse the canonical helpers — do NOT reimplement identity, contract validation, eligibility, or trust classification.

**Module-constant pattern** (copy from `src/registry/relationships.mjs:7-19` and `src/registry/eligibility.mjs:5-16`):
```javascript
// Frozen rule tables + exported constant arrays — the registry convention.
const RULES = Object.freeze({ ... });
export const RELATIONSHIP_TYPES = Object.freeze(Object.keys(RULES).sort());

export const ELIGIBILITY_GATES = Object.freeze([ ... ]);
```
For SEM-03, define a frozen `COMPILATION_REASONS` constant listing the new reason codes (`compilation_ambiguous_tie`, `compilation_native_collision`, `compilation_incompatible_output`, `compilation_unsafe_composition`, `compilation_unresolvable_contract`, `compilation_stale_target`, `compilation_missing_dependency`). Export it so tests can assert canonical membership.

**Core derivation pattern — pure function, reasons array, active/inactive split** (copy from `src/registry/relationships.mjs:113-156`):
```javascript
export function deriveRelationships({ records = [], candidates = [] } = {}) {
  const recordsById = new Map((Array.isArray(records) ? records : []).map(record => [
    stableCapabilityId(record),
    record,
  ]));
  const evaluated = sorted((Array.isArray(candidates) ? candidates : []).map(canonicalCandidate))
    .map(edge => ({ edge, reasons: reasonsFor(edge, recordsById) }));
  // ... cycle detection ...
  const active = [];
  const inactive = [];
  for (const value of evaluated) {
    const reasonCodes = [...value.reasons];
    if (cycleIds.has(value.edge.id)) reasonCodes.push('relationship_cycle');
    const relationship = {
      ...value.edge,
      validation_state: reasonCodes.length ? 'inactive' : 'active',
      reason_codes: [...new Set(reasonCodes)].sort(),
    };
    (reasonCodes.length ? inactive : active).push(relationship);
  }
  return {
    schema_version: 1,
    policy_version: 'relationship-rules-v1',
    edges: boundedActive,
    candidates: boundedInactive,
    ...(reasonCodes.length ? { overflow: {...}, reason_codes: reasonCodes } : {}),
  };
}
```
Key conventions to copy for `compileRelationshipGraph`:
- Build a `recordsById` Map keyed by `stableCapabilityId(record)` (wrap in try/catch per `eligibility.mjs:200-205` to skip invalid records).
- Per-edge/per-record `reasonsFor`-style helper returning sorted unique reason codes.
- `validation_state: 'inactive' | 'active'` plus `reason_codes` on each rejected item.
- Top-level `schema_version: 1`, `policy_version: 'compilation-rules-v1'`, and optional `reason_codes` only when overflow occurs.
- Non-throwing: produce diagnostics with reason codes; let the build continue. (RESEARCH Open Question 3 recommendation, matches `deriveRelationships`.)
- Bound collections with `MAX_*` constants (copy the `MAX_EDGES = 128` style).

**SEM-01 resolver pattern — match by contract fields + filter by disposition + filter by eligibility** (composite of `eligibility.mjs:198-248` and `select.mjs:160-190`):
```javascript
// From eligibility.mjs:198 — the evaluator shape to call per candidate:
const eligibility = evaluateEligibility({
  record: authoritative,
  records: overlaidRecords,
  relationships,
});
return { ...authoritative, dispatchable: eligibility.eligible, eligibility };

// From contract.mjs:241 — the disposition fast-path pre-filter:
disposition: unknownDispatchFields.length ? 'recommendation-only' : 'dispatch-candidate',
```
`resolveSemanticOutcome({ outcome, records, relationships })` must:
1. Filter records to `record.contract.disposition === 'dispatch-candidate'` (fast-path pre-filter, copy `contract.mjs:241`).
2. Match contract fields: `record.contract.fields.outputs.state === 'known'` and value superset/subset of outcome.requires/provides. Use `validateContractFieldValue` (`contract.mjs:83-103`) for field-shape validation; use `field()`/`fieldState()` helpers from `eligibility.mjs:32-42` to read envelope state safely.
3. Run `evaluateEligibility` on each match — NEVER bypass (Pitfall 2). Copy the `evaluateEligibility` call shape from `build.mjs:352-356`.
4. Detect ambiguous ties: when two candidates have identical fit scores, either apply a deterministic tiebreaker by `stableCapabilityId` lexicographic order OR return `status: 'ambiguous'`. SEM-03 rejects ambiguous ties before activation, so prefer surfacing ambiguity.
5. Return `{ schema_version: 1, policy_version: 'semantic-resolution-v1', matches: [...], reason_codes: [...] }`.

**Error handling pattern** (copy from `src/registry/eligibility.mjs:198-206`):
```javascript
const recordsById = new Map();
for (const candidate of Array.isArray(records) ? records : []) {
  try {
    recordsById.set(stableCapabilityId(candidate), candidate);
  } catch {
    // Invalid candidates cannot establish target existence.
  }
}
```
Wrap `stableCapabilityId` in try/catch — invalid records are skipped, never thrown. Structural validation failures (schema violations) use `throw new TypeError(...)` per `contract.mjs:467-523`. Operational/compilation failures use reason codes, not exceptions.

**Validation pattern** (copy from `src/registry/contract.mjs:83-103`):
```javascript
export function validateContractFieldValue(field, value) {
  if (!CONTRACT_FIELDS.includes(field)) return `contract_${field}_field_invalid`;
  if (STRING_LIST_FIELDS.has(field)) {
    return Array.isArray(value) && value.every(item => typeof item === 'string' && item.length > 0)
      ? null
      : `contract_${field}_value_invalid`;
  }
  // ... enum + object fields ...
}
```
Reuse `validateContractFieldValue` and `CONTRACT_FIELDS` from `contract.mjs` directly — do NOT redefine the canonical field set or its validators.

---

### `src/registry/substitute.mjs` (service, transform)

**Analog:** `src/registry/eligibility.mjs` (quarantine disposition, `computeQuarantineReasons` + `evaluateEligibility`)

This module exports `resolveSubstitution`. It traverses `substitute`/`fallback` edges from a failed record, validates each candidate via `evaluateEligibility`, checks authority bounds against the original, and returns a substitution record retaining both routes.

**Imports pattern** (copy from `src/registry/eligibility.mjs:1-3`):
```javascript
import { stableCapabilityId } from './identity.mjs';
import { stableStringify } from './schema.mjs';
import { CONTRACT_FIELDS } from './contract.mjs';
import { evaluateEligibility } from './eligibility.mjs';
import { AUTHORITY_CRITICAL_FIELDS } from './trust.mjs';
```

**Quarantine-disposition pattern — per-record reasons, set-based checks** (copy from `src/registry/eligibility.mjs:158-196`):
```javascript
function computeQuarantineReasons(record) {
  const reasons = [];
  if (!record?.contract?.fields) return reasons;
  for (const fieldName of CONTRACT_FIELDS) {
    const envelope = field(record, fieldName);
    if (envelope?.state === 'known' && envelope.value !== undefined) {
      if (hasUnsafeAuthoredContent(envelope.value, fieldName)) {
        reasons.push('injection_bearing');
        break;
      }
    }
  }
  // ... more reason checks ...
  return reasons;
}
```
Mirror this structure for `computeBoundsViolations(original, substitute)`:
- Iterate `AUTHORITY_CRITICAL_FIELDS` (`trust.mjs:3-9`: `permissions`, `side_effects`, `risk`, `reversibility`, `invocation_kind`).
- For each, compare `substitute.contract.fields[X].value` against `original.contract.fields[X].value` using `stableStringify` equality and the `unsafeValue` lexical check pattern from `eligibility.mjs:140-143`.
- Risk ordering: `unknown < low < medium < high < critical < unacceptable` (copy the `ENUM_FIELDS.risk` set from `contract.mjs:69`).
- Push reason codes like `substitution_risk_escalation`, `substitution_scope_expansion`, `substitution_permissions_expanded`.
- Return empty array = bounds unchanged.

**Core substitution pattern — traverse edges, validate eligibility, check bounds** (composite of `eligibility.mjs:198-248` and `relationships.mjs:113-156`):
```javascript
export function resolveSubstitution({ failedRecord, records, relationships, authorityBounds } = {}) {
  const recordsById = new Map();  // copy the try/catch populate from eligibility.mjs:199-206
  const subjectId = stableCapabilityId(failedRecord);
  // 1. Traverse substitute/fallback edges where source_id === subjectId OR target_id === subjectId
  const edges = (Array.isArray(relationships?.edges) ? relationships.edges : [])
    .filter(edge => (edge.type === 'substitute' || edge.type === 'fallback')
      && (edge.source_id === subjectId || edge.target_id === subjectId));
  const candidates = [];
  for (const edge of edges) {
    const candidateId = edge.source_id === subjectId ? edge.target_id : edge.source_id;
    const candidate = recordsById.get(candidateId);
    if (!candidate) continue;
    // 2. Check contract compatibility (inputs/outputs/action match) via validateContractFieldValue
    // 3. Run evaluateEligibility — copy the call shape from build.mjs:352-356
    const { eligibility: _a, dispatch_eligible: _d, ...authoritative } = candidate;
    const eligibility = evaluateEligibility({ record: authoritative, records, relationships });
    if (!eligibility.eligible) continue;
    // 4. Check authority bounds unchanged via computeBoundsViolations
    const violations = computeBoundsViolations(failedRecord, candidate);
    if (violations.length) continue;
    candidates.push({ candidate, edge, eligibility });
  }
  // 5. Exactly one → substituted; zero → blocked; multiple → ambiguous
  if (candidates.length === 0) {
    return { schema_version: 1, policy_version: 'substitution-v1', status: 'blocked',
      reason_code: 'no_compatible_substitute' };
  }
  if (candidates.length > 1) {
    return { schema_version: 1, policy_version: 'substitution-v1', status: 'ambiguous',
      reason_code: 'ambiguous_substitute', candidates: candidates.map(c => stableCapabilityId(c.candidate)).sort() };
  }
  return {
    schema_version: 1, policy_version: 'substitution-v1', status: 'substituted',
    original_route: subjectId,
    substitute_route: stableCapabilityId(candidates[0].candidate),
    bounds_unchanged: true,
    reason_codes: ['substitution_within_bounds'],
  };
}
```
CRITICAL (Pitfall 1 / SEM-04): the substitute's `permissions ⊆ original.permissions`, `risk <= original.risk`, `scope === original.scope` (via `stableStringify` equality, copy `eligibility.mjs:215-217`), `reversibility` at least as safe. Use `AUTHORITY_CRITICAL_FIELDS` as the check list.

**No receipt state change** — Phase 42 produces the substitution record only. Do NOT add `'substituted'` to `RECEIPT_STATES` in `src/adapters/dispatch/contract.mjs:36-40` (that is Phase 44 RCPT-02).

**Error handling pattern** — same as `semantic.mjs`: try/catch around `stableCapabilityId`, reason codes for operational failures, `TypeError` only for structural shape violations.

---

### `src/registry/relationships.mjs` (MODIFIED — service, transform)

**Analog:** itself — extend with `compileRelationshipGraph` export

Add a new exported `compileRelationshipGraph({ records, relationships })` function in this file. RESEARCH (Alternatives Considered) chose extending this module over a new `compile.mjs` because compilation operates ON the derived graph.

**Extension pattern** (add after `deriveRelationships` at `relationships.mjs:156`):
```javascript
// New constants — frozen, matching the RULES convention at line 7-17:
const COMPILATION_RULES = Object.freeze({ ... });
export const COMPILATION_REASONS = Object.freeze([...]);

// New function — same shape as deriveRelationships (pure, reasons array, active/inactive):
export function compileRelationshipGraph({ records = [], relationships = {} } = {}) {
  const recordsById = new Map(/* try/catch populate, copy eligibility.mjs:199-206 */);
  const diagnostics = [];
  // 1. Native-identity collisions: group by record.native_type, flag same native_type + different stableCapabilityId without a variant edge
  // 2. Composition I/O compatibility: for each 'composition' edge, check source.outputs ∩ target.inputs (copy field() helper from eligibility.mjs:32-34)
  // 3. Stale targets: relationship target freshness === 'stale' (edge.freshness, copy relationships.mjs:71)
  // 4. Missing dependencies: prerequisite target not in recordsById (copy relationships.mjs:64-65 dangling check)
  // 5. Unresolvable contracts: dispatch fields with state='unknown' (copy contract.mjs:234-236 unknownDispatchFields pattern)
  return {
    schema_version: 1,
    policy_version: 'compilation-rules-v1',
    diagnostics,
    compiled: diagnostics.length === 0,
    reason_codes: [...new Set(diagnostics.flatMap(d => d.reason_codes))].sort(),
  };
}
```
Reuse `reasonsFor`-style helper pattern (line 57-85) — a per-item function returning sorted unique reason codes. Reuse `sorted()` (line 21-23) and `stableStringify` for deterministic ordering.

---

### `src/registry/build.mjs` (MODIFIED — service, transform)

**Analog:** itself — extend `assembleRegistry` flow at `build.mjs:284-422`

Wire `compileRelationshipGraph` and (optionally) `resolveSemanticOutcome` into `assembleRegistry`. RESEARCH (Architecture Diagram) places compilation AFTER `deriveRelationships` and BEFORE `evaluateEligibility`.

**Imports pattern** (extend the import block at `build.mjs:7-14`):
```javascript
import {
  applyContractOverlays,
  buildCapabilityContract,
  resolveContractOverlays,
  validateCapabilityContract,
} from './contract.mjs';
import { evaluateEligibility } from './eligibility.mjs';
import { deriveRelationships } from './relationships.mjs';
import { compileRelationshipGraph } from './relationships.mjs';  // NEW — same module
// Optionally: import { resolveSemanticOutcome } from './semantic.mjs';
```
Match the existing grouped-import style (multi-line named imports from the same module are already used at lines 7-12).

**Insertion point** (between `build.mjs:345` and `build.mjs:346`):
```javascript
const relationships = options.relationships || deriveRelationships({
  records: overlaidRecords,
  candidates: options.relationshipCandidates,
});
// NEW (SEM-03): strict compilation gate — runs AFTER deriveRelationships,
// BEFORE evaluateEligibility. Non-throwing: diagnostics with reason codes.
const compilation = compileRelationshipGraph({ records: overlaidRecords, relationships });
// NEW (SEM-01, optional): resolveSemanticOutcome pre-computation is OPTIONAL per
// RESEARCH Open Question 1 — implement on-demand first, add pre-compute in Phase 43.
const enrichedRecords = overlaidRecords.map(record => {
  // ... existing evaluateEligibility call (unchanged) ...
});
```
Add `compilation` to the returned object (mirror how `relationships` is spread at `build.mjs:365`):
```javascript
...(compilation.diagnostics.length ? { compilation } : {}),
```
Match the conditional-spread convention: only include the key when it has content (copy `build.mjs:365-366` pattern for `relationships` and `rejected_overlays`).

**Do NOT modify the eligibility call** at `build.mjs:352-356` — reuse as-is. Do NOT add `'substituted'` to any state array.

---

### `src/cli/router-control.mjs` (MODIFIED — component, request-response)

**Analog:** itself — `relationshipProjection` (`router-control.mjs:493-509`) and `contractDetailProjection` (`router-control.mjs:439-467`)

Add a new exported `semanticProjection` that combines contract fields + relationship edges + lifecycle evidence into a unified "why this fits" view.

**Imports pattern** — no new imports needed; reuse existing `stableStringify`, `boundedResult`, `safeToken`, `safeIdentifier`, `safeTokenList`, `fieldProjection`, `evidenceProjection`, `relationshipItemProjection` already in the file.

**Projection pattern** (copy the shape of `relationshipProjection` at `router-control.mjs:493-509`):
```javascript
export function semanticProjection({ record, relationships = {}, limit = MAX_DIFF, offset = 0 } = {}) {
  if (!record?.contract || typeof record.contract !== 'object') throw new TypeError('invalid_contract_record');
  const requires = ['inputs', 'dependencies']
    .map(f => [f, fieldProjection(record.contract.fields?.[f])]);
  const produces = ['outputs']
    .map(f => [f, fieldProjection(record.contract.fields?.[f])]);
  // Edges involving this record — copy the filter+map from relationshipProjection:494-497
  const subjectId = safeIdentifier(record?.stable_id || record?.id || record?.name);
  const edges = [
    ...(Array.isArray(relationships?.edges) ? relationships.edges : []),
    ...(Array.isArray(relationships?.candidates) ? relationships.candidates : []),
  ].filter(edge => edge.source_id === subjectId || edge.target_id === subjectId)
    .map(relationshipItemProjection);
  const values = [
    ...requires.map(([field, value]) => ({ kind: 'requires', field, ...value })),
    ...produces.map(([field, value]) => ({ kind: 'produces', field, ...value })),
    ...edges.map(edge => ({ kind: 'relationship', ...edge })),
  ].sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)));
  const bounded = boundedResult(values, { limit, offset });
  return {
    total: bounded.meta.total,
    returned: bounded.meta.returned,
    truncated: bounded.meta.truncated,
    limit: bounded.meta.limit,
    offset: bounded.meta.offset,
    next_offset: bounded.meta.next_offset,
    semantic: bounded.values,
    lifecycle: {
      enabled: record?.enabled !== false,
      lifecycle: safeToken(record?.lifecycle),
      eligible: record?.eligibility?.eligible === true,
      eligibility_gates: Object.fromEntries(Object.entries(record.eligibility?.gates || {})
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([gate, state]) => [safeToken(gate), safeToken(state)])),
    },
  };
}
```
Conventions to copy:
- `boundedResult` for pagination (line 149-165) — always return `total/returned/truncated/limit/offset/next_offset`.
- `safeToken`/`safeIdentifier`/`safeTokenList` (lines 167-176, 368) for all externally surfaced strings — never echo raw record text.
- `fieldProjection` (line 396-414) for contract field envelopes — it already strips raw values from evidence.
- `relationshipItemProjection` (line 469-491) for edges.
- `throw new TypeError('invalid_contract_record')` for shape violations (copy line 440).
- `MAX_VALUE = 256` / `MAX_DIFF = 256` bounds (lines 25-26) — slice projections.

**Wire the new projection into the command dispatch** — find where `relationshipProjection` / `contractDetailProjection` are dispatched (grep for `relationshipProjection(` and `contractDetailProjection(` call sites) and add a parallel `semantic` command path with the same `--format`/`--limit`/`--offset` option handling.

---

### `src/lifecycle/router-lifecycle.mjs` (MODIFIED — config, batch)

**Analog:** itself — `moduleNames` array at `router-lifecycle.mjs:384-431`

Add the two new modules to the `moduleNames` array so they deploy to BOTH `ownedRoot` and `codexOwnedRoot` via the `moduleValues` flatMap at line 432-434.

**Extension pattern** (insert into `moduleNames` after the existing registry block at line 389-392):
```javascript
    'registry/contract.mjs', 'registry/eligibility.mjs', 'registry/relationships.mjs',
    // Phase 41 TRUST-02: untrusted-evidence policy deployed to BOTH ownedRoot
    // and codexOwnedRoot via the moduleValues flatMap below (Pitfall 6 backstop).
    'registry/trust.mjs',
    // Phase 42 SEM-01/03/04: semantic resolver + compilation gate + substitution
    // resolver deployed to BOTH ownedRoot and codexOwnedRoot via the moduleValues
    // flatMap below (HOST-03 parity; single-runtime deploy would ENOENT in Codex).
    'registry/semantic.mjs', 'registry/substitute.mjs',
```
Convention to copy:
- Each new module gets a Phase-comment explaining why it's deployed to both runtimes (copy the Phase 41 `trust.mjs` comment style at line 390-392 and Phase 40 lease comment at line 399-404).
- The flatMap at line 432-434 handles both runtimes automatically — NO custom deploy path.
- `'cli/router-control.mjs'` is already in the list (line 414) — the modified router-control deploys automatically.

**Regression backstop convention** — the existing comments cite lifecycle test count bumps (e.g. "263->279 is the regression gate"). Update the test count expectation in the comment after the lifecycle tests are extended.

---

### `tests/router.semantic-resolution.test.mjs` (NEW — test, request-response)

**Analog:** `tests/router.contract-eligibility.test.mjs:1-50`

**Test fixture pattern** (copy from `tests/router.contract-eligibility.test.mjs:1-50`):
```javascript
import assert from 'node:assert/strict';
import test from 'node:test';

import { assembleRegistry } from '../src/registry/build.mjs';
import { buildCapabilityContract } from '../src/registry/contract.mjs';
import { stableCapabilityId } from '../src/registry/identity.mjs';
import { deriveRelationships } from '../src/registry/relationships.mjs';
import { stableStringify } from '../src/registry/schema.mjs';
import { buildClaudeHeavyProfile, contractEvidence } from './helpers/inventory-fixture.mjs';

const semanticModule = import('../src/registry/semantic.mjs');

function safeRecord(overrides = {}) {
  const record = {
    ...buildClaudeHeavyProfile()[0],
    dependencies: { state: 'declared', items: [] },
    ...overrides,
  };
  const evidence = contractEvidence(record);
  evidence.reversibility[0].value = 'reversible';
  evidence.risk[0].value = 'low';
  return { ...record, contract: buildCapabilityContract(record, evidence) };
}
```
Conventions to copy:
- `import test from 'node:test'` + `import assert from 'node:assert/strict'` — always first two lines.
- Lazy `const module = import('../src/...')` then `await` inside tests (copy line 10 + line 52 usage).
- `safeRecord()` helper returning a fully-contracted, eligible record (copy lines 12-22).
- `buildClaudeHeavyProfile` + `contractEvidence` from `tests/helpers/inventory-fixture.mjs` (copy line 9) — reuse, do NOT hand-roll fixtures.
- Test name prefix convention: `'[phaseNN-red:tag] description'` — use `'[42-red:semantic-resolution]'` etc. (copy line 51 naming).
- Assert against `reason_codes` arrays with `assert.deepEqual` and `result.status` with `assert.equal`.

**Coverage required** (from RESEARCH Test Map):
- Resolves compatible capability by contract fields without a `workflow_id` declaration.
- Filters out `recommendation-only` disposition (SEM-01 anti-pattern: framework privilege).
- Filters out ineligible matches (Pitfall 2: bypassing eligibility).
- Ambiguous ties surface (Pitfall 3) — either deterministic tiebreaker or `status: 'ambiguous'`.

---

### `tests/router.semantic-inspection.test.mjs` (NEW — test, request-response)

**Analog:** `tests/router.contract-eligibility.test.mjs` + `tests/router.relationships.test.mjs:1-50`

Reuse the same fixture helpers (`buildClaudeHeavyProfile`, `contractEvidence`, `safeRecord`). Test `semanticProjection` from `router-control.mjs`:
- Returns `requires`/`produces`/`conflicts`/`substitutions`/`compositions`/`lifecycle` sections.
- Respects `limit`/`offset` (copy the `boundedResult` assertions pattern — `total`, `returned`, `truncated`, `next_offset`).
- Safe tokens: unsafe identifiers fall back to `'unknown'` (copy `safeIdentifier` behavior).
- Throws `TypeError` for `invalid_contract_record` (copy line 440 throw + assert.throws pattern).

---

### `tests/router.semantic-compilation.test.mjs` (NEW — test, request-response)

**Analog:** `tests/router.relationships.test.mjs:75-90` (cycle/overflow rejection pattern)

Reuse `record()` + `edge()` helpers from `tests/router.relationships.test.mjs:18-39` (import or replicate). Test `compileRelationshipGraph`:
- Rejects ambiguous ties (two records, identical contract fit, no variant edge).
- Rejects native-identity collisions (same `native_type`, different `stableCapabilityId`, no `variant` edge).
- Accepts native-type duplicates when a `variant` edge links them (Pitfall 4 mitigation).
- Rejects incompatible composition outputs (producer outputs ∩ consumer inputs = empty).
- Rejects stale targets (edge freshness === 'stale').
- Rejects missing dependencies (prerequisite target not in records).
- Rejects unresolvable contracts (dispatch field state='unknown').
- Non-throwing: returns `diagnostics` with `reason_codes`, `compiled: false` (copy `graph.candidates` assertion style from `relationships.test.mjs:63-72`).

---

### `tests/router.semantic-substitution.test.mjs` (NEW — test, request-response)

**Analog:** `tests/router.contract-eligibility.test.mjs:59-62` (quarantine disposition)

Reuse `safeRecord` fixture. Test `resolveSubstitution`:
- Zero candidates → `status: 'blocked'`, `reason_code: 'no_compatible_substitute'`.
- One compatible candidate within bounds → `status: 'substituted'`, `bounds_unchanged: true`, both `original_route` + `substitute_route` present.
- Multiple candidates → `status: 'ambiguous'`, `reason_code: 'ambiguous_substitute'`.
- Permission laundering rejection: substitute with broader permissions → not selected, reason `substitution_permissions_expanded` (Pitfall 1).
- Risk escalation rejection: substitute with higher risk → not selected.
- Scope expansion rejection: substitute with different scope → not selected.
- Both routes retained in the result (SEM-04 attribution requirement).
- Does NOT add `'substituted'` to `RECEIPT_STATES` (assert the array is unchanged — copy from `src/adapters/dispatch/contract.mjs:36-40`).

---

### `tests/router.relationships.test.mjs` (MODIFIED — test, request-response)

**Analog:** itself — extend with compilation integration coverage

Add tests that exercise `compileRelationshipGraph` via `deriveRelationships` output (integration, not just unit). Reuse the existing `record()` + `edge()` helpers at lines 18-39. Add a new `test('[42:compilation] ...')` block per the naming convention at line 44.

## Shared Patterns

### Registry Module Shape (apply to all new `src/registry/*.mjs` files)
**Source:** `src/registry/relationships.mjs` + `src/registry/eligibility.mjs` + `src/registry/contract.mjs`
**Apply to:** `src/registry/semantic.mjs`, `src/registry/substitute.mjs`
```javascript
// Top of every registry module:
import { stableCapabilityId } from './identity.mjs';
import { stableStringify } from './schema.mjs';

// Frozen constant tables + exported arrays:
const RULES = Object.freeze({ ... });
export const SOMETHING_TYPES = Object.freeze(Object.keys(RULES).sort());

// Pure exported function with destructured defaults:
export function doThing({ records = [], relationships = {} } = {}) {
  // Build recordsById Map with try/catch around stableCapabilityId
  // Return { schema_version: 1, policy_version: 'X-v1', ..., reason_codes: [...] }
}
```

### RecordsById Map Population (apply to all resolvers)
**Source:** `src/registry/eligibility.mjs:199-206`
**Apply to:** `semantic.mjs`, `substitute.mjs`, the new `compileRelationshipGraph`
```javascript
const recordsById = new Map();
for (const candidate of Array.isArray(records) ? records : []) {
  try {
    recordsById.set(stableCapabilityId(candidate), candidate);
  } catch {
    // Invalid candidates cannot establish target existence.
  }
}
```
CRITICAL: `stableCapabilityId` can throw on malformed records — always try/catch. Never assume records are valid.

### Contract Field Reading (apply to all contract-aware logic)
**Source:** `src/registry/eligibility.mjs:32-42`
**Apply to:** `semantic.mjs` (SEM-01 matching), `substitute.mjs` (bounds checking), `compileRelationshipGraph` (I/O compatibility)
```javascript
function field(record, name) {
  return record?.contract?.fields?.[name];
}

function fieldState(record, name, decide) {
  const envelope = field(record, name);
  if (!record?.contract) return 'unknown';
  if (!envelope || envelope.state !== 'known') return 'unknown';
  if (validateContractFieldValue(name, envelope.value)) return 'unknown';
  return decide(envelope.value);
}
```
Always check `envelope.state === 'known'` before reading `envelope.value`. Unknown-state fields must never be used for matching or bound comparison (Pitfall: composition output injection via unknown fields).

### Eligibility Gate Invocation (apply to SEM-01 + SEM-04)
**Source:** `src/registry/build.mjs:346-358`
**Apply to:** `resolveSemanticOutcome`, `resolveSubstitution`
```javascript
const { eligibility: _authoredEligibility, dispatch_eligible: _authoredDispatchEligible, ...authoritative } = record;
const eligibility = evaluateEligibility({
  record: authoritative,
  records: overlaidRecords,
  relationships,
});
return { ...authoritative, dispatchable: eligibility.eligible, eligibility };
```
Strip authored eligibility/dispatch_eligible before re-evaluating (copy the destructure pattern). NEVER bypass `evaluateEligibility` (Pitfall 2 — contract compatibility is necessary but not sufficient).

### Authority Bound Checking (apply to SEM-04)
**Source:** `src/registry/trust.mjs:3-9` + `src/registry/eligibility.mjs:140-143`
**Apply to:** `substitute.mjs`
```javascript
// The canonical checklist of fields that cannot expand during substitution:
export const AUTHORITY_CRITICAL_FIELDS = Object.freeze(new Set([
  'permissions', 'side_effects', 'risk', 'reversibility', 'invocation_kind',
]));

// Lexical unsafe-value check pattern:
function unsafeValue(value, tokens) {
  const text = stableStringify(value).toLowerCase();
  return tokens.some(token => text.includes(token));
}
```
Substitution must validate each `AUTHORITY_CRITICAL_FIELDS` entry on the substitute is within the original's bounds. Risk ordering: `unknown < low < medium < high < critical < unacceptable` (`contract.mjs:69`). Scope: `stableStringify(substitute.scope) === stableStringify(original.scope)` (`eligibility.mjs:215-217`).

### Error Handling: Reason Codes vs Exceptions
**Source:** `src/registry/relationships.mjs:57-85` + `src/registry/contract.mjs:467-523`
**Apply to:** all new/modified registry modules
- **Operational/compilation failures** (ambiguous ties, native collisions, incompatible outputs, unsafe compositions, missing deps, stale targets, no compatible substitute) → return reason codes in the result, do NOT throw. Matches `deriveRelationships` inactive/candidates pattern.
- **Structural validation failures** (schema violations, malformed contract) → `throw new TypeError('descriptive message')`. Matches `validateCapabilityContract`.
- **Invalid records** (stableCapabilityId throws) → try/catch, skip the record. Matches `eligibility.mjs:200-205`.

### CLI Projection Shape (apply to SEM-02)
**Source:** `src/cli/router-control.mjs:149-165` (`boundedResult`) + lines 493-509 (`relationshipProjection`)
**Apply to:** `semanticProjection`
```javascript
// Every projection returns:
{
  total, returned, truncated, limit, offset, next_offset,
  <collection_key>: bounded.values,
}
// And uses safeToken/safeIdentifier/safeTokenList on ALL surfaced strings.
```

### Test Conventions (apply to all new test files)
**Source:** `tests/router.contract-eligibility.test.mjs:1-50` + `tests/router.relationships.test.mjs:1-50`
**Apply to:** all 4 new test files + `tests/router.relationships.test.mjs` extension
```javascript
import assert from 'node:assert/strict';   // always line 1
import test from 'node:test';               // always line 2

import { buildClaudeHeavyProfile, contractEvidence } from './helpers/inventory-fixture.mjs';

const modulePromise = import('../src/registry/<module>.mjs');  // lazy import

function safeRecord(overrides = {}) { ... }   // copy the fixture builder

test('[phaseNN-red:tag] description', async () => {
  const { exportName } = await modulePromise;
  assert.equal(result.status, '...');
  assert.deepEqual(result.reason_codes, [...]);
});
```
- Reuse `tests/helpers/inventory-fixture.mjs` exports (`buildClaudeHeavyProfile`, `contractEvidence`, `capability`, `candidate`) — do NOT hand-roll fixtures.
- Test name prefix: `'[42-red:semantic-...]'` matching the existing `'[phase22-red:...]'` and `'[41-03:quarantine]'` conventions.
- Assert against `reason_codes` with `deepEqual`, against `status`/`eligible` with `equal`.

### Module Deployment (apply to lifecycle)
**Source:** `src/lifecycle/router-lifecycle.mjs:384-434`
**Apply to:** adding `semantic.mjs` + `substitute.mjs` to `moduleNames`
- Add to the `moduleNames` array with a Phase 42 comment explaining dual-runtime deploy.
- The `moduleValues` flatMap over `[p.ownedRoot, p.codexOwnedRoot]` handles both runtimes — NO custom deploy path.
- A single-runtime deploy would ENOENT in Codex (copy the warning from line 399-404 Phase 40 comment).

## No Analog Found

None. Every new/modified file has an exact or role-match analog in the existing codebase. Phase 42 is a composition layer over Phase 39-41 primitives (per RESEARCH Key Insight) — all patterns are already established.

## Metadata

**Analog search scope:**
- `src/registry/*.mjs` (relationships, eligibility, contract, build, trust, identity, schema)
- `src/cli/router-control.mjs`
- `src/lifecycle/router-lifecycle.mjs`
- `src/orchestrator/select.mjs`
- `src/intent/authority.mjs`
- `tests/router.relationships.test.mjs`, `tests/router.contract-eligibility.test.mjs`
- `tests/helpers/inventory-fixture.mjs`
- `src/adapters/dispatch/contract.mjs` (RECEIPT_STATES — do NOT extend)

**Files scanned:** 11 analog files
**Pattern extraction date:** 2026-08-08