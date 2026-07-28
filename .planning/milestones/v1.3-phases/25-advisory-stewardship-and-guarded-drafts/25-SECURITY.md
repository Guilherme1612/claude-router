---
phase: 25
name: advisory-stewardship-and-guarded-drafts
status: verified
asvs_level: 1
block_on: high
threats_open: 0
verified_at: 2026-07-28
---

# Phase 25 — Security

## Trust Boundaries

- Canonical health observations enter the deterministic suggestion selector.
- User CLI input enters the bounded `/router suggestion` parser.
- A draft proposal crosses the fresh-approval boundary before any private write.
- Steward state, corrections, drafts, and the startup pointer are confined to the Router-owned private root.
- The startup hook consumes one bounded local pointer and emits one fixed literal.
- Phase 25 has no network/model boundary and no install, publish, activation, or routing-mutation authority.

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|---|---|---|---|---|---|---|
| T-25-01 | Tampering | `state.mjs` | high | mitigate | Private 0700 root, lock, contained paths, atomic temp/fsync/rename, and 0600 writes (`src/steward/state.mjs:47-94,109-129`). | closed |
| T-25-02 | Information Disclosure | `suggestion.mjs` | high | mitigate | Exact observation schema and allowlisted bounded projection omit raw prompts/private paths/candidate dumps (`src/steward/suggestion.mjs:44-72,120-151`; `tests/router.steward-suggestion.test.mjs:26-65`). | closed |
| T-25-03 | Denial of Service | `suggestion.mjs` | medium | mitigate | 256-observation/32-ID bounds, safe integers, canonical sorting, and deterministic total ordering (`src/steward/suggestion.mjs:7-11,39-63,109-127`). | closed |
| T-25-04 | Elevation of Privilege | `state.mjs` | high | mitigate | Correction schema is two tokens maximum and writes only an immutable proposal below the steward root with `routing_unchanged: true` (`src/steward/state.mjs:96-106,165-182`). | closed |
| T-25-05 | Spoofing | approval binding | high | mitigate | Approval token binds current capability, args, sorted targets, effect, and proposal version; verification fails closed on missing, stale, or mismatched tokens (`src/orchestrator/approval.mjs:65-84,120-151`; `src/steward/draft.mjs:264-281`). | closed |
| T-25-06 | Tampering | draft paths | high | mitigate | Draft input is allowlisted/bounded and the resolved content-addressed target is contained below the supplied private root (`src/steward/draft.mjs:101-167,248-262`). | closed |
| T-25-07 | Elevation of Privilege | `draft.mjs` | critical | mitigate | Proposal and approval are bound to `draft_file_only`; the only effect is a private immutable file, with no install/activation/publication imports (`src/steward/draft.mjs:168-190,264-333`; `tests/router.steward-draft.test.mjs:145-173,196-202`). | closed |
| T-25-08 | Repudiation | immutable draft bundle | medium | mitigate | SHA-256 content identity binds current suggestion plus canonical payload; approved bundle is immutable and the preview fingerprint is re-derived (`src/steward/draft.mjs:97-99,161-190,208-231,283-331`). | closed |
| T-25-09 | Tampering | CLI parser | high | mitigate | 4096-byte argument cap, exact option/subcommand allowlists, fingerprint format, mutually exclusive option validation, and exact approval token shape (`src/cli/router-control.mjs:494-511,839-921`). | closed |
| T-25-10 | Information Disclosure | CLI renderer | high | mitigate | Suggestion renderer projects fixed fields and canonical bounded values; tests preserve protected bytes and reject candidate/private/raw output (`src/cli/router-control.mjs:551-604`; `tests/router.steward-cli.test.mjs:50-90,210-252`). | closed |
| T-25-11 | Elevation of Privilege | draft execute branch | critical | mitigate | CLI is proposal-first, delegates execution to the exact fresh-approval draft-only gate, and returns only draft authority/preview (`src/cli/router-control.mjs:918-969`; `tests/router.steward-cli.test.mjs:270-324`). | closed |
| T-25-12 | Denial of Service | correction JSON | medium | mitigate | Every CLI value is capped at 4096 bytes; correction JSON must be an object and state validation limits it to two bounded token fields (`src/cli/router-control.mjs:494-503,907-913,1001-1019`; `src/steward/state.mjs:96-106`). | closed |
| T-25-13 | Tampering | startup pointer | high | mitigate | Exact five-field schema, 4 KiB cap, 0600 temp write, fsync/rename, no-follow bounded load, expiry handling, and fail-silent corruption (`src/steward/startup-pointer.mjs:9-41,44-75,78-112`). | closed |
| T-25-14 | Information Disclosure | prompt route | high | mitigate | Startup output is the fixed `SUGGESTION_NOTICE` literal; pointer metadata is used internally for acknowledgement and is not interpolated into emitted context (`src/context/prompt-route.mjs:7-8,86-98`; `tests/router.steward-startup.test.mjs:293-320`). | closed |
| T-25-15 | Denial of Service | hot-path loader | high | mitigate | Loader opens one fixed file, checks its size before allocation, reads exactly that bounded file, and performs no discovery/health/network/model work (`src/steward/startup-pointer.mjs:78-112`; `tests/router.steward-startup.test.mjs:229-268,327-336`). | closed |
| T-25-16 | Elevation of Privilege | prompt route | high | mitigate | Pointer availability only appends advisory text; missing/corrupt input is fail-silent and no dispatch or mutation authority derives from it (`src/context/prompt-route.mjs:86-114`; `tests/router.context-prompt-integration.test.mjs:130-190`). | closed |
| T-25-SC | Tampering | package installation | high | mitigate | Phase commits change no package manifest/lockfile; Phase 25 modules use Node stdlib and existing local modules only. The shared threat appears in all four plans and is closed once here. | closed |

## Additional Safety Verification

- Canonical draft evidence fails closed when the owner contract/category or exact affected-contract evidence is unavailable (`src/steward/draft.mjs:35-90`).
- Phase 25 steward/startup code has no network client or model-provider import.
- No Phase 25 persistence path stores raw prompt text; the focused privacy regression confirms raw prompt fixtures never appear in persisted records.
- Correction and draft tests verify protected Router authority bytes remain unchanged.
- Focused security regression run on 2026-07-28: 58 passed, 0 failed.

## Threat Flags

| Flag | Mapping | Result |
|---|---|---|
| `local-file-write` in `src/cli/router-control.mjs` | T-25-06, T-25-07, T-25-11 | registered; exact-approved private draft-only write |
| `local-file-write` in `src/steward/startup-pointer.mjs` | T-25-13 | registered; bounded atomic 0600 pointer |
| `prompt-input` in `src/context/prompt-route.mjs` | T-25-14, T-25-15, T-25-16 | registered; fixed-literal advisory consumer |

Unregistered flags: none.

## Accepted Risks Log

None. Every declared threat uses the `mitigate` disposition and was verified in implementation.

## Security Audit Trail

### Security Audit 2026-07-28

| Metric | Count |
|---|---:|
| Unique threats found | 17 |
| Closed | 17 |
| Open blocking | 0 |
| Open non-blocking | 0 |
| Unregistered flags | 0 |

## Sign-Off

- Security auditor: Codex `gsd-security-auditor`
- Verification depth: ASVS L1, implementation-presence verification
- Result: secured; `threats_open: 0`
