# Phase 39: Intent, Authority, Risk, and Invocation Policy - Research

**Researched:** 2026-08-06
**Domain:** Deterministic prompt-time authority policy over a BM25 router + native-dispatch foundation
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None — discuss was skipped per `workflow.skip_discuss`.

### Claude's Discretion
All implementation choices are at the agent's discretion. Use the ROADMAP goal, success criteria, and existing codebase conventions to guide decisions.

### Deferred Ideas (OUT OF SCOPE)
None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | An operator's prompt is deterministically classified as advice, inspection, one-turn action, persistent-goal action, or non-authorizing discussion before any capability can execute. | Expand the existing regex classifier (`src/intent/classify.mjs`) into a 5-class authority taxonomy layered over the existing 8-disposition abstention set; see Pattern 1. |
| AUTH-02 | Quotations, examples, negations, hypotheticals, retrospective audits, and policy discussion cannot create or widen execution authority, including phrases such as "autonomously" or "finish it" used as text. | The existing precedence chain (prohibition → quoted → hypothetical → negated → preview → explain → execute) already abstains on these framings; add example/audit/policy framing detection and autonomous-wording-as-text guards; see Pattern 2. |
| AUTH-03 | Route confidence, execution authority, effect risk, and capability compatibility are evaluated independently, and no confidence or historical-success value can grant permission. | New authority-policy evaluator composes 4 independent inputs; confidence (BM25 `confidenceTier`) and weights (`weights.json`) are explicitly barred from the authority leg; see Pattern 3. |
| AUTH-04 | A medium-confidence, explicitly authorized, reversible local action validates capability fit and proceeds without requiring the operator to repeat the command; low-fit or conflicting evidence blocks or asks. | Proceed/pause/ask gate over the 4 independent inputs; reuses `resolveAction` + `needsApproval(false)` proceed path, adds explicit fit-validation gate; see Pattern 4. |
| AUTH-05 | External, privileged, destructive, difficult-to-recover, credentialed, billing, publication, deployment, push/PR, or materially scope-expanding effects pause for explicit host-mediated confirmation. | Expand the protected-effect vocabulary in `needsApproval`/eligibility beyond the current destructive/irreversible/high set; emit a pause/clarify outcome that surfaces host-mediated confirmation; see Pattern 5. |
</phase_requirements>

## Summary

Phase 39 builds the deterministic authority/risk/invocation policy that sits between the existing BM25 route suggestion (Phase 1+) and the native dispatch foundation (Phase 38). The codebase already contains four of the five primitives this phase needs: a regex intent classifier with an 8-disposition abstention set and a proven precedence chain (`src/intent/classify.mjs`); an approval gate with destructive/irreversible/high-risk vocabulary and fail-closed token verification (`src/orchestrator/approval.mjs`); a capability contract with typed `permissions`/`side_effects`/`reversibility`/`risk` fields and a `dispatch-candidate` vs `recommendation-only` disposition (`src/registry/contract.mjs`); and a dispatch adapter contract whose `Receipt` already carries `intent`/`authority`/`risk` string fields with a `paused` state reserved for protected-effect pauses (`src/adapters/dispatch/contract.mjs`). Phase 38 also proved the hot-path budget holds with dispatch wired (warm p95 ≤25ms, p99 ≤50ms, max <100ms; injection ≤120 tokens).

The work is therefore primarily **composition and vocabulary expansion**, not greenfield invention. AUTH-01 needs a 5-class authority taxonomy (`advice`/`inspection`/`one-turn-action`/`persistent-goal-action`/`non-authorizing-discussion`) layered over the existing 8 dispositions, preserving the 19 passing intent tests (10 + 9). AUTH-02 is largely already satisfied by the precedence chain; the gaps are example/audit/policy framing and autonomous-wording-as-text. AUTH-03 needs a new authority-policy evaluator that takes confidence, authority, risk, and compatibility as four independent inputs and explicitly cannot read confidence or historical-success weights into the authority leg. AUTH-04/AUTH-05 need a proceed/pause/ask gate that reuses the existing approval gate for protected effects and broadens its trigger vocabulary to the AUTH-05 list.

**Primary recommendation:** Add two stdlib-only modules — an authority-taxonomy layer over `classifyIntent` (AUTH-01/02) and an authority-policy evaluator composing confidence ⊥ authority ⊥ risk ⊥ compatibility (AUTH-03/04/05) — wired into the route suggestion and action-mapper paths. Do not add an LLM, a new data file, or a per-prompt spawn. Reuse the existing `paused` receipt state and `verifyApproval` token flow for host-mediated confirmation.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Prompt intent classification (AUTH-01/02) | Hook / prompt-time pure function | — | Must run <100ms, no LLM, on every prompt; regex-deterministic like the existing `classifyIntent`. |
| Authority evaluation (AUTH-03) | Hook / prompt-time pure function | Action-mapper (on invocation) | Composes 4 independent inputs deterministically; the independence invariant must hold on both the suggestion path and the gating path. |
| Effect-risk evaluation (AUTH-05) | Registry contract layer | Action-mapper / approval gate | `contract.fields.risk`/`side_effects`/`reversibility` are the source of truth; the approval gate reads them. |
| Capability compatibility (AUTH-03/04) | Registry eligibility + contract disposition | Action-mapper | `eligibility` gates and `contract.disposition` (dispatch-candidate vs recommendation-only) already exist. |
| Proceed/pause/ask gate (AUTH-04/05) | Action-mapper | Dispatch adapter (receipt `paused` state) | `resolveAction` returns selected/blocked/clarify; the adapter's `paused` receipt state is the durable pause primitive. |
| Host-mediated confirmation (AUTH-05) | Approval gate + model surface | — | `verifyApproval` token flow; the model presents the confirmation request via `additionalContext`; operator authorizes. |
| Dispatch execution (post-gate) | Native dispatch adapter | — | Phase 38 foundation; unchanged — Phase 39 only gates the `action` before it reaches `invoke()`. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js stdlib (`node:crypto`, `node:fs`, `node:path`, `node:os`) | built-in (Node ≥18) | All I/O, hashing, JSON | Zero dependencies. The hook is a single `.mjs` with no `node_modules`. Mandated by project constraints. `[VERIFIED: .claude/CLAUDE.md Recommended Stack]` |
| `src/intent/classify.mjs` (existing) | `intent-policy-v1` | Regex-deterministic 8-disposition classifier | Already shipped Phase 23; 10 tests in `router.intent.test.mjs` + 9 adversarial; the abstention foundation for AUTH-02. `[VERIFIED: src/intent/classify.mjs:4-18]` |
| `src/orchestrator/approval.mjs` (existing) | `approval-policy-v1` | Destructive/irreversible/high-risk detection + SHA-256 approval token bind/verify | Already shipped Phase 23; 19 tests; fail-closed verification. The AUTH-05 host-mediated confirmation primitive. `[VERIFIED: src/orchestrator/approval.mjs:12-19,43-58]` |
| `src/registry/contract.mjs` (existing) | `contract-policy-v1` | Typed `permissions`/`side_effects`/`reversibility`/`risk` fields; `dispatch-candidate` vs `recommendation-only` disposition | Source of truth for effect risk; `validateContractFieldValue` + `validateCapabilityContract` enforce enum validity. `[VERIFIED: src/registry/contract.mjs:4-19,56-59]` |
| `src/adapters/dispatch/contract.mjs` (existing) | `DISPATCH_CONTRACT_VERSION=1` | `buildReceipt` with `intent`/`authority`/`risk` string fields; `RECEIPT_STATES` includes `paused` | Phase 38 foundation; the `paused` state is the reserved AUTH-05 pause primitive. `[VERIFIED: src/adapters/dispatch/contract.mjs:19-35,50-73]` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `src/orchestrator/actions.mjs` (existing) | `action-policy-v1` | `resolveAction` maps execute intent → one capability; returns selected/blocked/clarify | The proceed/ask gate composition point; already gates on `intent.dispatch_eligible`. `[VERIFIED: src/orchestrator/actions.mjs:16,165-219]` |
| `src/registry/eligibility.mjs` (existing) | `eligibility-policy-v1` | Gates: side_effects/reversibility/risk/permission; `recommendation_only` flag when any gate fails | The compatibility input for AUTH-03. `[VERIFIED: src/registry/eligibility.mjs:154-189]` |
| `src/runtime/router.mjs` `confidenceTier` (existing) | — | BM25 high/med/low from `T_high`/`T_low`/`M` thresholds | The confidence input for AUTH-03 — must remain independent of authority. `[VERIFIED: src/runtime/router.mjs:1825-1840]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Layered 5-class taxonomy over existing 8 dispositions | Replace the 8 dispositions with the 5 classes | Breaks 19 passing intent tests (10 + 9) and loses the finer abstention granularity that AUTH-02 needs. Layering preserves both. |
| New `authority-policy.mjs` module | Inline the policy in `router.mjs` main | `router.mjs` is already 3849 lines; a pure exported module is testable in isolation (matches the `classify.mjs`/`approval.mjs` pattern). |
| Regex framing detection for examples/audits/policy | LLM-based framing detection | Violates the no-LLM/<100ms constraints. Regex is what AUTH-02 already relies on and is provably sufficient. |
| `paused` receipt state for AUTH-05 | A new `pending_confirmation` state | `paused` is already reserved for exactly this (`RECEIPT_STATES` comment: "protected-effect pause"). `[VERIFIED: src/adapters/dispatch/contract.mjs:28-31]` |

**Installation:**
```bash
# No npm install. Stdlib-only. No new dependencies.
# New modules ship as .mjs files under src/intent/ and src/orchestrator/ and
# are deployed via the existing lifecycle bundle (src/lifecycle/router-lifecycle.mjs moduleNames).
```

**Version verification:** Not applicable — no external packages. All "libraries" are in-repo modules with pinned `*_policy_version` constants.

## Package Legitimacy Audit

This phase installs no external packages. All code is Node.js stdlib + in-repo modules. Per CLAUDE.md "What NOT to Use": no npm dependencies in v1, no native modules, no per-prompt LLM. `[VERIFIED: .claude/CLAUDE.md Recommended Stack + What NOT to Use]`

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none) | — | — | — | — | — | stdlib-only — no audit needed |

**Packages removed due to SLOP verdict:** none
**Packages flagged as suspicious SUS:** none

## Architecture Patterns

### System Architecture Diagram

```
                          UserPromptSubmit hook (src/runtime/router.mjs)
                                      │  (<100ms, fail-open, no LLM)
                                      ▼
                  ┌─────────────────────────────────────────────┐
                  │  1. classifyIntent(prompt)                  │  AUTH-01/02
                  │     8-disposition abstention set             │  (existing)
                  │     + 5-class authority taxonomy             │  (NEW layer)
                  ▼                                             │
                  │  2. BM25 + confidenceTier                    │  confidence
                  │     + weights (historical success)          │  input (AUTH-03)
                  ▼                                             │
                  │  3. authorityPolicy(                        │  (NEW — AUTH-03/04/05)
                  │       intent, confidence,                   │
                  │       contract{risk,side_fx,rev,perm},      │  risk + compat
                  │       eligibility,                          │   inputs
                  │       explicitAuthorization)                │  authority input
                  │   → { proceed | pause | ask | block }       │
                  ▼                                             │
                  │  4. resolveAction(intent, registry, state) │  (existing)
                  │     → selected | blocked | clarify          │
                  ▼                                             │
                  │  5. needsApproval(contract)                 │  AUTH-05
                  │     + expanded protected-effect vocab        │  (expanded)
                  ▼                                             │
                  │  6. formatInjection(route, policy)          │  → additionalContext
                  │     ≤120 tokens, sentinel-wrapped            │
                  └─────────────────────────────────────────────┘
                                      │
                                      ▼
                          additionalContext (suggestion only)
                                      │
                                      ▼  (model invokes a slash/skill/agent)
                          Action-mapper / Dispatch gate
                                      │
                    ┌─────────────────┼──────────────────┐
                    ▼                 ▼                    ▼
              proceed            pause                ask (clarify)
              (reversible,       (protected effect)   (low-fit / conflict)
               local, fit)             │
                    │                  ▼
                    ▼            host-mediated
              NativeDispatch      confirmation
              (Phase 38)          (verifyApproval)
                    │                  │
                    ▼                  ▼
              Receipt              Receipt{state:'paused'}
              {state:'completed'}      → operator token
                                      → resume → completed
```

The primary use case traces from prompt input through the 6-step policy pipeline to a `proceed`/`pause`/`ask` decision. `proceed` reaches the Phase 38 dispatch adapter and a `completed` receipt. `pause` diverts to host-mediated confirmation (`verifyApproval`); only a presented+fresh token resumes to dispatch. `ask` returns a `clarify` outcome. Every branch fails open (hook exits 0, prompt passes through) on any internal error.

### Recommended Project Structure
```
src/
├── intent/
│   ├── classify.mjs          # existing: 8-disposition abstention (AUTH-02 foundation)
│   └── authority.mjs         # NEW: 5-class taxonomy + authority-policy evaluator
├── orchestrator/
│   ├── approval.mjs          # existing: expand protected-effect vocab (AUTH-05)
│   ├── actions.mjs           # existing: wire proceed/pause/ask gate (AUTH-04)
│   ├── select.mjs            # existing: unchanged
│   └── transitions.mjs       # existing: unchanged
├── registry/
│   └── contract.mjs          # existing: unchanged (already has the typed fields)
├── adapters/
│   └── dispatch/
│       ├── contract.mjs      # existing: paused state (AUTH-05 primitive)
│       └── claude.mjs        # existing: receives action.intent/authority/risk
└── runtime/
    └── router.mjs            # existing: wire authorityPolicy into the pipeline
tests/
├── router.intent.test.mjs             # existing: 10 tests (preserve)
├── router.intent-adversarial.test.mjs # existing: 9 tests (preserve)
├── router.approval.test.mjs           # existing: 19 tests (preserve)
├── router.authority.test.mjs          # NEW: AUTH-01/02 taxonomy tests
├── router.authority-policy.test.mjs   # NEW: AUTH-03/04/05 policy tests
└── router.authority-gate.test.mjs      # NEW: proceed/pause/ask integration tests
```

### Pattern 1: Layered 5-class authority taxonomy (AUTH-01)
**What:** A pure function `classifyAuthority(prompt, { intent })` maps the existing 8-disposition classifier output plus new inspection/advice/persistent-goal detection into exactly one of `advice`, `inspection`, `one_turn_action`, `persistent_goal_action`, `non_authorizing_discussion`.
**When to use:** On every prompt, before capability execution is possible. Runs after `classifyIntent` (reuses its abstention verdict).
**Why layer, not replace:** The 8 dispositions carry the AUTH-02 abstention granularity (quoted/negated/hypothetical/prohibited/preview) that the 5-class taxonomy collapses into `non_authorizing_discussion`. Replacing would lose the abstention tests; layering preserves them.

The mapping (existing disposition → authority class):
- `execute` → `one_turn_action` OR `persistent_goal_action` (disambiguate via persistent-goal markers: "until done", "keep going", "finish it all", "autonomously... until", lease-style language). Default: `one_turn_action`.
- `explain` → `advice`
- `hypothetical`/`quoted`/`negated`/`prohibited`/`preview`/`ambiguous` → `non_authorizing_discussion`
- NEW `inspection` class: detected via inspection markers (`inspect`, `show`, `list`, `what does X have`, `status`, `audit`, `review`, `diagnose`) that do NOT carry an execute verb. Inspection authorizes read-only capability invocation, not mutation.

```javascript
// Source: derived from src/intent/classify.mjs:9-18 (INTENT_DISPOSITIONS) and :76-107 (precedence chain)
// The existing frozen disposition set this layers over:
//   ['execute','explain','hypothetical','quoted','negated','prohibited','preview','ambiguous']
// AUTH-01 5-class taxonomy:
export const AUTHORITY_CLASSES = Object.freeze([
  'advice',                  // explain — read-only guidance
  'inspection',              // NEW — read-only capability invocation
  'one_turn_action',         // execute without persistent-goal markers
  'persistent_goal_action',  // execute WITH persistent-goal markers (Phase 40 lease precursor)
  'non_authorizing_discussion', // hypothetical/quoted/negated/prohibited/preview/ambiguous
]);

