# Phase 39: Intent, Authority, Risk, and Invocation Policy - Pattern Map

**Mapped:** 2026-08-06
**Files analyzed:** 8 (2 new + 4 modify + 2 extend existing tests; plus 3 new test files)
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/intent/authority.mjs` (NEW) | service / policy | request-response (pure function) | `src/intent/classify.mjs` + `src/orchestrator/approval.mjs` | exact (role+flow) |
| `src/orchestrator/approval.mjs` (MODIFY) | service / policy | request-response | `src/orchestrator/approval.mjs` (self — vocab expansion) | exact |
| `src/orchestrator/actions.mjs` (MODIFY) | service / policy | request-response | `src/orchestrator/actions.mjs` (self — wire gate) | exact |
| `src/runtime/router.mjs` (MODIFY) | controller / hook | request-response (hot path) | `src/runtime/router.mjs` (self — wire policy into pipeline) | exact |
| `src/lifecycle/router-lifecycle.mjs` (MODIFY) | config / deploy | file-I/O | `src/lifecycle/router-lifecycle.mjs` (self — moduleNames append) | exact |
| `tests/router.authority.test.mjs` (NEW) | test | request-response | `tests/router.intent.test.mjs` | exact |
| `tests/router.authority-policy.test.mjs` (NEW) | test | request-response | `tests/router.approval.test.mjs` | exact (unit-policy shape) |
| `tests/router.authority-gate.test.mjs` (NEW) | test | request-response (integration) | `tests/router.actions.test.mjs` | exact (gate integration) |
| `tests/router.approval.test.mjs` (EXTEND) | test | request-response | self | exact |
| `tests/router.lifecycle.test.mjs` (EXTEND) | test | file-I/O | self | exact |

## Pattern Assignments

### `src/intent/authority.mjs` (NEW — service/policy, request-response pure function)

**Analogs:** `src/intent/classify.mjs` (taxonomy + pure-function shape) and `src/orchestrator/approval.mjs` (vocabulary + policy-version constant)

**Module-header + version-constant pattern** — copy from `src/intent/classify.mjs:1-4`:
```javascript
// Phase 39: Authority taxonomy + authority-policy evaluator — layered over
// classifyIntent (8 dispositions) per AUTH-01; independent-input policy
// evaluator per AUTH-03/04/05. Pure function, no eval, no prompt retention.

