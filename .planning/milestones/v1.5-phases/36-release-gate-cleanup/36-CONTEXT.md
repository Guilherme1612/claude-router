---
phase: 36-release-gate-cleanup
milestone: v1.5
status: ready
---

# Phase 36 Context

## Goal

Close the release truth gap after the feature phases: prove the assembled router from a fresh real home, prove cold-start defaults and teardown hygiene, and reconcile the carried v1.4 maintenance debt without weakening existing safety gates.

## Constraints

- Preserve unrelated dirty-worktree files.
- Keep the installer stdlib-only and deploy every runtime dependency of the manifest builder.
- A focused test run is evidence for its scope only; release completion requires the live-install, baseline, and debt checks below.
- Do not relax calibration or coverage thresholds to make a stale corpus green.

## Required evidence

1. Fresh-home live install and lifecycle readiness for Claude and Codex, including cold-start defaults.
2. No watcher/controller process or owned-root artifact remains after teardown.
3. Existing release and safety suites pass without simulated-only substitutions.
4. Reverse-gap baseline remains exactly 210 valid `expected_bm25_only` records; threshold sensitivity is rerun and recorded; operator-shell activation is explicitly observed or marked unavailable.
5. Full baseline and all v1.5 focused suites are run from the final tree.

## Known starting evidence

- Installer fresh install failed because the deployed builder lacked `scripts/resolve-tie-lint.mjs`; the source builder succeeded standalone.
- Current calibration corpus reports 47/58, original 9/10, codebase 4/8. This is a pre-existing live-corpus failure and must be diagnosed, not hidden.
