# Phase 24: Privacy-Safe Outcomes and Capability Health - Research

**Researched:** 2026-07-27
**Domain:** Local outcome observation, capability health classification, privacy-bounded persistence, canary-guarded calibration
**Confidence:** HIGH (code surface traced directly; one cross-phase gap called out)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Capability learning stays fully local and stores bounded outcome metadata, never raw prompts or arbitrary content.
- Outcome/health data lives entirely under `~/.claude/router/` (or its codex dual). No prompt data, capability metadata beyond a stable local id, telemetry, usage, health evidence, or recommendation state leaves the local machine.
- Health state is orthogonal to the authoritative registry and the active routing map: resetting/disposing/recovering health must never mutate capability definitions or `mode-map.json` / the active tuple.
- All publication of health policy still flows through the existing verifier → canary → last-known-good → rollback → recovery lifecycle (v1.2/Phase 18, extended by Phase 26). **Health is a tuple member by Phase 26** — Phase 24 produces state in a form that *can* become a tuple member later, but does NOT publish through the tuple itself.
- Prompt-time routing stays a bounded read-only projection; health computation never runs on the prompt hot path (Phase 26 REL-01 reaffirms). Health is observed/published out-of-band.
- Framework-neutral: do not assume GSD/Gstack/Claude/Codex as default ecosystem; health operates on semantic-category + contract envelope, not framework names.

### Claude's Discretion
All implementation choices are at Claude's discretion — discuss phase was skipped per `workflow.skip_discuss`. Use ROADMAP phase goal, success criteria, REQUIREMENTS, and codebase conventions to guide decisions. Plan must calibrate opportunity-aware outcome semantics, sample floors, decay, and scope isolation.

### Deferred Ideas (OUT OF SCOPE)
- Stronger ineffective-capability classification — Phase 24 ships the conservative baseline; deeper classification may be deferred if evidence is insufficient per HLTH-07.
- Broader multilingual execution calibration — Phase 24 ships versioned, testable, locally derived calibration plumbing; the broader corpus lands later.
- `/router suggestion` UI, advisory stewardship, draft preview, missing-capability remediation — those are Phase 25 (UX-01..09).
- Tuple publication of health policy — that is Phase 26 (REL-03).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HLTH-01 | Background analysis stores no raw prompts, transcripts, secrets, arbitrary tool output, source documents, or unbounded arguments. | Reuse `redact()` + `promptSignature()` + `validateEvidenceEnvelope()` FIELDS allowlist from router.mjs/evidence.mjs; extend allowlist with bounded outcome fields only. |
| HLTH-02 | No prompt data, capability metadata, telemetry, usage, health evidence, or recommendation state leaves the local machine. | All state under `~/.claude/router/health/` with 0600 perms, atomic writes, project+aggregate isolation (mirror `createPersistentEvidenceStore`). No network calls anywhere. |
| HLTH-03 | Bounded outcome schema distinguishes selected, actually used, completed, corrected, retried, replaced, abandoned, overridden, and helpful reuse events. | New `outcome_kind` enum; derive from Phase 23 dispatch dispositions (8-disposition intent + 4-gate dispatch) + workflow transition advancement (post-work state). |
| HLTH-04 | Outcome records use allowlisted fields, stable local identifiers, retention limits, decay windows, restrictive permissions, corruption checks, and bounded compaction. | `stableCapabilityId()` from identity.mjs; `HALF_LIFE_MS=24h`, `MAX_RETENTION_MS=7d`, `MINIMUM_SAMPLES=30` from evidence.mjs; atomic temp+rename writes; 0600 perms; SHA-256 fingerprint per record. |
| HLTH-05 | Users can inspect, reset, dispose of, and recover bounded health state without affecting authoritative capability definitions or the active routing map. | New `router health inspect\|reset\|dispose\|recover` subcommands in `modules/cli/router-control.mjs`; health state lives in its own subdir, never writes to `registry/` or `release-tuples/active.json`. |
| HLTH-06 | Usefulness scoring considers opportunity exposure, completion, verification, correction, retry, replacement, abandonment, override, recency, reversibility, and confidence rather than frequency alone. | New usefulness scorer module; weighted combination over outcome_kind counts + recency (exponential half-life) + reversibility flag from contract envelope; per-capability, not per-route. |
| HLTH-07 | Rare, recovery-oriented, incident-response, release, and migration capabilities are not classified as useless solely because they are infrequently invoked. | `semantic_type` / `lifecycle_role` from schema.mjs gates the scorer: capabilities whose `lifecycle_role` ∈ {recovery, incident, release, migration} are exempt from low-frequency penalties; "unjudged" tier when evidence < sample floor. |
| HLTH-08 | Router identifies missing categories, missing dependencies, unmapped capabilities, stale capabilities, long-unused capabilities, exact duplicates, semantic overlaps, complementary compositions, and repeatedly ineffective selections. | Observation catalog module; reuse Phase 22 relationship graph (semantic overlaps, complementary, duplicates) + Phase 21 registry (missing deps, unmapped) + outcome history (long-unused, repeatedly ineffective). |
| HLTH-09 | Router detects repeated multi-step workflows that are strong candidates for reusable skills or agents and distinguishes healthy repetition from repetition caused by failure or correction. | Sequence detection over outcome records: count consecutive `completed` (healthy) vs `corrected`/`retried` (failure-driven) per capability chain; new `reusable_workflow` observation kind with opportunity count. |
| HLTH-10 | Every health observation includes reason codes, evidence window, sample size or opportunity count, freshness, affected capability IDs, confidence, and a non-destructive remedy. | Observation record shape frozen by schema; `reason_code`, `evidence_window_ms`, `sample_size`/`opportunity_count`, `freshness`, `affected_capability_ids[]`, `confidence_basis_points`, `remedy` (non-destructive — never auto-mutate). |
| HLTH-11 | Health thresholds, sample floors, decay, cooldown, and multilingual calibration remain versioned, testable, locally derived, and guarded by canary evidence. | Versioned constants with `policy_version` strings; reuse `MINIMUM_SAMPLES`, `HALF_LIFE_MS`, `MAX_RETENTION_MS` from evidence.mjs; canary-guarded via existing `evaluateCandidate`/`applyCanaryDecision` path in canary-controller.mjs. Multilingual: versioned calibration corpus plumbing (deferred broader corpus). |
</phase_requirements>

## Summary

Phase 24 adds a local, out-of-band capability-health observer to a v1.3 router that today has no post-work outcome signal. The router hook (`~/.claude/hooks/router.mjs`) writes one telemetry record per `UserPromptSubmit` with `outcome: null` and `downstream_invocations: null` — those fields were reserved in v1 but never populated. Phase 24 must add the observation path that closes that loop, plus the catalog/scorer/admin surface that turns observations into trustworthy, non-destructive capability-health signals.

