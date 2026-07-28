---
phase: 11
slug: canonical-registry-and-runtime-adapters
created: 2026-07-14
status: validated
nyquist_compliant: true
---

# Phase 11 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node built-in `node:test` on Node v22.22.3 |
| **Config file** | none |
| **Quick run command** | `node --test tests/router.registry-schema.test.mjs tests/router.adapters.test.mjs tests/router.registry-build.test.mjs tests/router.settings-diff.test.mjs` |
| **Full suite command** | `node --test tests/*.test.mjs` |
| **Estimated runtime** | ~30 seconds |

## Sampling Rate

- **After every task commit:** Run the focused new test file plus `tests/router.lifecycle.test.mjs` when installer code changes.
- **After every plan wave:** Run `node --test tests/router.registry-schema.test.mjs tests/router.adapters.test.mjs tests/router.registry-build.test.mjs tests/router.settings-diff.test.mjs`.
- **Before `$gsd-verify-work`:** `node --test tests/*.test.mjs` must be green.
- **Max feedback latency:** 30 seconds.

## Per-Task Verification Map

| Requirement | Behavior | Test type | Automated command | Initial state |
|-------------|----------|-----------|-------------------|---------------|
| REG-01 | Stable canonical schema, identities, and deterministic bytes | unit | `node --test tests/router.registry-schema.test.mjs` | Wave 0 gap |
| REG-02 | Full build covers supported categories with provenance/conflict diagnostics | integration | `node --test tests/router.registry-build.test.mjs` | Wave 0 gap |
| ADP-01 | Claude global, plugin, agents-store, and project inventory | integration | `node --test tests/router.adapters.test.mjs` | Wave 0 gap |
| ADP-02 | Codex skills, plugins, agents, hooks, config, and project inventory | integration | `node --test tests/router.adapters.test.mjs` | Wave 0 gap |

## Wave 0 Requirements

- [ ] `tests/router.registry-schema.test.mjs` — REG-01 invariants and identity evidence.
- [ ] `tests/router.adapters.test.mjs` — ADP-01/ADP-02 temporary-home matrices and no out-of-root reads.
- [ ] `tests/router.registry-build.test.mjs` — REG-02 deterministic full-build parity and read-only behavior.

## Manual-Only Verifications

None. Phase requirements are covered by deterministic unit and integration tests.

## Validation Sign-Off

- [ ] Every plan task has an automated verification command.
- [ ] Every phase requirement maps to at least one automated test.
- [ ] Quick checks remain under the 30-second feedback target.
- [ ] The complete test suite passes before phase verification.
