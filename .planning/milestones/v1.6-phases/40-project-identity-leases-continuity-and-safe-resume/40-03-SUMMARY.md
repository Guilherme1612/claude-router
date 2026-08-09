---
phase: 40-project-identity-leases-continuity-and-safe-resume
plan: 03
requirements-completed: [LEASE-06]
subsystem: lease
tags: [lease, briefing, deploy, lifecycle, cli, lease-06, lease-03, lease-04]
requires:
  - src/lease/identity.mjs::computeLeaseFingerprint (Plan 01)
  - src/lease/store.mjs::createLeaseStore (Plan 01)
  - src/lease/store.mjs::findByFingerprint (Plan 01)
  - src/lease/store.mjs::isExpired (Plan 01)
  - src/lease/store.mjs::inspect (Plan 01)
  - src/lease/store.mjs::setStatus (Plan 01)
  - src/lease/policy.mjs::buildLeaseRecord (Plan 01)
  - src/lease/policy.mjs::resolveLeaseAuthority (Plan 02)
  - src/lifecycle/router-lifecycle.mjs::moduleNames (moduleValues flatMap)
  - src/cli/router-control.mjs::canonical (canonical output shape)
provides:
  - src/lease/briefing.mjs::BRIEFING_POLICY_VERSION
  - src/lease/briefing.mjs::composeBriefing
  - src/cli/router-control.mjs::leasesCommand
affects:
  - "Phase 41+ (lease enforcement / evolution): composeBriefing payload is the structured input the startup path renders into additionalContext; CLI is the operator surface for inspect/revoke"
tech-stack:
  added:
    - "src/lease/briefing.mjs — pure stdlib-only briefing composer (no fs/os import; leaseStore arrives as argument)"
    - "router-control `leases` command (inspect/show/revoke) reusing createLeaseStore from the deployed module"
  patterns:
    - "Lease INVALID set (Object.freeze 8 statuses) — each maps to a distinct internal briefing_status but ALL return null (no auto-run)"
    - "First-visit silent: findByFingerprint null → null (the defining LEASE-06 case)"
    - "Fail-open try/catch wraps the whole composer; any store throw → null"
    - "Briefing references receipt IDs (last_safe_checkpoint), never raw prompt text"
    - "moduleValues flatMap over [ownedRoot, codexOwnedRoot] deploys the 4 lease modules to both runtimes (T-39-03 regression backstop)"
key-files:
  created:
    - src/lease/briefing.mjs
    - tests/router.lease-briefing.test.mjs
    - .planning/phases/40-project-identity-leases-continuity-and-safe-resume/deferred-items.md
  modified:
    - src/lifecycle/router-lifecycle.mjs
    - src/cli/router-control.mjs
    - tests/router.lifecycle.test.mjs
    - tests/router.control-cli.test.mjs
decisions:
  - "INVALID set is Object.freeze([...8 statuses...]) with a Set for O(1) membership; briefing_status is derived in order (invalid status → expired → foreign → active) so each of the eight invalid states maps to a distinct internal status string but all return null"
  - "Lease store root in the CLI is join(ownedRoot, 'leases') — matches defaultLeaseRoot's ~/.{claude,codex}/router/leases layout so a --owned-root of ~/.claude/router resolves the same store the hot path reads; tmpdir fixtures resolve the same way"
  - "Lease modules deploy via the existing moduleValues flatMap — no custom deploy path added (Pitfall 6 / T-39-03 backstop)"
  - "Out-of-enum statuses (stale/unauthorized/corrupt) are covered by the INVALID set check on lease.status — a tampered record with an out-of-enum status is still silent, never auto-runs"
metrics:
  duration: ~21min
  completed: 2026-08-07
actuals:
  tokens: 33400   # chars/4 over the realized diff (briefing.mjs + tests + lifecycle + CLI)
  tasks: 3
  commits: 6
status: complete
---

# Phase 40 Plan 03: Continuity Briefing + Dual-Runtime Deploy + Leases CLI Summary

Built the LEASE-06 continuity briefing composer (first-visit silent, one evidence-backed briefing on return, eight invalid states silent), deployed all four lease modules to both Claude + Codex runtimes via the lifecycle bundle (T-39-03 regression backstop), and exposed the `router-control leases { inspect, show, revoke }` CLI (LEASE-03/04 operator surface). This closes Phase 40.

## What Was Built

**Task 1 — LEASE-06 continuity briefing composer:**

