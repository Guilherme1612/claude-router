# Dual-Runtime Auto-Updating Router Design

**Date:** 2026-07-14  
**Status:** Approved design  
**Runtimes:** Claude Code and Codex  
**Autonomy:** Guarded automatic activation

## Purpose

Turn the current static Claude inventory snapshot into a shared, automatically updated capability registry for `.claude` and `.codex`. Skills, plugin skills, agents, commands, and hooks must be detected when added, changed, renamed, moved, disabled, or removed. Safe changes activate without intervention; unsafe or ambiguous changes are quarantined while the last known-good registry remains active.

The design must reduce prompt latency and token use by keeping discovery, parsing, semantic mapping, validation, and evolution outside the prompt path.

## Goals

- Maintain one canonical capability registry with Claude and Codex runtime adapters.
- Detect inventory changes through filesystem events and periodic fingerprint repair.
- Incrementally normalize and diff only changed capabilities.
- Generate candidate mappings automatically using deterministic rules first.
- Use background LLM analysis only for ambiguous changes and telemetry misses.
- Validate every candidate before activation.
- Atomically activate versioned compiled indexes and support automatic rollback.
- Prevent deleted or invalid targets from surviving through stale aliases or schema exceptions.
- Keep prompt-time routing deterministic, compact, local, and below the existing latency ceiling.
- Evolve routing weights and signals from privacy-safe outcome telemetry.
- Let the user express the least possible text—such as `continue`, `finish it`, or `use the design`—while the router safely reconstructs the active goal and chooses the best valid next workflow.
- Select capabilities from prompt intent plus current project, workflow, and execution state rather than prompt keywords alone.
- Load the least sufficient context needed for a reliable decision instead of repeatedly injecting full histories, manifests, specifications, or planning directories.

## Non-Goals

- No synchronous inventory scan, manifest rebuild, or LLM call during prompt submission.
- No automatic installation of missing plugins, MCP servers, tools, or models.
- No mutation of runtime-owned source files merely to satisfy generated mappings.
- No silent activation when validation, scope, permissions, or dependency checks are uncertain.
- No cross-project leakage of project-scoped capabilities.

## Architecture

```text
.claude/ ─┐
          ├─ filesystem events ─→ Registry Controller
.codex/ ──┘                         │
                           normalize + diff
                                   │
                     validate additions/removals
                                   │
                    generate candidate mappings
                                   │
                  tests + calibration + safety gates
                                   │
                      atomic versioned activation
                           ┌───────┴────────┐
                           ▼                ▼
                    Claude index       Codex index
                           │                │
                           └── prompt routers ──→ cached decision
```

The system is divided into a background control plane and a minimal prompt-time data plane.

### Control plane

The Registry Controller watches runtime roots, normalizes native artifacts, computes changes, generates mappings, validates candidate snapshots, manages activation, and evolves routing policy.

### Data plane

Claude and Codex prompt routers read immutable compiled indexes. They never scan directories, parse capability files, rebuild registries, or call an external model. If the control plane fails, routing continues with the last known-good version.

### Context plane

A Context Resolver maintains a compact, versioned **context capsule** for each active workspace and conversation. The capsule connects short or referential prompts to the user's current goal without loading broad history into every turn.

The resolver may read richer source material only when the capsule is missing, stale, contradictory, or insufficient for a safe decision. It then refreshes the capsule and returns a bounded routing context to the data plane.

## Canonical Capability Model

Every capability receives a stable runtime-neutral record:

```yaml
capability_id: stable namespace-qualified identity
type: skill | plugin_skill | agent | command | hook
display_name: human-readable name
runtime_availability: [claude, codex]
sources:
  claude: path and native metadata
  codex: path and native metadata
scope: global | project
descriptions:
  short: compact routing description
  full_ref: external detailed record
signals:
  explicit_aliases: []
  deterministic_tokens: []
  learned_tokens: []
invocations:
  claude: adapter-specific invocation contract
  codex: adapter-specific invocation contract
dependencies:
  mcp: []
  tools: []
  models: []
  permissions: []
lifecycle:
  source_fingerprint: content hash
  state: active | candidate | quarantined | removed
  registry_version: version identifier
mapping:
  route_family: canonical route
  confidence: numeric score
  evidence_refs: []
  policy_version: version identifier
```

Large documentation and validation evidence are referenced rather than embedded in the prompt index.

## Components

### 1. Filesystem watcher

Watch relevant runtime roots and metadata:

- Claude global skills, agents, commands, hooks, plugins, settings, and installation metadata.
- Codex skills, agents, plugins, configuration, hooks, and installation metadata.
- Dynamically registered project-scoped capability roots.

