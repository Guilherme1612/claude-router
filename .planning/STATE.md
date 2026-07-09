---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Inspectable Routing Control Layer
current_phase: 06
current_phase_name: inspect-and-preview-commands
status: executing
stopped_at: Completed 05-04-PLAN.md
last_updated: "2026-07-09T20:05:00Z"
last_activity: 2026-07-09
last_activity_desc: Phase 05 execution started
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 4
  completed_plans: 4
  percent: 100
---

# STATE: Claude Router

## Project Reference

- **Project:** Claude Router — global `~/.claude` always-on prompt-routing framework
- **Core Value:** Every user prompt routed to the right workflow mode + skills + agents automatically, in <100ms with no external API call — so rework from mis-routed tasks drops without a per-prompt LLM tax.
- **Roadmap:** `.planning/ROADMAP.md`
- **Requirements:** `.planning/REQUIREMENTS.md`
- **Research:** `.planning/research/SUMMARY.md`
- **Config:** `.planning/config.json` (granularity=standard, mode=yolo, parallelization=false, commit_docs=false, phase_naming=sequential)

## Current Position

Phase: 06 (inspect-and-preview-commands) — READY
Plan: 1 of ?
Status: Phase 05 complete; ready to plan/execute Phase 06
Last activity: 2026-07-09 — Completed plan 05-04 calibration fixtures and regression gates

## Performance Metrics

- **Phases complete:** 0 / 6
- **Requirements satisfied:** 30 / 30 (v1) — HOOK-01..04, INJ-05, COX-01, MAN-01, MAN-02 (Plan 01-01) + RTE-01..07, GRF-01 (Plan 01-02) + INJ-01..04, INJ-06, GRD-01..05 (Plan 01-03) + TEL-01..03, VRF-01..02 (Plan 01-04)
- **Plans executed:** 9 (01-01, 01-02, 01-03, 01-04, 03-02, 05-01, 05-02, 05-03, 05-04) — Plan 05-04 added Phase 05 calibration fixtures and coverage gates; full suite 324/324 passing.

## Accumulated Context

### Decisions