export const AUTHORITY_POLICY_VERSION = 'authority-policy-v1';
```

**Frozen vocabulary pattern** — copy the `Object.freeze` shape from `src/intent/classify.mjs:9-18`:
```javascript
export const INTENT_DISPOSITIONS = Object.freeze([
  'execute', 'explain', 'hypothetical', 'quoted',
  'negated', 'prohibited', 'preview', 'ambiguous',
]);
// Authority 5-class taxonomy (AUTH-01) — frozen, layered over INTENT_DISPOSITIONS:
export const AUTHORITY_CLASSES = Object.freeze([
  'advice', 'inspection', 'one_turn_action',
  'persistent_goal_action', 'non_authorizing_discussion',
]);
```

**Regex + outcome pattern** — copy the module-level regex + `outcome()` helper shape from `src/intent/classify.mjs:29-51,53-60`:
```javascript
const APOS = "['’‘]";
const PERSISTENT_GOAL_MARKERS = /\b(until\s+done|keep\s+going|finish\s+(?:it\s+)?all|autonomously\b.*\buntil|end-to-end|don'?t\s+stop)\b/i;
const INSPECTION_ONLY = /\b(inspect|show|list|what\s+(?:does|do|is)|status|audit|diagnose|inventory|coverage|health)\b/i;
const EXAMPLE_FRAMING = /\b(e\.?g\.|for example|such as|like when|suppose you|imagine you)\b/i;
const RETROSPECTIVE_FRAMING = /\b(earlier|previously|last time|before you|yesterday|in the past|you (?:already|just))\b/i;
const POLICY_DISCUSSION = /\b(the policy|policy says|rule says|per the rules|according to|should (?:you|the router))\b/i;
const AUTONOMOUS_WORDING = /\b(autonomously|without asking|just do it|don'?t ask|no confirmation|unattended)\b/i;

function outcome(authority_class, disposition, reason_code) {
  return { authority_class, disposition, reason_code, policy_version: AUTHORITY_POLICY_VERSION };
}
```

**Pure-function classifier shape** — copy the signature + abstention-first precedence from `src/intent/classify.mjs:67-107`:
```javascript
export function classifyIntent(prompt, { policyVersion } = {}) {
  if (policyVersion !== undefined && policyVersion !== INTENT_POLICY_VERSION) {
    return outcome('ambiguous', 'policy_version_mismatch');
  }
  const text = typeof prompt === 'string' ? prompt : '';
  if (text.trim().length === 0) return outcome('ambiguous', 'empty_prompt');
  // precedence chain: prohibition → quoted → hypothetical → negated → preview → explain → execute
  if (PROHIBITION.test(text)) return outcome('prohibited', 'prohibition_marker');
  // ... etc
}
```
`classifyAuthority(prompt, { intent })` mirrors this: takes the `intent.disposition` from `classifyIntent` output, short-circuits abstaining dispositions first (AUTH-02), then disambiguates `execute` via `PERSISTENT_GOAL_MARKERS`, then falls back to `INSPECTION_ONLY` only when no execute verb matches.

**Protected-effect vocabulary pattern** — copy the `Set`-of-tokens shape from `src/orchestrator/approval.mjs:17-19`:
```javascript
const DESTRUCTIVE_SIDE_EFFECTS = new Set(['destructive', 'unbounded', 'external', 'privileged']);
const IRREVERSIBLE = new Set(['irreversible']);
const HIGH_RISK = new Set(['high', 'critical', 'unacceptable']);
```
Phase 39 expands these into `PROTECTED_EFFECT_TOKENS` (frozen array, per RESEARCH Pattern 5) and exports it so `approval.mjs` imports it (single source of truth for the protected class).

**Policy-evaluator shape** — `evaluateAuthorityPolicy({ confidence, authority, risk, compatibility })` follows the same sealed-input + reason_code return shape as `verifyApproval` in `src/orchestrator/approval.mjs:120-151`:
```javascript
export function verifyApproval({ bound, presented, expected } = {}) {
  if (!bound || typeof bound !== 'object') {
    return { status: 'blocked', dispatch_eligible: false, reason_code: 'approval_missing' };
  }
  // ... legs checked in order, fail-closed, distinct reason_code per leg
}
```
The evaluator returns `{ decision: 'proceed'|'pause'|'ask'|'block', reason_code, confidence, ... }` — same field vocabulary (`status`/`dispatch_eligible`/`reason_code`) so downstream `resolveAction`/`gateAction` compose without shape translation.

**Critical invariant (AUTH-03):** the evaluator signature takes a sealed object and CANNOT accept `weights` or `confidenceTier` numerics — only the `confidence` tier string. Document this in a header comment mirroring `src/orchestrator/approval.mjs:1-5` style.

---

### `src/orchestrator/approval.mjs` (MODIFY — expand protected-effect vocabulary)

**Analog:** self (current file)

**Current vocabulary** (lines 17-19) — keep as-is, source from new `authority.mjs`:
```javascript
const DESTRUCTIVE_SIDE_EFFECTS = new Set(['destructive', 'unbounded', 'external', 'privileged']);
const IRREVERSIBLE = new Set(['irreversible']);
const HIGH_RISK = new Set(['high', 'critical', 'unacceptable']);
```

**Change pattern:** import `PROTECTED_EFFECT_TOKENS` from `../intent/authority.mjs` and replace the hardcoded `DESTRUCTIVE_SIDE_EFFECTS` set with one derived from the shared vocabulary (AUTH-05 single-source-of-truth per RESEARCH Open Question 3 recommendation). Keep `needsApproval`'s shape (lines 43-58) unchanged so existing 18 tests stay green; only the token set expands. Add new tests for the new tokens in `tests/router.approval.test.mjs` (EXTEND).

**Import addition** at top of file (after existing imports at lines 7-10):
```javascript
import { PROTECTED_EFFECT_TOKENS } from '../intent/authority.mjs';
```

---

### `src/orchestrator/actions.mjs` (MODIFY — wire proceed/pause/ask gate)

**Analog:** self — `resolveAction` (lines 165-219) + `selectOne` (lines 138-149)

**Existing outcome shape to preserve** (lines 49-55, 138-149):
```javascript
function blocked(reason_code, facts = {}) {
  return { status: 'blocked', dispatch_eligible: false, reason_code, ...facts };
}
function clarify(reason_code, facts = {}) {
  return { status: 'clarify', dispatch_eligible: false, reason_code, ...facts };
}
// selectOne returns { status: 'selected', dispatch_eligible: true, reason_code, capability, args? }
```

**Wire pattern:** add a `gateAction({ resolved, policy, approval })` wrapper (per RESEARCH Pattern 4) that maps the policy decision onto the existing status vocabulary — `proceed` → `{ status: 'proceed', dispatch_eligible: true, ... }`, `pause` → `{ status: 'paused', dispatch_eligible: false, approval_token, ... }`, `ask` → reuse `clarify()`, `block` → reuse `blocked()`. Keep the existing `resolveAction` return shape (`selected`/`blocked`/`clarify`) intact so the 17 existing `router.actions.test.mjs` tests stay green; `gateAction` is a thin post-processor that only runs when `resolved.status === 'selected'`.

**Reason-code mapping pattern** — copy the `TRANSITION_REASON_MAP` style (lines 28-36) for any new reason codes:
```javascript
const POLICY_REASON_MAP = {
  compatibility_unfit: 'compatibility_unfit',
  protected_effect_requires_confirmation: 'protected_effect_requires_confirmation',
  authority_not_granted: 'authority_not_granted',
  reversible_local_authorized: 'reversible_local_authorized',
  non_reversible_or_external_requires_confirmation: 'non_reversible_or_external_requires_confirmation',
  low_confidence_clarify: 'low_confidence_clarify',
};
```

---

### `src/runtime/router.mjs` (MODIFY — wire policy into hot path)

**Analog:** self — `confidenceTier` (lines 1825-1840) and hot-path route-suggestion assembly

**Existing `confidenceTier` signature** (lines 1825-1840) — the confidence input for AUTH-03, must remain independent:
```javascript
export function confidenceTier(topScore, runnerUpScore, thresholds, hasCanonicalMatch = false) {
  const T = thresholds || { T_high: 0.6, T_low: 0.3, M: 0.2 };
  // ... returns 'high' | 'medium' | 'low'
}
```

**Wire pattern:** after `confidenceTier` is computed and after `resolveAction` returns `selected`, call `evaluateAuthorityPolicy({ confidence, authority, risk, compatibility })` where:
- `confidence` = the `confidenceTier` string (NOT the numeric score — AUTH-03)
- `authority` = derived from `classifyAuthority` output (`{ granted, source }`)
- `risk` = `{ level, reversible, scope, protected }` derived from `contract.fields` (`risk`/`reversibility`/`side_effects`)
- `compatibility` = `{ eligible, disposition }` from `registry.eligibility[id]` + `contract.disposition`

**Hot-path budget pattern (HOST-04):** the policy evaluator must be a pure function over already-loaded state — NO new `readFileSync`/`spawn`. Copy the fail-open wrapper pattern already used for the route suggestion: any throw → exit 0, no `additionalContext`. The evaluator adds <1ms (RESEARCH Pattern 3 budget).

**Receipt-field threading pattern** — `src/adapters/dispatch/claude.mjs:152-154` already reads `action.intent`/`authority`/`risk` strings into the receipt. Populate these from `classifyAuthority` + `evaluateAuthorityPolicy` output rather than the Phase 38 fixture values. Do not change `buildReceipt`'s shape (`src/adapters/dispatch/contract.mjs:50-73`).

**Injection format pattern** — keep the sentinel-wrapped `additionalContext` block (`<!-- router-inject ... -->`) per CLAUDE.md Stack Patterns. For a `pause` decision, inject "paused: confirm X" as a suggestion (never `decision: "block"` — fail-open).

---

### `src/lifecycle/router-lifecycle.mjs` (MODIFY — add module to deploy bundle)

**Analog:** self — `moduleNames` array (lines 384-417)

**Existing pattern** (lines 384-417):
```javascript
const moduleNames = [
  'registry/build.mjs', 'registry/schema.mjs', 'registry/identity.mjs',
  // ... existing entries
  'orchestrator/approval.mjs',
  'orchestrator/workflow-declarations.json',
  // Phase 20: evolution/* added to the deployed bundle ...
  'evolution/canary-controller.mjs', 'evolution/evidence.mjs',
  // ...
];
const moduleValues = [p.ownedRoot, p.codexOwnedRoot].flatMap(runtimeRoot => (
  moduleNames.map(name => [join(runtimeRoot, 'modules', name), readFileSync(join(sourceRoot, name))])
));
```

**Append pattern:** add `'intent/authority.mjs'` to the `moduleNames` array (alphabetically near `intent/classify.mjs` if present, else after the `registry/*` block). The existing `moduleValues` flatMap deploys every entry to BOTH `ownedRoot` and `codexOwnedRoot` — adding one line is sufficient (no other change needed). Add a `// Phase 39: AUTH-01..05 authority taxonomy + policy evaluator` comment above the entry, matching the Phase 38 / Phase 20 comment style.

**Count-bump pattern** — `tests/router.lifecycle.test.mjs:155` asserts `manifest.files.length === 259`. Adding one deployed module increments the count. Update the assertion and the explanatory comment block (lines 148-154) to reflect the new total. Each new module adds 2 to the count (one per runtime root via the flatMap).

---

### `tests/router.authority.test.mjs` (NEW — AUTH-01/02 unit tests)

**Analog:** `tests/router.intent.test.mjs`

**Test scaffold pattern** (lines 1-9):
```javascript
import assert from 'node:assert/strict';
import test from 'node:test';

const classifyModule = import('../src/intent/classify.mjs');

async function classify(prompt) {
  const { classifyIntent } = await classifyModule;
  return classifyIntent(prompt);
}
```
Mirror this exactly, swapping in `import('../src/intent/authority.mjs')` and an `authority(prompt, { intent })` helper that calls `classifyAuthority`.

**Test-case-array pattern** (lines 11-34) — one `test()` per AUTH-01 class + AUTH-02 framing, iterating an array of prompt strings and asserting `{ authority_class, reason_code }`. Copy the `for (const prompt of cases) { ... assert.equal(..., `expected ... for: ${prompt}`) }` loop shape — it gives per-prompt failure localization without one test per string.

**Adversarial framing cases** (AUTH-02) — mirror the adversarial style already present in `tests/router.intent-adversarial.test.mjs` (quoted/negated/hypothetical). Add cases for `EXAMPLE_FRAMING` ("e.g. autonomously finish it"), `RETROSPECTIVE_FRAMING` ("earlier you autonomously..."), `POLICY_DISCUSSION` ("the policy says autonomously...") — each must classify as `non_authorizing_discussion` even when `classifyIntent` returned `execute`.

---

### `tests/router.authority-policy.test.mjs` (NEW — AUTH-03 independence-invariant tests)

**Analog:** `tests/router.approval.test.mjs`

**Fixture-builder pattern** (lines 12-66 of approval test):
```javascript
import { buildCapabilityContract } from '../src/registry/contract.mjs';
import { stableCapabilityId, contentFingerprint } from '../src/registry/identity.mjs';
import { buildClaudeHeavyProfile, contractEvidence } from './helpers/inventory-fixture.mjs';

function makeCapability({ name = 'atlas', sideEffects, reversibility, risk, ...rest } = {}) {
  const base = buildClaudeHeavyProfile()[0];
  const record = { ...base, name, canonical_identity: `router/${name}`, ...rest };
  const evidence = contractEvidence(record, 'workflow-transitions');
  evidence.reversibility[0].value = reversibility ?? 'reversible';
  evidence.risk[0].value = risk ?? 'low';
  if (sideEffects !== undefined) evidence.side_effects[0].value = sideEffects;
  else evidence.side_effects[0].value = [];
  evidence.workflow_transitions[0].value = ['gsd.execute'];
  return { ...record, contract: buildCapabilityContract(record, evidence) };
}
```
Reuse this helper to build contracts with varying `risk`/`reversibility`/`side_effects` for the policy evaluator inputs.

**Independence-invariant tests (AUTH-03)** — two load-bearing assertions:
1. `low` confidence + full authority + reversible + local + fit → `proceed` (low confidence never blocks an authorized reversible local action).
2. `high` confidence + no authority → `block` (high confidence never grants authority).
Plus: a `weights` object passed alongside must NOT change the decision (assert the evaluator ignores it — pass a `weights` field in the input object and assert the decision is unchanged when `weights.score` flips).

**Sealed-input test** — assert that calling `evaluateAuthorityPolicy({ confidence: 'high', authority, risk, compatibility, weights: { score: 999 } })` produces the same decision as `weights: { score: 0 }` (AUTH-03 invariant).

---

### `tests/router.authority-gate.test.mjs` (NEW — AUTH-04/05 integration)

**Analog:** `tests/router.actions.test.mjs`

**Fixture + registry pattern** (lines 1-30 of actions test):
```javascript
import { buildCapabilityContract } from '../src/registry/contract.mjs';
import { stableCapabilityId } from '../src/registry/identity.mjs';
import { buildClaudeHeavyProfile, contractEvidence } from './helpers/inventory-fixture.mjs';

const classifyModule = import('../src/intent/classify.mjs');
const actionsModule = import('../src/orchestrator/actions.mjs');

function makeCapability({ name = 'atlas', workflowTransitions = ['gsd.execute'], ...rest } = {}) {
  // ... builds a ready, eligible record with contract
}
```
Reuse `makeCapability` + a `registryWith(records, eligibilityById)` helper (see `tests/router.approval.test.mjs:53-66`) to assemble the `resolveAction` input, then call `gateAction({ resolved, policy, approval })`.

**Integration assertions (AUTH-04/05):**
- medium + explicit + reversible + local + fit → `{ status: 'proceed', dispatch_eligible: true }` (no repeat-command requirement).
- protected effect (e.g. `side_effects: ['deployed']`) → `{ status: 'paused', dispatch_eligible: false, approval_token: <bound> }` — assert `approval_token` is a non-empty string and that `verifyApproval` with a mismatched presented token returns `approval_mismatch` (fail-closed).
- low-fit → `{ status: 'blocked' | 'clarify' }` (reuses existing `resolveAction` outcome — no re-implementation).
- `paused` is recoverable: bind a token, present it via `verifyApproval`, assert `{ status: 'approved' }` resumes (never a terminal block).

---

### `tests/router.approval.test.mjs` (EXTEND — AUTH-05 expanded vocab)

**Analog:** self — current `needsApproval` tests (lines 68-80)

**Existing pattern to follow:**
```javascript
test('[phase23-red:approval] needsApproval true when side_effects contains destructive (EXEC-07)', async () => {
  const { needsApproval } = await approvalModule;
  const destructive = makeCapability({ name: 'destructive-cap', sideEffects: ['destructive'] });
  assert.equal(needsApproval(destructive.contract), true);
});
```
Add one new `test()` per AUTH-05 token: `credentialed`, `billing`, `publication`, `deploy`/`deployed`/`deployment`, `push`/`pr`, `costly`, `scope-expanding`, `difficult-to-recover` (the last via `reversibility: 'irreversible'` already covered, but add an explicit token test). Keep the `[phase23-red:approval]` prefix on existing tests; new tests use a `[phase39:approval]` prefix to mark the AUTH-05 extension. Do not modify existing test bodies — append only.

---

### `tests/router.lifecycle.test.mjs` (EXTEND — deployed-file count bump)

**Analog:** self — count assertion at line 155

**Current assertion** (lines 148-155):
```javascript
    //   = 259
    assert.equal(manifest.files.length, 259);
```
**Change pattern:** increment `259` by 2 (one module × two runtime roots via the `moduleValues` flatMap at `router-lifecycle.mjs:418-420`). Update the explanatory comment block (lines 148-154) to add a `+ 2 = 1 new module (src/intent/authority.mjs) × 2 roots (Phase 39 AUTH-01..05)` line. If other phases have landed modules since 259 was set, account for those too — read the current count before finalizing the number.

---

## Shared Patterns

### Pure-function policy module shape
**Source:** `src/intent/classify.mjs:1-18,53-107` + `src/orchestrator/approval.mjs:1-19,43-58`
**Apply to:** `src/intent/authority.mjs`

Every policy module in this codebase follows the same skeleton:
1. Header comment naming the phase + requirement IDs + purity invariant.
2. `export const <POLICY>_POLICY_VERSION = '<name>-v1';`
3. `Object.freeze`d vocabulary arrays/sets at module top.
4. Module-level regex constants (no constructor side effects).
5. A pure `export function` taking `(input, { options } = {})`, returning `{ status/disposition/decision, reason_code, policy_version, ...facts }`.
6. No `eval`/`Function`, no prompt retention, no disk I/O, no `spawn`.

```javascript
export const AUTHORITY_POLICY_VERSION = 'authority-policy-v1';
export const AUTHORITY_CLASSES = Object.freeze([ /* ... */ ]);
export const PROTECTED_EFFECT_TOKENS = Object.freeze([ /* ... */ ]);