Events are debounced, coalesced, and deduplicated. A periodic Merkle-style fingerprint scan repairs missed events. Watcher state is persisted so restarts do not require an unconditional full parse.

### 2. Runtime adapters

Claude and Codex adapters implement a common interface:

```text
discover_roots()
fingerprint(root)
parse_artifact(path)
normalize(native_record)
validate_invocation(canonical_record)
compile_runtime_entry(canonical_record)
```

Adapters own native layout and invocation details. Mapping, validation, activation, telemetry, and evolution remain shared.

### 3. Diff and identity engine

Compare the observed inventory with the active canonical registry and classify:

- added
- removed
- content changed
- renamed or moved
- dependency changed
- invocation changed
- scope or permission changed
- runtime availability changed

Rename detection requires strong identity evidence such as matching origin metadata or content fingerprints. Otherwise, process the event as remove-plus-add.

### 4. Mapping engine

Generate candidate mappings in this order:

1. Explicit aliases and capability metadata.
2. Exact stable identity matches across runtimes.
3. Existing route-family inheritance.
4. Deterministic description and trigger-token matching.
5. Scope, permission, dependency, and collision filters.
6. Background LLM classification for unresolved ambiguous candidates only.

Generated mappings never bypass target-existence or invocation validation. New capabilities may enter the registry as active but unmapped if mapping confidence is insufficient; they are not silently dispatched.

### 5. Validation pipeline

Every candidate snapshot must pass:

- schema validation
- source and target existence
- runtime invocation compatibility
- dependency, MCP, tool, model, and permission checks
- global/project scope isolation
- duplicate identity and alias collision checks
- command, skill, and agent deletion safety
- hook file and binding reconciliation
- calibration fixtures and route ambiguity thresholds
- regression, privacy, latency, and token-budget gates
- incremental-build equivalence against a clean full rebuild

Validation output is structured and associated with the candidate version.

### 6. Activator and rollback manager

Candidate indexes are written to versioned directories. Activation uses an atomic pointer swap only after validation passes. The previously active versions remain available for rollback.

The active registry is immutable. A crash during build or validation cannot expose a partial snapshot. Failed candidates are quarantined with actionable diagnostics.

### 7. Evolution engine

Privacy-safe telemetry records prompt signatures, selected route identities, confidence, safety decisions, outcomes, and registry/policy versions. It does not store raw prompt text.

Evolution may:

- adjust lexical weights
- add or remove learned signal tokens
- refine confidence thresholds
- propose route-family changes

Evolution may not invent invocation targets, change permissions, install dependencies, or bypass validation. Changes use canary activation and roll back automatically when routing quality degrades.

### 8. Context Resolver and capsule store

The Context Resolver combines:

- the current user prompt and explicit capability names
- recent conversation intent and unresolved user corrections
- active goal, checkpoint, or approval state
- project and workspace identity
- current milestone, phase, plan, and workflow position
- approved design, specification, and plan references
- git branch, worktree, dirty-state summary, and recent relevant commits
- last successful route, unfinished operation, and permitted next transitions
- blockers, missing dependencies, and required human actions

It writes a compact context capsule:

```yaml
workspace_id: stable project identity
conversation_id: current thread identity
goal:
  summary: one bounded sentence
  status: active | waiting | complete | blocked
workflow:
  kind: canonical workflow identity
  position: current milestone/phase/plan/checkpoint
  next_valid_transitions: []
artifacts:
  approved_design: optional path and fingerprint
  active_spec: optional path and fingerprint
  active_plan: optional path and fingerprint
state:
  branch: name
  dirty_summary: bounded summary
  blockers: []
capabilities:
  last_route: canonical route identity
  required_dependencies: []
freshness:
  source_versions: {}
  updated_at: timestamp
```

Capsules contain references and bounded summaries, not full documents. Sensitive text and raw prompts are excluded. Source fingerprints make stale capsules detectable.

### 9. Workflow Orchestrator

The Workflow Orchestrator resolves the best next action from the goal, capsule, canonical registry, and runtime policy. It selects a workflow before selecting individual capabilities.

Selection order:

1. Honor explicit user instructions and named capabilities.
2. Resume an active approved workflow when the prompt is referential, such as `continue`.
3. Derive the next valid transition from persisted workflow state.
4. Select the strongest compatible command or skill that owns that transition.
5. Select agents or subagents required by that workflow.
6. Resolve MCPs, tools, models, permissions, and hooks as dependencies or lifecycle services.
7. Load only the context required by the selected workflow's declared contract.
8. Execute, verify, and persist the new capsule state.

