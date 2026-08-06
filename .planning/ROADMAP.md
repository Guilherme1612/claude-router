# Roadmap: Claude Router

## Milestones

- ✅ **[v1.0 Claude Router MVP](milestones/v1.0-ROADMAP.md)** — Phases 1-4 (shipped 2026-07-09)
- ✅ **[v1.1 Inspectable Routing Control Layer](milestones/v1.1-ROADMAP.md)** — Phases 5-10 (shipped 2026-07-14)
- ✅ **[v1.2 Autonomous Dual-Runtime Control Plane](milestones/v1.2-ROADMAP.md)** — Phases 11-20 (shipped 2026-07-23)
- ✅ **[v1.3 Adaptive Local Capability Steward and Intent-Native Routing](milestones/v1.3-ROADMAP.md)** — Phases 21-26 (shipped 2026-07-28)
- ✅ **[v1.4 Coverage Completeness & Auto-Skill Routing Improvement](milestones/v1.4-ROADMAP.md)** — Phases 27-29 (shipped 2026-07-31)
- ✅ **[v1.5 Framework-Neutral Adaptive Routing](milestones/v1.5-ROADMAP.md)** — Phases 30-36, 32.1, and 37.1 (shipped 2026-08-02)
- 🚧 **v1.6 Autonomous Control Plane** — Phases 38-46 (in progress)

## Overview

v1.6 extends the verified deterministic Router into a guarded control plane. Work proceeds through hard dependency gates: prove real native invocation and observation in each runtime, establish authority and continuity, harden capability trust, resolve and compose safely, dispatch proportionately, attribute causal outcomes, learn only from calibrated deterministic evidence, then migrate and release the assembled system.

## Phases

- [x] **Phase 38: Cross-Runtime Native Feasibility** - Prove truthful native dispatch, observation, protected-effect pause, startup delivery, and performance in Claude and Codex. (completed 2026-08-06)
- [ ] **Phase 39: Intent, Authority, Risk, and Invocation Policy** - Separate what the operator means, permits, and must confirm before any general execution.
- [ ] **Phase 40: Project Identity, Leases, Continuity, and Safe Resume** - Persist narrowly scoped authority and resume valid unfinished work exactly once.
- [ ] **Phase 41: Manifest vNext and Trust Hardening** - Make untrusted capability metadata and typed invocation contracts safe to inspect and ineligible by default.
- [ ] **Phase 42: Semantic Graph and Safe Composition** - Resolve unfamiliar installed capabilities and substitutions through validated semantic relationships.
- [ ] **Phase 43: Proportional Planning and Production Dispatch** - Choose the least costly reliable strategy and dispatch it within exact safety, scope, and resource bounds.
- [ ] **Phase 44: Receipts and Causal Attribution** - Preserve every route and actual invocation through a causally justified terminal outcome.
- [ ] **Phase 45: Deterministic Local Learning** - Calibrate exact evidence thresholds during planning, then shadow, canary, promote, or roll back local mappings safely.
- [ ] **Phase 46: Migration and Release Lifecycle** - Upgrade v1.5, recover, downgrade, disable, and uninstall atomically with installed dual-runtime release evidence.

## Phase Details

### Phase 38: Cross-Runtime Native Feasibility

**Goal**: Operators can prove whether each installed runtime can natively invoke and observe authorized work without weakening Router's prompt-time guarantees.
**Depends on**: Phase 37.1
**Requirements**: HOST-01, HOST-02, HOST-03, HOST-04
**Success Criteria** (what must be TRUE):

  1. In Claude Code, an authorized harmless fixture produces a real host-native invocation identity and linked completion evidence; recommendation text or a test helper alone cannot pass.
  2. In Codex, the same semantic fixture produces a real host-native invocation identity and linked completion evidence; recommendation text or a test helper alone cannot pass.
  3. Both runtimes show equivalent intent, authority, risk, pause, resume, and receipt outcomes, while any runtime that cannot prove native invocation and attributable observation reports recommendation-only mode and cannot autonomously dispatch.
  4. Installed prompt and startup paths meet their latency and token budgets while remaining read-only, fail-open, and free of scanning, hashing, network/API/LLM calls, mutation, or learning.

**Plans**: 3/3 plans executed
Plans:
**Wave 1**

- [x] 38-01-PLAN.md — Claude native dispatch tracer (HOST-01): contract + receipt store + Claude adapter + harmless fixture + off-hot-path trigger + anti-cheat test

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 38-02-PLAN.md — Codex adapter + parity + recommendation-only fallback (HOST-02, HOST-03)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 38-03-PLAN.md — Prompt/startup latency + token budget invariants + deploy bundle update (HOST-04)

### Phase 39: Intent, Authority, Risk, and Invocation Policy

