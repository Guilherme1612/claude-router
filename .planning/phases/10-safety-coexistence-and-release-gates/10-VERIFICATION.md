---
phase: 10-safety-coexistence-and-release-gates
verified: 2026-07-14T12:00:00+01:00
status: passed
score: 8/8
gaps: []
human_verification: []
---

# Phase 10: Safety, Coexistence, and Release Gates — Verification

## Goal

Verify that the expanded router control layer preserves fail-open behavior, sub-100ms warm routing, local-only classification, missing-MCP safety, hook coexistence, operator/hot-path separation, focused test coverage, privacy, and calibration gates before v1.1 ships.

## Release decision

Release decision: PASS

All eight SAF requirements and all five ROADMAP success criteria are verified against the deployed hook and fresh test runs. No blocker, warning, override, or human-only verification item remains.

## Observable truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | SAF-01: hot-path routing fails open on malformed input and internal exceptions. | VERIFIED | `tests/router.safety-release.test.mjs:145-165` exercises malformed, missing, non-string, whitespace, and forced-throw inputs and rejects blocking exits/decisions. Fresh hot-path bundle passed 33/33. |
| 2 | SAF-02: warm and evolved routing remain below 100ms. | VERIFIED | `tests/router.safety-release.test.mjs:266-299` enforces wall-clock and self-reported latency for five warm runs and an evolved worker-trigger transition. Fresh hot-path bundle passed 33/33. |
| 3 | SAF-03: no per-prompt external LLM/API classifier exists. | VERIFIED | `tests/router.safety-release.test.mjs:193-219` scans the live hook, local evolution worker, and calibration entrypoint for network/hosted-model/classifier paths and restricts child-process use to the local detached worker. |
| 4 | SAF-04: missing-MCP agents are diagnostic/warn-only and never auto-dispatched. | VERIFIED | `tests/router.safety-release.test.mjs:240-264` checks live doctor/routes data: blocked agents have `routeability: blocked`, are absent from agent dispatch targets, and warn routes have no recommended agents or dispatch wording. Focused coexistence bundle passed 36/36. |
| 5 | SAF-05: router, caveman, GSD, context-mode, and ralph-loop coexist. | VERIFIED | `tests/router.safety-release.test.mjs:168-191` parses live settings and checks the deployed hook plus enabled coexistence surfaces; coexistence/settings tests additionally verify sentinel separation and live smoke routing. Focused coexistence bundle passed 36/36. |
| 6 | SAF-06: operator tooling remains outside the prompt hot path and privacy-safe. | VERIFIED | `tests/router.safety-release.test.mjs:101-126` executes all nine operator JSON surfaces; `:221-238` proves operator helpers are owned by `runCli(args)`, not `main(payload)`. Privacy/operator bundle passed 36/36. |
| 7 | SAF-07: new commands and routing behavior have focused tests. | VERIFIED | `tests/router.safety-release.test.mjs:29-79` maps SAF-01..SAF-08 to existing executable test files; live CLI smoke covers inspect, preview, explain-last, doctor, routes, unmapped, coverage, proposals, and evolution status. Full suite passed 377/377. |
| 8 | SAF-08: calibration gates remain enforced with expanded fixtures. | VERIFIED | `router.calibrate.mjs:270-285` validates fixture-group counts and computes the locked combined gate; `:377-407` enforces combined threshold, original preservation, and codebase target. Fresh calibration passed 29/30: original 10/10, codebase 8/8, evolution 2/3, combined threshold 21. |

## ROADMAP success criteria

| Criterion | Status | Evidence |
|---|---|---|
| Fail-open and <100ms warm routing remain intact. | VERIFIED | Truths 1-2; fresh 33/33 hot-path bundle. |
| No per-prompt external classifier is introduced. | VERIFIED | Truth 3; static source boundary plus local-worker exception contract. |
| Missing-MCP agents warn or diagnose without auto-dispatch. | VERIFIED | Truth 4; live doctor/routes assertions and focused route-target tests. |
| Existing coexistence surfaces remain functional. | VERIFIED | Truth 5; live settings, doctor, route smoke, sentinel, and ralph-loop safeguards. |
| Focused/full tests and calibration gates pass. | VERIFIED | Truths 6-8; fresh focused bundles, 377/377 full suite, and calibration exit 0. |

## Fresh command evidence

| Command | Result |
|---|---|
| `node --test tests/router.failopen.test.mjs tests/router.perf.test.mjs tests/router.perf-evolved.test.mjs tests/router.safety-release.test.mjs` | PASS, 33/33 |
| `node --test tests/router.coexistence.test.mjs tests/router.settings-diff.test.mjs tests/router.direct-agent-warn.test.mjs tests/router.route-targets.test.mjs tests/router.health.test.mjs` | PASS, 36/36 |
| `node --test tests/router.privacy.test.mjs tests/router.telemetry.test.mjs tests/router.inspect.test.mjs tests/router.evolve-proposal.test.mjs tests/router.evolution-visibility.test.mjs` | PASS, 36/36 |
| `node --test tests/*.test.mjs` | PASS, 377/377 |
| `node router.calibrate.mjs` | PASS, 29/30 combined (threshold 21) |

## Calibration contract decision

- Original 10: 10/10 preserved.
- Codebase target: 8/8; executable minimum remains 5/7.
- Evolution subset: 2/3; the combined formula requires at least one evolution success.
- Combined: 29/30 against threshold 21.

## Result

VERIFICATION PASSED — Phase 10 goal achieved, score 8/8.