export function classifyAuthority(prompt, { intent } = {}) { /* pure */ }
export function evaluateAuthorityPolicy({ confidence, authority, risk, compatibility } = {}) { /* pure */ }
```

### Reason-code vocabulary (cross-cutting)
**Source:** `src/orchestrator/approval.mjs:120-151` + `src/orchestrator/actions.mjs:28-36,49-55`
**Apply to:** all new + modified policy/test files

Every gate returns `{ status, dispatch_eligible, reason_code, ...facts }` with a distinct snake_case `reason_code` per leg. Phase 39 adds: `compatibility_unfit`, `protected_effect_requires_confirmation`, `authority_not_granted`, `reversible_local_authorized`, `non_reversible_or_external_requires_confirmation`, `low_confidence_clarify`, `persistent_goal_marker`, `inspection_marker`, `abstaining_disposition`. Never overload an existing reason_code with a new meaning.

### Fail-open hot-path wrapper
**Source:** `src/runtime/router.mjs` (route-suggestion assembly) + `.claude/CLAUDE.md` Fail-open
**Apply to:** `src/runtime/router.mjs` policy wiring

Any throw inside the policy call → exit 0, no `additionalContext`. The hook must never erase a prompt (`decision: "block"` is forbidden). A `pause`/`ask` policy decision is surfaced as a suggestion in `additionalContext` (sentinel-wrapped `<!-- router-inject ... -->`), never as a hook block.

### Independent-input invariant (AUTH-03)
**Source:** RESEARCH Pattern 3 + Pitfall 1
**Apply to:** `src/intent/authority.mjs` `evaluateAuthorityPolicy`, `src/runtime/router.mjs` wiring

The evaluator takes a sealed `{ confidence, authority, risk, compatibility }` object. The `confidence` field is the tier STRING (`'high'|'medium'|'low'`), never the numeric `confidenceTier` score and never `weights`. The authority and risk legs cannot read confidence or weights — only the `confidence` string is passed, and only to modulate suggestion strength, never to permit. Tests must assert: (a) low+auth+reversible+local → `proceed`; (b) high+no-auth → `block`; (c) flipping a `weights.score` field does not change the decision.

### Deploy-bundle parity (HOST-03)
**Source:** `src/lifecycle/router-lifecycle.mjs:384-420`
**Apply to:** `src/lifecycle/router-lifecycle.mjs` `moduleNames` append + `tests/router.lifecycle.test.mjs` count bump

Every new module MUST be added to the `moduleNames` array. The existing `moduleValues` flatMap deploys each entry to BOTH `ownedRoot` and `codexOwnedRoot`. Forgetting the array entry (or adding it to only one root) breaks HOST-03 parity. The lifecycle test's `manifest.files.length` assertion is the regression backstop — bump it by 2 per new module.

### Test-file scaffold
**Source:** `tests/router.intent.test.mjs:1-9`, `tests/router.approval.test.mjs:1-18`, `tests/router.actions.test.mjs:1-30`
**Apply to:** all 3 new test files

```javascript
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCapabilityContract } from '../src/registry/contract.mjs';
import { stableCapabilityId } from '../src/registry/identity.mjs';
import { buildClaudeHeavyProfile, contractEvidence } from './helpers/inventory-fixture.mjs';