- **`src/lease/briefing.mjs`** — `BRIEFING_POLICY_VERSION = 'briefing-policy-v1'` and `composeBriefing({ projectFingerprint, leaseStore, now })`. Pure w.r.t. its inputs (no fs/os import — the lease store arrives as an argument); wrapped in a single try/catch so a store error never escapes and never blocks a prompt (fail-open). The `INVALID` set is `Object.freeze(['completed','blocked','expired','revoked','corrupt','stale','unauthorized','foreign'])`.
  - First visit (no lease for fingerprint) → `null` (the defining LEASE-06 case).
  - Active + non-expired + fingerprint-matching → `{ briefing:true, lease_id, evidence: lease.last_safe_checkpoint, briefing_status:'active', policy_version }`. The evidence references receipt IDs (operator inspects via `router-control leases show <id>`); never inlines raw prompt text.
  - Eight invalid states: each maps to a distinct internal `briefing_status` (the status string) but ALL return `null`. `isExpired` true → `'expired'`; `fingerprint_match !== true` → `'foreign'`.
  - Any throw → `null` (fail-open).
- **`tests/router.lease-briefing.test.mjs`** (16 tests) — BRIEFING_POLICY_VERSION string, first-visit silent, active briefing, six explicit invalid-status cases (completed/blocked/revoked/expired-enum/expired-clock/foreign), corrupt store (bad JSON), stale/unauthorized/corrupt via direct file writes, all-eight-invalid-states backstop loop, throw path (monkey-patched findByFingerprint), no-raw-prompt-text gate.

**Task 2 — Dual-runtime deploy + lifecycle test bump (T-39-03 regression backstop):**

- **`src/lifecycle/router-lifecycle.mjs`** — added `'lease/identity.mjs', 'lease/store.mjs', 'lease/policy.mjs', 'lease/briefing.mjs'` to the `moduleNames` array in a commented Phase 40 block. No custom deploy path — the existing `moduleValues` flatMap over `[p.ownedRoot, p.codexOwnedRoot]` deploys all four modules to both `~/.claude/router/modules/lease/` and `~/.codex/router/modules/lease/`.
- **`tests/router.lifecycle.test.mjs`** — bumped the manifest.files.length assertion `263 → 279` (4 modules × 2 roots × 2 deploy paths = 16 new files). Added a per-runtime existence assertion for all 4 lease modules under both `claudeRoot` and `codexRoot`, and a stdlib-only assertion (no `node:http` / `node:net` / npm imports in any deployed lease module).

**Task 3 — `router-control leases` CLI (LEASE-03/04 operator surface):**

- **`src/cli/router-control.mjs`** — added a `leasesCommand({ root, positional })` and wired `command === 'leases'` into the dispatch (alongside `suggestion` and `context`, before the release-tuple authority block — leases is operator-only, not hot-path). Subcommands:
  - `inspect` — `readdirSync` the lease root, `readLease` each that parses, return `canonical('leases inspect', true, 'ok', { leases: [...5 summary fields] })`.
  - `show <id>` — `store.inspect(id)`; null → `lease_absent`; else the full 9-field inspection result + `is_expired`/`is_revoked`.
  - `revoke <id>` — `store.setStatus(id, 'revoked')`; absent → `lease_absent`; else `canonical('leases revoke', true, 'ok', { lease_id, status:'revoked' })`. A follow-up `show` confirms the durable transition.
  - No subcommand → `invalid_arguments`. The store is rooted at `join(root, 'leases')` (mirrors `defaultLeaseRoot`). A thrown factory returns `lease_module_unavailable` (fail-open). Usage string updated.
- **`tests/router.control-cli.test.mjs`** — 8 new tests: empty-store inspect, one-lease inspect (5 summary fields), show all 9 fields + booleans, show missing → lease_absent, revoke → revoked + follow-up show confirms, revoke missing → lease_absent, no-subcommand → invalid_arguments, no-raw-prompt-text gate.

## Requirements Covered

- **LEASE-06** — First Router visit is silent (no lease record for the fingerprint → null). A returning project receives at most one evidence-backed briefing, and only for an active, non-expired, non-revoked, fingerprint-matching lease. The eight invalid states (completed/blocked/expired/revoked/corrupt/stale/unauthorized/foreign) never auto-run and never emit a briefing. Proven by `tests/router.lease-briefing.test.mjs` (16 tests).
- **LEASE-03/04 (operator surface)** — `router-control leases { inspect, show <id>, revoke <id> }` lets the operator list leases, inspect a single lease's 9 fields, and revoke a lease durably. Missing lease → `lease_absent`; no subcommand → `invalid_arguments`. Proven by `tests/router.control-cli.test.mjs` (8 new tests).