The good news: every privacy and persistence primitive Phase 24 needs already exists and is battle-tested. `promptSignature()` (sha256 over `redact()`-filtered normalized prompt + intent keywords), `validateEvidenceEnvelope()` (a frozen FIELDS allowlist that rejects `forbidden_evidence_field`), `createPersistentEvidenceStore` (project+aggregate isolation under `~/.claude/router/evidence/`, 0600 perms, 24h half-life, 7d retention, 30-sample floor), and the canary-controller gate suite (`REQUIRED_GATES`, `evaluateCandidate`, `applyCanaryDecision`) are all directly reusable. The contract envelope (`stableCapabilityId`, `semantic_type`, `lifecycle_role`, `CONTRACT_FIELDS`) gives Phase 24 the framework-neutral attachment point health observations must use — never framework names.

**The one gap the planner must call out explicitly:** Phase 23's dispatch boundary (`actions.mjs` → `synthesizeNextPrompt`) does not currently emit a persisted post-work signal. `synthesizeNextPrompt` accepts a `postWorkState` argument and re-runs `nextValidTransitions` to surface the *next* transition, but nothing is appended to telemetry or any other journal when a capability actually completes. The registry's `activate.mjs` journal only records rollback `outcome: 'completed'`/`'not_committed'` events — that is activation lifecycle, not capability-dispatch outcome. Phase 24 has three viable options (detailed in Open Questions): (a) extend the router hook to write a second outcome record on the next `UserPromptSubmit` after a transition advances, (b) add a router-owned `Stop`/`SubagentStop` hook binding to write outcome records, or (c) derive outcomes entirely in the watcher by diffing workflow-state over time. Option (a) is the least invasive and respects the "no new hook binding" posture; option (b) is cleanest but adds a binding; option (c) is purely offline but loses per-prompt correlation.

**Primary recommendation:** Build Phase 24 as four waves that mirror the v1.2/v1.3 pattern — (1) bounded outcome schema + privacy boundary + persistent store, (2) observation capture (off-hot-path) + usefulness scoring, (3) health observation catalog + reason codes/evidence windows/remedies + admin inspect/reset/dispose/recover, (4) versioned thresholds + decay + cooldown + multilingual calibration plumbing + canary guard. Each wave is independently verifiable. Do NOT publish health through the release tuple in this phase — that is Phase 26 (REL-03).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Outcome observation capture | Background watcher / off-hot-path observer | — | Health is observed/published out-of-band (CONTEXT.md); must never run on UserPromptSubmit. The existing watcher (Phase 12) is the proven off-hot-path surface. |
| Privacy boundary (allowlist, redaction, no-raw-content) | Shared stdlib module (router.mjs + evidence.mjs) | — | Reuse the existing `promptSignature`/`redact`/`validateEvidenceEnvelope` primitives so outcome records inherit the same posture as telemetry. |
| Capability identity attachment | Registry identity layer (`stableCapabilityId`) | Contract envelope (`semantic_type`, `lifecycle_role`) | Health observations attach to the stable local id, never framework names (CONTEXT.md framework-neutral invariant). |
| Usefulness scoring | Background analysis module | — | Computed off the prompt hot path; per-capability weighted combination over outcome kinds + recency + reversibility. |
| Health observation catalog | Background analysis module | Relationship graph (Phase 22) | Missing/unavailable/stale/unused/duplicate/overlapping/complementary/ineffective/reusable-workflow observations derive from registry + relationships + outcome history together. |
| Admin (inspect/reset/dispose/recover) | CLI (`modules/cli/router-control.mjs`) | — | Existing operator CLI; new `health` subcommand family. Must never mutate `registry/` or `release-tuples/active.json`. |
| Versioned thresholds + canary guard | Evolution layer (`evidence.mjs`, `canary-controller.mjs`) | — | Reuse `MINIMUM_SAMPLES`/`HALF_LIFE_MS`/`MAX_RETENTION_MS` + `evaluateCandidate` gate suite; version via `policy_version` strings. |
| Prompt-time routing | UserPromptSubmit hook (router.mjs) | — | Stays a bounded read-only projection (REL-01). Health never computed here. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js stdlib (`node:crypto`, `node:fs`, `node:path`, `node:os`) | built-in (Node ≥18) | All I/O, hashing, JSON, atomic writes | Zero dependencies — same constraint as the rest of the router. The hook is a single `.mjs` with no `node_modules`; Phase 24 modules must match. [VERIFIED: codebase — router.mjs:23-24, evidence.mjs:1-3] |
| `stableCapabilityId` (from `src/registry/identity.mjs`) | existing | Stable local capability id; never framework name | The canonical attachment key for health observations. [VERIFIED: codebase — identity.mjs:21] |
| `validateEvidenceEnvelope` / FIELDS allowlist (from `src/evolution/evidence.mjs`) | existing | Bounded content-free persistence contract | The Phase 21 allowlist discipline for capability-authored values crossing persistence. Phase 24 outcome records extend this allowlist, not bypass it. [VERIFIED: codebase — evidence.mjs:6-53] |
| `promptSignature` / `redact` (from `~/.claude/hooks/router.mjs`) | existing | sha256 over redacted normalized prompt + intent keywords | The privacy posture every outcome record must inherit. [VERIFIED: codebase — router.mjs:1598-1610] |
| `createPersistentEvidenceStore` (from `src/evolution/evidence.mjs`) | existing | Project+aggregate isolated JSONL store under `~/.claude/router/evidence/` with 0600 perms, 24h half-life, 7d retention, 30-sample floor | The proven persistence shape; Phase 24 health store mirrors it under `~/.claude/router/health/`. [VERIFIED: codebase — evidence.mjs:22-24, 178] |
| `evaluateCandidate` / `applyCanaryDecision` / `REQUIRED_GATES` (from `src/evolution/canary-controller.mjs`) | existing | Canary gate suite | HLTH-11 canary guard. Phase 24 thresholds pass through this gate before activation. [VERIFIED: codebase — canary-controller.mjs:11, 128, 185] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `nextValidTransitions` (from `src/orchestrator/transitions.mjs`) | existing | Detect workflow transition advancement (post-work signal) | The only existing authoritative signal that a prior capability advanced the workflow — usable as the "completed" outcome trigger. [VERIFIED: codebase — next-prompt.mjs:30-40] |
| `buildCapabilityContract` / `CONTRACT_FIELDS` (from `src/registry/contract.mjs`) | existing | Contract envelope with `freshness`, `confidence_basis_points`, `evidence` (bounded) | Source of `lifecycle_role` and `reversibility` signals for HLTH-06/07. [VERIFIED: codebase — contract.mjs:4, 202] |
| `canonicalizeCapability` / `stableStringify` (from `src/registry/schema.mjs`) | existing | Deterministic serialization for fingerprints | Outcome/observation record fingerprints. [VERIFIED: codebase — schema.mjs:339, 364] |
| `router-control.mjs` CLI dispatcher (from `~/.claude/router/modules/cli/router-control.mjs`) | existing | Operator CLI surface | Add `health inspect\|reset\|dispose\|recover` subcommands here. [VERIFIED: codebase — router-control.mjs:146, 220, 276] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extend telemetry with outcome records written on next `UserPromptSubmit` | New `Stop`/`SubagentStop` hook binding | Hook binding is cleanest but adds a new binding (CONTEXT.md coexistence posture is "additive, never break existing"). Extending telemetry keeps the hook count stable; downside is one-prompt-late observation. |
| In-process weighted usefulness scorer | External LLM-judge scorer | Violates the no-API-call constraint (CLAUDE.md). In-process stdlib only. |
| New `~/.claude/router/health/` subdir | Reuse `~/.claude/router/evidence/` | Evidence store is canary-specific with its own retention/decay; health observations have different retention and a different consumer (admin CLI + Phase 25 suggestion). Separate dir keeps the canary gate honest. |
| Hand-rolled decay math | `evidence.mjs:computeWeightedSamples` | Reuse — the shared `exponential-half-life-v1` math is already imported by both in-memory and persistent stores; health must use the same decay policy. |

