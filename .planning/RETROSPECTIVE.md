# Milestone Retrospectives

## v1.1 — Inspectable Routing Control Layer

**Shipped:** 2026-07-14  
**Scope:** Phases 5–10, 23 plans, 42 requirements

### What Worked

- Operator commands made routing decisions, coverage gaps, blocked dependencies, and evolution state directly inspectable.
- Shared dry-run routing logic reduced drift between live routing, calibration, and diagnostic output.
- Focused safety tests turned fail-open, latency, privacy, coexistence, and missing-MCP behavior into executable release gates.
- Independent phase verification and the milestone audit closed planning-state drift before archival.

### What Could Improve

- Inventory freshness still depends on explicit rebuilds; additions and removals are not reconciled automatically.
- Claude and Codex inventories do not yet share one canonical schema or lifecycle.
- Short prompts such as `continue` need durable workflow-state recovery, not prompt-only matching.
- Advisory evolution does not yet apply validated, reversible changes automatically.

### Decisions Carried Forward

- Keep prompt-time routing deterministic, local, and under 100ms.
- Move scanning, hashing, reconciliation, and learning to a background controller.
- Require validation, quarantine, rollback, and last-known-good artifacts for every automatic mutation.
- Measure token cost and workflow success, not only route-match accuracy.

### Next Milestone

Build the Autonomous Dual-Runtime Control Plane described in the approved design and implementation plan, continuing at Phase 11.

## v1.2 — Autonomous Dual-Runtime Control Plane

**Shipped:** 2026-07-23
**Scope:** Phases 11–20, 46 plans, 93 tasks, 20 requirements
**Timeline:** 2026-07-14 → 2026-07-22 (8 days, 214 commits)

### What Was Built

- Canonical dual-runtime registry (Claude + Codex) with evidence-gated SHA-256 identities and bounded native parsing.
- Incremental change detection: Merkle fingerprint tree + single-flight watcher → inactive reconciliation, byte-identical to clean builds.
- Fail-closed target safety, hook full-outer-join reconciliation, inactive quarantine.
- Deterministic mapping, eight-gate verifier, atomic activation, cross-process CAS, crash-recoverable rollback.
- Privacy-safe context capsules + workflow-state recovery for short prompts (`continue`).
- Workflow-first orchestration: transition resolved before capabilities; least-sufficient bounded context.
- Compiled prompt routing + canary evolution; REL-01 gates pass (warm p95 15.63ms, max 22.98ms).
- Autonomous lifecycle: five-verb coexistence, recovery matrix, release-runner gates.
- Phase 19: ORC-01/TOK-02 live-path closure (orchestrator baked into publish, read-only route projection).
- Phase 20: EVO-05 production trigger (telemetry→evidence → canary promote/rollback).

### What Worked

- Re-verification caught two false-positive "passed" audits (EVO-05 telemetry-bridge orphaned, ACT-01 prod-verifier E2E missing) and forced real gap-closure phases (19, 20) instead of shipping on stale evidence.
- Locked design contracts (19-ORCHESTRATOR-INPUT-DECISION.md, workflow-declarations.json) let Plans 02/03/04 implement against a frozen tuple shape without re-deciding mid-execution.
- The opt-in `test_mode` seam kept the production hot path untouched while lifecycle tests drove the real watcher→controller→publishCompiledIndex flow.
- Three-source cross-reference for requirements (REQUIREMENTS.md ↔ VERIFICATION.md ↔ SUMMARY frontmatter) made coverage gaps unhideable.

### What Was Inefficient

- Re-audit cycle: the audit's integration checker ran against stale code state, forcing a superseding re-audit after the fix landed. Audit evidence should be regenerated against current HEAD before verdict.
- Parallel-install-test flakiness across 5 lifecycle suites from node:test concurrency races — required `--test-concurrency=1` workaround rather than a root cause fix.
- Installed hook snapshot drifted (Jul 16) ahead of Phase 17–20 commits, producing 14/720 pre-v1.2 full-suite failures that were env-drift, not code defects — re-sync step is manual.
- Plan one-liner extraction pulled junk rows (dates, review-rule labels) into MILESTONES.md, requiring manual curation.

### Patterns Established

