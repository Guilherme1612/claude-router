# Phase 26 Cross-Phase Integration Audit

Status: **BROKEN**

Date: 2026-07-28

## Wiring Summary

**Connected:** 8 expected cross-phase connections  
**Orphaned:** 0 key Phase 26 exports  
**Missing/broken:** 2 release-critical connections

## Connected Paths

1. `buildFullRegistry` supplies registry, contracts, relationships, intent policy, workflows, health policy, and suggestion reference to `publishCompiledIndex`.
2. `publishCompiledIndex` writes immutable tuple members and manifest, validates them with `loadCompiledIndex`, then replaces `release-tuples/active.json`.
3. `routeContextPrompt` loads the projection through `loadCompiledIndex({ projectionOnly: true })`; v1.3 tuples suppress the legacy capsule writes.
4. `reconcileCandidate` emits all eight invalidation classes and their transitive references; full and incremental builders converge at the complete tuple publication boundary.
5. Tuple reload failure restores `release-tuples/known-good.json`; controller restart calls `recoverReleaseTuple`.
6. Missing, stale, and mismatched approval stop before activation; malformed suggestion data suppresses advice without changing routing.
7. Temporary installed Claude and Codex roots execute copied module bytes for all six recommendation kinds.
8. The v1.3 release runner executes the focused, lifecycle, compatibility, authority, regression, and isolated latency stages and rejects missing, skipped, failing, stale, or over-budget child evidence.

Focused integration evidence: `node --test --test-concurrency=1 tests/router.phase26-*.test.mjs` passed **26/26**. The isolated fixture reported 312 records, 240 samples, warm p95 0.636 ms, max 0.798 ms, 194 context bytes, and 65 estimated tokens.

## Detailed Findings

### BLOCKER 1 — Canary promotion can expose a mixed registry/tuple state

Affected requirements: **REL-03, REL-05, REL-08, REL-09**

`applyCanaryDecision` calls `activateCandidate` before returning `promoted` (`src/evolution/canary-controller.mjs:245-254`). The watcher then publishes the complete tuple afterward (`src/registry/watcher.mjs:666-678`). Unlike the bootstrap branch, this canary branch has no catch-and-rollback around `publishIndex`.

If tuple construction, a member write, manifest write, validation, or pointer replacement fails after canary promotion, the registry active pointer has already changed while the prompt tuple remains old. The error escapes without restoring the prior registry version. Existing lifecycle tests inject failures directly into `publishCompiledIndex`; they do not exercise the production `applyCanaryDecision -> activateCandidate -> publishCompiledIndex` order.

Expected connection: verifier + canary decision -> construct/validate complete tuple -> atomically grant authority, or roll registry activation back on every tuple-publication failure.

### BLOCKER 2 — The release gate does not verify the live Claude and Codex installations

Affected requirements: **REL-05, REL-06, REL-07**

The compatibility stage runs `router.phase26-dual-runtime.test.mjs`, whose roots are created with `mkdtempSync`, `testMode: true`, stub verification runners, and an in-process controller (`tests/router.phase26-dual-runtime.test.mjs:14-24,32-59`). The performance gate uses the same temporary/test-mode installation pattern. This proves installer output and copied-module behavior, but not the currently activated user installations.

Live inspection found:

- Claude and Codex `UserPromptSubmit` hooks are configured.
- Deployed Phase 26 source hashes differ from the repository in both runtimes.
- Codex has no `release-tuples/active.json` or `known-good.json`.
- Codex lacks deployed `modules/registry/contract.mjs` and `modules/lifecycle/router-lifecycle.mjs`.
- Claude has schema-2 active and known-good pointers, but its deployed prompt module is not byte-identical to the Phase 26 source.

The release matrix has no live-install/activation stage (`release/v1.3-matrix.json:28-80`), so a v1.3 report can pass while the actual Claude/Codex installations remain stale or incomplete.

Expected connection: release runner -> non-mutating live install manifest/module/pointer verification for both configured runtimes -> block release when deployed closure or active tuple is missing/stale. Actual upgrade/activation remains an explicit lifecycle action.

### WARNING — Performance evidence measures installed modules in-process, not hook process latency

Affected requirement: **REL-07**

The 312-record benchmark is deterministic, covers both runtimes and all six kinds, and routes through copied installed modules. Timing calls `routeContextPrompt` in-process, so it excludes Node startup, hook JSON I/O, and host hook dispatch. This is valid core hot-path evidence but should not be described as measured end-to-end live hook latency.

## API/Auth Coverage

Not applicable: Phase 26 exposes local CLI/hook/module contracts, not HTTP APIs or authenticated web routes.

## E2E Flows

| Flow | Status | Evidence / break |
|---|---|---|
| Background build -> complete immutable tuple -> prompt read | WIRED | Production builder/publisher/loader/router chain; focused tests pass |
| Eight-class change -> invalidation -> full/incremental convergence | WIRED | Reconciler descriptors feed canonical complete tuple identity |
| Verification -> canary -> activation -> tuple publication | BROKEN | Registry activation precedes tuple publication without rollback on publication failure |
| Tuple reload failure -> known-good -> restart recovery | WIRED | Publisher fallback and lifecycle recovery use the same complete-tuple pointer |
| Approval denial -> no write | WIRED | Missing/stale/mismatched approval preserves owned bytes |
| Suggestion corruption -> normal routing | WIRED | Advice is optional and fail-open; known-good routing remains authoritative |
| Fresh temporary Claude/Codex install -> six recommendation kinds | WIRED | Real copied module bytes under test roots, 18-cell matrix |
| Repository release -> current live Claude/Codex activation | BROKEN | Release matrix never inspects live installed closure or tuple pointers |
| Large temporary installed registry -> latency/context budgets | WIRED | 312 records and strict thresholds; in-process scope only |

## Requirements Integration Map

| Requirement | Integration path | Status | Issue |
|---|---|---|---|
| REL-01 | complete tuple -> projection-only loader -> prompt route | WIRED | — |
| REL-02 | background registry build -> every tuple projection -> publisher | WIRED | — |
| REL-03 | build outputs -> immutable tuple -> active pointer | PARTIAL | Canary registry activation can precede failed tuple publication |
| REL-04 | eight change classes -> transitive closure -> tuple identity | WIRED | — |
| REL-05 | verifier/canary -> activation -> publication -> LKG/recovery | BROKEN | No rollback when canary promotion succeeds and tuple publication fails; live activation is ungated |
| REL-06 | installer -> Claude/Codex copied modules -> six kinds | PARTIAL | Temporary installs pass; current live Codex closure is incomplete |
| REL-07 | installed fixture -> 12 cases -> route/context metrics -> release threshold | PARTIAL | Core in-process metric passes; no live hook-process measurement or deployment check |
| REL-08 | full/incremental equivalence -> pointer-last publication -> recovery | PARTIAL | Direct publisher failures are safe, but watcher canary ordering can leave mixed authority |
| REL-09 | approval/safety/verifier -> mutation; advice failure -> LKG | PARTIAL | Approval is preserved, but post-promotion publication failure is not rolled back |

**Requirements with no cross-phase wiring:** none.

## Required Remediation

1. Make canary promotion and complete-tuple publication one recoverable authority transition: publish before activation where compatible, or catch every post-promotion publication failure and restore the exact prior registry plus tuple pointers. Add a production-order integration test.
2. Add a read-only live-install verification stage for configured Claude and Codex roots, then explicitly run the normal installer/upgrade lifecycle to bring the live installations to the released generation before claiming actual activation.