**Installation:**
```bash
# No npm install. No dependencies. Stdlib only.
# Files are deployed by the existing install path (src/lifecycle/router-lifecycle.mjs:355-362).
```

**Version verification:** Not applicable — no external packages. All dependencies are existing in-repo modules verified by direct grep.

## Package Legitimacy Audit

Not applicable — Phase 24 installs zero external packages. All dependencies are existing in-repo stdlib-only modules. The "What NOT to Use" table in `.claude/CLAUDE.md` explicitly forbids npm dependencies for the router; Phase 24 inherits that constraint.

## Architecture Patterns

### System Architecture Diagram

```
UserPromptSubmit (hot path, <100ms, read-only)
  │
  ▼
router.mjs → telemetry.jsonl  (outcome:null, downstream_invocations:null — v1 shape)
  │                                    │
  │                                    │ (existing, off-hot-path)
  ▼                                    ▼
[NO post-work signal today — GAP]   watcher.mjs (Phase 12)
                                     │
                                     │ ingests telemetry.jsonl
                                     ▼
                                   telemetry-bridge.mjs → evidence/ store
                                     │                    │
                                     │                    └─ canary-controller.mjs (gates)
                                     │                          │
                                     │                          ▼
                                     │                     release-tuples/active.json
                                     │
                                     │ (NEW in Phase 24 — off-hot-path observer)
                                     ▼
                                   health observer (NEW)
                                     │  inputs:
                                     │   - telemetry.jsonl (selected/dispatched)
                                     │   - workflow transition advancement (completed)
                                     │   - registry + contract envelope (lifecycle_role, reversibility)
                                     │   - relationship graph (Phase 22: duplicates/overlaps/complementary)
                                     │  outputs:
                                     │   - ~/.claude/router/health/outcomes.jsonl  (bounded outcome records)
                                     │   - ~/.claude/router/health/observations.jsonl (health observation catalog)
                                     │   - ~/.claude/router/health/state.json (current per-capability health)
                                     ▼
                                   health admin CLI (router-control.mjs)
                                     │   `router health inspect|reset|dispose|recover`
                                     │   NEVER writes to registry/ or release-tuples/
                                     ▼
                                   (Phase 25 consumer: /router suggestion)
                                   (Phase 26 consumer: tuple member "health policy")
```

The diagram shows the GAP at the post-work boundary: today nothing in the codebase writes an outcome record when a dispatched capability actually completes. The health observer in Phase 24 must close that loop without touching the hot path.

### Recommended Project Structure
```
src/health/                          # NEW — Phase 24 health subsystem
├── outcome-schema.mjs               # Bounded outcome record schema + allowlist + validators
├── observe.mjs                      # Off-hot-path observer: derives outcome_kind from telemetry + transition diff
├── score.mjs                        # Usefulness scorer (HLTH-06): weighted combination over outcome kinds + recency + reversibility
├── catalog.mjs                      # Health observation catalog (HLTH-08/09): missing/unavailable/stale/unused/duplicate/overlap/complementary/ineffective/reusable
├── admin.mjs                        # inspect/reset/dispose/recover (HLTH-05) — pure functions, never mutate registry/tuple
├── thresholds.mjs                   # Versioned thresholds + decay + cooldown + multilingual calibration plumbing (HLTH-11)
└── canary-bridge.mjs                # Threshold activation through existing canary-controller gates

~/.claude/router/health/            # NEW — health state (scope-isolated, 0600 perms)
├── outcomes.jsonl                  # Append-only bounded outcome records (per-capability)
├── observations.jsonl             # Append-only health observations (one per detected opportunity)
├── state.json                       # Current per-capability health snapshot (atomic temp+rename)
├── cursor.json                      # Incremental ingestion cursor (mirrors evidence/ingest-cursor.json)
└── versions/                        # Versioned threshold/calibration bundles
    └── <policy_version>/

modules/cli/router-control.mjs      # EXTEND — add `health` subcommand family
src/evolution/evidence.mjs          # REUSE — FIELDS, HALF_LIFE_MS, MINIMUM_SAMPLES, createPersistentEvidenceStore
src/evolution/canary-controller.mjs # REUSE — evaluateCandidate, REQUIRED_GATES
src/registry/identity.mjs           # REUSE — stableCapabilityId
src/registry/contract.mjs           # REUSE — CONTRACT_FIELDS, lifecycle_role
src/registry/relationships.mjs       # REUSE — Phase 22 graph for duplicate/overlap/complementary
```

### Pattern 1: Allowlisted Bounded Record (extend the evidence envelope discipline)
**What:** Every persisted health record passes through a `validate*Envelope()` that rejects any field not in a frozen `FIELDS` set. Privacy-denied records (carrying `deny_filtered`/`secret_detected`/`content_detected` guards) are skipped before persistence, never stored.
**When to use:** Every write to `~/.claude/router/health/`.
**Example:**
```javascript
// Source: src/evolution/evidence.mjs:6-53 (existing pattern to mirror)
const OUTCOME_FIELDS = Object.freeze(new Set([
  'timestamp_ms', 'capability_id', 'outcome_kind', 'prompt_signature',
  'route_id', 'confidence_band', 'guard_codes', 'reason_code',
  'evidence_window_ms', 'sample_size', 'opportunity_count', 'freshness',
  'policy_version', 'fingerprint',
]));
const OUTCOME_KINDS = Object.freeze(new Set([
  'selected', 'actually_used', 'completed', 'corrected', 'retried',
  'replaced', 'abandoned', 'overridden', 'helpful_reuse',
]));
export function validateOutcomeEnvelope(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return deny('invalid_outcome_envelope');
  if (Object.keys(input).some((f) => !OUTCOME_FIELDS.has(f))) return deny('forbidden_outcome_field');
  if (!OUTCOME_KINDS.has(input.outcome_kind)) return deny('invalid_outcome_kind');
  if (!/^[a-f0-9]{64}$/.test(input.prompt_signature ?? '')) return deny('invalid_prompt_signature');
  // ... bounded integer checks for sample_size, opportunity_count, evidence_window_ms ...
  return { status: 'accepted', signal: Object.freeze({ ...input }) };
}
```

### Pattern 2: Off-Hot-Path Observation via Watcher Ingestion
**What:** The observer runs inside the existing watcher reconcile loop (or a parallel off-hot-path trigger), reads telemetry + workflow-state diff, and appends outcome records. It never runs on `UserPromptSubmit`.
**When to use:** Every outcome record creation.
**Example:**
```javascript
// Source: src/registry/watcher.mjs:42-75 (existing telemetry ingest pattern to mirror)
export function ingestOutcomeEvidence({ store, telemetryPath, workflowStatePath, cursorPath, now = Date.now() }) {
  // Cursor-based incremental append (mirrors ingestTelemetryEvidence)
  // For each new telemetry record with a route_id:
  //   - correlate with the NEXT workflow transition advancement
  //   - derive outcome_kind: 'selected' (telemetry alone) → 'completed' (transition advanced)
  //     → 'corrected'/'retried' (transition regressed or same-state re-dispatch)
  //     → 'abandoned' (no transition within evidence window)
  //   - validateOutcomeEnvelope, append to outcomes.jsonl
}
```

### Pattern 3: Admin Commands Never Mutate Authoritative State
**What:** `inspect`/`reset`/`dispose`/`recover` operate exclusively on `~/.claude/router/health/`. They must not import or call any function that writes to `registry/`, `release-tuples/active.json`, `mode-map.json`, or `weights.json`.
**When to use:** Every admin command implementation.
**Example:**
```javascript
// Source: ~/.claude/router/modules/cli/router-control.mjs:220-275 (existing pattern to extend)
if (command === 'health') {
  const sub = positional[1];
  if (!['inspect', 'reset', 'dispose', 'recover'].includes(sub)) {
    return { result: canonical('health', false, 'invalid_arguments'), exitCode: EXIT.usage };
  }
  // healthRoot = join(ownedRoot, 'health') — isolated subdir
  // reset: atomic-write state.json to {} ; dispose: rename state.json → state.disposed.json (recoverable)
  // recover: rename state.disposed.json → state.json (or rebuild from outcomes.jsonl)
  // NEVER call activate.mjs, publishCompiledIndex, or write to release-tuples/
}
```

### Anti-Patterns to Avoid
- **Computing health on the hot path:** `UserPromptSubmit` must stay <100ms and read-only. Health scoring is in the watcher / background observer. REL-01 (Phase 26) reaffirms this; Phase 24 must not violate it even though Phase 26 hasn't shipped.
- **Attaching health to framework names:** `record.name` or `record.id` may carry framework prefixes (e.g., `gsd-foo`). Always use `stableCapabilityId(record)` — it includes scope suffix and is framework-neutral. [VERIFIED: codebase — identity.mjs:21]
- **Publishing health through the release tuple in Phase 24:** CONTEXT.md locks "Health is a tuple member by Phase 26." Phase 24 produces the state; Phase 26 wires it into the tuple. Doing it early couples Phase 24 to REL-03 work that hasn't landed.
- **Conflating Phase 24 "health" with the Phase 07 "router doctor" command:** `~/.claude/hooks/router.mjs:1228` `diagnoseRouterState`, `summarizeCoverage`, `listRoutes`, `unmapped` are v1.0 route-coverage diagnostics — they report on the router's own plumbing. Phase 24 HLTH-NN is capability health — observations about the capabilities the router dispatches to. Different concern, different state, different CLI surface (`router health` vs the existing `router doctor`/`router coverage`).
- **Adding a new `Stop`/`SubagentStop` hook binding without considering coexistence:** The existing `Stop` binding goes to `gsd-context-monitor.js`. A router `Stop` binding is additive but must be reviewed against the CLAUDE.md coexistence constraint. Prefer the no-new-binding option (derive outcomes from telemetry + transition diff) unless the planner explicitly chooses a new binding.
- **Storing raw prompts, transcripts, tool outputs, or source documents:** HLTH-01 is absolute. The outcome record carries `prompt_signature` (sha256) and `capability_id` only — never the prompt text, never the model's output, never a transcript.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Prompt signature / PII redaction | New redaction regex | `redact()` + `promptSignature()` from router.mjs | Already catches sk-/AKIA/ghp_/xoxb/glpat + 32+ char high-entropy tokens, case-insensitive. Reinventing risks missing a credential shape. [VERIFIED: codebase — router.mjs:1598-1610] |
| Bounded persistence allowlist | New field validation | `validateEvidenceEnvelope` FIELDS pattern | The frozen-allowlist + `forbidden_evidence_field` rejection is the Phase 21 discipline. Mirror it for outcome records. [VERIFIED: codebase — evidence.mjs:34-53] |
| Decay / retention / sample floor | New decay math | `HALF_LIFE_MS`, `MAX_RETENTION_MS`, `MINIMUM_SAMPLES`, `computeWeightedSamples` | Shared `exponential-half-life-v1` math already used by both evidence stores; health must use the same policy. [VERIFIED: codebase — evidence.mjs:22-24, 63-68] |
| Project+aggregate isolation on disk | New path scheme | `createPersistentEvidenceStore` `pathFor` + `boundedToken` | Path-escape defense (`/` exclusion) already implemented. [VERIFIED: codebase — evidence.mjs:15-28] |
| Canary gate suite | New threshold activation | `evaluateCandidate` + `REQUIRED_GATES` + `applyCanaryDecision` | 6 gates + evidence sufficiency + integrity fingerprint already production-tested. [VERIFIED: codebase — canary-controller.mjs:11, 128-180] |
| Stable capability identity | New id scheme | `stableCapabilityId` from identity.mjs | The canonical framework-neutral id used by the registry, contracts, and relationships. Health must attach to the same id. [VERIFIED: codebase — identity.mjs:21] |
| Workflow transition detection | New state machine | `nextValidTransitions` from transitions.mjs | The authoritative transition gate; re-running it on fresh post-work state is the existing "completed" signal. [VERIFIED: codebase — next-prompt.mjs:30-40] |
| Atomic file writes | New sync logic | `durableWrite` / `atomicWrite` patterns already in publish-index.mjs + lifecycle.mjs | temp+rename+fsync, 0600 perms. [VERIFIED: codebase — publish-index.mjs:14, lifecycle.mjs:19-35] |