const <module> = import('../src/<path>.mjs');
// fixture builder reusing buildClaudeHeavyProfile + contractEvidence
// test('[<tag>:<area>] <behavior>', async () => { ... })
```
Use `for (const prompt of cases) { ... assert.equal(..., `expected ... for: ${prompt}`) }` for per-case localization. Tag new tests `[phase39:authority]` / `[phase39:authority-policy]` / `[phase39:authority-gate]`; do NOT retag existing tests.

## No Analog Found

None. Every new/modified file has an exact or self analog in the codebase. This phase is composition + vocabulary expansion over existing primitives, per RESEARCH §Summary.

## Metadata

**Analog search scope:**
- `src/intent/classify.mjs` (read in full, 108 lines)
- `src/orchestrator/approval.mjs` (read in full, 152 lines)
- `src/orchestrator/actions.mjs` (read in full, 220 lines)
- `src/lifecycle/router-lifecycle.mjs` (targeted reads: lines 1-80, 380-420)
- `src/runtime/router.mjs` (grep for `confidenceTier`, lines 1821-1840)
- `tests/router.intent.test.mjs` (targeted read, lines 1-80)
- `tests/router.approval.test.mjs` (targeted read, lines 1-80)
- `tests/router.actions.test.mjs` (targeted read, lines 1-30)
- `tests/router.lifecycle.test.mjs` (targeted read, lines 148-162)

**Files scanned:** 9 source/test files + 2 planning files (CONTEXT.md, RESEARCH.md)
**Pattern extraction date:** 2026-08-06

## PATTERN MAPPING COMPLETE

**Phase:** 39 - intent-authority-risk-and-invocation-policy
**Files classified:** 10 (2 new src + 4 modify + 3 new tests + 2 extend tests; counted as 8 distinct artifacts minus duplicates)
**Analogs found:** 8 / 8

### Coverage
- Files with exact analog: 8
- Files with role-match analog: 0
- Files with no analog: 0

### Key Patterns Identified
- Pure-function policy module shape: `export const *_POLICY_VERSION` + `Object.freeze`d vocabulary + pure `export function` returning `{ status/disposition/decision, reason_code, policy_version }` (from `src/intent/classify.mjs` + `src/orchestrator/approval.mjs`).
- Layered taxonomy: `classifyAuthority` consumes `classifyIntent`'s 8-disposition output and emits a 5-class authority class — layer, never replace (preserves 159 existing intent tests per Pitfall 2).
- Sealed-input independence invariant: `evaluateAuthorityPolicy({ confidence, authority, risk, compatibility })` cannot read `weights` or numeric `confidenceTier` (AUTH-03).
- Vocabulary centralization: `PROTECTED_EFFECT_TOKENS` lives in `src/intent/authority.mjs`; `approval.mjs` imports it (single source of truth for the AUTH-05 protected class).
- Deploy-bundle parity: append one line to `moduleNames` → flatMap deploys to both runtimes → bump lifecycle test count by 2 (HOST-03 regression backstop).
- Fail-open hot-path: any policy throw → exit 0, no `additionalContext`; `pause`/`ask` surfaced as sentinel-wrapped suggestions, never `decision: "block"`.

### File Created
`/Users/guilherme/Desktop/ClaudeCode/Router-build/.planning/phases/39-intent-authority-risk-and-invocation-policy/39-PATTERNS.md`

### Ready for Planning
Pattern mapping complete. Planner can now reference analog patterns in PLAN.md files.