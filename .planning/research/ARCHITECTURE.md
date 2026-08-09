# Architecture Research: Router v1.8 Adaptive Semantic Routing and Continuity

**Domain:** Runtime-local deterministic capability routing for Claude Code and Codex  
**Researched:** 2026-08-09  
**Confidence:** HIGH — mapped from the approved v1.8 design to the current shipped source; no external technical claims were needed

## Recommendation

Extend the shipped router in place. The current architecture already has the required control-plane and data-plane seams: runtime adapters, normalized capability records, contract inference, eligibility gates, relationship compilation, workflow selection, authority and lease policy, immutable release tuples, native dispatch, causal receipts, startup acknowledgement, and atomic lifecycle recovery.

v1.8 should make those seams richer and connect them into one production decision path. It should not add another router, another registry, a database, an embeddings store, an LLM classifier, a network service, or another long-running controller.

Only two new product modules are justified:

1. `src/registry/preferences.mjs` — validate and resolve scoped preference overlays without allowing them to modify eligibility, authority, risk, or availability.
2. `src/steward/continuity.mjs` — reduce verified receipts and authoritative project state into a bounded last/current/next digest without conflating continuity with lease authority.

Add one repository-only evaluation entry point, `scripts/evaluate-v18.mjs`, backed by fixtures and existing test helpers. Semantic retrieval and composition belong in `src/intent/classify.mjs` and `src/orchestrator/select.mjs`; creating a separate semantic-router package would duplicate the shipped router.

## Recommended Architecture

```text
                         OFF-PROMPT CONTROL PLANE

 Claude roots ─┐
 Codex roots ──┼─> existing runtime adapters
 project roots ┘            │
                            v
                 normalized registry records
                            │
             contract inference + typed classification
                            │
       relationship/workflow compilation + preference resolution
                            │
        coverage audit + reconciliation + production validation
                            │
                            v
          existing immutable release tuple publication
       active pointer <── verified tuple ──> known-good pointer
                            │
                            v
      bounded runtime-local prompt/startup projection per runtime

                         PROMPT / STARTUP DATA PLANE

 prompt ─> one existing router decision pipeline
              │
              ├─> bounded structured intent
              ├─> workflow requirements
              ├─> eligible runtime-local candidates
              ├─> least-sufficient composition
              ├─> authority / risk / lease / approval gates
              └─> recommendation or native dispatch envelope
                                      │
                                      v
                            existing host adapter
                                      │
                                      v
                         pending -> terminal receipt
                                      │
                                      └─> continuity + local evidence reducers

 session/project entry ─> compiled continuity digest ─> render once / acknowledge
                                              └─> resume only through valid lease gate
```

The important architectural boundary is compilation. Discovery, metadata inference, preference resolution, graph validation, coverage classification, continuity reduction, and evaluation remain outside prompt/startup latency. Prompt and startup consumers read only size-bounded, hash-verified, immutable projections.

## Existing Modules to Extend

### Runtime discovery and normalized capability truth

| Existing file | v1.8 responsibility | Required change |
|---|---|---|
| `src/adapters/claude.mjs` | Discover and normalize Claude-local skills, agents, commands, tools, hooks, resources, plugins, and project-scoped items. | Extract declared semantic metadata when present; otherwise provide bounded evidence for safe inference. Keep Claude locators and invocation mechanics Claude-owned. Do not infer cross-runtime equivalence from matching names. |
| `src/adapters/codex.mjs` | Project the same canonical record contract from Codex-local roots and plugin/config forms. | Add equivalent metadata extraction for Codex surfaces while preserving Codex-native identities and locators. Unsupported forms become classified records, not missing records. |
| `src/registry/schema.mjs` | Canonical record schema and validation. | Version the record contract to cover semantic intents, subjects, operations, effects, evidence requirements, composition roles, conflicts/exclusivity, bounded cost hints, classification, and source freshness. Preserve canonical sorting and portable paths. |
| `src/registry/contract.mjs` | Declared-first, evidence-backed field inference and correction overlays. | Extend `CONTRACT_FIELDS`; keep unknown effects, authority, dependencies, and risk non-dispatchable. Contract corrections remain separate from user preferences. |
| `src/registry/eligibility.mjs` | Independent hard gates for dispatch eligibility. | Consume the new fields and return separate gate outcomes for presence/loadability, runtime, scope, dependencies, effects, authority ceiling, risk, conflicts, and freshness. Preferences never enter this module. |
| `src/registry/build.mjs` | Sole assembly point for runtime observations, contracts, relationships, eligibility, and tuple inputs. | Replace name-based workflow stamping as the primary path with semantic identities and workflow-role claims. Keep exact names and aliases as retrieval hints only. Emit complete typed classification for every discovered record. |
| `src/coverage/audit.mjs` | Deterministic coverage truth. | Audit normalized registry records rather than only legacy manifest collections and mode-map targets. Classify every record as `routable`, `composable`, `direct-only`, `hook-owned`, `project-scoped`, `unavailable`, `invalid`, or `excluded`; report all unclassified records as build failures in strict mode. |

The canonical registry remains the only capability truth. `build-manifest.mjs` may continue gathering legacy inventory for compatibility, but v1.8 coverage and selection must derive from normalized registry records, not from a second phrase map.

### Semantic intent, workflow, and composition

| Existing file | v1.8 responsibility | Required change |
|---|---|---|
| `src/intent/classify.mjs` | Pure, deterministic prompt interpretation. | Preserve the non-execution precedence for prohibited, quoted, hypothetical, negated, preview, explanatory, and ambiguous text. Add bounded `goal`, `subjects`, `operations`, `constraints`, `evidence_needed`, and `execution_signal` output. The classifier must not read the filesystem or choose capability names. |
| `src/orchestrator/transitions.mjs` | Validate authoritative workflow state and select valid semantic transitions. | Keep the existing policy-as-data API, but stop treating the source-level GSD transition constants as portable product truth. Compile generic workflow-role transitions into `workflows.json`; framework-specific transitions arrive from discovered local contracts or project state. |
| `src/orchestrator/workflow-declarations.json` | Built-in canonical workflow roles and ordering. | Evolve the schema from capability-name owners into generic requirements, roles, evidence, ordering, and completion conditions. It may define product semantics such as reproduce/diagnose/fix/verify, but must not require GSD, Impeccable, Graphify, or any maintainer-installed capability. |
| `src/registry/semantic.mjs` | Bounded semantic candidate retrieval over compiled contract summaries. | Generalize the current single-outcome resolver to return a capped, deterministic candidate set with independent fit evidence. Retrieval uses declared/inferred intents, aliases, descriptions, subject/artifact context, and workflow roles; it does not grant authority. |
| `src/registry/relationships.mjs` | Evidence-gated graph of prerequisites, variants, conflicts, composition, fallbacks, and implementations. | Compile role coverage, ordering, conflicts, exclusivity, and multi-role capability collapse. Reject stale, dangling, cyclic, similarity-only, or unsafe edges before activation. |
| `src/orchestrator/select.mjs` | Sole least-sufficient capability selector. | Extend the current dependency closure: filter through hard eligibility first, then choose one capability when it covers all required roles; otherwise choose the smallest compatible set. Deterministic tie order is scope specificity, declared compatible preference, lower risk/effects, stronger evidence, lower bounded cost, then stable ID. Return independent diagnostics, not a composite score. |
| `src/orchestrator/strategy.mjs` | Convert the selected set into bounded ordered work. | Reuse its existing direct/sequential/parallel/composed strategies. Respect workflow role order and only parallelize independent work. Do not use strategy planning to retrieve a second capability set. |
| `src/orchestrator/actions.mjs` | Convert selected intent/workflow/capabilities into an action envelope. | Replace the current narrow verb families with the structured intent. Keep fresh state and eligibility as hard gates. Return recommendation, clarification, or a validated action; never dispatch directly. |

Do not add `semantic-router.mjs` or `composer.mjs`. `classify.mjs` already owns intent, `semantic.mjs` already owns semantic retrieval, and `select.mjs` already owns capability closure. Extending those three keeps one route decision and one explain surface.

### Preferences, authority, and execution

| Existing file | v1.8 responsibility | Required change |
|---|---|---|
| `src/registry/preferences.mjs` **(new)** | Validate local `semantic role -> preferred capability IDs or aliases -> scope -> priority` overlays and resolve aliases against the current runtime registry. | Return only tie-break facts and audit warnings. Reject malformed/foreign scope, cap entries, and leave unresolved aliases inert. This module must not mutate contracts or eligibility. |
| `src/intent/authority.mjs` | Keep confidence separate from permission and protected effects. | Consume the structured execution signal, but preserve current independent authority/risk/compatibility output. Capability-name mentions remain preferences or constraints, never permission expansion. |
| `src/orchestrator/approval.mjs` | Bind owner confirmation to exact action effects and targets. | Include the selected composition and workflow generation in the existing binding. A preference or lease cannot bypass this check. |
| `src/lease/*` | Durable scoped autonomy authority and safe resume. | Reuse as-is structurally. Bind any automatic continuation to exact project, goal, runtime, resources, risk, expiry, and checkpoint. No continuity record may mint a lease. |
| `src/adapters/dispatch/contract.mjs` | Final canonical pre-dispatch contract and bounded child policy. | Accept the selected composition/work item and required verification contract. Revalidate strategy, lease, authority, effects, and runtime identity immediately before invocation. |
| `src/adapters/dispatch/claude.mjs`, `codex.mjs` | Runtime-native execution only. | Invoke only locators from that runtime's active projection. Never bridge a Claude selection through Codex or vice versa. Recommendation-only remains explicit when a host surface is unsupported. |
| `src/adapters/dispatch/receipt.mjs` | Causal selected-versus-actual evidence. | The existing fields already support selected/actual composition, alternatives, strategy, work ID, lease, verification, and bounded evidence. Tighten required links rather than introducing another receipt store. |

### Compiled artifacts and activation

| Existing file | v1.8 responsibility | Required change |
|---|---|---|
| `src/prompt/publish-index.mjs` | Sole publisher of the complete verified release tuple. | Compile runtime-local semantic postings, generic workflow requirements, eligible candidate summaries, preference tie-break facts, closure/budget data, and continuity reference into the existing tuple. Stop reading source-level workflow declarations as the production selection authority after compilation. |
| `src/prompt/compile-index.mjs` | Size-, schema-, hash-, freshness-, and compatibility-checked tuple loader. | Bump compatibility/schema and validate the v1.8 bounded prompt projection. Preserve projection-only loading, active-to-known-good fallback, `O_NOFOLLOW`, and per-member limits. |
| `src/registry/map.mjs` | Candidate mapping and activation diagnostics. | Treat legacy mode-map routes as explicit compatibility evidence, not the semantic source of truth. Produce runtime-local route identities from selected workflow contracts. |
| `src/registry/reconcile.mjs` | Candidate/active safety comparison. | Invalidate changed contracts, preference aliases, workflow declarations, semantic postings, continuity schemas, and runtime projections by fingerprint. Isolate invalid records where complete tuple integrity is unaffected. |
| `src/registry/validate.mjs` | Production activation gates. | Add typed-coverage, paraphrase, composition, unsafe-selection, projection-size, context-byte, and baseline-delta gates. Keep safety/correctness gates absolute and dimensions separate. |
| `src/registry/activate.mjs` | Immutable versioning, active/known-good pointers, rollback, and recovery. | Reuse unchanged in concept; activate the v1.8 tuple only as one verified unit. Never activate registry and semantic index independently. |
| `src/registry/watcher.mjs` | Single existing incremental controller. | Add preference and relevant project-evidence fingerprints to dirty-input classification. Rebuild only affected runtime/project projections, with periodic full-equivalence checks. Do not add a second watcher or daemon. |

Use the existing tuple members where they already fit:

```text
registry.json          normalized runtime-local records and classification
contracts.json         capability semantic/effect/evidence contracts
relationships.json     validated composition and conflict graph
intent-policy.json     bounded intent policy/lexicon metadata
workflows.json         generic role requirements, ordering, and retrieval postings
index.json             compact workflow/route projection
closure.json           prevalidated dependency/composition summaries
budget.json            bounded context/tool/work limits
summary-index.json     bounded summaries/evidence references
suggestion-reference.json  continuity/startup reference (schema-evolved)
health-policy.json     independent calibration and safety thresholds
```

Do not add a separate semantic-index persistence tree unless measured tuple-size limits prove the existing `workflows.json` member cannot hold the bounded postings. The current tuple already hashes, verifies, publishes, recovers, and uninstalls the required artifact family.

### Startup continuity

| Existing file | v1.8 responsibility | Required change |
|---|---|---|
| `src/steward/continuity.mjs` **(new)** | Purely reduce verified outcome receipts plus authoritative project state into `{last_verified, current, likely_next, resume}`. | Require project identity, evidence reference, freshness, and one deterministic next transition. Plans and assistant prose are not completion evidence. Return null for first visits or meaningless state. |
| `src/steward/startup-pointer.mjs` | Durable bounded pointer/reference consumed at startup. | Evolve the schema from suggestion availability to a project-bound continuity reference/fingerprint with expiry/freshness. Keep the 4 KiB bound and atomic replacement. |
| `src/steward/startup-ack.mjs`, `state.mjs` | Suppress repeated delivery without suppressing changed evidence. | Acknowledge by project + digest fingerprint, not a global suggestion fingerprint. Preserve cooldown and local `0600` state. |
| `src/orchestrator/next-prompt.mjs` | Deterministic digest renderer. | Render exactly one primary next action and a lease-qualified resume line. Keep output bounded and do not become a free-form planner. |
| `src/lease/briefing.mjs` | Active-lease evidence. | Feed its valid active-lease result into continuity rendering. It remains silent for absent, expired, revoked, completed, blocked, or foreign leases. |
| `src/context/prompt-route.mjs` | Bounded compiled context/continuity projection. | Read and render the compiled digest without scans or mutation. Remove framework-specific explicit prompt parsing from the v1.8 path; explicit intent belongs to `classify.mjs`. |

Continuity and authority remain separate records. A returning project can receive last/current/next without an active lease. Only `lease/policy.mjs` can authorize automatic resume.

### The one production routing path

`src/runtime/router.mjs::inspectDecision()` remains the sole production prompt decision owner. Today it runs the established guard/BM25/mode-map flow while `context/prompt-route.mjs` can pre-handle contextual prompts. v1.8 should converge these paths:

1. `context/prompt-route.mjs` loads the verified projection and continuity context but does not independently choose a capability.
2. `inspectDecision()` applies existing safety/meta-language guards, calls the extended structured classifier, reads the already-loaded compiled semantic projection, and delegates retrieval/composition to the existing semantic/select policy.
3. The legacy BM25/mode-map result may contribute aliases and shadow diagnostics during migration, but it must not compete as another active production selector for a v1.8 tuple.
4. Exactly one final decision proceeds to authority/risk policy, bounded context rendering, native dispatch trigger, telemetry, and explain-last output.

Activation is schema-gated: an active verified v1.8 tuple enables the semantic path; an older verified tuple keeps the shipped legacy path. A partially written, incompatible, stale, or oversized v1.8 tuple falls back to known-good. There is never a state where both selectors can dispatch.

## Data Flow

### 1. Discovery to active runtime-local projection

```text
actual Claude/Codex/project roots
  -> adapters discover and normalize every item
  -> schema + contract inference validate each record
  -> typed classification records route/composition disposition
  -> eligibility hard-gates executable records
  -> relationships compile prerequisites/conflicts/roles
  -> preferences resolve only against compatible local IDs
  -> coverage audit proves every discovered record classified
  -> map/reconcile/validate candidate against active tuple
  -> publish all members to one immutable release tuple
  -> verify hashes, compatibility, limits, tests, and runtime projection
  -> atomically replace active pointer; retain known-good
```

Claude and Codex receive separate locally built tuples from their own inventories. They share schema and workflow semantics, not capability counts, paths, names, or invocation locators.

### 2. Prompt to least-sufficient decision

```text
prompt + project identity + verified prompt projection
  -> non-execution precedence / structured intent
  -> canonical workflow requirements and evidence needs
  -> capped semantic retrieval from runtime-local postings
  -> eligibility, scope, dependency, conflict, risk hard filters
  -> one capability if sufficient; otherwise minimum compatible role cover
  -> preference tie-break only among compatible sets
  -> order/collapse composition and enforce injection/tool caps
  -> authority + lease + approval decision
  -> clarify | recommend | dispatch envelope
```

Ranking diagnostics expose intent fit, requirement coverage, availability, authority, risk, cost, preference, and evidence strength separately. No combined quality score controls activation or execution.

### 3. Dispatch, verification, and learning

```text
validated action envelope
  -> dispatch contract revalidates runtime/lease/effects/strategy
  -> pending receipt written with selected composition
  -> current runtime adapter invokes host-native locator
  -> receipt records actual invocation/substitution and terminal evidence
  -> verification requirement closes or leaves outcome incomplete
  -> continuity reducer updates last/current/next off path
  -> local learning consumes only causal bounded evidence
  -> candidate changes still pass shadow/canary/atomic publication
```

A successful process exit without required verification is not a verified outcome. A recommendation that was not invoked receives no success credit.

### 4. Startup continuity

```text
session/project entry
  -> load bounded tuple projection only
  -> match opaque project/worktree identity
  -> validate digest freshness and evidence reference
  -> first visit / meaningless / foreign / stale: silent or refresh advice
  -> render last verified + current + one likely next action
  -> active matching lease: include scoped resume status
  -> acknowledge digest fingerprint after successful emission
```

No startup scan, receipt-log traversal, free-form planning, or autonomous mutation is allowed. Those computations happen before publication.

## Activation and Trust Boundaries

| Boundary | Rule |
|---|---|
| Capability files -> registry | Treat capability bodies and metadata as untrusted declarations. Enforce size, path containment, schema, provenance, freshness, and safe inference. Unknown authority/effects/risk never become executable. |
| Registry -> semantic graph | Only validated records and evidence-backed active edges compile. Names, descriptions, and lexical similarity retrieve candidates but cannot create authority, dependencies, or safe composition claims. |
| Preferences -> selection | Preferences may order already compatible candidates only. They cannot make an absent, stale, unavailable, conflicting, out-of-scope, unauthorized, or higher-risk capability eligible. |
| Candidate tuple -> active tuple | Typed coverage, semantic correctness, unsafe-selection count, size, latency, context, lifecycle, and installed projection gates must pass before one atomic pointer switch. |
| Prompt -> action | Quotation, negation, hypothetical, explanation, policy discussion, and ambiguity remain non-execution dispositions. Confidence is not authority. |
| Route -> native invocation | Revalidate runtime-local locator, scope, lease, approval, effects, arguments, strategy, and idempotency at dispatch time. Never construct shell commands from free prompt text. |
| Receipt -> continuity/learning | Require causal IDs and verification references. Raw prompts, capability bodies, credentials, and project content do not enter exported diagnostics or learning state. |
| Continuity -> resume | Continuity can suggest one next action. Only a valid scoped lease can authorize automatic continuation, and owner-gated effects remain blocked. |

## File Responsibility Summary

```text
src/adapters/*                  host discovery, normalization, native projection
src/registry/schema.mjs        canonical record validation
src/registry/contract.mjs      declared-first contract inference/corrections
src/registry/eligibility.mjs   hard executable eligibility
src/registry/semantic.mjs      bounded semantic retrieval
src/registry/relationships.mjs composition/conflict graph validation
src/registry/preferences.mjs   scoped compatible tie-breaks only (new)
src/registry/build.mjs         single registry assembly pipeline
src/coverage/audit.mjs         complete typed classification audit
src/intent/classify.mjs        structured intent and non-execution precedence
src/intent/authority.mjs       permission/risk policy independent of confidence
src/orchestrator/transitions.mjs authoritative workflow transition selection
src/orchestrator/select.mjs    least-sufficient compatible capability set
src/orchestrator/strategy.mjs  bounded ordering/parallelism for selected set
src/orchestrator/actions.mjs   final action envelope, no effects
src/orchestrator/approval.mjs  owner-gated exact-effect confirmation
src/prompt/publish-index.mjs   sole tuple compiler/publisher
src/prompt/compile-index.mjs   sole bounded verified tuple loader
src/steward/continuity.mjs     verified last/current/next reduction (new)
src/steward/startup-*.mjs      bounded delivery pointer and acknowledgement
src/lease/*                    scoped autonomy authority
src/adapters/dispatch/*        native invocation and causal receipts
src/runtime/router.mjs         one production prompt decision and rendering path
src/lifecycle/router-lifecycle.mjs install/upgrade/rollback/uninstall ownership
scripts/evaluate-v18.mjs       deterministic repository evaluation report (new)
```

