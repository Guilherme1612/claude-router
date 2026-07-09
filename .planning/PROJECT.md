# Claude Router — Always-On, Self-Evolving Orchestration Layer

## What This Is

A global, self-contained `~/.claude` framework that reads the local Claude inventory manifest, classifies each user prompt + goal, and automatically attaches the most efficient gsd workflow mode + skills + agents — then evolves over time to route faster, better, and cheaper. Active in every project; no per-project install. Built as a thin `UserPromptSubmit` hook layer that unifies existing dispatch primitives rather than a new orchestration engine.

## Core Value

Every user prompt gets routed to the right workflow mode + skills + agents automatically, in <100ms with no external API call — so the dominant cost (rework from mis-routed tasks) drops without paying a per-prompt LLM tax.

## Current State

**v1.0 shipped 2026-07-09.** Claude Router is installed as global personal infrastructure in `~/.claude`, with a pure-stdlib `UserPromptSubmit` hook, reviewed mode map, confidence-tiered injection, fail-open guards, graphify context, telemetry-driven evolution, and `gsd-surface` ancestor reuse. All 4 milestone phases are complete and verified.

## Next Milestone Goals

Define fresh requirements with `$gsd-new-milestone`. Likely follow-up areas are operator-facing route inspection, cache/telemetry hardening, additional calibration fixtures, and deeper integration with existing discovery primitives.

## Business Context

Personal global infrastructure for this one user's `~/.claude` setup — not a shipped product. Delete this section on first evolution pass; kept only to record the non-commercial framing.

## Requirements

### Validated

- ✓ Always-on `UserPromptSubmit` hook active on every prompt, coexisting with caveman — v1.0
- ✓ Weighted BM25 routing over the inventory manifest with reviewed `mode-map.json` — v1.0
- ✓ Confidence-tiered hybrid injection with corrected model-executes mechanic — v1.0
- ✓ ralph-loop routing guard for verifiable done-criteria only — v1.0
- ✓ MCP-backed agent guarding and project-scope filtering — v1.0
- ✓ Route cache, telemetry privacy, manifest freshness, deny-rule, and fail-open handling — v1.0
- ✓ Real conditional graphify query folded into routing and injection — v1.0
- ✓ Evolution loop with weights, outcome correlation, mutation proposals, and telemetry rotation — v1.0
- ✓ Ancestor reuse through `gsd-surface` profiles instead of duplicate discovery logic — v1.0

### Active

(Fresh next-milestone requirements will be created by `$gsd-new-milestone`.)

### Out of Scope

- No new autonomous execution loop — ralph-loop already provides the loop primitive; router routes to it, does not build one. — avoids duplicate loop engine.
- No replacing `gsd-autonomous`, `gsd-progress`, `gsd-explore`, `gsd-surface`, `find-skills`, or `claude-automation-recommender` — router unifies/drives them. — preserves working primitives.
- No selecting hooks mid-task — hooks are event-bound, not invokable. — wrong abstraction.
- No per-prompt LLM-judge — defeats the <100ms / no-API-call efficiency goal. — would make routing more expensive than the rework it avoids.
- No embedding/vector store — flat BM25 over ~186 manifest descriptions is sufficient for v1. — premature complexity.
- No product for others — personal tool for this user's setup, at least initially. — keeps scope tight.
- No `mode-map.json` pre-built here — drafting it is Phase 1 work, user-reviewed before live. — map must reflect real manifest, not guessed.
- No auto-rebuild of manifest inside the hook — hook stays <100ms, no blocking subprocess. — staleness handled by reminder, not rebuild.

## Context

**The setup being routed over (per `claude-inventory-manifest.json`):**
- 83 skills + 54 plugin skills + 9 agents-store skills + 2 project-scoped skills + 61 agents + 35 commands + 22 hooks + 5 MCP servers.
- 7 MCP servers referenced by agents but absent from scanned config (context7/exa/firecrawl/jina/perplexity/ref/tavily) → flagged `requires_mcp_not_in_manifest`, conservative ("not in manifest", not definitive "unwired").

**The real pain:** the user does not hold the full registry in head. Skills/agents activate via frontmatter `description` keyword matching — invisible to the user — so the wrong or no skill gets picked → worse output, more rework, more tokens, more bugs. Dominant cost is **rework from mis-routed tasks**, not the routing itself. `gsd-autonomous` exists but is hardwired to a phase/milestone model; the user mostly does **ad-hoc tasks, not formal phases**, so it does not fit day-to-day.