## TDD Gate Compliance

Per-task RED → GREEN cycle verified in git log:

| Task | RED commit | GREEN commit |
| ---- | ---------- | ------------ |
| 1 (briefing) | `1f09421` test(40-03): add failing lease briefing composer tests (RED) | `9ef4546` feat(40-03): continuity briefing composer (GREEN) |
| 2 (deploy) | `59b5307` test(40-03): bump lifecycle module count + lease dual-runtime assertions (RED) | `e69e7e0` feat(40-03): deploy 4 lease modules to both runtimes (GREEN) |
| 3 (CLI) | `c5721f5` test(40-03): add failing router-control leases CLI tests (RED) | `88a68fd` feat(40-03): router-control leases CLI (GREEN) |

All three RED commits ran tests that failed before implementation existed; all three GREEN commits ran tests that passed after implementation. No REFACTOR gate needed — code is already minimal.

## Deviations from Plan

None — plan executed as written.

## Verification Evidence

- `rtk node --test tests/router.lease-briefing.test.mjs tests/router.lifecycle.test.mjs tests/router.control-cli.test.mjs` → 62/62 pass.
- `rtk node --test tests/router.lease-identity.test.mjs tests/router.lease-creation.test.mjs tests/router.lease-inspect.test.mjs tests/router.lease-revoke.test.mjs tests/router.lease-resume.test.mjs` → 48/48 pass (Plans 01/02 regression).
- `rtk node --test tests/router.authority.test.mjs tests/router.authority-policy.test.mjs tests/router.authority-gate.test.mjs` → 39/39 pass (Phase 39 regression).
- `rtk node --test tests/router.perf.test.mjs` → 5/5 pass (warm p95 ≤25ms / hard max <100ms — no regression; briefing runs on the startup path, not the per-prompt hot path).
- Full-suite gate (`rtk node --test tests/*.test.mjs`): the plan-specific suites listed above are all green. The broader full-suite run has pre-existing flaky failures under parallel execution (reinstall/uninstall/SAF-03/six-recommendation/dual-runtime) that are present at baseline `e2636c6` before any 40-03 work and pass in isolation — they are parallelism/isolation collisions, not caused by this plan. Logged to `deferred-items.md` per the executor scope-boundary rule.
- Grep gate: no `node:http` / `node:net` / npm imports in `src/lease/briefing.mjs` — stdlib only (no imports at all — pure function over its arguments).
- Grep gate: no hardcoded `/Users/guilherme` in `src/lease/briefing.mjs` or the CLI `leasesCommand` — uses the resolved `--owned-root`.
- Grep gate: `src/lease/briefing.mjs` does not inline raw prompt text — the evidence field is the `last_safe_checkpoint` object referencing receipt IDs.

## Threat Surface

No new trust-boundary surface beyond what the plan's `<threat_model>` already covers. All five mitigated threats are addressed:

- **T-40-09** (elevation of privilege): first-visit silent; eight invalid states each return null; briefing requires active + non-expired + fingerprint-match. Test asserts all 8 invalid states + first-visit null + throw → null.
- **T-40-10** (information disclosure): briefing references receipt IDs only (no raw prompt, no full receipt bodies); CLI shows the structured goal label + 9 fields, never raw prompt. Test asserts `doesNotMatch(/prompt/i)` on both briefing payload and CLI inspect output.
- **T-40-11** (tampering): `revoke` uses the existing `setStatus` durable atomic write; missing lease → `lease_absent`; CLI is operator-only, not hot-path.
- **T-40-12** (tampering): 4 lease modules added to `moduleNames`; `moduleValues` flatMap deploys to both runtimes; lifecycle test count bump 263→279 is the regression backstop; test asserts `existsSync` for each of the 4 modules under both `ownedRoot` and `codexOwnedRoot` (Pitfall 6 / T-39-03).
- **T-40-SC** (stdlib-only): no package installs attempted.

## Known Stubs

None.

## Self-Check: PASSED

- All 4 created files exist on disk (verified via `[ -f path ]`): `src/lease/briefing.mjs`, `tests/router.lease-briefing.test.mjs`, `deferred-items.md`, plus the 2 modified source files and 2 modified test files.
- All 6 per-task commits (3 RED + 3 GREEN) exist in `git log --oneline`.
- 62/62 plan tests pass; 48/48 Plan 01/02 regression tests pass; 39/39 Phase 39 regression tests pass; 5/5 perf tests pass.
