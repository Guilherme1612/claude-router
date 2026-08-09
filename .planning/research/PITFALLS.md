# Domain Pitfalls: Router v1.8 Adaptive Semantic Routing and Continuity

**Project:** Claude Router v1.8  
**Scope:** Additions to the existing shipped router only  
**Researched:** 2026-08-09  
**Overall confidence:** HIGH — findings derive from the approved v1.8 design and the shipped-router constraints recorded in `PROJECT.md`; no external technical claims were required.

## Recommended Phase Ownership

These are proposed roadmap owners, not pre-existing phase numbers. Each phase extends the existing router rather than creating a parallel subsystem.

| Phase | Primary responsibility |
|---|---|
| **Phase 50 — Portable Runtime-Local Contracts and Fixture Boundary** | Typed capability coverage, provenance, runtime-local roots, portable synthetic fixtures, and strict separation of maintainer overlays from product defaults |
| **Phase 51 — Structured Semantic Retrieval and Least-Sufficient Ranking** | Bounded intent representation, workflow requirements, semantic retrieval, safe fallback, and paraphrase robustness |
| **Phase 52 — Safe Composition and Policy Preservation** | Role coverage, compatibility, ordering, conflict/exclusivity checks, capability caps, and authority/risk enforcement over the final composed action |
| **Phase 53 — Truthful Startup Continuity and Scoped Preferences** | Verified last/current/next projection, project/worktree identity, staleness handling, acknowledgement, lease validation, and preference tie-breakers |
| **Phase 54 — Independent Evaluation and Hot-Path Budgets** | Separate correctness/safety/performance measures, production-path benchmarks, deterministic evaluation, and mandatory regression gates |
| **Phase 55 — Installer, Native Parity, and Release Truth** | Ownership-exact lifecycle, isolated clean/upgrade/rollback/uninstall tests, runtime-native installed smoke evidence, and last-known-good recovery |

## Critical Pitfalls

### 1. Lexical Overfit

**What goes wrong:** Routing appears semantic but still depends on exact command names, skill names, aliases, or phrases from the calibration corpus. Paraphrases, indirect requests, misspellings, renamed capabilities, and unfamiliar local tools then resolve incorrectly or fail to resolve.

**Why it happens:** Existing signal patterns are easy to extend and easy to measure. A large alias table can raise fixture recall while bypassing the harder `intent -> outcome -> workflow requirements` step. Maintainer vocabulary can silently become the benchmark vocabulary.

**Consequences:** The router works mainly for prompts and installations resembling the maintainer's setup; adding more phrases causes collisions and brittle thresholds; a named high-risk capability may outrank a safer capability that better satisfies the actual workflow.

**Prevention:**

- Make the bounded structured intent and canonical workflow requirements the ranking contract. Names and aliases may retrieve candidates but may not establish eligibility or authority.
- Evaluate equivalent capabilities under different names and descriptions, plus paraphrases, indirect intent, misspellings, negation, quotation, and hypothetical wording.
- Split golden cases by meaning before generating wording variants so train/calibration and acceptance sets cannot share paraphrase families.
- Require low-confidence ambiguity to pass through or ask, never execute.
- Keep dimensions separate in diagnostics: intent fit, requirement coverage, availability, authority, risk, cost, and evidence strength.

**Detection:** Correct routes collapse after renaming capabilities or removing trigger words; unseen paraphrases underperform known templates; adding aliases changes unrelated routes; confidence remains high when workflow requirements are not covered.

**Owning phase:** **Phase 51 — Structured Semantic Retrieval and Least-Sufficient Ranking.** Phase 54 must enforce held-out paraphrase and false-positive gates.

### 2. Personal-Install Coupling

**What goes wrong:** Product behavior assumes the maintainer's `.claude`/`.codex` roots, installed plugins, capability names, preference bundle, directory shape, or capability counts.

**Why it happens:** The live setup is the richest readily available integration environment. Generated snapshots, fixtures, defaults, and assertions can accidentally preserve absolute paths or named local capabilities.

**Consequences:** Clean or minimal installations fail; private capability content leaks into repository artifacts; Claude and Codex projections become copied mirrors rather than runtime-local views; framework neutrality is lost.

**Prevention:**

- Discover actual roots through existing runtime adapters and treat each runtime's local inventory as authoritative.
- Keep canonical semantics shared, but keep availability and invocation locators runtime-specific.
- Use portable synthetic fixtures for empty, minimal, common, conflicting, invalid, project-scoped, plugin-heavy, and asymmetric installations.
- Treat the maintainer installation only as an ignored/generated or sanitized integration fixture.
- Store named preferences in optional local overlays keyed by semantic identity. Defaults must not mention GSD, Graphify, Impeccable, taste-skill, UI/UX Pro Max, or any other currently installed product.
- Add a repository scan gate for absolute home paths, private capability bodies, and maintainer-only names outside explicitly marked integration fixtures.

**Detection:** Tests fail under empty temporary runtime roots; default selection changes when a maintainer plugin is absent; repository artifacts contain `/Users/...`, `.claude`, or `.codex` inventory snapshots; parity expects identical capability counts.

**Owning phase:** **Phase 50 — Portable Runtime-Local Contracts and Fixture Boundary.** Phase 55 must re-prove portability in installed isolated homes.

### 3. Unsafe Composition

**What goes wrong:** The resolver selects every relevant capability instead of the least sufficient compatible set, combines conflicting or exclusive tools, invokes roles out of order, or composes a set whose aggregate effects exceed the safe fallback.

**Why it happens:** Per-capability relevance is mistaken for workflow compatibility. Independent candidates may each be valid while their combination duplicates work, expands side effects, violates preconditions, or bloats tool calls and injected context.

**Consequences:** Duplicate edits, conflicting instructions, excess latency and context, unverifiable receipts, and unintended network/publish/destructive effects. Composition becomes a second orchestration engine.

**Prevention:**

- Reuse canonical workflow roles and the existing resolver; do not add a second router or planner.
- Prefer one capability when it covers all required roles. Compose only for uncovered required roles.
- Validate the complete set before execution: runtime availability, inputs/preconditions, outputs, effects, role coverage, ordering, conflicts, exclusivity, dependencies, authority, risk, and evidence requirements.
- Collapse duplicate role coverage deterministically and apply fixed candidate, composition, context, and tool-call caps before expensive ranking or invocation.
- Evaluate policy on the union of effects for the composed plan, not on each item in isolation.
- If no compatible sufficient set exists, return a safe native action, recommendation, or concise missing-capability explanation.

**Detection:** Selected sets contain duplicate role providers; removing one capability does not reduce requirement coverage; tool-call or context counts rise without better outcome evidence; individually safe capabilities combine into an owner-gated effect; receipts cannot explain ordering or substitution.

**Owning phase:** **Phase 52 — Safe Composition and Policy Preservation.** Phase 54 owns regression gates for unnecessary capability/tool-call counts.

### 4. Authority Widening

**What goes wrong:** Routing confidence, a capability name in the prompt, a user preference, prior success, imported continuity, or a broad autonomy phrase is treated as permission to execute or as permission for stronger effects.

**Why it happens:** Semantic fit and authorization are both inputs to selection, which tempts implementers to blend them into one score. Composition can also hide authority escalation when each component is checked separately.

**Consequences:** Explanations, quotations, examples, hypotheticals, audits, or negated requests trigger action; a valid lease resumes outside its goal/resource/time bounds; publish, destructive, credentialed, payment, or other owner-gated effects proceed without confirmation.

**Prevention:**

- Preserve confidence, workflow fit, availability, authority, risk, and compatibility as independent gates.
- Capability names and preferences constrain selection only; they never grant authority.
- Validate execution signal before composition and validate the final composed effect set again immediately before dispatch.
- Unknown effects, authority, dependencies, or provenance lower eligibility and cannot become auto-executable through inference.
- Bind automatic resume to the existing explicit lease contract: exact project/worktree, goal, allowed effects, resources, runtime, generation, expiry, and last verified checkpoint.
- Keep publication, destructive actions, credentials, payments, and other owner gates blocked regardless of confidence or lease history.
- Record the authority source and policy decision in the causal receipt.

**Detection:** Raising confidence changes an advice request into execution; selecting a preferred capability changes permission; a composed plan has stronger effects than the request; migrated or repository-controlled state creates a lease; negated/hypothetical fixtures dispatch.

**Owning phase:** **Phase 52 — Safe Composition and Policy Preservation.** Phase 53 owns lease-bound resume checks; Phase 55 must prove the gates in both installed runtimes.

### 5. Stale or Cross-Project Startup State

**What goes wrong:** Startup reports an old result as current, proposes a next action from an obsolete workflow state, repeats an acknowledged message, leaks continuity across repositories/worktrees, or resumes from stale evidence.

**Why it happens:** Plans, assistant prose, Git history, successful process exits, and incomplete receipts are easier to read than verified outcome evidence. Cached pointers can outlive source artifacts, project identity, lease generation, or installed capability availability.

**Consequences:** False completion claims, work resumed in the wrong repository, repeated or duplicate actions, use of missing capabilities, and authority reconstructed from non-authoritative files.

**Prevention:**

- Compile startup from the existing bounded continuity/project view; never scan repositories, parse journals, or infer free-form plans at startup.
- Require project plus worktree identity, source fingerprints, verified terminal outcome/evidence, current workflow state, and runtime-local capability availability.
- Treat plans, prose, Git history, and unverified receipts as context only, never as verified completion or authority.
- Degrade stale or mismatched pointers to one refresh recommendation; do not resume them.
- Tie acknowledgement to the compiled continuity digest so unchanged state is emitted once while meaningful new verified state can surface.
- Keep first visits and meaningless state silent; emit exactly one primary next action.
- Revalidate lease generation, scope, risk/resource/time bounds, and checkpoint before claiming/resuming work.
- Publish atomically and retain active plus last-known-good artifacts.

**Detection:** The same digest appears repeatedly; touching or removing evidence does not invalidate continuity; two worktrees display the same next action; a plan-only fixture claims completion; expired/revoked/foreign leases resume; a stale pointer invokes an unavailable capability.

**Owning phase:** **Phase 53 — Truthful Startup Continuity and Scoped Preferences.** Phase 55 owns restart, rollback, corruption, and cross-runtime installed recovery cases.

## Moderate Pitfalls

### 6. Prompt/Startup Hot-Path Regression

**What goes wrong:** Semantic routing or continuity adds filesystem discovery, hashing, journal parsing, learning, dynamic graph traversal, unbounded ranking, repeated artifact loads, or extra context generation to `UserPromptSubmit` or `SessionStart`.

**Why it happens:** The easiest implementation computes fresh truth at request time. Helper-only microbenchmarks can remain green while production rendering, startup, and cache invalidation become slower.

**Consequences:** Tail latency exceeds the existing sub-100ms contract, startup becomes noisy or blocking, context grows, and fail-open reliability degrades.

**Prevention:** Keep discovery, normalization, inference, evaluation, learning, and compilation off-path. Prompt/startup consume bounded immutable compiled artifacts, with fixed candidate/composition/context caps and version/hash invalidation. Measure the real production hook and startup formatter, both cold and warm, against a frozen v1.7 baseline on the same fixture, machine class, and runtime mode. Gate p50, p95, maximum route, startup latency, artifact size, injected bytes, and tool-call count independently.

**Detection:** Benchmarks exercise only resolver helpers; latency scales with installed capability count or receipt history; startup reads JSONL; warm p95 passes while maximum or cold startup regresses; context bytes increase without additional required evidence.

**Owning phase:** **Phase 54 — Independent Evaluation and Hot-Path Budgets.** Every earlier phase must leave its work compilable off-path, but Phase 54 owns the production-path gate.

### 7. False Runtime Parity

**What goes wrong:** Claude and Codex are declared equivalent because fixture output, file counts, or canonical records match, even though one runtime uses foreign paths, cannot invoke natively, lacks completion evidence, or has different lifecycle behavior.

**Why it happens:** Byte equality is easier to test than semantic equivalence. The maintainer has both runtimes installed, which can hide accidental cross-runtime fallback.

**Consequences:** One runtime silently delegates through the other, invokes unavailable capabilities, reports success from selection text alone, or ships an adapter that works only in the development home.

**Prevention:**

- Compare canonical semantics and workflow behavior only where equivalent local capabilities exist; do not require identical counts, paths, commands, or host mechanics.
- Build each projection from its isolated runtime inventory and require adapter-owned native invocation locators.
- Test asymmetric homes where only one runtime or one equivalent capability exists, with foreign-root sentinel files that fail the test if read.
- Prove expected runtime-native invocation identity, causal completion receipt, and required verification—not recommendation text alone.
- Keep unsupported hosts and missing capabilities recommendation-only; never bridge execution through the other runtime.
- Run clean installed smoke tests for Claude and Codex after local build/fixture tests.

**Detection:** Tests pass when the target runtime home is empty but the other runtime is populated; parity asserts equal counts; receipts omit host-native identity; foreign paths appear in compiled artifacts; fixture parity passes while installed smoke fails.

**Owning phase:** **Phase 55 — Installer, Native Parity, and Release Truth.** Phase 50 establishes projection separation; Phase 55 supplies release evidence.

### 8. Misleading Metrics

**What goes wrong:** A composite score or broad “accuracy” number hides unsafe selections, wrong high-confidence routes, unnecessary composition, missing verification, latency tails, or lifecycle failures. Candidate and baseline are measured under different conditions.

**Why it happens:** One headline number is convenient, and recommendation text is cheaper to grade than actual invocation and outcome evidence. Averages also conceal rare but unacceptable safety failures.

**Consequences:** A candidate ships despite safety or performance regression; lexical memorization looks like semantic improvement; helper speed is mistaken for production speed; runtime parity and installer health remain unmeasured.

**Prevention:** Report and gate inventory coverage, workflow/capability-set correctness, unsafe/unavailable selections, false positives/negatives, unnecessary capabilities/tool calls, p50/p95/max latency, cold/warm startup, artifact/context bytes, receipt completeness, verification satisfaction, native parity, and lifecycle independently. Safety gates are absolute; no improvement elsewhere offsets an unsafe execution. Compare identical fixtures, corpus versions, machine class, runtime mode, cache state, and warm/cold conditions. Include selected-versus-actual invocation and terminal verification evidence.

**Detection:** A release decision cites one score; zero-unsafe is not explicit; only mean latency is shown; corpus or environment differs between baseline and candidate; route selection passes without invocation/receipt/verification; installed lifecycle results are absent.

**Owning phase:** **Phase 54 — Independent Evaluation and Hot-Path Budgets.** Phase 55 must consume the same dimensions for release acceptance rather than invent a release score.

### 9. Installer Ownership Drift

**What goes wrong:** Upgrade or uninstall overwrites/removes user-owned hooks, plugins, preferences, capabilities, or unrelated runtime files; installs into assumed roots; leaves mixed-version artifacts; copies private inventory into the repository; or activates a partial build.

**Why it happens:** Adaptive discovery touches more runtime-local artifacts, expanding the temptation to treat discovered files as Router-owned. Broad directory cleanup and in-place activation are simpler than ownership-exact lifecycle handling.

**Consequences:** User data loss, broken runtime startup, undeletable leftovers, rollback failure, cross-runtime contamination, and false confidence from source-tree-only tests.

**Prevention:** Extend the existing installer and mutation ledger. Detect actual roots; install only shared core plus detected adapters; treat all discovered capabilities and unrelated hooks/plugins as read-only user property; record every Router-owned mutation; stage and validate before atomic activation; preserve active and last-known-good tuples; fail closed on invalid projections; rollback only owned mutations; uninstall only ledger-recorded owned paths; revoke Router leases on disable/uninstall. Exercise clean install, coexistence, upgrade, interrupted upgrade, rollback, repair, and uninstall in isolated homes before installed smoke tests.

**Detection:** Uninstall uses broad globs or directory removal; ownership is inferred from location instead of the ledger; user files change during fixture lifecycle; active artifacts contain mixed versions; failed activation removes the known-good tuple; installed tests depend on source checkout paths.

**Owning phase:** **Phase 55 — Installer, Native Parity, and Release Truth.** Ownership semantics should not be deferred to post-release cleanup.

### 10. Test Leakage

**What goes wrong:** The deterministic suite reads the maintainer's live homes, environment, plugins, project state, caches, clocks, network, or generated artifacts. Tests pass because local capabilities exist, or mutate live Router state while claiming isolation.

**Why it happens:** Discovery intentionally reads local runtimes, and integration tests are easiest to bootstrap from the active installation. Hidden environment fallback can survive even when explicit fixture roots are supplied.

**Consequences:** Non-reproducible CI, private-content leakage, order-dependent tests, false portability/parity claims, damaged user state, and release evidence that cannot distinguish source fixtures from installed behavior.

**Prevention:**

- Make generated temporary runtime/project roots mandatory for the default suite and sanitize environment variables, caches, clocks, acknowledgements, leases, and network access.
- Fail if fixture-mode code reads outside declared roots; use foreign-root sentinel capabilities to detect fallback.
- Keep maintainer snapshots ignored/generated or sanitized and opt-in; never make them default-suite prerequisites.
- Separate deterministic fixture tests from explicitly scoped installed-runtime smoke tests. Label evidence by source fixture, generated install, or real installed runtime.
- Use unique temporary roots per test, deterministic time/IDs where behavior depends on them, and cleanup only inside the resolved temporary root.
- Scan committed fixtures and failure output for absolute home paths, raw prompts, private capability bodies, credentials, and project content.

**Detection:** Tests change result when live plugins are enabled/disabled; they pass only on the maintainer machine; runtime roots are optional; network or wall clock affects expected output; tests write to active Router state; snapshots contain home paths or private text.

**Owning phase:** **Phase 50 — Portable Runtime-Local Contracts and Fixture Boundary.** Phase 54 owns corpus isolation and reproducibility; Phase 55 owns separately labeled installed-runtime evidence.

## Phase-Specific Warnings

| Phase | Failure to prevent before exit | Required exit evidence |
|---|---|---|
| **50 — Portable Runtime-Local Contracts and Fixture Boundary** | Product defaults or default tests encode maintainer capabilities, paths, counts, or framework names | Empty/minimal/asymmetric/conflicting homes pass; every discovered record has typed provenance/classification; repository leakage scan is clean |
| **51 — Structured Semantic Retrieval and Least-Sufficient Ranking** | Alias/keyword recall is mistaken for semantic workflow resolution | Held-out paraphrases and renamed-capability fixtures select the correct workflow; ambiguous/non-execution cases do not dispatch |
| **52 — Safe Composition and Policy Preservation** | Relevant capabilities are maximally bundled or aggregate effects widen authority | Single-versus-composed cases prove minimum role coverage, deterministic ordering/conflict rejection, caps, union-of-effects policy, and owner gates |
| **53 — Truthful Startup Continuity and Scoped Preferences** | Plans, stale receipts, preferences, or foreign project state create completion or resume authority | First-visit silence; verified last/current/next; stale/foreign degradation; acknowledgement; valid-lease-only idempotent resume |
| **54 — Independent Evaluation and Hot-Path Budgets** | One score or helper benchmark conceals correctness, safety, or production-path regressions | Separate mandatory dimensions; frozen baseline/corpus; actual prompt/startup cold/warm measurements; no scan/network/learning on-path |
| **55 — Installer, Native Parity, and Release Truth** | Fixture success is reported as installed parity; lifecycle touches user-owned state | Isolated clean/upgrade/interruption/rollback/uninstall evidence plus host-native Claude and Codex invocation, receipt, verification, and known-good recovery |

## Ordering Rationale

1. Establish portable contracts and isolation before teaching the resolver; otherwise semantic behavior is calibrated to one installation.
2. Prove structured retrieval before composition; otherwise composition multiplies lexical mistakes.
3. Enforce aggregate policy with composition before continuity may resume anything.
4. Build continuity from verified resolver/receipt contracts, not provisional state.
5. Freeze independent evaluation and hot-path budgets before release qualification.
6. Finish with ownership-exact installation and real host-native parity; fixture success is necessary but not release truth.

## Research Flags

- **Phase 51:** Thresholds and retrieval weights require calibration against a reviewed held-out corpus; do not choose them from intuition or maintainer prompts.
- **Phase 52:** Aggregate effect and conflict semantics need adversarial fixtures because individually eligible capabilities can become unsafe in combination.
- **Phase 53:** Exact staleness and acknowledgement fingerprints should be specified during planning so restart, compaction, and worktree behavior remain deterministic.
- **Phase 54:** Numeric budgets must be derived from the same-machine v1.7 production baseline during planning; this research intentionally does not invent values.
- **Phase 55:** Runtime-native installed evidence remains mandatory even when all isolated fixtures pass.

## Sources

- `.planning/PROJECT.md` — shipped-router state, active v1.8 requirements, constraints, and framework-neutral/runtime-local product decisions. **Confidence: HIGH (project primary source).**
- `docs/superpowers/specs/2026-08-09-router-v1.8-adaptive-semantic-routing-design.md` — approved v1.8 architecture, acceptance contract, fixture matrix, lifecycle rules, and explicit non-goals. **Confidence: HIGH (approved design primary source).**

No external sources were used; the assignment concerns concrete failure modes of this repository's approved design rather than unstable third-party API behavior.