**Root cause:** (1) discovery failure — user doesn't know a fitting skill/agent exists; (2) routing failure — user picks the wrong one among those they do know. Both solved by making the registry queryable and present at decision time, automatically, every prompt.

**Reframe — not greenfield.** Existing dispatch/surface/discover primitives are all manual/on-demand, none auto-inject per prompt: `gsd-progress` (unified dispatcher), `gsd-explore` (Socratic ideation + routing), `gsd-surface` (toggle surfaced skills via profiles/clusters), `find-skills` (discover/install agent skills), `claude-automation-recommender` (recommend hooks/subagents/skills/plugins/MCP). The router is the **missing automatic per-prompt confidence-tiered selection + injection layer** that sits on top and drives them. Where a primitive already does a sub-job well (e.g. `gsd-surface` profiles), the router reuses it.

**Why this shape (efficiency):**
- No per-prompt LLM API call — routing is weighted BM25 over manifest descriptions in-process. Cost ≈ 200–500 injected tokens + <100ms, paid back many times over by avoided rework.
- The model is the judge, not a separate classifier — the hook injects candidates + a recommended mode; the main Claude session reads the augmented prompt and acts. No external service.
- Reuses existing assets — inventory manifest, `build_manifest.py`, graphify, gsd skill family, superpowers process skills, context-mode tools. Thin routing + evolution layer, not greenfield.

**How injection actually triggers execution (critical mechanic — CORRECTED per Phase-1 research):** A `UserPromptSubmit` hook can ONLY append `additionalContext` — a string the model reads as a reminder. It CANNOT modify the prompt, and the harness does NOT parse the appended text for slash commands or auto-run them (there is no `updatedPrompt` field; verified against official docs). So **the model is the executor for every channel**, not the harness. "High-confidence auto-invoke" means a strong model instruction; the model then runs the slash or invokes the `Skill`/`Agent` tool. The `invoke_kind` field still matters — it dictates the instruction phrasing and which downstream tool fires — but it does NOT change who executes (always the model). Four kinds:
- **Command-backed skill** (has a slash: gsd-*, modernize-*, commit, feature-dev, ralph-loop, /brainstorm, /write-plan, /execute-plan) → inject `Run /gsd-<mode> <args> because <reason>`; the model runs the slash. `invoke_kind: slash`.
- **Skill-only** (no slash; model-invoked via `Skill` tool: systematic-debugging, find-skills, design skills, dev-tool skills) → inject `Use skill <name> because <reason>`; the model invokes the `Skill` tool. `invoke_kind: skill`.
- **Agent** (subagent via `Agent` tool: gsd-* agents, cavecrew-*, scaffolder) → inject `Dispatch agent <name> for <subtask>`; the model dispatches via the `Agent` tool. `invoke_kind: agent`.
- **MCP-backed agent** (`requires_mcp_not_in_manifest` non-empty) → inject a warning or omit; never auto-recommend (the model would dispatch into a missing MCP). `invoke_kind: warn`.

**Confidence scoring (v1):** flat BM25 score `s` over union of `name`+`description`+`summary` for all manifest entries, weighted by `mode-map.json` signal patterns. Tiers:
- **High**: top mode `s ≥ T_high` AND beats runner-up by margin `≥ M` → slash auto-invoke + Skill/Agent instructions.
- **Medium**: `T_low ≤ s < T_high` OR decisive winner but moderate score → text suggestion only.
- **Low**: `s < T_low` OR no pattern matched OR top-2 within tie margin → pass through, inject nothing.
- Starting defaults: `T_high=0.6`, `T_low=0.3`, `M=0.2` (normalized BM25). Calibrate against the 10-task test — Phase 1 success (≥8/10 right picks) drives real calibration; raise `T_high` (more pass-through) if high-confidence auto-routes are wrong on the test set.

**Self-contained framework:** manifest + builder + setup docs already live at `~/.claude/router/` (manifest ~208KB, `build_manifest.py`, `docs/`). The build's job is to author `router.mjs`, `mode-map.json`, bind `settings.json`, and verify — not relocate files. After build + install, the throwaway build dir can be deleted; the framework lives in `~/.claude/`.

