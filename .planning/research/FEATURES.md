# Feature Landscape

**Domain:** Adaptive semantic routing and evidence-backed continuity for local coding-agent runtimes
**Project:** Router v1.8 Adaptive Semantic Routing and Continuity
**Researched:** 2026-08-09
**Confidence:** HIGH — derived from the approved v1.8 design and shipped Router constraints; no external claims required

## Scope

This is delta research for v1.8. It assumes the shipped Router already provides a deterministic compiled prompt path, normalized local capability inventory, authority and risk policy, native runtime adapters, scoped autonomy leases, receipts, verification, atomic activation, and last-known-good recovery. v1.8 should extend those paths, not introduce a parallel router.

The behavioral contract is deliberately capability-name-independent. Fixtures describe semantic roles and observable effects; runtime-local capabilities may have arbitrary names, aliases, locations, and implementation kinds.

## Table Stakes

Missing any item below makes the v1.8 claim incomplete or unsafe.

| Feature | Expected behavior | Complexity | Testable acceptance independent of exact names |
|---------|-------------------|------------|-----------------------------------------------|
| **Bounded structured intent inference** | Convert varied language into goal, subjects, operations, constraints, evidence needs, execution signal, and confidence before capability retrieval. Exact trigger phrases are optional hints, never the contract. | High | Paraphrases, misspellings, indirect requests, and renamed capabilities resolve to the same expected semantic workflow; changed goal, subject, or operation changes the workflow predictably. |
| **Non-execution language boundary** | Quoted, negated, prohibited, hypothetical, explanatory, and example text cannot become execution intent. A named capability may constrain selection but cannot grant authority. | High | Adversarial pairs differing only by quotation, negation, hypothetical framing, or explicit action produce the expected execution disposition; non-execution cases invoke nothing. |
| **Workflow-first eligibility** | Resolve intent to semantic workflow roles, then filter local records by availability, compatibility, dependencies, authority, risk, scope, and freshness before ranking. | High | An unavailable high-fit record loses to an eligible equivalent; disabled, stale, conflicting, cross-project, and missing-dependency records are never selected or invoked. |
| **Least-sufficient selection** | Prefer one eligible capability when it covers all required roles. Compose only for distinct uncovered requirements, collapse duplicate coverage, obey ordering and conflicts, and enforce fixed selection/injection caps. | High | Minimal fixtures select one record; multi-role fixtures select the smallest set whose declared outputs cover every required role; removing a required role removes the now-unnecessary selection. |
| **Safe native fallback** | If no eligible set exists, return a safe native action, recommendation, clarification, or precise coverage gap. Never fabricate a locator or silently choose a higher-risk substitute. | Medium | Empty, partial, and invalid inventories yield deterministic safe outcomes with zero unavailable invocations and an explicit unmet semantic role. |
| **Runtime-local projection** | Shared semantic behavior projects to each runtime's own inventory and native invocation locators. Equivalent outcomes do not require identical names, paths, kinds, or counts. | High | Isolated Claude and Codex fixtures with differently named equivalent records select the same semantic workflow and invoke only their own host-native identity. |
| **Scoped preference overlays** | Optional global-user, runtime, project, and workflow preferences break eligible ties or request compatible bundles; narrower scope wins. Preferences never bypass requirements, availability, authority, risk, conflicts, or project identity. | Medium | With equally eligible anonymous records, overlay scope deterministically changes selection; deleting, disabling, or making the preferred record unsafe restores the best eligible choice without route failure. |
| **Alias-safe preference continuity** | Stable semantic identity survives a capability rename or relocation when continuity evidence is valid. Unresolved aliases warn without blocking unrelated routing. | Medium | A renamed fixture preserves its preference through stable identity; an ambiguous alias is ignored and audited; unrelated workflows remain unchanged. |
| **Truthful last/current/next startup digest** | On a meaningful returning-project state, show the last verified outcome with evidence, current authoritative state, and exactly one deterministic likely next action. First visits, meaningless state, and unchanged acknowledged state stay quiet. | High | Verified, stale, absent, acknowledged, and cross-project fixtures produce exact presence/absence and field-count assertions; plans, prose, and unverified receipts never appear as completed work. |
| **Lease-bound resume** | Startup resumes automatically only when a valid lease covers the same project, goal, resource, risk, effect, and time bounds. Owner-gated effects remain blocked regardless of route confidence. | High | Valid lease resumes once; expired, revoked, foreign-project, out-of-scope, destructive, publish, credential, payment, and duplicate-resume cases invoke nothing and expose the blocking dimension. |
| **Behavioral proof chain** | Prove selected workflow, eligible capability set, actual native invocation, receipt linkage, required verification, and verified outcome. Recommendation text or zero exit alone is insufficient. | High | Every authorized action fixture asserts semantic selection, runtime-native identity, linked receipt fields, verification evidence, and terminal outcome; breaking any link fails the case. |
| **Independent evaluation dimensions** | Report correctness, safety, coverage, latency, context bytes, tool calls, receipts, verification, parity, and lifecycle separately. Any mandatory regression fails independently. | Medium | A fixture can improve one dimension while failing another; no aggregate score can mask an unsafe selection, missing proof, or budget breach. |
| **Prompt/startup path budget preservation** | Prompt and startup paths consume bounded compiled artifacts only: no scans, hashing sweeps, network, LLM, embeddings, learning, or mutable discovery. | Medium | Instrumented fixtures assert forbidden call count is zero, candidate/composition/context caps hold, and warm/cold latency is compared against the v1.7 baseline under matched conditions. |