- Decimal/closure phases (19, 20) inserted after cross-cutting Phase 18 to close audit BLOCKERs — keep phase numbering continuous, never restart.
- Per-workflow sibling tuple files (closure.json/budget.json/summary-index.json) frozen at publish time; route path is a read-only projection, never re-derives.
- `dispatch_eligible` flag carries blocked results forward in v1 rather than blocking the budget — v2 deferral pattern that preserves v1 correctness.
- Telemetry→evidence→canary is the canonical evolution trigger surface (watcher primary, CLI operator, release-runner).

### Key Lessons

- A "passed" audit is only as good as the code state it ran against — re-run integration checks against current HEAD before milestone close.
- Test concurrency races masquerade as flaky product code; isolate lifecycle/install suites that share a controller.
- Keeping the hook import graph closed (zero new imports, inlined version constants) is a hard constraint worth the manual-sync hazard it costs.
- Re-verification is a feature: surfacing false positives late is cheaper than shipping orphaned wiring.

### Tech Debt Carried Forward

- v2 per-prompt source descriptors (Phase 19).
- WR-01: `publish-index.mjs:87-92` hardcodes `position.state='planned'` (latent v2).
- `compile-index.mjs:5-6` inlined `CONTEXT_CONTRACT_VERSION` (manual sync, D-08).
- Serialize parallel install/lifecycle test suites.
- Re-sync `~/.claude/hooks/router.mjs` via `install-router.mjs`.

### Next Milestone

v1.3 not yet planned. Run `/gsd-new-milestone`.

## v1.3 — Adaptive Local Capability Steward and Intent-Native Routing

**Shipped:** 2026-07-28
**Phases:** 6 (21–26) | **Plans:** 31 | **Tests:** 1102/1102 pass

### What Was Built

- Authoritative personalized inventory (Phase 21): framework-neutral local truth of installed `.claude`/`.codex` capabilities with evidence-gated stable identities.
- Conservative contracts + typed relationship graph (Phase 22): normalized contracts, recommendation-only uncertainty, lifecycle-safe reverse invalidation.
- Intent-safe state-aware execution (Phase 23): eight-disposition intent classifier + framework-neutral action mapper + SHA-256 approval gate behind a four-gate dispatch path.
- Privacy-safe outcomes + capability health (Phase 24): bounded local outcome signals drive conservative health observations; no raw prompts persisted.
- Advisory stewardship + guarded drafts (Phase 25): one high-confidence recommendation, preview-only drafts, no silent mutation.
- Coherent publication + dual-runtime release (Phase 26): byte-identical atomic recoverable tuple publication + fail-closed release matrix (312-record fixture, warm p95 <25ms, max route <100ms, context 194B).

### What Worked

- Audit-first ship gate: `ship_with_deferred` verdict let BLOCKER 2 (live-install verification) defer cleanly to v1.3.1 without blocking 27/27 phase criteria.
- Reusing the v1.2 verify/publish/canary/rollback lifecycle for v1.3 tuples avoided a second publication engine.
- Framework-neutral contract-only authority kept `gsd-` tokens at 0 in dispatch logic — no framework hardcoding crept in.

### What Was Inefficient

- Phase 26 VERIFICATION.md used `status: verified` instead of the canonical `status: passed`, which made `init.manager` report `all_phases_verified=false` (projection lag) and nearly forced an override closeout — a one-character frontmatter drift created a false milestone-blocker.
- Release matrix runs `mkdtempSync` + `testMode: true` fixtures, so it can pass while real installs stay stale (BLOCKER 2) — the gap was only caught by the milestone audit, not by the release gate itself.
- Orphaned temp-dir watchers from prior sessions survived into v1.3 activation work, polluting watcher-reconcile observations.

### Patterns Established

- Canonical verification status string is `passed`; any other value fails closed in the readiness projection. Audit verdicts are the source of truth when projection lags.
- Release-gate hardening (live-install verification) is a milestone-level deferral, distinct from phase success criteria — track in STATE.md Deferred Items, close in a `.1` follow-up milestone.
- Watcher-reconcile activation must be confirmed from the operator's own shell so the daemon is theirs, not the build session's.

### Key Lessons

- A non-canonical frontmatter string in one phase artifact can mask a fully-verified milestone — normalize status fields before trusting projection queries.
- A passing release matrix against fixtures is not a passing release against real installs — add a read-only live-install verification stage before declaring a release gate closed.
- Watcher process hygiene is part of activation correctness, not just test cleanliness — orphaned watchers produce false stale-pointer signals.

