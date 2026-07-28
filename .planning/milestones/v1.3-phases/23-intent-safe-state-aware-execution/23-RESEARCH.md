# Phase 23: Intent-Safe State-Aware Execution - Research

**Researched:** 2026-07-27
**Domain:** Deterministic intent classification, state-aware workflow transition resolution, framework-neutral capability dispatch, and approval-bound execution authority
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None — discuss phase was skipped via `workflow.skip_discuss`. The ROADMAP phase goal, success criteria, and REQUIREMENTS.md INT-01..06 + EXEC-01..10 are the spec.

### Claude's Discretion
All implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions. [VERIFIED: `23-CONTEXT.md`]

### Deferred Ideas (OUT OF SCOPE)
None — discuss phase skipped. Phase-23-relevant deferrals from Phase 22's CONTEXT.md are explicit:
- Outcome learning and capability-health scoring belong to Phase 24.
- Advisory recommendations and draft capability changes belong to Phase 25.
- Prompt-time hot-path integration (compiling intent rules into the read-only index, REL-01/REL-02) belongs to Phase 26.
[VERIFIED: `22-CONTEXT.md`]
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INT-01 | Router deterministically classifies prompts as execute, explain, hypothetical, quoted/example, negated, prohibited, preview, or ambiguous using a compiled local policy. | New `src/intent/classify.mjs` with a versioned, deterministic rule policy. No LLM, no embeddings — regex/keyword/structure rules compiled at build time. [VERIFIED: `REQUIREMENTS.md`, `.claude/CLAUDE.md` "no per-prompt LLM API call"] |
| INT-02 | Only an explicit positive execute classification can enter action selection; every other classification sets `dispatch_eligible: false`. | Intent result gates `selectWorkflow`; non-execute outcomes return `dispatch_eligible: false` with a stable reason code and never reach `selectCapabilities`. [VERIFIED: `src/orchestrator/transitions.mjs#selectWorkflow`, `src/orchestrator/select.mjs#selectCapabilities`] |
| INT-03 | Explanations, comparisons, questions, hypotheticals, quotations, code blocks, examples, negations, prohibitions, conditions, and ambiguous requests never invoke a capability. | The classifier must produce one of the eight enumerated non-execute dispositions for each of these shapes; an adversarial fixture corpus asserts the negative (no invocation occurred). [VERIFIED: `REQUIREMENTS.md` INT-03, INT-06] |
| INT-04 | The newest explicit user instruction overrides stale conversational hints and recovered workflow state. | Reuse `src/context/resolve.mjs#resolveContextAction` override path (`explicit_instruction_override`) and the `supersession` record; the intent classifier reads the newest prompt, not capsule history. [VERIFIED: `src/context/resolve.mjs`, `src/context/prompt-route.mjs#overrideCapsule`] |
| INT-05 | Uncertain compatibility, intent, state, permissions, dependencies, or side effects produces abstention, one focused clarification, or a non-executing recommendation. | Reuse the `clarify`/`blocked` outcome vocabulary already in `resolve.mjs` and `selectWorkflow`; one focused question per clarification. [VERIFIED: `src/context/resolve.mjs#clarify`, `src/orchestrator/transitions.mjs#clarification`] |
| INT-06 | Adversarial fixtures cover minimal pairs, nested quotations, mixed negation, corrections, conditional language, multilingual prompts, unsafe targets, and assertions that prohibited invocations did not occur. | New `tests/router.intent-adversarial.test.mjs` oracle with minimal-pair prompts and negative invocation assertions (the dispatcher is never called for non-execute dispositions). [VERIFIED: `REQUIREMENTS.md` INT-06; test pattern: `tests/router.contract-eligibility.test.mjs`] |
| EXEC-01 | Router resolves natural-language actions against normalized contracts for the capabilities currently installed, never against hard-coded GSD, Gstack, or other framework command names. | Action resolution reads each capability's `contract.fields.workflow_transitions` envelope (Phase 22 output) and the active registry; it must NOT read `src/orchestrator/workflow-declarations.json` hardcoded `owners`/`compatible` lists as authority. [VERIFIED: `src/registry/contract.mjs#CONTRACT_FIELDS`, `src/orchestrator/workflow-declarations.json`, `22-06-SUMMARY.md`] |
| EXEC-02 | "Go to the next phase" discovers authoritative project state, identifies the unique valid next transition, and invokes the safest compatible installed capability. | `src/context/sources.mjs#readStateSource` already parses STATE.md position/status; `src/orchestrator/transitions.mjs#nextValidTransitions` already evaluates authoritative evidence. New action-mapping layer derives the unique transition and resolves to one contract-passing capability. [VERIFIED: `src/context/sources.mjs`, `src/orchestrator/transitions.mjs`] |
| EXEC-03 | "There is a bug" or "debug this" selects the compatible installed debugging capability according to contract, state, scope, and dependency health. | Map the debug action verb to the `debugging`/`troubleshooting` semantic category in `contract.fields.purpose`/`triggers`, then filter by `evaluateEligibility` gates (dependency_closure, scope, permission). [VERIFIED: `src/registry/eligibility.mjs#evaluateEligibility`, `src/registry/contract.mjs`] |
| EXEC-04 | "Create a phase about X" discovers current phase numbering and lifecycle state, then invokes the compatible installed phase-creation capability with the derived next number and supplied topic. | Read ROADMAP phase numbering via `readRoadmapSource` and STATE.md current_phase; derive next number; match capabilities whose contract `workflow_transitions` includes the phase-creation transition; pass the topic as a structured argument. [VERIFIED: `src/context/sources.mjs#readRoadmapSource`, `src/registry/contract.mjs`] |
| EXEC-05 | Automatic dispatch requires fresh authoritative state, exactly one eligible transition, healthy dependencies, valid structured arguments, runtime permission, scope authorization, and all applicable safety gates. | Compose `nextValidTransitions` (freshness=fresh, exactly one candidate) + `selectWorkflow` (unique_valid_transition) + `selectCapabilities` (closure safe) + `evaluateEligibility` (all gates passed). Each already returns `dispatch_eligible`/`reason_code`. [VERIFIED: `src/orchestrator/transitions.mjs`, `src/orchestrator/select.mjs`, `src/registry/eligibility.mjs`] |
| EXEC-06 | Ties, stale or contradictory state, terminal workflows, unresolved gaps, missing dependencies, material side effects, or human-required checkpoints prevent automatic dispatch. | Reuse existing blocked reason codes: `material_transition_tie`, `authoritative_evidence_stale`, `terminal_workflow`, `required_gate_missing`, `dependency_unavailable`, `dependency_conflict`. Add new codes for material side effects and human checkpoints. [VERIFIED: `src/orchestrator/transitions.mjs#clarification`, `src/registry/eligibility.mjs`] |
| EXEC-07 | Destructive, external, privileged, ambiguous, or difficult-to-reverse actions require an approval distinct from execute intent. | New approval gate consuming contract `side_effects`, `reversibility`, `risk`, `permissions` envelopes. Execute intent alone never satisfies approval; a separately bound approval token is required. [VERIFIED: `src/registry/contract.mjs#ENUM_FIELDS` (reversibility, risk), `src/registry/eligibility.mjs#evaluateEligibility`] |
| EXEC-08 | Approval is bound to the exact capability fingerprint, arguments, targets, effects, and proposal version; stale or mismatched approval fails closed. | New approval token reuses `contentFingerprint`/`stableStringify` to bind capability fingerprint + argument hash + target IDs + effects hash + proposal version. Mismatch → `approval_stale`/`approval_mismatch` reason code, `dispatch_eligible: false`. [VERIFIED: `src/registry/identity.mjs#contentFingerprint`, `src/registry/schema.mjs#stableStringify`] |
| EXEC-09 | Router never elevates Claude or Codex permissions, bypasses sandbox/tool restrictions, treats discovery as authorization, or invokes lifecycle hooks as task tools. | Hard invariant: `record.type === 'hook'` is never selected as a task capability (already enforced in `select.mjs` — hooks only appear as `lifecycle_bindings`, not `invokable_capabilities`). Discovery records are not authority. [VERIFIED: `src/orchestrator/select.mjs#resolveDependencies` (excludes hook/model/permission from invokable_capabilities), `.claude/CLAUDE.md` "Selecting hooks mid-task"] |
| EXEC-10 | After completing work, Router continues to recommend the correct next locally available capability and provides a ready-to-use prompt without assuming a framework-specific command. | Re-run `nextValidTransitions` on fresh post-work state; emit a framework-neutral prompt built from the selected capability's `invocation` shape (not a hardcoded `/gsd-...` slash). New `src/orchestrator/next-prompt.mjs` or extend `select.mjs`. [VERIFIED: `src/orchestrator/transitions.mjs`, `src/registry/contract.mjs`] |
</phase_requirements>