## Differentiators

These features make v1.8 materially better than name/keyword routing while preserving the existing lightweight architecture.

| Feature | Value proposition | Complexity | Testable success |
|---------|-------------------|------------|------------------|
| **Semantic equivalence across unknown installations** | Users state outcomes instead of memorizing commands. Private, future, or renamed capabilities participate through typed contracts without product special cases. | High | The same golden intent passes against minimal synthetic inventories whose capability names, aliases, kinds, and paths are randomized while role/effect contracts remain constant. |
| **Composition minimality as a first-class invariant** | Router avoids both under-routing and capability pile-ons: every selected item closes a real workflow gap. | High | For each composition, removal of any selected record leaves a required role uncovered; adding redundant compatible records does not increase the selected set or tool-call count. |
| **Constraint-explainable selection** | Operators can inspect separate fit, coverage, availability, authority, risk, cost, and evidence decisions instead of trusting an opaque score. | Medium | Diagnostics identify the selected workflow and per-candidate accept/reject dimension without raw prompts, private capability bodies, or a composite quality score. |
| **Portable preference without product bias** | Personal taste travels by semantic role and scope while defaults remain useful on empty or unfamiliar setups. | Medium | Default fixtures contain no maintainer capability IDs; a maintainer overlay changes only matching eligible roles and can be removed with byte-equivalent default behavior. |
| **Evidence-backed continuity without transcript replay** | Returning users receive useful orientation from compact verified state rather than stale conversation history or noisy generic suggestions. | Medium | Same compiled evidence yields the same one-action digest; changed verified state changes it; acknowledgement suppresses repetition; bounded output never requires prompt history or inventory access. |
| **Proof of actual use, not recommendation theater** | Router can demonstrate that selection affected host-native execution and that the requested outcome was verified. | High | Selected-versus-actual receipt identity, lease, action, completion evidence, and verification are causally linked; ignored recommendations and unrelated host success receive no credit. |
| **Behavioral parity rather than filesystem parity** | Claude and Codex can differ internally while users receive equivalent semantic and safety behavior. | High | Shared acceptance cases compare workflow, disposition, required evidence, and outcome class; they explicitly do not compare filenames, command strings, inventory size, or adapter mechanics. |

## Anti-Features

| Anti-feature | Why avoid | Required alternative |
|--------------|-----------|----------------------|
| **Exact-name or trigger-phrase routing as product truth** | Breaks on paraphrases, private capabilities, renames, and different runtime ecosystems. | Infer bounded intent and resolve semantic workflow roles against typed local contracts; use names only as retrieval hints. |
| **Maintainer `.claude`/`.codex` setup in defaults** | Turns one installation's plugins, paths, and preferences into hidden product requirements. | Use portable synthetic fixtures and keep personal choices in a separate local overlay. |
| **Select every relevant capability** | Inflates context, tool calls, coordination, latency, and conflict risk. | Select the smallest eligible set that covers required roles, with hard caps and redundancy collapse. |
| **Preference as override authority** | A favorite capability may be absent, unsafe, incompatible, stale, or unauthorized. | Apply preferences only after eligibility and policy filtering, as scoped tie-breakers or compatible bundle requests. |
| **Confidence as permission** | High route fit does not establish execution authority or acceptable risk. | Keep intent confidence, authority, risk, compatibility, and evidence as independent gates. |
| **Free-form startup planner** | Can invent next work, drift from authoritative state, leak across projects, and add prompt-path weight. | Derive exactly one next action deterministically from verified state and known workflow transitions. |
| **Continuity from plans, prose, git recency, or command success alone** | These signals do not prove that the requested outcome occurred. | Require project-bound verified evidence and complete causal receipts; degrade stale state to refresh guidance. |
| **Automatic resume without a valid scoped lease** | Converts inferred intent or prior activity into open-ended authority. | Resume only within explicit project/goal/resource/risk/effect/time bounds and preserve all owner gates. |
| **Recommendation-text assertions as evaluation** | A router can print the right words while invoking nothing, invoking the wrong host path, or skipping verification. | Assert actual selection, eligibility, native invocation identity, receipt chain, verification, and terminal outcome. |
| **Composite routing score** | Lets strength in latency or recall hide unsafe execution, excess tool calls, or missing evidence. | Publish independent measurements and fail each mandatory threshold separately. |
| **Per-prompt LLM, embeddings store, network service, daemon, database, or second router** | Violates local-first privacy, deterministic latency, lifecycle simplicity, and the shipped architecture. | Extend the existing off-path compiler and bounded immutable prompt/startup artifacts. |
| **Prompt/startup scanning, hashing, learning, or mutation** | Adds unpredictable latency and turns a fail-open read path into a stateful failure surface. | Discover, normalize, evaluate, and publish off path; atomically activate only validated artifacts. |
| **Cross-runtime shell delegation** | Fakes parity and can bypass host-native authority and lifecycle semantics. | Keep semantic contracts shared but invocation adapter-owned and runtime-local. |
| **Byte-identical cross-runtime inventories** | Different hosts legitimately expose different capabilities and mechanics. | Require complete typed coverage per runtime and behavioral equivalence only where semantic counterparts exist. |
| **Automatic installation or repair of missing third-party capabilities** | Expands trust, network, and mutation scope beyond routing. | Explain the missing semantic role or recommend an explicit user-authorized operation. |
| **Raw prompt/private capability export for evaluation** | Violates local privacy and makes default tests dependent on one user's environment. | Use bounded contract summaries, redacted evidence, generated fixtures, and ignored sanitized integration snapshots. |

