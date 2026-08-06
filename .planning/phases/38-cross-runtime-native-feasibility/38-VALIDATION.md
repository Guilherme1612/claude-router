---
phase: 38
slug: cross-runtime-native-feasibility
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-06
---

# Phase 38 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
>
> Seeded by plan-phase from the `## Validation Architecture` section of `38-RESEARCH.md`.
> The planner fills the Per-Task Verification Map from PLAN.md task IDs; validate-phase
> finalizes `nyquist_compliant` after Wave 0 runs green.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (Node stdlib, no install — matches stdlib-only hook constraint) |
| **Config file** | none — stdlib runner, invoked via `/Users/guilherme/.hermes/node/bin/node --test` |
| **Quick run command** | `node --test tests/phase-38/*.test.mjs` |
| **Full suite command** | `node --test tests/phase-38/*.test.mjs` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test tests/phase-38/*.test.mjs`
- **After every plan wave:** Run `node --test tests/phase-38/*.test.mjs`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 38-01-T1 (tracer) | 38-01 | 1 | HOST-01 | T-38-01,02,04,06 | adapter-issued invocation_identity + receipt; fixed fixture path; no prompt-derived spawn | integration | `node --test tests/phase-38/native-dispatch.test.mjs` | ❌ W0 | ⬜ pending |
| 38-01-T2 (tdd) | 38-01 | 1 | HOST-01 | T-38-02,03 | anti-cheat: recommendation text/test helper/empty input cannot forge 'invoked' receipt | integration + anti-cheat | `node --test tests/phase-38/native-dispatch.test.mjs tests/phase-38/claude-adapter.test.mjs` | ❌ W0 | ⬜ pending |
| 38-02-T1 (tdd) | 38-02 | 2 | HOST-02 | T-38-08,10,11 | Codex adapter path + partition + anti-cheat + encoding | integration + anti-cheat | `node --test tests/phase-38/codex-adapter.test.mjs` | ❌ W0 | ⬜ pending |
| 38-02-T2 (tdd) | 38-02 | 2 | HOST-03 | T-38-08,09 | parity + recommendation-only fallback (no silent downgrade) + cross-runtime isolation | parity + fallback | `node --test tests/phase-38/recommendation-only.test.mjs` | ❌ W0 | ⬜ pending |
| 38-03-T1 (tdd) | 38-03 | 3 | HOST-04 | T-38-12,13,14,16 | latency/token budgets at+beyond thresholds; no spawn/scan/hash/network/LLM/mutation/learning on hot path; fail-open | perf + invariant | `node --test tests/phase-38/budget.test.mjs` | ❌ W0 | ⬜ pending |
| 38-03-T2 | 38-03 | 3 | HOST-04 (deploy) | T-38-15 | dispatch adapters + fixture + tests in deploy bundle; build gate green | build | `node --test tests/router.build-gate.test.mjs tests/router.adapters.test.mjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/phase-38/fixtures/harmless.mjs` — harmless host fixture (real native invocation target)
- [ ] `tests/phase-38/native-dispatch.test.mjs` — adapter spawn + receipt + anti-cheat (no pid/identity from test helper or recommendation text)
- [ ] `tests/phase-38/claude-adapter.test.mjs` — Claude runtime native invocation + observation
- [ ] `tests/phase-38/codex-adapter.test.mjs` — Codex runtime native invocation + observation
- [ ] `tests/phase-38/recommendation-only.test.mjs` — incompatible adapter → recommendation-only, truthful, no autonomous dispatch
- [ ] `tests/phase-38/budget.test.mjs` — prompt + startup latency/token budget + read-only/fail-open invariants (no scan/hash/network/LLM/mutation/learning)

*Existing test infrastructure (node --test) covers the framework; Wave 0 adds phase-38 files.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| _to be filled by planner/validate-phase if any_ | — | — | — |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending