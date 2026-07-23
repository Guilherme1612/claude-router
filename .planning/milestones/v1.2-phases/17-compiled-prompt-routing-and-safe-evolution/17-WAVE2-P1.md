---
phase: 17-compiled-prompt-routing-and-safe-evolution
plan: wave2-p1
type: execute
wave: 2
depends_on: ["Wave 1"]
files_modified:
  - src/evolution/evidence.mjs
  - src/evolution/privacy-guard.mjs
  - tests/router.privacy-guard.test.mjs
autonomous: true
requirements: [D-05, D-06, D-07]
nyquist_compliant: true
must_haves:
  truths:
    - "D-05/D-06: only content-free structured signals (identity, confidence band, reason codes, fixture class, latency μs, version pairs, verdict) pass through privacy guard into evidence journal."
    - "D-05: deny-before-store semantics; no raw prompts, recovered context bodies, conversation history, secrets, capability payloads, or reversible prompt text may persist anywhere under src/evolution/*."
    - "D-07: project-scoped by default; global baseline evolves only from aggregate signals that pass the same canary gates before use as a candidate source."
  artifacts:
    - path: src/evolution/evidence.mjs
      provides: "Content-free telemetry signal envelope, bounded retention + decay, journal append with immutable versioning"
    - path: src/evolution/privacy-guard.mjs
      provides: "Deny-before-store rules for every forbidden signal type; non-reversible signatures where applicable"
  key_links:
    - from: src/evolution/evidence.mjs
      to: src/context/capsule.mjs (Phase 15)
      via: "bounded-read conventions and freshness witness pattern for journal metadata"
    - from: src/evolution/privacy-guard.mjs
      to: canary-controller contract (Wave 2 P2)
      via: "denied signals propagate as structured verdicts to evaluation controller; approved signals become input evidence"
---

<objective>
Build the privacy-safe telemetry collection surface for Phase 17 that enables evolution from real-world routing outcomes while strictly enforcing content-free signal boundaries.

Purpose: Provide `canary-controller.mjs` (Wave 2 P2) with deterministic, bounded, project-scoped signal data that passes the same evaluation gates as any other candidate input — but never stores raw user content or capability payloads anywhere on disk.
Output: `src/evolution/evidence.mjs` and `src/evolution/privacy-guard.mjs` plus a complete behavioral test matrix covering every deny path and storage-side privacy invariants.
</objective>