## Summary

Phase 23 is the dispatch-authority layer that sits on top of Phase 22's contract/eligibility output and Phase 21's authoritative registry. Phase 22 already decides whether a capability is *eligible* (recommendation-only vs. dispatch-eligible) from contract-field envelopes and typed relationships. Phase 23 decides whether the user's prompt *should* dispatch right now: it classifies intent deterministically, reads fresh authoritative workflow state, resolves the unique valid transition, selects one contract-passing locally installed capability, and binds a separate approval token for destructive/privileged actions. It is additive — it consumes the Phase 21 registry and Phase 22 contracts/relationships/eligibility artifacts and must not duplicate them. [VERIFIED: `22-CONTEXT.md` deferred ideas, `22-06-SUMMARY.md`, `src/registry/eligibility.mjs`]

The central modeling decision is that intent and approval are distinct from eligibility. A capability can be fully eligible and still not dispatch because (a) the prompt is not an explicit positive execute request, (b) authoritative workflow state is stale or terminal, (c) more than one valid transition exists, or (d) the action is destructive and no separately bound approval token exists. Each of these must produce a stable reason code and either abstention, one focused clarification, or a non-executing recommendation — never a silent dispatch. [VERIFIED: `REQUIREMENTS.md` INT-02, INT-05, EXEC-05, EXEC-06, EXEC-07]

No external package is needed. The intent classifier is a hand-rolled deterministic rule policy (regex/keyword/structure rules over the prompt), which is exactly what the spec requires ("compiled local policy", "no per-prompt LLM API call"). The approval token reuses `contentFingerprint` and `stableStringify`. State reading reuses `readStateSource`/`readRoadmapSource`. Transition selection reuses `nextValidTransitions`/`selectWorkflow`. Capability closure reuses `selectCapabilities`/`resolveDependencies`. `node:test` covers the adversarial intent corpus and the dispatch matrix. [VERIFIED: `.claude/CLAUDE.md` "Node.js stdlib only", codebase grep, `tests/router.contract-eligibility.test.mjs` pattern]

**Primary recommendation:** Add three new stdlib-only modules — `src/intent/classify.mjs` (deterministic intent policy), `src/orchestrator/actions.mjs` (natural-language action → transition + structured args, framework-neutral via contracts), and `src/orchestrator/approval.mjs` (separately bound approval tokens) — wired into the existing `selectWorkflow` → `selectCapabilities` → `evaluateEligibility` pipeline, with an adversarial intent fixture corpus in `tests/router.intent-adversarial.test.mjs`.

## Project Constraints (from CLAUDE.md)

