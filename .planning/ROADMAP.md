# Roadmap: Claude Router

## Milestones

- ✅ **[v1.0 Claude Router MVP](milestones/v1.0-ROADMAP.md)** — Phases 1-4 (shipped 2026-07-09)
- ✅ **[v1.1 Inspectable Routing Control Layer](milestones/v1.1-ROADMAP.md)** — Phases 5-10 (shipped 2026-07-14)
- ✅ **[v1.2 Autonomous Dual-Runtime Control Plane](milestones/v1.2-ROADMAP.md)** — Phases 11-20 (shipped 2026-07-23)
- ✅ **[v1.3 Adaptive Local Capability Steward and Intent-Native Routing](milestones/v1.3-ROADMAP.md)** — Phases 21-26 (shipped 2026-07-28, ship_with_deferred — v1.3.1 release-gate hardening open)
- ✅ **v1.4 Coverage Completeness & Auto-Skill Routing Improvement** — Phases 27-29 (shipped 2026-07-31)
- 🚧 **v1.5 Framework-Neutral Adaptive Routing** — Phases 30-36 (in progress)

## Overview

Claude Router is an always-on, self-evolving orchestration layer. v1.5 (Phases 30-36) layers framework-neutral adaptive routing on the shipped v1.4 base: the router maps prompt intent to a capability role and resolves to the first locally-present candidate from a ranked, framework-neutral list — never a hardcoded framework name (GSD, superpowers, Gstack, or fully custom). It closes the `schema_version` guard hole where dead `gsd-*` slash suggestions leaked on installs without GSD. Cache and calibration key off a content-sha256 manifest fingerprint (replacing mtime), a shadow-log observer captures three-state suggestion→invocation outcomes, per-install thresholds derive from ≥50 real accepted routes blended toward global defaults, and every telemetry/cache record carries a runtime tag so Claude and Codex never share stale routes. All mutation work stays off the hot path; fail-open, warm p95 <40ms / max <100ms, stdlib-only, no-API-call constraints unchanged.

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-4) — SHIPPED 2026-07-09</summary>

- [x] Phase 1-4: Foundation router hook, mode-map, telemetry, evolution — see [v1.0-ROADMAP](milestones/v1.0-ROADMAP.md)

</details>

<details>
<summary>✅ v1.1 Inspectable Routing Control Layer (Phases 5-10) — SHIPPED 2026-07-14</summary>

- [x] Phases 5-10: Inspect/preview/explain, health/coverage diagnostics, codebase calibration, privacy-preserving evolution proposals, release gates — see [v1.1-ROADMAP](milestones/v1.1-ROADMAP.md)

</details>

<details>
<summary>✅ v1.2 Autonomous Dual-Runtime Control Plane (Phases 11-20) — SHIPPED 2026-07-23</summary>

- [x] Phase 11: Canonical Registry and Runtime Adapters (6 plans) — completed 2026-07-14
- [x] Phase 12: Incremental Change Detection and Watcher (4 plans) — completed 2026-07-15
- [x] Phase 13: Target Safety, Hook Reconciliation, and Quarantine (3 plans) — completed 2026-07-15
- [x] Phase 14: Deterministic Mapping, Activation, and Rollback (7 plans) — completed 2026-07-16
- [x] Phase 15: Context Capsules and Workflow-State Recovery (3 plans) — completed 2026-07-16
- [x] Phase 16: Workflow-First Orchestration and Context Budgets (4 plans) — completed 2026-07-16
- [x] Phase 17: Compiled Prompt Routing and Safe Evolution (5 plans) — completed 2026-07-16
- [x] Phase 18: Autonomous Lifecycle and Release Gates (5 plans) — completed 2026-07-17
- [x] Phase 19: Close gap TOK-02 + ORC-01 — wire orchestrator into publish-index + prompt-route live path (4 plans) — completed 2026-07-22
- [x] Phase 20: Close gap EVO-05 — add production trigger for canary-controller (5 plans) — completed 2026-07-22

Full phase details, decisions, and tech debt: [v1.2-ROADMAP](milestones/v1.2-ROADMAP.md) · [v1.2-MILESTONE-AUDIT](milestones/v1.2-MILESTONE-AUDIT.md)

</details>

<details>
<summary>✅ v1.3 Adaptive Local Capability Steward and Intent-Native Routing (Phases 21-26) — SHIPPED 2026-07-28</summary>

- [x] Phase 21: Authoritative Personalized Inventory (6 plans) — completed 2026-07-26
- [x] Phase 22: Conservative Contracts and Relationship Graph (6 plans) — completed 2026-07-27
- [x] Phase 23: Intent-Safe State-Aware Execution (3 plans) — completed 2026-07-27
- [x] Phase 24: Privacy-Safe Outcomes and Capability Health (4 plans) — completed 2026-07-28
- [x] Phase 25: Advisory Stewardship and Guarded Drafts (4 plans) — completed 2026-07-28
- [x] Phase 26: Coherent Publication and Dual-Runtime Release (8 plans) — completed 2026-07-28

Full phase details, decisions, and tech debt: [v1.3-ROADMAP](milestones/v1.3-ROADMAP.md) · [v1.3-MILESTONE-AUDIT](milestones/v1.3-MILESTONE-AUDIT.md)

Ship verdict: `ship_with_deferred` — 27/27 phase success criteria met; BLOCKER 2 (live-install release verification) + orphaned temp-dir watchers + router.safety-release live-env failures deferred to v1.3.1 (see STATE.md Deferred Items).

</details>

<details>
<summary>✅ v1.4 Coverage Completeness & Auto-Skill Routing Improvement (Phases 27-29) — SHIPPED 2026-07-31</summary>

- [x] Phase 27: Mutation Safety Infrastructure (2 plans) — completed 2026-07-29
- [x] Phase 28: Coverage Audit-Guard (2 plans) — completed 2026-07-29
- [x] Phase 29: Mode-Map Curation and Signal Patterns Expansion (4 plans) — completed 2026-07-29

Full phase details, decisions, and tech debt: [v1.4-ROADMAP](milestones/v1.4-ROADMAP.md) · [v1.4-MILESTONE-AUDIT](milestones/v1.4-MILESTONE-AUDIT.md)

</details>

### 🚧 v1.5 Framework-Neutral Adaptive Routing (Phases 30-35) — IN PROGRESS

**Milestone Goal:** The router chooses the right locally-available capability by intent, not hardcoded framework names; calibrates per install instead of globally; stays consistent across Claude and Codex; and reacts correctly when the inventory changes. Guard-hole closure precedes resolve-list shipping; calibration is last among feature phases.

- [ ] **Phase 30: Foundation — Manifest Fingerprint + Watcher Narrowing** - Content-sha256 fingerprint epoch replaces mtime; watcher ignores noise; lifecycle documented
- [ ] **Phase 31: Runtime Tagging** - Deterministic runtime detection; runtime-tagged telemetry + cache keys
- [ ] **Phase 32: Intent-First Routing** - Mode-map schema v4 resolve lists; guard-hole closure; suppression + next-best fallback; per-runtime resolve
- [ ] **Phase 33: Shadow-Log Observer** - Three-state outcome capture (accepted / rejected / no_signal) for suggestion→invocation
- [ ] **Phase 34: Per-Install Auto-Calibration** - Bayesian per-install thresholds from ≥50 accepted routes, epoch-gated
- [ ] **Phase 35: Per-Project Routing** - Derive project roots from ~/.claude.json; flip GRD-02 to cwd-prefix include; project content folds into fingerprint
- [ ] **Phase 36: Release-Gate Cleanup** - Live-install release verification; cold-start defaults; orphaned daemon cleanup; v1.4 debt slots

## Phase Details

### Phase 30: Foundation — Manifest Fingerprint + Watcher Narrowing

