# Phase 41: Manifest vNext and Trust Hardening - Pattern Map

**Mapped:** 2026-08-08
**Files analyzed:** 15 (3 new src, 6 extended src, 1 extended helper, 5 new tests)
**Analogs found:** 15 / 15 (all extensions in-place; new files map to existing siblings)

> Note on paths: RESEARCH.md and the codebase use `src/adapters/dispatch/contract.mjs` (there is **no** `src/dispatch/` directory). The orchestrator prompt's `src/dispatch/contract.mjs` is a path typo — use `src/adapters/dispatch/contract.mjs`. Test files live in `tests/` (not `test/`).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/registry/trust.mjs` (NEW) | service (policy) | transform | `src/registry/contract.mjs` (SAFE_PROVENANCE / envelope rejection) | role-match (new sibling next to contract.mjs/eligibility.mjs) |
| `src/registry/contract.mjs` (EXTEND) | model (envelope builder) | transform | itself — `envelope()` / `CONTRACT_FIELDS` / `validateContractFieldValue` | exact (in-place extension) |
| `src/registry/eligibility.mjs` (EXTEND) | service (gate evaluator) | transform | itself — `evaluateEligibility` / `ELIGIBILITY_GATES` | exact (in-place extension) |
| `src/registry/schema.mjs` (EXTEND) | validation | transform | itself — `validateCapabilityContract` (contract.mjs:440) + `validateEligibility` (schema.mjs:191) | exact (in-place extension) |
| `src/adapters/dispatch/contract.mjs` (EXTEND) | service (factory contract) | request-response | itself — `createDispatchAdapter` / `RECEIPT_STATES` | exact (in-place extension) |
| `src/adapters/dispatch/claude.mjs` (EXTEND) | adapter (subprocess) | request-response | itself — `validateFixturePath` / `invokeImpl` | exact (in-place extension) |
| `src/adapters/dispatch/codex.mjs` (EXTEND) | adapter (subprocess) | request-response | `src/adapters/dispatch/claude.mjs` (mirror variant) | exact (claude.mjs is the canonical variant; codex.mjs mirrors it) |
| `src/cli/router-control.mjs` (EXTEND) | component (CLI projection) | transform | itself — `fieldProjection` / `evidenceProjection` | exact (in-place extension) |
| `src/lifecycle/router-lifecycle.mjs` (EXTEND) | config (deploy driver) | file-I/O | itself — `moduleNames` array / `moduleValues` flatMap | exact (in-place extension) |
| `tests/helpers/inventory-fixture.mjs` (EXTEND) | test helper | transform | itself — `contractEvidence()` / `record()` | exact (in-place extension) |
| `tests/router.trust-contract.test.mjs` (NEW) | test | request-response | `tests/router.contract-inspection.test.mjs` | exact (same projection-inspection shape) |
| `tests/router.trust-evidence.test.mjs` (NEW) | test | request-response | `tests/router.contract-eligibility.test.mjs` | exact (same safeRecord/evaluate harness) |
| `tests/router.trust-invocation.test.mjs` (NEW) | test | request-response | `tests/router.dispatch-integration.test.mjs` | role-match (dispatch integration is the closest existing dispatch test) |
| `tests/router.trust-pregate.test.mjs` (NEW) | test | request-response | `tests/router.dispatch-integration.test.mjs` | role-match (dispatch-time gate; no existing pre-gate test) |
| `tests/router.trust-quarantine.test.mjs` (NEW) | test | request-response | `tests/router.contract-eligibility.test.mjs` | exact (same evaluateEligibility harness, adds quarantine disposition) |

> Orchestrator prompt also named `test/router.trust-policy.test.mjs` and `test/router.dispatch-contract.test.mjs`. RESEARCH.md Wave 0 gaps name `tests/router.trust-evidence.test.mjs` and `tests/router.trust-{contract,invocation,pregate,quarantine}.test.mjs` instead. Follow RESEARCH.md's names (verified against existing `tests/` conventions). The `trust-evidence` test covers the prompt's "trust-policy" scope; `trust-invocation` + `trust-pregate` together cover "dispatch-contract".

## Pattern Assignments

### `src/registry/trust.mjs` (service, transform) — NEW

**Analog:** `src/registry/contract.mjs` (provenance classification + rejection pipeline)