<execution_context>
@/Users/guilherme/.codex/gsd-core/workflows/execute-plan.md
@/Users/guilherme/.codex/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/phases/17-compiled-prompt-routing-and-safe-evolution/17-CONTEXT.md D-05 to D-08 (locked telemetry boundaries)
@.planning/phases/17-compiled-prompt-routing-and-safe-evolution/17-DISCUSSION-LOG.md (user-approved recommended defaults: content-free signals, project-scoped by default)
@src/context/sources.mjs (bounded-read conventions — privacy guard uses same deny-before-store pattern)
@.planning/phases/15-context-capsules-and-workflow-state-recovery/15-PATTERNS.md (privacy patterns from Phase 15 capsules)
@.planning/research/ARCHITECTURE.md (hot-path component responsibilities — telemetry signals emitted outside the routing function, not inline)
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Specify and implement privacy guard with deny-before-store semantics</name>
  <read_first>src/context/sources.mjs (deny pattern conventions), .planning/phases/17-compiled-prompt-routing-and-safe-evolution/17-CONTEXT.md D-05/D-06</read_first>
  <action>Implement `src/evolution/privacy-guard.mjs` as a pure function that takes any raw event payload and returns `{status: 'approved'|'denied', reason_code, approved_signal?}`. All forbidden signal types — raw prompts, context bodies, conversation history, secrets, capability payloads, reversible prompt text — must be detected by pattern (not just explicit field names) to prevent evasion via transformation.</action>
  <expected_output>A privacy guard module with documented deny rules for each forbidden type; all inputs that contain any forbidden data return `{status: 'denied', reason_code: <specific_denial_reason>}` before reaching the evidence journal. Approved signals carry non-reversible signatures where applicable (sha256 of prompt root tokens) so downstream canaries cannot reconstruct user content from stored metadata.</expected_output>
  <verify_with_tests>"Behavioral tests for every forbidden signal type individually plus combinations; deny rules must catch each pattern including transformed variants (base64-encoded prompts, hex-escaped secrets). Approved paths must include all required fields per D-05 envelope. Tests must assert zero writes to disk for any denied path."</verify_with_tests>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Specify and implement content-free evidence collector with bounded retention + decay</name>
  <read_first>src/context/sources.mjs (bounded-read + sha256 witness conventions), .planning/phases/17-compiled-prompt-routing-and-safe-evolution/17-WAVE2-P1.md Task 1 privacy guard API contract</read_first>
  <action>Implement `src/evolution/evidence.mjs` as an append-only journal under the project-scoped temp directory. Enforces: (a) every input passes through privacy guard before storage; (b) bounded maximum entries per retention window; (c) exponential decay with configurable half-life for older signals in evidence queries.</action>
  <expected_output>Evidence collector module with three public functions: `append(signal)` that returns `{stored, fingerprint}` after privacy-guard approval, `query(window)` that returns decaying signal set, and `compact(maxEntries)` that enforces retention. All storage is project-scoped (per D-07) under a temp directory matching Phase 15 capsule layout conventions; global-baseline aggregation requires passing the same canary gates before being eligible as input.</expected_output>
  <verify_with_tests>"Tests: privacy guard integration for each deny case; bounded retention truncates at max entries per window boundary; exponential decay with half-life = 24 hours produces deterministic older-weighted results (verifiable under synthetic time); minimum-sample check blocks insufficient evidence queries. Zero raw-content writes to disk verified via file-system audit."</verify_with_tests>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Integrate privacy-guard and evidence collector into hot-path telemetry emission point</name>
  <read_first>src/context/prompt-route.mjs (current routing flow — extension only, do not modify orchestrator)</read_first>
  <action>Add telemetry signal emission hook after Phase 16 route outcome is finalized. Emission runs in `prompt-route.mjs` but must not add measurable latency: privacy guard + evidence append should run synchronously under 0.5 ms per D-14 measurement budget for the canary evaluation harness.</action>
  <expected_output>An integration hook in `prompt-route.mjs` that emits one content-free signal per route (only when privacy guard approves). Emission must not block or slow the hot path — verified by Node profiler on synthetic trace. Privacy-guard denial results propagate as structured verdicts to canary controller, approved signals go through evidence journal.</expected_output>
  <verify_with_tests>"Node profiler test on synthetic trace measuring wall-clock time added per route; verify no raw-content writes reach disk under deny paths; run existing Phase 16 orchestrator suite against modified `prompt-route.mjs` confirming byte-equivalence of outcomes when telemetry disabled (privacy-guard denied all inputs)."</verify_with_tests>
</task>

</tasks>

## Open Questions (RESOLVED)

- **Non-reversible signature method:** Use sha256 of first 8 UTF-8 bytes of normalized prompt for identity-only signals, or omit entirely when deny/privacy guards fire? [RESOLVED: per D-06 "prompt signatures must be non-reversible and omitted when deny/privacy guards fire"; approved signals get a truncated hash (first 32 bits) so downstream canaries cannot reconstruct input]
- **Evidence journal location:** Project-scoped under `~/.cache/claude-router/evidence/<project-hash>/` or nested in `.planning/evolution/` alongside other planner artifacts? [RESOLVED: recommended .planning/evolution/<workflow>/ per Phase 14 coexistence pattern — tests lock both locations for determinism]

## Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Privacy guard deny rules | HIGH | D-05/D-06 locked decisions define exhaustive forbidden signal set; patterns are well-documented in capsule research (Phase 15). [VERIFIED: architecture, CONTEXT.md] |
| Evidence collector bounded retention | MEDIUM | Retention decay algorithm choice is discretionary but constrained by "must be deterministic and regression-testable" — exponential with fixed half-life resolves this. [RESOLVED in Wave Plan recommendation] |
| Integration latency overhead | HIGH | Single synchronous append + hash under 0.5 ms budget per profiler measurements; D-14 latency gate constrains acceptable cost. [VERIFIED: Phase 17 CONTEXT.md D-14 measurement protocol] |

## Sources

- `.planning/phases/17-compiled-prompt-routing-and-safe-evolution/17-CONTEXT.md` D-05–D-08 — locked telemetry boundaries and learnable signal envelope. [VERIFIED: codebase]
- `src/context/sources.mjs` (bounded-read + sha256 witness conventions) — reused for evidence journal metadata. [VERIFIED: architecture research]
- `.planning/phases/15-context-capsules-and-workflow-state-recovery/15-PATTERNS.md` — privacy patterns from Phase 15 capsules (deny-before-store approach). [VERIFIED: codebase]
- `docs/superpowers/plans/2026-07-14-dual-runtime-auto-updating-router-implementation.md` Phase 17 work packages. [VERIFIED: codebase]
