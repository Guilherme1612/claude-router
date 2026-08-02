---
phase: 32
reviewers: [codex]
reviewed_at: 2026-08-01T17:06:05
plans_reviewed: [32-01-PLAN.md, 32-02-PLAN.md, 32-03-PLAN.md, 32-04-PLAN.md]
---

# Cross-AI Plan Review — Phase 32

## Consensus Summary

Only one external reviewer (Codex) ran with repo access — the Cursor lane was dropped at invocation: its
agent returned a plan-billing error (`ActionRequiredError: Named models unavailable Free plans can only
use Auto`), captured in the lane stub, so no Cursor verdict is counted. All conclusions below rest on the
single grounded Codex review.

### Agreed Strengths

- Guard-hole coverage correctly identifies all three relevant validation sites (`tests/router.mjs.snapshot:870-881`, `:971-973`, plus `src/coverage/audit.mjs:138-164`).
- Resolver is framework-neutral — candidates come purely from `entry.mode` + `entry.resolve`, no framework-prefix matcher (`tests/router.mjs.snapshot:739-783`).
- Fail-open is explicit in the resolver (`tests/router.mjs.snapshot:739-742`, `:798-799`).
- Cross-runtime fixtures cover both active-runtime filtering and local-equivalent resolution (`tests/router.phase32-cross-runtime.test.mjs:113-169`).
- Mirror-lockstep (snapshot == deployable hook) treated as a first-class constraint.

### Agreed Concerns