### Tech Debt Carried Forward

- BLOCKER 2: live-install release verification stage (REL-05/06/07) — v1.3.1.
- Orphaned temp-dir watcher cleanup — v1.3.1.
- router.safety-release live-env failures — v1.3.1.
- Watcher-reconcile → activation_status=activated confirmation from operator shell — v1.3.1.
- v2 per-prompt source descriptors (Phase 19) — still carried.

### Next Milestone

v1.3.1 release-gate hardening (deferred items above). Run `/gsd-new-milestone`.

## v1.4 — Coverage Completeness & Auto-Skill Routing Improvement

**Shipped:** 2026-07-31
**Phases:** 3 (27–29) | **Plans:** 8 | **Tasks:** 19 | **Tests:** 1188/1188 pass

### What Was Built

- Mutation safety infrastructure (Phase 27): `cacheKey` folds `weightsMtime` as 7th positional component; `routeTargetsExist` guards every cache hit against stale targets; `assessMutationSafetyRegression` enforces warm p95 <40ms / max <100ms; `capRouteRender` + 30KB builder guard cap injection and mode-map size.
- Coverage audit-guard (Phase 28): deterministic typed coverage report classifying every manifest capability into an `expected_*` taxonomy, bi-directional orphan detection, report-before-failure strict CI gate, fail-open one-line freshness reminder.
- Mode-map curation + signal patterns (Phase 29): schema-v3 mode-map with 18 lifecycle/design skill routes, output-type-anchored contains patterns (1–6/entry), canonical collision lint with explicit groups, shared v2/v3 normalizer, and thresholds re-derived to 0.591/0.291/0.191 from an expanded 58-record calibration set.

### What Worked

- Requirement-first sequencing paid off: safety rails (27) before mutation, audit (28) before curation, curation+patterns (29) coupled — each phase's success criteria fed the next phase's planning directly.
- Mutation work stayed fully off the hot path — all v1.4 changes landed in the builder + curated mode-map overlay, keeping `router.mjs` semantically unchanged and 1188/1188 tests green.
- The portable manifest-agnostic synthetic fixture made curation testable without depending on the live gsd inventory.
- Nyquist validation ran with the phases this time — all three VALIDATION.md files ended `nyquist_compliant: true`, avoiding the stale-metadata tech-debt that had flagged the v1.4 audit as `tech_debt` on the first pass.

### What Was Inefficient

- First audit pass flagged `tech_debt` because VALIDATION.md metadata lagged final execution evidence; a follow-up reconciliation of the three validation files was needed before the audit could be classified `passed` — validation metadata should be reconciled at phase verification time, not audit time.
- Live-install lifecycle suite still fails readiness under the real-home environment (10/21) — pre-existing from Phase 26, tracked as deferred but not fixed in v1.4.
- T_high leave-one-out sensitivity spans 0.301–0.591 — the tuple is safe but the margin is wide; a larger calibration corpus would tighten it.

### Patterns Established

- Safety rail → audit → curation is a reusable sequencing pattern for future mutation work: gate the mutation surface first, make coverage visible, then mutate.
- A committed hook snapshot (`tests/router.mjs.snapshot`) byte-identical to the installed hook is a strong reproducibility anchor for cross-phase integration checks.
- Explicit reverse-gap baselines (210 `expected_bm25_only` records) make "intentional unmapped" auditable instead of invisible — but require deterministic maintenance as inventory changes.

### Key Lessons

- Validation metadata that lags execution evidence becomes tech-debt noise at audit time — reconcile at phase verification, not at milestone close.
- Calibration tuples are only as trustworthy as the corpus they were derived from; document sensitivity spans so future maintainers know how much margin a re-run might shift.
- Explicit baselines convert subjective "is this gap intentional?" into an auditable diff — worth the maintenance cost.

### Tech Debt Carried Forward

- Reverse-gap baseline maintenance (210 records) as inventory changes — v1.4+.
- T_high sensitivity re-run when corpus grows — v1.4+.
- BLOCKER 2: live-install release verification (REL-05/06/07) — v1.3.1.
- Orphaned temp-dir watchers, router.safety-release live-env failures, watcher-reconcile activation confirmation — v1.3.1.
- v2 per-prompt source descriptors (Phase 19) — still carried.

### Next Milestone

