# Phase 23: Intent-Safe State-Aware Execution - Pattern Map

**Mapped:** 2026-07-27
**Files analyzed:** 10 (4 new modules, 5 new tests, 1 modified fixture)
**Analogs found:** 10 / 10

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/intent/classify.mjs` | utility | transform (prompt → disposition) | `src/context/resolve.mjs` + `src/context/prompt-route.mjs#parseInstruction` + `src/orchestrator/transitions.mjs` (versioned-policy + `blocked()` helper) | exact (role + flow) |
| `src/orchestrator/actions.mjs` | service | request-response (intent+state+registry → selected capability) | `src/orchestrator/select.mjs#selectCapabilities` + `src/orchestrator/transitions.mjs#selectWorkflow` | exact |
| `src/orchestrator/approval.mjs` | service | transform (hash binding) | `src/registry/identity.mjs#contentFingerprint` + `src/registry/contract.mjs` (envelope state-known gating, `ENUM_FIELDS`) | exact |
| `src/orchestrator/next-prompt.mjs` | utility | transform (selection → prompt string) | `src/context/prompt-route.mjs#injection` + `src/orchestrator/transitions.mjs#clarification` | exact |
| `tests/router.intent.test.mjs` | test | unit matrix | `tests/router.contract-eligibility.test.mjs` | exact |
| `tests/router.intent-adversarial.test.mjs` | test | adversarial corpus | `tests/router.contract-eligibility.test.mjs` (negative assertions) | exact |
| `tests/router.actions.test.mjs` | test | unit + integration | `tests/router.contract-eligibility.test.mjs` | exact |
| `tests/router.approval.test.mjs` | test | unit (stale/mismatch fail-closed) | `tests/router.contract-eligibility.test.mjs` | exact |
| `tests/router.dispatch-integration.test.mjs` | test | end-to-end | `tests/router.contract-eligibility.test.mjs` (compose `evaluateEligibility`) | exact |
| `tests/helpers/inventory-fixture.mjs` (extend) | test fixture | n/a | itself (`contractEvidence` already supports `workflow_transitions: []`) | exact |

## Pattern Assignments

### `src/intent/classify.mjs` (utility, transform)

**Analogs:** `src/context/resolve.mjs` (deterministic outcome vocabulary), `src/context/prompt-route.mjs#parseInstruction` (regex-only instruction parser), `src/orchestrator/transitions.mjs` (versioned-policy + `blocked()` helper).

**Imports pattern** — copy style from `src/orchestrator/transitions.mjs:1` and `src/context/prompt-route.mjs:1-4`:
```javascript
// ESM stdlib-only; no node:crypto needed for classification (signature may import from registry/identity later)
export const INTENT_POLICY_VERSION = 'intent-policy-v1';
```
No external imports required for the pure classifier; the `node:crypto` signature hash (if added) follows `src/registry/identity.mjs:1` (`import { createHash } from 'node:crypto'`).

**Versioned-policy + frozen-enum pattern** — copy from `src/orchestrator/transitions.mjs:1,9`:
```javascript
export const TRANSITION_POLICY_VERSION = 'workflow-transitions-v1';
// ...
export const WORKFLOW_TRANSITIONS = Object.freeze([ /* ... */ ]);
```
Apply: `export const INTENT_DISPOSITIONS = Object.freeze(['execute','explain','hypothetical','quoted','negated','prohibited','preview','ambiguous'])`.

