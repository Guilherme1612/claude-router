# Dual-Runtime Auto-Updating Router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a guarded, automatically updating Claude/Codex capability registry that resumes active workflows from minimal prompts, selects the best compatible tools and agents, and keeps prompt-time routing below 100 ms with bounded token use.

**Architecture:** A background registry controller normalizes `.claude` and `.codex` through runtime adapters, incrementally detects changes, validates candidate mappings, and atomically publishes immutable runtime indexes. A context resolver and workflow orchestrator combine minimal prompts with compact persisted state; prompt hooks only read compiled indexes and context capsules.

**Tech Stack:** Node.js ESM and `node:test`; standard-library `fs`, `crypto`, `path`, `os`, `child_process`, and `events`; existing router calibration and installer surfaces; JSON schemas and atomic filesystem writes; no prompt-time API calls.

**Approved design:** `docs/superpowers/specs/2026-07-14-dual-runtime-auto-updating-router-design.md`

---

## GSD Milestone Definition

**Proposed milestone:** v1.2 — Autonomous Dual-Runtime Control Plane  
**Phase range:** 11–18  
**Planning mode:** Sequential GSD phases with Nyquist validation and phase verification  
**Release invariant:** Every phase preserves fail-open routing, privacy, and the existing sub-100-ms hard gate.

### Milestone requirements

| ID | Requirement |
|---|---|
| REG-01 | One canonical schema represents Claude and Codex capabilities with stable identities. |
| REG-02 | Full rebuilds discover supported skills, plugin skills, agents, commands, hooks, bindings, scopes, and dependencies. |
| REG-03 | Incremental and full rebuilds produce identical canonical registries. |
| ADP-01 | Claude adapter covers global, plugin, agents-store, and project-scoped inventory. |
| ADP-02 | Codex adapter covers skills, plugins, agents, hooks, configuration, and project scope. |
| CHG-01 | Add, edit, rename, move, disable, dependency-change, and delete events are classified correctly. |
| CHG-02 | Filesystem changes are detected within 2 seconds and missed events within 5 minutes. |
| SAF-09 | Missing or deleted targets cannot remain activatable through aliases or schema exceptions. |
| SAF-10 | Hook files and bindings are reconciled as orphan-file, orphan-binding, or valid pairs. |
| MAP-01 | Deterministic mapping runs before any background ambiguity resolver. |
| MAP-02 | Unsafe or ambiguous candidates are quarantined without changing the active registry. |
| ACT-01 | Passing candidates activate through an atomic version pointer and support rollback. |
| CTX-01 | Context capsules persist the active goal, workflow position, artifacts, blockers, and freshness without raw prompt history. |
| CTX-02 | Minimal prompts such as `continue` resume a uniquely identifiable workflow without restating context. |
| ORC-01 | Workflow selection precedes skill, command, agent, MCP, and tool selection. |
| ORC-02 | Explicit user instructions override stale or conflicting capsule state. |
| TOK-01 | Default routing loads no full manifest, planning directory, conversation history, or complete design document. |
| TOK-02 | Each workflow enforces a declared context budget and reuses unchanged artifact summaries. |
| EVO-05 | Privacy-safe telemetry canary-tests weight and signal changes and rolls back regressions. |
| REL-01 | Warm routing p95 is below 25 ms and every measured route remains below 100 ms. |

## File Structure

### New control-plane modules

- `src/registry/schema.mjs` — canonical record validation, lifecycle states, stable serialization.
- `src/registry/identity.mjs` — stable IDs, fingerprints, rename/move evidence.
- `src/registry/fingerprint.mjs` — Merkle-style directory fingerprinting and persisted scan state.
- `src/registry/diff.mjs` — added/changed/renamed/moved/disabled/removed classification.
- `src/adapters/claude.mjs` — Claude root discovery, parsing, normalization, and invocation compilation.
- `src/adapters/codex.mjs` — Codex root discovery, parsing, normalization, and invocation compilation.
- `src/registry/build.mjs` — clean full build and incremental build orchestration.
- `src/registry/watcher.mjs` — debounced `fs.watch` events and periodic repair scans.
- `src/registry/map.mjs` — deterministic route-family and signal mapping.
- `src/registry/validate.mjs` — target, dependency, scope, collision, hook, and calibration gates.
- `src/registry/activate.mjs` — version directories, atomic active pointer, retention, rollback.
- `src/context/capsule.mjs` — bounded capsule schema, freshness, merge, persistence, privacy.
- `src/context/sources.mjs` — authoritative GSD, git, goal, artifact, and workspace state readers.
- `src/orchestrator/transitions.mjs` — workflow state machine and valid next transitions.
- `src/orchestrator/select.mjs` — workflow-first selection and dependency resolution.
- `src/orchestrator/budget.mjs` — least-sufficient-context contracts and token accounting.
- `src/evolution/canary.mjs` — candidate policy evaluation and automatic rollback decisions.
- `src/cli/router-control.mjs` — status, diff, explain, context, refresh, verify, and rollback commands.
- `src/runtime/prompt-router.mjs` — compact compiled-index and capsule routing API.