This is a new sibling to `contract.mjs` and `eligibility.mjs`. It owns the untrusted-evidence policy (TRUST-02): classifying evidence provenance into trust tiers and preventing untrusted sources (descriptions, manifests, plugins, private integrations, learned records) from populating authority-critical fields. Keep it a pure-function module (no I/O) mirroring the contract.mjs style — frozen sets, reason tokens, no side effects.

**Imports pattern** (mirror `src/registry/contract.mjs:1-2`):
```javascript
import { stableStringify } from './schema.mjs';
// stdlib-only; no node:fs/path needed (pure policy functions)
```

**Provenance-set + reason-token pattern** to copy from `src/registry/contract.mjs:41,65-67`:
```javascript
const SAFE_PROVENANCE = new Set(['adapter', 'manifest', 'correction', 'authored']);

function reasonToken(value, fallback) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(value) ? value : fallback;
}
```
TRUST-02 extension: define an `AUTHORITY_CRITICAL_FIELDS` set (`permissions`, `side_effects`, `risk`, `reversibility`, `invocation_kind`) and a `TRUSTED_PROVENANCE` set (`adapter`, `correction`) that are the only sources allowed to populate authority-critical fields. Everything else (`manifest`, `authored`, plus new `description`, `plugin`, `private`, `learned`) gets a `reason_code: 'untrusted_evidence_rejected'` and is routed to `rejected_evidence` — exactly how `authored` is handled in `envelope()` at contract.mjs:122-124.

**Threshold policy** to copy from `src/registry/contract.mjs:21-26,130-138`:
```javascript
export const CONTRACT_POLICY = Object.freeze({
  policy_version: 'contract-policy-v1',
  inferred_minimum_basis_points: 8500,
  structural_minimum_basis_points: 10000,
  max_evidence_per_field: 64,
});
// ...
const threshold = candidate.provenance === 'adapter'
  ? CONTRACT_POLICY.structural_minimum_basis_points
  : CONTRACT_POLICY.inferred_minimum_basis_points;
```
Authority-critical fields require `structural_minimum_basis_points` (10000) from `adapter`/`correction` only; informational fields (`purpose`, `triggers`) accept `inferred_minimum_basis_points` (8500) from `manifest`. Export a `classifyEvidence(field, candidate)` function returning `{ trusted: boolean, reason_code: string }` so `contract.mjs::envelope()` can call it.

---

### `src/registry/contract.mjs` (model, transform) — EXTEND

**Analog:** itself (in-place extension of `envelope()` / `CONTRACT_FIELDS` / `validateContractFieldValue`)

**CRITICAL invariant (Pitfall 1):** `validateCapabilityContract` (line 451) checks `Object.keys(contract.fields).sort()` exactly equals `[...CONTRACT_FIELDS].sort()`. Adding fields requires updating `CONTRACT_FIELDS`, `validateContractFieldValue`, `validateCapabilityContract`, `authoritativeEvidence`, and `DISPATCH_FIELDS` **atomically in one edit**. All existing test fixtures calling `buildCapabilityContract` need the new fields populated (extend `contractEvidence()` in the helper).

**CONTRACT_FIELDS extension point** (`src/registry/contract.mjs:4-19`):
```javascript
export const CONTRACT_FIELDS = Object.freeze([
  'purpose', 'triggers', 'inputs', 'outputs', 'preconditions', 'dependencies',
  'permissions', 'side_effects', 'reversibility', 'risk', 'invocation_kind',
  'lifecycle_role', 'scope', 'workflow_transitions',
  // TRUST-01 additions: 'action', 'cost', 'completion', 'native_invocation'
]);
```
Add each new field with a clear enum/string-list type in `validateContractFieldValue` (line 69-89) following the existing `STRING_LIST_FIELDS` / `ENUM_FIELDS` / `scope` dispatch. Treat `cost` as a static contract field (per RESEARCH Open Question 1) and `completion` as a contract field describing required completion-evidence shape (Open Question 2).