MCP servers and tools are selected because the chosen workflow requires them, not merely because their names resemble words in the prompt. Hooks remain event-bound and are validated for correct registration; they are not treated as freely invokable prompt capabilities.

If several workflows remain plausible and the confidence margin is below policy, the orchestrator asks one concise clarification question rather than loading more context speculatively or choosing an unsafe action.

## Change Lifecycle

```text
filesystem change
  → debounce and fingerprint
  → runtime adapter normalization
  → canonical diff and identity resolution
  → deterministic mapping
  → optional bounded background classification
  → validation and calibration
  → canary
  → atomic activation
  → telemetry monitoring
  → retain or rollback
```

Failures route to quarantine. The active version remains unchanged.

## Prompt and Workflow Lifecycle

```text
minimal user prompt
  → explicit instruction and active-goal check
  → context capsule lookup and freshness validation
  → goal and workflow-state resolution
  → best next workflow transition
  → capability and dependency selection
  → least-sufficient context loading
  → execution and verification
  → capsule/state update
```

Example: `continue and use the design`

1. Resolve `continue` against the active goal and unfinished workflow.
2. Resolve `the design` to the approved, fingerprinted design artifact in the capsule.
3. Detect that design approval is complete and implementation planning is the next valid transition.
4. Select the planning workflow and its registered planner/checker capabilities.
5. Check runtime availability, MCPs, tools, permissions, and agent dependencies.
6. Load the approved design plus only the project constraints and state required by the planning contract.
7. Execute the plan workflow, verify its artifact, and persist the next position.

## Deletion and Rename Semantics

- A removed capability is disabled in the candidate before any scoring occurs.
- Aliases and schema-backed routes cannot make a missing target valid.
- Skill and agent routes must resolve to active runtime inventory.
- Slash commands must resolve to a real command or a separately declared virtual-route type with its own executor contract.
- Hook validity requires both a source file and a valid event binding.
- Removed hook files produce orphan-binding findings; removed bindings produce orphan-file findings.
- Rename detection updates identity only with strong evidence. Weak matches are quarantined as remove-plus-add.

## Prompt-Time Routing and Token Efficiency

Routing decisions use four bounded inputs:

- the user's current prompt
- the fresh context capsule
- the compact compiled capability index
- the workflow transition policy

The compiled index contains only:

- normalized trigger tokens
- compact route identity
- confidence thresholds
- invocation adapter reference
- dependency and safety flags
- short reason templates

Detailed descriptions, docs, provenance, validation history, and telemetry remain external.

The context capsule contains only the active goal, workflow position, artifact references, relevant blockers, and bounded state summaries. Full conversation history, full planning directories, complete manifests, and entire specifications are not injected by default.

The orchestrator follows a **least-sufficient-context** rule:

1. Begin with prompt, capsule, and compact index.
2. Select a likely workflow and inspect its declared context contract.
3. Load referenced source sections only when required by that contract.
4. Stop loading when decision confidence and workflow preconditions are satisfied.
5. Ask one concise question when missing information would materially change the action.

Routing tiers:

1. Explicit capability name or command: constant-time lookup.
2. Referential continuation with a fresh active capsule: deterministic workflow-state transition.
3. Known high-confidence pattern: deterministic cached route.
4. Moderate confidence: local lexical scoring over the compact index plus bounded capsule signals.
5. Ambiguous prompt: ask one concise clarification or pass through with a short recommendation; queue optional background analysis.

Cache keys include registry version, routing-policy version, project-scope fingerprint, and normalized prompt signature. Registry activation invalidates stale decisions by changing the version pointer rather than rewriting the cache.

Background model jobs receive only changed capability summaries, nearest route families, collisions, and failed calibration examples. They never receive the full registry or runtime directories.

Each workflow declares a context budget and allowed sources. The router records estimated input tokens for routing context, loaded artifacts, and injected instructions. Repeatedly loading the same unchanged artifact is treated as a cache miss defect and surfaced by diagnostics.

## Operator Workflow

- `router status` — active version, watcher health, pending candidates, quarantines.
- `router diff` — additions, removals, renames, dependency changes, and mapping changes.
- `router explain` — mapping evidence, validation results, or quarantine reason.
- `router doctor` — adapters, roots, fingerprints, bindings, dependencies, and activation health.
- `router rollback` — atomically restore a known-good registry.
- `router registry verify` — compare incremental state with a clean rebuild.
- `router context` — show the active goal, workflow position, artifact references, freshness, and next valid transitions without raw conversation text.
- `router context refresh` — rebuild a stale or inconsistent capsule from authoritative project and workflow state.
- `router why-next` — explain why the orchestrator selected the current next action and which alternatives were rejected.

