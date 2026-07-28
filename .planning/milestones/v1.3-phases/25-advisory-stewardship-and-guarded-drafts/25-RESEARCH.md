# Phase 25: Advisory Stewardship and Guarded Drafts - Research

**Researched:** 2026-07-28
**Domain:** Deterministic local advisory ranking, guarded CLI interactions, and preview-only remediation drafts
**Confidence:** HIGH for codebase architecture; MEDIUM for the startup integration seam

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Return exactly one highest-value suggestion, never an unranked list.
- Startup stays silent unless confidence, novelty, and actionability all pass.
- Deduplicate by stable suggestion fingerprint and enforce a cooldown.
- Startup output is one compact, non-blocking line directing the user to `/router suggestion`.

- The detail view includes a compact health overview, evidence, confidence, expected benefit, risk, affected capabilities, and safe next step.
- Users can inspect, dismiss, snooze, and correct a suggestion.
- Corrections create local, versioned correction proposals and never directly change routing.
- When nothing qualifies, report no actionable suggestion without exposing low-confidence findings.

- A remediation draft is created only after explicit approval.
- Draft preview includes exact paths, semantic changes, dependencies, conflicts, route effects, verification, and rollback implications.
- Drafts remain preview-only; Phase 25 never installs or publishes them.
- Keep the interface scoped to `/router suggestion`; add no dashboard, timeline, finding dump, or maintenance-command suite.

### the agent's Discretion
- Exact deterministic ranking weights and tie-break order, provided the choice remains bounded, versioned, and testable.
- Exact compact text formatting within existing canonical CLI response patterns.
- Local file layout under the existing Router-owned state root.

### Deferred Ideas (OUT OF SCOPE)
- Dashboard, timeline, per-session summary, unranked finding dump, and maintenance-command suite are explicitly out of scope.
- Actual installation, publication, or automatic capability mutation remains outside Phase 25.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UX-01 | Startup remains silent unless one high-confidence, novel, actionable capability observation exists. | Eligibility must be a pure fail-closed filter over Phase 24 observations; startup may consume only a precomputed pointer. [VERIFIED: `.planning/REQUIREMENTS.md`, `src/health/catalog.mjs`] |
| UX-02 | A startup observation is compact, non-blocking, deduplicated, cooldown-controlled, and points to `/router suggestion` for details. | Reuse `COOLDOWN_MS`, a SHA-256 content fingerprint, and the exact UI-spec line. [VERIFIED: `src/health/thresholds.mjs`, `src/registry/identity.mjs`, `25-UI-SPEC.md`] |
| UX-03 | `/router suggestion` returns exactly one prioritized actionable recommendation plus a compact overall capability-health overview. | Add one `suggestion` command family to `runRouterControl`; rank deterministically then select index zero. [VERIFIED: `src/cli/router-control.mjs`, `25-CONTEXT.md`] |
| UX-04 | `/router suggestion` shows evidence, confidence, affected capabilities, expected benefit, risk, and a safe next action. | Project from the bounded Phase 24 record and an allowlisted advisory policy; do not expose arbitrary source text. [VERIFIED: `src/health/catalog.mjs`, `src/cli/router-control.mjs`] |
| UX-05 | Users can inspect, dismiss, snooze, or correct without mutating capability definitions or routing policy. | Store interaction state under `ownedRoot/suggestions`; preserve existing health/registry isolation tests and atomic 0600 writes. [VERIFIED: `src/health/store.mjs`, `tests/router.health.privacy.test.mjs`] |
| UX-06 | Missing-capability remediation follows recommendation → explicit approval → draft → preview and never installs automatically. | Bind approval to the current suggestion fingerprint and draft proposal version; the approved operation writes only a draft artifact. [VERIFIED: `src/orchestrator/approval.mjs`, `src/registry/activate.mjs`] |
| UX-07 | Draft previews show exact paths, semantic changes, dependencies, conflicts, representative before/after routes, verification, reversibility, and rollback implications. | Define one bounded preview schema and require every field before returning `draft_preview_ready`. [VERIFIED: `25-UI-SPEC.md`, `.planning/REQUIREMENTS.md`] |
| UX-08 | Router never automatically installs, deletes, disables, merges, archives, rewrites, activates, or publishes personal capabilities. | Suggestion modules must not import activation/publication modules; protected-artifact hash tests must remain byte-identical after every action. [VERIFIED: `tests/router.health.admin.test.mjs`, `tests/router.health.privacy.test.mjs`] |
| UX-09 | Router adds no dashboard, timeline, per-session summary, unranked finding dump, or large maintenance command family. | Keep all behavior below the single `suggestion` command family and return at most one item. [VERIFIED: `25-CONTEXT.md`, `25-UI-SPEC.md`] |
</phase_requirements>

## Summary

Phase 25 should be a thin advisory layer over Phase 24, not a second health engine. `deriveObservations` already produces bounded, sorted observations with stable reason codes, evidence windows, sample/opportunity counts, freshness, affected IDs, confidence basis points, and non-destructive remedies. The new layer should: filter for fresh/high-confidence/actionable observations, apply a small versioned priority table, derive a stable fingerprint, suppress dismissed/snoozed/cooldown fingerprints, and return only the first ranked item. [VERIFIED: `src/health/catalog.mjs`, `src/health/thresholds.mjs`]

Interaction state and preview-only drafts belong under a new Router-owned `suggestions/` sibling, never inside registry versions, compiled index versions, or capability roots. Reuse the existing health store's lock + atomic temp/rename/fsync + 0600 discipline, the CLI canonical envelope, and Phase 23 approval binding. Approval grants permission to persist one draft JSON file only; no Phase 25 code path should import or call `activateCandidate`, `publishIndex`, installer, adapter mutation, or lifecycle mutation functions. [VERIFIED: `src/health/store.mjs`, `src/cli/router-control.mjs`, `src/orchestrator/approval.mjs`, `src/registry/activate.mjs`]

The only architectural uncertainty is the phrase “startup output.” The current prompt route is a bounded compiled-index reader, while health derivation is explicitly excluded from the `UserPromptSubmit` hot path and Phase 26 owns suggestion references in the immutable release tuple. Therefore Phase 25 should precompute a compact pointer off-path and make the startup integration consume that pointer without importing health code or calculating/ranking at prompt time. The planner should isolate that integration in its own final task and test silence, exact one-line output, fail-open corruption behavior, and no health import. [VERIFIED: `src/context/prompt-route.mjs`, `src/prompt/compile-index.mjs`, `tests/router.health.privacy.test.mjs`, `.planning/REQUIREMENTS.md`]

**Primary recommendation:** Add two stdlib-only modules—one pure suggestion policy and one atomic local store—then wire a single `suggestion` CLI family; keep startup to a precomputed bounded pointer and drafts permanently preview-only.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Observation eligibility and ranking | API / Backend | — | Pure deterministic domain policy over Phase 24 records. [VERIFIED: `src/health/catalog.mjs`] |
| Dismissal, snooze, correction, draft persistence | Database / Storage | API / Backend | Router-owned local JSON state with restrictive permissions and atomic writes. [VERIFIED: `src/health/store.mjs`] |
| `/router suggestion` interaction | API / Backend | Browser / Client | The canonical CLI dispatcher owns parsing/envelopes; terminal rendering is only a projection. [VERIFIED: `src/cli/router-control.mjs`, `25-UI-SPEC.md`] |
| Startup pointer | Frontend Server (SSR) | API / Backend | The prompt adapter may render only a precomputed decision; health calculation remains off-path. [VERIFIED: `src/context/prompt-route.mjs`, `tests/router.health.privacy.test.mjs`] |
| Draft approval | API / Backend | Database / Storage | Approval is re-derived against current proposal state before the draft artifact is persisted. [VERIFIED: `src/orchestrator/approval.mjs`] |
| Capability installation/publication | — | — | Explicitly outside Phase 25. [VERIFIED: `25-CONTEXT.md`] |

## Project Constraints (from supplied AGENTS.md instruction)