**Key insight:** Phase 24's risk surface is privacy and publication, not algorithm design. The algorithms (BM25, decay, canary gates, transition logic) are all in-repo and reusable. The new work is the *observation derivation* (turning telemetry + transition diff into outcome_kind) and the *observation catalog* (turning outcome history + relationships into HLTH-08/09 observations). Both are stdlib-arithmetic and table-driven.

## Runtime State Inventory

Not applicable — Phase 24 is greenfield (new subsystem), not a rename/refactor/migration. No existing strings or stored state need to be migrated. The new `~/.claude/router/health/` directory is created on first use.

## Common Pitfalls

### Pitfall 1: Observing on the hot path
**What goes wrong:** Health scoring added to `UserPromptSubmit` blows the <100ms budget.
**Why it happens:** Natural temptation to "just compute it where the data is."
**How to avoid:** All observer code runs in the watcher (or a parallel background trigger). The router hook must remain read-only and bounded. Add a test that asserts `UserPromptSubmit` latency stays under budget with health modules loaded.
**Warning signs:** New imports from `src/health/*` in `~/.claude/hooks/router.mjs`.

### Pitfall 2: Conflating `outcome` field names
**What goes wrong:** The router already has an `outcome` field in telemetry (always null in v1), the rollback journal uses `outcome: 'completed'|'not_committed'`, and `context/resolve.mjs` returns an `outcome` field for context-resume (`'refresh'`/`'override'`/`'blocked'`/etc.). Phase 24 adds a third `outcome_kind` enum. Name collision causes silent bugs.
**Why it happens:** "outcome" is an overloaded word in this codebase.
**How to avoid:** Use the field name `outcome_kind` for Phase 24 records, never `outcome`. Document the three distinct "outcome" vocabularies in the schema module.
**Warning signs:** A reviewer sees `record.outcome` and assumes it's the telemetry field.

### Pitfall 3: Attaching health to framework names
**What goes wrong:** A capability named `gsd-debug` in GSD is renamed to `gstack-debug` in Gstack; health history is lost.
**Why it happens:** Using `record.name` is shorter than `stableCapabilityId`.
**How to avoid:** Every health record uses `stableCapabilityId(record)` (which includes scope suffix and is framework-neutral). Add a validator that rejects any record whose `capability_id` matches a known framework prefix.
**Warning signs:** `capability_id` values containing `gsd-` or other framework prefixes.

### Pitfall 4: Penalizing rare capabilities
**What goes wrong:** A recovery capability invoked once a quarter is flagged "long-unused" and demoted.
**Why it happens:** Frequency-only scoring naturally punishes rare capabilities.
**How to avoid:** HLTH-07 is explicit. Gate the scorer on `lifecycle_role` from the contract envelope: capabilities whose role is `recovery`/`incident`/`release`/`migration` are exempt from low-frequency penalties. When evidence < `MINIMUM_SAMPLES`, the capability is "unjudged" — never "useless."
**Warning signs:** Any health observation with `reason_code: 'long_unused'` on a capability whose `lifecycle_role` is a rare-role.

### Pitfall 5: Storing raw prompt content in the outcome record
**What goes wrong:** A "helpful reuse" observation wants to quote the prompt that triggered the reusable workflow; the developer stores the prompt text.
**Why it happens:** The observation is more useful with the prompt.
**How to avoid:** HLTH-01 is absolute. Store `prompt_signature` (sha256) only. If the observation needs a human-readable hook, store a bounded allowlisted `reason_code` + `evidence_window_ms`, never text from the prompt.
**Warning signs:** Any string field in an outcome record longer than a `boundedToken` (128 chars) or containing user-typed content.

### Pitfall 6: Admin command mutating the active tuple
**What goes wrong:** `router health reset` accidentally zeroes `release-tuples/active.json` or `weights.json`.
**Why it happens:** Both live under `~/.claude/router/` and a careless path join can reach them.
**How to avoid:** `healthRoot` is `join(ownedRoot, 'health')` — a sibling of `evidence/`, not a parent. Admin commands import only `src/health/admin.mjs`; they must not import `activate.mjs` or `publish-index.mjs`. Add a test that runs every admin command and asserts `active.json` content hash is unchanged.
**Warning signs:** An admin module importing from `src/registry/activate.mjs` or `src/prompt/publish-index.mjs`.

### Pitfall 7: Publishing health through the tuple early
**What goes wrong:** Phase 24 wires health into `publishCompiledIndex`, then Phase 26's REL-03 work has to unpick it.
**Why it happens:** The tuple is the obvious "activation" surface.
**How to avoid:** Phase 24 produces `~/.claude/router/health/state.json`. Phase 26 reads it and adds it as a tuple member. Keep the seam clean.
**Warning signs:** A Phase 24 commit touching `src/prompt/publish-index.mjs` or `src/lifecycle/router-lifecycle.mjs` install list (line 355-362).

## Code Examples

### Existing telemetry entry shape (the v1 outcome gap)
```javascript
// Source: ~/.claude/hooks/router.mjs:2330-2358 (existing)
function telemetryEntryFromState(decision, startNs) {
  // ...
  return {
    ts: Date.now(),
    prompt_signature: denyFiltered ? null : promptSignature(decision.normalizedPrompt, decision.intentKeywords || []),
    suggested_mode: decision.route ? decision.route.mode : null,
    suggested_skills: [...], suggested_agents: [...],
    confidence_tier: decision.tier,
    invoke_kind: decision.invoke_kind || null,
    graphify_queried: false, graph_status: 'not_triggered',
    guards_fired: guards,
    downstream_invocations: null,   // ← v1 reserved, never populated (the gap)
    outcome: null,                  // ← v1 reserved, never populated (the gap)
    latency_ms: ...,
    outcomes: weights?.weights?.[entryId] ?? null,  // ← cumulative g/b/u counters, NOT per-event outcome
    // ...
  };
}
```

