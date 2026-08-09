---
phase: 39
slug: intent-authority-risk-and-invocation-policy
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-06
---

# Phase 39 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` + `node:assert/strict` |
| **Config file** | none (inline `test()` calls) |
| **Quick run command** | `rtk node --test tests/router.intent.test.mjs tests/router.intent-adversarial.test.mjs tests/router.approval.test.mjs tests/router.actions.test.mjs` |
| **Full suite command** | `rtk node --test tests/*.test.mjs` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command (intent + adversarial + approval + actions)
- **After every plan wave:** Run `rtk node --test tests/router.authority*.test.mjs tests/router.intent*.test.mjs tests/router.approval.test.mjs tests/router.actions.test.mjs`
- **Before `/gsd-verify-work`:** Full suite must be green (`rtk node --test tests/*.test.mjs`)
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 39-01-01 | 01 | 1 | AUTH-01 | T-39-01 / — | 5-class taxonomy maps 8 dispositions without regression | unit | `rtk node --test tests/router.authority.test.mjs` | ❌ W0 | ⬜ pending |
| 39-01-02 | 01 | 1 | AUTH-01 | — | inspection class detected without execute verb | unit | `rtk node --test tests/router.authority.test.mjs` | ❌ W0 | ⬜ pending |
| 39-01-03 | 01 | 1 | AUTH-02 | T-39-01 | autonomous wording in example/audit/policy framing abstains | unit (adversarial) | `rtk node --test tests/router.authority.test.mjs` | ❌ W0 | ⬜ pending |
| 39-01-04 | 01 | 1 | AUTH-02 | — | existing 8-disposition abstention preserved (no regression) | regression | `rtk node --test tests/router.intent.test.mjs tests/router.intent-adversarial.test.mjs` | ✅ existing | ⬜ pending |
| 39-02-01 | 02 | 1 | AUTH-03 | T-39-02 | confidence never grants authority (low+auth→proceed, high+no-auth→block) | unit | `rtk node --test tests/router.authority-policy.test.mjs` | ❌ W0 | ⬜ pending |
| 39-02-02 | 02 | 1 | AUTH-03 | — | historical-success weight never changes a block to proceed | unit | `rtk node --test tests/router.authority-policy.test.mjs` | ❌ W0 | ⬜ pending |
| 39-03-01 | 03 | 2 | AUTH-04 | — | medium+explicit+reversible+local+fit → proceed without repeat | unit | `rtk node --test tests/router.authority-gate.test.mjs` | ❌ W0 | ⬜ pending |
| 39-03-02 | 03 | 2 | AUTH-04 | — | low-fit or conflicting → block or ask | unit | `rtk node --test tests/router.authority-gate.test.mjs` | ❌ W0 | ⬜ pending |
| 39-03-03 | 03 | 2 | AUTH-05 | T-39-03 | protected effect → pause (not block) | unit | `rtk node --test tests/router.authority-gate.test.mjs` | ❌ W0 | ⬜ pending |
| 39-03-04 | 03 | 2 | AUTH-05 | — | expanded vocab (credentialed/billing/publication/deploy/push-PR/scope) triggers pause | unit | `rtk node --test tests/router.approval.test.mjs` (extended) | ✅ extend existing | ⬜ pending |
| 39-04-01 | 04 | 2 | HOST-04 (regression) | — | warm p95 ≤25ms / max <100ms with policy wired | perf | `rtk node --test tests/router.perf.test.mjs` + budget test | ✅ existing (extend) | ⬜ pending |
| 39-04-02 | 04 | 2 | Lifecycle (regression) | — | new module deploys to both runtimes | lifecycle | `rtk node --test tests/router.lifecycle.test.mjs` | ✅ existing (count bump) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/router.authority.test.mjs` — stubs for AUTH-01/02 (5-class taxonomy + autonomous-wording-as-text)
- [ ] `tests/router.authority-policy.test.mjs` — stubs for AUTH-03 (independence invariant)
- [ ] `tests/router.authority-gate.test.mjs` — stubs for AUTH-04/05 (proceed/pause/ask integration)
- [ ] Extend `tests/router.approval.test.mjs` — AUTH-05 expanded protected-effect vocabulary
- [ ] `src/intent/authority.mjs` — new module (classifyAuthority + evaluateAuthorityPolicy + PROTECTED_EFFECT_TOKENS)
- [ ] Add `src/intent/authority.mjs` to `src/lifecycle/router-lifecycle.mjs` `moduleNames` + bump lifecycle test count

*Existing infrastructure (node:test, rtk runner) covers the framework; Wave 0 adds the phase-specific test files + module.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Operator sees host-mediated confirmation surface in `additionalContext` for a protected effect | AUTH-05 | Requires live hook invocation + model rendering of injected context | Trigger a protected-effect prompt through the live hook; observe the `paused` confirmation hint in the injected context; resume via approval token |

*All other phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending