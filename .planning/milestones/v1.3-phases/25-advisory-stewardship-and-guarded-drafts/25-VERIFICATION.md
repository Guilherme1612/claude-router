---
phase: 25-advisory-stewardship-and-guarded-drafts
verified: 2026-07-28T16:21:56Z
status: passed
score: 12/12 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 25: Advisory Stewardship and Guarded Drafts Verification Report

**Phase Goal:** Users receive at most one high-value capability recommendation and can safely inspect or prepare changes without Router mutating personal capabilities.
**Verified:** 2026-07-28T16:21:56Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Startup is silent unless one novel, actionable, high-confidence observation exists. | ✓ VERIFIED | `selectSuggestion` applies bounded eligibility and deterministic ranking; startup tests exercise rejected, missing, corrupt, expired, dismissed, snoozed, and cooldown states. |
| 2 | A startup notice is compact, non-blocking, deduplicated, cooldown-controlled, and points to `/router suggestion`. | ✓ VERIFIED | `loadStartupPointer` returns one bounded pointer; `routeContextPrompt` emits the approved line and `acknowledgeStartupNotice` records cooldown only after emission. |
| 3 | `/router suggestion` returns exactly one prioritized action and compact aggregate health overview. | ✓ VERIFIED | Production CLI construction calls `loadStewardObservations` and `selectSuggestion`; CLI tests cover empty and single-detail canonical projections. |
| 4 | Suggestion detail exposes bounded evidence, confidence, affected capabilities, benefit, risk, and safe next action. | ✓ VERIFIED | Allowlisted projection and grouped text renderer are exercised by the CLI suite, including production-derived inputs. |
| 5 | Inspect, dismiss, snooze, and correct are the only advisory interaction actions and do not mutate routing. | ✓ VERIFIED | Strict grammar rejects forbidden actions; state tests exercise exact-fingerprint validation, bounded snooze, immutable correction proposals, and protected-state isolation. |
| 6 | Missing-capability remediation is recommendation → fresh approval → private draft → complete preview. | ✓ VERIFIED | `previewDraft` is read-only; `approveDraftCreation` re-derives and verifies the exact `draft_file_only` binding before the only write. CLI and draft tests exercise missing, mismatched, stale, and fresh approval paths. |
| 7 | Post-approval preview contains paths, semantic changes, dependencies, conflicts, route effects, verification, reversibility, and rollback implications. | ✓ VERIFIED | `deriveStewardDraft` builds the complete bounded schema; focused tests assert completeness for canonical contract-backed missing-category and missing-dependency observations. |
| 8 | No advisory path installs, activates, publishes, or rewrites capability/routing state. | ✓ VERIFIED | Draft module import-deny and protected-byte tests pass; its only effect token is `draft_file_only` and persistence is contained below the private steward draft root. |
| 9 | No dashboard, timeline, per-session summary, unranked dump, or maintenance command family exists. | ✓ VERIFIED | Strict suggestion grammar exposes one command family and rejects list/install/publish/maintenance actions; no new UI or endpoint artifact exists. |
| 10 | The pointer producer runs off the prompt hot path after durable health/advisory mutations. | ✓ VERIFIED | `refreshSuggestionPointer` is wired after accepted evidence, health reset/dispose/recover, and successful advisory actions; caller-contract tests cover one refresh on success and zero on no-write paths. |
| 11 | UserPromptSubmit performs only a fixed bounded pointer read, with no health derivation, discovery, history, network, model call, or steward mutation. | ✓ VERIFIED | `prompt-route.mjs` imports only the startup loader/acknowledger for this feature; the isolation test statically and behaviorally checks the prohibited dependencies and I/O bounds. |
| 12 | Fresh installation includes the full Phase 25 production module closure. | ✓ VERIFIED | Named lifecycle test `bundled router includes the current operator and safety surfaces` passes and checks the deployable closure. |

**Score:** 12/12 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/steward/suggestion.mjs` | Eligibility, ranking, projection, fingerprint | ✓ VERIFIED | Substantive exports: `selectSuggestion`, `suggestionFingerprint`, `startupPointer`; used by refresh and CLI paths. |
| `src/steward/state.mjs` | Private atomic interaction state | ✓ VERIFIED | `createStewardStore` implements 0700/0600 atomic fingerprint-keyed state and proposals. |
| `src/steward/draft.mjs` | Approval-bound preview-only drafts | ✓ VERIFIED | Exports `previewDraft`, `approveDraftCreation`, `verifyDraftPreview`; wired to existing approval primitives and private draft storage. |
| `src/steward/refresh.mjs` | Off-path authoritative pointer producer | ✓ VERIFIED | Loads fixed authoritative inputs, derives observations, selects one item, and publishes available/unavailable state. |
| `src/steward/startup-pointer.mjs` | Atomic compiler and bounded loader | ✓ VERIFIED | Exports `compileStartupPointer` and `loadStartupPointer`; fixed 4 KiB cap and fail-silent optional read. |
| `src/context/prompt-route.mjs` | Pointer-only startup consumer | ✓ VERIFIED | Emits the approved notice and acknowledges cooldown without importing the producer or health catalog. |
| `src/cli/router-control.mjs` | Canonical suggestion interaction surface | ✓ VERIFIED | Production defaults derive real local observations and draft inputs; strict grammar and canonical responses remain centralized. |
| Phase 25 focused tests | Behavioral and negative coverage | ✓ VERIFIED | 115 Phase 25/adjacent assertions passed in the combined run; the sole failure was a concurrent Phase 26 lifecycle inventory repair test, not a Phase 25 behavior. |

`verify.artifacts` reported false “Missing export: [a, b]” issues for list-valued `exports` frontmatter. Direct source inspection confirmed every named export above; this is a verifier parser false positive, not an artifact gap.

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| suggestion policy | Phase 24 catalog | bounded `observations` input | ✓ WIRED | Production refresh/CLI consume `deriveObservations`; no second raw-history analyzer exists. |
| steward state | suggestion policy | semantic fingerprint | ✓ WIRED | Dismissal, snooze, cooldown, and correction are keyed to the selected fingerprint. |
| draft service | approval service | `bindApproval` / `verifyApproval` | ✓ WIRED | Current exact scope, version, targets, and `draft_file_only` effect are re-derived before persistence. |
| CLI | suggestion and draft services | canonical controller paths | ✓ WIRED | Real production defaults supply authoritative observations, registry, relationships, and contracts. |
| health/advisory mutations | refresh producer | post-commit refresh | ✓ WIRED | Successful mutation seams refresh once; failure/no-write paths do not. |
| prompt route | startup pointer | bounded loader and post-emission acknowledgement | ✓ WIRED | Hot path reads only the precomputed pointer and records cooldown after actual emission. |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `/router suggestion` | selected recommendation and overview | fixed health, registry, relationship, contract, and steward-state paths | Yes | ✓ FLOWING |
| startup notice | compact pointer record | off-path `refreshSuggestionPointer` after authoritative mutations | Yes | ✓ FLOWING |
| draft preview | exact remediation payload | current selected observation plus canonical registry/contracts/relationships | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Phase 25 focused/adjacent behavior | `node --test --test-concurrency=1` over steward, CLI, prompt integration, health, privacy, and lifecycle files | 115 passed; 1 unrelated concurrent Phase 26 lifecycle repair timeout | ✓ PASS for Phase 25 |
| Fresh deployment contains the feature | named lifecycle test: `bundled router includes the current operator and safety surfaces` | 1/1 passed | ✓ PASS |
| Approval, mutation isolation, pointer suppression, cooldown, and expiry | focused tests in the combined run | all named Phase 25 cases passed | ✓ PASS |

### Probe Execution

No Phase 25 plan declares a shell probe and no Phase 25-specific conventional probe exists. Step 7c is not applicable.

### Requirements Coverage

| Requirement | Status | Evidence |
|---|---|---|
| UX-01 | ✓ SATISFIED | Eligibility/silence policy and startup tests. |
| UX-02 | ✓ SATISFIED | One-line pointer, fingerprint suppression, cooldown acknowledgement. |
| UX-03 | ✓ SATISFIED | Exactly-one CLI selection plus aggregate overview. |
| UX-04 | ✓ SATISFIED | Bounded evidence/confidence/capabilities/benefit/risk/next-action projection. |
| UX-05 | ✓ SATISFIED | Inspect/dismiss/snooze/correct with no routing mutation. |
| UX-06 | ✓ SATISFIED | Proposal-first, exact fresh approval, draft-only persistence. |
| UX-07 | ✓ SATISFIED | Complete post-approval preview schema. |
| UX-08 | ✓ SATISFIED | Import-deny, effect binding, containment, and protected-byte tests. |
| UX-09 | ✓ SATISFIED | One command family; forbidden surfaces/actions rejected or absent. |

No Phase 25 requirement is orphaned: every plan claims UX-01 through UX-09.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|---|---|---|---|
| Phase 25 source set | No unreferenced `TBD`, `FIXME`, or `XXX` markers | None | No debt-marker blocker. |
| Live installed hook copies under `~/.claude/router` and `~/.codex/router` | Installed `prompt-route.mjs` files predate the Phase 25 pointer consumer | ⚠️ Warning | The checkout and fresh-install bundle are complete, but the already-installed local runtime must be reinstalled/upgraded before it exposes Phase 25. Live activation is not a Phase 25 roadmap or plan success criterion. |
| Shared working tree | Concurrent Phase 26 edits make one lifecycle inventory repair test time out | ℹ️ Info | Phase 25 named deployment-closure test passes; no Phase 25 source was changed by this verifier. |

### Confirmation-Bias Counter

- Partial-looking requirement checked: production CLI originally depended on injected observations; current construction now derives authoritative local observations and remediation inputs.
- Misleading check checked: frontmatter artifact verification falsely flags bracketed export lists; direct exports and runtime tests prove the symbols.
- Error path checked: corrupt/missing/oversized/expired pointers, stale approval, path escape, invalid fingerprints, and no-write refresh paths have passing negative tests.

### Human Verification Required

None. This phase is a deterministic terminal/file-system workflow whose observable interaction, state transitions, ordering, and negative safety properties are exercised by automated tests.

### Gaps Summary

No Phase 25 goal gaps remain. Repository construction, production data flow, guarded authority, hot-path isolation, and fresh-install closure are verified. The current machine's previously installed hook is stale deployment state, not missing code or a hard Phase 25 activation requirement.

---

_Verified: 2026-07-28T16:21:56Z_
_Verifier: the agent (gsd-verifier)_
