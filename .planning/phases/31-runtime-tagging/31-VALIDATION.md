---
phase: 31
slug: runtime-tagging
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-01
---

# Phase 31 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node built-in `node:test` (`import test from 'node:test'`) |
| **Config file** | none — `node --test` auto-discovers `tests/*.test.mjs` |
| **Quick run command** | `rtk node --test tests/router.health.outcome-schema.test.mjs tests/router.cache.test.mjs tests/router.runtime-tagging.test.mjs tests/router.mjs.snapshot.diff.test.mjs` |
| **Full suite command** | `rtk node --test tests/*.test.mjs` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command above (targeted: outcome-schema + cache + runtime-tagging + mirror-diff).
- **After every plan wave:** Run `rtk node --test tests/*.test.mjs` (full suite).
- **Before `/gsd-verify-work`:** Full suite must be green.
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| PARITY-01 | 01/02 | 1 | PARITY-01 | T-31-01 / — | Deterministic detection, fail-open to `claude`, zero hot-path IO | unit | `rtk node --test tests/router.phase26-dual-runtime.test.mjs tests/router.runtime-tagging.test.mjs` | ❌ W0 | ⬜ pending |
| PARITY-02 (cache) | 01 | 1 | PARITY-02 | T-31-02 / — | Same prompt+manifest under `claude` vs `codex` → distinct `cacheKey` | unit | `rtk node --test tests/router.cache.test.mjs` | ⬜ extend | ⬜ pending |
| PARITY-02 (telemetry) | 01 | 2 | PARITY-02 | T-31-03 / — | Telemetry carry correct `runtime`; per-runtime path | unit | `rtk node --test tests/router.runtime-tagging.test.mjs tests/router.cache.test.mjs` | ❌ W0 | ⬜ pending |
| PARITY-02 (OUTCOME bump) | 01 | 2 | PARITY-02 | T-31-04 / — | `OUTCOME_FIELDS.size === 16`; `runtime`/`epoch` in membership; frozen | unit | `rtk node --test tests/router.health.outcome-schema.test.mjs` | ⬜ update :68-74 | ⬜ pending |
| D-07 / D-08 (deferred) | 02 | 2 | PARITY-03/04 → Phase 32 | — | Minimal cross-runtime fixture only; full resolve behavior deferred | (deferred) | — | n/a | ⬜ deferred |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/router.runtime-tagging.test.mjs` — new spec: runtime detection precedence (`ROUTER_RUNTIME` env → Codex marker → default `claude`), fail-open behavior, cache-key divergence per runtime, telemetry `runtime` field, mirror-desync guard.
- [ ] Update `tests/router.health.outcome-schema.test.mjs` (size 14 → 16; add `runtime`/`epoch` to membership loop) — the enforcement test that MUST change WITH the `OUTCOME_FIELDS` policy bump.
- [ ] Extend `tests/router.cache.test.mjs` — cross-runtime `cacheKey` divergence.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live mirror parity of `~/.claude/hooks/router.mjs` vs `tests/router.mjs.snapshot` | PARITY-01/02 | The deployable copy exists outside the repo; the diff test requires both files present | Run `diff ~/.claude/hooks/router.mjs tests/router.mjs.snapshot` and confirm zero output; snapshot-diff test asserts this in-repo |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