(Only one reviewer — these are that reviewer's findings, highest priority first.)

1. **HIGH — Plans are stale against the live tree.** Phase-32 implementation artifacts already exist and the targeted suite passes 43/43. The Wave-0 "RED" premise no longer holds; executing the plans as written would duplicate completed work and invalidate their TDD acceptance criteria.
2. **HIGH — Production route path does not actually call `resolveSlashRoute`.** `inspectDecision()` builds a route directly from `mmEntry` at `tests/router.mjs.snapshot:3015-3031` then applies guards at `:3035-3042`; the resolver feeds validation/exported probes, not the emitted suggestion.
3. **HIGH — Runtime parity can be bypassed on the hot path.** `resolveSlashRoute()` trusts `manifestOrIndexes.commands` when handed an index, and `buildTargetIndexes()` builds one flat `commands` set ignoring `runtime_commands` (`tests/router.mjs.snapshot:743-747`, `:710-724`) — so validation can evaluate against the wrong runtime inventory.
4. **HIGH — Tie-lint is not wired as a CI/build gate.** `scripts/resolve-tie-lint.mjs` exists and is unit-tested, but `build-manifest.mjs:597` runs `auditCoverage()` with no tie-lint invocation; the "CI gate" requirement is not achieved.
5. **MEDIUM — Audit may over-report advisory alternatives.** `src/coverage/audit.mjs:157-166` reports every absent `resolve` member even when another candidate resolves; plan doesn't define absent alternatives as error vs warning vs quarantine-nonblocking.
6. **MEDIUM — Resolver ordering contract underspecified.** Implementation sorts weight-then-lexicographic name (`tests/router.mjs.snapshot:778-781`); plan says "stable sort" — equal-weight candidates don't preserve declared resolve-list order.
7. **MEDIUM — 32-04 perf test measures the helper, not the router hot path.** It calls `m.resolveSlashRoute()` directly (`tests/router.perf.test.mjs:82-108`), not manifest load + scoring + cache + guards + render, so it cannot substantiate end-to-end <40ms/<100ms.
8. **LOW — Plans edit external home dirs** (`~/.claude/hooks/router.mjs`, `~/.claude/router/mode-map.json`) outside the writable repo root without an install/deploy step or test seam.

### Divergent Views

None — a single reviewer ran; no cross-reviewer disagreement to resolve.

---

## Codex Review

# Summary

The plans cover the intended requirements and have strong fixture-driven thinking, but they are materially stale against the live tree. Phase-32 implementation artifacts already exist and the targeted suite passes 43/43 tests. The largest risks are that the planned “RED” wave is no longer RED, the actual production hot path does not consume `resolveSlashRoute`, runtime-specific presence is bypassed when indexes are passed, and the tie-lint is not wired into the manifest-build/release gate.

# Strengths

- Guard-hole coverage correctly identifies all relevant validation paths:
  - `tests/router.mjs.snapshot:870-881`
  - `tests/router.mjs.snapshot:971-973`
  - `src/coverage/audit.mjs:138-164`

- The resolver is framework-neutral: candidates come from `entry.mode` and `entry.resolve`, with no framework-prefix matcher (`tests/router.mjs.snapshot:739-783`).

- Fail-open behavior is explicit in the resolver (`tests/router.mjs.snapshot:739-742`, `tests/router.mjs.snapshot:798-799`).

- Cross-runtime fixtures test both active-runtime filtering and local-equivalent resolution (`tests/router.phase32-cross-runtime.test.mjs:113-169`).

- Mirror-lockstep is treated as a first-class constraint, consistent with the project’s deployable-hook architecture.

# Concerns

- **HIGH — Plan 32-01’s RED premise is false.** The live hook already exports `resolveSlashRoute`, generic fallback behavior, tie handling, provenance, and guard closure (`tests/router.mjs.snapshot:727-805`). The targeted Phase-32 suite currently passes 43/43. Executing the plan as written would duplicate completed work and invalidate its TDD acceptance criteria.

- **HIGH — The production route path does not actually call `resolveSlashRoute`.** `inspectDecision()` constructs a route directly from `mmEntry` at `tests/router.mjs.snapshot:3015-3031`, then sends it through `applyGuards()` at `tests/router.mjs.snapshot:3035-3042`. The resolver is used in validation and exported probes, but the plan’s claim that it feeds the emitted suggestion is not demonstrated by the live call path.

- **HIGH — Runtime parity can be bypassed on the hot path.** `resolveSlashRoute()` uses runtime-specific `runtime_commands` only when given a raw manifest; when given an index object it trusts `manifestOrIndexes.commands` directly (`tests/router.mjs.snapshot:743-747`). `buildTargetIndexes()` itself only builds one flat `commands` set and ignores `runtime_commands` (`tests/router.mjs.snapshot:710-724`). Consequently, `validateRouteTargets()` and `routeTargetsExist()` can evaluate against the wrong runtime inventory.

- **HIGH — Tie-lint is not a real CI/build gate.** The script exists and is unit-tested (`scripts/resolve-tie-lint.mjs:53-111`), but repository integration only references it from its own test file. `build-manifest.mjs` invokes `auditCoverage()` (`build-manifest.mjs:597`) and has strict coverage handling, but no tie-lint invocation is wired into that build path. The plan’s “CI gate” requirement is therefore not achieved.

- **MEDIUM — Audit semantics may over-report advisory alternatives.** `src/coverage/audit.mjs:157-166` reports every absent `resolve` member, even when another candidate resolves successfully. This can make a valid route fail strict coverage because an optional fallback is unavailable. The plan does not define whether absent alternatives are errors, warnings, or quarantined-but-nonblocking diagnostics.

- **MEDIUM — The resolver’s ordering contract is underspecified and potentially inconsistent.** The implementation sorts by weight and then lexicographic name (`tests/router.mjs.snapshot:778-781`), while the plan says “stable sort.” Equal-weight candidates therefore do not preserve declared resolve-list order, which conflicts with ranked-list semantics.

- **MEDIUM — Plan 32-04’s performance test measures the helper, not the router hot path.** The test directly calls `m.resolveSlashRoute()` (`tests/router.perf.test.mjs:82-108`). It does not exercise manifest loading, scoring, cache lookup, guard application, route rendering, or injection. It cannot substantiate the stated end-to-end `<40ms`/`<100ms` claim.

- **LOW — External home-directory edits violate the stated workspace boundary.** Plans directly modify `/Users/guilherme/.claude/hooks/router.mjs` and `~/.claude/router/mode-map.json`, while the repository is the writable project root. The plans need an explicit deployment/install step or a test seam instead of assuming autonomous write access.

# Suggestions

- Re-baseline the phase from live state before execution. Mark existing implementation/tests as completed and create only corrective plans for the remaining gaps.

- Add an integration test that drives the real `inspectDecision()`/hook entrypoint with runtime-specific manifests and verifies the emitted `additionalContext`, not only direct resolver output.

- Make runtime identity part of `buildTargetIndexes()` or pass the raw manifest into every resolve check. Ensure `routeTargetsExist()` cannot silently use a flat cross-runtime command set.

- Wire `lintModeMap()` into `build-manifest.mjs --strict-coverage` or the release verifier, with deterministic non-zero failure behavior and a fixture proving the gate runs.

- Define diagnostic severity for absent fallback candidates. A stale primary target should block; an absent optional fallback may be warning/quarantine-only unless the requirement explicitly demands strict failure.

- Preserve resolve-list declaration order for equal weights, and test that behavior.

- Replace the helper-only perf test with an end-to-end subprocess fixture that reaches route selection and rendering, while retaining the cheap helper benchmark separately.

# Risk Assessment

**Overall: HIGH.** The plans are conceptually aligned and the current focused tests are green, but they do not accurately describe the current repository state and leave production-path integration, runtime isolation, CI enforcement, and end-to-end performance insufficiently proven.

---

## Cursor Review

Lane dropped at invocation — no verbose review produced. Captured stderr:

```
cursor review failed or returned empty output. stderr:
ActionRequiredError: Named models unavailable Free plans can only use Auto. Switch to Auto or upgrade plans to continue.
```

The Cursor account's free plan is limited to the Auto model; the review lane's model selection was rejected.
No Cursor verdict is counted in the consensus above. To include Cursor in a future run, set the account/model
so a permitted selection is used, then re-run `/gsd-review --phase 32 --cursor`.