Healthy operation is silent. Alerts are emitted only for quarantined changes, repeated watcher failures, rollback events, or changes that cannot safely activate.

## Error Handling

- Watcher failure: continue last known-good routing and rely on periodic fingerprint repair.
- Adapter parse failure: quarantine the affected artifact; do not remove the prior valid record until deletion is confirmed.
- Candidate build failure: discard candidate and retain active version.
- Validation failure: quarantine with structured next actions.
- Activation crash: atomic pointer remains on the prior version.
- Telemetry regression: rollback the candidate policy/index version.
- Missing dependency: keep capability visible diagnostically but non-dispatchable.
- Corrupt active index: fall back to the most recent verified version and emit a critical health event.
- Missing or stale context capsule: reconstruct it from authoritative workflow and workspace state before routing referential prompts.
- Contradictory prompt and capsule: the newest explicit user instruction wins; invalidate the conflicting capsule fields.
- Ambiguous continuation with no active goal: ask one concise clarification and do not infer a destructive or externally visible action.
- Context budget exceeded: retain the highest-priority goal, constraints, and preconditions; replace lower-priority material with references rather than truncated prose.

## Test Strategy

### Adapter contracts

Test every supported Claude and Codex artifact layout and invocation format.

### Temporary-runtime lifecycle tests

For every capability type, test:

- add
- edit
- rename
- move
- disable
- dependency change
- permission or scope change
- delete

### Cross-cutting tests

- plugin install, upgrade, disable, and uninstall
- hook file/binding reconciliation
- deleted slash command rejection
- deleted skill and agent exclusion
- project-scope isolation
- missing MCP/tool/model quarantine
- incremental/full-build equivalence
- atomic activation and crash recovery
- cache-version invalidation
- cross-runtime identity and invocation
- telemetry privacy and rollback
- prompt latency and token budget
- minimal prompts such as `continue`, `finish it`, `use the design`, and `do the next phase`
- interrupted workflow recovery across new sessions and process restarts
- explicit user instruction overriding stale capsule state
- capsule freshness after design, plan, phase, branch, or dependency changes
- least-sufficient-context enforcement and repeated-artifact cache reuse
- workflow-first selection followed by skills, commands, agents, MCPs, and tools

## Acceptance Criteria

- Normal filesystem changes are detected within 2 seconds.
- Missed events are repaired by fingerprint scan within 5 minutes.
- No prompt-time filesystem scan, registry build, or external model call.
- Warm routing p95 is below 25 ms and never exceeds the existing 100 ms gate.
- No missing, deleted, blocked, or invalid target can activate.
- Safe add/change/delete events propagate without user intervention.
- Failed candidates leave the active registry unchanged.
- Full and incremental rebuilds produce identical compiled indexes.
- Background LLM work is limited to changed ambiguous entries and obeys a configurable daily budget.
- Prompt injection remains compact and capped.
- Every activation and rollback is attributable to a registry and policy version.
- A user can resume a uniquely identifiable active workflow with `continue` and no restatement of project history.
- Referential prompts resolve approved artifacts and workflow position from the context capsule with no full-history injection.
- Workflow selection uses prompt, capsule, project state, transition policy, and capability compatibility—not prompt keywords alone.
- MCPs and tools are loaded only when required by the selected workflow or verification path.
- The default routing decision loads no full manifest, planning directory, conversation history, or complete design document.
- Each workflow enforces a declared context budget and reports token-cost regressions.
- When context is genuinely insufficient, the system asks at most one focused question before re-evaluating.

## Delivery Decomposition

This design should be implemented in staged vertical slices:

1. Canonical schema, Claude/Codex adapters, clean full-build parity.
2. Fingerprint tree, watcher, incremental diff, and periodic repair.
3. Target validation, deletion/rename safety, hook reconciliation, and quarantine.
4. Deterministic mapping, compiled indexes, atomic activation, and rollback.
5. Context Resolver, capsule store, workflow transition policy, and interrupted-session recovery.
6. Token-efficient prompt adapters, least-sufficient-context contracts, and versioned cache invalidation.
7. Background ambiguity resolution, canary evolution, and telemetry rollback.
8. End-to-end lifecycle, minimal-prompt, performance, privacy, and release gates.

No later slice may weaken the fail-open, privacy, dependency, scope, or prompt-latency guarantees established by the existing router.
