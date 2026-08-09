# Phase 41: Manifest vNext and Trust Hardening - Research

**Researched:** 2026-08-08
**Domain:** Capability contract trust hardening, manifest provenance, native invocation validation, pre-dispatch gate, quarantine
**Confidence:** HIGH

## Summary

Phase 41 hardens the trust boundary between untrusted capability metadata (descriptions, manifests, plugins, private integrations, learned records) and the dispatch pipeline. The codebase already has a sophisticated contract system (`src/registry/contract.mjs`) with per-field evidence envelopes (provenance, freshness, confidence basis points, conflict detection), an eligibility gate evaluator (`src/registry/eligibility.mjs`) with 10 gates, a dispatch adapter contract (`src/adapters/dispatch/contract.mjs`) with receipt schema, and an inspection CLI layer (`src/cli/router-control.mjs`) with `contractListProjection`/`contractDetailProjection`/`fieldProjection`. Phase 41 extends these existing systems rather than building new ones.

The five TRUST requirements map to specific extensions: TRUST-01 extends the contract envelope to distinguish explicit/inferred/conflicting as inspectable states and adds missing fields (action, cost, completion, native-invocation); TRUST-02 hardens the untrusted-evidence policy so descriptions/manifests/plugins/private/learned cannot create authority; TRUST-03 adds a typed-argument-contract + invocation-validation layer (entrypoint, cwd, wrapper, quoting, destructive-target, runtime-scope) before the adapter spawns; TRUST-04 adds a pre-dispatch gate validating timeout/retry/output-bounds/completion-contract before the adapter receives the invocation; TRUST-05 adds a contract-level quarantine with attributable reasons while keeping independent valid fallbacks eligible.

**Primary recommendation:** Extend the existing `contract.mjs` envelope, `eligibility.mjs` gates, and `dispatch/contract.mjs` factory in-place. Add a new `src/registry/trust.mjs` module for the untrusted-evidence policy (TRUST-02), extend `src/adapters/dispatch/contract.mjs` with a `validateInvocation` pre-gate (TRUST-03/04), and add a quarantine disposition to the eligibility/contract layer (TRUST-05). All stdlib-only, no new dependencies.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
No locked decisions — CONTEXT.md was auto-generated with discuss skipped per `workflow.skip_discuss`.

### Claude's Discretion
All implementation choices are at the agent's discretion. Use the ROADMAP goal, success criteria, and existing codebase conventions to guide decisions.

