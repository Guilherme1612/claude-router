---
phase: 35-per-project-routing
verified: 2026-08-01
status: passed
score: 9/9 must-haves verified
behavior_unverified: 0
deferred:
  - "Existing release baseline debt remains for Phase 36; no Phase 35-specific behavior is unverified."
---

# Phase 35 Verification Report

## Goal Achievement

| Truth | Evidence | Status |
| --- | --- | --- |
| `.claude.json` absolute project keys discover project skills | builder and temporary-home e2e | VERIFIED |
| Explicit env roots remain additive | existing builder project test | VERIFIED |
| Project entries alter manifest fingerprint | project removal e2e | VERIFIED |
| Root and child cwd include project skills | project routing unit/e2e | VERIFIED |
| Sibling and prefix-collision cwd exclude project skills | project routing unit/e2e | VERIFIED |
| Prompt path uses no filesystem discovery | pure `buildCorpus` gate | VERIFIED |
| Outside-project routing cannot see project skills | e2e corpus assertion | VERIFIED |
| Existing router and hook mirror remain intact | 74-test core regression and snapshot diff | VERIFIED |
| Phase 33/34 integration remains green | 13-test calibration and 28-test observer regressions | VERIFIED |

## Commands

- `node --test tests/router.build-manifest.test.mjs tests/router.project-routing.test.mjs tests/router.project-routing.e2e.test.mjs tests/router.mjs.snapshot.diff.test.mjs` — 18/18 passed
- `node --test tests/router.auto-calibration.test.mjs tests/router.auto-calibration.lifecycle.test.mjs tests/router.auto-calibration.e2e.test.mjs tests/router.calibration-epoch.test.mjs` — 13/13 passed
- Cross-phase core suite — 74/74 passed
- `git diff --check` and snapshot `cmp` — passed

Phase 35 is complete. Only Phase 36 release-gate cleanup remains.

## Requirements Traceability

| Requirement | Evidence | Status |
| --- | --- | --- |
| PROJ-01 | Builder project-key fixture and temporary-install e2e | VERIFIED |
| PROJ-02 | Root, child, sibling, and prefix-collision corpus tests | VERIFIED |
| PROJ-03 | Add/remove project key changes manifest fingerprint | VERIFIED |
