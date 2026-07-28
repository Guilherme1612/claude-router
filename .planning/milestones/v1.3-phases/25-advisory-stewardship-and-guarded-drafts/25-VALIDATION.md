---
phase: 25
slug: advisory-stewardship-and-guarded-drafts
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-28
---

# Phase 25 — Validation Strategy

> Pre-execution Nyquist contract. A requirement is green only when its behavioral
> test exists and the listed command exits zero; source shape or plan prose is
> not evidence.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` with `node:assert/strict` |
| **Config file** | none |
| **Test pattern** | `tests/router.*.test.mjs`; temp owned roots; dependency injection; byte snapshots |
| **Focused command** | `rtk node --test tests/router.steward-*.test.mjs` |
| **Phase gate** | `rtk node --test --test-concurrency=1 tests/router.steward-*.test.mjs tests/router.health.observe.test.mjs tests/router.health.admin.test.mjs tests/router.health.privacy.test.mjs tests/router.control-cli.test.mjs tests/router.compiled-index.test.mjs tests/router.context-prompt-integration.test.mjs` |
| **Repository regression gate** | `rtk node --test --test-concurrency=1 tests/*.test.mjs` |

## Sampling Rate

- After each task: run that task's exact command from the map below.
- After each plan: run every Phase 25 test created so far plus the named adjacent regression tests.
- Before phase verification: both phase and repository regression gates must exit zero, serially.
- No skipped or todo Phase 25 test counts as coverage.
- Any protected-artifact mutation, forbidden hot-path I/O, or install/publication reachability is a phase blocker.

## Requirement-to-Test Map

| Requirement | Observable behavior that must fail when broken | Planned behavioral test | Command |
|-------------|-----------------------------------------------|-------------------------|---------|
| UX-01 | Empty, stale, low-confidence, non-actionable, suppressed, missing, corrupt, and expired states emit no startup suggestion bytes; one eligible observation emits one notice. | `router.steward-suggestion`: eligibility rejection matrix. `router.steward-startup`: silence matrix plus eligible pointer integration. | `rtk node --test tests/router.steward-suggestion.test.mjs tests/router.steward-startup.test.mjs` |
| UX-02 | Equivalent observations retain one semantic fingerprint across clock changes and input order; dismissal, snooze, and cooldown suppress it; startup emits exactly the approved one-line pointer. | `router.steward-suggestion`: permutation/clock identity and suppression. `router.steward-startup`: exact bytes, expiry, stale-pointer replacement. | `rtk node --test tests/router.steward-suggestion.test.mjs tests/router.steward-startup.test.mjs` |
| UX-03 | CLI returns exactly one deterministic top suggestion and an aggregate-only overview; empty output has no candidates/rejected observations. | `router.steward-cli`: inspect/empty JSON and text cardinality, deterministic ordering, canonical envelope. | `rtk node --test tests/router.steward-cli.test.mjs --test-name-pattern="inspect|empty|exactly one|overview"` |
| UX-04 | Detail exposes bounded evidence, integer confidence, sorted affected IDs, allowlisted benefit/risk, and safe next action without raw prompt, secret, arbitrary evidence, or private path. | `router.steward-suggestion`: bounded projection/canaries. `router.steward-cli`: JSON/text field and privacy assertions. | `rtk node --test tests/router.steward-suggestion.test.mjs tests/router.steward-cli.test.mjs --test-name-pattern="detail|bounded|privacy|canary"` |
| UX-05 | Inspect, idempotent dismiss, bounded snooze, and correction survive atomic private persistence; wrong fingerprints/unsafe values fail; correction changes no routing bytes. | `router.steward-state`: permissions, corruption, concurrency, interaction persistence, protected snapshots. `router.steward-cli`: all four public actions and exact copy. | `rtk node --test tests/router.steward-state.test.mjs tests/router.steward-cli.test.mjs --test-name-pattern="inspect|dismiss|snooze|correct|mutation|concurrent"` |
| UX-06 | Recommendation yields only a bounded read-only approval proposal; missing/stale/mismatched approval writes nothing and exposes no complete preview; exact fresh approval then creates one immutable draft and only afterward returns its complete preview, never installing or publishing. | `router.steward-draft`: pre-approval proposal bounds, approval failure/no-preview matrix, idempotent approved write, post-approval preview, and before/after tree diff. `router.steward-cli`: recommendation → explicit approval → draft creation → complete preview. | `rtk node --test tests/router.steward-draft.test.mjs tests/router.steward-cli.test.mjs --test-name-pattern="proposal|approval|draft|post-approval|install|publish"` |
| UX-07 | Only the successful post-approval result contains the complete preview: exact contained paths, semantic changes, dependencies, conflicts, before/after routes, verification, reversibility, rollback implications, and exact warning; pre-approval output cannot expose it and malformed/unbounded/escaping input fails closed. | `router.steward-draft`: bounded proposal versus complete post-approval schema, deterministic binding, containment and bounds. `router.steward-cli`: complete preview appears only after approved creation and survives canonical projection. | `rtk node --test tests/router.steward-draft.test.mjs tests/router.steward-cli.test.mjs --test-name-pattern="proposal|post-approval|complete|contained|escape|rollback"` |
| UX-08 | Every inspect/interaction/preview/approval/startup path leaves registry versions, active/known-good pointers, release tuples, capability definitions, mode map, weights, routing policy, and compiled routing byte-identical; only approved steward artifacts may differ. | State, draft, CLI, and startup suites snapshot protected trees before/after each action; privacy suite denies mutation-module imports/calls. | `rtk node --test tests/router.steward-state.test.mjs tests/router.steward-draft.test.mjs tests/router.steward-cli.test.mjs tests/router.steward-startup.test.mjs tests/router.health.privacy.test.mjs --test-name-pattern="mutation|protected|unchanged|isolation|import"` |
| UX-09 | Parser exposes one `suggestion` family only; no list/dashboard/timeline/summary/findings/maintenance/install/publish action exists; output cardinality is at most one and startup at most one line. | `router.steward-cli`: forbidden grammar table and usage surface. `router.steward-suggestion/startup`: no candidate list and output cardinality. | `rtk node --test tests/router.steward-cli.test.mjs tests/router.steward-suggestion.test.mjs tests/router.steward-startup.test.mjs --test-name-pattern="forbidden|grammar|cardinality|no dump|one line"` |

## Per-Task Verification Map

| Task ID | Wave | Requirements | Test Type | Behavioral focus | Automated command | File exists | Status |
|---------|------|--------------|-----------|------------------|-------------------|-------------|--------|
| 25-01-01 | 1 | UX-01–04, UX-09 | unit | Fail-closed eligibility, total deterministic order, one-item bounded projection, semantic fingerprint | `rtk node --test tests/router.steward-suggestion.test.mjs` | no — task creates | pending |
| 25-01-02 | 1 | UX-05, UX-08 | integration | 0700/0600 durable state, corrupt-state denial, concurrent updates, protected-byte invariance | `rtk node --test tests/router.steward-state.test.mjs tests/router.health.privacy.test.mjs` | no — task creates | pending |
| 25-02-01 | 2 | UX-06, UX-08 | unit/integration | Bounded contained read-only approval proposal; no complete draft preview or write before approval | `rtk node --test tests/router.steward-draft.test.mjs --test-name-pattern="preview"` | no — task creates | pending |
| 25-02-02 | 2 | UX-06–08 | integration | Fresh exact draft-only approval; missing/stale/mismatch no-write/no-complete-preview; approved immutable 0600 draft followed by complete UX-07 preview | `rtk node --test tests/router.steward-draft.test.mjs` | no — task creates | pending |
| 25-03-01 | 3 | UX-03–05, UX-09 | integration/smoke | Canonical CLI inspect/empty/interactions, strict grammar, exact copy, privacy and no mutation | `rtk node --test tests/router.steward-cli.test.mjs --test-name-pattern="suggestion|dismiss|snooze|correct|empty"` | no — task creates | pending |
| 25-03-02 | 3 | UX-06–09 | integration/smoke | CLI exposes bounded proposal first; exact approval creates the draft and only then returns the complete preview, with draft-only filesystem delta and no authority expansion | `rtk node --test tests/router.steward-cli.test.mjs tests/router.control-cli.test.mjs` | no — task creates | pending |
| 25-04-01 | 4 | UX-01, UX-02, UX-05, UX-08 | integration | Concrete off-hot-path refresh producer runs exactly once after successful evidence, health, and advisory mutations; never on failed/no-write or prompt paths; stale availability is replaced | `rtk node --test tests/router.steward-startup.test.mjs tests/router.health.observe.test.mjs tests/router.health.admin.test.mjs tests/router.steward-cli.test.mjs` | no — task creates | pending |
| 25-04-02 | 4 | UX-01, UX-02, UX-08 | integration | Atomic 0600 pointer sink, stale clearing, exact schema, and bounded one-fixed-file fail-silent loader | `rtk node --test tests/router.steward-startup.test.mjs --test-name-pattern="compile|load|bounded|corrupt|expired"` | no — task creates | pending |
| 25-04-03 | 4 | UX-01, UX-02, UX-08, UX-09 | integration/performance | Startup consumer emits exact silence/one line from loader only; no producer, discovery, health/network/model work, mutation, or routing regression | `rtk node --test tests/router.steward-startup.test.mjs tests/router.health.privacy.test.mjs tests/router.compiled-index.test.mjs tests/router.context-prompt-integration.test.mjs` | no — task creates | pending |

## Cross-Plan and Phase Invariants

These assertions are mandatory even where a task-level test already exercises a
subset. They close seams between independently green plans.

| Invariant | Required executable assertion | Owning file | Gate |
|-----------|-------------------------------|-------------|------|
| End-to-end advisory flow | One fixture drives observation → recommendation → bounded approval proposal → exact fresh approval → immutable draft creation → complete preview; pre-approval and stale/mismatched approval expose no complete preview and produce no write. | `tests/router.steward-cli.test.mjs` | phase gate |
| Producer refresh coverage | Inject the refresher into telemetry append, health reset/dispose/recover, and suggestion inspect/dismiss/snooze/correct/draft; assert exactly one post-commit call per successful mutation/evaluation, none for failed/no-write paths, and no prompt-path reference. | `tests/router.steward-startup.test.mjs`, `tests/router.health.observe.test.mjs`, `tests/router.health.admin.test.mjs`, `tests/router.steward-cli.test.mjs` | phase gate |
| Suppression reaches startup | Compile an available pointer, dismiss/snooze/cool down the same fingerprint, invoke the off-path refresh producer, then prove startup is silent and stale availability was replaced. | `tests/router.steward-startup.test.mjs` | phase gate |
| Hot-path fixed I/O | Inject an FS seam that records `open/fstat/read/close`, throws on `readdir/glob/stat discovery`, and asserts only the fixed pointer path is accessed for this feature. | `tests/router.steward-startup.test.mjs` | phase gate |
| Hot-path source isolation | Read deployed prompt-route source and fail on health/catalog/score/history/discovery/network/model imports or calls; retain the existing isolated latency regression. | `tests/router.health.privacy.test.mjs` | phase gate |
| Global no-mutation | Snapshot hashes and modes for protected authoritative artifacts before and after every public action, including failures; approved execution may add bytes only below the steward draft root. | `tests/router.steward-state.test.mjs`, `tests/router.steward-draft.test.mjs`, `tests/router.steward-cli.test.mjs` | phase gate |
| No authority imports | Fail if any `src/steward/*.mjs` imports activation, publication, installer, lifecycle, adapter, settings, or routing mutation modules. | `tests/router.health.privacy.test.mjs` | phase gate |
| No surface expansion | Parse CLI usage/grammar and reject dashboard, timeline, list, summary, findings, maintenance, install, publish, activate, delete, disable, merge, archive, and rewrite beneath suggestion. | `tests/router.steward-cli.test.mjs` | phase gate |
| Existing behavior preserved | Existing router control, compiled-index, context prompt integration, and privacy suites remain green beside Phase 25 tests. | existing regression files | phase gate |

## Wave 0 Requirements

No framework, dependency, shared fixture, or config work is required. Each plan
creates its own focused test file before implementation:

- `tests/router.steward-suggestion.test.mjs`
- `tests/router.steward-state.test.mjs`
- `tests/router.steward-draft.test.mjs`
- `tests/router.steward-cli.test.mjs`
- `tests/router.steward-startup.test.mjs`

`wave_0_complete` becomes true only after all five files exist with the mapped
behavioral tests. Empty stubs do not qualify.

## Manual-Only Verifications

None. Terminal copy, color independence, permissions, filesystem deltas,
hot-path isolation, bounded output, and CLI reachability are all automatable.

## Phase Gate Commands

```bash
rtk node --test tests/router.steward-suggestion.test.mjs tests/router.steward-state.test.mjs
rtk node --test tests/router.steward-draft.test.mjs
rtk node --test tests/router.steward-cli.test.mjs tests/router.control-cli.test.mjs
rtk node --test tests/router.steward-startup.test.mjs tests/router.health.observe.test.mjs tests/router.health.admin.test.mjs tests/router.steward-cli.test.mjs
rtk node --test tests/router.steward-startup.test.mjs tests/router.health.privacy.test.mjs tests/router.compiled-index.test.mjs tests/router.context-prompt-integration.test.mjs
rtk node --test --test-concurrency=1 tests/router.steward-*.test.mjs tests/router.health.observe.test.mjs tests/router.health.admin.test.mjs tests/router.health.privacy.test.mjs tests/router.control-cli.test.mjs tests/router.compiled-index.test.mjs tests/router.context-prompt-integration.test.mjs
rtk node --test --test-concurrency=1 tests/*.test.mjs
```

## Validation Sign-Off

- [x] Every UX-01 through UX-09 behavior has a runnable planned behavioral test.
- [x] Every task has a non-watch automated command.
- [x] Cross-plan approval ordering, producer refresh, suppression/startup, hot-path, no-mutation, no-authority, and no-surface-expansion seams have explicit owners.
- [x] Existing test framework and conventions are reused; no dependency or abstraction is added.
- [x] Focused, phase, and full serial gates are defined.
- [ ] Planned Phase 25 test files exist and have been observed failing before implementation.
- [ ] All focused and phase gates are green.
- [ ] Full serial repository gate is green.

**Approval:** strategy approved 2026-07-28; execution evidence pending.