**Envelope return shape** to extend for TRUST-01 explicit/inferred/conflicting (`src/registry/contract.mjs:161-173`):
```javascript
return {
  state: known ? 'known' : 'unknown',
  ...(known ? { value: accepted.value } : {}),
  evidence: ordered(evidence),
  rejected_evidence: ordered(rejected),
  provenance: known ? [...new Set(eligible.map(item => item.provenance))].sort() : [],
  policy_version: CONTRACT_POLICY.policy_version,
  freshness: known ? 'fresh' : (reason.endsWith('_stale') ? 'stale' : 'unknown'),
  confidence_basis_points: known
    ? Math.min(...eligible.map(item => item.confidence_basis_points))
    : 0,
  reason_codes: [reason],
  // TRUST-01 addition:
  // evidence_class: 'explicit' | 'inferred' | 'conflicting' | 'unknown'
};
```
Per RESEARCH Pattern 1: `explicit` = provenance `adapter` with `confidence_basis_points === 10000`; `inferred` = provenance `manifest`/`correction` with confidence ≥ 8500; `conflicting` = `assertedValues.size > 1` (currently collapsed to `unknown` at line 155-156, reason set at line 147 — surface it as a distinct class per Pitfall 2); `unknown` = no eligible evidence.

**Authored rejection pattern** to generalize via `trust.mjs` (`src/registry/contract.mjs:122-124`):
```javascript
if (candidate.provenance === 'authored') {
  rejected.push(portableEvidence(candidate, false, 'authored_evidence_rejected'));
  continue;
}
```
TRUST-02: replace this single-source check with a call to `trust.mjs::classifyEvidence(field, candidate)` so the same rejection path covers `description`/`plugin`/`private`/`learned` provenance for authority-critical fields.

**Raw-value redaction invariant** to preserve (`src/registry/contract.mjs:476-481`):
```javascript
for (const item of [...value.evidence, ...value.rejected_evidence]) {
  if ('value' in item) throw new TypeError(`capability.contract.fields.${field} evidence must not expose raw values`);
  // ...
}
```
Any new fields must not expose raw values in evidence items — enforced by the existing validator, so just don't add raw values to evidence objects.

---

### `src/registry/eligibility.mjs` (service, transform) — EXTEND

**Analog:** itself (in-place extension of `evaluateEligibility` / `ELIGIBILITY_GATES`)

**Return shape** to extend for TRUST-05 quarantine (`src/registry/eligibility.mjs:182-190`):
```javascript
return {
  schema_version: 1,
  policy_version: 'eligibility-policy-v1',
  eligible,
  recommendation_only: !eligible,
  gates,
  reason_codes: eligible ? ['eligibility_all_gates_passed'] : reasonCodes,
  // TRUST-05 additions:
  // quarantined: boolean,
  // quarantine_reasons: string[] (e.g. ['injection_bearing', 'scope_escaping']),
};
```
Per RESEARCH Pattern 5: quarantine is per-capability (per-record), NOT per-route. Quarantining one record must NOT touch other records with the same `semantic_type` (Pitfall 5). The existing evaluator already operates per-record (the `record` argument) — add a `quarantined` flag computed from a new gate (or a new field on the returned object) without changing the per-record scope.

**Gate-set invariant (Pitfall 1 / anti-pattern):** `validateEligibility` in `schema.mjs:203` enforces `Object.keys(eligibility.gates).sort()` exactly equals `[...ELIGIBILITY_GATES].sort()`. If a new gate is added, update BOTH `ELIGIBILITY_GATES` (eligibility.mjs:5-16) AND the canonical set in `schema.mjs:49` atomically. If quarantine is a disposition (not a gate), no gate-set change is needed — just add the `quarantined`/`quarantine_reasons` fields and update `validateEligibility` to accept them (see schema.mjs entry below).

**Per-gate state pattern** to follow for any new gate (`src/registry/eligibility.mjs:124-138,159-176`):
```javascript
function confidenceState(record) {
  if (!record?.contract) return 'unknown';
  // ... returns 'passed' | 'failed' | 'unknown'
}
// ... gates: { ..., field_confidence: confidenceState(record) }
```

---

### `src/registry/schema.mjs` (validation, transform) — EXTEND

**Analog:** itself (`validateCapabilityContract` via contract.mjs:440 + `validateEligibility` at schema.mjs:191)

**Canonical gate-set validation** that must stay consistent (`src/registry/schema.mjs:203-208`):
```javascript
if (stableStringify(Object.keys(eligibility.gates).sort()) !== stableStringify([...ELIGIBILITY_GATES].sort())) {
  fail('capability.eligibility.gates must contain the canonical gate set');
}
for (const gate of ELIGIBILITY_GATES) {
  oneOf(eligibility.gates[gate], ['passed', 'failed', 'unknown'], `capability.eligibility.gates.${gate}`);
}
```
If a quarantine gate is added, update the `ELIGIBILITY_GATES` array at schema.mjs:49 alongside eligibility.mjs:5. If quarantine is a disposition field (not a gate), extend `validateEligibility` to accept `quarantined: boolean` + `quarantine_reasons: string[]` and add the same `oneOf`/array-bounds checks used for `reason_codes` (schema.mjs:209-212).