### Modified integration files

- `install-router.mjs` — deploy modules, controller configuration, indexes, and runtime bindings safely.
- `router.calibrate.mjs` — evaluate canonical registry versions, workflow transitions, and context cases.
- `calibration-tasks.json` — minimal-prompt, dual-runtime, deletion, and ambiguity fixtures.
- `tests/router.mjs.snapshot` — generated live hook snapshot after prompt-router integration.

### New focused tests

- `tests/router.registry-schema.test.mjs`
- `tests/router.adapters.test.mjs`
- `tests/router.registry-diff.test.mjs`
- `tests/router.registry-build.test.mjs`
- `tests/router.registry-watcher.test.mjs`
- `tests/router.registry-safety.test.mjs`
- `tests/router.registry-activation.test.mjs`
- `tests/router.context-capsule.test.mjs`
- `tests/router.workflow-orchestrator.test.mjs`
- `tests/router.context-budget.test.mjs`
- `tests/router.evolution-canary.test.mjs`
- `tests/router.dual-runtime-e2e.test.mjs`
- `tests/router.autonomous-release.test.mjs`

---

## Phase 11: Canonical Registry and Runtime Adapters

**Goal:** Produce the same stable canonical capability model from Claude and Codex native layouts.  
**Requirements:** REG-01, REG-02, ADP-01, ADP-02  
**Plans:** 3

### Plan 11-01: Canonical schema and stable identity

**Files:**
- Create: `src/registry/schema.mjs`
- Create: `src/registry/identity.mjs`
- Create: `tests/router.registry-schema.test.mjs`

- [ ] **Step 1: Write failing schema tests**

  Cover required fields, runtime-specific invocation records, lifecycle states, deterministic serialization, stable IDs, and invalid records.

  Run: `node --test tests/router.registry-schema.test.mjs`  
  Expected: FAIL because registry modules do not exist.

- [ ] **Step 2: Implement minimal schema and identity APIs**

  Export `validateCapability(record)`, `canonicalizeCapability(record)`, `stableCapabilityId(record)`, `contentFingerprint(value)`, and `stableStringify(value)`.

- [ ] **Step 3: Verify and commit**

  Run: `node --test tests/router.registry-schema.test.mjs`  
  Expected: PASS.

  Commit: `feat(11-01): add canonical capability schema`

### Plan 11-02: Claude and Codex adapter contracts

**Files:**
- Create: `src/adapters/claude.mjs`
- Create: `src/adapters/codex.mjs`
- Create: `tests/router.adapters.test.mjs`

- [ ] **Step 1: Write temporary-home adapter fixtures**

  Cover global skills, plugin skills, agents, commands, hooks, hook bindings, `.claude/commands`, Codex skills/plugins/agents/hooks, missing metadata, scope, MCPs, tools, models, and permissions.

  Run: `node --test tests/router.adapters.test.mjs`  
  Expected: FAIL because adapters do not exist.

- [ ] **Step 2: Implement the common adapter interface**

  Each adapter must export `discoverRoots(options)`, `parseArtifact(path, options)`, `normalizeArtifact(nativeRecord)`, and `compileInvocation(record)`.

- [ ] **Step 3: Verify and commit**

  Run: `node --test tests/router.adapters.test.mjs`  
  Expected: PASS with no reads outside temporary roots.

  Commit: `feat(11-02): add Claude and Codex registry adapters`

### Plan 11-03: Full canonical build parity

**Files:**
- Create: `src/registry/build.mjs`
- Create: `tests/router.registry-build.test.mjs`
- Modify: `install-router.mjs`

- [ ] **Step 1: Write failing full-build tests**

  Assert deterministic ordering, cross-runtime identity merge, duplicate handling, project-scope isolation, and parity with the current Claude manifest categories.

- [ ] **Step 2: Implement `buildFullRegistry(options)`**

  Build a candidate registry without writing active state. Preserve source provenance and adapter diagnostics.