- **Plan 01-01: isMain() guard required** — `router.mjs` top-level `readStdin()` hangs the test runner when imported as a module; wrapped entry point in `if (import.meta.url === pathToFileURL(process.argv[1]).href)` so it only runs when executed directly as a hook. Added `node:url` (still stdlib) to the import list.
- **Plan 01-01: checkFreshness takes optional path args** so freshness tests run against temp dirs without touching the real 208KB manifest mtime.
- **Plan 01-01: ROUTER_DEBUG_LATENCY=1 env seam** emits `__router_latency_ms=<n>` on stderr for the perf gate; silent in production. `ROUTER_TEST_FRESHNESS` forces a freshness verdict for deterministic subprocess tests.
- **Plan 01-01: TDD RED/GREEN collapsed into one in-repo commit per task** because the hook implementation lives outside the repo (`~/.claude/hooks/router.mjs`) and is deployed in place rather than git-tracked (throwaway-build-dir layout).
- **Plan 01-02: Tie rule (margin < M) takes precedence over T_high** — a high score not clearly separated from its runner-up is Low, not High. Safer to pass through than auto-inject a contested route (D-09).
- **Plan 01-02: agents_store scope "agents-store (not globally symlinked)" excluded from corpus** — conservative, avoids dead `Skill` invocations (only scope==="global" agents_store entries are matchable).
- **Plan 01-02: Phase 1 graphify status is always graph_missing when the heuristic fires** — no real query in Phase 1 (GRF-01 stub); "queried" status reserved for Phase 2 (GRF-02).
- **Plan 01-02: Cache stores only High-tier decisive routes** — Medium/Low are cheap to recompute and wrong-caching them is higher-cost (§8).
- **Plan 01-03: GRD-01 demote re-scores the flagged-only pool** (separate from the auto-pool) and demotes to warn iff the flagged top would have been High tier within the flagged set — conservative; surfaces a would-have-been-top MCP-missing agent as a warn injection instead of a silent miss. Hard-filter happens in `buildCorpus` BEFORE scoring (Plan 02's buildCorpus now updated).
- **Plan 01-03: GRD-03 verbatim rule** — `extractVerifiablePromise` returns a LITERAL captured substring of the prompt (regex group 1), never a paraphrase or composition. Each of the 11 patterns captures the exact phrase as the user typed it (D-15 / ralph-loop no-lying rule).
- **Plan 01-03: GRD-04 known-names whole-word match** with non-word-char boundaries on both sides so `gsd-debug` does NOT match inside `gsd-debugging-thing`. Known-names built from mode-map entries' mode (+ `/<mode>` slash form), id, recommended_skills, recommended_agents.
- **Plan 01-03: GRD-05 deny-path regex** requires a non-alphanumeric boundary on both sides of `.env`/`.secrets` so `.environment`/`.envoy` do NOT trigger; `settings.permissions.deny` entries matched as literal substrings with glob markers stripped. Deny wins precedence over GRD-01 demote (no signature logged either — Pitfall 8 belt-and-braces).
- **Plan 01-03: Token-cap warn-truncation fallback** uses a 2-token safety margin so a 2000-char warning still lands ≤500 tokens via the ~4-chars-per-token approximation.
- **Plan 01-03: formatInjection block layout** — `\n\n` prepend → open sentinel with mode/tier/sig metadata → `Reasoning: <one sentence>` → per-invoke_kind instruction line(s) → close sentinel. Low tier emits nothing (true pass-through, no sentinel). Medium tier has NO `Run /` instruction line (Pitfall 2 — a slash at Medium would auto-fire when the model reads it).
- **Plan 05-03: direct warn entries score as mode-map-owned corpus entries** because they deliberately have no dispatch target to associate with a manifest skill or agent. The route object copies `mmEntry.warning` in both the live hook and calibration dry-run so custom warning text reaches injection.
- **Plan 05-04: Phase 05 COV fixtures are required in calibration threshold** so every route coverage fixture must stay green while original 10/10, codebase, and evolution gates remain represented.
- **4 phases, sequential** derived from requirements (traceability table + idea doc). Phase 1 is load-bearing and large but coherent — one closed loop; not safely splittable. Internal 7-step sub-sequencing captured as a phase note, NOT as separable shippable phases.
- **Hook-contract correction (load-bearing):** `UserPromptSubmit` can ONLY append `additionalContext` (model-read). Harness does NOT auto-run appended slashes. The MODEL executes every channel. "High-confidence auto-invoke" = a strong model instruction, not harness execution. Reflected in all phase goals + success criteria.
- **Phase 3 is usage-gated**, not Phase-2-gated: sequence after a ~2-week telemetry window, not strictly after Phase 2.
- **Phase 4 is parallelizable** with Phases 2/3 — depends only on Phase 1's mode-map existing.
- **Quantitative gates baked into success criteria:** <100ms warm latency, ≤500 tokens injected, ≥8/10 calibration right-picks (Phase 1); measurably fewer mis-routes than Phase 1 (Phase 2); routing accuracy + cache hit rate rising over 2 weeks with no manual map edits (Phase 3); ≥1 existing primitive reused (Phase 4).
- **commit_docs = false** — do NOT git commit ROADMAP/STATE/REQUIREMENTS. Just write the files.
- **Throwaway build dir:** `~/Desktop/ClaudeCode/router-build` holds `.planning/` only. Deliverables install to `~/.claude/hooks/router.mjs` + `~/.claude/router/` + `~/.claude/settings.json` binding.

### Phase 1 internal sub-sequencing (the key roadmap input from research)

1. Hook skeleton + fail-open smoke test.
2. Explicit-override short-circuit + sentinel + caveman coexistence.
3. BM25 + mode-map + injection formatting (where the hook-contract correction bites hardest; `formatInjection(route)` with per-`invoke_kind` unit tests).
4. MCP guard + scope filter + ralph-loop two-gate.
5. Telemetry-privacy invariants (hash-only, `0600`, deny-rule respect, secret-pattern redaction before hashing).
6. 10-task calibration gate (≥8/10 right picks; tune `T_high`/`T_low`/`M` in `mode-map.json`).
7. `settings.json` append-only install with before/after diff audit — LAST action.

### TODOs

- [x] Plan Phase 5: Route Coverage Expansion.
- [x] Audit full inventory manifest against `mode-map.json` before adding coverage.
- [x] Add tests for direct `agent` and `warn` route entries.
- [x] Preserve v1.0 calibration and hot-path safety while expanding route coverage.

### Blockers

(None for v1.1 planning.)

## Session Continuity

**Last session:** 2026-07-09T20:05:00Z
**Stopped at:** Completed 05-04-PLAN.md
**Resume file:** .planning/ROADMAP.md

- **Last action:** Completed plan 05-04 with Phase 05 calibration fixtures, coverage regression tests, and full regression gates.
- **Next action:** Start Phase 06 inspect and preview commands.
- **Open questions carried forward:** exact route cluster boundaries after manifest audit; codebase calibration target threshold beyond "materially better than 2/5"; final command surface naming if scripts rather than a single `router` CLI are used.

---

*STATE initialized: 2026-07-07 during roadmap creation*

## Performance Metrics

| Phase | Plan | Duration | Notes |
|-------|------|----------|-------|
| Phase 01 P05 | 35min | 2 tasks | 1 files |
| Phase 03 P02 | ~45min | 3 tasks | 6 files (router.mjs + router.evolve.mjs + 4 test files) |
| Phase 05 P01 | ~15min | 2 tasks | 2 files |
| Phase 05 P03 | ~12min | 2 tasks | 3 files |
| Phase 05 P04 | ~35min | 3 tasks | 5 files |

## Operator Next Steps

- Start Phase 06: Inspect and Preview Commands.