**Disposition validation** to extend if quarantine is a disposition (`src/registry/schema.mjs:197-201`):
```javascript
if (typeof eligibility.eligible !== 'boolean'
  || typeof eligibility.recommendation_only !== 'boolean'
  || eligibility.eligible === eligibility.recommendation_only) {
  fail('capability.eligibility disposition is invalid');
}
```
Add `quarantined` handling: a quarantined record is `eligible: false, recommendation_only: true, quarantined: true` (it is blocked from dispatch but inspectable). Keep `eligible === recommendation_only` invariant unless `quarantined === true` — adjust the check so quarantine does not break the existing assertion.

Use `stableStringify` (schema.mjs:339-341) for any new canonical-set comparisons — already the codebase's stable serialization primitive.

---

### `src/adapters/dispatch/contract.mjs` (service, request-response) — EXTEND

**Analog:** itself (`createDispatchAdapter` factory / `RECEIPT_STATES` / `buildReceipt`)

**RECEIPT_STATES extension point** for TRUST-05 (`src/adapters/dispatch/contract.mjs:33-35`):
```javascript
export const RECEIPT_STATES = Object.freeze([
  'pending', 'invoked', 'paused', 'completed', 'failed', 'recommendation_only',
  // TRUST-05 additions: 'quarantined', 'blocked'
]);
```
`quarantined` = capability-level block with `quarantine_reasons`; `blocked` = pre-dispatch gate (TRUST-04) failure. Per RESEARCH Assumption A5: existing Phase 38 tests check exact receipt states — new states are additive, existing states unchanged, so tests stay green.

**Factory pattern** to extend with `validateInvocation` (TRUST-03) and `preDispatchGate` (TRUST-04) — add them as exported pure functions called by `invokeImpl` before `spawn()` (`src/adapters/dispatch/contract.mjs:89-117`):
```javascript
export function createDispatchAdapter({
  runtime, adapterVersion, receiptRoot, fixture, nativeIdentity,
  invokeImpl, canDispatchImpl, pauseImpl, resumeImpl,
}) {
  if (!runtime) throw new TypeError('runtime is required');
  if (!adapterVersion) throw new TypeError('adapterVersion is required');
  if (typeof invokeImpl !== 'function') throw new TypeError('invokeImpl is required');
  // ... adapter object with canDispatch/invoke/observe/pause/resume
}
```
Per RESEARCH Assumption A3: start with `validateInvocation` + `preDispatchGate` in this file; extract to a new `dispatch/pregate.mjs` only if >100 lines. Export them so `claude.mjs`/`codex.mjs` `invokeImpl` can call them before `spawn()`.

**buildReceipt pattern** to reuse for blocked/quarantined receipts (`src/adapters/dispatch/contract.mjs:50-74`):
```javascript
export function buildReceipt({
  schema_version = RECEIPT_SCHEMA_VERSION,
  receipt_id, invocation_identity, completion_evidence,
  intent = '', authority = '', risk = '', provenance,
} = {}) {
  if (!receipt_id) throw new TypeError('receipt_id is required');
  // ...
}
```
A blocked/quarantined invocation returns a receipt with `completion_evidence: { state: 'blocked', reason_codes: [...] }` and **no spawn** — exactly the `recommendationOnly` shape used in claude.mjs:241-265.

---

### `src/adapters/dispatch/claude.mjs` (adapter, request-response) — EXTEND

**Analog:** itself (`validateFixturePath` / `invokeImpl`)