**Dev-tool skills to build with:** `skill-development`, `command-development`, `hook-development`, `agent-development`, `plugin-structure`, `mcp-integration`, `plugin-settings` — encode the correct authoring patterns so the router matches setup conventions.

## Constraints

- **Performance**: Router hook must return within the `UserPromptSubmit` timeout and never delay prompt handling beyond ~100ms. — fail-open, never block.
- **Coexistence**: Must not break existing `~/.claude/settings.json` hook bindings (gsd + context-mode + caveman) or ralph-loop's Stop-hook. Router's `UserPromptSubmit` binding coexists with caveman's plugin-scoped `caveman-mode-tracker.js` (sentinel marker, no mode-tracking duplication). — the user's setup keeps working.
- **Manifest freshness**: Manifest is a static snapshot of `~/.claude` + `~/.agents/skills` + known project `.claude/skills` dirs; `build_manifest.py` must be re-run when the setup changes. Router detects staleness gracefully (mtime / builder-changed-since-build) — pass through + one-line reminder, never auto-rebuild inside the hook. — hook stays <100ms.
- **Scope filtering**: `impeccable` is project-scoped to AutomaticTrading (in `agents_store_skills[]` and `project_scoped_skills[]`) — router must NOT recommend it globally; filter on `scope != "project"`. — wrong project's skill leaking globally.
- **MCP guarding**: Do not auto-recommend agents whose `requires_mcp_not_in_manifest` is non-empty — demote to warn tier unless the MCP is wired first. — auto-dispatch would fail.
- **Authoring convention**: Build the router using the dev-tool skills so its own hook/skill/agent authoring matches setup conventions. — consistency with the framework it routes over.
- **File writes**: All file writes via native tools; the hook runs in a subprocess and must not persist edits to the host FS except its own data files (cache, telemetry, weights). — hook is read-only w.r.t. user code.
- **Deny rules**: Respect existing permissions/deny rules in settings (`.env`, secrets, etc.) — mode-map entries must not reference those paths. — no secret leakage via injection.
- **Fail-open**: On any exception, pass through the original prompt unchanged. — routing must never block a prompt.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Always-on `UserPromptSubmit` hook, not a `/route` command | The gap is per-prompt automatic routing; a command re-introduces the manual step the user already fails to do. v1 ships no on-demand verbose view. | — Pending |
| Confidence-tiered hybrid injection (High=strong `Run /gsd-<mode>` model instruction + Skill/Agent instructions, Medium=text, Low=pass-through) | High-confidence gets execution leverage; ambiguous prompts stay quiet (no noise on edge cases); user keeps final control and can interrupt. **Phase-1 research correction:** the harness does NOT auto-run appended slashes — the MODEL reads `additionalContext` and acts; "auto-invoke" is a strong instruction, not harness execution. | — Pending |
| Flat BM25 v1; weighted BM25 + evolution deferred to v2/v3 | Ship the simplest thing that routes correctly; evolution needs telemetry data that doesn't exist yet. | — Pending |
| Reuse ralph-loop, do not build a new loop engine | ralph-loop (v1.0.0) is explicitly designed as the loop seam for a future orchestration layer. | — Pending |
| graphify is conditional, never always-on; v1 stubs the decision | Per-prompt graph query only when task touches the codebase + needs structural understanding. Avoids graph-build cost on non-code prompts. | — Pending |
| Model is the judge, not a separate classifier | No external service, no per-prompt LLM API call — the hook injects candidates + recommended mode and the main session acts. Preserves the efficiency goal. | — Pending |
| `invoke_kind` per mode-map entry (slash/skill/agent/warn) | A `UserPromptSubmit` hook can only append text; the channel that actually triggers execution depends on target type. Encoding it prevents dead injection. | — Pending |
| Throwaway build dir; deliverables install to `~/.claude/` | Framework is global personal infrastructure, not a project repo. Build dir holds `.planning/` for process only. | — Pending |
| commit_docs = No in build dir | Build dir is throwaway; planning docs stay local. Deliverables (not planning docs) are what persist, in `~/.claude/`. | — Pending |
| Standard granularity + Sequential execution | Router phases are dependent (core → graphify → evolution → ancestor reuse); sequential is safer for infra. | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-09 after v1.0 milestone*