**Goal**: Every semantic inventory change bumps a content-addressed fingerprint epoch that cache and calibration key off, and the watcher stops reconciling on noise — the invalidation spine every v1.5 feature leans on, with no hot-path semantic change.
**Depends on**: Phase 29
**Requirements**: INVC-01, INVC-02, INVC-03, INVC-04, INVC-05
**Success Criteria** (what must be TRUE):

  1. `build-manifest.mjs` emits a content-sha256 `manifest_fingerprint` over semantic routing inputs only (timestamps excluded); an identical rebuild produces an identical fingerprint and does NOT invalidate the cache.
  2. Adding, updating, or removing any skill, plugin, or agent bumps the fingerprint, and a previously-cached route is recomputed on the next prompt rather than served stale — the cache key folds the fingerprint, replacing mtime.
  3. Watcher scans ignore noise files (sqlite/WAL, plugin-catalog caches) and `installed_plugins.json` is the authoritative plugin add/remove signal — plugin add/remove changes the fingerprint, plugin-only churn never dirties roots.
  4. Calibration data is epoch-keyed by the fingerprint: a fingerprint mismatch means mode-map default thresholds (0.591/0.291/0.191) win, never stale per-install thresholds.
  5. The full add/update/remove capability lifecycle (watcher → rebuild → coverage audit → recompute → re-calibrate) is documented and test-verified end-to-end.

**Plans**: TBD

*Code-verified: NOT a new fingerprint build. `src/registry/fingerprint.mjs` already ships a Merkle content-sha256 tree (`buildSubtreeHashes`) and is the live watcher diff source. Work = extend it + bridge to cacheKey. Composite-epoch decision (resolves the research flag): ONE global fingerprint hash over (capability identities + `installed_plugins.json` hash + mode-map + weights), timestamps excluded — cache is a small LRU map, whole-cache recompute on inventory change is acceptable. cacheKey replaces the 7-position mtime fold (`[np, ik, modeMapMtime, manifestMtime, graphMtime, surfaceMtime, weightsMtime]`, router.mjs:1648) with a single `manifest_fingerprint` epoch slot; translate SAF-01 mtime-invalidation tests 1:1 to epoch. `installed_plugins.json` already parsed (build-manifest.mjs:268-280) — it IS the authoritative signal; the gap is only the watcher noise ignore-list.*

### Phase 31: Runtime Tagging

**Goal**: The router knows which runtime it runs in and tags every telemetry/cache record with it, so shadow-log correlation and per-install calibration never mix runtimes — fixing the hardcoded `RUNTIME_CONFIG_DIR` gap.
**Depends on**: Phase 30
**Requirements**: PARITY-01, PARITY-02
**Success Criteria** (what must be TRUE):

  1. The router detects its active runtime (Claude vs Codex) deterministically from `process.argv[1]` with a `~/.codex/router/installed.json` marker fallback — zero IO on the hot path; the hardcoded `RUNTIME_CONFIG_DIR` is gone.
  2. Every telemetry and cache record carries a `runtime` tag; a route cached under one runtime is never served to the other (no cross-runtime cache reuse).
  3. A single telemetry stream shows rows from both Claude and Codex sessions, each with its correct runtime tag and no duplicate writers; the `runtime`/`epoch` fields land via a deliberate `OUTCOME_FIELDS` policy-version bump, never a silent schema add.

**Plans**: TBD

*Code-verified: remove hardcoded `RUNTIME_CONFIG_DIR = join(homedir(), '.claude')` (router.mjs:100); reuse `process.argv[1]` (currently only in the `isMain()` guard, router.mjs:57). `~/.codex/router/installed.json` marker already exists — fallback is present, never read. cacheKey has NO runtime partition today → a Codex session can be served a Claude-derived route; cache key folds a runtime tag. `OUTCOME_FIELDS` frozen at 14 fields (src/health/outcome-schema.mjs:33-38, enforced by tests/router.health.outcome-schema.test.mjs:68-71) — the policy-version bump to add `runtime` MUST update that test explicitly.*

### Phase 32: Intent-First Routing (mode-map schema v4 + guard-hole closure)