**validateFixturePath pattern** to generalize into `validateInvocation` (TRUST-03) — current shape (`src/adapters/dispatch/claude.mjs:111-132`):
```javascript
function within(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

function validateFixturePath(fixturePath, allowedRoots) {
  if (typeof fixturePath !== 'string' || !fixturePath.trim()) {
    return { ok: false, reason: 'unsupported_command_form' };
  }
  if (fixturePath.includes('..')) return { ok: false, reason: 'path_escape' };
  let resolved;
  try { resolved = realpathSync(resolve(fixturePath)); }
  catch { return { ok: false, reason: 'fixture_not_found' }; }
  const contained = allowedRoots.some((root) => {
    try { return within(realpathSync(root), resolved); } catch { return false; }
  });
  if (!contained) return { ok: false, reason: 'path_escape' };
  try {
    const st = statSync(resolved);
    if (!st.isFile()) return { ok: false, reason: 'not_a_file' };
  } catch { return { ok: false, reason: 'fixture_not_found' }; }
  return { ok: true, resolved };
}
```
TRUST-03 extends this to a `validateInvocation(action, adapter)` that additionally checks: typed argument contract (args match expected types/schema), `cwd` within allowed roots, no shell wrapper injection (`shell:false` already enforced — keep it), no unescaped shell metacharacters in args, destructive-target rejection (`rm -rf /`, `> /dev/sda`), and runtime-scope match (`invocation.runtime === adapter.runtime`). Reuse the `within()` + realpath + `..` rejection pattern for cwd and any path args. Return `{ ok: false, reason: '<reason_code>' }` on failure (matches existing shape).

**invokeImpl insertion point** — call `validateInvocation` + `preDispatchGate` before `spawn()` (`src/adapters/dispatch/claude.mjs:267-288`):
```javascript
function invokeImpl(action, adapter) {
  // Validate action: null/empty/{} → recommendation_only, no spawn.
  if (!action || typeof action !== 'object' || Object.keys(action).length === 0) {
    return recommendationOnly(action, 'empty_action');
  }
  const can = canDispatchImpl(action);
  if (!can.ok) return recommendationOnly(action, can.reason);
  // TRUST-03/04 insertion: validateInvocation() then preDispatchGate()
  // const inv = validateInvocation(action, adapter);
  // if (!inv.ok) return recommendationOnly(action, inv.reason); // 'blocked' receipt
  // const gate = preDispatchGate(action, adapter);
  // if (!gate.ok) return recommendationOnly(action, gate.reason);
  const idempotencyKey = String(action.idempotency_key || '');
  // ...
  child = spawn(process.execPath, [fixturePath], { /* ... */ });
}
```
Reuse `recommendationOnly()` (claude.mjs:241-265) as the no-spawn receipt builder — extend it to emit `state: 'blocked'` or `state: 'quarantined'` with `reason_codes` when the failure comes from the pre-gate (so the receipt distinguishes "empty action" from "blocked by trust gate").

**NEVER put validation on the hot path (Pitfall 4):** `validateInvocation` runs inside `invokeImpl` (dispatch time, off the prompt hot path) or in the worker entrypoint — never in `router.mjs`. The hook stays <100ms.

---

### `src/adapters/dispatch/codex.mjs` (adapter, request-response) — EXTEND

**Analog:** `src/adapters/dispatch/claude.mjs` (the canonical variant; codex.mjs mirrors it)

`codex.mjs` has the same `validateFixturePath` (line 74), `invokeImpl` (line 177), and `spawn()` (line 194) shape as claude.mjs. Apply the **identical** `validateInvocation` + `preDispatchGate` insertion before `spawn()`. The factory contract (`dispatch/contract.mjs`) is shared, so the same exported functions drop into both variants without duplication. Keep the `runtime: 'codex'` distinction only for receipt-root partitioning (receipt.mjs:66-69) and runtime-scope validation.

---

### `src/cli/router-control.mjs` (component, transform) — EXTEND

**Analog:** itself (`fieldProjection` / `evidenceProjection`)

**fieldProjection extension point** for TRUST-01 explicit/inferred/conflicting (`src/cli/router-control.mjs:396-413`):
```javascript
function fieldProjection(value) {
  const evidence = values => (Array.isArray(values) ? values : [])
    .map(evidenceProjection)
    .sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)))
    .slice(0, MAX_VALUE);
  return {
    state: value?.state === 'known' ? 'known' : 'unknown',
    evidence: evidence(value?.evidence),
    rejected_evidence: evidence(value?.rejected_evidence),
    provenance: safeTokenList(value?.provenance),
    policy_version: safeToken(value?.policy_version),
    freshness: safeToken(value?.freshness),
    confidence_basis_points: Number.isInteger(value?.confidence_basis_points)
      ? Math.max(0, Math.min(10000, value.confidence_basis_points))
      : 0,
    reason_codes: safeTokenList(value?.reason_codes),
    // TRUST-01 addition:
    // evidence_class: safeToken(value?.evidence_class, 'unknown'),
  };
}
```
Surface `evidence_class` ('explicit' | 'inferred' | 'conflicting' | 'unknown') as a distinct inspectable field. Use the existing `safeToken` (line 167) and `MAX_VALUE` (line 25) bounds. Privacy-safe by construction — never expose raw `value` (already enforced at contract.mjs:477).

