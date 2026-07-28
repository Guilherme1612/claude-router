---
phase: 26
name: coherent-publication-and-dual-runtime-release
status: verified
asvs_level: 1
block_on: high
threats_open: 0
verified_at: 2026-07-28
---

# Phase 26 — Security

## Trust Boundaries

- Background discovery and reconciliation produce one canonical complete tuple.
- Tuple members cross the local-file boundary only through bounded, no-follow, hash-verified reads.
- Verifier, canary, and exact fresh approval gates precede activation and publication.
- One atomic pointer grants authority to an immutable tuple; verified known-good is the sole recovery authority.
- The prompt hook consumes one bounded precompiled projection and does not mutate state, call a model, use the network, or retain raw prompts.
- Installer-owned bytes cross Claude and Codex runtime roots through the ownership manifest and lifecycle controller.

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|---|---|---|---|---|---|---|
| T-26-01 | Tampering | mode-map stamping | high | mitigate | The shared build seam validates mode-map input, stamps only `mapping.explicit_subjects`, and leaves non-dispatchable warnings excluded (`src/registry/build.mjs:114-147,297-305`; `tests/router.registry-build.test.mjs`). | closed |
| T-26-02 | Repudiation | Wave 0 evidence | medium | mitigate | Phase-owned behavioral tests exercise production seams and the corrected registry build baseline is executable (`tests/router.registry-build.test.mjs`; `tests/router.phase26-tuple.test.mjs`; `tests/router.phase26-release.test.mjs`). | closed |
| T-26-03 | Tampering | tuple siblings/manifest | high | mitigate | Tuple identity derives from canonical member hashes; immutable 0600 writes precede exact manifest hashing and the atomic pointer rename (`src/registry/build.mjs:19-33`; `src/prompt/publish-index.mjs:16-32,171-244`; `src/prompt/compile-index.mjs:93-174`). | closed |
| T-26-04 | Denial of Service | prompt projection | high | mitigate | Loader and renderer enforce member, projection, byte, and context bounds; optional suggestion failure is suppressed without mutating or blocking verified routing (`src/prompt/compile-index.mjs:18-34,93-174`; `src/context/prompt-route.mjs:23-57,178-231`). | closed |
| T-26-05 | Elevation of Privilege | unverified tuple | critical | mitigate | Dispatch is exposed only after complete manifest, hash, compatibility, and projection verification, with fallback limited to verified known-good (`src/prompt/compile-index.mjs:93-210`; `tests/router.phase26-authority.test.mjs:223-270`). | closed |
| T-26-06 | Tampering | invalidation closure | high | mitigate | Canonical complete-tuple member fingerprints bind every material output and the eight-class invalidation matrix verifies transitive closure (`src/registry/build.mjs:19-33`; `tests/router.phase26-invalidation.test.mjs`). | closed |
| T-26-07 | Denial of Service | event delivery | medium | mitigate | Authoritative reconciliation rebuilds from current state, and missed/coalesced-event coverage verifies convergence rather than trusting event completeness (`src/registry/reconcile.mjs`; `src/registry/watcher.mjs`; `tests/router.phase26-invalidation.test.mjs`). | closed |
| T-26-08 | Elevation of Privilege | partial rebuild | critical | mitigate | Full and incremental paths yield one complete canonical value; publication keeps the prior pointer until every member and manifest is durable and verified (`src/registry/build.mjs:19-33`; `src/prompt/publish-index.mjs:171-244`; `tests/router.phase26-equivalence.test.mjs`). | closed |
| T-26-09 | Elevation of Privilege | activation | critical | mitigate | Verification fingerprints and required gate evidence are checked before immutable version write, canary, activation, and publication (`src/registry/activate.mjs:87-137`; `src/registry/watcher.mjs`; `tests/router.phase26-authority.test.mjs:117-160`). | closed |
| T-26-10 | Tampering | crash recovery | high | mitigate | Recovery reads only `release-tuples/known-good.json`, then reuses the hash-verifying loader before atomically restoring the active pointer (`src/prompt/publish-index.mjs:49-71`; `tests/router.phase26-lifecycle.test.mjs:85-119`). | closed |
| T-26-11 | Tampering | installed generation | high | mitigate | Installed generations remain manifest-owned, hash-bound, atomic, and are executed from temporary Claude and Codex roots (`src/lifecycle/router-lifecycle.mjs:187-337,628-723`; `tests/router.phase26-dual-runtime.test.mjs`; `tests/router.phase26-performance.test.mjs:298-371`). | closed |
| T-26-12 | Elevation of Privilege | user runtime files | critical | mitigate | Lifecycle mutation/removal requires ownership-manifest proof; dual-runtime lifecycle tests snapshot unrelated files byte-for-byte across install, repair, upgrade, rollback, and recovery (`src/lifecycle/router-lifecycle.mjs:628-723`; `tests/router.phase26-dual-runtime.test.mjs`). | closed |
| T-26-13 | Spoofing | approval binding | critical | mitigate | Existing approval verification binds exact candidate/reconciliation/mapping/policy fingerprints, expiry, required gates, and one mutation sequence; missing, stale, and mismatched approvals are byte-identical no-ops (`src/registry/activate.mjs:87-111`; `tests/router.phase26-authority.test.mjs:96-160`). | closed |
| T-26-14 | Elevation of Privilege | suggestion projection | high | mitigate | Suggestion data is render-only and optional; it has no publication or mutation import, while dispatch continues to require a verified active or known-good projection (`src/context/prompt-route.mjs:1-6,178-231`; `tests/router.phase26-authority.test.mjs:162-270`). | closed |
| T-26-15 | Repudiation | performance evidence | high | mitigate | The installed benchmark requires a deterministic 312-record registry, 240 samples, strict assertions, and emits machine-readable `RELEASE_METRICS` (`tests/router.phase26-performance.test.mjs:257-261,298-375`). | closed |
| T-26-16 | Denial of Service | prompt context | high | mitigate | Every measured route asserts warm p95 below 25 ms, max below 100 ms, and byte/token budgets; production rendering has a hard 2048-byte fallback (`tests/router.phase26-performance.test.mjs:257-261,356-375`; `src/context/prompt-route.mjs:23,57`). | closed |

## Additional Safety Verification

- Focused security/lifecycle suite: 18 passed, 0 failed.
- Installed benchmark: 312 records, 240 samples, warm p95 0.447 ms, max 0.771 ms, 194 bytes, 65 tokens.
- Static production scan found no HTTP/network/model imports, API-key reads, or raw-prompt persistence in the Phase 26 publication, routing, registry, or lifecycle paths.
- Prompt hot path contains no filesystem mutator.

## Threat Flags

| Flag | Mapping | Result |
|---|---|---|
| `local-file-integrity` in `src/prompt/compile-index.mjs` | T-26-03, T-26-05, T-26-08, T-26-10 | registered; bounded no-follow reads, exact hashes, complete-manifest validation, and verified known-good fallback |

Unregistered flags: none.

## Accepted Risks Log

None.

## Security Audit Trail

### Security Audit 2026-07-28

| Metric | Count |
|---|---:|
| Unique threats found | 16 |
| Closed | 16 |
| Open blocking | 0 |
| Open non-blocking | 0 |
| Unregistered flags | 0 |

## Sign-Off

Phase 26 is **SECURED** at ASVS Level 1. All declared mitigations are present in implementation and focused executable evidence; no threat meets the `high` blocking threshold.