- Prefix every shell command with `rtk`. [VERIFIED: `/Users/guilherme/.codex/RTK.md`]
- Use RTK-filtered output for repository inspection and test execution. [VERIFIED: `/Users/guilherme/.codex/RTK.md`]
- Preserve existing/user worktree edits; the current worktree contains unrelated modified, deleted, and untracked files. [VERIFIED: `rtk git status --short`]
- The project-local Excalidraw skill is not applicable because this phase produces terminal output and no requested diagram artifact. [VERIFIED: `.agents/skills/excalidraw-diagram/SKILL.md`, `25-UI-SPEC.md`]
- Ponytail constraint: reuse current modules and add the minimum code; do not create speculative abstractions or dependencies. [VERIFIED: active session instruction]

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js standard library | 22.22.3 installed | `node:crypto`, `node:fs`, `node:path` for fingerprints and durable local files | Already used throughout Router; no package installation is needed. [VERIFIED: `node --version`, codebase grep] |
| Existing `src/health/catalog.mjs` | repository source | Bounded evidence input | It already owns observation vocabulary and HLTH-10 fields. [VERIFIED: `src/health/catalog.mjs`] |
| Existing `src/health/thresholds.mjs` | `health-policy-v1` | Cooldown and versioned policy constants | `COOLDOWN_MS` already exists and is testable. [VERIFIED: `src/health/thresholds.mjs`] |
| Existing `src/cli/router-control.mjs` | schema version 1 envelope | CLI command dispatch, output safety, exit codes | It is the canonical operator surface. [VERIFIED: `src/cli/router-control.mjs`] |
| Existing `src/orchestrator/approval.mjs` | `approval-policy-v1` | Exact stale/mismatch approval gate | It binds capability/proposal/targets/effects and fails closed. [VERIFIED: `src/orchestrator/approval.mjs`] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `stableStringify` | repository source | Canonical ordering before hashing/rendering | Fingerprints and deterministic state/preview payloads. [VERIFIED: `src/registry/schema.mjs`] |
| `contentFingerprint` / SHA-256 | repository source / Node stdlib | Stable opaque identifiers | Suggestion and draft fingerprints; never expose raw evidence. [VERIFIED: `src/registry/identity.mjs`, `src/orchestrator/approval.mjs`] |
| `createHealthStore` durability pattern | repository source | Locking, 0700 directory, 0600 atomic state writes | Copy the small storage pattern into a suggestion-specific store or extract only if direct reuse is clean. [VERIFIED: `src/health/store.mjs`] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New policy module | Put all logic in `router-control.mjs` | Fewer files but mixes domain ranking with CLI parsing and makes deterministic unit tests harder; use one pure module. [VERIFIED: existing separation in `src/health/catalog.mjs` and `src/health/admin.mjs`] |
| New suggestion-specific store | Overload `health/state.json` | One less file, but couples advisory interactions to health reset/dispose/recover semantics; keep sibling ownership. [VERIFIED: `src/health/admin.mjs`, `25-CONTEXT.md`] |
| Precomputed startup pointer | Derive observations in the hook | Violates the existing hot-path isolation contract. [VERIFIED: `tests/router.health.privacy.test.mjs`] |

**Installation:** none.

## Package Legitimacy Audit

No external packages are installed or recommended. The package legitimacy gate is not applicable. [VERIFIED: codebase and phase scope]

## Architecture Patterns

### System Architecture Diagram

```text
Phase 24 local health state
        |
        v
deriveObservations()  (off prompt hot path)
        |
        v
eligibility -> deterministic rank -> select exactly one
        | no qualifying item
        +--------------------------> suggestion_none / silent startup
        |
        v
stable suggestion fingerprint
        |
        v
local interaction state (dismiss / snooze / correction / cooldown)
        | suppressed
        +--------------------------> suggestion_none / silent startup
        |
        +--> precomputed compact pointer --> startup renders exact one line
        |
        +--> /router suggestion inspect --> canonical detail envelope
                                         |
                                         v
                              explicit draft approval?
                                | no          | yes + fresh
                                v             v
                         approval_required   preview-only draft JSON
                                                   |
                                                   v
                                     exact bounded preview; no publish/install
```

All ranking and persistence occur off the prompt-time health path; the prompt adapter receives only a precomputed bounded pointer. [VERIFIED: `src/health/catalog.mjs`, `tests/router.health.privacy.test.mjs`]

### Recommended Project Structure