**Blocked helper pattern** — copy from `src/orchestrator/transitions.mjs:21-23`:
```javascript
function blocked(reason_code) {
  return { status: 'blocked', dispatch_eligible: false, reason_code, candidates: [] };
}
```
Apply: every non-execute disposition returns `{ disposition, dispatch_eligible: false, reason_code, policy_version }`. The `dispatch_eligible: false` field is the contract the downstream pipeline reads (matches `select.mjs`'s use of `workflow.dispatch_eligible`).

**Regex-based deterministic classification** — copy structure from `src/context/prompt-route.mjs:8-20`:
```javascript
function parseInstruction(prompt) {
  const referential = normalizeContextInstruction(prompt);
  if (referential.kind === 'referential') return referential;
  const normalized = String(prompt || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const match = normalized.match(/^(plan|execute|verify|review|finish|use)\s+(?:phase\s+)?([a-z0-9._-]+)(?:\s+(.+))?$/);
  if (!match) return { kind: 'none' };
  const [, action, phase, detail] = match;
  return { kind: 'explicit', complete: Boolean(action && phase), goal_id: `phase-${phase}`, workflow: ..., ... };
}
```
Apply: precedence-ordered regex checks (prohibition → quoted → hypothetical → negated → preview → execute). Pitfall 1 mandates this exact ordering and `!NEGATION.test` on the execute branch. Treat all prompt text as untrusted (ASVS V5) — never `eval`/`Function`.

**Outcome vocabulary pattern** — copy from `src/context/resolve.mjs:11-13`:
```javascript
function base(outcome, reason_code, dispatch_eligible, extra = {}) {
  return { outcome, reason_code, dispatch_eligible, ...extra };
}
```
Apply: every classifier return carries `disposition`, `reason_code`, `dispatch_eligible`, `policy_version` — same shape contract `resolve.mjs` uses for `outcome`/`reason_code`/`dispatch_eligible`.

---

### `src/orchestrator/actions.mjs` (service, request-response)

**Analogs:** `src/orchestrator/select.mjs#selectCapabilities` (consume workflow token + registry, filter, return blocked/selected), `src/orchestrator/transitions.mjs#selectWorkflow` (candidates → selected or clarification).

**Imports pattern** — copy from `src/orchestrator/select.mjs:1-3` (none) and `src/registry/eligibility.mjs:1-3`:
```javascript
import { stableCapabilityId } from './identity.mjs';      // re-path from orchestrator/
import { stableStringify } from '../registry/schema.mjs';
import { validateContractFieldValue } from '../registry/contract.mjs';
```
Use `../registry/identity.mjs`, `../registry/schema.mjs`, `../registry/contract.mjs` from `src/orchestrator/`.

**Blocked/clarification helper** — copy from `src/orchestrator/select.mjs:9-11` and `src/orchestrator/transitions.mjs:102-104,131-137`:
```javascript
function blocked(reason_code, facts = {}) {
  return { status: 'blocked', dispatch_eligible: false, reason_code, ...facts };
}
function clarification(candidates, reason_code) {
  const labels = [...new Set(candidates.map(actionLabel))];
  const question = labels.length === 2
    ? `Should I ${labels[0]} or ${labels[1]} next?`
    : 'Which valid workflow should run next?';
  return { status: 'clarification_required', dispatch_eligible: false, reason_code, question };
}
```
Apply: `no_eligible_capability` → `blocked`; `material_capability_tie` → `clarification` (Pitfall 5: never pick first).

**Contract-envelope field reading** — copy from `src/registry/eligibility.mjs:32-42`:
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
Apply: read `contract.fields.workflow_transitions` only when `state === 'known'` AND `freshness === 'fresh'` (RESEARCH Pattern 2). Never read `src/orchestrator/workflow-declarations.json` `compatible` lists as authority (Anti-Pattern; `workflow-declarations.json` is a Phase 19 scaffold with empty `owners`/`compatible` for most workflows — verified in `select.mjs:142-153` `declarationFor`).

**Hook exclusion** — copy invariant from `src/orchestrator/select.mjs:131`:
```javascript
invokable_capabilities: canonical.filter(record => !['hook', 'model', 'permission'].includes(record.type)).map(facts),
```
Apply: filter `r.type !== 'hook' && r.lifecycle === 'ready'` before contract matching (Pitfall 6, EXEC-09).

**Tie / unique-selection pattern** — copy from `src/orchestrator/transitions.mjs:154,176`:
```javascript
if (candidates.length === 0) return selectionBlocked('no_valid_transition');
// ...
if (candidates.length !== 1) return clarification(candidates, 'material_transition_tie');
```

---

### `src/orchestrator/approval.mjs` (service, transform)

**Analogs:** `src/registry/identity.mjs#contentFingerprint` (SHA-256 over `stableStringify`), `src/registry/contract.mjs` (envelope state-known gating, `ENUM_FIELDS` for `reversibility`/`risk`).

**Imports pattern** — copy exactly from `src/registry/identity.mjs:1-2`:
```javascript
import { createHash } from 'node:crypto';
import { stableStringify } from '../registry/schema.mjs';
// re-path: from src/orchestrator/ use '../registry/identity.mjs' and '../registry/schema.mjs'
import { contentFingerprint, stableCapabilityId } from '../registry/identity.mjs';
```

**Fingerprint hashing** — copy from `src/registry/identity.mjs:37-51`:
```javascript
export function contentFingerprint(value) {
  let canonical = value;
  if (value?.schema_version === 1) {
    const normalized = canonicalizeCapability(value);
    canonical = value.content !== undefined
      ? { type: normalized.type, content: normalized.content }
      : { type: normalized.type, source_fingerprints: normalized.provenance.map(source => source.source_fingerprint).sort() };
  }
  return createHash('sha256').update(stableStringify(canonical), 'utf8').digest('hex');
}
```
Apply: `bindApproval` reuses `contentFingerprint(capability)` for the capability leg, then `createHash('sha256')` chained with `stableStringify(args)`, `stableStringify([...targets].sort())`, `stableStringify(effects)`, `String(proposalVersion)` (RESEARCH Pattern 3). Never hand-roll hashing (ASVS V6 — `node:crypto` SHA-256).

**ENUM field gating** — copy from `src/registry/contract.mjs:56-59` and `src/registry/eligibility.mjs:165-175`:
```javascript
const ENUM_FIELDS = Object.freeze({
  reversibility: new Set(['unknown', 'reversible', 'irreversible']),
  risk: new Set(['unknown', 'low', 'medium', 'high', 'critical', 'unacceptable']),
});
// eligibility.mjs side_effects / reversibility / risk gate:
side_effects: fieldState(record, 'side_effects', value => (
  unsafeValue(value, ['destructive', 'unbounded', 'unapproved']) ? 'failed' : 'passed'
)),
reversibility: fieldState(record, 'reversibility', value => {
  if (unsafeValue(value, ['unknown'])) return 'unknown';
  return unsafeValue(value, ['irreversible', '"no"']) ? 'failed' : 'passed';
}),
risk: fieldState(record, 'risk', value => {
  if (unsafeValue(value, ['unknown'])) return 'unknown';
  return unsafeValue(value, ['high', 'critical', 'unacceptable']) ? 'failed' : 'passed';
}),
```
Apply: `needsApproval(contract)` reuses the same `field` reader + `state === 'known'` gate + same token vocabulary (`destructive`, `unbounded`, `external`, `privileged`, `irreversible`, `high`, `critical`, `unacceptable`). Do not re-check eligibility — only read the contract envelope (Anti-Pattern: re-checking eligibility drifts Phase 22 authority).

**Stale/mismatch fail-closed** — copy blocked pattern from `src/orchestrator/select.mjs:9-11`:
```javascript
if (!bound || !presented) return blocked('approval_missing');
if (expected !== bound.token)   return blocked('approval_stale');
if (presented.token !== bound.token) return blocked('approval_mismatch');
```
Every path returns `{ status, dispatch_eligible, reason_code }` — same shape as `evaluateEligibility` and `selectCapabilities`.

---

### `src/orchestrator/next-prompt.mjs` (utility, transform)

**Analogs:** `src/context/prompt-route.mjs#injection` (build framework-neutral `additional_context` string), `src/orchestrator/transitions.mjs#clarification` (one focused question).

**Bounded-output injection pattern** — copy from `src/context/prompt-route.mjs:43-56`:
```javascript
function injection(resolution) {
  const fields = [
    '<!-- router-inject -->',
    `<context-recovery outcome="${resolution.outcome}" reason="${resolution.reason_code}" dispatch="${resolution.dispatch_eligible}">`,
  ];
  if (resolution.dispatch_eligible) {
    fields.push(`Next workflow action: ${typeof resolution.action === 'string' ? resolution.action : JSON.stringify(resolution.action)}`);
    if (resolution.artifact_ref) fields.push(`Referenced artifact: ${resolution.artifact_ref}`);
  } else if (resolution.question) fields.push(resolution.question);
  else if (resolution.diagnostic) fields.push(resolution.diagnostic);
  fields.push('</context-recovery>');
  const value = fields.join('\n');
  return Buffer.byteLength(value) <= MAX_CONTEXT_BYTES ? value : '<!-- router-inject -->\n<context-recovery outcome="clarify" reason="bounded_output">Which workflow should I continue?</context-recovery>';
}
```
Apply: build the next-capability prompt from the selected capability's `invocation` shape (NOT a hardcoded `/gsd-...` slash — Anti-Pattern, EXEC-10). Keep the `Buffer.byteLength(...) <= MAX_CONTEXT_BYTES` overflow guard.

**One focused question** — copy from `src/orchestrator/transitions.mjs:131-137`:
```javascript
function clarification(candidates, reason_code) {
  const labels = [...new Set(candidates.map(actionLabel))];
  const question = labels.length === 2
    ? `Should I ${labels[0]} or ${labels[1]} next?`
    : 'Which valid workflow should run next?';
  return { status: 'clarification_required', dispatch_eligible: false, reason_code, question };
}
```
Apply: at most one focused clarification per dispatch attempt (INT-05).

---

### `tests/router.intent.test.mjs` + adversarial + actions + approval + dispatch-integration (test, unit/adversarial/integration)

**Analog:** `tests/router.contract-eligibility.test.mjs`

**Imports + module-under-test lazy import** — copy from `tests/router.contract-eligibility.test.mjs:1-11`:
```javascript
import assert from 'node:assert/strict';
import test from 'node:test';

import { assembleRegistry } from '../src/registry/build.mjs';
import { buildCapabilityContract } from '../src/registry/contract.mjs';
import { stableCapabilityId } from '../src/registry/identity.mjs';
import { stableStringify } from '../src/registry/schema.mjs';
import { buildClaudeHeavyProfile, contractEvidence } from './helpers/inventory-fixture.mjs';

const eligibilityModule = import('../src/registry/eligibility.mjs');
```
Apply: lazy `import('../src/intent/classify.mjs')`, `import('../src/orchestrator/actions.mjs')`, `import('../src/orchestrator/approval.mjs')`. Lazy import is the repo convention for the module under test (lets the test file assert the module loads cleanly).

**Safe-record fixture builder** — copy from `tests/router.contract-eligibility.test.mjs:13-23`:
```javascript
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
Apply: extend with `evidence.workflow_transitions[0].value = ['gsd.execute']` (or per-test transition) so `actions.mjs` has a contract to match. Use the same `safeRecord` + `withField` patterns from lines 38-49.

**Negative assertion pattern** (for INT-06 adversarial corpus, EXEC-09 hook exclusion) — copy the recommendation-only assertion from `tests/router.contract-eligibility.test.mjs:73-79`:
```javascript
for (const record of cases) {
  const result = await evaluate(record);
  assert.equal(result.eligible, false);
  assert.equal(result.recommendation_only, true);
  assert.ok(!result.reason_codes.includes('eligibility_all_gates_passed'));
  assert.ok(result.reason_codes.includes('permission_unknown'));
}
```
Apply: for each minimal-pair adversarial prompt, assert `result.disposition !== 'execute'` AND `result.dispatch_eligible === false` (negative invocation assertion — the dispatcher is never called for non-execute dispositions, INT-06).

**Phase-tagged test names** — copy convention from `tests/router.contract-eligibility.test.mjs:51`:
```javascript
test('[phase22-red:eligibility] all passed gates are eligible through one evaluator', async () => {
```
Apply: `[phase23-red:intent]`, `[phase23-red:actions]`, `[phase23-red:approval]`, `[phase23-red:dispatch]` tags.

---

### `tests/helpers/inventory-fixture.mjs` (extend, test fixture)

**Analog:** itself. `contractEvidence` (lines 133-178) already emits a `workflow_transitions: []` envelope (line 148). Extension is minimal: add a variant or per-test override that populates `workflow_transitions` with concrete transition IDs so `actions.mjs` has a contract to match. Follow the existing `variant` switch pattern (lines 157-173):
```javascript
if (variant === 'missing') evidence.invocation_kind = [];
if (variant === 'conflicting') evidence.invocation_kind.push({ ... });
// add:
if (variant === 'workflow-transitions') evidence.workflow_transitions[0].value = ['gsd.execute'];
```
Do not add new helper files; extend the existing one (RESEARCH explicitly says "extend").

## Shared Patterns

### Versioned policy + `blocked()` helper
**Source:** `src/orchestrator/transitions.mjs:1,21-23` and `src/orchestrator/select.mjs:9-11`
**Apply to:** `src/intent/classify.mjs`, `src/orchestrator/actions.mjs`, `src/orchestrator/approval.mjs`, `src/orchestrator/next-prompt.mjs`
```javascript
export const <NAME>_POLICY_VERSION = '<name>-policy-v1';
function blocked(reason_code, facts = {}) {
  return { status: 'blocked', dispatch_eligible: false, reason_code, ...facts };
}
```
Every Phase 23 module exports a `*_POLICY_VERSION` const and uses a `blocked()` helper returning `dispatch_eligible: false` + stable `reason_code`. The `dispatch_eligible` field is the cross-module contract.

### Outcome/shape vocabulary (`status`, `reason_code`, `dispatch_eligible`)
**Source:** `src/context/resolve.mjs:11-13`, `src/orchestrator/transitions.mjs:21-23,102-104`, `src/registry/eligibility.mjs:182-190`
**Apply to:** all four new modules
```javascript
// resolve.mjs
function base(outcome, reason_code, dispatch_eligible, extra = {}) {
  return { outcome, reason_code, dispatch_eligible, ...extra };
}
// eligibility.mjs
return {
  schema_version: 1, policy_version: 'eligibility-policy-v1',
  eligible, recommendation_only: !eligible, gates, reason_codes,
};
```
Every return carries `dispatch_eligible` + `reason_code`; downstream consumers (`select.mjs#resolvedToken`, `select.mjs#selectCapabilities`) gate on `dispatch_eligible === true`.

### Contract-envelope field reader
**Source:** `src/registry/eligibility.mjs:32-42`
**Apply to:** `src/orchestrator/actions.mjs`, `src/orchestrator/approval.mjs`
```javascript
function field(record, name) { return record?.contract?.fields?.[name]; }
// gate on envelope.state === 'known' && envelope.freshness === 'fresh' && !validateContractFieldValue(name, envelope.value)
```
Never read raw `record.contract.fields[name].value` without the state/freshness/validity gates — this is how Phase 22 enforces uncertainty fail-closed.

### SHA-256 fingerprint via `node:crypto` + `stableStringify`
**Source:** `src/registry/identity.mjs:1,37-51` and `src/registry/schema.mjs:339-341`
**Apply to:** `src/orchestrator/approval.mjs` (and optionally `src/intent/classify.mjs` for prompt signatures)
```javascript
import { createHash } from 'node:crypto';
createHash('sha256').update(stableStringify(canonical), 'utf8').digest('hex');
```
Never hand-roll hashing (ASVS V6). Never log raw prompt text — only the SHA-256 signature (CLAUDE.md "Sha256 prompt signature for telemetry").

### Hook exclusion invariant
**Source:** `src/orchestrator/select.mjs:131` (`!['hook','model','permission'].includes(record.type)`)
**Apply to:** `src/orchestrator/actions.mjs` (filter `r.type !== 'hook'` before contract matching)
EXEC-09: lifecycle hooks are never task capabilities. Assert in adversarial corpus.

### Framework-neutral authority (no hardcoded `gsd-` strings)
**Source:** `src/orchestrator/workflow-declarations.json` (Phase 19 scaffold — `owners`/`compatible` empty for most workflows, verified via `select.mjs:142-153`), `src/context/prompt-route.mjs:17` (hardcodes `gsd-plan-phase`/`gsd-execute-phase` — **anti-pattern for Phase 23**)
**Apply to:** `src/orchestrator/actions.mjs`, `src/orchestrator/next-prompt.mjs`
Read `contract.fields.workflow_transitions` of installed capabilities as the ONLY authority. Pitfall 2: keep a test asserting `grep -r "gsd-" src/orchestrator/actions.mjs` returns no hits. Next-capability prompt is built from the selected capability's `invocation` shape, not a slash command.

### Test fixture + lazy-import + phase-tagged names
**Source:** `tests/router.contract-eligibility.test.mjs:1-11,13-23,51,73-79` and `tests/helpers/inventory-fixture.mjs:133-178`
**Apply to:** all five new test files
```javascript
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildClaudeHeavyProfile, contractEvidence } from './helpers/inventory-fixture.mjs';
const mod = import('../src/<module>.mjs');  // lazy
test('[phase23-red:<area>] <behavior>', async () => { ... });
```

## No Analog Found

None. Every Phase 23 file has an exact or role-match analog in the existing codebase.

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | — | — | All net-new modules map onto existing orchestrator/registry/context patterns. The intent classifier is novel in *content* (8 dispositions) but follows `parseInstruction`/`normalizeContextInstruction` in *form* (deterministic regex/phrase policy + versioned const + blocked helper). |

## Metadata

**Analog search scope:** `src/orchestrator/`, `src/registry/`, `src/context/`, `tests/`, `tests/helpers/`
**Files scanned:** 11 (`select.mjs`, `transitions.mjs`, `workflow-declarations.json` via `declarationFor`, `identity.mjs`, `schema.mjs`, `contract.mjs`, `eligibility.mjs`, `resolve.mjs`, `prompt-route.mjs`, `sources.mjs`, `tests/router.contract-eligibility.test.mjs`, `tests/helpers/inventory-fixture.mjs`)
**Pattern extraction date:** 2026-07-27