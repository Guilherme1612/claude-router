# Phase 41 Deferred Items

## Out-of-Scope Discoveries (Scope Boundary)

| Category | Item | Discovered At | Status |
|----------|------|---------------|--------|
| Pre-existing flaky test | router.lifecycle.test.mjs intermittently reports 1 failure on first run, passes on rerun (exit 0, 26/26) — subprocess-based lifecycle test, reproduces on baseline per MEMORY note | Plan 41-01 Task 1 tracer regression | Open (pre-existing, not caused by this plan) || Pre-existing flaky | tests/phase-38/recommendation-only.test.mjs:121 pause/resume parity test times out (state=paused) — reproduces on baseline before 41-02 changes | open | 41-02 |
