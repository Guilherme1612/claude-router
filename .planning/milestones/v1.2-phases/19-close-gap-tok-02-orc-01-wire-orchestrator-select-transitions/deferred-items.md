# Phase 19 Plan 02 — Deferred Items (Out of Scope)

## Expected test failures assigned to Plan 04

`node --test tests/router.compiled-index.test.mjs` — 5 of 12 tests fail because the
legacy fixtures use the pre-bump `schema_version: 1` pointer + a `CONTRACT` object
missing the two new `COMPILED_INDEX_COMPATIBILITY` members
(`orchestrator_contract_version`, `context_contract_version`). This is the
deliberate D-04 schema 1→2 invalidation; the plan explicitly assigns the fixture
churn to Plan 04 (Wave 0).

Failing tests:

1. `bounded loader accepts a verified compatible active projection` — fixture
   uses `CONTRACT` (no new members) → `compatible()` rejects → `blocked()`.
2. `invalid active state selects only an explicit verified compatible known-good version` —
   same `CONTRACT` fixture issue.
3. `live contextual routing consumes the verified projection and selected fresh capsule` —
   same `CONTRACT` fixture issue (routeContextPrompt falls through to blocked).
4. `explicit override and stale capsule semantics remain stable behind compiled validation` —
   same `CONTRACT` fixture issue.
5. `hot path observes only explicitly addressed pointer metadata payload and capsule paths` —
   same `CONTRACT` fixture issue; also the hot-path assertion enumerates exactly
   the pre-bump read set (no sibling reads), which Plan 03 may extend.

Plan 04's Wave 0 audit (per `19-VALIDATION.md`) updates these fixtures to
schema 2 with the extended compatibility object and (if needed) sibling files.
**Do NOT fix here** — they are out of scope per the plan's `<verification>` note:
"Full suite is NOT expected green yet (fixture churn in Plan 04); only the
directly-touched + orchestrator suites must pass."