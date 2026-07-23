---
phase: 17-compiled-prompt-routing-and-safe-evolution
plan: wave2-p2
type: execute
wave: 2
depends_on: ["Wave 2 P1"]
files_modified:
  - src/evolution/canary-controller.mjs
  - tests/router.canary-evaluation.test.mjs
autonomous: true
requirements: [D-09, D-10, D-11, D-12]
nyquist_compliant: true
must_haves:
  truths:
    - "D-09/D-10: every candidate is immutable, tied to source evidence and policy/index version; promotion requires all deterministic gates pass plus a minimum evidence window."
    - "D-11: any hard safety/privacy/corruption/compatibility/latency-ceiling failure triggers immediate rejection or rollback; quality regression across the evidence window also rolls back automatically."
    - "D-12: promotion and rollback reuse existing durable journal, immutable-version, atomic-pointer, last-known-good mechanisms — readers never observe a partially published candidate."
  artifacts:
    - path: src/evolution/canary-controller.mjs
      provides: "Evidence window logic, quality regression detection, automatic promotion/rollback coordination via Phase 14 activation journal"
  key_links:
    - from: src/evolution/canary-controller.mjs
      to: canary-evaluation test file (Wave 2 P2)
      via: "behavioral matrix covering minimum-sample enforcement, quality vs latency independence, immutability invariant"
---

<objective>
Implement the deterministic canary evaluation controller that promotes candidates only after evidence-window verification and rolls back automatically on any hard-gate failure.

Purpose: Provide an automated promotion/rollback mechanism for compiled-index candidates (Wave 1) so that privacy-safe evolution happens without manual intervention — satisfying D-09 through D-12 with the constraint that no in-place mutation of active state ever occurs.
Output: `src/evolution/canary-controller.mjs` and complete Wave 2 canary-evaluation test matrix covering minimum-sample enforcement, quality vs latency independence (D-13), and rollback trigger behavior under every forbidden signal path.
</objective>

<execution_context>
@/Users/guilherme/.codex/gsd-core/workflows/execute-plan.md
@/Users/guilherme/.codex/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/phases/17-compiled-prompt-routing-and-safe-evolution/17-CONTEXT.md D-09 to D-12 (locked promotion/rollback semantics)
@.planning/phases/17-compiled-prompt-routing-and-safe-evolution/17-DISCUSSION-LOG.md (user-approved: evidence-window policy, immutable candidate versions, automatic rollback on hard failures + demonstrated quality regression; reuses Phase 14 journal + atomic-pointer)
@src/context/prompt-route.mjs (hot-path seam integration point)
@src/evolution/evidence.mjs (Wave 2 P1 — content-free signal input to canary controller)
@src/registry/map.mjs, src/registry/diff.mjs, src/registry/activate.mjs (Phase 14 journal + atomic-pointer conventions for publication)
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Specify immutable candidate store and promotion evaluation logic</name>
  <read_first>src/registry/map.mjs (journal-append convention), src/context/prompt-route.mjs (hot-path seam contract)</read_first>
  <action>Implement `src/evolution/canary-controller.mjs` with two public entry points: `propose(candidate)` that validates immutability and returns `{status, candidate_hash}`; `evaluateForPromotion(candidate, evidence)` that runs all hard gates in sequence (safety, privacy, quality, budget, compatibility, latency) and returns the promotion verdict or rollback trigger reason_code.</action>
  <expected_output>An immutable candidate store under `.planning/evolution/<workflow>/` that never mutates existing entries. Each `propose` call appends a new fingerprint-verified entry; each `evaluateForPromotion` runs hard gates in order: (1) privacy guard on all source signals, (2) latency gate comparison against Phase 17 D-14 baseline, (3) quality regression check across evidence window. Promotion verdict requires ALL gates pass AND positive quality delta on at least one fixture class (D-16).</expected_output>
  <verify_with_tests>"Tests must cover: immutability invariant — modify candidate post-propose, assert journal records original hash and version unchanged; latency improvement cannot compensate for quality regression (independent-gates test); all six fixture classes from Phase 17 D-13 evaluated during promotion check; minimum-sample enforcement blocks insufficient evidence queries with structured reason_code."</verify_with_tests>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Specify rollback integration through existing Phase 14 activation pipeline</name>
  <read_first>src/registry/diff.mjs (journal append pattern), src/registry/activate.mjs (atomic-pointer + last-known-good conventions)</read_first>
  <action>Route all promotion and rollback operations through the existing Phase 14 durable journal, immutable-version record, atomic pointer swap, and last-known-good mechanisms. Never mutate active state directly — use journal append → verification check → atomic-pointer swap protocol. Rollback must complete without readers observing a partially published candidate.</action>
  <expected_output>A rollback integration path that reuses Phase 14's verified activation pipeline. The `canary-controller.mjs` module exposes `rollbackTo(candidate_hash)` that appends a journal entry, verifies the previous state is intact (atomic-pointer still points to known-good), and swaps the pointer via rename — exactly mirroring how Phase 14 handles version selection for candidates. Tests must include corrupted-pointer recovery and concurrent-swap race scenarios.</expected_output>
  <verify_with_tests>"Tests: atomic-pointer rollback completes without readers seeing a half-written candidate (snapshot during swap shows previous state); journal integrity after simulated corruption; rollback preserves unrelated registry settings, hooks, plugins — exactly as D-12 approval states. Cross-check with Phase 14 VERIFICATION.md to confirm same activation pipeline behavior."</verify_with_tests>