### Existing privacy primitives (reuse directly)
```javascript
// Source: ~/.claude/hooks/router.mjs:1598-1610 (existing)
const SECRET_RE = /(?:sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|xoxb-[0-9-Za-z]+|gho_[A-Za-z0-9]{36}|glpat-[A-Za-z0-9_-]{20}|[A-Za-z0-9_\-]{32,}={0,2})/gi;
export function redact(s) { return String(s).replace(SECRET_RE, '[REDACTED]'); }
export function promptSignature(normalizedPrompt, intentKeywords) {
  const redacted = redact(String(normalizedPrompt || ''));
  const iks = Array.isArray(intentKeywords) ? intentKeywords.join(' ') : String(intentKeywords || '');
  return createHash('sha256').update(`${redacted}|${iks}`).digest('hex');
}
```

### Existing evidence allowlist (mirror for outcome records)
```javascript
// Source: src/evolution/evidence.mjs:6-53 (existing)
const FIELDS = new Set([
  'timestamp_ms', 'route_id', 'confidence_band', 'guard_codes', 'reason_code',
  'fixture_class', 'latency_us', 'candidate_version', 'policy_version', 'verdict',
  'prompt_signature',
]);
// validateEvidenceEnvelope rejects any field not in FIELDS → 'forbidden_evidence_field'
// Privacy-denied records (deny_filtered/secret_detected/content_detected) must have prompt_signature === null
```

### Existing decay / retention constants (reuse for health)
```javascript
// Source: src/evolution/evidence.mjs:22-24 (existing)
export const HALF_LIFE_MS = 24 * 60 * 60 * 1000;        // 24h
export const MAX_RETENTION_MS = 7 * HALF_LIFE_MS;       // 7d
export const MINIMUM_SAMPLES = 30;
```

### Existing canary gate (HLTH-11 canary guard)
```javascript
// Source: src/evolution/canary-controller.mjs:11-17, 128-180 (existing)
export const REQUIRED_GATES = Object.freeze([ ... ]);  // 6 gates
export function evaluateCandidate({ candidate, evidence_window, gates, known_good_version = null }) {
  if (!evidence_window || evidence_window.status !== 'validated') return rejected(candidate, 'unvalidated_evidence_window', ...);
  if (evidence_window.sufficient !== true) return rejected(candidate, evidence_window.reason_code ?? 'insufficient_evidence_samples', ...);
  // ... 6-gate evaluation, returns { status: 'promoted'|'rejected', ... }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Telemetry `outcome: null` (v1 reserved) | Phase 24 populates outcome_kind off-hot-path | v1.3 (this phase) | Closes the loop the v1 telemetry schema left open |
| Route-coverage "doctor" health (Phase 07) | Capability health (Phase 24) — distinct concern | v1.3 | New `router health` surface; existing `router doctor`/`router coverage` untouched |
| Single tuple member: registry+index (v1.2) | Multi-member tuple with health policy (Phase 26) | v1.3 (Phase 26) | Phase 24 produces state; Phase 26 publishes it |
| `MINIMUM_SAMPLES=30` fixed | Versioned + canary-guarded thresholds (HLTH-11) | v1.3 | Thresholds gain `policy_version` strings + canary gate |

**Deprecated/outdated:**
- The `outcomes: { g, b, u }` cumulative-counter field in telemetry entries (router.mjs:2351) is the v1 evolution-weights surface, NOT a per-event outcome. Phase 24 must not conflate it with `outcome_kind`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The router has no post-work completion hook today; `Stop`/`SubagentStop` go to `gsd-context-monitor.js` only. | Summary, Architecture Diagram | If a router-owned Stop binding exists in a branch not inspected, the "new binding required" framing changes. Verified against `~/.claude/settings.json:148` directly. |
| A2 | The watcher is the right off-hot-path surface for the observer. | Architecture Patterns | If the watcher's reconcile cadence is too slow for outcome correlation, a dedicated trigger is needed. Verified the watcher ingests telemetry already (watcher.mjs:42). |
| A3 | `lifecycle_role` is exposed by the contract envelope and includes recovery/incident/release/migration roles. | HLTH-07 mapping | Verified `normalizedLifecycleRole` exists in schema.mjs:111; the exact role vocabulary must be confirmed against `workflow-declarations.json` during planning. |
| A4 | Phase 22's relationship graph exposes duplicate/overlap/complementary edges consumable by Phase 24. | HLTH-08 mapping | Verified `relationships.mjs` exists (178 lines) but did not exhaustively read edge kinds. Planner should grep `relationships.mjs` for the exact edge vocabulary. |
| A5 | `router-control.mjs` accepts a new `health` command family without CLI surface conflicts. | HLTH-05 mapping | Verified `status`/`diff`/`explain`/`registry`/`rollback`/`context`/`canary` exist; `health` is unused at top level but `doctor`/`health` are referenced in router.mjs's own health diagnostics. The planner should disambiguate `router health` (Phase 24) from `router doctor` (Phase 07). |

**If this table is non-empty:** Claims tagged `[ASSUMED]` need user confirmation before execution. All other claims were verified by direct codebase grep this session.

## Open Questions (RESOLVED)

1. **Post-work observation source — which option?**
   - RESOLVED: option (c) — off-hot-path watcher derives outcomes from telemetry.jsonl + workflow-state diff (no router hook modification, preserves per-prompt correlation via telemetry.prompt_signature) → 24-01 D-3.
   - What we know: Today no signal is emitted when a dispatched capability completes. `synthesizeNextPrompt` accepts `postWorkState` but does not persist it. The watcher ingests telemetry but telemetry's `outcome` is null.
   - What's unclear: Which of three options should the planner choose: (a) extend the router hook to write an outcome record on the *next* `UserPromptSubmit` after `nextValidTransitions` advances; (b) add a router-owned `Stop`/`SubagentStop` binding; (c) derive outcomes purely in the watcher by diffing workflow-state snapshots over time.
   - Recommendation: Option (a) is least invasive and respects the "no new hook binding" posture. Option (c) is cleanest architecturally but loses per-prompt correlation. The planner should pick one and document the tradeoff; this is a Claude's-discretion decision per CONTEXT.md.

2. **`lifecycle_role` vocabulary — exact set?**
   - RESOLVED: no LIFECYCLE_ROLES extension; the in-repo enum is `['invocable','event-bound','resource','container','configuration','instruction','opaque']` (no recovery/incident/release/migration). HLTH-07 rare-role exemption implemented via the "unjudged" tier (sample_count < MINIMUM_SAMPLES → unjudged, never long_unused/ineffective) → 24-02 D-1.
   - What we know: `normalizedLifecycleRole` exists in `src/registry/schema.mjs:111`.
   - What's unclear: Whether the role enum includes `recovery`/`incident`/`release`/`migration` explicitly, or whether those are derived from `semantic_type`.
   - Recommendation: Planner Wave 1 should grep `workflow-declarations.json` and `schema.mjs` for the role vocabulary before implementing the HLTH-07 exemption.

3. **Phase 22 relationship edge vocabulary — exact set?**
   - RESOLVED: substitute→duplicate, variant→overlap, composition→complementary via relationships.mjs RULES keys (RELATIONSHIP_TYPES = Object.keys(RULES).sort()); the catalog reads already-derived edges, does NOT re-derive relationships → 24-03 D-2.
   - What we know: `src/registry/relationships.mjs` (178 lines) defines typed edges.
   - What's unclear: Whether `duplicate`/`overlap`/`complementary` are already edge kinds or must be derived.
   - Recommendation: Planner Wave 3 should read `relationships.mjs` end-to-end before implementing HLTH-08's duplicate/overlap/complementary observations.

4. **`router health` vs `router doctor` CLI disambiguation**
   - RESOLVED: `router health inspect|reset|dispose|recover` in src/cli/router-control.mjs with a one-line --help disambiguation ("router doctor reports router plumbing health; router health reports capability health") → 24-01 D-4.
   - What we know: `router doctor` (Phase 07) reports router-plumbing health. Phase 24 adds capability health.
   - What's unclear: Whether to namespace Phase 24 under `router health <sub>` or `router capability-health <sub>` to avoid user confusion.
   - Recommendation: `router health <sub>` is the natural surface; the planner should add a one-line distinction in `--help` output. UX-09 (Phase 25) forbids a "large family of maintenance commands" — Phase 24 ships exactly four subcommands (inspect/reset/dispose/recover), which fits.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js stdlib | All Phase 24 code | ✓ | ≥18 (`/Users/guilherme/.hermes/node/bin/node`) | — |
| `~/.claude/router/` writable | Health state | ✓ | — | — |
| `~/.claude/router/telemetry.jsonl` readable | Outcome observation | ✓ | — | — |
| `~/.claude/router/release-tuples/active.json` | Tuple reference (read-only) | ✓ | — | — |
| `~/.claude/router/evidence/` | Canary evidence reuse | ✓ | — | — |
| Graphify graph (`.planning/graphs/graph.json`) | Relationship discovery (HLTH-08) | ✓ but stale | 103h old, 53 commits behind | Treat semantic relationships as approximate; refresh before relying on edge kinds |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** Graphify graph is stale — planner should not rely on graph-derived edge kinds without re-reading `src/registry/relationships.mjs` directly.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` (built-in) |
| Config file | none — tests are `tests/*.test.mjs` auto-discovered |
| Quick run command | `rtk node --test tests/router.health.test.mjs` |
| Full suite command | `rtk node --test tests/*.test.mjs` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HLTH-01 | Outcome records contain no raw prompts/secrets/outputs | unit | `rtk node --test tests/router.health.outcome-schema.test.mjs -t "HLTH-01"` | ❌ Wave 1 |
| HLTH-02 | Health state never leaves local machine | unit | `rtk node --test tests/router.health.privacy.test.mjs -t "HLTH-02"` | ❌ Wave 1 |
| HLTH-03 | outcome_kind enum covers 9 dispositions | unit | `rtk node --test tests/router.health.outcome-schema.test.mjs -t "HLTH-03"` | ❌ Wave 1 |
| HLTH-04 | Allowlist + retention + decay + perms + corruption checks | unit | `rtk node --test tests/router.health.persistence.test.mjs -t "HLTH-04"` | ❌ Wave 1 |
| HLTH-05 | inspect/reset/dispose/recover do not mutate registry/tuple | integration | `rtk node --test tests/router.health.admin.test.mjs -t "HLTH-05"` | ❌ Wave 3 |
| HLTH-06 | Usefulness scoring weights non-frequency signals | unit | `rtk node --test tests/router.health.score.test.mjs -t "HLTH-06"` | ❌ Wave 2 |
| HLTH-07 | Rare capabilities exempt from low-frequency penalty | unit | `rtk node --test tests/router.health.score.test.mjs -t "HLTH-07"` | ❌ Wave 2 |
| HLTH-08 | Catalog produces all 9 observation kinds | unit | `rtk node --test tests/router.health.catalog.test.mjs -t "HLTH-08"` | ❌ Wave 3 |
| HLTH-09 | Reusable-workflow detection distinguishes healthy vs failure repetition | unit | `rtk node --test tests/router.health.catalog.test.mjs -t "HLTH-09"` | ❌ Wave 3 |
| HLTH-10 | Every observation has reason/evidence/window/sample/freshness/confidence/remedy | unit | `rtk node --test tests/router.health.catalog.test.mjs -t "HLTH-10"` | ❌ Wave 3 |
| HLTH-11 | Thresholds versioned + canary-guarded + multilingual calibration plumbing | integration | `rtk node --test tests/router.health.canary.test.mjs -t "HLTH-11"` | ❌ Wave 4 |

