# Phase 24: Privacy-Safe Outcomes and Capability Health - Context

**Gathered:** 2026-07-27
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Users receive trustworthy local capability-health observations without Router retaining sensitive prompt content or penalizing capabilities on weak evidence.

**Depends on**: Phase 23 (Intent-Safe State-Aware Execution).
**Requirements**: HLTH-01 through HLTH-11.

### Success Criteria (what must be TRUE)

1. A user can inspect bounded local outcome records and confirm that raw prompts, transcripts, secrets, source documents, arbitrary outputs, and unbounded arguments are neither stored nor sent off-machine.
2. A user can inspect, reset, dispose of, and recover health state without changing authoritative capability definitions or the active routing map.
3. Health observations distinguish missing, unavailable, stale, unused, duplicate, overlapping, complementary, repeatedly ineffective, and reusable-workflow opportunities with reason codes, evidence windows, opportunity counts, freshness, confidence, and non-destructive remedies.
4. Rare or new recovery, incident, release, and migration capabilities remain unjudged when evidence is insufficient, while versioned thresholds, decay, cooldown, and multilingual calibration are testable and canary-guarded.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use ROADMAP phase goal, success criteria, REQUIREMENTS, and codebase conventions to guide decisions. The prior-phase decisions in `.planning/STATE.md` already establish the invariants this phase must preserve:

- [Phase 24]: Capability learning stays fully local and stores bounded outcome metadata, never raw prompts or arbitrary content.
- Phase 24 planning must calibrate opportunity-aware outcome semantics, sample floors, decay, and scope isolation (per STATE.md Blockers/Concerns).

### Constraints from prior phases (must hold)
- Outcome/health data lives entirely under `~/.claude/router/` (or its codex dual). No prompt data, capability metadata beyond a stable local id, telemetry, usage, health evidence, or recommendation state leaves the local machine.
- Health state is orthogonal to the authoritative registry and the active routing map: resetting/disposing/recovering health must never mutate capability definitions or `mode-map.json` / the active tuple.
- All publication of health policy still flows through the existing verifier → canary → last-known-good → rollback → recovery lifecycle (v1.2/Phase 18, extended by Phase 26). Health is a tuple member by Phase 26.
- Prompt-time routing stays a bounded read-only projection; health computation never runs on the prompt hot path (Phase 26 REL-01 reaffirms). Health is observed/published out-of-band.
- Framework-neutral: do not assume GSD/Gstack/Claude/Codex as default ecosystem; health operates on semantic-category + contract envelope, not framework names.

</decisions>

<code_context>
## Existing Code Insights

Codebase context will be gathered during plan-phase research. Plan-phase should map:

- Where outcome events originate today (the post-dispatch + post-work surface from Phase 23 — `actions.mjs`, `next-prompt.mjs`, the dispatch boundary, and the verifier/canary publish path from v1.2).
- The existing `telemetry.jsonl` append path and the privacy primitives already in `router.mjs` (sha256 normalized prompt signature, no raw prompt text) — outcome records must reuse the same privacy posture and allowlist discipline Phase 21 established for capability-authored values crossing the CLI boundary.
- The canonical registry / contract envelope from Phases 21–22 that health observations attach to (stable local capability id + semantic category; never framework name).
- The intent-classifier 8-disposition + four-gate dispatch model from Phase 23, since "helpful reuse" / "ineffective" / "abandoned" / "overridden" outcome labels derive from what the dispatch+execute path actually selected and used.

</code_context>

<specifics>
## Specific Ideas

Concrete requirements text to drive plan-phase (from `.planning/REQUIREMENTS.md`):

- HLTH-01: Background analysis stores no raw prompts, transcripts, secrets, arbitrary tool output, source documents, or unbounded arguments.
- HLTH-02: No prompt data, capability metadata, telemetry, usage information, health evidence, or recommendation state leaves the local machine.
- HLTH-03: The bounded outcome schema distinguishes selected, actually used, completed, corrected, retried, replaced, abandoned, overridden, and helpful reuse events.
- HLTH-04: Outcome records use allowlisted fields, stable local identifiers, retention limits, decay windows, restrictive permissions, corruption checks, and bounded compaction.
- HLTH-05: Users can inspect, reset, dispose of, and recover bounded health state without affecting authoritative capability definitions or the active routing map.
- HLTH-06: Usefulness scoring considers opportunity exposure, completion, verification, correction, retry, replacement, abandonment, override, recency, reversibility, and confidence rather than frequency alone.
- HLTH-07: Rare, recovery-oriented, incident-response, release, and migration capabilities are not classified as useless solely because they are infrequently invoked.
- HLTH-08: Router identifies missing categories, missing dependencies, unmapped capabilities, stale capabilities, long-unused capabilities, exact duplicates, semantic overlaps, complementary compositions, and repeatedly ineffective selections.
- HLTH-09: Router detects repeated multi-step workflows that are strong candidates for reusable skills or agents and distinguishes healthy repetition from repetition caused by failure or correction.
- HLTH-10: Every health observation includes reason codes, evidence window, sample size or opportunity count, freshness, affected capability IDs, confidence, and a non-destructive remedy.
- HLTH-11: Health thresholds, sample floors, decay, cooldown, and multilingual calibration remain versioned, testable, locally derived, and guarded by canary evidence.

Planning should decompose into a wave sequence (Wave 1 schema+privacy boundary → Wave 2 observation/scoring → Wave 3 admin/inspect+reset/recover → canary guard) that mirrors the v1.2/v1.3 pattern and keeps each plan independently verifiable. All thresholds/versioning must be canary-guarded and locally derived.

</specifics>

<deferred>
## Deferred Items

- Stronger ineffective-capability classification (Deferred Items table, v1.3 requirements) — Phase 24 should ship the conservative baseline; deeper classification may be deferred if evidence is insufficient per HLTH-07.
- Broader multilingual execution calibration (Deferred Items) — Phase 24 ships versioned, testable, locally derived calibration plumbing; the broader corpus lands later.
- Cross-capability multi-step workflow pattern mining (A→B→C→D→E completion sequences promotable to a new skill/agent) — Phase 24 ships per-capability consecutive-completion detection (HLTH-09 `reusable_workflow` over a single capability_id's outcome chain) as the conservative baseline; cross-capability route_id-correlation mining is deferred to a future phase. Per CONTEXT.md Deferred Items + HLTH-07 weak-evidence principle: cross-capability correlation needs more evidence than Phase 24 will have collected, and per-capability detection is the conservative baseline that does not require a new evidence surface.

</deferred>