</task>

<task type="auto" tdd="true">
  <name>Task 3: End-to-end integration of canary controller into prompt route lifecycle</name>
  <read_first>src/context/prompt-route.mjs (current routing flow), .planning/phases/17-compiled-prompt-routing-and-safe-evolution/17-WAVE2-P1.md Task 3 (telemetry emission hook from Wave 2 P1)</read_first>
  <action>Add canary-controller evaluation as a post-route hook in `prompt-route.mjs` OR as an out-of-band background process. Per D-14 measurement protocol, this must not interfere with the measured latency gate — the controller must operate independently of the hot path timing loop.</action>
  <expected_output>A non-blocking integration point where canary-controller evaluation runs after the route completes and telemetry signal is captured. The hot path's measurable wall-clock time remains under Phase 17 D-14 gates regardless of controller execution status (rejected candidate, promoted candidate, or pending-evaluation all must not slow the measured value). Tests cover: rejected-candidate fast-path behavior, promoted-candidate subsequent routing change verified, and measurement overhead isolation.</expected_output>
  <verify_with_tests>"Run with Node profiler on synthetic trace showing canary evaluation runs after hot path completes without adding to measured route time. Verify that when controller is disabled, routes produce identical behavior (canary evaluation is optional post-process)."</verify_with_tests>
</task>

</tasks>

## Open Questions (RESOLVED)

- **Evidence window minimum sample count:** Must be documented as enforceable; recommended `minimum_samples=10`. [RESOLVED: Wave Plan recommendation — tests must verify minimum-sample enforcement blocks promotion with structured reason_code]
- **Quality regression vs latency improvement independence:** Tests must include a case where every metric except quality improves (e.g., 5% faster, lower context bytes) and still rejects the candidate — confirming D-16 is an independent gate. [RESOLVED: Wave Plan "Quality gates are independent" recommendation]

## Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Immutability invariant under concurrent access | HIGH | Reuses Phase 14 atomic-pointer + journal pattern already proven in `tests/router.registry-*.test.mjs`. [VERIFIED: architecture, Phase 14 VERIFICATION.md] |
| Rollback without reader observation of partial publish | HIGH | Atomic rename (Phase 14 convention) guarantees readers see old or new state, never intermediate. [VERIFIED: architecture research] |
| Quality vs latency gate independence under measurement | MEDIUM | The independent-hard-gate design is conceptually clear but requires careful test fixture construction — every quality metric must be measured on its own fixtures and verified independently of any latency measurement in the same run. [RESOLVED through Wave 3 calibration corpus] |

## Sources

- `.planning/phases/17-compiled-prompt-routing-and-safe-evolution/17-CONTEXT.md` D-09–D-12 — locked promotion/rollback semantics with immutable-version requirement. [VERIFIED: codebase]
- `src/registry/map.mjs`, `src/registry/diff.mjs`, `src/registry/activate.mjs` — Phase 14 journal + atomic-pointer conventions for published-state safety. [VERIFIED: architecture research, Phase 14 VERIFICATION.md]
- `.planning/phases/17-compiled-prompt-routing-and-safe-evolution/17-DISCUSSION-LOG.md` — user-approved recommended defaults for evidence-window policy and automatic rollback. [VERIFIED: codebase]
