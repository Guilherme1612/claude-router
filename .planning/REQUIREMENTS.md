# Requirements: Claude Router v1.8

**Defined:** 2026-08-09
**Core Value:** The user can write the minimum useful prompt and still get the best available workflow automatically, with low token overhead, sub-100ms prompt routing, and no per-prompt external classifier.

## v1.8 Requirements

### Runtime-Local Capability Coverage

- [ ] **CVRG-01**: Each supported runtime discovers every locally visible skill, agent, command, tool, hook, and workflow from that runtime's actual configured roots without assuming the maintainer's directory layout.
- [ ] **CVRG-02**: Every discovered record has a stable semantic identity, runtime-local locator, kind, provenance, availability, source freshness, and exactly one deterministic coverage classification.
- [ ] **CVRG-03**: Routable records expose typed intents, inputs, outputs, effects, risk, authority, composition, cost, evidence, and alias metadata from declared contracts or bounded safe inference.
- [ ] **CVRG-04**: Records with unknown effects, authority, dependencies, risk, invalid metadata, or unavailable targets remain inspectable but cannot become executable selections.
- [ ] **CVRG-05**: Claude and Codex each reach 100% discovered-record typed classification while allowing different counts, paths, host mechanics, and runtime-only capabilities.
- [ ] **CVRG-06**: Portable synthetic inventories cover empty, minimal, renamed, conflicting, invalid, project-scoped, plugin-heavy, and cross-runtime installations independently of live user homes.

### Semantic Intent and Workflow Retrieval

- [ ] **SEMR-01**: A prompt is reduced to bounded goal, subjects, operations, constraints, evidence needs, execution signal, and confidence fields before capability ranking.
- [ ] **SEMR-02**: Paraphrases, indirect requests, misspellings, and unknown capability names resolve through semantic workflow contracts without requiring exact trigger words.
- [ ] **SEMR-03**: Quoted, explanatory, hypothetical, negated, prohibited, ambiguous, and policy-discussion text cannot be upgraded into execute intent.
- [ ] **SEMR-04**: Candidate retrieval combines workflow requirements, capability contracts, project context, runtime availability, dependencies, local verified outcomes, and aliases within a bounded compiled index.
- [ ] **SEMR-05**: Candidate diagnostics expose intent fit, requirement coverage, availability, authority, risk, estimated cost, and evidence strength separately.
- [ ] **SEMR-06**: Anonymous fixtures prove that requests such as database relationship inspection and substantial UI redesign select the correct semantic workflows without naming Graphify, Impeccable, taste-skill, UI/UX Pro Max, or any equivalent product.

### Least-Sufficient Composition and Execution Proof

- [ ] **COMP-01**: The resolver selects one eligible capability when it covers all required workflow roles and composes multiple capabilities only for distinct uncovered roles.
- [ ] **COMP-02**: Composition collapses redundant capabilities, enforces role ordering, rejects declared conflicts, unions effects and risk, and obeys fixed capability, context, and tool-call caps.
- [ ] **COMP-03**: Missing or incompatible workflow coverage falls back to the safest native action, recommendation, clarification, or missing-capability explanation without fabricating targets.
- [ ] **COMP-04**: One production decision path owns semantic selection so legacy lexical routing cannot disagree with or bypass the activated semantic projection.
- [ ] **COMP-05**: Authorized execution uses only the current host's native invocation locator and produces causal receipts linking intent, route, workflow, selected capabilities, action, lease, actual invocation, completion, and verification evidence.
- [ ] **COMP-06**: Behavioral tests fail when recommendation text is correct but capability use, host-native invocation, receipt linkage, or required verification is absent or incorrect.
- [ ] **COMP-07**: UI redesign fixtures require portable design-direction, UX/system, implementation, and review roles while allowing one capability to satisfy multiple roles and selecting only the least sufficient compatible set.

### Scoped Preferences

- [ ] **PREF-01**: Optional local preference overlays map semantic roles to capability identities or aliases at global-user, runtime, project, and workflow scopes, with narrower scopes winning deterministically.
- [ ] **PREF-02**: Preferences apply only after eligibility and policy filtering and cannot bypass absence, incompatibility, authority, risk, effects, workflow requirements, or composition caps.
- [ ] **PREF-03**: Unresolved or stale preference aliases produce inert audit warnings and do not block unrelated routing or mutate active defaults.
- [ ] **PREF-04**: Maintainer integration fixtures may prefer Graphify for relationship analysis and Impeccable, taste-skill, and UI/UX Pro Max for substantial UI work, while equivalent synthetic fixtures prove the same workflows with entirely different capability names.

### Startup Continuity and Lease-Bound Resume

- [ ] **STRT-01**: A previously observed project with meaningful verified evidence receives one bounded startup digest containing last verified outcome, current authoritative state, one likely next action, and resume disposition.
- [ ] **STRT-02**: First visits, unchanged acknowledged state, meaningless state, and state supported only by plans, assistant prose, or incomplete receipts remain silent.
- [ ] **STRT-03**: Startup continuity is project-bound, source-fingerprint-aware, and degrades stale or conflicting evidence to refresh guidance without scanning inventories or receipt logs on startup.
- [ ] **STRT-04**: The likely-next action is deterministic for the same compiled state and derives from verified project state and known workflow transitions rather than free-form prompt-time planning.
- [ ] **STRT-05**: Automatic continuation occurs only under an unexpired explicit lease whose project, goal, action, effect, risk, resource, and time bounds contain the next action.
- [ ] **STRT-06**: Publication, destructive actions, credentials, payments, privileged operations, and other owner gates remain blocked even when routing confidence and continuity evidence are high.

### Independent Evaluation and Performance

- [ ] **EVAL-01**: A deterministic local evaluation entry point runs versioned, fingerprinted fixtures for discovery, classification, intent, composition, preferences, continuity, safety, receipts, verification, parity, and lifecycle prechecks.
- [ ] **EVAL-02**: Evaluation reports inventory coverage, workflow accuracy, capability-set accuracy, unsafe selection count, false positives and negatives, unnecessary capability and tool-call counts, prompt/startup latency, artifact/context bytes, receipt completeness, verification satisfaction, parity, and lifecycle results as independent dimensions.
- [ ] **EVAL-03**: No composite score can offset a mandatory safety, correctness, typed-coverage, verification, lifecycle, or performance regression.
- [ ] **EVAL-04**: Baseline and candidate measurements use the same corpus, machine class, runtime mode, and cold/warm conditions and include actual production prompt and startup paths rather than helper-only timing.
- [ ] **EVAL-05**: Numeric v1.8 budgets are derived from a recorded v1.7 baseline; prompt routing remains below the existing 100ms hard ceiling and all compiled/context/tool-call limits remain explicit.
- [ ] **EVAL-06**: Full and incremental builds produce equivalent activated semantics for the same source fingerprint, and failed candidates preserve the last known good tuple.
- [ ] **EVAL-07**: The maintainer's live Claude and Codex homes are optional integration fixtures only; the default suite passes in isolated synthetic homes with no private capability bodies or raw prompts committed.

### Portable Lifecycle and Release Truth

- [ ] **LIFE-01**: Installation detects actual supported runtime roots and installs only shared core plus adapters for detected runtimes without overwriting unrelated user configuration.
- [ ] **LIFE-02**: Installation discovers local capabilities, builds runtime-specific registries and compiled projections, validates hooks, paths, permissions, dependencies, and compatibility, then activates atomically.
- [ ] **LIFE-03**: Every installer-owned mutation is recorded so upgrade, rollback, uninstall, and last-known-good recovery are deterministic and preserve user-owned files and coexisting hooks or plugins.
- [ ] **LIFE-04**: Clean install, upgrade, rollback, uninstall, and recovery pass in isolated Claude and Codex homes with no dependency, database, daemon, embeddings model, network service, or second router added.
- [ ] **LIFE-05**: Installed Claude and Codex smoke tests prove runtime-local typed coverage, active semantic projections, native invocation identity, startup behavior, and release-tuple integrity.
- [ ] **LIFE-06**: Unsupported runtimes remain recommendation-only until an explicit adapter contract and lifecycle suite are implemented.
- [ ] **LIFE-07**: Release evidence reconciles repository tests, independent evaluation, installed-runtime results, security, Nyquist validation, milestone audit, roadmap, archive, and tag state before completion is claimed.

## Future Requirements

### Additional Runtime Adapters

- **FUTR-01**: Additional agent runtimes can implement the normalized inventory, projection, native invocation, receipt, and lifecycle adapter contracts.

### Rich Inspection

- **FUTR-02**: A richer local visualization can explore semantic relationships and evaluation history after the bounded CLI diagnostics prove insufficient.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Per-prompt LLM or embedding classifier | Violates deterministic latency, privacy, token, offline, and reproducibility goals. |
| Manual phrase mapping for every possible prompt | Cannot remain complete across paraphrases, renamed capabilities, or personalized installations. |
| Byte-identical Claude and Codex inventories | Runtime-local capabilities and host mechanics legitimately differ; semantic behavior is the parity target. |
| Hardcoded maintainer capability bundle | Personal preferences belong in optional overlays and integration fixtures, not product defaults. |
| Automatic installation of missing capabilities | Discovery may recommend; installation remains an explicit user operation. |
| Remote telemetry, shared learning, or dashboard service | v1.8 evaluation and learning remain local and privacy bounded. |
| Database, daemon, second watcher, or second router | Existing JSON artifacts, watcher, compiled index, and activation path are sufficient. |
| Free-form startup planner | Startup next actions must be deterministic, verified, bounded, and silent when evidence is insufficient. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CVRG-01..06 | Phase 50 | Pending |
| SEMR-01..06 | Phase 51 | Pending |
| COMP-01..07 | Phase 52 | Pending |
| PREF-01..04 | Phase 53 | Pending |
| STRT-01..06 | Phase 53 | Pending |
| EVAL-01..07 | Phase 54 | Pending |
| LIFE-01..07 | Phase 55 | Pending |

**Coverage:**
- v1.8 requirements: 43 total
- Mapped to phases: 43
- Unmapped: 0

---
*Requirements defined: 2026-08-09*
*Last updated: 2026-08-09 after approved design and milestone research*