**Goal**: The router maps intent to a capability role and resolves to the first locally-present candidate from a ranked, framework-neutral list — never a hardcoded framework name — with the `schema_version` guard hole closed so no slash suggestion ships unless it can resolve.
**Depends on**: Phase 31 (and transitively Phase 30)
**Requirements**: ROUTE-01, ROUTE-02, ROUTE-03, ROUTE-04, ROUTE-05, PARITY-03, PARITY-04
**Success Criteria** (what must be TRUE):

  1. A fixture manifest with no `gsd-*` commands produces ZERO `gsd-*` slash suggestions — the `schema_version` guard hole is closed; a slash route is emitted only when its mode resolves to a manifest-present command OR an explicit resolve-list member is present.
  2. When the top-ranked candidate is absent from the current manifest, the router suppresses it and falls back to the next-best locally-present entry; when zero entries resolve, routing is silent (low tier) — never a dead injection.
  3. A high-confidence intent with an empty resolve set emits at most one generic fallback line to native capabilities — never a fabricated capability name.
  4. The same intent resolves to the first locally-present candidate by capability role — a GSD fixture resolves to a `gsd-*` command, a superpowers/Gstack/custom fixture to its local equivalent; resolve evaluation uses only the active runtime's present capabilities, only the active runtime's suggestion is injected, and a capability present in one runtime resolves to its local equivalent in the other (cross-runtime fixture).
  5. Resolve lists pass a tie-lint CI gate (near-tie downgrades to `med`, stale-target quarantine) and are covered by the coverage audit-guard's forward-orphan check; warm p95 stays <40ms / max <100ms with the new resolve-first hot path.

**Plans**: TBD
**Research flag**: Consider `/gsd-plan-phase --research-phase 32` — the resolve-list schema and tie-handling are the phase's design deliverable: per-runtime resolve ordering, the exact near-tie/confidence-gap rule (when to downgrade to `med`), and whether the coverage audit-guard's forward-orphan check semantics cleanly extend to resolve lists.

*Code-verified: the guard hole lives in THREE sites, not one — `intentionalSchemaRoute = mode && mode === id && modeMap?.schema_version` at router.mjs:721 AND router.mjs:806, plus `schemaRoute = mode && mode === route && Boolean(modeMap.schema_version)` at src/coverage/audit.mjs:142. Closure must land in the coverage audit-guard too. Add a schema_version-SET fixture test first — the hole is untested (existing fixture omits schema_version), so a RED test locks the closure. `src/context/resolve.mjs` is a red herring (workflow-state capsules, not capability resolve) — ROUTE-01/03/04/05 are all-greenfield.*

### Phase 33: Shadow-Log Observer

**Goal**: The router captures, per install and privacy-safely, whether a suggestion was actually invoked — a three-state outcome signal that later calibration consumes — shipping measure-only before any threshold derivation.
**Depends on**: Phase 32 (resolved suggestion records to correlate; runtime tag via Phase 31)
**Requirements**: CALIB-01, CALIB-02, CALIB-05
**Success Criteria** (what must be TRUE):

  1. For each suggestion, the observer records a three-state outcome (`accepted` / `rejected` / `no_signal`) correlating the suggestion with the actually-invoked capability via hashed signature — no raw prompt text and no user commands are persisted.
  2. Suggestion rows served from cache are tagged and excluded from calibration evidence — only fresh routed suggestions contribute outcomes.
  3. The observer runs as an additive parallel hook; ralph-loop and gsd hooks keep firing unchanged (coexistence test-verified).
  4. A measure-only divergence report (accepted vs rejected vs no_signal counts per suggested mode/skill) is producible from captured outcomes before any threshold is derived — calibration stays disabled by default until the schema is proven.

**Plans**: TBD
**Research flag**: Consider `/gsd-plan-phase --research-phase 33` — PostToolUse slash-command visibility: can the observer see slash-command invocations, or only `Skill|Agent|Task` tool calls? If slash commands are invisible, a router-owned Stop-hook transcript scan is the deferred fallback; needs a coexistence review before committing the capture design.

*Code-verified: design against the DEPLOYED pipeline — watcher-side telemetry ingest (`ingestTelemetryEvidence`, src/registry/watcher.mjs:81) is live; `src/health/observe.mjs` (9-kind outcome derivation) is repo-only and NOT in the deploy bundle (src/lifecycle/router-lifecycle.mjs:354-378 bundles telemetry-bridge/outcome-schema/fingerprint, observe absent). The shadow-log correlator must join the bundle or live in the new observer hook file; reuse the bundled outcome-schema.mjs frozen `outcome_kind` vocabulary. No router-owned PostToolUse hook exists today (existing binding is gsd-context-monitor.js) — new binding + coexistence test required. Commit a `graphify-out/` fixture — graphify integration tests are currently env-gated `t.skip`.*