### Deferred Ideas (OUT OF SCOPE)
None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TRUST-01 | Inspect canonical Manifest vNext contract distinguishing explicit, inferred, unknown, stale, and conflicting action, input, output, dependency, side-effect, cost, risk, permission, completion, and native-invocation fields with provenance | Extend `CONTRACT_FIELDS` and `envelope()` in `contract.mjs`; extend `fieldProjection()` in `router-control.mjs` to surface explicit/inferred/conflicting as distinct inspectable states. Current system has known/unknown + fresh/stale/unknown + provenance but lacks explicit-vs-inferred distinction and collapses conflicting to unknown. |
| TRUST-02 | Descriptions, manifests, plugins, private integrations, and learned records are untrusted evidence and cannot create authority, expand risk, or become executable instructions | Add untrusted-evidence policy in new `src/registry/trust.mjs` that classifies evidence sources and prevents untrusted provenance from populating authority-critical contract fields. Current system rejects `authored` provenance in `envelope()` but does not explicitly quarantine description/manifest/plugin/private/learned sources from authority. |
| TRUST-03 | Every native invocation uses a typed argument contract and validates entrypoint identity, path containment, working directory, wrappers, quoting, destructive targets, and runtime scope before execution | Extend `src/adapters/dispatch/contract.mjs` with a `validateInvocation` function that checks typed args, entrypoint, cwd, wrapper, quoting, destructive targets, and runtime scope. Current `validateFixturePath` in `claude.mjs` only checks path containment + `..` rejection + isFile. |
| TRUST-04 | Dispatch validates dependency availability, permission/effect class, timeout, retry policy, output bounds, and completion contract before the host adapter receives an invocation | Add a pre-dispatch gate (either in `dispatch/contract.mjs` or a new `dispatch/pregate.mjs`) that validates timeout/retry/output-bounds/completion-contract. Current eligibility evaluator checks dependency/permission/side-effects at build time but nothing validates these at dispatch time. |
| TRUST-05 | Invalid, ambiguous, stale, unavailable, scope-escaping, or injection-bearing capabilities are blocked or quarantined with reasons while a separately valid compatible fallback remains eligible | Add a `quarantined` disposition to the contract/eligibility layer with attributable reason codes. Extend eligibility to keep independent valid fallbacks eligible. Quarantine exists at reconciliation level (`router-lifecycle.mjs:379`, `router.mjs:904-937`) but not at the contract/trust level. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Stdlib-only, no npm dependencies**: The hook is a single file with no `node_modules`. All Phase 41 modules must use only `node:crypto`, `node:fs`, `node:path`, `node:os`, `node:child_process`.
- **Performance**: Router hook must return within ~100ms, fail-open, never block. Trust hardening runs at build time (contract construction, eligibility) or dispatch time (pre-gate), NEVER on the prompt hot path.
- **Fail-open**: On any exception in the hook, pass through the original prompt unchanged. Trust hardening modules loaded via top-level await with null sentinel (mirrors `authority.mjs` pattern).
- **File writes via native tools**: Trust modules are read-only w.r.t. user code; only data files (cache, telemetry) are written.
- **Coexistence**: Must not break existing hook bindings. New modules deploy via `moduleNames` flatMap in `router-lifecycle.mjs`.
- **Deny rules**: No secret leakage via injection. Contract fields must not expose raw values (enforced by `validateCapabilityContract` line 477: evidence must not expose raw values).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Contract field provenance/freshness inspection (TRUST-01) | Build/Registry | CLI (inspection) | Contract envelopes are built at registry assembly time (`assembleRegistry` → `buildCapabilityContract`); inspection is a CLI projection (`router-control.mjs`) |
| Untrusted-evidence policy (TRUST-02) | Build/Registry | Authority (intent) | Evidence classification happens at contract construction; authority policy (`authority.mjs`) consumes sealed inputs so untrusted evidence cannot reach it directly |
| Typed argument + invocation validation (TRUST-03) | Dispatch adapter | — | Validation must run before `spawn()` in the adapter; the factory contract (`dispatch/contract.mjs`) is the right seam |
| Pre-dispatch contract validation (TRUST-04) | Dispatch adapter | Registry (eligibility) | Timeout/retry/output/completion checks run at dispatch time; eligibility (build time) provides the baseline but dispatch-time validation is the gate |
| Quarantine with fallback eligibility (TRUST-05) | Registry (eligibility) | Dispatch adapter | Quarantine disposition is a contract/eligibility property; fallback chain is evaluated at routing/dispatch time |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js stdlib (`node:crypto`, `node:fs`, `node:path`, `node:os`) | built-in | All trust hardening logic | Zero dependencies. Matches all existing `src/` modules. No new packages. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:child_process` | built-in | `spawnSync` for subprocess gate fixtures in `validate.mjs` | Only for production-verify gate subprocesses; not in the hook path |
| `node:test` + `node:assert/strict` | built-in | Test framework | All 100+ existing test files use this; no external test runner |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extend `contract.mjs` in-place | New `manifest-vnext.mjs` module | In-place extension preserves the existing `validateCapabilityContract` invariants and all 13 contract tests. A new module would duplicate the field set and break the schema-version-1 contract. |
| Extend `eligibility.mjs` gates | New `trust-gates.mjs` | Adding gates to the existing `ELIGIBILITY_GATES` array preserves the canonical gate-set validation (`validateEligibility` line 203). A new file would need to coordinate with the existing gate set. |
| New `src/registry/trust.mjs` for untrusted-evidence policy | Inline in `contract.mjs` | A separate module keeps `contract.mjs` focused on envelope construction/validation and lets `trust.mjs` own the provenance-classification policy. Matches the existing pattern of `eligibility.mjs` being separate from `contract.mjs`. |

**Installation:**
```bash
# No npm install. Zero dependencies. Stdlib-only.
```

**Version verification:** Not applicable — no external packages. All modules are stdlib-only Node.js ESM `.mjs` files.

## Package Legitimacy Audit

This phase installs no external packages. All code is stdlib-only Node.js ESM `.mjs`. No npm registry lookups, no `package.json` additions, no supply-chain surface.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                    BUILD TIME (off hot path)
                    ========================
  discoverRoots() ──> validateCapability() ──> assembleRegistry()
         |                                           |
         |                                           v
         |                              buildCapabilityContract()
         |                              (contract.mjs envelope())
         |                                    |
         |                              +------+------+
         |                              |             |
         |                              v             v
         |                    resolveContractOverlays()  evaluateEligibility()
         |                    (correction overlays)     (10 gates)
         |                              |             |
         |                              v             v
         |                        applyContractOverlays() ──> dispatchable = eligibility.eligible
         |                              |
                    +-------------------+-------------------+
                    |                                       |
                    v                                       v
              TRUST-02: untrusted-              TRUST-05: quarantine
              evidence policy (trust.mjs)      disposition (if invalid/stale/
              prevents descriptions/           injection-bearing/scope-escaping)
              manifests/plugins/private        while fallback stays eligible
              from creating authority
                    |
                    v
              TRUST-01: contract inspection (router-control.mjs)
              fieldProjection surfaces explicit/inferred/unknown/
              stale/conflicting + provenance per field

                    DISPATCH TIME (off hot path, before spawn)
                    ==========================================
  action ──> validateInvocation() [TRUST-03]
              ├── typed argument contract
              ├── entrypoint identity
              ├── path containment
              ├── working directory (cwd)
              ├── wrapper validation
              ├── quoting validation
              ├── destructive target check
              └── runtime scope check
                    |
                    v
              preDispatchGate() [TRUST-04]
              ├── dependency availability
              ├── permission/effect class
              ├── timeout contract
              ├── retry policy
              ├── output bounds
              └── completion contract
                    |
              +-----+-----+
              |           |
              v           v
           pass        block/quarantine
              |           |
              v           v
          adapter      receipt (blocked/quarantined
          spawn()       with reason codes)
```

### Recommended Project Structure
```
src/
├── registry/
│   ├── contract.mjs       # EXTEND: add fields, explicit/inferred states, conflict surface
│   ├── eligibility.mjs    # EXTEND: add quarantine gate, fallback eligibility
│   ├── trust.mjs          # NEW: untrusted-evidence policy (TRUST-02)
│   └── schema.mjs         # EXTEND: validate new contract fields + states
├── adapters/
│   └── dispatch/
│       ├── contract.mjs   # EXTEND: add validateInvocation (TRUST-03) + preDispatchGate (TRUST-04)
│       ├── claude.mjs     # EXTEND: call validateInvocation before spawn
│       └── codex.mjs      # EXTEND: call validateInvocation before spawn
├── cli/
│   └── router-control.mjs # EXTEND: fieldProjection surfaces explicit/inferred/conflicting
└── lifecycle/
    └── router-lifecycle.mjs # EXTEND: add new module to moduleNames deploy list
```