## Dependency-Ordered Build Sequence

### 1. Canonical contract and typed coverage

Extend `schema.mjs`, `contract.mjs`, adapters, `eligibility.mjs`, `build.mjs`, and `coverage/audit.mjs`. Add portable synthetic inventories for empty, minimal, conflicting, invalid, plugin-heavy, project-scoped, and equivalent-but-renamed Claude/Codex homes.

**Gate:** Every discovered record receives exactly one v1.8 classification; unknown effects/authority/risk are recommendation-only; no maintainer path or capability name appears in defaults.

### 2. Generic workflow and structured intent contracts

Evolve `workflow-declarations.json`, `transitions.mjs`, and `classify.mjs`. Compile generic roles and evidence needs from product declarations plus discovered local contracts. Keep the current active route untouched.

**Gate:** Paraphrase, misspelling, indirect intent, quotation, negation, hypothetical, explanation, and multilingual fixtures produce deterministic structured intent without execution false positives.

### 3. Runtime-local retrieval, composition, and preferences

Extend `semantic.mjs`, `relationships.mjs`, and `select.mjs`; add `preferences.mjs`; reuse `strategy.mjs` for ordering. Run candidate selection in shadow against the current router before activation.

**Gate:** One capability wins when sufficient; multi-role cases select the minimum compatible set; conflicts, missing dependencies, unavailable items, and preference attempts to widen policy are rejected.

### 4. Compile and atomically publish the v1.8 projection

Bump tuple compatibility in `compile-index.mjs`; extend `publish-index.mjs`, `map.mjs`, `reconcile.mjs`, and `validate.mjs`. Keep all semantic artifacts inside the existing complete tuple and known-good lifecycle.

**Gate:** Full and incremental builds are byte-equivalent; corrupt/stale/oversized members fall back to known-good; Claude and Codex projections contain only local locators; prompt projection stays within measured size/context budgets.

### 5. Converge onto one prompt decision path

Wire the verified v1.8 projection into `runtime/router.mjs::inspectDecision()`. Reduce `context/prompt-route.mjs` to context/continuity projection for v1.8. Legacy BM25/mode-map remains the older-schema fallback and shadow comparator, not a simultaneous dispatcher.

**Gate:** For any prompt, at most one selector can produce a dispatch envelope; authority/risk/lease gates run once; warm and cold latency are measured against the same v1.7 baseline conditions.

### 6. Truthful continuity and lease-qualified resume

Add `steward/continuity.mjs`; extend startup pointer, acknowledgement, next-prompt rendering, receipt reduction, and tuple publication. Reuse project identity and lease modules.

**Gate:** First visits are silent; stale/foreign/unverified evidence never claims completion; exactly one next action is shown; unchanged digests do not repeat; only an active matching lease can resume.

### 7. Behavioral evaluation and causal proof

Add `scripts/evaluate-v18.mjs` and fixture matrices using existing test helpers. Extend dispatch/receipt verification, lifecycle gates, release scripts, and installed-runtime smoke tests. Keep each metric independent.

**Gate:** Reports separately cover typed coverage, workflow/capability-set correctness, unsafe/unavailable selections, unnecessary capabilities/tool calls, intent false positives/negatives, latency, context bytes, receipt completeness, verification satisfaction, parity, and lifecycle. No composite score.

### 8. Installer, upgrade, rollback, and uninstall closure

Only after schemas stabilize, update `router-lifecycle.mjs` module ownership and deployment lists, clean-install/upgrade migration, generated local projections, rollback, recovery, and uninstall. The maintainer's live homes are optional installed-runtime evidence, never default fixtures or product configuration.

**Gate:** Isolated Claude and Codex homes pass install, upgrade, rollback, repair, disable/enable, uninstall, last-known-good recovery, and host-native smoke tests without modifying unrelated user files.

### Ordering rationale

- Typed contracts precede retrieval because semantic ranking over unsafe or incomplete records is meaningless.
- Generic workflow roles precede composition because the selector needs an explicit set of requirements to cover.
- Composition precedes publication so the tuple schema is based on actual bounded data needs.
- Atomic publication precedes hot-path activation so a failed v1.8 candidate cannot partially replace v1.7 behavior.
- The single-path cutover precedes continuity-driven resume so automatic continuation cannot use two competing route decisions.
- Receipts and verification precede continuity claims and learning credit.
- Lifecycle migration comes last because it should migrate into stable schemas once, not chase intermediate formats.

## Anti-Patterns to Reject

### A second semantic router

Do not build a new service or module tree that independently parses prompts, scans capabilities, ranks candidates, and dispatches. Extend the existing classifier, semantic resolver, selector, and router decision. Two active selectors create conflicting authority, diagnostics, caches, and receipts.

### Maintainer setup as architecture

Do not ship paths, counts, aliases, plugin names, or preferred UI bundles copied from current `.claude` or `.codex` homes. Use those homes only as sanitized/ignored integration fixtures; product truth comes from runtime-local discovery.

### Preferences as contract overlays

Do not reuse correction overlays to force preferences into authority-critical fields. Preferences are tie-break inputs after compatibility and safety gates; corrections amend evidence-backed contract truth.

### Prompt-time discovery or rich graph traversal

Do not scan roots, hash files, parse capability bodies, infer contracts, traverse unbounded graphs, read receipt logs, learn, or call an LLM on prompt/startup paths. Compile bounded postings and closures off path.

### Static framework transitions as portable truth

Do not expand the current GSD-specific constants into a larger hard-coded catalog. Keep generic workflow roles in product policy and discover framework-specific implementations from local contracts.

### Composite routing quality score

Do not collapse fit, coverage, availability, authority, risk, cost, and evidence into one number. Hard constraints gate first; independent dimensions remain visible in diagnostics and evaluation.

## Scalability and Performance Boundaries

| Concern | Small install | Large/plugin-heavy install | Required ceiling |
|---|---|---|---|
| Discovery | Full local scan acceptable off path | Incremental dirty-root rebuild with periodic full equivalence | Never on prompt/startup path |
| Semantic retrieval | Direct bounded postings lookup | Candidate cap before contract checks | Fixed candidate maximum per intent dimension |
| Composition | Usually one capability | Bounded role cover over capped candidates | Small fixed role and selected-capability caps; no general solver |
| Prompt projection | One runtime-local tuple | Same schema with bounded summaries/postings | Existing per-member byte limits, versioned when measured |
| Continuity | One digest lookup | One project-bound compiled digest lookup | No receipt-log traversal; exactly one next action |
| Evaluation | Focused fixtures | Matrix across synthetic homes and installed projections | Explicit/offline only; never delays prompts |

The first implementation should use deterministic capped enumeration for least-sufficient role cover, not a general optimization library. The workflow-role and candidate caps make this tractable and preserve the no-new-dependency goal. Revisit only if evaluation demonstrates a real ceiling.

## Sources Inspected

- `.planning/PROJECT.md`
- `docs/superpowers/specs/2026-08-09-router-v1.8-adaptive-semantic-routing-design.md`
- `src/runtime/router.mjs`
- `src/adapters/claude.mjs`, `src/adapters/codex.mjs`, `src/adapters/dispatch/*`
- `src/registry/{schema,contract,eligibility,semantic,relationships,build,map,reconcile,validate,activate,watcher}.mjs`
- `src/intent/{classify,authority}.mjs`
- `src/orchestrator/{workflow-declarations.json,transitions,select,strategy,actions,approval,budget,next-prompt}.mjs`
- `src/prompt/{compile-index,publish-index}.mjs`
- `src/context/{prompt-route,resolve,capsule,sources}.mjs`
- `src/steward/{startup-pointer,startup-ack,state,refresh,suggestion}.mjs`
- `src/lease/*`, `src/coverage/audit.mjs`, and `src/lifecycle/router-lifecycle.mjs`

## Open Planning Decisions

- Numeric candidate, role, composition, tuple-size, context-byte, and latency ceilings should be derived from the v1.7 baseline during phase planning rather than invented in architecture research.
- Decide whether generic built-in workflow declarations remain JSON or are emitted by the registry build. Either is acceptable if framework implementations are discovered and the compiled `workflows.json` is the sole production authority.
- Confirm which runtime-native session/startup event is available in each installed host. Lack of a safe event should degrade that runtime to prompt-time digest delivery, not create a polling daemon.