- [ ] **Step 3: Add installer deployment for registry modules**

  Installer dry-run must show exact additions and preserve unrelated Claude/Codex configuration bytes.

- [ ] **Step 4: Verify phase**

  Run: `node --test tests/router.registry-schema.test.mjs tests/router.adapters.test.mjs tests/router.registry-build.test.mjs tests/router.settings-diff.test.mjs`  
  Expected: PASS.

  Run: `node --test tests/*.test.mjs`  
  Expected: existing suite remains green.

  Commit: `feat(11-03): build canonical dual-runtime registry`

---

## Phase 12: Incremental Change Detection and Watcher

**Goal:** Detect and classify inventory changes quickly while guaranteeing full/incremental equivalence.  
**Requirements:** REG-03, CHG-01, CHG-02  
**Plans:** 3

### Plan 12-01: Fingerprint tree and diff engine

**Files:**
- Create: `src/registry/fingerprint.mjs`
- Create: `src/registry/diff.mjs`
- Create: `tests/router.registry-diff.test.mjs`

- [ ] Write failing tests for add, edit, rename, move, disable, dependency, permission, scope, and delete events.
- [ ] Implement deterministic directory fingerprints and strong rename evidence.
- [ ] Treat weak rename matches as remove-plus-add.
- [ ] Run `node --test tests/router.registry-diff.test.mjs`; expect PASS.
- [ ] Commit: `feat(12-01): add registry fingerprints and lifecycle diffs`.

### Plan 12-02: Incremental build equivalence

**Files:**
- Modify: `src/registry/build.mjs`
- Create: `tests/router.registry-build.test.mjs`

- [ ] Add failing mutation-sequence tests comparing incremental output with a clean full rebuild after every mutation.
- [ ] Implement `buildIncrementalRegistry(active, diff, options)` with deterministic merge and removal semantics.
- [ ] Run the registry schema, adapter, diff, and build suites; expect byte-equivalent canonical output.
- [ ] Commit: `feat(12-02): add equivalent incremental registry builds`.

### Plan 12-03: Debounced watcher and periodic repair

**Files:**
- Create: `src/registry/watcher.mjs`
- Create: `tests/router.registry-watcher.test.mjs`
- Modify: `install-router.mjs`

- [ ] Write failing fake-clock watcher tests for event coalescing, duplicate suppression, controller restart, missed-event repair, and shutdown.
- [ ] Implement `RegistryWatcher` with configurable 250-ms debounce and five-minute repair interval.
- [ ] Install watcher/controller configuration outside prompt hooks.
- [ ] Run `node --test tests/router.registry-watcher.test.mjs`; expect changes emitted once and repair scans deterministic.
- [ ] Commit: `feat(12-03): watch and repair runtime inventory changes`.

---

## Phase 13: Target Safety, Hook Reconciliation, and Quarantine

**Goal:** Make deletion and invalid-dependency handling fail closed before routing.  
**Requirements:** SAF-09, SAF-10, MAP-02  
**Plans:** 3

### Plan 13-01: Deleted-target and alias safety

**Files:**
- Create: `src/registry/validate.mjs`
- Create: `tests/router.registry-safety.test.mjs`
- Modify: `tests/router.route-targets.test.mjs`

- [ ] Write failing tests reproducing deleted schema-backed slash commands, deleted skills/agents, stale aliases, and cross-runtime target loss.
- [ ] Implement strict target existence by invocation type; introduce an explicit `virtual_route` type instead of schema bypass.
- [ ] Verify deleted targets never enter compiled indexes.
- [ ] Commit: `fix(13-01): quarantine missing and deleted route targets`.

### Plan 13-02: Dependency, scope, and collision gates

**Files:**
- Modify: `src/registry/validate.mjs`
- Modify: `tests/router.registry-safety.test.mjs`

- [ ] Add failing cases for missing MCPs/tools/models, denied permissions, project leakage, duplicate identities, and alias collisions.
- [ ] Implement structured `pass`, `quarantine`, and `diagnostic_only` verdicts with actionable reasons.
- [ ] Preserve current missing-MCP non-dispatch behavior.
- [ ] Commit: `feat(13-02): validate registry dependencies and scope`.

### Plan 13-03: Hook file and binding reconciliation

**Files:**
- Modify: `src/registry/validate.mjs`
- Modify: `src/adapters/claude.mjs`
- Modify: `src/adapters/codex.mjs`
- Create: `tests/router.hook-reconciliation.test.mjs`

- [ ] Test valid pairs, orphan files, orphan bindings, changed commands, duplicate bindings, and disabled plugins.
- [ ] Emit diagnostics without auto-registering untrusted hook files.
- [ ] Run all Phase 13 suites and `tests/router.coexistence.test.mjs`; expect PASS.
- [ ] Commit: `feat(13-03): reconcile hook files and runtime bindings`.

---

## Phase 14: Deterministic Mapping, Activation, and Rollback

**Goal:** Safely map changed capabilities and atomically activate verified registry versions.  
**Requirements:** MAP-01, MAP-02, ACT-01  
**Plans:** 3

### Plan 14-01: Deterministic mapping engine

**Files:**
- Create: `src/registry/map.mjs`
- Create: `tests/router.registry-mapping.test.mjs`
- Modify: `calibration-tasks.json`

- [ ] Write failing tests for aliases, cross-runtime identity, route-family inheritance, lexical signals, collision margins, and unmapped fallback.
- [ ] Implement deterministic mapping with explicit evidence and confidence.
- [ ] Never generate invocation targets absent from the candidate registry.
- [ ] Commit: `feat(14-01): map registry changes deterministically`.

### Plan 14-02: Versioned activation and rollback

**Files:**
- Create: `src/registry/activate.mjs`
- Create: `tests/router.registry-activation.test.mjs`

- [ ] Test candidate writes, fsync/rename boundaries, pointer swaps, crash recovery, retention, rollback, and corrupt-version rejection.
- [ ] Implement immutable version directories and atomic `active.json` pointer replacement.
- [ ] Verify a failed candidate leaves active bytes unchanged.
- [ ] Commit: `feat(14-02): activate and roll back registry versions atomically`.

### Plan 14-03: Registry control CLI

**Files:**
- Create: `src/cli/router-control.mjs`
- Create: `tests/router.registry-cli.test.mjs`
- Modify: `install-router.mjs`

- [ ] Add failing JSON CLI tests for `status`, `diff`, `explain`, `registry verify`, and `rollback`.
- [ ] Implement read-only defaults and typed confirmation for rollback.
- [ ] Deploy CLI adapters for Claude and Codex without modifying unrelated settings.
- [ ] Run all Phase 14 suites plus calibration; expect PASS.
- [ ] Commit: `feat(14-03): expose registry control and diagnostics`.

---

## Phase 15: Context Capsules and Workflow-State Recovery

**Goal:** Resolve minimal referential prompts from compact, authoritative workflow state.  
**Requirements:** CTX-01, CTX-02, ORC-02  
**Plans:** 3

### Plan 15-01: Capsule schema, privacy, and persistence

**Files:**
- Create: `src/context/capsule.mjs`
- Create: `tests/router.context-capsule.test.mjs`

- [ ] Test bounded fields, source fingerprints, atomic writes, corrupt recovery, no raw prompts, and stale-field invalidation.
- [ ] Implement `validateCapsule`, `loadCapsule`, `mergeCapsule`, `saveCapsule`, and `isCapsuleFresh`.
- [ ] Enforce size limits and references instead of embedded documents.
- [ ] Commit: `feat(15-01): persist privacy-safe workflow context capsules`.

### Plan 15-02: Authoritative context sources

**Files:**
- Create: `src/context/sources.mjs`
- Create: `tests/router.context-sources.test.mjs`

- [ ] Test GSD `STATE.md`, approved design/spec/plan references, git branch and dirty summary, active goal, checkpoint, blockers, and missing files.
- [ ] Implement source readers with strict byte/entry budgets and no broad recursive reads.
- [ ] Explicit user instruction must outrank older capsule data.
- [ ] Commit: `feat(15-02): resolve authoritative project and workflow context`.

### Plan 15-03: Resume and refresh behavior

**Files:**
- Modify: `src/context/capsule.mjs`
- Modify: `src/context/sources.mjs`
- Create: `tests/router.context-resume.test.mjs`
- Modify: `src/cli/router-control.mjs`

- [ ] Test `continue`, `finish it`, `use the design`, new-session recovery, contradictory state, completed goals, and no-active-goal clarification.
- [ ] Implement `router context`, `context refresh`, and `why-next` JSON outputs.
- [ ] Verify no raw conversation text or full artifact body appears.
- [ ] Commit: `feat(15-03): resume workflows from minimal context`.

---

## Phase 16: Workflow-First Orchestration and Context Budgets

