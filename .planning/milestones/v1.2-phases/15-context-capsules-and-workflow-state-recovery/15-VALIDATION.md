---
phase: 15
slug: context-capsules-and-workflow-state-recovery
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-16
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Native `node:test` with `node:assert/strict` |
| **Config file** | none — repository uses direct `node --test` commands |
| **Quick run command** | `node --test tests/router.context-capsule.test.mjs tests/router.context-sources.test.mjs tests/router.context-resume.test.mjs` |
| **Full suite command** | `node --test tests/*.test.mjs` |
| **Estimated runtime** | ~10 seconds for focused tests; full-suite runtime measured during execution |

---

## Sampling Rate

- **After every task commit:** Run the focused `tests/router.context-*.test.mjs` file changed by that task
- **After every plan wave:** Run `node --test tests/router.context-*.test.mjs tests/router.registry-activate.test.mjs tests/router.control-cli.test.mjs`
- **Before `$gsd-verify-work`:** `node --test tests/*.test.mjs` plus the static privacy scan defined by the plans must be green
- **Max feedback latency:** 10 seconds for focused tests

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 1 | CTX-01 | T-15-01 | Capsule bytes exclude prompts, transcripts, secrets, credentials, tool output, and document bodies | unit + filesystem integration | `node --test tests/router.context-capsule.test.mjs` | ❌ W0 | ⬜ pending |
| 15-01-02 | 01 | 1 | CTX-01 | T-15-02, T-15-03 | Contained restrictive atomic writes reject symlinks, durably replace active/LKG state, recover corrupt active state privately, and enforce pre-read plus schema/count/byte ceilings | unit + filesystem integration | `node --test tests/router.context-capsule.test.mjs` | ❌ W0 | ⬜ pending |
| 15-02-01 | 02 | 2 | CTX-01, CTX-02 | T-15-05, T-15-06, T-15-08 | Source adapters reject escaping/symlinked paths, bound facts and local git summaries without disclosure, and cap file/command work | unit + filesystem/process integration | `node --test tests/router.context-sources.test.mjs` | ❌ W0 | ⬜ pending |
| 15-02-02 | 02 | 2 | CTX-02 | T-15-07 | Freshness mismatches cannot let capsule hints override authoritative identity/status | unit + integration | `node --test tests/router.context-sources.test.mjs tests/router.context-capsule.test.mjs` | ❌ W0 | ⬜ pending |
| 15-03-01 | 03 | 3 | CTX-02, ORC-02 | T-15-09, T-15-10 | Exactly-one eligibility, terminal guards, explicit-first override, and no goal merge prevent unsafe dispatch/tampering | unit + integration | `node --test tests/router.context-resume.test.mjs` | ❌ W0 | ⬜ pending |
| 15-03-02 | 03 | 3 | CTX-02, ORC-02 | T-15-11, T-15-12 | CLI evidence is bounded/private and every outcome carries stable reason/provenance | CLI integration | `node --test tests/router.control-cli.test.mjs tests/router.context-resume.test.mjs` | ❌ W0 | ⬜ pending |
| 15-03-03 | 03 | 3 | CTX-02, ORC-02 | T-15-09, T-15-10, T-15-11, T-15-12 | Live prompt path resolves before routing, never double-dispatches, refreshes atomically, and emits no private source body | hook-process integration | `node --test tests/router.context-prompt-integration.test.mjs tests/router.failopen.test.mjs tests/router.settings-diff.test.mjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/router.context-capsule.test.mjs` — CTX-01 schema, privacy, persistence, and corrupt/LKG recovery fixtures
- [ ] `tests/router.context-sources.test.mjs` — CTX-01/CTX-02 bounded authoritative-source and freshness-witness fixtures
- [ ] `tests/router.context-resume.test.mjs` — CTX-02/ORC-02 transition, override, terminal-state, and ambiguity matrix
- [ ] `tests/router.context-prompt-integration.test.mjs` — real UserPromptSubmit fixtures for all three referential phrases, unique/ambiguous/override/stale/terminal outcomes, privacy, and fail-open routing
- [ ] Shared temporary-owned-root fixtures for exact GSD state files, design references, corrupt capsules, and canary secrets (local helpers are acceptable when small)

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-07-23 after post-milestone Nyquist reconciliation; full sequential suite passed.