v1.3.1/v1.5 — release-gate hardening (deferred items above) + maintenance risks from v1.4. Run `/gsd-new-milestone`.

## v1.5 — Framework-Neutral Adaptive Routing

**Shipped:** 2026-08-02  
**Phases:** 9 (30–36, 32.1, 37.1) | **Plans:** 27 | **Tasks:** 21

### What Was Built

- Content-addressed manifest epochs, watcher noise narrowing, runtime-tagged telemetry, and Claude/Codex parity.
- Framework-neutral resolve lists with guard-hole closure, strict tie-lint, per-project routing, shadow outcomes, and per-install calibration.
- Live release-gate hardening: safe release-tuple preservation, installed production fixtures, lifecycle cleanup, one owned watcher, and verified release authority.

### What Worked

- Reconciliation against live `.planning` projections found and removed stale phase metadata before archival.
- Independent source and installed gates caught the deployed lifecycle cleanup gap; the fix was small and validated by the 31/31 coexistence matrix.
- Preserving a verified tuple when a candidate has no safe dispatch target maintained the safety boundary while still completing release verification.

### What Was Inefficient

- Repeated installer restarts exposed duplicate watcher processes, requiring exact-PID cleanup and a final process-count check.
- Focused phase suites were green while the full release runner still exposed an uninstall-directory leak; the aggregate gate should run earlier in future closeouts.
- Roadmap projections for inserted closure phases drifted from disk state and needed explicit checklist reconciliation.

### Patterns Established

- Treat `init.manager`, phase verification, audit evidence, and the installed release tuple as one closeout contract.
- Include every deployed test-helper parent directory in installer ownership manifests so uninstall can prune deepest-first.
- Keep recommendation-only candidates visible but non-dispatchable, and preserve known-good release authority rather than fabricating safety metadata.

### Key Lessons

- A passing focused suite is not sufficient for milestone completion; run the aggregate release runner and installed gates.
- Empty phase placeholders can invalidate dependency projections even when implementation is complete; remove them through canonical phase tooling.
- Safety-preserving activation can be the correct completed outcome when the candidate lacks trustworthy route targets.

### Tech Debt Carried Forward

- Telemetry epoch presentation and distributed lifecycle evidence remain maintenance items.
- FUT-05 through FUT-11 remain deferred to v2 as recorded in the requirements archive.

### Next Milestone

Define the next release with `/gsd-new-milestone`.

## v1.9 — Live Runtime Deployment & Observability Hardening

**Shipped:** 2026-08-09
**Phases:** 4 (56–59) | **Plans:** 6 | **Tests:** 1,656/1,656 serial

### What Was Built

- Owned live Claude/Codex upgrade, preservation, restart, recovery, and uninstall evidence with privacy-safe snapshots.
- Truthful native health and bounded watcher fallback, including isolated Claude/Codex invocation receipts.
- A route-anchored, off-hot-path observability report that correlates bounded outcomes and classifies graph-missing records without raw prompts.
- Production acceptance evidence, archive invariant verification, safe-empty release preflight, and final tag gates.

### What Worked

- Native evidence was separated from fixture-only evidence, so both runtimes have explicit identity, completion, verification, and receipt proof.
- The controller preserved an empty active authority when the live inventory had zero dispatchable routes instead of fabricating an executable tuple.
- Parse-clean telemetry, audit, shadow, receipt, and health artifacts made the remaining evidence gaps measurable rather than implicit.

### What Was Inefficient

- The first full-suite capture was transiently inconsistent; a second serial corpus run established the authoritative 1,656/1,656 result.
- The delegated integration checker stalled after bounded waits, so the final cross-phase review was completed inline from source, tests, planning artifacts, and live evidence.
- The archive verifier assumed the older `.planning/archive` layout and needed a small compatibility fix for the current `.planning/milestones` layout.

### Tech Debt Carried Forward

- Historical telemetry still has null outcome/downstream fields because old records are not rewritten.
- Graph-missing remediation remains open for 848 Claude and 4 Codex records.
- Current live receipts have zero telemetry links; owner-authorized dispatch against a dispatchable live inventory is still needed for continuous end-to-end linkage.
- Resource-exhaustion fallback still rescans all roots; measure before introducing per-root polling.

### Next Milestone

Not defined. Start with `/gsd-new-milestone` after choosing whether the next increment prioritizes live dispatch linkage, graph remediation, or fallback-scan performance.