**Goal**: Operators receive action only when their current instruction grants it and the effect fits an independently evaluated safety policy.
**Depends on**: Phase 38
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05
**Success Criteria** (what must be TRUE):

  1. Advice, inspection, one-turn action, persistent-goal action, and non-authorizing discussion are distinguished before capability execution is possible.
  2. Quotations, examples, negations, hypotheticals, audits, and policy discussion never create or widen authority, including when they contain autonomous wording.
  3. Operators can see that confidence, authority, effect risk, and compatibility are independent; confidence and historical success never grant permission.
  4. An explicitly authorized reversible local action proceeds after fit validation without a repeated command, while conflicting or low-fit evidence blocks or asks.
  5. Protected, external, privileged, destructive, credentialed, costly, published, deployed, or materially scope-expanding effects pause for host-mediated confirmation.

**Plans**: 2 plans

**Wave 1**

- [ ] 39-01-PLAN.md — authority taxonomy module (AUTH-01/02) + independent-input authority-policy evaluator (AUTH-03) + deploy bundle

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 39-02-PLAN.md — proceed/pause/ask gate (AUTH-04) + expanded protected-effect vocabulary (AUTH-05) + router.mjs hot-path wiring + dispatch receipt threading

### Phase 40: Project Identity, Leases, Continuity, and Safe Resume

**Goal**: Operators can persist, inspect, revoke, and safely resume bounded project-goal authority without stale or foreign state acting.
**Depends on**: Phase 39
**Requirements**: LEASE-01, LEASE-02, LEASE-03, LEASE-04, LEASE-05, LEASE-06
**Success Criteria** (what must be TRUE):

  1. Continuity and authority apply only to the exact repository, worktree, runtime, goal, schema generation, and current project fingerprint that created them.
  2. Only an explicit outcome-persistent instruction creates an inspectable lease with goal, scope, effects, bounds, expiry, authority source, status, checkpoint, and freshness; an ordinary action remains one-turn authority.
  3. Revoking a lease immediately prevents cached, pending-startup, recommended, or learned state from authorizing further work.
  4. Across supported compaction and restart paths, each incomplete action under a valid lease resumes at most once from its durable checkpoint.
  5. First visits remain silent; returning projects receive at most one evidence-backed briefing, and invalid or non-active continuity never auto-runs.

**Plans**: TBD

### Phase 41: Manifest vNext and Trust Hardening

**Goal**: Operators can inspect trustworthy capability contracts while malformed, stale, malicious, or scope-escaping metadata and invocations remain inert.
**Depends on**: Phase 40
**Requirements**: TRUST-01, TRUST-02, TRUST-03, TRUST-04, TRUST-05
**Success Criteria** (what must be TRUE):

  1. Operators can inspect provenance and explicit, inferred, unknown, stale, or conflicting status for every action, I/O, dependency, effect, cost, risk, permission, completion, and native-invocation field.
  2. Descriptions, manifests, plugins, private integrations, and learned records remain untrusted evidence and cannot create authority, instructions, or broader risk.
  3. Every eligible invocation has typed arguments and passes entrypoint, containment, cwd, wrapper, quoting, target, and runtime-scope validation before reaching an adapter.
  4. Dependency, permission/effect, timeout, retry, output, and completion contracts are validated before dispatch.
  5. Invalid, ambiguous, stale, unavailable, injection-bearing, or scope-escaping capabilities are blocked or quarantined with reasons while independent valid fallbacks stay eligible.

**Plans**: TBD

### Phase 42: Semantic Graph and Safe Composition

**Goal**: Operators can resolve and understand compatible capabilities and compositions by semantic contract without framework privilege or permission laundering.
**Depends on**: Phase 41
**Requirements**: SEM-01, SEM-02, SEM-03, SEM-04
**Success Criteria** (what must be TRUE):

  1. A semantic outcome resolves compatible installed public, private, proprietary, plugin, service, native, or unfamiliar capabilities without a named-framework source branch.
  2. Operators can inspect versioned requires, produces, conflicts, substitutions, compositions, and lifecycle evidence explaining why a capability fits.
  3. Ambiguous ties, native-identity collisions, stale targets, missing dependencies, incompatible outputs, unsafe compositions, and unresolvable contracts fail strict compilation before activation.
  4. A failed route substitutes only to a contract-compatible candidate inside unchanged authority, risk, scope, and resource bounds, with both routes retained for attribution.

**Plans**: TBD

### Phase 43: Proportional Planning and Production Dispatch

**Goal**: Authorized work executes through the simplest reliable strategy that satisfies safety, correctness, quality, and bounded-resource constraints.
**Depends on**: Phase 42
**Requirements**: STRAT-01, STRAT-02, STRAT-03, STRAT-04
**Success Criteria** (what must be TRUE):

  1. A small single-path correction dispatches directly without child agents unless measured specialist value is required for correctness or verification.
  2. Larger work selects sequential, parallel, specialist, or composed execution from real dependencies, verification needs, fit, risk, and coordination cost rather than a fixed agent count.
  3. Every selected strategy treats safety and correctness as hard constraints, satisfies required outcome quality, and only then optimizes expected time, tokens, calls, retries, failures, and coordination.
  4. Resource exhaustion or repeated failure causes one evidence-backed replan and then a truthful block, while verified independent work remains checkpointed and only unfinished safe work resumes.