## Feature Dependencies

```text
Typed runtime-local capability coverage
    -> semantic eligibility contracts
        -> structured intent to workflow requirements
            -> least-sufficient selection and composition
                -> runtime-native projection and invocation
                    -> causal receipts and verification
                        -> behavioral proof

Verified project identity + authoritative workflow state
    -> truthful last/current/next digest
        -> valid scoped lease check
            -> optional safe resume

Eligible semantic identities
    -> scoped preference overlays
        -> tie-breaking or compatible bundle request

Portable synthetic fixtures
    -> name-independent semantic tests
    -> preference/default separation tests
    -> startup and lease safety tests
    -> cross-runtime behavioral parity
    -> independent baseline/candidate reports
```

## MVP Recommendation

Prioritize in this order:

1. **Portable semantic fixture contract** — define anonymous capability records, expected workflow roles, execution disposition, and proof assertions first so later phases cannot pass with name-based behavior.
2. **Intent inference and eligibility** — prove paraphrase equivalence and non-execution boundaries before composing or invoking anything.
3. **Least-sufficient composition** — add minimum-set coverage, ordering, conflict rejection, caps, and safe fallback over eligible records.
4. **Runtime-local projection and proof receipts** — demonstrate actual host-native use and verification in isolated Claude and Codex homes.
5. **Preference overlays** — add scoped tie-breaking only after default semantic selection is correct and portable.
6. **Startup continuity and lease-bound resume** — build on verified receipts and authoritative project identity; preserve silence as an accepted output.
7. **Independent evaluation and lifecycle gates** — compare v1.7 baseline/candidate dimensions and prove install, upgrade, rollback, uninstall, and last-known-good behavior.

Defer rich dashboards, remote/shared learning, additional runtime adapters, automatic capability installation, free-form startup planning, and any new storage or routing service. None is needed to prove v1.8's outcome.

## Phase-Level Research Flags

| Topic | Flag | Reason |
|-------|------|--------|
| Intent inference corpus | Deeper calibration needed | The representation is fixed, but precision/recall boundaries and paraphrase corpus breadth must be derived from deterministic fixtures without hand-mapping sentences. |
| Minimum-set composition | Algorithm spike recommended | Must prove minimality, deterministic ties, ordering, conflict handling, and bounded cost under small fixed candidate caps. |
| Preference identity continuity | Targeted research needed | Rename/relocation continuity must reuse existing stable-identity evidence and fail safely on ambiguous aliases. |
| Startup next-action transition rules | Targeted domain modeling needed | The action must be deterministic and truthful across heterogeneous project workflows without embedding a framework. |
| Behavioral receipts | Runtime-specific validation needed | Claude and Codex expose different native mechanics; both must close the same semantic proof chain without cross-runtime delegation. |
| Performance budgets | Benchmark during planning | Exact v1.8 limits should be set from matched v1.7 measurements rather than invented in research. |

## Sources

### Project sources (HIGH confidence)

- `.planning/PROJECT.md` — shipped Router baseline, v1.8 goal, active requirements, constraints, and explicit exclusions.
- `docs/superpowers/specs/2026-08-09-router-v1.8-adaptive-semantic-routing-design.md` — approved behavior, architecture boundary, acceptance contract, and non-goals.

No external sources were needed: this assignment translates an approved product contract into testable feature behavior rather than making ecosystem or library claims.

---
*Feature research for Router v1.8 Adaptive Semantic Routing and Continuity.*
