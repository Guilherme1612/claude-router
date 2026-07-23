# Phase 17: Compiled Prompt Routing and Safe Evolution - Discussion Log

**Date:** 2026-07-16
**Mode:** Interactive text mode with user-approved recommended defaults
**Result:** Context captured; ready for planning

## Phase Boundary Presented

Connect compact compiled state to the prompt hot path and safely improve routing through privacy-safe telemetry and canaries without latency, context-budget, or routing-quality regressions.

## Area Selection

The user selected all four presented areas by directing the workflow to apply every recommended option.

## Decisions

### Compiled-index failure behavior

**Question:** When an index is missing, stale, corrupt, or version-incompatible, should routing use the previous verified index, return a bounded clarification, or bypass compiled routing?

**Options presented:**

1. Verified-index fallback, with bounded clarification or diagnostic if no compatible verified version exists — recommended.
2. Always return a clarification without attempting known-good fallback.
3. Bypass compiled routing and use a slow path.

**Selected:** Recommended verified-index fallback. No prompt-time scan, rebuild, or external classification fallback.

### Telemetry learning boundaries

**Question:** Which privacy-safe outcomes may influence weights, how long should signals remain useful, and should learning be global, project-scoped, or both?

**Options presented:**

1. Structured content-free signals, project-scoped by default, with a separately validated global baseline — recommended.
2. Global-only learning.
3. Disable adaptive learning.

**Selected:** Recommended project-scoped learning with bounded retention/decay and strict exclusions for raw or reversible user content.

### Canary promotion and rollback

**Question:** How much evidence should a candidate need before promotion, what counts as a regression, and when should rollback occur?

**Options presented:**

1. Bounded evidence-window promotion with immediate rollback on hard failures and automatic rollback on demonstrated quality regression — recommended.
2. Promote after the first successful evaluation.
3. Require manual approval for every candidate.

**Selected:** Recommended evidence-window policy, reusing immutable candidate versions, atomic activation, durable journals, and verified known-good rollback.

### Quality versus latency gates

**Question:** Must every routing fixture remain exact, or may a candidate trade small quality differences for lower latency or context use?

**Options presented:**

1. Independent hard quality, context-budget, privacy, and latency gates — recommended.
2. One weighted score allowing quality and latency to compensate for each other.
3. Latency-first acceptance.

**Selected:** Recommended independent hard gates. Warm p95 remains below 25 ms, every measured route remains below 100 ms, and faster routing cannot excuse semantic or safety regression.

## Follow-up Notes

- The user delegated the detailed recommended choices rather than requesting further question rounds.
- No external document was introduced during discussion.
- No todos were matched or folded into this phase.
- No deferred ideas were raised.

---

*Human audit artifact only. Downstream agents consume `17-CONTEXT.md`.*