const PERSISTENT_GOAL_MARKERS = /\b(until\s+done|keep\s+going|finish\s+(?:it\s+)?all|autonomously\b.*\buntil|end-to-end|all\s+the\s+way|don'?t\s+stop)\b/i;
const INSPECTION_ONLY = /\b(inspect|show|list|what\s+(?:does|do|is)|status|audit|diagnose|inventory|coverage|health)\b/i;

export function classifyAuthority(prompt, { intent } = {}) {
  const text = typeof prompt === 'string' ? prompt : '';
  const disposition = intent?.disposition || 'ambiguous';
  // AUTH-02: abstaining dispositions never authorize execution
  if (['hypothetical','quoted','negated','prohibited','preview','ambiguous'].includes(disposition)) {
    return { authority_class: 'non_authorizing_discussion', disposition, reason_code: 'abstaining_disposition' };
  }
  if (disposition === 'explain') return { authority_class: 'advice', disposition, reason_code: 'explain_marker' };
  if (disposition === 'execute') {
    if (PERSISTENT_GOAL_MARKERS.test(text)) {
      return { authority_class: 'persistent_goal_action', disposition, reason_code: 'persistent_goal_marker' };
    }
    return { authority_class: 'one_turn_action', disposition, reason_code: 'one_turn_action' };
  }
  // Inspection: read-only markers without an execute verb
  if (INSPECTION_ONLY.test(text) && !/\b(run|execute|start|create|fix|ship|deploy|plan)\b/i.test(text)) {
    return { authority_class: 'inspection', disposition: 'ambiguous', reason_code: 'inspection_marker' };
  }
  return { authority_class: 'non_authorizing_discussion', disposition, reason_code: 'no_authority_marker' };
}
```

### Pattern 2: Autonomous-wording-as-text guard (AUTH-02)
**What:** Ensure "autonomously", "finish it", "just do it", "without asking" grant authority ONLY when they appear as the operator's live instruction, never when they appear inside a quotation, example, audit, or policy discussion.
**When to use:** Inside `classifyAuthority`, after the existing `classifyIntent` precedence chain has run.
**Why this works:** The existing precedence chain (prohibition → quoted → hypothetical → negated → preview → explain → execute) already short-circuits to an abstaining disposition before `execute` is reached whenever a framing marker is present. `[VERIFIED: src/intent/classify.mjs:76-86]`. So "autonomously finish it" inside a quoted block already classifies as `quoted` → `non_authorizing_discussion`. The guard only needs to cover framings the regex does not yet detect: unquoted examples ("e.g. autonomously..."), retrospective audits ("earlier you autonomously..."), and policy discussion ("the policy says autonomously...").

```javascript
// Source: extends src/intent/classify.mjs:76-86 precedence chain
// Framings that turn autonomous wording into non-authorizing text:
const EXAMPLE_FRAMING = /\b(e\.?g\.|for example|such as|like when|suppose you|imagine you)\b/i;
const RETROSPECTIVE_FRAMING = /\b(earlier|previously|last time|before you|yesterday|in the past|you (?:already|just))\b/i;
const POLICY_DISCUSSION = /\b(the policy|policy says|rule says|per the rules|according to|should (?:you|the router))\b/i;
const AUTONOMOUS_WORDING = /\b(autonomously|without asking|just do it|don'?t ask|no confirmation|unattended)\b/i;

// If autonomous wording appears inside a non-authorizing framing, authority is denied
// even when classifyIntent returned 'execute' (e.g. an example that did not trigger QUOTED).
export function autonomousWordingIsText(text, disposition) {
  if (!AUTONOMOUS_WORDING.test(text)) return false;
  return EXAMPLE_FRAMING.test(text) || RETROSPECTIVE_FRAMING.test(text)
    || POLICY_DISCUSSION.test(text) || disposition !== 'execute';
}
```

### Pattern 3: Independent-input authority policy evaluator (AUTH-03)
**What:** A pure function `evaluateAuthorityPolicy({ confidence, authority, risk, compatibility })` returns a proceed/pause/ask/block decision where the four inputs are structurally independent — confidence and historical-success weights are never readable by the authority or risk legs.
**When to use:** After the route suggestion is computed and before the action-mapper commits to dispatch.
**Why:** AUTH-03 mandates that "no confidence or historical-success value can grant permission." The current code already separates `confidenceTier` (router.mjs), `contract.fields.risk`/`side_effects`/`reversibility` (contract.mjs), `eligibility` (eligibility.mjs), and `workflow_transitions` authority (actions.mjs). The evaluator formalizes the independence invariant.

```javascript
// Source: composes src/runtime/router.mjs:1825-1840 (confidenceTier),
//         src/registry/contract.mjs:56-59 (risk/reversibility enums),
//         src/registry/eligibility.mjs:154-189 (gates),
//         src/orchestrator/approval.mjs:17-19 (protected-effect vocab)
// The four inputs are passed as a sealed object so the evaluator cannot
// reach into confidence or weights for the authority/risk decisions.

export const AUTHORITY_POLICY_VERSION = 'authority-policy-v1';

// Verbatim enums the evaluator reads (do not redefine — import from source):
//   reversibility: 'unknown' | 'reversible' | 'irreversible'  [contract.mjs:57]
//   risk:          'unknown' | 'low' | 'medium' | 'high' | 'critical' | 'unacceptable' [contract.mjs:58]
//   confidence:    'high' | 'medium' | 'low'                   [router.mjs:1825-1840]

export function evaluateAuthorityPolicy({ confidence, authority, risk, compatibility } = {}) {
  // AUTH-03: confidence NEVER grants authority. Only authority + risk + compatibility
  // can permit a proceed. Confidence only modulates the SUGGESTION strength, never the gate.
  const authGranted = authority?.granted === true;       // explicit authorization
  const authSource = authority?.source || 'none';        // 'explicit' | 'lease' | 'none'
  const riskLevel = risk?.level || 'unknown';            // from contract.fields.risk
  const reversible = risk?.reversible === 'reversible';
  const local = risk?.scope === 'local';
  const protected_ = risk?.protected === true;           // AUTH-05 protected class
  const compatOk = compatibility?.eligible === true;    // eligibility gates all passed
  const compatDisp = compatibility?.disposition;         // 'dispatch-candidate' | 'recommendation-only'

  // AUTH-03: historical success (weights) is never an input here. Pass it out separately.
  if (!compatOk || compatDisp !== 'dispatch-candidate') {
    return { decision: 'block', reason_code: 'compatibility_unfit', confidence, protected_: !!protected_ };
  }
  if (protected_) {
    // AUTH-05: protected effects ALWAYS pause, regardless of confidence or authority source.
    return { decision: 'pause', reason_code: 'protected_effect_requires_confirmation', confidence, auth_source: authSource };
  }
  if (!authGranted) {
    return { decision: 'block', reason_code: 'authority_not_granted', confidence };
  }
  // AUTH-04: medium-confidence + explicit + reversible + local + fit → proceed
  if (reversible && local && (confidence === 'high' || confidence === 'medium')) {
    return { decision: 'proceed', reason_code: 'reversible_local_authorized', confidence, auth_source: authSource };
  }
  // Irreversible or non-local even with authority → pause (AUTH-05: difficult-to-recover / external)
  if (!reversible || !local) {
    return { decision: 'pause', reason_code: 'non_reversible_or_external_requires_confirmation', confidence, auth_source: authSource };
  }
  // Low confidence with authority + reversible + local → ask (AUTH-04: low-fit blocks or asks)
  return { decision: 'ask', reason_code: 'low_confidence_clarify', confidence, auth_source: authSource };
}
```

### Pattern 4: Proceed/pause/ask gate composition (AUTH-04)
**What:** Wire `evaluateAuthorityPolicy` into `resolveAction` (or a thin wrapper) so the existing selected/blocked/clarify outcomes map to proceed/pause/ask, and a `proceed` reaches the dispatch adapter without requiring the operator to repeat the command.
**When to use:** On the action-mapper path, after `resolveAction` returns `selected`.
**Why:** AUTH-04 mandates that a medium-confidence explicitly-authorized reversible local action proceeds after fit validation "without requiring the operator to repeat the command." The route injection + model invocation already provides the single authorization; the gate must not re-demand it.

```javascript
// Source: composes src/orchestrator/actions.mjs:138-149 (selectOne) and
//         src/orchestrator/approval.mjs:43-58 (needsApproval)
// The proceed path reuses the existing selectOne 'selected' outcome;
// the pause path reuses needsApproval's protected-effect detection;
// the ask path reuses selectOne's 'clarify' outcome.

export function gateAction({ resolved, policy, approval }) {
  // resolved = resolveAction(...) → { status, dispatch_eligible, reason_code, capability? }
  if (resolved.status === 'blocked' || resolved.status === 'clarify') {
    return { ...resolved, policy }; // low-fit or conflicting evidence already blocked/clarified
  }
  // status === 'selected' → apply the authority policy
  if (policy.decision === 'proceed') {
    return { status: 'proceed', dispatch_eligible: true, reason_code: policy.reason_code, capability: resolved.capability, policy };
  }
  if (policy.decision === 'pause') {
    // AUTH-05: bind an approval token; the model surfaces confirmation to the operator.
    const bound = approval?.bind ? approval.bind({ capability: resolved.capability }) : null;
    return { status: 'paused', dispatch_eligible: false, reason_code: policy.reason_code, capability: resolved.capability, approval_token: bound, policy };
  }
  if (policy.decision === 'ask') {
    return { status: 'clarify', dispatch_eligible: false, reason_code: policy.reason_code, policy };
  }
  return { status: 'blocked', dispatch_eligible: false, reason_code: policy.reason_code, policy };
}
```

### Pattern 5: Expanded protected-effect vocabulary (AUTH-05)
**What:** Expand the trigger set in `needsApproval` (and the eligibility gates) to cover the AUTH-05 protected classes. The current vocabulary is `destructive`/`unbounded`/`external`/`privileged` (side_effects) + `irreversible` (reversibility) + `high`/`critical`/`unacceptable` (risk). `[VERIFIED: src/orchestrator/approval.mjs:17-19]`. AUTH-05 adds: difficult-to-recover, credentialed, billing, publication, deployment, push/PR, materially scope-expanding.
**When to use:** Whenever a capability contract is evaluated for dispatch.
**Why:** AUTH-05's list is broader than the current destructive/irreversible/high set. The `side_effects` field is a string list (`validateContractFieldValue` accepts a `string[]`), so the expanded vocabulary is added as recognized tokens, not a new field. `[VERIFIED: src/registry/contract.mjs:46-55,69-75]`.

The AUTH-05 protected-effect classes (verbatim from REQUIREMENTS.md:21 and ROADMAP.md:68):
```
external, privileged, destructive, difficult-to-recover, credentialed,
billing, publication, deployment, push/PR, materially scope-expanding
```
Plus the success-criterion-5 list (ROADMAP.md:68): `protected, costly, published, deployed`.

```javascript
// Source: expands src/orchestrator/approval.mjs:17-19 and src/registry/eligibility.mjs:165-175
// Current vocab (VERIFIED approval.mjs:17-19):
//   DESTRUCTIVE_SIDE_EFFECTS = Set(['destructive','unbounded','external','privileged'])
//   IRREVERSIBLE = Set(['irreversible'])
//   HIGH_RISK = Set(['high','critical','unacceptable'])
// AUTH-05 expansion (added tokens):
export const PROTECTED_EFFECT_TOKENS = Object.freeze([
  // existing
  'destructive', 'unbounded', 'external', 'privileged',
  // AUTH-05 additions
  'difficult-to-recover', 'credentialed', 'billing',
  'publication', 'published', 'deploy', 'deployed', 'deployment',
  'push', 'pr', 'costly', 'scope-expanding',
]);

export function isProtectedEffect(contract) {
  const sideEffects = knownValue({ contract }, 'side_effects') || [];
  const reversibility = knownValue({ contract }, 'reversibility');
  const risk = knownValue({ contract }, 'risk');
  const text = JSON.stringify(sideEffects).toLowerCase();
  if (PROTECTED_EFFECT_TOKENS.some(t => text.includes(t))) return true;
  if (reversibility === 'irreversible') return true;     // 'difficult-to-recover'
  if (['high','critical','unacceptable'].includes(risk)) return true;
  return false;
}
```

### Anti-Patterns to Avoid
- **Letting confidence upgrade authority:** A high BM25 score or a strong historical-success weight must never turn a `block`/`pause` into a `proceed`. AUTH-03 makes this a hard invariant. Do not pass `weights` or `confidenceTier` into the authority/risk evaluation legs. `[ASSUMED — this is the AUTH-03 invariant the new evaluator enforces]`
- **Replacing the 8-disposition classifier:** The 8 dispositions carry the AUTH-02 abstention granularity. Replacing them with the 5 classes would drop quoted/negated/hypothetical/prohibited/preview as distinct abstention reasons and break 19 existing tests (10 + 9). Layer, do not replace. `[VERIFIED: tests/router.intent.test.mjs has 10 tests; router.intent-adversarial.test.mjs has 9]`
- **Adding an LLM to the prompt path:** The hook must stay <100ms with no per-prompt LLM call. AUTH-01/02 are explicitly deterministic. `[VERIFIED: .claude/CLAUDE.md "What NOT to Use" + HOST-04]`
- **Auto-rebuilding or scanning inside the hook:** The prompt path is read-only and fail-open. Authority policy must read cached contract/eligibility state, not scan the filesystem. `[VERIFIED: src/runtime/router.mjs hot-path invariants, 38-03-SUMMARY.md Test 4/4b]`
- **Treating a `pause` as a block:** AUTH-05 says "pause for host-mediated confirmation," not "block." A pause is recoverable via an approval token; a block is terminal. Use the existing `paused` receipt state, not a new terminal state. `[VERIFIED: src/adapters/dispatch/contract.mjs:28-31]`
- **Using `decision: "block"` to enforce confirmation:** The router hook must never erase a prompt (exit 2). Confirmation is surfaced as a `pause`/`clarify` suggestion in `additionalContext`, never as a hook block. `[VERIFIED: .claude/CLAUDE.md "Fail-open" + hook contract]`

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Approval token bind/verify | Custom HMAC/token scheme | `approval.mjs` `bindApproval`/`verifyApproval` (SHA-256, fail-closed) | Already shipped Phase 23; 19 tests; ASVS V6 compliance. `[VERIFIED: src/orchestrator/approval.mjs:65-151]` |
| Intent abstention (quoted/negated/hypothetical) | New framing detectors | `classifyIntent` existing regex precedence chain | Already handles AUTH-02's quotations/negations/hypotheticals; 19 tests. `[VERIFIED: src/intent/classify.mjs:37-107]` |
| Effect-risk vocabulary storage | New contract field | `contract.fields.side_effects`/`reversibility`/`risk` (typed enums) | `validateContractFieldValue` already enforces enum validity; `dispatch-candidate` vs `recommendation-only` disposition already gates. `[VERIFIED: src/registry/contract.mjs:56-59,69-75,372-380]` |
| Receipt persistence | New receipt store | `dispatch/receipt.mjs` `ReceiptStore` (atomic publish + append) | Phase 38 foundation; `paused` state already reserved. `[VERIFIED: src/adapters/dispatch/contract.mjs:33-35]` |
| Capability compatibility check | Re-implement gates | `eligibility.mjs` `evaluateEligibility` (8 gates) | Already returns `eligible` + `recommendation_only` + `reason_codes`. `[VERIFIED: src/registry/eligibility.mjs:154-189]` |
| Confidence tiering | Re-implement thresholds | `confidenceTier` (T_high/T_low/M) | Already produces high/med/low; calibration is epoch-gated. `[VERIFIED: src/runtime/router.mjs:1825-1840]` |

**Key insight:** This phase's risk is in the *composition and vocabulary expansion*, not in building new primitives. Every primitive the five AUTH requirements need already exists in the codebase with tests. The new code is a thin evaluator + taxonomy layer that wires them together under the AUTH-03 independence invariant.

## Runtime State Inventory

This phase is additive (new modules + vocabulary expansion), not a rename/refactor/migration. No stored data, service config, OS state, secrets, or build artifacts carry the old vocabulary in a way that requires migration — the protected-effect vocabulary is additive (new tokens recognized; existing tokens unchanged).

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `cache.json` route entries carry `invoke_kind` (slash/skill/agent/warn) — unchanged. `[VERIFIED: src/runtime/router.mjs:613]` | None — cache schema unchanged. |
| Live service config | None — the router hook is stateless w.r.t. user code. | None. |
| OS-registered state | None — hook binding in `~/.claude/settings.json` unchanged. | None. |
| Secrets/env vars | None — no new secrets. | None. |
| Build artifacts | Lifecycle bundle (`src/lifecycle/router-lifecycle.mjs` `moduleNames`) must include the new `src/intent/authority.mjs` module. `[VERIFIED: 38-03-SUMMARY.md deploy bundle pattern]` | Add the new module(s) to `moduleNames` so they deploy to both `ownedRoot` and `codexOwnedRoot`. |

## Common Pitfalls

### Pitfall 1: Confidence leaking into the authority decision
**What goes wrong:** A high BM25 score or a strong `weights.json` entry silently turns a `block`/`pause` into a `proceed`, violating AUTH-03.
**Why it happens:** The route suggestion already computes confidence and weights on the same hot path; it is tempting to fold them into the gate.
**How to avoid:** The authority-policy evaluator takes a sealed `{ confidence, authority, risk, compatibility }` object. The authority and risk legs do not receive `weights` or `confidenceTier` as inputs — only `confidence` (the tier string) is passed, and only to modulate suggestion strength, never to permit. Add a test that asserts a `low` confidence with full authority + reversible + local still `proceed`s, and a `high` confidence with no authority still `block`s.
**Warning signs:** A test where raising `weights[entryId].score` changes a `block` to a `proceed`.

### Pitfall 2: Breaking the 19 passing intent tests (10 + 9)
**What goes wrong:** Expanding or rewriting `classifyIntent` to emit the 5 classes directly breaks `router.intent.test.mjs` (10 tests) and `router.intent-adversarial.test.mjs` (9 tests) that assert the 8 dispositions. `[VERIFIED: tests/router.intent.test.mjs:10 tests, router.intent-adversarial.test.mjs:9 tests]`
**Why it happens:** The 5-class taxonomy looks like a "better" replacement.
**How to avoid:** Layer — keep `classifyIntent` returning the 8 dispositions unchanged; add `classifyAuthority` as a separate function that consumes the disposition and produces the 5-class authority class. The 8-disposition tests stay green; new tests cover the 5-class layer.
**Warning signs:** Any edit to `src/intent/classify.mjs` lines 9-107 (the frozen dispositions, regexes, or precedence chain).

### Pitfall 3: Autonomous wording treated as live authorization
**What goes wrong:** "autonomously finish it" inside a quoted example or retrospective audit grants persistent-goal authority.
**Why it happens:** The existing `EXECUTE_VERB` regex includes `finish` and `continue`, so "finish it" matches `execute` unless a higher-precedence framing marker fires first. `[VERIFIED: src/intent/classify.mjs:51]`
**How to avoid:** Rely on the existing precedence chain (quoted → execute abstains) and add `EXAMPLE_FRAMING`/`RETROSPECTIVE_FRAMING`/`POLICY_DISCUSSION` detection in `classifyAuthority` that demotes to `non_authorizing_discussion` even when `classifyIntent` returned `execute` (the example-without-quotes case).
**Warning signs:** A test where `"e.g. autonomously finish it"` classifies as `persistent_goal_action` instead of `non_authorizing_discussion`.

### Pitfall 4: Bloating the prompt-path latency budget
**What goes wrong:** The authority-policy evaluator pushes warm p95 above 25ms or max above 100ms, violating HOST-04. `[VERIFIED: 38-03-SUMMARY.md Test 1]`
**Why it happens:** The evaluator runs on every prompt; if it re-reads contract/eligibility from disk or scans, it blows the budget.
**How to avoid:** The evaluator is a pure function over already-loaded state (the route suggestion already loaded the manifest, mode-map, and cached contract/eligibility). No new disk reads. Add a latency assertion to the budget test (`tests/phase-38/budget.test.mjs` pattern) covering the authority-policy call.
**Warning signs:** A `readFileSync` or `spawn` inside `evaluateAuthorityPolicy` or `classifyAuthority`.

### Pitfall 5: Treating inspection as action
**What goes wrong:** An inspection prompt (`show me the routes`) triggers a mutating capability.
**Why it happens:** `INSPECTION_ONLY` markers overlap with `EXECUTE_VERB` markers (e.g. `review`, `audit` appear in both).
**How to avoid:** `classifyAuthority` requires `INSPECTION_ONLY` to match AND no execute verb to match for the `inspection` class. When both match, the existing `classifyIntent` `execute` disposition wins and `classifyAuthority` produces `one_turn_action` — but the authority policy then gates on the contract's `side_effects` (a read-only capability's `side_effects` is empty) so it still proceeds only if the capability is non-mutating. The contract is the backstop, not the classifier.
**Warning signs:** A test where `show me the routes` dispatches a capability whose `side_effects` includes `destructive`.

### Pitfall 6: New module not deployed to both runtimes
**What goes wrong:** The new `src/intent/authority.mjs` ships to `~/.claude/router/modules/` but not `~/.codex/router/modules/`, breaking HOST-03 parity. `[VERIFIED: 38-03-SUMMARY.md deploy bundle — moduleValues flatMap deploys to both ownedRoot and codexOwnedRoot]`
**Why it happens:** The `moduleNames` list is the deploy source of truth; forgetting to add the new module means it never reaches one or both runtimes.
**How to avoid:** Add the new module(s) to `moduleNames` in `src/lifecycle/router-lifecycle.mjs`; the existing `moduleValues` flatMap deploys every entry to both roots. Update the lifecycle test's deployed-file count assertion (Rule 3).
**Warning signs:** `tests/router.lifecycle.test.mjs` deployed-file count assertion failing.

## Code Examples

### Example 1: Existing classifier invocation (reuse pattern)
```javascript
// Source: src/intent/classify.mjs:67-107 (classifyIntent) + tests/router.intent.test.mjs
import { classifyIntent } from '../src/intent/classify.mjs';

// AUTH-02 abstention already handled here:
const intent = classifyIntent("don't run the deploy");
// → { disposition: 'negated', dispatch_eligible: false, reason_code: 'negation_marker', ... }

const executeIntent = classifyIntent('run the next phase');
// → { disposition: 'execute', dispatch_eligible: true, reason_code: 'explicit_execute_verb', ... }
```

### Example 2: Existing approval gate (reuse pattern)
```javascript
// Source: src/orchestrator/approval.mjs:43-58 (needsApproval) + :65-151 (bind/verify)
import { needsApproval, bindApproval, verifyApproval } from '../src/orchestrator/approval.mjs';

// needsApproval reads contract.fields.side_effects/reversibility/risk
// DESTRUCTIVE_SIDE_EFFECTS = Set(['destructive','unbounded','external','privileged'])  [VERIFIED approval.mjs:17]
// IRREVERSIBLE = Set(['irreversible'])                                                  [VERIFIED approval.mjs:18]
// HIGH_RISK = Set(['high','critical','unacceptable'])                                  [VERIFIED approval.mjs:19]
const requires = needsApproval(capability.contract);
// → true when any protected token is present
```

### Example 3: Existing receipt with intent/authority/risk (integration point)
```javascript
// Source: src/adapters/dispatch/contract.mjs:50-73 (buildReceipt) + claude.mjs:152-154
// The dispatch adapter already threads these string fields from the action:
//   intent: String(action?.intent || ''),
//   authority: String(action?.authority || ''),
//   risk: String(action?.risk || ''),
// [VERIFIED src/adapters/dispatch/claude.mjs:152-154]
// Phase 39 populates these from evaluateAuthorityPolicy rather than the fixture.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 8-disposition intent classifier (execute/explain/hypothetical/quoted/negated/prohibited/preview/ambiguous) | Layered 5-class authority taxonomy over the 8 dispositions | Phase 39 (this phase) | AUTH-01 satisfied; 8-disposition abstention preserved for AUTH-02. |
| Destructive/irreversible/high-risk approval vocabulary | Expanded AUTH-05 protected-effect vocabulary (credentialed/billing/publication/deployment/push-PR/scope-expanding) | Phase 39 | AUTH-05 satisfied; existing tokens unchanged. |
| Confidence + weights inform the route suggestion only | Confidence + weights explicitly barred from the authority/risk gate | Phase 39 | AUTH-03 independence invariant enforced. |
| Phase 38 dispatch with fixture-populated intent/authority/risk strings | Phase 39 policy-populated intent/authority/risk strings + proceed/pause/ask gate | Phase 39 | AUTH-04/05 gating before dispatch. |

**Deprecated/outdated:**
- Treating any high-confidence route as automatically dispatchable: superseded by AUTH-03. Confidence is suggestion-strength only.
- The Phase 38 fixture's hardcoded `action.intent`/`authority`/`risk` strings: superseded by policy-evaluator output in Phase 39 (the fixture remains as a test harness).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The 5-class taxonomy (advice/inspection/one-turn-action/persistent-goal-action/non-authorizing-discussion) is the correct AUTH-01 interpretation. | Pattern 1 | If the user intended a different 5-class set, the taxonomy module needs renaming. Low risk — the names come from the success criterion 1 verbatim. `[CITED: ROADMAP.md:64]` |
| A2 | "Host-mediated confirmation" means the model surfaces the confirmation request to the operator via `additionalContext`, and the operator authorizes via an approval token (not a hook block). | Pattern 4/5 | If the user intended a different mechanism (e.g., a CLI prompt), the gate composition changes. Medium risk — the hook cannot block (fail-open), so a model-surfaced confirmation is the only viable path. `[CITED: .claude/CLAUDE.md Fail-open + hook contract]` |
| A3 | The authority-policy evaluator runs on the prompt hot path (pure, <1ms) AND on the action-mapper path. | Pattern 3 | If it only runs on the action-mapper path, the route suggestion would not carry the policy decision. Low risk — running it on both paths is cheap (pure function). `[ASSUMED]` |
| A4 | The existing `classifyIntent` regex set is sufficient for AUTH-02's example/audit/policy framing once `classifyAuthority` adds the framing detectors. | Pattern 2 | If new framings need deeper parsing, a regex may be insufficient. Low risk — AUTH-02 is explicitly deterministic and the existing regex set already handles the majority case. `[ASSUMED]` |
| A5 | Inspection class authorizes read-only capability invocation only (no mutation). | Pattern 1 | If inspection should also authorize some mutations, the gate changes. Low risk — "inspection" semantically means read-only. `[CITED: AUTH-01 success criterion 1]` |

## Open Questions (RESOLVED)

1. **Where exactly does the authority-policy gate run — inside `router.mjs` main() or inside `resolveAction`?**
   - What we know: The route suggestion is built in `router.mjs` main(); `resolveAction` lives in `actions.mjs` and is called from the orchestrator path.
   - What's unclear: Whether Phase 39 wires the gate into the hook's route suggestion (so the suggestion carries a `pause`/`ask` hint) or only into the action-mapper (so dispatch is gated post-suggestion).
   - Recommendation: Wire it in both — the suggestion carries the policy decision as a hint (`additionalContext` notes "paused: confirm X"), and the action-mapper enforces it. The hook never blocks; the gate is advisory in the suggestion and enforceable in the mapper. — RESOLVED: adopted; Plan 02 wires the dual-path (suggestion hint + enforceable action-mapper gate).

2. **Does persistent-goal-action require a lease (Phase 40) to proceed, or does Phase 39 only classify it?**
   - What we know: AUTH-01 only requires *classification*; LEASE-02 (Phase 40) requires "only an explicit outcome-persistent instruction creates a project-goal lease."
   - What's unclear: Whether a `persistent_goal_action` classification in Phase 29 [39] proceeds, pauses, or blocks absent a lease.
   - Recommendation: Phase 39 classifies it; without a lease (Phase 40 not yet built), it should `pause` (cannot grant persistent authority without a lease). This keeps Phase 39 forward-compatible with Phase 40. `[CITED: AUTH-01 vs LEASE-02]` — RESOLVED: adopted; Phase 39 classifies only, no lease creation (deferred to Phase 40).

3. **Should the expanded protected-effect vocabulary live in `approval.mjs` or a new `authority.mjs` constant?**
   - What we know: The current vocabulary is hardcoded in `approval.mjs:17-19`.
   - What's unclear: Whether to expand in place (minimal change) or centralize in the new authority module.
   - Recommendation: Define the expanded `PROTECTED_EFFECT_TOKENS` in the new `src/intent/authority.mjs` and have `approval.mjs` import it, so the authority policy is the single source of truth for the protected class. — RESOLVED: adopted; PROTECTED_EFFECT_TOKENS lives in authority.mjs, imported by approval.mjs (Plan 02 Task 1).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (≥18) | Hook runtime | ✓ | `/Users/guilherme/.hermes/node/bin/node` | — |
| Node.js stdlib | All modules | ✓ | built-in | — |
| Existing `src/intent/classify.mjs` | AUTH-01/02 | ✓ | `intent-policy-v1` | — |
| Existing `src/orchestrator/approval.mjs` | AUTH-05 | ✓ | `approval-policy-v1` | — |
| Existing `src/registry/contract.mjs` | AUTH-03/05 | ✓ | `contract-policy-v1` | — |
| Existing `src/adapters/dispatch/contract.mjs` | AUTH-05 pause | ✓ | `DISPATCH_CONTRACT_VERSION=1` | — |
| `rtk` test runner | Validation | ✓ | per config | `node --test` |

**Missing dependencies with no fallback:** none
**Missing dependencies with fallback:** none

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` + `node:assert/strict` |
| Config file | none (inline `test()` calls; `rtk node --test tests/*.test.mjs`) |
| Quick run command | `rtk node --test tests/router.intent.test.mjs tests/router.intent-adversarial.test.mjs tests/router.approval.test.mjs tests/router.actions.test.mjs` |
| Full suite command | `rtk node --test tests/*.test.mjs` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | 5-class authority classification over 8 dispositions | unit | `rtk node --test tests/router.authority.test.mjs` | ❌ Wave 0 |
| AUTH-01 | inspection class detected without execute verb | unit | `rtk node --test tests/router.authority.test.mjs` | ❌ Wave 0 |
| AUTH-02 | autonomous wording in example/audit/policy framing abstains | unit (adversarial) | `rtk node --test tests/router.authority.test.mjs` | ❌ Wave 0 |
| AUTH-02 | existing 8-disposition abstention preserved (no regression) | regression | `rtk node --test tests/router.intent.test.mjs tests/router.intent-adversarial.test.mjs` | ✅ existing |
| AUTH-03 | confidence never grants authority (low+auth → proceed, high+no-auth → block) | unit | `rtk node --test tests/router.authority-policy.test.mjs` | ❌ Wave 0 |
| AUTH-03 | historical-success weight never changes a block to proceed | unit | `rtk node --test tests/router.authority-policy.test.mjs` | ❌ Wave 0 |
| AUTH-04 | medium+explicit+reversible+local+fit → proceed without repeat | unit | `rtk node --test tests/router.authority-gate.test.mjs` | ❌ Wave 0 |
| AUTH-04 | low-fit or conflicting → block or ask | unit | `rtk node --test tests/router.authority-gate.test.mjs` | ❌ Wave 0 |
| AUTH-05 | protected effect → pause (not block) | unit | `rtk node --test tests/router.authority-gate.test.mjs` | ❌ Wave 0 |
| AUTH-05 | expanded vocab (credentialed/billing/publication/deploy/push-PR/scope) triggers pause | unit | `rtk node --test tests/router.approval.test.mjs` (extended) | ✅ extend existing |
| HOST-04 (regression) | warm p95 ≤25ms / max <100ms with policy wired | perf | `rtk node --test tests/router.perf.test.mjs` + budget test | ✅ existing (extend) |
| Lifecycle (regression) | new module deploys to both runtimes | lifecycle | `rtk node --test tests/router.lifecycle.test.mjs` | ✅ existing (count bump) |

### Sampling Rate
- **Per task commit:** quick run command (intent + adversarial + approval + actions tests)
- **Per wave merge:** `rtk node --test tests/router.authority*.test.mjs tests/router.intent*.test.mjs tests/router.approval.test.mjs tests/router.actions.test.mjs`
- **Phase gate:** full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/router.authority.test.mjs` — covers AUTH-01/02 (5-class taxonomy + autonomous-wording-as-text)
- [ ] `tests/router.authority-policy.test.mjs` — covers AUTH-03 (independence invariant)
- [ ] `tests/router.authority-gate.test.mjs` — covers AUTH-04/05 (proceed/pause/ask integration)
- [ ] Extend `tests/router.approval.test.mjs` — covers AUTH-05 expanded protected-effect vocabulary
- [ ] `src/intent/authority.mjs` — new module (classifyAuthority + evaluateAuthorityPolicy + PROTECTED_EFFECT_TOKENS)
- [ ] Add `src/intent/authority.mjs` to `src/lifecycle/router-lifecycle.mjs` `moduleNames` + bump lifecycle test count

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No user auth in this phase; operator identity is assumed by the host. |
| V3 Session Management | partial (lease precursor) | Phase 39 classifies persistent-goal-action but does not create leases (Phase 40). No session token handling. |
| V4 Access Control | yes | Authority policy is an access-control gate: capability invocation requires explicit authority + fit + non-protected effect (or confirmation). |
| V5 Input Validation | yes | Prompt classification is input validation over untrusted prompt text. Regex-deterministic, no `eval`/`Function`, no prompt retention. `[VERIFIED: src/intent/classify.mjs — pure function, no eval]` |
| V6 Cryptography | yes (reuse) | Approval token uses `node:crypto` SHA-256 (`bindApproval`); never hand-roll. `[VERIFIED: src/orchestrator/approval.mjs:65-85]` |
| V7 Error Handling | yes | Fail-open on any internal error (hook exits 0, prompt passes through). Fail-closed on approval (missing/stale/mismatch token → blocked). `[VERIFIED: src/orchestrator/approval.mjs:120-151]` |

### Known Threat Patterns for the Router authority stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection via quoted/example framing ("autonomously finish it" in a quote) | Spoofing / Elevation of privilege | Precedence chain: quoted/hypothetical/negated abstain before execute. `[VERIFIED: src/intent/classify.mjs:76-86]` + new framing detectors. |
| Confidence-derived authority (high BM25 score grants permission) | Elevation of privilege | AUTH-03 independence invariant: confidence is not an input to the authority/risk legs. |
| Stale approval token (bound to old args) | Tampering | `verifyApproval` re-derives `expected` via `bindApproval` over current args; stale → `approval_stale`. `[VERIFIED: src/orchestrator/approval.mjs:133-145]` |
| Missing approval token (no `expected` presented) | Repudiation | Fail-closed: `approval_expected_missing` reason code; never approve. `[VERIFIED: src/orchestrator/approval.mjs:136-139]` |
| Protected effect bypass (capability's `side_effects` omits the protected token) | Tampering | Contract `validateContractFieldValue` enforces enum validity; eligibility gates independently re-check. `[VERIFIED: src/registry/contract.mjs:69-89, src/registry/eligibility.mjs:165-175]` |
| Multilingual prompt mis-routing (Portuguese "execute a próxima fase") | Spoofing | `MULTILINGUAL` regex abstains as `ambiguous` before execute. `[VERIFIED: src/intent/classify.mjs:50,101-103]` |
| Raw prompt text leakage into telemetry | Information disclosure | Telemetry uses sha256 prompt signatures, never raw text. `[VERIFIED: src/runtime/router.mjs cache key, .claude/CLAUDE.md privacy]` |
| Hook blocking on policy exception | Denial of service | Fail-open: any throw → exit 0, no `additionalContext`. `[VERIFIED: .claude/CLAUDE.md Fail-open]` |

## Sources

### Primary (HIGH confidence)
- `src/intent/classify.mjs` — read directly: 8 dispositions, precedence chain, regex set, `classifyIntent` pure function. `[VERIFIED: src/intent/classify.mjs:4-107]`
- `src/orchestrator/approval.mjs` — read directly: `needsApproval`/`bindApproval`/`verifyApproval`, protected-effect vocabulary, fail-closed token flow. `[VERIFIED: src/orchestrator/approval.mjs:12-151]`
- `src/registry/contract.mjs` — read directly: `CONTRACT_FIELDS`, `ENUM_FIELDS` (reversibility/risk enums), `validateContractFieldValue`, `dispatch-candidate`/`recommendation-only` disposition. `[VERIFIED: src/registry/contract.mjs:4-59,69-89,372-380]`
- `src/registry/eligibility.mjs` — read directly: 8 gates including side_effects/reversibility/risk/permission, `recommendation_only` flag. `[VERIFIED: src/registry/eligibility.mjs:154-189]`
- `src/adapters/dispatch/contract.mjs` — read directly: `buildReceipt` with intent/authority/risk fields, `RECEIPT_STATES` including `paused`. `[VERIFIED: src/adapters/dispatch/contract.mjs:19-73]`
- `src/adapters/dispatch/claude.mjs` — read directly: `action.intent`/`authority`/`risk` threaded into receipt. `[VERIFIED: src/adapters/dispatch/claude.mjs:152-154,200-202]`
- `src/orchestrator/actions.mjs` — read directly: `resolveAction` selected/blocked/clarify, `intent.dispatch_eligible` gate. `[VERIFIED: src/orchestrator/actions.mjs:16,165-219]`
- `src/runtime/router.mjs` — read directly: `confidenceTier`, `ROUTE_INVOKE_KINDS`, hot-path structure, dispatch trigger. `[VERIFIED: src/runtime/router.mjs:613,1825-1840]`
- `.planning/REQUIREMENTS.md` — AUTH-01..05 verbatim. `[VERIFIED: .planning/REQUIREMENTS.md:17-21]`
- `.planning/ROADMAP.md` — Phase 39 goal + success criteria. `[VERIFIED: .planning/ROADMAP.md:57-68]`
- `.planning/phases/38-cross-runtime-native-feasibility/38-03-SUMMARY.md` — Phase 38 dispatch foundation, budget, deploy bundle. `[VERIFIED]`
- `.claude/CLAUDE.md` — Recommended stack, constraints, "What NOT to Use", fail-open, hook contract. `[VERIFIED]`
- `tests/router.intent.test.mjs` (10 tests), `tests/router.intent-adversarial.test.mjs` (9 tests), `tests/router.approval.test.mjs` (19 tests), `tests/router.actions.test.mjs` (22 tests) — existing test coverage to preserve. `[VERIFIED: grep counts]`

### Secondary (MEDIUM confidence)
- None — all findings are from in-repo source read this session.

### Tertiary (LOW confidence)
- None — no training-data-only claims used for authoritative recommendations.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all modules read directly this session; versions are in-repo `*_policy_version` constants.
- Architecture: HIGH — the 4 existing primitives (classifier, approval, contract, dispatch) were read and their integration points verified; the 2 new modules follow established patterns (`classify.mjs`/`approval.mjs`).
- Pitfalls: HIGH — 6 pitfalls identified from the actual codebase (19 intent tests (10 + 9), hot-path budget, precedence chain, deploy bundle); each verified against a specific file/line.
- AUTH-01 5-class taxonomy names: MEDIUM — derived from the success-criterion-1 wording; the exact class names are an `[ASSUMED]` interpretation (A1).

**Research date:** 2026-08-06
**Valid until:** 2026-09-05 (30 days — stable in-repo code; no external package versions to drift)