### Phase 34: Per-Install Auto-Calibration

**Goal**: Each install derives its own routing thresholds from ≥50 real accepted routes, blended toward the global defaults so small samples can't overfit — calibration is deliberately last among feature phases because it consumes the epoch, the runtime split, the resolved names, and the shadow-log outcomes.
**Depends on**: Phase 33 (and transitively Phases 30-32)
**Requirements**: CALIB-03, CALIB-04
**Success Criteria** (what must be TRUE):

  1. After ≥50 real accepted routes accumulate, per-install `T_high` / `T_low` / `M` thresholds derive from the three-state outcome evidence via a Bayesian blend toward the global defaults (0.591/0.291/0.191 prior) — never raw observed proportions — and the derivation is reproducible on the calibration corpus.
  2. Derived thresholds live in a separate epoch-gated file keyed by `{manifest_fingerprint, mode_map_version, corpus_hash}` and never mutate the curated mode-map; on fingerprint mismatch the mode-map default thresholds win.
  3. Small-sample evidence (e.g. 2/2 accepted on a rare intent) cannot produce a large threshold swing — min-sample floor, hysteresis ≤0.05, clamp, and 70/30 damping hold; an overfit regression test proves per-install data cannot crush global coverage.
  4. Adding or removing a skill or plugin triggers re-calibration and cached routes recompute — the fingerprint-epoch adaptive loop closes end-to-end.
  5. Threshold changes ride the existing canary/rollback rails — a bad calibration can be rolled back to the mode-map defaults and routing stays correct.

**Plans**: TBD
**Research flag**: Consider `/gsd-plan-phase --research-phase 34` — the exact threshold mapping formula: Wilson lower bound vs Beta/Jeffreys posterior mean; prior strength (α,β) encoding the shipped defaults; how a per-install acceptance rate maps to concrete `T_high`/`T_low`/`M` shifts. Research gives bounds, not a closed form.

*Code-verified: existing `MINIMUM_SAMPLES = 30` (src/evolution/evidence.mjs:24) is the generic evidence floor — the phase defines a dedicated `CALIB_MIN_ACCEPTED = 50` and reconciles with the floor (no silent conflict). Existing derivation is offline grid-search (`enumerateThresholdCandidates`, router.calibrate.mjs:176-189) — the Bayesian blend toward global defaults is ALL-NEW.*

### Phase 35: Per-Project Routing

**Goal**: Project-scoped `.claude/skills` become routable when the active cwd is under the owning project root — machinery already ships inert, so the phase flips the two gates that keep it disabled, with the fingerprint folding project content automatically. Zero install, fail-open preserved.
**Depends on**: Phase 32 (routing seam) · Phase 30 (fingerprint folds project content)
**Requirements**: PROJ-01, PROJ-02, PROJ-03
**Success Criteria** (what must be TRUE):

  1. The builder derives project roots from `~/.claude.json` `projects` keys and emits live project-scoped skill entries in the manifest — discovery is no longer env-gated to zero entries.
  2. GRD-02 flips from hard-exclude (`scope === 'project'` continue, router.mjs:1499/1507) to cwd-prefix include — a project skill is suggested iff the active cwd is under its project root; pure string compare, no FS, sub-µs; fail-open on any parse error.
  3. Adding/removing a project root or editing its `.claude/skills` bumps the manifest fingerprint and cached routes recompute; a project-scoped skill is never injected outside its project root.

**Plans**: TBD

### Phase 36: Release-Gate Cleanup