**Plans**: TBD

### Phase 44: Receipts and Causal Attribution

**Goal**: Operators can trace every Router route from pre-invocation identity through what actually ran to a causally justified terminal outcome.
**Depends on**: Phase 43
**Requirements**: RCPT-01, RCPT-02, RCPT-03, RCPT-04, RCPT-05
**Success Criteria** (what must be TRUE):

  1. Before invocation, a durable pending receipt binds project, goal, route, action, mapping generation, capability fingerprint, authority, risk, and idempotency identities.
  2. Every emitted or attempted route reaches an explicit invoked, ignored, rejected, substituted, blocked, partial, failed, completed, or preserved-unknown state without disappearing.
  3. Operators can inspect actual composition, bounded evidence, permissions, checkpoints, verification references, time, token classes, calls, retries, failures, and coordination cost without raw prompts.
  4. Only causally linked invocation and verified postcondition evidence receives outcome credit; ignored recommendations, unrelated recovery, later success, and exit zero do not.
  5. Compact inspection exposes selected-versus-actual divergence, alternatives, rejection reasons, corrections, and substitutions while large logs stay off startup and prompt paths.

**Plans**: TBD

### Phase 45: Deterministic Local Learning

**Goal**: Operators benefit from reversible local mapping improvements only when exact planning-time-calibrated evidence gates prove them safe and better.
**Depends on**: Phase 44
**Requirements**: LEARN-01, LEARN-02, LEARN-03, LEARN-04
**Success Criteria** (what must be TRUE):

  1. Learning candidates use only causally attributable receipts and explicit corrections partitioned by runtime, project, capability fingerprint, and mapping generation.
  2. Before promotion implementation, phase planning calibrates, pre-registers, and tests exact minimum-sample, consistency, freshness/drift, negative-control, improvement, and quality-regression thresholds; this roadmap intentionally supplies no values.
  3. Candidates that lack the calibrated evidence remain shadowed, and no candidate can alter permission, effect risk, privacy/export, or authority fields.
  4. Eligible candidates pass deterministic correctness, safety, performance, compatibility, shadow, and bounded-canary gates before promotion.
  5. Observer gaps, contradictory or subjective evidence, opaque behavior, or failed canaries suspend promotion and restore the complete last-known-good tuple without disabling otherwise-safe routing.

**Plans**: TBD

### Phase 46: Migration and Release Lifecycle

**Goal**: Operators can move between v1.5 and v1.6 lifecycle states atomically and release only an installed, adversarially verified dual-runtime system.
**Depends on**: Phase 45
**Requirements**: MIG-01, MIG-02, MIG-03, MIG-04, MIG-05
**Success Criteria** (what must be TRUE):

  1. A representative v1.5 installation upgrades only after every persisted record is classified, and no legacy record or success history becomes v1.6 authority.
  2. Interrupted migration recovers through its durable journal to either the complete verified v1.5 tuple or complete verified v1.6 tuple, never mixed generations.
  3. Operators can repair, roll back, disable, downgrade, and re-enable v1.6 while preserving compatible evidence and quarantining incompatible state.
  4. Uninstall removes only Router-owned v1.6 hooks, adapters, views, leases, receipts, migration state, watchers, and temporary artifacts while preserving unrelated configuration.
  5. Release evidence from installed Claude and Codex proves dispatch, pause, observation, startup, restart, migration, rollback, uninstall, trust boundaries, privacy, token budgets, lifecycle isolation, and latency gates.

**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 38. Cross-Runtime Native Feasibility | v1.6 | 3/3 | Complete    | 2026-08-06 |
| 39. Intent, Authority, Risk, and Invocation Policy | v1.6 | 0/TBD | Not started | - |
| 40. Project Identity, Leases, Continuity, and Safe Resume | v1.6 | 0/TBD | Not started | - |
| 41. Manifest vNext and Trust Hardening | v1.6 | 0/TBD | Not started | - |
| 42. Semantic Graph and Safe Composition | v1.6 | 0/TBD | Not started | - |
| 43. Proportional Planning and Production Dispatch | v1.6 | 0/TBD | Not started | - |
| 44. Receipts and Causal Attribution | v1.6 | 0/TBD | Not started | - |
| 45. Deterministic Local Learning | v1.6 | 0/TBD | Not started | - |
| 46. Migration and Release Lifecycle | v1.6 | 0/TBD | Not started | - |

## Coverage

- v1.6 requirements: 42
- Mapped exactly once: 42
- Unmapped: 0
- Duplicated: 0

## Deferred / Out of Scope

- Coffee-specific observations are acceptance fixtures only; they do not define product or framework scope.
- Rich graph/receipt visualization, sanitized mapping exchange, and additional runtimes remain future requirements.
- Independent daemons, confidence-derived authority, unbounded execution, automatic installation, automatic protected effects, raw-prompt learning, and named-framework branches remain out of scope.