```text
src/
├── suggestion/
│   ├── policy.mjs       # pure eligibility, ranking, projection, fingerprint
│   └── store.mjs        # local interaction/correction/draft state only
├── cli/
│   └── router-control.mjs
└── context/
    └── prompt-route.mjs # only if this is the confirmed startup seam

tests/
├── router.suggestion.policy.test.mjs
├── router.suggestion.store.test.mjs
├── router.suggestion.cli.test.mjs
├── router.suggestion.draft.test.mjs
└── router.suggestion.startup.test.mjs
```

Do not add a service layer, repository interface, renderer framework, dashboard, or separate command executable. [VERIFIED: `25-CONTEXT.md`, Ponytail constraint]

### Pattern 1: Pure deterministic selection

**What:** Validate/filter first, compute a versioned integer priority, sort with explicit stable tie-breakers, then return `ranked[0] ?? null`.

**When to use:** Every detail or pointer refresh. Persist the fingerprint, not the whole ranked list.

Recommended ordering:

1. actionability class priority: `missing_dependency`, `missing_category`, `ineffective`, `reusable_workflow`, `stale`, `unmapped`, `overlap`, `duplicate`, `long_unused`; treat `complementary/no_action` as ineligible;
2. confidence descending;
3. freshness (`fresh` only for startup; detail may still report none rather than leak stale/low confidence);
4. opportunity/sample evidence descending;
5. `reason_code`;
6. joined sorted affected IDs;
7. fingerprint.

The exact weights are discretionary, but the policy version and tie-break chain must be constants tested with input permutation. [VERIFIED: `25-CONTEXT.md`, `src/health/catalog.mjs`]

### Pattern 2: State suppression by fingerprint

**What:** A suggestion fingerprint covers the policy version and semantic advisory projection: observation kind, reason code, sorted affected IDs, remedy, confidence, evidence window, and route-effect/draft class. Dismissal suppresses that exact fingerprint; snooze suppresses until a bounded epoch; cooldown records last notification; a materially changed observation naturally receives a new fingerprint.

**When to use:** Before startup output and before returning detail.

Do not fingerprint timestamps such as “now” or mutable presentation text; that defeats deduplication. [VERIFIED: existing canonical hashing in `src/orchestrator/approval.mjs` and `src/registry/activate.mjs`]

### Pattern 3: Approval authorizes only draft persistence

**What:** Create a proposal envelope from the current suggestion, bind approval to its fingerprint, exact paths, declared effects (`draft_file_only`), and proposal version, then re-derive the expected binding immediately before writing. A stale/mismatched approval blocks. The write target must be under `ownedRoot/suggestions/drafts/`.

**When to use:** Only the missing-capability remediation branch after an explicit approve action.

Do not pass a capability installation effect to the existing dispatcher. The authorized effect is creation of a preview artifact, not capability mutation. [VERIFIED: `src/orchestrator/approval.mjs`, `25-CONTEXT.md`]

### Pattern 4: Canonical bounded terminal projection

**What:** Return `{schema_version, command, ok, reason_code, data, warnings}` and render with safe tokens / stable JSON ordering. Use exact UI-spec copy for startup, empty, action, approval, preview warning, and error states.

**When to use:** All `suggestion` subcommands.

Suggested minimal CLI grammar:

```text
router-control suggestion
router-control suggestion dismiss --confirm <fingerprint>
router-control suggestion snooze --confirm <fingerprint> --until <epoch-ms>
router-control suggestion correct --confirm <fingerprint> --proposal-json <json>
router-control suggestion draft --confirm <fingerprint> [--execute --approval <token>]
```

If adding `--until`, `--proposal-json`, or `--approval`, extend the existing strict parser allowlist; unknown flags must continue to fail as `unknown_option`. [VERIFIED: `src/cli/router-control.mjs`]

### Anti-Patterns to Avoid