### Pattern 1: Evidence Envelope Extension (TRUST-01)
**What:** The existing `envelope()` function in `contract.mjs` resolves evidence candidates to a known/unknown state. Extend it to track `evidence_class: 'explicit' | 'inferred' | 'unknown'` alongside the existing `state` and `freshness` fields.
**When to use:** When building capability contracts at registry assembly time.
**Example:**
```typescript
// Source: src/registry/contract.mjs:161-173 (existing envelope return shape)
// Current:
return {
  state: known ? 'known' : 'unknown',
  ...(known ? { value: accepted.value } : {}),
  evidence: ordered(evidence),
  rejected_evidence: ordered(rejected),
  provenance: known ? [...] : [],
  policy_version: CONTRACT_POLICY.policy_version,
  freshness: known ? 'fresh' : (reason.endsWith('_stale') ? 'stale' : 'unknown'),
  confidence_basis_points: known ? Math.min(...) : 0,
  reason_codes: [reason],
};
// TRUST-01 extension adds:
//   evidence_class: 'explicit' | 'inferred' | 'conflicting' | 'unknown'
// where:
//   explicit  = provenance 'adapter' with confidence_basis_points === 10000
//   inferred  = provenance 'manifest'/'correction' with confidence >= 8500
//   conflicting = assertedValues.size > 1 (currently sets reason to `${field}_conflicting`)
//   unknown   = no eligible evidence
```

### Pattern 2: Untrusted-Evidence Policy (TRUST-02)
**What:** A pure function that classifies evidence provenance into trust tiers and prevents untrusted sources from populating authority-critical fields.
**When to use:** At contract construction, before `envelope()` resolves evidence.
**Example:**
```typescript
// Source: src/registry/contract.mjs:41 (SAFE_PROVENANCE set)
// Current: SAFE_PROVENANCE = new Set(['adapter', 'manifest', 'correction', 'authored'])
// 'authored' is rejected in envelope() (line 122-124)
// TRUST-02 extends: descriptions, plugin metadata, private integrations, learned records
// are all classified as 'untrusted' and cannot populate authority-critical fields:
//   permissions, side_effects, risk, reversibility, invocation_kind
// These fields require 'adapter' or 'correction' provenance with structural_minimum (10000).
// Untrusted evidence is retained in rejected_evidence with reason_code 'untrusted_evidence_rejected'.
```

### Pattern 3: Invocation Validation Gate (TRUST-03)
**What:** A validation function called before `spawn()` that checks typed arguments, entrypoint, containment, cwd, wrappers, quoting, destructive targets, and runtime scope.
**When to use:** In `invokeImpl` before spawning the child process.
**Example:**
```typescript
// Source: src/adapters/dispatch/claude.mjs:115-132 (existing validateFixturePath)
// Current: checks fixturePath for '..', resolves via realpath, checks containment, isFile
// TRUST-03 extends to a full validateInvocation() that additionally checks:
//   - typed argument contract: args match expected types/schema
//   - cwd: working directory is within allowed roots
//   - wrapper: no shell wrapper injection (shell:false already enforced)
//   - quoting: no unescaped shell metacharacters in args
//   - destructive targets: reject patterns like 'rm -rf /', '> /dev/sda'
//   - runtime scope: invocation.runtime matches the adapter's runtime
```

### Pattern 4: Pre-Dispatch Contract Gate (TRUST-04)
**What:** A gate that validates timeout, retry, output bounds, and completion contract before the adapter receives the invocation.
**When to use:** After `validateInvocation` passes, before `invokeImpl` spawns.
**Example:**
```typescript
// Source: src/registry/eligibility.mjs:145-190 (existing evaluateEligibility)
// Current: 10 gates evaluated at build time. TRUST-04 adds dispatch-time gates:
//   - timeout: invocation has a bounded timeout (not unbounded)
//   - retry: retry policy is declared and bounded
//   - output_bounds: output size is bounded (stdout_sha256 already captured)
//   - completion_contract: completion evidence schema is declared
// These are NOT build-time eligibility gates — they are dispatch-time pre-gates
// that validate the invocation contract, not the capability record.
```

### Pattern 5: Quarantine with Fallback (TRUST-05)
**What:** A `quarantined` disposition for capabilities that are invalid, ambiguous, stale, unavailable, injection-bearing, or scope-escaping, with attributable reason codes. Independent valid fallbacks remain eligible.
**When to use:** When eligibility evaluation or pre-dispatch validation finds a trust violation.
**Example:**
```typescript
// Source: src/registry/eligibility.mjs:181-189 (existing eligible/recommendation_only)
// TRUST-05 adds a 'quarantined' disposition:
//   eligible: true | false
//   recommendation_only: true | false
//   quarantined: true | false  (NEW)
//   quarantine_reasons: string[]  (NEW, e.g. ['injection_bearing', 'scope_escaping'])
// Quarantined capabilities are blocked from dispatch but their reason codes are
// inspectable. Fallback capabilities (separately valid, same semantic slot) remain
// eligible — the quarantine is per-capability, not per-route.
```

### Anti-Patterns to Avoid
- **Do not add trust hardening to the prompt hot path.** The hook (`router.mjs`) runs in <100ms. Contract construction, eligibility evaluation, and invocation validation all run at build time or dispatch time, never at prompt time. [VERIFIED: .claude/CLAUDE.md Constraints section]
- **Do not expose raw evidence values in inspection.** The existing `validateCapabilityContract` (contract.mjs:477) enforces that evidence items must not expose raw values. Any new fields must follow this invariant. [VERIFIED: src/registry/contract.mjs:476-481]
- **Do not let untrusted provenance populate authority-critical fields.** The current system rejects `authored` provenance. TRUST-02 extends this to descriptions, manifests, plugins, private integrations, and learned records for fields like permissions, side_effects, risk, and reversibility. [VERIFIED: src/registry/contract.mjs:122-124]
- **Do not break the existing `validateCapabilityContract` schema.** The contract schema_version=1 is validated by `validateCapabilityContract` with strict field-set enforcement (line 451). Adding fields requires extending `CONTRACT_FIELDS` and updating the validator atomically. [VERIFIED: src/registry/contract.mjs:440-494]
- **Do not duplicate the eligibility gate set.** `validateEligibility` (schema.mjs:203) enforces that the gate set matches `ELIGIBILITY_GATES` exactly. Adding gates requires updating both `eligibility.mjs` and `schema.mjs`. [VERIFIED: src/registry/schema.mjs:49-60, 191-225]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Evidence provenance classification | Custom provenance taxonomy | Extend existing `SAFE_PROVENANCE` set in `contract.mjs:41` | The set is already the source of truth; adding tiers reuses the existing rejection pipeline |
| Contract field validation | Per-field ad-hoc validators | Extend `validateContractFieldValue` in `contract.mjs:69-89` | The function already dispatches by field type (string-list, enum, scope, string); new fields fit the same pattern |
| Eligibility gate evaluation | New gate evaluator | Extend `evaluateEligibility` in `eligibility.mjs:145` | The 10-gate evaluator is the single entry point; adding gates preserves the canonical gate-set invariant |
| Path containment | New path checker | Reuse `within()` pattern from `dispatch/claude.mjs:111-113` and `portablePath` from `fingerprint.mjs:58-63` | Both already handle `..` rejection, realpath resolution, and cross-platform paths |
| Receipt writing | New receipt format | Extend existing `buildReceipt` / `publishAtomic` in `dispatch/receipt.mjs` | The receipt schema (schema_version=1) and atomic publish are already proven; add quarantine/blocked states to `RECEIPT_STATES` |
| Redaction | New redaction logic | Reuse `redact()` / `hashPromptDerived()` from `dispatch/receipt.mjs:33-41` | Already handles sk-/AKIA/ghp_/xoxb/glpat patterns; extends to any new prompt-derived fields |
| Stable serialization | Custom JSON ordering | Use `stableStringify` from `schema.mjs:339-341` | Already handles cyclic detection, key sorting, prototype checking; all contract/eligibility code depends on it |

**Key insight:** The codebase has a mature, well-tested trust infrastructure. Phase 41 extends existing seams (contract envelope, eligibility gates, dispatch contract, inspection projections) rather than building parallel systems. Every new validation or quarantine mechanism must compose with the existing `validateCapabilityContract` and `validateEligibility` invariants.

## Common Pitfalls

### Pitfall 1: Breaking the Contract Field-Set Invariant
**What goes wrong:** Adding a new field to `CONTRACT_FIELDS` without updating `validateCapabilityContract` (line 451) causes every contract validation to throw `TypeError: capability.contract.fields must contain the complete canonical field set`.
**Why it happens:** `validateCapabilityContract` checks that `Object.keys(contract.fields).sort()` exactly matches `[...CONTRACT_FIELDS].sort()`. Adding a field to the array but not to existing built contracts breaks the invariant.
**How to avoid:** When adding fields (action, cost, completion, native-invocation), update `CONTRACT_FIELDS`, `validateContractFieldValue`, `validateCapabilityContract`, `buildCapabilityContract`'s `authoritativeEvidence`, and `DISPATCH_FIELDS` atomically in one edit. All existing test fixtures that call `buildCapabilityContract` will need the new fields populated.
**Warning signs:** `tests/router.contracts.test.mjs` fails with "fields must contain the complete canonical field set".

### Pitfall 2: Collapsing Conflicting to Unknown
**What goes wrong:** The current `envelope()` function (contract.mjs:155-156) detects conflicts (`assertedValues.size > 1`) but sets `state: 'unknown'`. TRUST-01 requires "conflicting" as a distinct inspectable state. If you leave the state as 'unknown', the inspection CLI cannot distinguish "no evidence" from "conflicting evidence".
**Why it happens:** The `known` variable is `assertedValues.size <= 1 && distinct.size === 1`. Multiple distinct values make `known=false` → state='unknown'.
**How to avoid:** Add a `conflicting` state (or `evidence_class: 'conflicting'`) that is distinct from `unknown`. The `reason_codes` already carry `${field}_conflicting` — surface it in the state/class, not just in reason_codes.
**Warning signs:** TRUST-01 inspection test cannot distinguish conflicting from unknown.

### Pitfall 3: Untrusted Evidence Leaking into Authority Fields
**What goes wrong:** If manifest/plugin/private/learned evidence is accepted for `permissions`, `side_effects`, `risk`, or `reversibility` fields, a malicious manifest could grant itself elevated permissions or mark destructive effects as reversible.
**Why it happens:** The current `envelope()` accepts `manifest` provenance with `inferred_minimum_basis_points` (8500) for all fields. TRUST-02 requires that authority-critical fields only accept `adapter` or `correction` provenance with `structural_minimum_basis_points` (10000).
**How to avoid:** Add a field-level provenance policy in `trust.mjs` that restricts which provenance sources can populate which fields. Authority-critical fields (permissions, side_effects, risk, reversibility, invocation_kind) require structural-minimum evidence; informational fields (purpose, triggers) accept inferred evidence.
**Warning signs:** A test fixture with a manifest claiming `permissions: ['elevated']` passes eligibility.

### Pitfall 4: Invocation Validation on the Hot Path
**What goes wrong:** Adding `validateInvocation` checks to `router.mjs` (the hook) would blow the <100ms budget.
**Why it happens:** The hook runs on every prompt. Invocation validation must run at dispatch time (when an action is dispatched), not at prompt time.
**How to avoid:** `validateInvocation` runs inside `invokeImpl` (dispatch/claude.mjs, dispatch/codex.mjs) before `spawn()`, or in the worker entrypoint. It never runs in the hook. The hook only does BM25 routing + `additionalContext` injection.
**Warning signs:** `tests/router.perf-evolved.test.mjs` or `tests/router.failopen.test.mjs` latency gate fails.

### Pitfall 5: Quarantine Breaking Fallback Eligibility
**What goes wrong:** If quarantining a capability also quarantines its fallbacks, a single bad manifest entry disables an entire capability class.
**Why it happens:** The quarantine must be per-capability, not per-route or per-semantic-slot. The existing `resolve_quarantined` in `router.mjs` (line 904-937) is per-route; the contract-level quarantine must be independent.
**How to avoid:** Quarantine sets `eligibility.quarantined = true` on the specific record. Other records with the same `semantic_type` but different `stableCapabilityId` remain eligible. The eligibility evaluator already operates per-record.
**Warning signs:** Quarantining one skill makes all skills with the same name ineligible.

### Pitfall 6: Deploy List Missing New Module
**What goes wrong:** If `trust.mjs` (or any new module) is not added to `moduleNames` in `router-lifecycle.mjs:384-428`, it deploys to dev `src/` but not to `~/.claude/router/modules/` or `~/.codex/router/modules/`, causing ENOENT in production.
**Why it happens:** The deploy mechanism uses a flatMap over `moduleNames` to copy files to both runtime roots. Missing a module means it is not deployed.
**How to avoid:** Add `'registry/trust.mjs'` to the `moduleNames` array alongside the existing `'registry/contract.mjs'` entry. If extending `dispatch/contract.mjs`, it is already in the list (line 409).
**Warning signs:** `tests/router.deployed-bundle.test.mjs` fails or production-verify gate ENOENTs.

## Code Examples

### Existing Contract Envelope (the extension point for TRUST-01)
```typescript
// Source: src/registry/contract.mjs:161-173 [VERIFIED]
// This is the return shape of envelope() — the per-field evidence resolution.
// TRUST-01 extends this with evidence_class and surfaces conflicting as distinct.
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
};
```

### Existing Eligibility Gate Evaluator (the extension point for TRUST-05)
```typescript
// Source: src/registry/eligibility.mjs:145-190 [VERIFIED]
// evaluateEligibility returns the eligibility decision. TRUST-05 adds
// a 'quarantined' disposition with quarantine_reasons alongside eligible/recommendation_only.
export function evaluateEligibility({ record, records = [], relationships = {} } = {}) {
  // ... 10 gates evaluated ...
  const reasonCodes = ELIGIBILITY_GATES
    .filter(name => gates[name] !== 'passed')
    .map(name => `${name}_${gates[name]}`);
  const eligible = reasonCodes.length === 0;
  return {
    schema_version: 1,
    policy_version: 'eligibility-policy-v1',
    eligible,
    recommendation_only: !eligible,
    gates,
    reason_codes: eligible ? ['eligibility_all_gates_passed'] : reasonCodes,
  };
}
```

### Existing Dispatch Fixture Validation (the extension point for TRUST-03)
```typescript
// Source: src/adapters/dispatch/claude.mjs:111-132 [VERIFIED]
// validateFixturePath currently checks: '..', realpath, containment, isFile.
// TRUST-03 extends this to a full validateInvocation with typed args, cwd,
// wrapper, quoting, destructive-target, and runtime-scope checks.
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

### Existing Receipt States (the extension point for TRUST-05 quarantine)
```typescript
// Source: src/adapters/dispatch/contract.mjs:33-35 [VERIFIED]
// RECEIPT_STATES is frozen. TRUST-05 adds 'quarantined' and 'blocked' states
// for capabilities that fail pre-dispatch validation.
export const RECEIPT_STATES = Object.freeze([
  'pending', 'invoked', 'paused', 'completed', 'failed', 'recommendation_only',
]);
// TRUST-05 extension: 'quarantined' (capability-level block with reasons)
//                      'blocked'    (pre-dispatch gate failure)
```

### Existing Contract Field Projection (the extension point for TRUST-01 inspection)
```typescript
// Source: src/cli/router-control.mjs:396-413 [VERIFIED]
// fieldProjection projects a contract field envelope for CLI inspection.
// TRUST-01 extends this to surface evidence_class (explicit/inferred/conflicting).
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
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Flat BM25 over manifest entries | Contract envelope with provenance/freshness/confidence per field | Phase 22 (contract.mjs) | Contracts are the trust boundary, not raw descriptions |
| Authored evidence accepted | Authored evidence rejected (envelope line 122-124) | Phase 22 | Descriptions cannot self-grant authority |
| Build-time eligibility only | Build-time + dispatch-time validation needed | Phase 41 (this phase) | Dispatch-time gate closes the trust gap between build and invoke |
| 6 receipt states (pending/invoked/paused/completed/failed/recommendation_only) | Extended with quarantined/blocked states | Phase 41 (this phase) | Quarantined capabilities get attributable receipts |
| 14 contract fields | Extended with action/cost/completion/native-invocation | Phase 41 (this phase) | Full capability contract coverage per TRUST-01 |

**Deprecated/outdated:**
- `LEGACY_SEMANTIC_TYPES` in `schema.mjs:61-68` maps old type names to new ones — do not add new legacy mappings; use `semantic_type` directly.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | TRUST-01's "action, cost, completion, native-invocation" fields are new contract fields not yet in `CONTRACT_FIELDS` | Phase Requirements, Architecture | If these are already represented by existing fields (e.g., `invocation_kind` covers "native-invocation"), the field extension is smaller. Mitigation: map each TRUST-01 field to existing `CONTRACT_FIELDS` where possible. |
| A2 | A new `src/registry/trust.mjs` module is the right home for the untrusted-evidence policy | Architecture Patterns | If the policy is small enough to inline in `contract.mjs`, the separate module adds import overhead. Mitigation: start with a separate module for testability; inline if trivial. |
| A3 | The `validateInvocation` function belongs in `dispatch/contract.mjs` (the factory contract), not in a new `dispatch/pregate.mjs` | Architecture Patterns | If validation logic is large, a separate `pregate.mjs` keeps `contract.mjs` focused on the factory. Mitigation: start in `contract.mjs`; extract if >100 lines. |
| A4 | Quarantine is a per-capability disposition on the eligibility object, not a per-route property | Pitfalls, Architecture | If quarantine needs to be per-route (blocking a specific route while keeping the same capability eligible for other routes), the design changes. Mitigation: TRUST-05 says "independent valid fallbacks stay eligible" — this is per-capability, not per-route. |
| A5 | The existing `RECEIPT_STATES` frozen array can be extended without breaking Phase 38 tests | Code Examples | Phase 38 tests check exact receipt states. Adding new states requires updating those tests. Mitigation: new states are additive; existing states unchanged. |

## Open Questions (RESOLVED)

1. **Should "cost" be a contract field or a dispatch-time property?**
   - What we know: TRUST-01 lists "cost" as a contract field to inspect. TRUST-04 lists "timeout, retry policy, output bounds" as dispatch-time contracts.
   - What's unclear: Whether "cost" is a static property of the capability (like `risk`) or a dynamic property of the invocation (like `timeout`).
   - RESOLVED: Treat "cost" as a contract field (static, per-capability) and "timeout/retry/output-bounds" as dispatch-time contracts (dynamic, per-invocation). This matches the TRUST-01 (inspect) vs TRUST-04 (validate before dispatch) split. Adopted in Plan 41-01 Task 1.

2. **Should "completion" be a contract field or part of the receipt schema?**
   - What we know: TRUST-01 lists "completion" as a contract field. The receipt schema already has `completion_evidence` with a `state` field.
   - What's unclear: Whether "completion" in TRUST-01 means the completion contract (what evidence the capability must produce) or the completion evidence (what the receipt captures).
   - RESOLVED: Treat "completion" as a contract field describing the required completion evidence shape, validated at dispatch time (TRUST-04) against the actual receipt. Adopted in Plan 41-01 Task 1 and Plan 41-02 Task 2.

3. **Should the untrusted-evidence policy (TRUST-02) be a build-time filter or a dispatch-time gate?**
   - What we know: The contract envelope is built at build time. The dispatch gate runs at dispatch time.
   - What's unclear: Whether untrusted evidence should be filtered at contract construction (so it never appears in the contract) or at dispatch time (so it appears in the contract but blocks dispatch).
   - RESOLVED: Filter at build time (reject untrusted evidence in `envelope()` for authority-critical fields) AND surface the rejection in the inspection CLI (so operators can see why a field is unknown). This matches the existing pattern where `authored` evidence is rejected at build time and appears in `rejected_evidence`. Adopted in Plan 41-01 Task 2.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (hermes binary) | All modules (stdlib-only) | Yes | `/Users/guilherme/.hermes/node/bin/node` (>=18) | — |
| `node:test` | Test framework | Yes | built-in | — |
| `node:assert/strict` | Test assertions | Yes | built-in | — |
| `~/.claude/router/modules/` | Deploy target | Yes | exists | — |
| `~/.codex/router/modules/` | Codex deploy target | Yes | exists | — |
| `rtk` | Test runner wrapper | Yes | on PATH | — |