**Goal:** Select the best workflow, then its compatible capabilities and least-sufficient context.  
**Requirements:** ORC-01, ORC-02, TOK-01, TOK-02  
**Plans:** 3

### Plan 16-01: Workflow transition policy

**Files:**
- Create: `src/orchestrator/transitions.mjs`
- Create: `tests/router.workflow-orchestrator.test.mjs`

- [ ] Test brainstorming→design approval→implementation plan, GSD phase transitions, interrupted execution, verification gaps, milestone boundaries, and invalid transitions.
- [ ] Implement canonical workflow states and `nextValidTransitions(capsule, policy)`.
- [ ] Require one clarification when multiple materially different transitions remain tied.
- [ ] Commit: `feat(16-01): model valid workflow transitions`.

### Plan 16-02: Capability and dependency selection

**Files:**
- Create: `src/orchestrator/select.mjs`
- Modify: `tests/router.workflow-orchestrator.test.mjs`

- [ ] Test explicit overrides, workflow ownership, skills, commands, agents/subagents, MCP/tool/model dependencies, and event-bound hooks.
- [ ] Implement `selectWorkflow`, `selectCapabilities`, and `resolveDependencies`.
- [ ] Ensure MCPs/tools are selected only from workflow requirements, not lexical coincidence.
- [ ] Commit: `feat(16-02): select workflow-compatible capabilities`.

### Plan 16-03: Least-sufficient-context contracts

**Files:**
- Create: `src/orchestrator/budget.mjs`
- Create: `tests/router.context-budget.test.mjs`

- [ ] Test per-workflow allowed sources, hard budgets, artifact-summary cache reuse, reference substitution, and token regression reporting.
- [ ] Implement `planContextLoad(workflow, capsule, index, budget)` and deterministic token estimation.
- [ ] Default decision must load no full manifest, planning directory, conversation history, or design body.
- [ ] Commit: `feat(16-03): enforce least-sufficient routing context`.

---

## Phase 17: Compiled Prompt Routing and Safe Evolution

**Goal:** Connect versioned registry/capsules to the hot path and evolve mappings without prompt-time cost.  
**Requirements:** EVO-05, REL-01, CTX-02, TOK-01  
**Plans:** 3

### Plan 17-01: Compact compiled indexes

**Files:**
- Create: `src/runtime/prompt-router.mjs`
- Create: `tests/router.compiled-index.test.mjs`
- Modify: `install-router.mjs`
- Modify: `tests/router.mjs.snapshot`

- [ ] Test compact schema, deterministic compilation, versioned cache keys, explicit lookup, continuation lookup, lexical fallback, and fail-open behavior.
- [ ] Integrate compiled index/capsule reads into the deployed hook without directory scans or background work.
- [ ] Preserve existing sentinel, deny, MCP, cache, graph, telemetry, and injection behavior.
- [ ] Commit: `feat(17-01): route prompts from compiled registry indexes`.

### Plan 17-02: Canary evolution and rollback

**Files:**
- Create: `src/evolution/canary.mjs`
- Create: `tests/router.evolution-canary.test.mjs`
- Modify: `router.calibrate.mjs`

- [ ] Test weight/signal candidates, evaluation cohorts, privacy fields, success thresholds, failed canaries, and rollback decisions.
- [ ] Evolution may change weights/signals only; invocation, permissions, and dependencies remain immutable.
- [ ] Commit: `feat(17-02): canary and roll back routing evolution`.

### Plan 17-03: Minimal-prompt calibration and performance

**Files:**
- Modify: `calibration-tasks.json`
- Modify: `router.calibrate.mjs`
- Create: `tests/router.minimal-prompt.test.mjs`
- Create: `tests/router.perf-context.test.mjs`

- [ ] Add fixtures for `continue`, `finish it`, `use the design`, `do the next phase`, stale capsules, ambiguous goals, and explicit overrides.
- [ ] Measure warm p50/p95/max and context-token estimates.
- [ ] Require p95 <25 ms, max <100 ms, and no full-document default loads.
- [ ] Commit: `perf(17-03): calibrate minimal prompts and context routing`.

---

## Phase 18: Autonomous Lifecycle and Release Gates

**Goal:** Prove intervention-free safe add/change/delete propagation across Claude and Codex.  
**Requirements:** All v1.2 requirements  
**Plans:** 3

### Plan 18-01: Dual-runtime lifecycle E2E

**Files:**
- Create: `tests/router.dual-runtime-e2e.test.mjs`

