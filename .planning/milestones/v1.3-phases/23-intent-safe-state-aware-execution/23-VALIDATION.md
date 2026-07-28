---
phase: 23
slug: intent-safe-state-aware-execution
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-27
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js `node:test` + `node:assert/strict` (v22.22.3) |
| **Config file** | none — direct `.test.mjs` files |
| **Quick run command** | `rtk node --test tests/router.intent.test.mjs tests/router.intent-adversarial.test.mjs tests/router.actions.test.mjs tests/router.approval.test.mjs tests/router.dispatch-integration.test.mjs` |
| **Full suite command** | `rtk node --test tests/*.test.mjs` |
| **Estimated runtime** | ~6 seconds focused; ~15 seconds full suite |

---

## Sampling Rate

- **After every task commit:** Run the quick run command above (or the per-task subset listed below)
- **After every plan wave:** Run `rtk node --test tests/*.test.mjs` plus Phase 22 regression (`tests/router.contract-eligibility.test.mjs`, `tests/router.contracts.test.mjs`, `tests/router.relationships.test.mjs`)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~6 seconds (focused) / ~15 seconds (full)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 23-01-01 | 01 | 1 | INT-01, INT-02, EXEC-02, EXEC-05, EXEC-10 | T-23-01/02/05/06/08 | Classifier marks non-execute as dispatch_eligible=false; hook records never selected; framework-neutral next-prompt | integration | `rtk node --test tests/router.dispatch-integration.test.mjs` | ❌ W0 (task creates) | ⬜ pending |
| 23-01-02 | 01 | 1 | INT-01, INT-02, INT-04, INT-05 | T-23-02, T-23-V5 | Eight-disposition matrix; minimal-pair negation guard; empty → ambiguous | unit | `rtk node --test tests/router.intent.test.mjs` | ❌ W0 (task creates) | ⬜ pending |
| 23-02-01 | 02 | 2 | INT-03, INT-06 | T-23-02, T-23-V5 | Adversarial minimal pairs opposite dispositions; multilingual abstain; negative invocation assertion | adversarial | `rtk node --test tests/router.intent-adversarial.test.mjs` | ❌ W0 (task creates) | ⬜ pending |
| 23-02-02 | 02 | 2 | EXEC-01, EXEC-02, EXEC-03, EXEC-04, EXEC-06, EXEC-10 | T-23-06, T-23-08, T-23-09 | Contract-only resolution; debug/create-phase verbs; tie/stale/terminal/missing-dep blocked with exact reason codes; framework-neutral next-prompt | unit + integration | `rtk node --test tests/router.actions.test.mjs` | ❌ W0 (task creates) | ⬜ pending |
| 23-03-01 | 03 | 3 | EXEC-07, EXEC-08, EXEC-09 | T-23-03/04/05/09, T-23-V4/V6 | needsApproval for destructive; bind/verify with stale/mismatch fail-closed; hook never reaches bindApproval | unit | `rtk node --test tests/router.approval.test.mjs` | ❌ W0 (task creates) | ⬜ pending |
| 23-03-02 | 03 | 3 | EXEC-05, EXEC-06, EXEC-09, EXEC-10 | T-23-03/04/05/07/08/09, T-23-V7 | Full dispatch matrix; destructive-with-approval dispatches; destructive-without → blocked; post-work next-prompt re-reads fresh state | integration | `rtk node --test tests/router.dispatch-integration.test.mjs` | ✅ (expanded by task) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/router.intent.test.mjs` — INT-01/02/04/05 classifier matrix (created by task 23-01-02)
- [ ] `tests/router.intent-adversarial.test.mjs` — INT-03/06 adversarial corpus (created by task 23-02-01)
- [ ] `tests/router.actions.test.mjs` — EXEC-01/02/03/04/06/10 action mapper (created by task 23-02-02)
- [ ] `tests/router.approval.test.mjs` — EXEC-07/08/09 approval binding + stale/mismatch + hook exclusion (created by task 23-03-01)
- [ ] `tests/router.dispatch-integration.test.mjs` — EXEC-05/06/09/10 end-to-end (created by task 23-01-01, expanded by 23-03-02)
- [ ] `tests/helpers/inventory-fixture.mjs` — extend with `workflow-transitions` variant (created by task 23-01-01)

*Note: Wave 0 is implicit — each task creates its own test file as the first RED step (TDD). No separate Wave 0 scaffolding pass needed because every task is `tdd="true"` with RED→GREEN.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| (none) | — | — | — |

*All phase behaviors have automated verification. Phase 23 ships pure modules + tests only; no prompt-hook wiring (deferred to Phase 26 REL-01/REL-02), so there is no interactive prompt path to verify manually.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task has one)
- [x] Wave 0 covers all MISSING references (test files are created by their tasks)
- [x] No watch-mode flags
- [x] Feedback latency < 6s focused, < 15s full
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending