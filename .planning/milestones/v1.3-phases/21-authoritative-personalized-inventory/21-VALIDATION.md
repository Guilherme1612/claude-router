---
phase: 21
slug: authoritative-personalized-inventory
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-26
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node built-in `node:test` |
| **Config file** | none |
| **Quick run command** | `rtk node --test tests/router.adapters.test.mjs tests/router.registry-schema.test.mjs tests/router.registry-diff.test.mjs tests/router.registry-reconcile.test.mjs tests/router.registry-watcher.test.mjs` |
| **Full suite command** | `rtk node --test tests/*.test.mjs` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run the focused test file(s) owning the edited seam.
- **After every plan wave:** Run the quick suite plus all new `tests/router.inventory-*.test.mjs` files.
- **Before `$gsd-verify-work`:** Run `rtk node --test tests/*.test.mjs` plus the deterministic repeated portability matrix owned by 21-02 Task 2; both must be green.
- **Max feedback latency:** 30 seconds for the quick suite.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 21-01-01 | 21-01 | 1 | DISC-02 | T-21-01 | Schema RED contracts prove explicit lifecycle/dispatchability and inert unknown records | unit/RED | `rtk node -e "const {spawnSync}=require('node:child_process');const r=spawnSync(process.execPath,['--test','tests/router.registry-schema.test.mjs'],{encoding:'utf8'});const out=(r.stdout||'')+(r.stderr||'');const failed=[...out.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map(m=>m[1]);process.exit(r.status!==0&&failed.length>0&&failed.every(name=>name.includes('[phase21-red:schema]'))?0:1)"` | ✅ extend + fixture create | ⬜ planned |
| 21-01-02 | 21-01 | 1 | DISC-02 | T-21-01 | Normalized schema implementation satisfies all schema and build contracts | unit/GREEN | `rtk node --test tests/router.registry-schema.test.mjs tests/router.registry-build.test.mjs` | ✅ owned by 21-01-01 | ⬜ planned |
| 21-02-01 | 21-02 | 2 | DISC-01, DISC-07, DISC-08 | T-21-04 | Discovery RED matrix is confined to authorized roots and retains inert unknown types | integration/RED | `rtk node -e "const {spawnSync}=require('node:child_process');const r=spawnSync(process.execPath,['--test','tests/router.adapters.test.mjs','tests/router.inventory-portability.test.mjs'],{encoding:'utf8'});const out=(r.stdout||'')+(r.stderr||'');const failed=[...out.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map(m=>m[1]);process.exit(r.status!==0&&failed.length>0&&failed.every(name=>name.includes('[phase21-red:discovery]'))?0:1)"` | ✅ adapter extend + portability create | ⬜ planned |
| 21-02-02 | 21-02 | 2 | DISC-01, DISC-07, DISC-08 | T-21-04 | Adapter and fingerprint implementation passes portability, containment, and diff checks | integration/GREEN | `rtk node --test tests/router.adapters.test.mjs tests/router.inventory-portability.test.mjs tests/router.registry-diff.test.mjs` | ✅ owned by 21-02-01 | ⬜ planned |
| 21-03-01 | 21-03 | 2 | DISC-03, DISC-05 | T-21-08 | Mutation RED matrix specifies exact continuity and transitive invalidation | integration/RED | `rtk node -e "const {spawnSync}=require('node:child_process');const r=spawnSync(process.execPath,['--test','tests/router.registry-diff.test.mjs','tests/router.registry-reconcile.test.mjs','tests/router.inventory-mutations.test.mjs'],{encoding:'utf8'});const out=(r.stdout||'')+(r.stderr||'');const failed=[...out.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map(m=>m[1]);process.exit(r.status!==0&&failed.length>0&&failed.every(name=>name.includes('[phase21-red:mutation]'))?0:1)"` | ✅ existing extends + mutations create | ⬜ planned |
| 21-03-02 | 21-03 | 2 | DISC-03, DISC-05 | T-21-08 | Diff/reconcile implementation passes atomic mutation and callback-order checks | integration/GREEN | `rtk node --test tests/router.registry-diff.test.mjs tests/router.registry-reconcile.test.mjs tests/router.inventory-mutations.test.mjs` | ✅ owned by 21-03-01 | ⬜ planned |
| 21-04-01 | 21-04 | 3 | DISC-04 | T-21-12 | Convergence RED matrix specifies event permutations and last-complete retention | property/RED | `rtk node -e "const {spawnSync}=require('node:child_process');const r=spawnSync(process.execPath,['--test','tests/router.registry-watcher.test.mjs','tests/router.inventory-convergence.test.mjs'],{encoding:'utf8'});const out=(r.stdout||'')+(r.stderr||'');const failed=[...out.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map(m=>m[1]);process.exit(r.status!==0&&failed.length>0&&failed.every(name=>name.includes('[phase21-red:convergence]'))?0:1)"` | ✅ watcher extend + convergence create | ⬜ planned |
| 21-04-02 | 21-04 | 3 | DISC-04 | T-21-12 | Watcher/build implementation converges and gates activation on complete snapshots | property/GREEN | `rtk node --test tests/router.registry-build.test.mjs tests/router.registry-watcher.test.mjs tests/router.inventory-convergence.test.mjs tests/router.registry-activation.test.mjs` | ✅ owned by 21-04-01 | ⬜ planned |
| 21-05-01 | 21-05 | 4 | DISC-06, DISC-08 | T-21-16 | Inspection RED contracts cover semantic gaps, CLI parity, and disclosure attacks | security/RED | `rtk node -e "const {spawnSync}=require('node:child_process');const r=spawnSync(process.execPath,['--test','tests/router.inventory-gaps.test.mjs','tests/router.inventory-security.test.mjs','tests/router.control-cli.test.mjs'],{encoding:'utf8'});const out=(r.stdout||'')+(r.stderr||'');const failed=[...out.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map(m=>m[1]);process.exit(r.status!==0&&failed.length>0&&failed.every(name=>name.includes('[phase21-red:inspection]'))?0:1)"` | ✅ CLI extend + gaps/security create | ⬜ planned |
| 21-05-02 | 21-05 | 4 | DISC-06, DISC-08 | T-21-16 | Read-only projections pass UI grammar, parity, semantic-gap, and redaction checks | security/GREEN | `rtk node --test tests/router.inventory-gaps.test.mjs tests/router.inventory-security.test.mjs tests/router.control-cli.test.mjs` | ✅ owned by 21-05-01 | ⬜ planned |

*Each RED task owns its missing/extended test file and uses a TAP-aware assertion harness that requires at least one exact marker-named `not ok` result and rejects any unrelated failing test. Its paired GREEN task immediately runs the same focused seam to completion, so no task or wave crosses an unsampled implementation boundary.*

---

## Wave 0 Requirements

- [x] `tests/router.inventory-portability.test.mjs` — creation and RED ownership assigned to 21-02-01; GREEN closure assigned to 21-02-02.
- [x] `tests/router.inventory-mutations.test.mjs` — creation and RED ownership assigned to 21-03-01; GREEN closure assigned to 21-03-02.
- [x] `tests/router.inventory-convergence.test.mjs` — creation and RED ownership assigned to 21-04-01; GREEN closure assigned to 21-04-02.
- [x] `tests/router.inventory-gaps.test.mjs` and `tests/router.inventory-security.test.mjs` — creation and RED ownership assigned to 21-05-01; GREEN closure assigned to 21-05-02.
- [x] Existing schema/adapter/diff/reconcile/watcher/CLI suites have exact extension owners in 21-01-01 through 21-05-01 and paired GREEN commands in the corresponding Task 2.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verification.
- [x] Sampling continuity: every RED task has a marker-aware assertion harness and every paired GREEN task reruns its focused seam.
- [x] Wave 0 ownership covers every created or extended test file.
- [x] No watch-mode flags.
- [x] Feedback latency target is under 30 seconds for focused and quick suites.
- [x] `nyquist_compliant: true` is set in frontmatter.

**Approval:** approved — executable ownership and commands reconciled to plans 21-01 through 21-05 on 2026-07-26.