- [ ] Build temporary Claude and Codex homes.
- [ ] Exercise add, edit, rename, move, disable, dependency change, delete, missed watcher event, rebuild, map, quarantine, activation, routing, and rollback.
- [ ] Assert safe changes require no user action and unsafe changes never alter active state.
- [ ] Commit: `test(18-01): cover autonomous dual-runtime lifecycle`.

### Plan 18-02: Installer, coexistence, and recovery gates

**Files:**
- Modify: `install-router.mjs`
- Modify: `tests/router.settings-diff.test.mjs`
- Modify: `tests/router.coexistence.test.mjs`
- Create: `tests/router.controller-recovery.test.mjs`

- [ ] Test install, upgrade, re-install, disable, uninstall, crash recovery, corrupt active index, and unrelated settings preservation.
- [ ] Verify existing Claude/Codex hooks and plugins coexist byte-for-byte outside owned bindings.
- [ ] Commit: `test(18-02): gate installation and controller recovery`.

### Plan 18-03: Final autonomous release matrix

**Files:**
- Create: `tests/router.autonomous-release.test.mjs`
- Modify: `tests/router.safety-release.test.mjs`
- Modify: `docs/superpowers/specs/2026-07-14-dual-runtime-auto-updating-router-design.md`

- [ ] Map every v1.2 requirement to executable test evidence.
- [ ] Run focused registry, watcher, safety, activation, context, orchestration, evolution, and E2E bundles.
- [ ] Run: `env -u NODE_OPTIONS node --test tests/*.test.mjs`  
  Expected: all tests pass, zero skipped release requirements.
- [ ] Run: `node router.calibrate.mjs`  
  Expected: existing core/codebase/evolution gates plus new minimal-prompt and dual-runtime gates pass.
- [ ] Run live dry-run installation and JSON smoke commands for status, diff, explain, context, verify, and rollback preview.
- [ ] Confirm warm p95 <25 ms, max <100 ms, bounded injection, and no prompt-time scan/model call.
- [ ] Update the approved design with final implementation decisions only if evidence required a deviation.
- [ ] Commit: `chore(18-03): certify autonomous dual-runtime routing`.

---

## GSD Execution Protocol

For each phase:

1. `$gsd-discuss-phase <N> --auto` — lock phase-specific decisions and non-goals.
2. `$gsd-spec-phase <N> --auto` — convert milestone requirements into an unambiguous phase contract.
3. `$gsd-plan-phase <N> --auto` — create executable PLAN.md files with wave dependencies.
4. `$gsd-validate-phase <N>` — ensure Nyquist coverage exists before or immediately after execution as appropriate.
5. `$gsd-execute-phase <N> --auto` — execute plans and generate SUMMARY.md plus VERIFICATION.md.
6. Run phase-focused tests, calibration where applicable, and the full regression gate.
7. Do not advance if phase verification is `gaps_found`, `human_needed`, missing, or stale.

### Phase dependencies

```text
11 Canonical registry/adapters
  → 12 Incremental watcher
  → 13 Safety/quarantine
  → 14 Mapping/activation
  → 15 Context capsules
  → 16 Workflow orchestration/budgets
  → 17 Prompt routing/evolution
  → 18 Autonomous release gates
```

Phase 15 can begin research while Phase 14 is executing, but implementation must consume Phase 14's version identity and activation contract. All other phase transitions remain sequential to keep the control-plane safety invariants mechanically verifiable.

## Final Verification Checklist

- [ ] v1.1 closeout artifacts are committed before starting v1.2.
- [ ] New v1.2 REQUIREMENTS.md contains REG, ADP, CHG, SAF, MAP, ACT, CTX, ORC, TOK, EVO, and REL requirements.
- [ ] ROADMAP.md continues numbering at Phase 11.
- [ ] Every phase has SUMMARY.md, VERIFICATION.md, and Nyquist-compliant VALIDATION.md.
- [ ] Full and incremental registry builds are byte-equivalent.
- [ ] Safe add/change/delete events propagate without intervention.
- [ ] Deleted slash commands, skills, and agents cannot remain activatable.
- [ ] Minimal prompts resume unique active workflows from compact capsules.
- [ ] Workflow selection precedes capability and dependency selection.
- [ ] Prompt-time routing performs no inventory scan, registry build, or model call.
- [ ] Warm p95 is below 25 ms and max is below 100 ms.
- [ ] Full suite, calibration, privacy, coexistence, recovery, and release matrices pass.