**contractDetailProjection** already iterates all fields and projects each (`src/cli/router-control.mjs:438-464`) — no change needed beyond the `fieldProjection` addition; new contract fields (action/cost/completion/native-invocation) flow through automatically once they exist in `CONTRACT_FIELDS`.

---

### `src/lifecycle/router-lifecycle.mjs` (config, file-I/O) — EXTEND

**Analog:** itself (`moduleNames` array / `moduleValues` flatMap)

**moduleNames extension point** — add `registry/trust.mjs` next to the existing registry entries (`src/lifecycle/router-lifecycle.mjs:384-410`):
```javascript
const moduleNames = [
  'registry/build.mjs', 'registry/schema.mjs', 'registry/identity.mjs',
  // ...
  'registry/contract.mjs', 'registry/eligibility.mjs', 'registry/relationships.mjs',
  // TRUST-02: untrusted-evidence policy. Deployed to BOTH ownedRoot and
  // codexOwnedRoot via the moduleValues flatMap below (HOST-03 parity).
  'registry/trust.mjs',
  // ...
  'adapters/dispatch/contract.mjs', 'adapters/dispatch/receipt.mjs',
  'adapters/dispatch/claude.mjs', 'adapters/dispatch/codex.mjs',
  // ...
];
```
The `moduleValues` flatMap at line 429-431 copies each name to both `[p.ownedRoot, p.codexOwnedRoot]/modules/<name>`. Adding `'registry/trust.mjs'` to `moduleNames` is the ONLY change needed — the flatMap handles both runtimes. Pitfall 6: forgetting this entry deploys to dev `src/` but ENOENTs in `~/.claude/router/modules/` and `~/.codex/router/modules/`. The `tests/router.deployed-bundle.test.mjs` regression backstop catches this.

No changes needed for the extended files (`contract.mjs`, `eligibility.mjs`, `schema.mjs`, `dispatch/contract.mjs`, `claude.mjs`, `codex.mjs`, `router-control.mjs`) — they are already in `moduleNames`.

---

### `tests/helpers/inventory-fixture.mjs` (test helper, transform) — EXTEND

**Analog:** itself (`contractEvidence()` / `record()`)

**contractEvidence extension point** — add the new contract fields to the `structural` object (`tests/helpers/inventory-fixture.mjs:160-176`):
```javascript
export function contractEvidence(record, variant = 'accepted') {
  const structural = {
    purpose: record.name,
    triggers: [record.name],
    inputs: [], outputs: [], preconditions: [],
    dependencies: record.dependencies.items.map(item => item.id),
    permissions: [], side_effects: [],
    reversibility: 'unknown', risk: 'unknown',
    invocation_kind: record.invocation.availability === 'available' ? record.semantic_type : 'none',
    lifecycle_role: record.lifecycle_role,
    scope: record.scope,
    workflow_transitions: [],
    // TRUST-01 additions:
    // action: '...', cost: '...', completion: {...}, native_invocation: {...},
  };
  // ... existing variant overrides (missing/conflicting/stale/below-threshold/rejected)
}
```
Add new variant flags for TRUST-02 (e.g. `untrusted` — manifest/private/learned evidence on authority-critical fields) and TRUST-05 (e.g. `quarantined` — injection-bearing content). Follow the existing `if (variant === '...')` pattern at lines 184-203. The variant-throw guard at line 204-206 must list the new variants.

**safeRecord pattern** from `tests/router.contract-eligibility.test.mjs:13-23` to reuse in the new trust tests:
```javascript
function safeRecord(overrides = {}) {
  const record = { ...buildClaudeHeavyProfile()[0], dependencies: { state: 'declared', items: [] }, ...overrides };
  const evidence = contractEvidence(record);
  evidence.reversibility[0].value = 'reversible';
  evidence.risk[0].value = 'low';
  return { ...record, contract: buildCapabilityContract(record, evidence) };
}
```

---

### `tests/router.trust-contract.test.mjs` (test, request-response) — NEW

**Analog:** `tests/router.contract-inspection.test.mjs`

Copy the test skeleton: `import assert from 'node:assert/strict'; import test from 'node:test';` + import `control` from `../src/cli/router-control.mjs` + `buildCapabilityContract`/`contractEvidence` helpers. Build records with `buildCapabilityContract(record, contractEvidence(record, '<variant>'))` and assert `control.contractDetailProjection(record).fields.<field>.evidence_class` is `explicit`/`inferred`/`conflicting`/`unknown`. Assert the new fields (`action`/`cost`/`completion`/`native_invocation`) appear in the projected `fields` keys. Assert privacy-safe (no raw `value` in evidence, no secrets leak) — copy the `assert.doesNotMatch(JSON.stringify(detail), /secret/)` pattern at contract-inspection.test.mjs:113-114.

---

### `tests/router.trust-evidence.test.mjs` (test, request-response) — NEW

**Analog:** `tests/router.contract-eligibility.test.mjs`

Copy the `safeRecord` + `evaluate` harness (contract-eligibility.test.mjs:13-36). Import `classifyEvidence` (or the `trust.mjs` entry function) and assert: (a) manifest/plugin/private/learned provenance is rejected for `permissions`/`side_effects`/`risk`/`reversibility`/`invocation_kind` with `reason_code: 'untrusted_evidence_rejected'`; (b) the rejected evidence appears in `contract.fields.<field>.rejected_evidence`; (c) the field's `state` stays `unknown` (no authority granted). Add a fixture where a manifest claims `permissions: ['elevated']` and assert it does NOT reach `envelope().value` (Pitfall 3 warning sign).

---

### `tests/router.trust-invocation.test.mjs` (test, request-response) — NEW

**Analog:** `tests/router.dispatch-integration.test.mjs`

Import `validateInvocation` from `../src/adapters/dispatch/contract.mjs` (or the adapter). Assert each rejection reason: `path_escape` (input with `..`), `fixture_not_found`, `not_a_file`, `path_escape` (outside allowed roots), plus the new TRUST-03 reasons: `cwd_escape`, `wrapper_injection`, `unquoted_metachar`, `destructive_target`, `runtime_scope_mismatch`, `arg_type_invalid`. Use the existing `validateFixturePath` return shape `{ ok: false, reason }` as the contract. Keep tests pure-function (no real `spawn`) — `validateInvocation` is a pure validator.

---

### `tests/router.trust-pregate.test.mjs` (test, request-response) — NEW

**Analog:** `tests/router.dispatch-integration.test.mjs`

Import `preDispatchGate` from `../src/adapters/dispatch/contract.mjs`. Assert it blocks: missing timeout, unbounded retry, missing output bounds, missing completion contract. Assert it passes a valid contract (bounded timeout, bounded retry, declared output bounds, completion contract present). Pure-function tests; no subprocess. Per RESEARCH Pattern 4: these are dispatch-time gates validating the invocation contract, not the capability record — so fixtures are invocation objects, not full records.

---

### `tests/router.trust-quarantine.test.mjs` (test, request-response) — NEW

**Analog:** `tests/router.contract-eligibility.test.mjs`

Copy the `safeRecord` + `evaluate` harness. Assert: (a) a quarantined record has `eligibility.quarantined === true` and `eligibility.quarantine_reasons` is a non-empty array of reason codes; (b) an independent valid fallback with the same `semantic_type` but different `stableCapabilityId` remains `eligible: true` when its sibling is quarantined (Pitfall 5 backstop); (c) an injection-bearing capability (unsafe content in `purpose`/`description`) is quarantined. Use `withField` (contract-eligibility.test.mjs:38-49) to inject unsafe envelopes without rebuilding the whole contract.

---

## Shared Patterns

### Evidence Envelope Construction (applies to contract.mjs + trust.mjs + schema.mjs)
**Source:** `src/registry/contract.mjs:104-174` (`envelope()`)
**Apply to:** all TRUST-01/02 work — every field's resolution flows through `envelope()`. The `evidence_class` addition, the `classifyEvidence` call for untrusted rejection, and the `validateCapabilityContract` field-set invariant are all centered here.
```javascript
// The four invariant checks every envelope result must satisfy:
// 1. state in {'known','unknown'} (extend with evidence_class, NOT a new state value)
// 2. known => value present; unknown => value absent (contract.mjs:456-457)
// 3. evidence items must not expose raw 'value' (contract.mjs:477)
// 4. confidence_basis_points integer in [0,10000] (contract.mjs:471-475)
```

### Reason-Code Convention (applies to all new modules/tests)
**Source:** `src/registry/contract.mjs:65-67` (`reasonToken`) + `eligibility.mjs:178-180` (`${name}_${gates[name]}`)
**Apply to:** every new rejection/quarantine reason. Tokens match `/^[a-z0-9][a-z0-9._-]{0,63}$/i`. Pattern: `${field}_${condition}` or `${gate}_${state}`. New codes: `untrusted_evidence_rejected`, `injection_bearing`, `scope_escaping`, `destructive_target`, `cwd_escape`, `wrapper_injection`, `unquoted_metachar`, `runtime_scope_mismatch`, `arg_type_invalid`, `blocked`, `quarantined`.
```javascript
function reasonToken(value, fallback) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(value) ? value : fallback;
}
```

### Receipt / No-Spawn Pattern (applies to dispatch/contract.mjs + claude.mjs + codex.mjs)
**Source:** `src/adapters/dispatch/claude.mjs:241-265` (`recommendationOnly`)
**Apply to:** TRUST-03 blocked receipts + TRUST-05 quarantined receipts. A failed pre-gate or quarantine returns a receipt with `completion_evidence.state = 'blocked'` (or `'quarantined'`) + `reason_codes`, **no `spawn()`**. Same shape as `recommendationOnly`; only the `state` and reason differ.
```javascript
const receipt = {
  schema_version: RECEIPT_SCHEMA_VERSION,
  receipt_id: buildReceiptId(invocation, action),
  invocation_identity: invocation,
  completion_evidence: { state: 'recommendation_only', ...(reason ? { reason } : {}) },
  // ...
};
store.publish(receipt);
return receipt;
```

### Test Harness (applies to all 5 new trust test files)
**Source:** `tests/router.contract-eligibility.test.mjs:1-49`
**Apply to:** all trust tests. Skeleton:
```javascript
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCapabilityContract } from '../src/registry/contract.mjs';
import { buildClaudeHeavyProfile, contractEvidence } from './helpers/inventory-fixture.mjs';

function safeRecord(overrides = {}) {
  const record = { ...buildClaudeHeavyProfile()[0], dependencies: { state: 'declared', items: [] }, ...overrides };
  const evidence = contractEvidence(record);
  evidence.reversibility[0].value = 'reversible';
  evidence.risk[0].value = 'low';
  return { ...record, contract: buildCapabilityContract(record, evidence) };
}
```
Use lazy `import('../src/registry/eligibility.mjs')` (as at contract-eligibility.test.mjs:11) when the module under test is in the registry layer. Pure-function tests only — no `spawn()`, no real I/O for the contract/trust/pregate tests; the invocation test can use the existing `tests/phase-38/fixtures/harmless.mjs` fixture pattern if a real adapter is needed.

### Fail-Open / Off-Hot-Path (applies to all src changes)
**Source:** `.claude/CLAUDE.md` Constraints + `src/adapters/dispatch/claude.mjs` worker entrypoint
**Apply to:** every new validation. Trust hardening runs at BUILD time (contract/eligibility) or DISPATCH time (pre-gate), NEVER at prompt time. The hook (`router.mjs`) does only BM25 + `additionalContext`. `validateInvocation`/`preDispatchGate` run inside `invokeImpl` or the worker, not in the hook. Per Pitfall 4: `tests/router.perf-evolved.test.mjs` + `tests/router.failopen.test.mjs` are the regression backstops.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | — | — | All Phase 41 work extends existing seams in-place; new files map to existing siblings. |

## Metadata

**Analog search scope:**
- `/Users/guilherme/Desktop/ClaudeCode/Router-build/src/registry/` (contract.mjs, eligibility.mjs, schema.mjs, identity.mjs)
- `/Users/guilherme/Desktop/ClaudeCode/Router-build/src/adapters/dispatch/` (contract.mjs, claude.mjs, codex.mjs, receipt.mjs)
- `/Users/guilherme/Desktop/ClaudeCode/Router-build/src/cli/` (router-control.mjs)
- `/Users/guilherme/Desktop/ClaudeCode/Router-build/src/lifecycle/` (router-lifecycle.mjs)
- `/Users/guilherme/Desktop/ClaudeCode/Router-build/tests/` (contract-eligibility, contract-inspection, contracts, dispatch-integration)
- `/Users/guilherme/Desktop/ClaudeCode/Router-build/tests/helpers/` (inventory-fixture.mjs)

**Files scanned:** 12 source + 4 test analogs
**Pattern extraction date:** 2026-08-08
**Verified against:** RESEARCH.md line citations (all excerpts match source at the cited line numbers)