- **Health derivation in `UserPromptSubmit`:** ranking, history reads, or health imports on the hot path violate the existing isolation test. Use a precomputed pointer. [VERIFIED: `tests/router.health.privacy.test.mjs`]
- **Second observation engine:** do not reinterpret raw outcome history in Phase 25; consume Phase 24 observations. [VERIFIED: `src/health/catalog.mjs`]
- **Unranked output disguised as overview:** the overview may contain aggregate counts only, never the observation list. [VERIFIED: UX-03, UX-09]
- **Approval reused as install authority:** approval is bound to `draft_file_only`; never call activation/publication/installer code. [VERIFIED: UX-06, UX-08]
- **Correction as authoritative edit:** store a versioned proposal and keep routing unchanged. [VERIFIED: `25-CONTEXT.md`]
- **Timestamp-based fingerprints:** they make every refresh novel and defeat dismissal/cooldown. [VERIFIED: deterministic fingerprint patterns in `src/orchestrator/approval.mjs`]
- **Free-form evidence rendering:** capability-authored values are untrusted; expose only allowlisted identifiers and bounded canonical fields. [VERIFIED: `src/cli/router-control.mjs` safe projection helpers]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Hashing | Custom hash/checksum | Node `createHash('sha256')` and existing canonical stringify | Existing project security pattern. [VERIFIED: `src/orchestrator/approval.mjs`] |
| Approval freshness | Boolean `approved` flag | `bindApproval` + `verifyApproval` with re-derived expected token | Existing stale/mismatch fail-closed gate. [VERIFIED: `src/orchestrator/approval.mjs`] |
| Health evidence | New telemetry/history analyzer | `deriveObservations` output | Already privacy-bounded and catalogued. [VERIFIED: `src/health/catalog.mjs`] |
| Cooldown constant | New duration/config system | `COOLDOWN_MS` | Already versioned in health policy. [VERIFIED: `src/health/thresholds.mjs`] |
| Atomic persistence | Plain `writeFileSync` over live state | Existing temp + fsync + rename + 0600 pattern | Avoids torn state and preserves restrictive permissions. [VERIFIED: `src/health/store.mjs`] |
| CLI envelope | New response type | `canonical()` result shape | Existing clients/tests depend on it. [VERIFIED: `src/cli/router-control.mjs`] |
| Output sanitization | Free-form string interpolation | Existing safe token/path/fingerprint projections | Input boundary already hardened. [VERIFIED: `src/cli/router-control.mjs`] |

**Key insight:** The phase needs orchestration and policy, not new infrastructure; the safety properties already exist in adjacent modules.

## Common Pitfalls

### Pitfall 1: Startup becomes a second hot-path analyzer
**What goes wrong:** Prompt submission reads outcomes and derives/ranks observations.  
**Why it happens:** “Startup suggestion” is implemented at the most visible hook rather than precomputed off-path.  
**How to avoid:** Publish only a compact pointer after background/admin health work; prompt/startup code performs one bounded read and exact rendering.  
**Warning signs:** Any `src/health/` import in deployed router hook or any call to `deriveObservations` from `prompt-route.mjs`. [VERIFIED: `tests/router.health.privacy.test.mjs`]

### Pitfall 2: Cooldown and snooze use wall-clock values in identity
**What goes wrong:** The fingerprint changes each run, so dismissal and cooldown never match.  
**Why it happens:** Generated timestamps are included in the canonical payload.  
**How to avoid:** Fingerprint semantic content only; store timestamps beside the fingerprint.  
**Warning signs:** Same observation produces different fingerprints under two `now` values. [VERIFIED: project canonical fingerprint patterns]

### Pitfall 3: “Expected benefit” becomes invented prose
**What goes wrong:** The CLI makes unsupported claims or renders capability-authored text.  
**Why it happens:** UX-04 is satisfied with generated narrative rather than a bounded policy mapping.  
**How to avoid:** Map each observation/reason code to a short fixed benefit and risk token; retain original counts/confidence as evidence.  
**Warning signs:** Benefit strings contain capability descriptions, prompts, or arbitrary source fields. [VERIFIED: `src/health/catalog.mjs`, `src/cli/router-control.mjs`]

### Pitfall 4: Draft approval silently expands authority
**What goes wrong:** The approved path installs or publishes a capability.  
**Why it happens:** Draft creation shares a generic mutation function with activation.  
**How to avoid:** Persist only under the suggestion draft root; add import-deny and protected-artifact hash tests.  
**Warning signs:** Suggestion modules import `activate.mjs`, `publish-index.mjs`, lifecycle, adapters, or installers. [VERIFIED: UX-06, UX-08 and Phase 24 isolation tests]

### Pitfall 5: Empty state leaks rejected observations
**What goes wrong:** Low-confidence or stale findings appear in warnings or an overview array.  
**Why it happens:** The code returns filtered-out candidates for debugging.  
**How to avoid:** `suggestion_none` contains only the compact overview allowed by the contract and exact empty-state copy.  
**Warning signs:** `observations`, `rejected`, or `candidates` arrays appear in empty output. [VERIFIED: `25-CONTEXT.md`, `25-UI-SPEC.md`]

