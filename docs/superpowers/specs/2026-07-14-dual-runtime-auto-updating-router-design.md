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

## Deletion and Rename Semantics

- A removed capability is disabled in the candidate before any scoring occurs.
- Aliases and schema-backed routes cannot make a missing target valid.
- Skill and agent routes must resolve to active runtime inventory.
- Slash commands must resolve to a real command or a separately declared virtual-route type with its own executor contract.
- Hook validity requires both a source file and a valid event binding.
- Removed hook files produce orphan-binding findings; removed bindings produce orphan-file findings.
- Rename detection updates identity only with strong evidence. Weak matches are quarantined as remove-plus-add.

## Prompt-Time Routing and Token Efficiency

The compiled index contains only:

- normalized trigger tokens
- compact route identity
- confidence thresholds
- invocation adapter reference
- dependency and safety flags
- short reason templates

Detailed descriptions, docs, provenance, validation history, and telemetry remain external.

Routing tiers:

1. Explicit capability name or command: constant-time lookup.
2. Known high-confidence pattern: deterministic cached route.
3. Moderate confidence: local lexical scoring over the compact index.
4. Ambiguous prompt: pass through with a short recommendation and queue optional background analysis.

Cache keys include registry version, routing-policy version, project-scope fingerprint, and normalized prompt signature. Registry activation invalidates stale decisions by changing the version pointer rather than rewriting the cache.

Background model jobs receive only changed capability summaries, nearest route families, collisions, and failed calibration examples. They never receive the full registry or runtime directories.

## Operator Workflow

- `router status` — active version, watcher health, pending candidates, quarantines.
- `router diff` — additions, removals, renames, dependency changes, and mapping changes.
- `router explain` — mapping evidence, validation results, or quarantine reason.
- `router doctor` — adapters, roots, fingerprints, bindings, dependencies, and activation health.
- `router rollback` — atomically restore a known-good registry.
- `router registry verify` — compare incremental state with a clean rebuild.

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

## Delivery Decomposition

This design should be implemented in staged vertical slices:

1. Canonical schema, Claude/Codex adapters, clean full-build parity.
2. Fingerprint tree, watcher, incremental diff, and periodic repair.
3. Target validation, deletion/rename safety, hook reconciliation, and quarantine.
4. Deterministic mapping, compiled indexes, atomic activation, and rollback.
5. Token-efficient prompt adapters and versioned cache invalidation.
6. Background ambiguity resolution, canary evolution, and telemetry rollback.
7. End-to-end lifecycle, performance, privacy, and release gates.

No later slice may weaken the fail-open, privacy, dependency, scope, or prompt-latency guarantees established by the existing router.