- **Stdlib-only, no npm dependencies.** The hook is a single `.mjs` with no `node_modules`. Phase 23 adds new `.mjs` modules but installs nothing. [VERIFIED: `.claude/CLAUDE.md` "Node.js stdlib only", "Any npm dependency at all in v1.1"]
- **No per-prompt LLM API call.** Intent classification must be a deterministic compiled policy — no LLM judge, no embeddings, no vector store. [VERIFIED: `.claude/CLAUDE.md` "Per-prompt LLM API call", "Embedding/vector store"]
- **<100ms warm path, fail-open.** Heavy intent/state analysis belongs outside the prompt hook (Phase 26 compiles intent rules into the read-only index). Phase 23 builds the classifier and resolver as pure functions validated by unit tests; prompt-time wiring is Phase 26. [VERIFIED: `.claude/CLAUDE.md` "Performance", `22-CONTEXT.md` deferred, `REQUIREMENTS.md` REL-01/REL-02 (Phase 26)]
- **Fail-closed for dispatch authority.** Any unknown intent, stale state, ambiguous transition, or missing approval fails closed (`dispatch_eligible: false`) with a stable reason code. Fail-open applies only to prompt injection (pass-through), never to dispatch. [VERIFIED: `.claude/CLAUDE.md` "Fail-open", `src/registry/eligibility.mjs`]
- **Framework-neutral.** Resolve actions against `contract.fields.workflow_transitions` and the active registry, not hardcoded GSD/Gstack command names. `src/orchestrator/workflow-declarations.json` hardcoded `owners`/`compatible` lists are a Phase 19 scaffold and must not be the authority for Phase 23 dispatch. [VERIFIED: `REQUIREMENTS.md` EXEC-01, "Out of Scope: Hard-coded GSD, Gstack, or ecosystem-specific workflow model", `src/orchestrator/workflow-declarations.json`]
- **Never invoke hooks as task tools.** `record.type === 'hook'` is excluded from `invokable_capabilities` in `select.mjs`; Phase 23 must preserve this. [VERIFIED: `src/orchestrator/select.mjs`, `.claude/CLAUDE.md` "Selecting hooks mid-task"]
- **Never elevate permissions or bypass sandbox.** Approval is a separate gate; it cannot grant permissions the runtime denies. [VERIFIED: `REQUIREMENTS.md` EXEC-09, `src/registry/eligibility.mjs#evaluateEligibility` permission gate]
- **No raw prompt retention.** Telemetry stores hashes, not prompt text. The intent classifier may emit a disposition + reason code + signature, never the raw prompt. [VERIFIED: `.claude/CLAUDE.md` "Sha256 prompt signature for telemetry", `REQUIREMENTS.md` HLTH-01 (Phase 24)]
- **Prefix shell commands with `rtk`.** Test commands use `rtk node --test ...`. [VERIFIED: `22-VALIDATION.md`]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Intent classification | API / Backend (pure deterministic policy) | — | A compiled local policy over the prompt text; no client/state. Must be prompt-time-cheap but is built/tested in Phase 23 as a pure function. [VERIFIED: `REQUIREMENTS.md` INT-01, `.claude/CLAUDE.md`] |
| Authoritative state reading | API / Backend (filesystem read) | Database / Storage (STATE.md/ROADMAP.md) | `readStateSource`/`readRoadmapSource` already own this; Phase 23 reuses them. Freshness is a hard gate. [VERIFIED: `src/context/sources.mjs`] |
| Workflow transition resolution | API / Backend (orchestrator) | — | `nextValidTransitions` + `selectWorkflow` already own this; Phase 23's action layer feeds them explicit intent. [VERIFIED: `src/orchestrator/transitions.mjs`] |
| Framework-neutral capability selection | API / Backend (orchestrator + registry) | Database / Storage (active registry) | `selectCapabilities` resolves the closure; the *choice* of capability must come from contract `workflow_transitions`, not hardcoded declarations. [VERIFIED: `src/orchestrator/select.mjs`, `src/registry/contract.mjs`] |
| Approval binding | API / Backend (orchestrator) | — | A separate gate from execute intent; binds fingerprint+args+targets+effects+version. [VERIFIED: `REQUIREMENTS.md` EXEC-07/08, `src/registry/identity.mjs`] |
| Next-capability prompt synthesis | API / Backend (orchestrator) | — | Post-work recommendation built from the selected capability's invocation shape; framework-neutral. [VERIFIED: `REQUIREMENTS.md` EXEC-10] |
| Adversarial fixture corpus | Test tier | — | Negative invocation assertions live in tests, not in the dispatch path. [VERIFIED: `REQUIREMENTS.md` INT-06] |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js ESM + stdlib | v22.22.3 (verified local) | Intent rules, state reads, approval hashing, deterministic dispatch | Repo is `.mjs` and already uses `node:crypto`, `node:fs`, `node:path`. No new runtime. [VERIFIED: `node --version`; codebase grep] |
| `src/orchestrator/transitions.mjs` | repository-local | `nextValidTransitions` + `selectWorkflow` | Already implement authoritative-evidence gating, tie/clarification handling, and explicit-intent narrowing. Phase 23 feeds them classified intent. [VERIFIED: `src/orchestrator/transitions.mjs`] |
| `src/orchestrator/select.mjs` | repository-local | `selectCapabilities` + `resolveDependencies` | Already resolves the dependency closure and excludes hooks/models/permissions from invokable capabilities. [VERIFIED: `src/orchestrator/select.mjs`] |
| `src/registry/eligibility.mjs` | repository-local | `evaluateEligibility` (10 fail-closed gates) | Phase 22's single eligibility authority. Phase 23 must not re-check eligibility; it consumes the derived `eligible`/`recommendation_only`/`reason_codes`. [VERIFIED: `src/registry/eligibility.mjs`, `22-04-SUMMARY.md`] |
| `src/registry/contract.mjs` | repository-local | `CONTRACT_FIELDS`, `workflow_transitions` envelope | The framework-neutral authority for which capabilities serve which transitions. [VERIFIED: `src/registry/contract.mjs#CONTRACT_FIELDS`] |
| `src/context/sources.mjs` | repository-local | `readStateSource`, `readRoadmapSource`, `collectAuthoritativeSnapshot` | Already parse STATE.md position/status/blockers and ROADMAP phase sections with bounded reads + witnesses. [VERIFIED: `src/context/sources.mjs`] |
| `src/context/resolve.mjs` | repository-local | `resolveContextAction`, override/clarify outcomes | Already models newest-explicit-instruction-overrides-stale and one focused clarification. [VERIFIED: `src/context/resolve.mjs`] |
| `node:test` + `node:assert/strict` | built into Node 22 | Unit + adversarial corpus + integration | Repo-wide standard; focused `--test-name-pattern` runs < 5s. [CITED: https://nodejs.org/api/test.html] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:crypto` `createHash('sha256')` | built in | Approval token fingerprint (capability + args + targets + effects + version) | Reuse the exact `contentFingerprint` pattern from `src/registry/identity.mjs`. [VERIFIED: `src/registry/identity.mjs`; CITED: https://nodejs.org/api/crypto.html] |
| `src/registry/identity.mjs` | repository-local | `stableCapabilityId`, `contentFingerprint` | Approval binding to exact capability identity and source fingerprint. [VERIFIED: `src/registry/identity.mjs`] |
| `src/registry/schema.mjs` | repository-local | `stableStringify`, `validateCapability` | Deterministic serialization for approval tokens and structured arguments. [VERIFIED: `src/registry/schema.mjs`] |
| `tests/helpers/inventory-fixture.mjs` | repository-local | Authoritative registry fixture | Reuse for dispatch tests; extend with contract `workflow_transitions` for action resolution. [VERIFIED: `tests/helpers/inventory-fixture.mjs`, `22-01-SUMMARY.md`] |

### Alternatives Considered

No alternative framework or dependency should be planned. CLAUDE.md locks the project to stdlib-only, no-LLM, no-embeddings. Any npm package (e.g., a natural-language intent library, a fuzzy matcher, a parser combinator) violates the "no npm dependency at all in v1" constraint and the "no per-prompt LLM API call" constraint. [VERIFIED: `.claude/CLAUDE.md` "What NOT to Use"]

**Installation:** None. [VERIFIED: codebase and environment inspection]

## Package Legitimacy Audit

No external packages are installed by this phase. All modules are repository-local `.mjs` files using Node.js stdlib only. [VERIFIED: `.claude/CLAUDE.md` "Node.js stdlib only", environment probe]

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none) | — | — | — | — | — | No external packages |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
User prompt
   │
   ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. Intent classifier (src/intent/classify.mjs)              │
│    compiled deterministic policy → { disposition, reason }  │
│    dispositions: execute | explain | hypothetical | quoted │
│      | negated | prohibited | preview | ambiguous           │
└──────────────────┬──────────────────────────────────────────┘
                   │ disposition === 'execute' ? else → abstain/clarify
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Action mapper (src/orchestrator/actions.mjs)             │
│    parse verb + topic (next phase | debug | create phase X)│
│    derive structured args (next number, topic, target)     │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Fresh authoritative state (src/context/sources.mjs)     │
│    readStateSource (STATE.md) + readRoadmapSource           │
│    freshness === 'fresh' required; else blocked            │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Transition resolution (transitions.mjs)                  │
│    nextValidTransitions(evidence) → candidates             │
│    selectWorkflow(candidates, explicitIntent) → ONE token   │
│    ties/terminal/stale/gaps → clarification or abstain      │
└──────────────────┬──────────────────────────────────────────┘
                   │ exactly one selected workflow token
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Framework-neutral capability selection                   │
│    query active registry for capabilities whose             │
│    contract.fields.workflow_transitions includes the        │
│    selected transition; filter by evaluateEligibility      │
│    (Phase 22 authority); pick safest compatible one        │
└──────────────────┬──────────────────────────────────────────┘
                   │ exactly one eligible capability (or abstain)
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Approval gate (src/orchestrator/approval.mjs)            │
│    if action is destructive/external/privileged/irreversible│
│      → require separately bound approval token              │
│    token binds: capability fingerprint + args + targets +  │
│      effects + proposal version; mismatch → fail closed    │
└──────────────────┬──────────────────────────────────────────┘
                   │ approval satisfied OR action is safe
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. Closure resolution (select.mjs#selectCapabilities)       │
│    resolveDependencies → invokable_capabilities,           │
│      required_models, required_permissions, lifecycle_hooks│
│    hooks excluded from invokable (EXEC-09)                  │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. Next-capability prompt (EXEC-10)                         │
│    synthesize framework-neutral ready-to-use prompt from    │
│    the selected capability's invocation shape               │
└─────────────────────────────────────────────────────────────┘

Any failure at steps 1–7 → dispatch_eligible: false + stable reason_code
                            → abstain | one focused clarification | recommendation
Fail-open applies ONLY to prompt injection, never to dispatch authority.
```

### Recommended Project Structure

```
src/
├── intent/
│   └── classify.mjs          # NEW: deterministic intent policy + classifier
├── orchestrator/
│   ├── actions.mjs           # NEW: NL action → transition + structured args
│   ├── approval.mjs          # NEW: separately bound approval tokens
│   ├── next-prompt.mjs       # NEW (or extend select.mjs): framework-neutral next prompt
│   ├── select.mjs            # EXISTING: closure resolution (consume, don't rewrite)
│   ├── transitions.mjs       # EXISTING: transition selection (feed explicit intent)
│   └── workflow-declarations.json  # EXISTING: scaffold only; NOT the Phase 23 authority
├── context/
│   ├── sources.mjs           # EXISTING: state/roadmap reads (reuse)
│   └── resolve.mjs           # EXISTING: override/clarify outcomes (reuse vocabulary)
└── registry/
    ├── contract.mjs          # EXISTING: workflow_transitions field (read)
    ├── eligibility.mjs       # EXISTING: 10-gate evaluator (consume derived result)
    └── identity.mjs          # EXISTING: fingerprints for approval binding
tests/
├── router.intent.test.mjs           # NEW: intent classifier unit matrix
├── router.intent-adversarial.test.mjs # NEW: INT-06 minimal-pair/negation/multilingual corpus
├── router.actions.test.mjs          # NEW: action → transition mapping (next/debug/create)
├── router.approval.test.mjs         # NEW: approval binding + stale/mismatch fail-closed
├── router.dispatch-integration.test.mjs # NEW: end-to-end intent → state → dispatch
└── helpers/
    └── inventory-fixture.mjs        # EXISTING: extend with workflow_transitions contracts
```

### Pattern 1: Deterministic intent policy (compiled, versioned)

**What:** A pure function `(prompt) → { disposition, reason_code, signature, policy_version }` with eight dispositions. Rules are regex/keyword/structure-based, compiled into a versioned policy object. No LLM, no embeddings, no network.

**When to use:** Every prompt before any dispatch is considered. Non-execute dispositions short-circuit to abstain/recommendation.

**Example:**
```javascript
// Source: hand-rolled per REQUIREMENTS.md INT-01 ("compiled local policy")
export const INTENT_POLICY_VERSION = 'intent-policy-v1';
const EXECUTE_VERBS = /^(go to|run|execute|start|create|debug|fix|ship|deploy|plan|verify|review|resume)\b/i;
const NEGATION = /\b(not|never|don'?t|do not|no|without|avoid|skip)\b/i;
const PROHIBITION = /\b(must not|cannot|can'?t|forbidden|prohibited|not allowed)\b/i;
const HYPOTHETICAL = /\b(if|suppose|imagine|what if|were to|should we|could we|would you)\b/i;
const QUOTED = /(^|[\s(])["'`].*["'`]([\s)]|$)|```/i;
const PREVIEW = /\b(preview|dry run|show me what|simulate|plan to)\b/i;

export function classifyIntent(prompt, { policyVersion = INTENT_POLICY_VERSION } = {}) {
  const text = String(prompt || '').trim();
  if (!text) return { disposition: 'ambiguous', reason_code: 'empty_prompt', policy_version: policyVersion };
  // Order matters: prohibition/negation/quoted/hypothetical/preview override execute.
  if (PROHIBITION.test(text))  return { disposition: 'prohibited', reason_code: 'prohibition_marker', policy_version: policyVersion };
  if (QUOTED.test(text))       return { disposition: 'quoted', reason_code: 'quoted_block', policy_version: policyVersion };
  if (HYPOTHETICAL.test(text) && !EXECUTE_VERBS.test(text)) return { disposition: 'hypothetical', reason_code: 'hypothetical_marker', policy_version: policyVersion };
  if (NEGATION.test(text) && !EXECUTE_VERBS.test(text))     return { disposition: 'negated', reason_code: 'negation_marker', policy_version: policyVersion };
  if (PREVIEW.test(text))      return { disposition: 'preview', reason_code: 'preview_marker', policy_version: policyVersion };
  if (EXECUTE_VERBS.test(text) && !NEGATION.test(text))     return { disposition: 'execute', reason_code: 'explicit_execute_verb', policy_version: policyVersion };
  return { disposition: 'ambiguous', reason_code: 'no_execute_signal', policy_version: policyVersion };
}
```

### Pattern 2: Framework-neutral action → transition mapping

**What:** Map a classified execute intent's verb+topic to a workflow transition by querying capabilities whose `contract.fields.workflow_transitions` envelope includes a matching transition — not by reading hardcoded `workflow-declarations.json` `compatible` lists.

**When to use:** After intent classification returns `execute` and fresh authoritative state is read.

**Example:**
```javascript
// Source: hand-rolled per REQUIREMENTS.md EXEC-01..04
import { stableCapabilityId } from '../registry/identity.mjs';

function workflowTransitions(record) {
  const env = record?.contract?.fields?.workflow_transitions;
  if (!env || env.state !== 'known' || env.freshness !== 'fresh') return [];
  return Array.isArray(env.value) ? env.value : [];
}

export function resolveAction({ intent, state, registry }) {
  // intent.parsed = { verb, topic, args }
  // Derive the candidate transition family from state + verb
  const candidates = registry.records
    .filter(r => r.type !== 'hook' && r.lifecycle === 'ready')
    .filter(r => workflowTransitions(r).some(t => t.workflow_id === intent.targetWorkflow))
    .map(r => ({ record: r, eligibility: registry.eligibility?.[stableCapabilityId(r)] }))
    .filter(c => c.eligibility?.eligible === true);
  if (candidates.length === 0) return { status: 'blocked', reason_code: 'no_eligible_capability' };
  if (candidates.length > 1)   return { status: 'clarify', reason_code: 'material_capability_tie' };
  return { status: 'selected', capability: candidates[0].record, reason_code: 'unique_eligible_capability' };
}
```

### Pattern 3: Separately bound approval token

**What:** A token bound to `(capability_fingerprint, args_hash, target_ids, effects_hash, proposal_version)`. Execute intent alone never satisfies it. Stale or mismatched → fail closed.

**When to use:** Whenever the selected capability's contract `side_effects`, `reversibility`, `risk`, or `permissions` envelope indicates destructive/external/privileged/irreversible.

**Example:**
```javascript
// Source: hand-rolled per REQUIREMENTS.md EXEC-07/08; reuses identity.mjs fingerprint
import { createHash } from 'node:crypto';
import { contentFingerprint } from '../registry/identity.mjs';
import { stableStringify } from '../registry/schema.mjs';

export const APPROVAL_POLICY_VERSION = 'approval-policy-v1';

export function needsApproval(contract) {
  const f = name => contract?.fields?.[name];
  const side = f('side_effects'); const rev = f('reversibility'); const risk = f('risk');
  const unsafe = v => v && v.state === 'known' && /destructive|unbounded|external|privileged/i.test(stableStringify(v.value));
  const irreversible = v => v && v.state === 'known' && v.value === 'irreversible';
  const high = v => v && v.state === 'known' && /high|critical|unacceptable/i.test(v.value);
  return !!(unsafe(side) || irreversible(rev) || high(risk));
}

export function bindApproval({ capability, args, targets, effects, proposalVersion }) {
  const hash = createHash('sha256');
  hash.update(contentFingerprint(capability));
  hash.update(stableStringify(args));
  hash.update(stableStringify([...(targets || [])].sort()));
  hash.update(stableStringify(effects));
  hash.update(String(proposalVersion));
  return { schema_version: 1, policy_version: APPROVAL_POLICY_VERSION, token: hash.digest('hex') };
}

export function verifyApproval({ bound, presented, capability, args, targets, effects, proposalVersion }) {
  if (!bound || !presented) return { status: 'blocked', reason_code: 'approval_missing' };
  const expected = bindApproval({ capability, args, targets, effects, proposalVersion }).token;
  if (expected !== bound.token)   return { status: 'blocked', reason_code: 'approval_stale' };
  if (presented.token !== bound.token) return { status: 'blocked', reason_code: 'approval_mismatch' };
  return { status: 'approved', reason_code: 'approval_bound' };
}
```

### Anti-Patterns to Avoid

- **LLM-judge intent classifier.** Violates the no-per-prompt-LLM constraint and the <100ms budget. Use deterministic rules. [VERIFIED: `.claude/CLAUDE.md` "Per-prompt LLM API call"]
- **Reading `workflow-declarations.json` `compatible` lists as Phase 23 authority.** That file is a Phase 19 scaffold with empty `owners`/`compatible` for most workflows. EXEC-01 requires resolution against installed-capability contracts. [VERIFIED: `src/orchestrator/workflow-declarations.json`, `REQUIREMENTS.md` EXEC-01]
- **Re-checking eligibility in Phase 23.** `evaluateEligibility` is the single Phase 22 authority. Phase 23 consumes its derived `eligible`/`reason_codes`; duplicating gates drifts. [VERIFIED: `22-04-SUMMARY.md`, `src/registry/eligibility.mjs`]
- **Treating hooks as task capabilities.** `select.mjs` already excludes `hook`/`model`/`permission` from `invokable_capabilities`; Phase 23 must not bypass this. [VERIFIED: `src/orchestrator/select.mjs`, `.claude/CLAUDE.md`]
- **Approval == execute intent.** EXEC-07 requires approval *distinct* from execute intent. A prompt that says "execute" must not satisfy the approval gate for a destructive action. [VERIFIED: `REQUIREMENTS.md` EXEC-07]
- **Stale state dispatch.** `nextValidTransitions` already blocks on `freshness !== 'fresh'`; Phase 23 must not cache or reuse stale state across the dispatch boundary. [VERIFIED: `src/orchestrator/transitions.mjs#nextValidTransitions`]
- **Hardcoding `/gsd-...` slash commands in the next-capability prompt.** EXEC-10 requires a framework-neutral ready-to-use prompt built from the capability's `invocation` shape. [VERIFIED: `REQUIREMENTS.md` EXEC-10, "Out of Scope: Hard-coded GSD, Gstack"]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Workflow transition gating | A new transition evaluator | `nextValidTransitions` + `selectWorkflow` | Already enforces freshness, terminal, gates, ties, and explicit-intent narrowing. [VERIFIED: `src/orchestrator/transitions.mjs`] |
| Dependency closure | A new closure resolver | `selectCapabilities` + `resolveDependencies` | Already excludes hooks, resolves permissions, detects cycles/missing. [VERIFIED: `src/orchestrator/select.mjs`] |
| Eligibility gates | New safety gates | `evaluateEligibility` (10 gates) | Phase 22's single authority; re-implementing drifts. [VERIFIED: `src/registry/eligibility.mjs`] |
| State parsing | New STATE.md/ROADMAP parsers | `readStateSource` + `readRoadmapSource` | Already bounded, symlink-safe, witness-backed. [VERIFIED: `src/context/sources.mjs`] |
| Capability fingerprinting | New hash schemes | `stableCapabilityId` + `contentFingerprint` | Phase 21 authority; approval tokens must match. [VERIFIED: `src/registry/identity.mjs`] |
| Canonical serialization | New JSON ordering | `stableStringify` | Repo-wide deterministic artifact rule. [VERIFIED: `src/registry/schema.mjs`] |
| Override/clarify vocabulary | New outcome enums | `resolveContextAction` outcomes (`override`/`clarify`/`refresh`/`none`) | INT-04/INT-05 map directly onto these. [VERIFIED: `src/context/resolve.mjs`] |

**Key insight:** Phase 23's net-new surface is the intent classifier, the action mapper, and the approval gate. Everything else is composition of existing Phase 21/22 + orchestrator primitives. The phase should be small.

## Runtime State Inventory

This is a greenfield-additive phase (new modules over existing registry/contracts). No rename/refactor/migration of stored state. The active registry, contracts, and eligibility artifacts are produced by Phase 21/22 and consumed read-only by Phase 23. [VERIFIED: `22-CONTEXT.md` "Extend the Phase 21 canonical registry"]

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — Phase 23 adds no persistent store; approval tokens are session-scoped (verify-only), not persisted. [VERIFIED: `REQUIREMENTS.md` EXEC-08 (bound to proposal version), no new data file in `.claude/CLAUDE.md` Data Files table] | None |
| Live service config | None — no external services. | None |
| OS-registered state | None — pure stdlib modules. | None |
| Secrets/env vars | None — approval tokens are content hashes, not secrets. | None |
| Build artifacts | None — new `.mjs` files compile on `rtk node --test`. | None |

## Common Pitfalls

### Pitfall 1: Intent classifier drift on minimal pairs
**What goes wrong:** "Go to the next phase" dispatches, but "Don't go to the next phase" also dispatches because the negation is missed.
**Why it happens:** Regex order matters; a permissive execute-verb match runs before the negation check.
**How to avoid:** Order rules: prohibition → quoted → hypothetical → negated → preview → execute. Require `!NEGATION.test` on the execute branch. Build an adversarial minimal-pair corpus (INT-06) where each pair differs by one token and asserts opposite dispositions. [VERIFIED: `REQUIREMENTS.md` INT-03/06]
**Warning signs:** A test pair where both prompts produce `execute`.

### Pitfall 2: Framework-neutral selection silently falling back to GSD names
**What goes wrong:** The action mapper fails to find a contract `workflow_transitions` match and falls back to a hardcoded `gsd-execute-phase` string.
**Why it happens:** `workflow-declarations.json` already contains `gsd-*` IDs; reusing them as the authority is the path of least resistance.
**How to avoid:** The action mapper must query the active registry's contract `workflow_transitions` envelopes as the *only* authority; on no match, return `no_eligible_capability` (abstain), never a hardcoded fallback. Keep a test asserting no `gsd-` string appears in `src/orchestrator/actions.mjs`. [VERIFIED: `REQUIREMENTS.md` EXEC-01, "Out of Scope: Hard-coded GSD, Gstack"]
**Warning signs:** A `grep -r "gsd-" src/orchestrator/actions.mjs` returns hits.

### Pitfall 3: Approval gate bypassed for "safe" destructive actions
**What goes wrong:** A destructive capability dispatches because the prompt was an explicit execute and the approval gate was skipped "for convenience."
**Why it happens:** Approval is a separate gate and easy to forget when the rest of the pipeline says "go."
**How to avoid:** `needsApproval(contract)` is checked unconditionally after capability selection; if true, dispatch is blocked until `verifyApproval` passes. Never short-circuit. Test that every destructive fixture fails without an approval token. [VERIFIED: `REQUIREMENTS.md` EXEC-07/08]
**Warning signs:** A destructive fixture dispatches without an approval token in the test.

### Pitfall 4: Stale cached state across the dispatch boundary
**What goes wrong:** "Go to the next phase" dispatches against a STATE.md snapshot from a prior turn and advances the wrong phase.
**Why it happens:** Caching `readStateSource` output to save the <100ms budget.
**How to avoid:** `nextValidTransitions` already requires `freshness === 'fresh'`. Phase 23 must call `readStateSource` on each dispatch attempt; do not cache state across prompts. The hot-path budget concern belongs to Phase 26 (compiling intent rules into the read-only index), not Phase 23. [VERIFIED: `src/orchestrator/transitions.mjs`, `22-CONTEXT.md` deferred]
**Warning signs:** A dispatch test passes with a stale STATE.md fixture.

### Pitfall 5: Ties silently resolved to the first capability
**What goes wrong:** Two equally-eligible capabilities match a transition and the mapper picks the first by accident.
**Why it happens:** `.filter().map()[0]` without a tie check.
**How to avoid:** After filtering eligible capabilities, if `length !== 1`, return `material_capability_tie` (abstain or one focused clarification). Reuse `clarification()` from `transitions.mjs`. [VERIFIED: `src/orchestrator/transitions.mjs#clarification`, `REQUIREMENTS.md` EXEC-06]
**Warning signs:** A test with two eligible capabilities produces a single selected capability.

### Pitfall 6: Re-invoking the hook as a task tool
**What goes wrong:** A lifecycle hook (`UserPromptSubmit`, `Stop`) is selected as the dispatch target.
**Why it happens:** Forgetting the `record.type === 'hook'` exclusion.
**How to avoid:** `select.mjs#resolveDependencies` already excludes hooks from `invokable_capabilities`. Phase 23's action mapper must also filter `r.type !== 'hook'` before contract matching. Assert in the adversarial corpus that a hook record is never selected. [VERIFIED: `src/orchestrator/select.mjs`, `REQUIREMENTS.md` EXEC-09]
**Warning signs:** A hook record appears in a selected dispatch closure.

## Code Examples

### Authoritative state evidence shape (consumed by `nextValidTransitions`)
```javascript
// Source: src/context/sources.mjs#readStateSource + src/orchestrator/transitions.mjs#nextValidTransitions
const evidence = {
  status: 'active',                 // must be 'active' (not terminal)
  freshness: 'fresh',               // must be 'fresh' (else authoritative_evidence_stale)
  position: { family: 'gsd', state: 'planned' },  // family + current state
  dependencies_safe: true,          // must be true (else dependency_unsafe)
  gates: { plan_approved: true },   // transition.requires must all be true
};
const result = nextValidTransitions(evidence);
// → { status: 'candidates_available', candidates: [...], policy_version } OR blocked
```

### Selecting one workflow from candidates with explicit intent
```javascript
// Source: src/orchestrator/transitions.mjs#selectWorkflow
const selection = selectWorkflow(transitionResult, {
  present: true,
  complete: true,
  workflow_id: 'gsd-execute-phase',  // from action mapper (framework-neutral source)
});
if (selection.status === 'selected') {
  // selection.selection = { transition_id, workflow_id, family, from, to }
}
```

### Excluding hooks from invokable capabilities (EXEC-09)
```javascript
// Source: src/orchestrator/select.mjs#resolveDependencies (existing behavior)
// invokable_capabilities excludes type === 'hook' | 'model' | 'permission'
// lifecycle_bindings separately captures hook events WITHOUT making them invokable
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded `workflow-declarations.json` `compatible` lists | Resolve against `contract.fields.workflow_transitions` of installed capabilities | Phase 23 (this phase) | Framework-neutral dispatch; GSD/Gstack/Codex adapters all participate equally |
| Single `dispatchable` boolean on a record | 10-gate `evaluateEligibility` with per-field confidence envelopes | Phase 22 | Unknown/low-confidence fields make capability recommendation-only, not dispatch-eligible |
| `prompt-route.mjs` regex-only instruction parsing | Deterministic 8-disposition intent classifier | Phase 23 (this phase) | Explanations/hypotheticals/negations/quotations never invoke |
| No approval binding | Separately bound approval token (fingerprint + args + targets + effects + version) | Phase 23 (this phase) | Destructive/privileged actions require distinct approval; stale/mismatched fails closed |

**Deprecated/outdated:**
- `src/orchestrator/workflow-declarations.json` `owners`/`compatible` empty lists: Phase 19 scaffold. Phase 23 must NOT treat them as dispatch authority — only as the published workflow-id namespace. [VERIFIED: `src/orchestrator/workflow-declarations.json`, `REQUIREMENTS.md` EXEC-01]
- `src/context/prompt-route.mjs#parseInstruction` regex (plan/execute/verify/review/finish/use): Phase 17 hot-path parser. Phase 23's intent classifier is the broader authority; `prompt-route.mjs` may consume the classifier's disposition in Phase 26 but is not modified in Phase 23. [VERIFIED: `src/context/prompt-route.mjs`, `22-CONTEXT.md` deferred]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The eight intent dispositions in INT-01 are exhaustive and a single prompt maps to exactly one disposition. | Pattern 1, INT-01 | If a prompt can legitimately be multi-disposition (e.g., "preview the execute"), the classifier needs a precedence order (already encoded) — low risk, the spec lists the eight as the enum. |
| A2 | "Safest compatible installed capability" (EXEC-02/03) means the unique capability that passes all `evaluateEligibility` gates; ties abstain. | Pattern 2, EXEC-02/03 | If "safest" requires ordering among multiple eligible capabilities (not abstention), a deterministic safety ordering rule is needed. The spec's EXEC-06 says ties prevent dispatch — supports abstention. |
| A3 | Approval tokens are session-scoped and not persisted to disk (no new data file). | Approval Pattern, EXEC-08 | If approval must survive across sessions/prompt boundaries, a new bounded data file is needed. The spec binds approval to a "proposal version" suggesting single-use; `.claude/CLAUDE.md` Data Files table lists no approval file. Needs planner confirmation. |
| A4 | `src/orchestrator/workflow-declarations.json` remains the workflow-id namespace but is NOT the capability-compatibility authority. | EXEC-01, Anti-Patterns | If the planner wants to mutate `workflow-declarations.json` to derive `compatible` from contracts, that is a larger change. Recommended: leave it as namespace, derive compatibility in the new action mapper. |
| A5 | "Go to the next phase" maps to the `gsd` family `planned → execute` transition (or whichever `nextValidTransitions` returns for the current state). | EXEC-02 | If the user means a different family (e.g., milestone closeout), `nextValidTransitions` already disambiguates by family from `position.family`. The action mapper should not hardcode the family; it should read it from state. |
| A6 | Multilingual intent fixtures (INT-06) cover English plus at least one non-English prompt; the deterministic policy is English-keyword-based and may not classify non-English reliably. | INT-06 | The spec defers "broader multilingual calibration" to FUT-03. Phase 23 should include multilingual adversarial fixtures that assert abstention (not false execute) for non-English prompts. Needs planner confirmation on language scope. |

## Open Questions (RESOLVED)

1. **Approval persistence scope (A3).**
   - What we know: EXEC-08 binds approval to capability fingerprint + args + targets + effects + proposal version.
   - What's unclear: Whether an approval token survives across prompts/sessions or is single-use within one dispatch attempt.
   - Recommendation: Treat approval as single-use, session-scoped, not persisted. If the planner wants cross-prompt approval, add a bounded data file in Phase 24's health-state boundary.
   - RESOLVED: Adopted — Plan 23-03 backstop truth "Approval tokens are session-scoped and not persisted to disk"; no approval data file introduced in Phase 23.

2. **"Safest" ordering among multiple eligible capabilities (A2).**
   - What we know: EXEC-06 says ties prevent automatic dispatch.
   - What's unclear: Whether "safest compatible" ever requires choosing among >1 eligible capability rather than abstaining.
   - Recommendation: Implement as abstention on any tie (length !== 1). Add a deterministic safety ordering only if a concrete EXEC requirement demands it.
   - RESOLVED: Adopted — Plan 23-01 and 23-02 implement abstention via the `material_capability_tie` reason code when more than one capability passes the gates (length !== 1).

3. **Multilingual fixture scope (A6).**
   - What we know: INT-06 requires multilingual prompts; FUT-03 defers broader multilingual calibration.
   - What's unclear: Which languages and how many fixtures.
   - Recommendation: Include at least Spanish + Portuguese adversarial fixtures asserting abstention for non-English execute-like verbs. Confirm with planner.
   - RESOLVED: Adopted — Plan 23-02 Task 01 ships Spanish + Portuguese adversarial fixtures asserting abstention for non-English execute-like verbs.

4. **Hot-path wiring boundary with Phase 26.**
   - What we know: REL-01/REL-02 (Phase 26) own prompt-time hot-path integration; Phase 23 builds pure functions.
   - What's unclear: Whether Phase 23 must expose a prompt-time entry point or only the pure modules + tests.
   - Recommendation: Phase 23 ships pure modules + unit/adversarial/integration tests. No prompt-hook wiring. Confirm with planner.
   - RESOLVED: Adopted — No plan wires any prompt-time hook; Phase 23 ships pure `.mjs` modules + `node:test` tests only. Hot-path integration deferred to Phase 26 (REL-01/REL-02).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js ESM | Intent classifier, action mapper, approval, all tests | ✓ | v22.22.3 | — |
| `node:test` | Adversarial corpus + integration tests | ✓ | built in | — |
| `node:crypto` | Approval token fingerprints | ✓ | built in | — |
| STATE.md / ROADMAP.md | Authoritative state reading (EXEC-02/04) | ✓ | project files | — |
| Active registry + contracts (Phase 21/22 output) | Framework-neutral capability selection | ✓ | produced by prior phases | — |

**Missing dependencies with no fallback:** none
**Missing dependencies with fallback:** none

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js `node:test` + `node:assert/strict` (v22.22.3) |
| Config file | none — direct `.test.mjs` files |
| Quick run command | `rtk node --test tests/router.intent.test.mjs tests/router.intent-adversarial.test.mjs tests/router.actions.test.mjs tests/router.approval.test.mjs` |
| Full suite command | `rtk node --test tests/*.test.mjs` |
| Estimated runtime | < 6 seconds focused |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INT-01 | Eight-disposition classifier matrix | unit + matrix | `rtk node --test tests/router.intent.test.mjs` | ❌ Wave 0 |
| INT-02 | Non-execute dispositions set `dispatch_eligible: false` | unit | `rtk node --test tests/router.intent.test.mjs` | ❌ Wave 0 |
| INT-03 | Explanations/hypotheticals/quotations/negations/prohibitions/previews/conditions/ambiguous never invoke | adversarial | `rtk node --test tests/router.intent-adversarial.test.mjs` | ❌ Wave 0 |
| INT-04 | Newest explicit instruction overrides stale capsule/state | unit + integration | `rtk node --test tests/router.intent.test.mjs tests/router.dispatch-integration.test.mjs` | ❌ Wave 0 |
| INT-05 | Uncertain intent/state/permissions/side effects → abstain or one focused clarification | unit + integration | `rtk node --test tests/router.intent.test.mjs tests/router.dispatch-integration.test.mjs` | ❌ Wave 0 |
| INT-06 | Minimal pairs, nested quotations, mixed negation, corrections, conditionals, multilingual, unsafe targets, negative invocation assertions | adversarial | `rtk node --test tests/router.intent-adversarial.test.mjs` | ❌ Wave 0 |
| EXEC-01 | Resolution against contracts, not hardcoded framework names | unit + integration | `rtk node --test tests/router.actions.test.mjs tests/router.dispatch-integration.test.mjs` | ❌ Wave 0 |
| EXEC-02 | "Go to the next phase" reads fresh state, one transition, safest capability | integration | `rtk node --test tests/router.actions.test.mjs tests/router.dispatch-integration.test.mjs` | ❌ Wave 0 |
| EXEC-03 | "There is a bug" / "debug this" selects debugging capability by contract | integration | `rtk node --test tests/router.actions.test.mjs` | ❌ Wave 0 |
| EXEC-04 | "Create a phase about X" derives next number + topic, invokes phase-creation capability | integration | `rtk node --test tests/router.actions.test.mjs` | ❌ Wave 0 |
| EXEC-05 | Automatic dispatch requires fresh state + one transition + healthy deps + valid args + permissions + gates | integration | `rtk node --test tests/router.dispatch-integration.test.mjs` | ❌ Wave 0 |
| EXEC-06 | Ties/stale/terminal/gaps/missing deps/side effects/checkpoints prevent dispatch | unit + integration | `rtk node --test tests/router.actions.test.mjs tests/router.dispatch-integration.test.mjs` | ❌ Wave 0 |
| EXEC-07 | Destructive/external/privileged/irreversible require approval distinct from execute | unit | `rtk node --test tests/router.approval.test.mjs` | ❌ Wave 0 |
| EXEC-08 | Approval bound to fingerprint+args+targets+effects+version; stale/mismatched fails closed | unit | `rtk node --test tests/router.approval.test.mjs` | ❌ Wave 0 |
| EXEC-09 | Never elevate permissions, bypass sandbox, treat discovery as authority, or invoke hooks as tasks | unit + integration | `rtk node --test tests/router.approval.test.mjs tests/router.dispatch-integration.test.mjs` | ❌ Wave 0 |
| EXEC-10 | After work, recommend next locally available capability + framework-neutral prompt | unit + integration | `rtk node --test tests/router.actions.test.mjs tests/router.dispatch-integration.test.mjs` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `rtk node --test tests/router.intent.test.mjs tests/router.intent-adversarial.test.mjs tests/router.actions.test.mjs tests/router.approval.test.mjs`
- **Per wave merge:** full Phase 23 suite + Phase 22 regression (`router.contract-eligibility.test.mjs`, `router.contracts.test.mjs`, `router.relationships.test.mjs`)
- **Phase gate:** `rtk node --test tests/*.test.mjs` green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/router.intent.test.mjs` — INT-01/02/04/05 classifier matrix
- [ ] `tests/router.intent-adversarial.test.mjs` — INT-03/06 minimal-pair/negation/multilingual/unsafe-target corpus with negative invocation assertions
- [ ] `tests/router.actions.test.mjs` — EXEC-01/02/03/04/06/10 action → transition → capability
- [ ] `tests/router.approval.test.mjs` — EXEC-07/08/09 approval binding + stale/mismatch + hook exclusion
- [ ] `tests/router.dispatch-integration.test.mjs` — EXEC-05/06/09/10 end-to-end intent → state → dispatch → next-prompt
- [ ] `tests/helpers/inventory-fixture.mjs` — extend with `workflow_transitions` contract envelopes for action resolution

## Security Domain

`security_enforcement: true`, ASVS level 1, block on `high`. [VERIFIED: `.planning/config.json`]

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No authentication in Phase 23 (local stdlib modules). |
| V3 Session Management | no | No sessions; approval tokens are stateless content hashes. |
| V4 Access Control | yes | EXEC-07/08/09: approval gate is the access-control boundary for destructive actions; hooks excluded from invokable capabilities; permissions never elevated. [VERIFIED: `REQUIREMENTS.md` EXEC-07/08/09] |
| V5 Input Validation | yes | Intent classifier treats all prompt text as untrusted; deterministic rules never `eval`/`Function` prompt content. Structured args are bounded (`stableStringify`, length caps). [VERIFIED: `.claude/CLAUDE.md` "treat capability-authored text as untrusted evidence", `src/registry/schema.mjs#stableStringify`] |
| V6 Cryptography | yes | Approval tokens use `node:crypto` SHA-256 via `contentFingerprint`. Never hand-roll hashing. [VERIFIED: `src/registry/identity.mjs#contentFingerprint`; CITED: https://nodejs.org/api/crypto.html] |
| V7 Error Handling | yes | Fail-closed dispatch: every unknown/ambiguous/stale/mismatched state returns `dispatch_eligible: false` + stable reason code. Fail-open applies only to prompt injection, never dispatch. [VERIFIED: `.claude/CLAUDE.md` "Fail-open", `src/registry/eligibility.mjs`] |
| V8 Data Protection | yes | No raw prompt retention; telemetry uses SHA-256 signatures. [VERIFIED: `.claude/CLAUDE.md` "Sha256 prompt signature for telemetry"] |

### Known Threat Patterns for the Router dispatch stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection via quoted/code-block content | Spoofing / Tampering | Intent classifier marks quoted/code-block prompts as `quoted` (non-execute); never `eval` prompt content. [VERIFIED: `REQUIREMENTS.md` INT-03, `.claude/CLAUDE.md`] |
| Negation bypass ("don't run X") dispatched as execute | Tampering / Elevation | Classifier precedence: negation/prohibition checked before execute-verb match; adversarial corpus asserts the negative. [VERIFIED: `REQUIREMENTS.md` INT-03/06] |
| Destructive action dispatched without approval | Elevation of privilege | `needsApproval(contract)` gate + separately bound approval token (EXEC-07/08); execute intent never satisfies approval. [VERIFIED: `REQUIREMENTS.md` EXEC-07/08] |
| Stale approval reused for new args/targets | Tampering | Approval token binds args+targets+effects+proposal version; mismatch → `approval_stale`/`approval_mismatch`. [VERIFIED: `REQUIREMENTS.md` EXEC-08] |
| Hook invoked as task tool | Elevation of privilege | `select.mjs` excludes `type === 'hook'` from `invokable_capabilities`; action mapper also filters. [VERIFIED: `src/orchestrator/select.mjs`, `REQUIREMENTS.md` EXEC-09] |
| Hardcoded framework name bypasses contract authority | Spoofing / Tampering | Action mapper reads `contract.fields.workflow_transitions` only; no hardcoded `gsd-` fallback. [VERIFIED: `REQUIREMENTS.md` EXEC-01] |
| Discovery records treated as authorization | Elevation of privilege | Discovery is evidence, not authority; eligibility is derived by `evaluateEligibility`, never authored. [VERIFIED: `22-CONTEXT.md`, `src/registry/eligibility.mjs`] |
| Stale STATE.md dispatches wrong phase | Tampering | `nextValidTransitions` requires `freshness === 'fresh'`; no cross-prompt state cache. [VERIFIED: `src/orchestrator/transitions.mjs`] |

## Sources

### Primary (HIGH confidence)
- `.planning/REQUIREMENTS.md` — INT-01..06, EXEC-01..10 verbatim, Out of Scope table
- `.planning/phases/23-intent-safe-state-aware-execution/23-CONTEXT.md` — phase boundary, discretion, deferrals
- `.planning/phases/22-conservative-contracts-and-relationship-graph/22-CONTEXT.md` — locked Phase 22 decisions + explicit Phase 23 deferrals
- `.planning/phases/22-conservative-contracts-and-relationship-graph/22-{01..06}-SUMMARY.md` — what Phase 22 actually built (contracts, overlays, relationships, eligibility, inspection, production gap closure)
- `.claude/CLAUDE.md` — stdlib-only, no LLM, <100ms, fail-open/fail-closed, framework-neutral, hook exclusion, no raw prompt retention
- `src/orchestrator/transitions.mjs` — `nextValidTransitions`, `selectWorkflow`, `clarification` (read directly)
- `src/orchestrator/select.mjs` — `selectCapabilities`, `resolveDependencies`, hook exclusion (read directly)
- `src/orchestrator/workflow-declarations.json` — Phase 19 scaffold with empty owners/compatible (read directly)
- `src/registry/eligibility.mjs` — 10-gate `evaluateEligibility` (read directly)
- `src/registry/contract.mjs` — `CONTRACT_FIELDS`, `workflow_transitions` field (read directly)
- `src/registry/relationships.mjs` — eight-type relationship schema (read directly)
- `src/registry/identity.mjs` — `stableCapabilityId`, `contentFingerprint` (read directly)
- `src/context/sources.mjs` — `readStateSource`, `readRoadmapSource` (read directly)
- `src/context/resolve.mjs` — `resolveContextAction`, override/clarify outcomes (read directly)
- `src/context/prompt-route.mjs` — existing regex instruction parser (read directly)
- `src/prompt/{compile-index,publish-index}.mjs` — hot-path index + publish (read directly)
- `.planning/config.json` — `security_enforcement: true`, `nyquist_validation: true`, `skip_discuss: true`
- `node --version` → v22.22.3 (environment probe)

### Secondary (MEDIUM confidence)
- https://nodejs.org/api/test.html — `node:test` stable, focused `--test-name-pattern` runs [CITED]
- https://nodejs.org/api/crypto.html — `createHash('sha256')` stable since Node 14 [CITED]

### Tertiary (LOW confidence)
- None — all claims verified against the codebase, REQUIREMENTS.md, or official Node.js docs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — stdlib-only, all integration points read directly in `src/`
- Architecture: HIGH — Phase 22 summaries + `src/orchestrator/*` + `src/registry/*` confirm the pipeline composition
- Pitfalls: HIGH — derived from spec constraints + existing module behavior + Phase 22 deferred ideas
- Security: HIGH — ASVS categories mapped to EXEC-07/08/09 + existing eligibility/identity modules

**Research date:** 2026-07-27
**Valid until:** 2026-08-26 (30 days — stable codebase, no external dependencies)