### Sampling Rate
- **Per task commit:** `rtk node --test tests/router.health.*.test.mjs`
- **Per wave merge:** `rtk node --test tests/*.test.mjs`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/router.health.outcome-schema.test.mjs` — covers HLTH-01/03/04 (Wave 1)
- [ ] `tests/router.health.privacy.test.mjs` — covers HLTH-02 (Wave 1)
- [ ] `tests/router.health.persistence.test.mjs` — covers HLTH-04 retention/decay/perms (Wave 1)
- [ ] `tests/router.health.observe.test.mjs` — covers observation capture (Wave 2)
- [ ] `tests/router.health.score.test.mjs` — covers HLTH-06/07 (Wave 2)
- [ ] `tests/router.health.catalog.test.mjs` — covers HLTH-08/09/10 (Wave 3)
- [ ] `tests/router.health.admin.test.mjs` — covers HLTH-05 (Wave 3)
- [ ] `tests/router.health.canary.test.mjs` — covers HLTH-11 (Wave 4)
- [ ] No framework install needed — `node:test` is built-in.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Local-only, no auth surface |
| V3 Session Management | no | Local-only, no sessions |
| V4 Access Control | yes | 0600 perms on all `~/.claude/router/health/` files; admin commands run with the user's own privileges; no elevation |
| V5 Input Validation | yes | Frozen FIELDS allowlist (mirror `validateEvidenceEnvelope`); `boundedToken` for every string field; enum validation for `outcome_kind` and `reason_code` |
| V6 Cryptography | yes | SHA-256 fingerprints for every record; `redact()` before hashing; never store raw prompts |
| V7 Error Handling | yes | Fail-open on observer errors (never block routing); admin command errors return structured `canonical()` results |
| V8 Data Protection | yes | HLTH-01/02 are the core controls: no raw content, no off-machine transmission, retention limits, decay, bounded compaction |

### Known Threat Patterns for the v1.3 router stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt content leakage via health records | Information Disclosure | `redact()` + `promptSignature()` + FIELDS allowlist rejecting `forbidden_outcome_field` (HLTH-01) |
| Secret leakage via hashes | Information Disclosure | `redact()` runs BEFORE `promptSignature()`; deny_filtered records carry `prompt_signature: null` (router.mjs:1583-1610) |
| Path traversal via capability_id | Tampering | `boundedToken` (`/` excluded, `TOKEN` regex) — reuse from evidence.mjs:20 |
| Privilege escalation via admin commands | Elevation | Admin commands never import `activate.mjs`/`publish-index.mjs`; 0600 perms; no network |
| Stale thresholds activating without canary | Tampering | HLTH-11 canary gate: `evaluateCandidate` requires `evidence_window.sufficient === true` before threshold activation |
| Rare-capability misclassification | Repudiation | HLTH-07 `lifecycle_role` gate; "unjudged" tier when evidence < MINIMUM_SAMPLES |
| Admin `reset` destroying authoritative state | Tampering | `healthRoot` is a sibling of `registry/`, not a parent; admin modules must not import registry mutation paths (Pitfall 6) |

## Sources

### Primary (HIGH confidence)
- `~/.claude/hooks/router.mjs` — read directly (lines 23-24, 1598-1630, 2330-2358, 2855). Confirms `promptSignature`/`redact`/`logTelemetry` primitives, telemetry entry shape with `outcome: null`/`downstream_invocations: null` (the gap), existing `doctor`/`health` command surface (Phase 07, distinct concern).
- `src/evolution/evidence.mjs` — read directly (lines 1-60). Confirms FIELDS allowlist, `validateEvidenceEnvelope`, `HALF_LIFE_MS=24h`, `MAX_RETENTION_MS=7d`, `MINIMUM_SAMPLES=30`, `boundedToken`, `createPersistentEvidenceStore`.
- `src/evolution/telemetry-bridge.mjs` — read directly (full file). Confirms telemetry → evidence bridge, privacy-denied guard set, `verdict: 'success'` with comment "v1: telemetry outcome is null; regression detected by calibration gates".
- `src/evolution/canary-controller.mjs` — grep (lines 11, 128-180). Confirms `REQUIRED_GATES`, `evaluateCandidate`, `applyCanaryDecision`.
- `src/registry/identity.mjs` — read directly (full file). Confirms `stableCapabilityId` is framework-neutral, scope-suffixed.
- `src/registry/contract.mjs` — grep. Confirms `CONTRACT_FIELDS`, `buildCapabilityContract`, `validateCapabilityContract`.
- `src/registry/schema.mjs` — grep. Confirms `normalizedSemanticType`, `normalizedLifecycleRole`, `canonicalizeCapability`, `stableStringify`.
- `src/prompt/publish-index.mjs` — grep + read (lines 44-220). Confirms tuple publish path, `recoverReleaseTuple`, tuple members are `registry.json`/`index.json`/`closure.json` (no health member today — Phase 26 adds it).
- `src/orchestrator/next-prompt.mjs` — read directly (full file, 78 lines). Confirms `synthesizeNextPrompt` accepts `postWorkState` and re-runs `nextValidTransitions` but does NOT persist any outcome record.
- `src/orchestrator/actions.mjs` — read directly (first 80 lines). Confirms `resolveAction`, `ACTION_POLICY_VERSION='action-policy-v1'`, four-gate dispatch model, framework-neutral contract-field authority.
- `~/.claude/router/modules/cli/router-control.mjs` — grep (lines 146, 220, 276). Confirms existing CLI command family; `health` not present at top level (Phase 24 adds it).
- `~/.claude/settings.json` — read directly (lines 40-165). Confirms `Stop`/`SubagentStop` bindings go to `gsd-context-monitor.js`; no router-owned Stop binding.
- `.planning/phases/24-privacy-safe-outcomes-and-capability-health/24-CONTEXT.md` — read directly. Confirms locked decisions and Phase 24 invariants.
- `.planning/REQUIREMENTS.md` — read directly (HLTH-01..11, REL-01..09). Confirms requirement text verbatim.
- `.planning/ROADMAP.md` — read directly (Phase 23/24/25/26 sections). Confirms phase boundaries and that Phase 26 owns tuple publication.
- `.planning/STATE.md` — read directly (lines 85-117). Confirms Phase 24 blocker: "must calibrate opportunity-aware outcome semantics, sample floors, decay, and scope isolation."
- `.claude/CLAUDE.md` — read directly. Confirms hook contract, <100ms hot-path, fail-open, no-raw-prompt-text, `~/.claude/router` data dir, coexistence posture, no-npm-dependencies.

### Secondary (MEDIUM confidence)
- `tests/router.health.test.mjs` — grep. Confirms existing Phase 07 "health" tests cover route/coverage/diagnostics, NOT Phase 24 capability health (named collision to avoid).
- `tests/router.inspect.test.mjs` — grep. Confirms inspect/preview surface exists with privacy assertions (raw prompt fixtures must not appear in output).
- `src/evolution/perf-measure.mjs` — grep. Confirms `CALIBRATION_CORPUS_VERSION='router-calibration-v1'`, English-only fixtures (multilingual deferred per CONTEXT.md).

### Tertiary (LOW confidence)
- None. Every claim is verified against the codebase or marked `[ASSUMED]` in the Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every reusable primitive verified by direct codebase read.
- Architecture: HIGH — publish/rollback lifecycle, observer gap, and tuple members verified directly; one open question on which observation-source option to pick (Claude's discretion).
- Pitfalls: HIGH — every pitfall traces to a specific codebase pattern or CONTEXT.md invariant.
- Cross-phase gap (post-work signal): HIGH confidence the gap exists; MEDIUM confidence on the best option to close it (three viable options, planner's call).

**Research date:** 2026-07-27
**Valid until:** 2026-08-26 (30 days — stable; codebase is mid-v1.3 but Phase 24's upstream surface (Phase 23) is complete and Phase 22 contracts/relationships are landed)