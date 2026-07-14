---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Inspectable Routing Control Layer
current_phase: 10
status: Awaiting next milestone
stopped_at: Completed 10-03-PLAN.md
last_updated: "2026-07-14T13:19:45.257Z"
last_activity: 2026-07-14
last_activity_desc: Milestone v1.1 completed and archived
progress:
  total_phases: 6
  completed_phases: 6
  total_plans: 23
  completed_plans: 23
  percent: 100
current_phase_name: Safety, Coexistence, and Release Gates
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

Phase: Milestone v1.1 complete
Plan: —
Status: Awaiting next milestone
Last activity: 2026-07-14 — Milestone v1.1 completed and archived

## Performance Metrics

- **Phases complete:** 6 / 6
- **Requirements satisfied:** 42 / 42 (v1.1)
- **Plans executed:** 23 / 23 across Phases 5–10

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
- **Phase 06: inspect/preview/explain-last share the production dry-run route helper** so operator diagnostics show normalized prompt, candidates, score debug, guards, cache, graphify status, final context, and pass-through reason without mutating preview state.
- **Phase 06: explain-last remains hash-only** — it reconstructs the latest telemetry decision from prompt signatures and route/cache/guard metadata, never raw prompt text.
- **Plan 06-05: calibration now routes through the shared inspectDecision helper via a narrow adapter** while preserving the legacy calibration output shape; final calibration is 23/27 with threshold 21.
- **Phase 07: health utilities are operator-only and stay off the prompt hot path** — route coverage, target diagnostics, file health, telemetry status, weights/evolution status, and next-fix recommendations are exposed through CLI helpers, not `UserPromptSubmit` routing.
- **Phase 07: telemetry health is metadata-only** — doctor reports parse/status/signature/route metadata and privacy notes, never raw prompts or raw telemetry lines.
- **Phase 07: missing-MCP and blocked agents remain diagnostic-only** — routes/unmapped/coverage/doctor can report and recommend fixes, but blocked missing-MCP agents are not dispatch targets.
- **Plan 10-01: safety release matrix uses focused node:test contracts** — SAF-01 fail-open, SAF-02 warm/evolved latency, SAF-03 no external classifier, and SAF-06 operator-boundary checks are consolidated in `tests/router.safety-release.test.mjs` while reusing the live hook subprocess pattern.
- **4 phases, sequential** derived from requirements (traceability table + idea doc). Phase 1 is load-bearing and large but coherent — one closed loop; not safely splittable. Internal 7-step sub-sequencing captured as a phase note, NOT as separable shippable phases.
- **Hook-contract correction (load-bearing):** `UserPromptSubmit` can ONLY append `additionalContext` (model-read). Harness does NOT auto-run appended slashes. The MODEL executes every channel. "High-confidence auto-invoke" = a strong model instruction, not harness execution. Reflected in all phase goals + success criteria.
- **Phase 3 is usage-gated**, not Phase-2-gated: sequence after a ~2-week telemetry window, not strictly after Phase 2.
- **Phase 4 is parallelizable** with Phases 2/3 — depends only on Phase 1's mode-map existing.
- **Quantitative gates baked into success criteria:** <100ms warm latency, ≤500 tokens injected, ≥8/10 calibration right-picks (Phase 1); measurably fewer mis-routes than Phase 1 (Phase 2); routing accuracy + cache hit rate rising over 2 weeks with no manual map edits (Phase 3); ≥1 existing primitive reused (Phase 4).
- **commit_docs = false** — do NOT git commit ROADMAP/STATE/REQUIREMENTS. Just write the files.
- **Throwaway build dir:** `~/Desktop/ClaudeCode/router-build` holds `.planning/` only. Deliverables install to `~/.claude/hooks/router.mjs` + `~/.claude/router/` + `~/.claude/settings.json` binding.
- [Phase 10]: Plan 10-02: doctor resolves its deployed hook path with fileURLToPath(import.meta.url), while live routing smoke tests force the existing freshness seam for deterministic coexistence coverage. — Keep the production fix diagnostic-only and avoid changing routing or settings registration.
- [Phase 10]: Release evidence is executable: SAF-01 through SAF-08 map to focused tests and exact final commands. — Keep the release artifact mechanically tied to the verified command surface.
- [Phase 10]: Calibration release status remains subset-specific: original 10/10 and codebase at least 5/7 must pass independently. — Prevent aggregate passing from hiding core or codebase regressions.

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

**Last session:** 2026-07-14T10:32:32.547Z
**Stopped at:** Completed 10-03-PLAN.md
**Resume file:** None

- **Last action:** Completed and independently verified Phase 10; all three plans and SAF-01 through SAF-08 passed.
- **Next action:** Initialize v1.2 Autonomous Dual-Runtime Control Plane at Phase 11.
- **Open questions carried forward:** Calibration fixture 17 remains a non-blocking threshold-margin miss; automatic registry reconciliation and workflow-state recovery move to v1.2.

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
| Phase 10 P01 | ~20min | 2 tasks | 1 file |
| Phase 10 P02 | 12min | 2 tasks | 3 files |
| Phase 10 P03 | 16m | 2 tasks | 3 files |

## Operator Next Steps

- Initialize v1.2 and begin Phase 11: Canonical Registry and Runtime Adapters.