**Goal**: v1.5 ships on trusted ground — the assembled system passes live-install release verification on a fresh real home, cold-start defaults work on a fresh account, the standing watcher/maintenance debt is resolved, and unmapped v1.4 debt is slotted in.
**Depends on**: Phase 35
**Requirements**: REL-08, REL-09, REL-10 (+ debt: reverse-gap baseline, T_high sensitivity re-run, activation confirmation)
**Success Criteria** (what must be TRUE):

  1. The release gate runs the assembled v1.5 router against a fresh real home in an isolated environment — REL-05/06/07 proven by live execution, not simulated. Exact blocker cited: "Live-install lifecycle suite still fails readiness under the real-home environment (10/21)" (RETROSPECTIVE.md:163).
  2. A fresh-account install with no calibration data routes correctly with cold-start defaults (mode-map thresholds, fail-open, no stale-state assumptions) — REL-09 proven.
  3. No orphaned daemon-process watcher instances remain after install/upgrade/reinstall teardown — REL-10 targets daemon orphans, distinct from the existing per-reconcile temp-ownedRoot cleanup (`candidateCtx?.cleanup?.()`, watcher.mjs:805-810); `router.safety-release` live-env failures resolved.
  4. The existing 1188-test baseline stays green alongside the new v1.5 tests — no regression from the assembled milestone.
  5. v1.4 debt slotted in: reverse-gap baseline maintenance (210 records), T_high sensitivity re-run when the calibration corpus grows, and operator-shell activation confirmation for watcher-reconcile (v1.3 deferred item).

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 27 → 28 → 29 (v1.4), then 30 → 31 → 32 → 33 → 34 → 35 → 36 (v1.5)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 27. Mutation Safety Infrastructure | v1.4 | 2/2 | Complete    | 2026-07-29 |
| 28. Coverage Audit-Guard | v1.4 | 2/2 | Complete    | 2026-07-29 |
| 29. Mode-Map Curation and Signal Patterns Expansion | v1.4 | 4/4 | Complete    | 2026-07-29 |
| 30. Manifest Fingerprint + Watcher Narrowing | v1.5 | 0/0 | Not started | - |
| 31. Runtime Tagging | v1.5 | 0/0 | Not started | - |
| 32. Intent-First Routing | v1.5 | 0/0 | Not started | - |
| 33. Shadow-Log Observer | v1.5 | 0/0 | Not started | - |
| 34. Per-Install Auto-Calibration | v1.5 | 0/0 | Not started | - |
| 35. Per-Project Routing | v1.5 | 0/0 | Not started | - |
| 36. Release-Gate Cleanup | v1.5 | 0/0 | Not started | - |

## Deferred / Out of Scope (v1.4)

- **Evolution weight tuning (FUT-05, FUT-06, FUT-07):** Deferred — highest research flag (SIGIR: up to 80% metric loss from weak-signal PRF); ship-disabled-by-default yields no near-term value; `signal_patterns` expansion is the safer primary lever. See REQUIREMENTS.md Future Requirements.
- **Confidence-tier recalibration, multi-intent triggers, boundary-aware substring matching (FUT-08, FUT-09):** v2 — high complexity / thrash risk, needs telemetry that does not exist yet.
- **Hot-path schema change or new dependency:** v1.4 is stdlib-only, off-hot-path mutation; hot path stays semantically unchanged.

## Deferred / Out of Scope (v1.5)

- **Evolution weight tuning (FUT-05, FUT-07):** v2 — full Wilson + decay tuning and telemetry-driven signal_patterns proposals need n≥200 strong outcomes. v1.5 ships only the shadow-log capture (FUT-06 capture half); tuning rails stay deferred.
- **Advanced routing (FUT-08 isotonic/Platt recalibration, FUT-09 multi-intent/clarification, FUT-10 per-entry calibration):** v2 — each needs ≥200 samples or high thrash risk; v1.5 ships per-install threshold calibration at n≥50.
- **In-turn invocation tap (FUT-11):** v2 — router-owned direct capture beyond shadow-log inference, only if the coexistence review passes.
- **User-facing commands (`/router why`, `/router fix`):** dropped by explicit milestone decision — the current milestone ships no new user-facing CLI surface.
- **Codex manifest completeness (full `~/.codex` walk):** `.codex` not in use — parity ships runtime-tagged shared telemetry + per-runtime presence via the canonical registry's runtime variants instead of a full `.codex` scan.
- **Per-prompt LLM classifiers, unbounded autonomous mutation, automatic installation, auto-dispatch without approval gate:** unchanged global out-of-scope — latency/privacy/safety constraints hold.