**Missing dependencies with no fallback:** none
**Missing dependencies with fallback:** none

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` + `node:assert/strict` (built-in) |
| Config file | none (test files are self-contained `.test.mjs`) |
| Quick run command | `rtk node --test tests/router.contracts.test.mjs tests/router.contract-eligibility.test.mjs tests/router.contract-inspection.test.mjs` |
| Full suite command | `rtk node --test tests/*.test.mjs` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TRUST-01 | Contract inspection shows explicit/inferred/unknown/stale/conflicting + provenance per field | unit | `rtk node --test tests/router.trust-contract.test.mjs` | Wave 0 |
| TRUST-01 | New contract fields (action, cost, completion, native-invocation) are in canonical field set | unit | `rtk node --test tests/router.trust-contract.test.mjs` | Wave 0 |
| TRUST-02 | Authored/manifest/plugin/private/learned evidence cannot populate authority-critical fields | unit | `rtk node --test tests/router.trust-evidence.test.mjs` | Wave 0 |
| TRUST-02 | Untrusted evidence is retained in rejected_evidence with reason code | unit | `rtk node --test tests/router.trust-evidence.test.mjs` | Wave 0 |
| TRUST-03 | validateInvocation rejects invalid entrypoint, path escape, bad cwd, wrapper injection, unquoted args, destructive targets, wrong runtime scope | unit | `rtk node --test tests/router.trust-invocation.test.mjs` | Wave 0 |
| TRUST-03 | Typed argument contract validates arg types before spawn | unit | `rtk node --test tests/router.trust-invocation.test.mjs` | Wave 0 |
| TRUST-04 | Pre-dispatch gate blocks missing timeout, unbounded retry, missing output bounds, missing completion contract | unit | `rtk node --test tests/router.trust-pregate.test.mjs` | Wave 0 |
| TRUST-04 | Pre-dispatch gate passes valid contracts and reaches adapter | unit | `rtk node --test tests/router.trust-pregate.test.mjs` | Wave 0 |
| TRUST-05 | Quarantined capability has attributable reason codes | unit | `rtk node --test tests/router.trust-quarantine.test.mjs` | Wave 0 |
| TRUST-05 | Independent valid fallback stays eligible when sibling is quarantined | unit | `rtk node --test tests/router.trust-quarantine.test.mjs` | Wave 0 |
| TRUST-05 | Injection-bearing capability is quarantined | unit | `rtk node --test tests/router.trust-quarantine.test.mjs` | Wave 0 |
| ALL | Existing contract/eligibility/dispatch tests remain green | regression | `rtk node --test tests/router.contracts.test.mjs tests/router.contract-eligibility.test.mjs tests/router.dispatch-integration.test.mjs tests/router.contract-overlays.test.mjs` | Exists (must stay green) |
| ALL | Deployed bundle includes new modules | integration | `rtk node --test tests/router.deployed-bundle.test.mjs` | Exists (must stay green) |
| ALL | Latency budget holds (no trust logic on hot path) | regression | `rtk node --test tests/router.perf-evolved.test.mjs tests/router.failopen.test.mjs` | Exists (must stay green) |

### Sampling Rate
- **Per task commit:** `rtk node --test tests/router.trust-*.test.mjs tests/router.contracts.test.mjs tests/router.contract-eligibility.test.mjs`
- **Per wave merge:** `rtk node --test tests/*.test.mjs`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/router.trust-contract.test.mjs` — covers TRUST-01 (contract field inspection with explicit/inferred/conflicting states)
- [ ] `tests/router.trust-evidence.test.mjs` — covers TRUST-02 (untrusted-evidence policy)
- [ ] `tests/router.trust-invocation.test.mjs` — covers TRUST-03 (typed args + invocation validation)
- [ ] `tests/router.trust-pregate.test.mjs` — covers TRUST-04 (pre-dispatch contract gate)
- [ ] `tests/router.trust-quarantine.test.mjs` — covers TRUST-05 (quarantine + fallback eligibility)
- [ ] Extend `tests/helpers/inventory-fixture.mjs` — add new contract fields to `contractEvidence()` helper

*(Existing test infrastructure: `node:test` framework, `tests/helpers/inventory-fixture.mjs` for capability fixtures, `tests/helpers/test-mode-seam.mjs` for mode injection. No framework install needed.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Not in scope — auth handled by Phase 39 (authority.mjs) |
| V3 Session Management | no | Not in scope — leases handled by Phase 40 |
| V4 Access Control | yes | Eligibility gates + quarantine enforce capability-level access control; untrusted evidence cannot grant authority |
| V5 Input Validation | yes | Typed argument contract (TRUST-03) validates invocation inputs; contract field validation (`validateContractFieldValue`) validates metadata inputs |
| V6 Cryptography | yes | `node:crypto` sha256 for fingerprints/receipt IDs/receipt stdout hashes — never hand-roll; reuse existing `createHash` patterns |
| V7 Error Handling and Logging | yes | Fail-open: trust validation errors produce quarantine receipts with reason codes, never block the hook; receipts are append-only jsonl |
| V8 Data Protection | yes | Evidence must not expose raw values (contract.mjs:477); redaction via `redact()` in receipt.mjs; no raw prompt text in telemetry |

### Known Threat Patterns for Trust Hardening

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious manifest granting elevated permissions | Elevation of Privilege | TRUST-02: untrusted-evidence policy rejects manifest/plugin/private/learned provenance for authority-critical fields (permissions, side_effects, risk, reversibility) |
| Prompt injection in capability description | Tampering | TRUST-02: descriptions are untrusted evidence; `hasUnsafeAuthoredContent` (contract.mjs:237-249) checks for secrets/paths/control chars; injection patterns quarantined by TRUST-05 |
| Path traversal via invocation command | Tampering | TRUST-03: `validateFixturePath` rejects `..`, validates realpath containment; extended with cwd/wrapper/quoting checks |
| Destructive target in invocation args | Tampering | TRUST-03: destructive-target validation rejects patterns like `rm -rf /`, `> /dev/sda` before spawn |
| Stale capability metadata dispatching | Repudiation | TRUST-01: freshness field (fresh/stale/unknown) surfaces staleness; TRUST-05: stale capabilities quarantined |
| Scope-escaping capability | Elevation of Privilege | TRUST-03: runtime-scope validation ensures invocation stays within declared runtime; TRUST-05: scope-escaping capabilities quarantined |
| Unbounded output consuming resources | Denial of Service | TRUST-04: output-bounds contract validated before dispatch; timeout contract limits execution time |
| Receipt tampering | Tampering | TRUST-04: completion-contract validation; receipts are content-addressed (sha256 receipt_id) and append-only |

## Sources

### Primary (HIGH confidence)
- `src/registry/contract.mjs` — read in full (494 lines). CONTRACT_FIELDS, envelope(), buildCapabilityContract, resolveContractOverlays, applyContractOverlays, validateCapabilityContract. [VERIFIED: codebase read this session]
- `src/registry/schema.mjs` — read in full (368 lines). validateCapability, validateEligibility, ELIGIBILITY_GATES, canonicalizeCapability, stableStringify. [VERIFIED: codebase read this session]
- `src/registry/eligibility.mjs` — read in full (191 lines). evaluateEligibility, 10 gates, per-gate state evaluation. [VERIFIED: codebase read this session]
- `src/adapters/dispatch/contract.mjs` — read in full (134 lines). createDispatchAdapter, RECEIPT_STATES, buildReceipt, DISPATCH_CONTRACT_VERSION. [VERIFIED: codebase read this session]
- `src/adapters/dispatch/claude.mjs` — read in full (497 lines). validateFixturePath, invokeImpl, canDispatchImpl, pauseImpl, resumeImpl, worker entrypoint. [VERIFIED: codebase read this session]
- `src/adapters/dispatch/receipt.mjs` — read in full (134 lines). ReceiptStore, publishAtomic, append, read, redact, hashPromptDerived, hashBytes, receiptId, defaultReceiptRoot. [VERIFIED: codebase read this session]
- `src/intent/authority.mjs` — read in full (276 lines). AUTHORITY_CLASSES, PROTECTED_EFFECT_TOKENS, classifyAuthority, evaluateAuthorityPolicy, sealed input (AUTH-03). [VERIFIED: codebase read this session]
- `src/registry/identity.mjs` — read in full (52 lines). stableCapabilityId, contentFingerprint. [VERIFIED: codebase read this session]
- `src/registry/fingerprint.mjs` — read in full (331 lines). scanFingerprintTree, loadFingerprintState, saveFingerprintState, portablePath, contained. [VERIFIED: codebase read this session]
- `src/registry/relationships.mjs` — read in full (179 lines). deriveRelationships, RELATIONSHIP_TYPES, cycle detection. [VERIFIED: codebase read this session]
- `src/registry/build.mjs` — read lines 1-403. assembleRegistry, buildFullRegistry, mergeGroup, annotatePrecedence, resolveModeMapTargets. [VERIFIED: codebase read this session]
- `src/lifecycle/router-lifecycle.mjs` — read lines 1-490. moduleNames deploy list, moduleValues flatMap, generationPaths, gate fixtures. [VERIFIED: codebase read this session]
- `src/cli/router-control.mjs` — read lines 372-466. contractListProjection, contractDetailProjection, fieldProjection, evidenceProjection, contractSummary, renderContractText. [VERIFIED: codebase read this session]
- `tests/router.contracts.test.mjs` — read lines 1-80. Test patterns for contract assembly, overlay application, field envelope validation. [VERIFIED: codebase read this session]
- `tests/router.contract-inspection.test.mjs` — read lines 1-140. Inspection projection tests, privacy-safe rendering, relationship projection. [VERIFIED: codebase read this session]
- `tests/router.contract-eligibility.test.mjs` — read lines 1-80. Eligibility gate evaluation tests, safe record fixtures. [VERIFIED: codebase read this session]
- `tests/router.dispatch-integration.test.mjs` — read lines 1-80. Dispatch matrix tests, capability fixtures, eligibility integration. [VERIFIED: codebase read this session]
- `tests/helpers/inventory-fixture.mjs` — read lines 1-100. record(), buildClaudeHeavyProfile(), buildLargeMixedProfile(), contractEvidence(). [VERIFIED: codebase read this session]
- `.planning/REQUIREMENTS.md` — read in full. TRUST-01 through TRUST-05 definitions. [VERIFIED: codebase read this session]
- `.planning/ROADMAP.md` — Phase 41 success criteria. [VERIFIED: codebase read this session]
- `.planning/config.json` — nyquist_validation: true, security_enforcement: true, test_command: `rtk node --test tests/*.test.mjs`. [VERIFIED: codebase read this session]
- `.claude/CLAUDE.md` — project constraints (stdlib-only, <100ms, fail-open, coexistence). [VERIFIED: codebase read this session]

### Secondary (MEDIUM confidence)
- None — all findings are from direct codebase reading this session.

### Tertiary (LOW confidence)
- None — no training-data claims used; all claims verified against source files.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — stdlib-only, no external packages, verified against existing modules
- Architecture: HIGH — all extension points verified by reading source files with line numbers
- Pitfalls: HIGH — each pitfall traces to a specific invariant in the source code (line-cited)
- Code examples: HIGH — all examples are verbatim from source files with line citations

**Research date:** 2026-08-08
**Valid until:** 2026-09-08 (stable codebase, no external dependencies)