### Pitfall 6: Health reset unexpectedly erases advisory choices
**What goes wrong:** Dismissals/corrections disappear or recover with health state.  
**Why it happens:** Suggestion state is stored inside `health/state.json`.  
**How to avoid:** Use `ownedRoot/suggestions` as an isolated sibling and define its own bounded lifecycle.  
**Warning signs:** `health reset|dispose|recover` modifies suggestion files. [VERIFIED: `src/health/admin.mjs`, user-selected local layout discretion]

## Code Examples

Verified patterns from repository sources:

### Deterministic one-item selection

```js
// Source pattern: src/health/catalog.mjs and src/registry/schema.mjs
export function selectSuggestion(observations, state, now) {
  return observations
    .filter((item) => eligible(item, state, now))
    .map(projectSuggestion)
    .sort(compareSuggestions)[0] ?? null;
}
```

The production implementation must bound input length and make `compareSuggestions` a total ordering. [VERIFIED: `src/health/catalog.mjs` bounded/sorted return pattern]

### Fail-closed fresh approval

```js
// Source: src/orchestrator/approval.mjs
const expected = bindApproval(currentProposal);
const approval = verifyApproval({ bound, presented, expected });
if (approval.status !== 'approved') {
  return { ok: false, reason_code: approval.reason_code };
}
```

Re-derive `currentProposal` from the current suggestion fingerprint immediately before the draft-only write. [VERIFIED: `src/orchestrator/approval.mjs`]

### Atomic state discipline

```js
// Source pattern: src/health/store.mjs
writeFileSync(tempPath, `${stableStringify(state)}\n`, { mode: 0o600 });
fsyncSync(openSync(tempPath, 'r'));
renameSync(tempPath, statePath);
```

Use the existing mutation-lock and directory-sync pattern too; the abbreviated example is not a complete durability implementation. [VERIFIED: `src/health/store.mjs`]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Frequency-oriented recommendations | Opportunity-aware, confidence/reversibility/recency-weighted health observations | Phase 24 | Phase 25 should consume the conservative catalog rather than rank raw frequency. [VERIFIED: `src/health/score.mjs`] |
| Generic mutation confirmation | Exact proposal/capability/target/effect/version-bound approval | Phase 23 | Draft creation can fail closed on stale or mismatched approval. [VERIFIED: `src/orchestrator/approval.mjs`] |
| Direct mutable active files | Immutable versions plus verified pointer replacement | Existing registry lifecycle | Phase 25 must not touch active publication state at all. [VERIFIED: `src/registry/activate.mjs`] |
| Broad health output | Bounded catalog and paginated canonical inspection | Phase 24 | Suggestion overview should be aggregate-only and exactly one detail item. [VERIFIED: `src/health/catalog.mjs`, `src/cli/router-control.mjs`] |

**Deprecated/outdated:**
- Using raw frequency as “usefulness” is incompatible with Phase 24 scoring. [VERIFIED: `src/health/score.mjs`]
- Treating a preview or correction as routing authority is incompatible with the current approval and publication boundaries. [VERIFIED: `src/orchestrator/approval.mjs`, `src/registry/activate.mjs`]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | [RESOLVED] `src/context/prompt-route.mjs` is the read-only startup consumer; `refreshSuggestionPointer` and its off-hot-path mutation callers are the producer seam. | Summary / Architecture | Closed by Plan 25-04 with structural and injected-I/O tests. |
| A2 | [ASSUMED] `ownedRoot/suggestions` is the preferred discretionary local layout. | Architecture | Low; layout can change without altering behavior if it remains isolated and contained. |

## Resolved Questions

1. **RESOLVED — startup seam and refresh producer**
   - Phase 25 uses a conservative off-hot-path producer, `refreshSuggestionPointer`, to recompute and atomically replace one bounded availability pointer whenever accepted health evidence or local advisory state changes. The accepted-outcome seam in `src/health/observe.mjs`, health reset/dispose/recover seams in `src/health/admin.mjs`, and `/router suggestion` interaction seam in `src/cli/router-control.mjs` are the concrete callers. [RESOLVED: Plan 25-04]
   - `src/context/prompt-route.mjs` is only the startup consumer. It reads the fixed bounded pointer and emits either the exact UI-contract line or silence. It never derives health, ranks observations, reads history, performs filesystem discovery, makes a network/model call, or mutates steward state. [VERIFIED: `25-UI-SPEC.md`, `tests/router.health.privacy.test.mjs`, UX-01/UX-02]

2. **RESOLVED — draft eligibility**
   - Draft creation is limited to missing-capability remediation per UX-06. The catalog encodes that class as `missing_category` and `missing_dependency`; those two tokens may enter the guarded draft flow. Every other observation kind remains inspect/dismiss/snooze/correct only and cannot produce a draft. [VERIFIED: UX-06, `src/health/catalog.mjs`, Plan 25-02]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | implementation and tests | ✓ | 22.22.3 | — |
| npm | existing project tooling only | ✓ | 10.9.8 | No install needed |
| Local health/catalog modules | suggestion input | ✓ | Phase 24 source present | — |
| Graphify graph | architectural discovery | ✓ but stale | 1124 nodes, 121h old, 82 commits behind | Source/tests are authoritative |

**Missing dependencies with no fallback:** none. [VERIFIED: environment probes]

**Missing dependencies with fallback:** none. The graph returned no nodes for the Phase 25 queries and is stale, so all architectural conclusions were corroborated directly in current source/tests. [VERIFIED: `graphify status` and query output]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node built-in `node:test`, Node 22.22.3 [VERIFIED: tests and environment] |
| Config file | none |
| Quick run command | `rtk node --test tests/router.suggestion.*.test.mjs` |
| Full suite command | `rtk node --test --test-concurrency=1 tests/*.test.mjs` |

The config's existing `rtk node --test tests/*.test.mjs` is valid, but prior project evidence requires serial execution for the full lifecycle suite. [VERIFIED: `.planning/config.json`; repository memory not used as artifact evidence]

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UX-01 | silence unless all gates pass | unit + integration | `rtk node --test tests/router.suggestion.startup.test.mjs` | ❌ Wave 0 |
| UX-02 | exact compact pointer, fingerprint dedupe, cooldown | unit + integration | `rtk node --test tests/router.suggestion.startup.test.mjs` | ❌ Wave 0 |
| UX-03 | exactly one ranked item and compact overview | unit + CLI | `rtk node --test tests/router.suggestion.policy.test.mjs tests/router.suggestion.cli.test.mjs` | ❌ Wave 0 |
| UX-04 | bounded required detail fields | CLI | `rtk node --test tests/router.suggestion.cli.test.mjs` | ❌ Wave 0 |
| UX-05 | inspect/dismiss/snooze/correct; protected bytes unchanged | integration | `rtk node --test tests/router.suggestion.store.test.mjs tests/router.suggestion.cli.test.mjs` | ❌ Wave 0 |
| UX-06 | approval → draft only; stale/mismatch blocked | integration | `rtk node --test tests/router.suggestion.draft.test.mjs` | ❌ Wave 0 |
| UX-07 | complete exact preview schema | unit | `rtk node --test tests/router.suggestion.draft.test.mjs` | ❌ Wave 0 |
| UX-08 | no automatic mutation/import; protected hashes unchanged | security integration | `rtk node --test tests/router.suggestion.draft.test.mjs tests/router.suggestion.store.test.mjs` | ❌ Wave 0 |
| UX-09 | no list/dashboard/timeline/extra command family | CLI negative | `rtk node --test tests/router.suggestion.cli.test.mjs` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `rtk node --test tests/router.suggestion.*.test.mjs`
- **Per wave merge:** focused suggestion tests plus directly touched existing suites (`router.health.*`, `router.control-cli`, `router.approval`, `router.context-prompt-integration`)
- **Phase gate:** `rtk node --test --test-concurrency=1 tests/*.test.mjs`

### Wave 0 Gaps

- [ ] `tests/router.suggestion.policy.test.mjs` — permutation invariance, eligibility, ranking, one-item bound, stable fingerprint.
- [ ] `tests/router.suggestion.store.test.mjs` — permissions, atomicity, corruption, lock, dismissal/snooze/correction versioning, protected artifacts.
- [ ] `tests/router.suggestion.cli.test.mjs` — grammar, exact envelopes/copy, negative commands, no list leakage.
- [ ] `tests/router.suggestion.draft.test.mjs` — approval missing/stale/mismatch/fresh, complete preview, draft-only effects.
- [ ] `tests/router.suggestion.startup.test.mjs` — silent bytes, exact pointer line, corrupt/stale state fail-open, hot-path isolation.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Local CLI has no authentication boundary in this phase. [VERIFIED: phase scope] |
| V3 Session Management | no | No session mechanism is introduced. [VERIFIED: phase scope] |
| V4 Access Control | yes | Exact fingerprint/proposal-bound approval; contained Router-owned paths; preview-only effect. [VERIFIED: `src/orchestrator/approval.mjs`] |
| V5 Input Validation | yes | Strict CLI option allowlist, bounded integers/JSON, safe tokens/paths/fingerprints, closed schemas. [VERIFIED: `src/cli/router-control.mjs`] |
| V6 Cryptography | yes | Node SHA-256 through existing approval/fingerprint patterns; never hand-roll. [VERIFIED: `src/orchestrator/approval.mjs`] |

### Known Threat Patterns for Node local CLI

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal / scope escape in draft targets | Tampering | Resolve/contain every target and reject absolute, `..`, symlink, or out-of-root paths. [VERIFIED: existing path safety patterns in `src/cli/router-control.mjs` and registry modules] |
| Capability-authored text injected into terminal output | Spoofing | Allowlist fields and sanitize control characters; no arbitrary evidence prose. [VERIFIED: `src/cli/router-control.mjs`] |
| Stale approval applied to changed draft | Tampering | Re-derive expected approval from current proposal and fail closed. [VERIFIED: `src/orchestrator/approval.mjs`] |
| Symlink swap / torn advisory state | Tampering | Contained path, lstat checks, mutation lock, temp/fsync/rename, 0600. [VERIFIED: `src/health/store.mjs`, `src/registry/activate.mjs`] |
| Sensitive health data disclosure | Information Disclosure | Persist only bounded IDs/reason codes/counts/fingerprints; no raw prompt/evidence text or network. [VERIFIED: `tests/router.health.privacy.test.mjs`] |
| Advisory code mutates authoritative artifacts | Elevation of Privilege | Import-deny tests plus before/after hashes of active registry, mappings, weights, compiled index, and capability roots. [VERIFIED: `tests/router.health.admin.test.mjs`] |

## Sources

### Primary (HIGH confidence)

- `.planning/phases/25-advisory-stewardship-and-guarded-drafts/25-CONTEXT.md` — locked product decisions and scope.
- `.planning/phases/25-advisory-stewardship-and-guarded-drafts/25-UI-SPEC.md` — exact terminal states and copy.
- `.planning/REQUIREMENTS.md` — UX-01 through UX-09 and Phase 26 boundary.
- `src/health/catalog.mjs`, `score.mjs`, `thresholds.mjs`, `store.mjs` — Phase 24 evidence, policy, and persistence contracts.
- `src/cli/router-control.mjs` — canonical CLI parsing, envelope, projections, and command patterns.
- `src/orchestrator/approval.mjs` — bound approval and stale/mismatch behavior.
- `src/registry/activate.mjs` — preview/fingerprint/atomic patterns and authoritative mutation boundary.
- `tests/router.health.privacy.test.mjs`, `router.health.admin.test.mjs`, `router.approval.test.mjs`, `router.control-cli.test.mjs` — executable safety contracts.

### Secondary (MEDIUM confidence)

- `.planning/graphs/graph.json` — queried but stale and returned no Phase 25 nodes; not used as sole support.

### Tertiary (LOW confidence)

- None. No web or training-only technical recommendation is needed.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependency; all primitives exist in current repository and installed Node runtime.
- Architecture: HIGH except startup seam — current source/test boundaries are explicit.
- Startup seam: MEDIUM — exact meaning of “startup” is not named in the phase artifacts.
- Pitfalls: HIGH — derived from executable isolation, approval, and protected-artifact tests.

**Research date:** 2026-07-28  
**Valid until:** 2026-08-27, or until Phase 24/26 publication boundaries change.
