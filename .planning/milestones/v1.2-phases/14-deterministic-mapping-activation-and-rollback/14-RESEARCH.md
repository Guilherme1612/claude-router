---
phase: 14
slug: deterministic-mapping-activation-and-rollback
date: 2026-07-15
status: complete
nyquist_compliant: true
research_scope: codebase-first
---

# Phase 14 — Deterministic Mapping, Activation, and Rollback Research

## User Constraints

### Locked Decisions

#### Mapping confidence and ambiguity
- **D-01:** Mapping results use structured confidence with both a normalized score and a named confidence band. Every result identifies the winning rule, ordered evidence, rejected alternatives, policy version, and any margin to the next candidate; a score without evidence is invalid.
- **D-02:** Deterministic rules run in strict order: explicit canonical alias or declared metadata, authoritative stable identity, existing route-family inheritance, then deterministic lexical/trigger signals. Later rules may fill an unresolved result but may not silently override stronger evidence.
- **D-03:** If stronger evidence sources conflict, the mapping is ambiguous and non-dispatchable until reconciled. Lexical similarity never breaks a conflict between explicit or identity-backed claims.
- **D-04:** A valid safe capability with insufficient mapping confidence remains present and active-but-unmapped. It may be submitted to the bounded background ambiguity resolver, but its proposal must re-enter the same validation pipeline before activation.
- **D-05:** Collision thresholds require both a minimum absolute confidence and a minimum winner margin. Near ties remain unmapped rather than selecting the highest score by default.

#### Mapping precedence and target safety
- **D-06:** Every proposed target must resolve to an invocable record in the exact candidate registry version being evaluated, with applicable scope, permissions, and dependencies. No mapping may invent a target or resolve through stale active-version state.
- **D-07:** Route-family inheritance is allowed only from authoritative continuity or an existing mapping tied to the same stable identity. Name, description, fingerprint, or shared tokens alone do not establish inheritance.
- **D-08:** Mapping output is deterministic and byte-stable for equivalent candidate input, regardless of filesystem discovery order or background-resolver availability.
- **D-09:** Background ambiguity results are advisory evidence with explicit provenance and policy/model version. They cannot outrank explicit metadata or stable identity, loosen safety filters, or directly mutate active mappings.

#### Activation and version retention
- **D-10:** A candidate that passes the complete required validation and calibration gates activates automatically; no routine operator approval is required. Any failed, incomplete, stale, or uncertain gate preserves the current active version byte-for-byte.
- **D-11:** Candidate contents are fully written and durably synchronized in a new immutable version directory before activation. Activation consists of one atomic replacement of a small `active.json` pointer; readers never observe a partially published registry.
- **D-12:** Startup and recovery treat the active pointer as authoritative only when its referenced version is complete and valid. A corrupt, missing, or incomplete target fails closed to the most recent verified known-good version and emits an actionable recovery verdict.
- **D-13:** Retain the active version, the immediately previous known-good version, and a bounded recent verified history sufficient for inspection and manual rollback. Quarantined or failed candidates use a separate bounded diagnostic retention policy and are never rollback targets.
- **D-14:** Retention is count- and age-bounded with pruning that never removes the active version, the configured last-known-good fallback, or a version currently referenced by an in-progress operation. Exact default limits are planner discretion.

#### Rollback and operator CLI
- **D-15:** `status`, `diff`, `explain`, and `registry verify` are read-only by default and support deterministic human-readable output plus stable machine-readable JSON. Automation receives structured reason codes and meaningful nonzero exit statuses for invalid, unsafe, or unverifiable states.
- **D-16:** Rollback is always preview-first. The preview identifies source and destination versions, timestamps, fingerprints, mapping/record changes, verification state, safety warnings, and the exact pointer-only mutation that would occur.
- **D-17:** Rollback accepts only an immutable version that still passes integrity and compatibility verification. It changes the active pointer atomically; it does not copy, rebuild, edit, or reinterpret historical version contents.
- **D-18:** Interactive rollback requires typing the exact destination version identifier shown in the preview. Non-interactive use requires an explicit confirmation argument containing that same identifier; a generic `--yes` is insufficient.
- **D-19:** A successful rollback preserves the displaced version in history and records a local audit event with source, destination, time, outcome, and reason, without raw prompts or secrets. A failed rollback leaves the active pointer unchanged.
- **D-20:** `explain` presents the deterministic rule chain, evidence, confidence, rejected candidates, filters, and final disposition. `diff` defaults to active versus candidate/latest and also permits two explicit immutable versions.

### the agent's Discretion
- Exact confidence scale, confidence-band names, lexical scoring formula, collision thresholds, version naming format, retention counts/ages, CLI formatting, command aliases, and audit-event schema are left to research and planning, provided they preserve D-01 through D-20 and the lightweight Node.js constraint.

### Deferred Ideas

None — discussion stayed within phase scope.

## Phase Requirements

| Requirement | Planning interpretation |
|---|---|
| MAP-01 | Implement a pure, deterministic mapper whose precedence and evidence are inspectable and whose unresolved output is active-but-unmapped; ambiguity resolution is a downstream advisory producer, never an activation path. [VERIFIED: `.planning/REQUIREMENTS.md`, `14-CONTEXT.md`] |
| ACT-01 | Persist complete immutable versions, verify them, and publish by replacing only `active.json`; recovery and rollback select an already verified version by the same pointer protocol. [VERIFIED: `.planning/REQUIREMENTS.md`, `14-CONTEXT.md`] |

## Summary

Phase 14 should be planned as three narrow seams already named by the approved design: `map.mjs` produces canonical mapping evidence, `activate.mjs` owns immutable storage/pointer/recovery/retention, and `router-control.mjs` renders read-only inspection plus typed-confirmed rollback. [VERIFIED: approved design and implementation contract] The critical boundary is that mapping may classify an eligible Phase 13 candidate but cannot make an unsafe record eligible, and activation may publish only a self-contained version whose registry, mappings, evidence, and verification manifest agree by fingerprint. [VERIFIED: `src/registry/reconcile.mjs`, `14-CONTEXT.md`]

No third-party dependency is needed. The repository already uses Node.js built-ins, canonical serialization, SHA-256 fingerprints, temp-file-plus-rename writes, the built-in test runner, and injected-failure fixtures. [VERIFIED: codebase] Node documents `renameSync`, `fsyncSync`, exclusive-create flags, and file descriptors; POSIX specifies replacement rename as atomic, while durable crash recovery still requires explicitly synchronizing file data and relevant directory metadata before publishing the pointer. [CITED: https://nodejs.org/api/fs.html] [CITED: https://pubs.opengroup.org/onlinepubs/9799919799/functions/rename.html] [CITED: https://pubs.opengroup.org/onlinepubs/9799919799/basedefs/V1_chap04.html]

## Architectural Responsibility Map

| Concern | Owner | Required input | Output / invariant |
|---|---|---|---|
| Candidate safety | existing `reconcile.mjs` | exact candidate registry, lifecycle, aliases, scope | eligible/quarantined disposition; mapping cannot weaken it. [VERIFIED: codebase] |
| Deterministic mapping | new `map.mjs` | eligible canonical candidate, authoritative continuity, route-family state, policy, optional advisory evidence | byte-stable mapping report with ordered rule evidence and unmapped dispositions. [VERIFIED: `14-CONTEXT.md`] |
| Immutable publication | new `activate.mjs` | registry + mapping report + completed validation evidence | complete version directory and one pointer replacement; old pointer survives every pre-swap failure. [VERIFIED: approved design] |
| Recovery/retention | `activate.mjs` | active pointer, version manifests, verified-history metadata, operation references | valid active version or deterministic last-known-good fallback; protected versions never pruned. [VERIFIED: `14-CONTEXT.md`] |
| Operator control | new `router-control.mjs` | read-only version store plus explicit rollback confirmation | stable JSON/human results and pointer-only rollback. [VERIFIED: approved implementation contract] |
| Installation | existing `router-lifecycle.mjs` | new module files and owned CLI entrypoint | deploy only router-owned files and preserve unrelated runtime settings. [VERIFIED: codebase] |

## Project Constraints (from AGENTS.md and project guidance)

- The supplied project instruction references `@RTK.md`, but neither `AGENTS.md` nor `RTK.md` exists in this repository; there are no additional repository-local directives to apply. [VERIFIED: filesystem inspection]
- Keep prompt-time routing deterministic and read-only; all Phase 14 mutation belongs to the background control plane or explicit operator CLI. [VERIFIED: `.planning/PROJECT.md`]
- Use lightweight Node.js and existing built-ins; do not introduce a package for hashing, canonical JSON, CLI parsing, or atomic file replacement. [VERIFIED: codebase and `14-CONTEXT.md`]
- Preserve portable diagnostics: never serialize absolute Claude/Codex roots, raw prompts, secrets, or arbitrary filesystem paths into version, mapping, audit, or CLI JSON. [VERIFIED: Phase 11–13 contracts]
- Mutation fails closed, while the active registry and unrelated Claude/Codex configuration remain unchanged on failure. [VERIFIED: `.planning/PROJECT.md`, Phase 13 verification]

## Standard Stack

### Core

| Facility | Use |
|---|---|
| Node.js ESM | Match all current registry and lifecycle modules. [VERIFIED: codebase] |
| `node:crypto` SHA-256 | Version/content/policy fingerprints using the established fingerprint convention. [VERIFIED: `reconcile.mjs`, `router-lifecycle.mjs`] |
| `node:fs` (`openSync`, `writeFileSync`, `fsyncSync`, `closeSync`, `renameSync`, `mkdirSync`, `readdirSync`) | Exclusive immutable creation, durable writes, pointer swap, verification, and bounded pruning. [CITED: https://nodejs.org/api/fs.html] |
| `stableStringify` and canonical schema helpers | Byte stability, sorting, portable equality, and repeatable fingerprints. [VERIFIED: `schema.mjs`] |
| `node:test` + strict assertions | Focused Nyquist suites and injected crash/failure tests. [VERIFIED: tests] |

### Recommended Defaults

- Use normalized confidence `0..1` encoded as an integer basis-point value internally (`0..10000`) and emit the decimal score plus bands `high`, `medium`, `low`, `unmapped`; integer arithmetic avoids floating representation drift. [ASSUMED]
- Require both `minimum_score` and `minimum_margin` per policy/rule family; store them in a versioned mapping policy whose stable fingerprint is embedded in every result. [VERIFIED: D-01, D-05; exact representation ASSUMED]
- Name versions from content, not wall-clock ordering: `v1-<first 16 hex of bundle fingerprint>`; keep timestamps as metadata only. This makes retries idempotent while still allowing collision detection against the full digest. [ASSUMED]
- Default verified-history retention to active + previous + eight recent verified versions, with a 30-day age bound; default failed/quarantine diagnostics to twenty entries or 14 days. These are planner-adjustable but must honor protected references. [ASSUMED]

## Architecture Patterns

### Pattern 1: Precedence as a non-overriding state machine

Evaluate all claims at each authority tier, record accepted and rejected evidence, and stop promotion when a tier resolves uniquely or conflicts. Do not implement precedence as “add weighted points from every source,” because weak lexical evidence could then override explicit authority. [VERIFIED: D-02, D-03]

Recommended dispositions are `mapped`, `unmapped`, and `ambiguous`; only `mapped` has a target. `unmapped` remains a safe registry member and can generate an ambiguity-resolution request. `ambiguous` records the conflicting strong claims and is non-dispatchable. [VERIFIED: D-03, D-04]

### Pattern 2: Exact-candidate target join

Build `recordsById` only from the canonical candidate being mapped. Before emitting any target, reapply the same invocable predicates Phase 13 uses: exact presence, `lifecycle === ready`, `dispatchable === true`, nonempty invocation, applicable scope, satisfied dependencies/permissions, and no blocking collision. [VERIFIED: `reconcile.mjs`, D-06] Never consult active-version records to repair a candidate miss. [VERIFIED: D-06]

### Pattern 3: Evidence ledger before score

Canonicalize every evidence item as `{tier, rule, authority, source_id, target_id, contribution, accepted, reason_code, provenance}`; sort by tier, rule, target, and stable bytes before computing the winner. [ASSUMED] The result must include rejected alternatives and runner-up margin even when an explicit tier resolves without lexical scoring. [VERIFIED: D-01]

### Pattern 4: Self-contained immutable version

Each version directory should contain at least `registry.json`, `mappings.json`, `evidence.json`, `verification.json`, and `manifest.json`. [ASSUMED] Write payload files into an exclusively created staging directory; synchronize each file, write `manifest.json` last with every relative filename/size/fingerprint and `state: complete`, synchronize it, then synchronize the directory before making the version discoverable. [CITED: https://nodejs.org/api/fs.html] [CITED: https://pubs.opengroup.org/onlinepubs/009695399/functions/fsync.html] The planner should include a platform wrapper because directory `fsync` support and behavior are OS/filesystem-specific. [CITED: https://nodejs.org/api/fs.html]

### Pattern 5: One atomic active-pointer replacement

Serialize a small pointer containing schema version, destination version id, bundle fingerprint, prior version id, activation reason, and pointer sequence. [ASSUMED] Write it to a unique sibling temporary file, synchronize and close it, verify by rereading, then `renameSync(temp, active.json)` in the same directory. POSIX replacement rename is atomic; same-directory placement also avoids cross-filesystem rename. [CITED: https://pubs.opengroup.org/onlinepubs/9799919799/functions/rename.html] Synchronize the containing directory after replacement for crash durability, and report an uncertain/recovery-required result if that final synchronization fails rather than claiming durable success. [CITED: https://pubs.opengroup.org/onlinepubs/9799919799/basedefs/V1_chap04.html]

### Pattern 6: Rollback is activation of history

Rollback must call the same `verifyVersion` and `replaceActivePointer` primitives as forward activation. [VERIFIED: D-17] Preview produces a fingerprinted operation token bound to source, destination, current pointer sequence, and destination verification fingerprint; execution must reject stale previews if active state changed. [ASSUMED] Typed confirmation compares the exact destination id byte-for-byte and rejects generic confirmation. [VERIFIED: D-18]

### Pattern 7: Read-only CLI core with render adapters

Implement commands as pure result-producing functions, then render either deterministic text or `stableStringify` JSON. [ASSUMED] Use a stable exit-code taxonomy: `0` success/healthy, `2` usage or confirmation mismatch, `3` invalid/corrupt state, `4` unsafe/unverifiable destination, `5` mutation or durability failure. [ASSUMED] Every failure also carries a structured reason code, so scripts need not parse prose. [VERIFIED: D-15]

## Recommended Project Structure

```text
src/registry/map.mjs                 # pure precedence, scoring, evidence, advisory re-entry
src/registry/activate.mjs            # version write/verify, pointer swap, recovery, retention, audit
src/cli/router-control.mjs           # status/diff/explain/verify/rollback preview+execute
tests/router.registry-map.test.mjs
tests/router.registry-activate.test.mjs
tests/router.control-cli.test.mjs
```

[VERIFIED: `14-CONTEXT.md` and approved implementation contract]

## Don't Hand-Roll

- Do not create a second canonical serializer or identity algorithm; reuse `stableStringify`, `canonicalizeCapability`, `validateCapability`, and `stableCapabilityId`. [VERIFIED: codebase]
- Do not create a looser mapping-only target validator; factor or reuse the Phase 13 eligibility predicates so mapping and reconciliation cannot drift. [VERIFIED: codebase; recommendation ASSUMED]
- Do not parse arbitrary shell invocation strings in mapping or CLI verification; invocation safety remains bounded canonical data. [VERIFIED: Phase 13]
- Do not use symlinks as the active authority. The locked contract requires a small `active.json` pointer whose contents are integrity checked. [VERIFIED: D-11, D-12]
- Do not mutate historical version contents during rollback, verification, diff, or retention. [VERIFIED: D-17]
- Do not install a CLI, scoring, locking, or “atomic write” package; built-ins and repository patterns cover the required surface. [VERIFIED: codebase]

## Runtime State Inventory

| Category | Current state | Phase 14 implication |
|---|---|---|
| Source of truth | Canonical candidate registry and Phase 13 reconciliation report. [VERIFIED: codebase] | Mapping consumes only an eligible exact candidate. |
| Persisted mutable state | Candidate/report, controller status/control, scan state, ownership manifest. No immutable active-version store exists yet. [VERIFIED: `router-lifecycle.mjs`] | Plan migration/bootstrap from the current empty active snapshot without treating candidate publication as activation. |
| Runtime consumers | Background controller publishes inactive candidates; prompt hook remains separate/read-only. [VERIFIED: `controller.mjs`, project contract] | Activation updates only owned compiled state and pointer. |
| Cache/version coupling | Stable fingerprints exist for registries and reports; no Phase 14 bundle/policy/pointer schema exists. [VERIFIED: codebase] | Define schema versions and fingerprint closure before CLI work. |
| Rollback/recovery | Installer has transactional restoration for owned install files, but registry activation rollback is not implemented. [VERIFIED: lifecycle tests] | Reuse failure-injection style, not installer snapshot copying, for pointer rollback. |

This is an additive state transition, not a rename/refactor phase; the five-category inventory is nevertheless explicit so the planner does not miss bootstrap or consumer coupling. [VERIFIED: phase boundary]

## Common Pitfalls

1. **Weighted scoring erases precedence.** Summing lexical evidence with explicit evidence violates D-02/D-03. Model tiers as authority gates. [VERIFIED: context]
2. **Target validation uses active state.** A stale active target can make a missing candidate target appear valid. Join only against candidate bytes and fingerprints. [VERIFIED: D-06]
3. **Filesystem order leaks into output.** Sort records, evidence, alternatives, manifests, directory listings, diffs, and CLI rows before serialization. [VERIFIED: existing deterministic patterns]
4. **Candidate file is mistaken for a version.** The current installer publishes `candidate/registry.json` with `activated: false`; Phase 14 must build a self-contained verified bundle before pointer mutation. [VERIFIED: `router-lifecycle.mjs`]
5. **Rename is called before data durability.** Atomic namespace replacement does not prove payload bytes and directory entries survived a crash. Synchronize payloads and directories in the required order. [CITED: https://pubs.opengroup.org/onlinepubs/9799919799/basedefs/V1_chap04.html]
6. **Pointer points to staging.** A crash or pruning pass can expose incomplete state. The pointer may reference only a manifest-complete immutable directory. [VERIFIED: D-11, D-12]
7. **Recovery silently rewrites history.** Recovery must verify immutable candidates, select known-good deterministically, change only the pointer, and emit a verdict/audit event. [VERIFIED: D-12, D-19]
8. **Rollback preview races execution.** Bind preview to current pointer sequence/fingerprint and reject stale confirmation. [ASSUMED]
9. **Retention prunes protected state.** Compute the protected set first (active, fallback, previous, in-progress, preview destination), then age/count prune only unprotected versions. [VERIFIED: D-14; preview protection ASSUMED]
10. **CLI JSON and prose disagree.** Both renderers must consume one canonical command result and share exit status/reason codes. [VERIFIED: D-15; architecture recommendation ASSUMED]

## Code Examples

### Non-overriding precedence skeleton

```js
for (const tier of POLICY.precedence) {
  const claims = canonicalClaimsForTier(tier, subject, candidate);
  ledger.push(...claims);
  const safe = claims.filter(claim => claim.accepted && targetIsSafe(claim.target_id, candidate));
  const targets = [...new Set(safe.map(claim => claim.target_id))].sort();
  if (targets.length > 1) return ambiguousResult(tier, ledger, targets);
  if (targets.length === 1) return mappedResult(tier, ledger, targets[0]);
}
return unmappedResult(ledger);
```

[VERIFIED: pattern required by D-02/D-03; illustrative API names ASSUMED]

### Crash-safe pointer sequence

```js
writeAndSyncImmutableVersion(staging, bundle);
verifyVersion(staging, bundle.fingerprint);
publishImmutableDirectory(staging, finalDirectory);
syncDirectory(versionsDirectory);
writeSyncVerify(pointerTemp, stableStringify(nextPointer) + '\n');
renameSync(pointerTemp, activePointer); // same directory/filesystem
syncDirectory(pointerDirectory);
```

[CITED: https://nodejs.org/api/fs.html] [CITED: https://pubs.opengroup.org/onlinepubs/9799919799/functions/rename.html] [CITED: https://pubs.opengroup.org/onlinepubs/9799919799/basedefs/V1_chap04.html]

## Validation Architecture

### Test Framework and Sampling

- Framework: Node.js built-in test runner. [VERIFIED: codebase]
- After every task: run the new focused suite plus its closest Phase 13 regression. [ASSUMED]
- After every plan wave: run mapping, activation, CLI, reconciliation, lifecycle, watcher, build/diff/schema, adapters, and route-target suites. [ASSUMED]
- Before phase verification: `node --test tests/*.test.mjs`. [VERIFIED: established phase pattern]
- Target focused feedback latency: under 120 seconds; no watch mode. [VERIFIED: Phase 13 Nyquist convention]

### Requirement-to-Test Map

| Requirement | Required automated evidence |
|---|---|
| MAP-01 | Permutations produce identical bytes; precedence fixtures cover explicit, identity, inherited, lexical, strong conflict, near tie, insufficient confidence, background resolver unavailable, and advisory-result re-entry. Every emitted target is present and invocable in the exact candidate. |
| ACT-01 | Failure injection after every write/sync/verify/rename boundary; prior active pointer/bytes remain intact before swap; readers see old or new complete version only; corrupt/missing pointer recovery; verified rollback preview, stale-preview rejection, typed confirmation, audit privacy, and protected retention. |

### Wave 0 Gaps

- Create `tests/router.registry-map.test.mjs` before `map.mjs`. [VERIFIED: no current mapping suite]
- Create `tests/router.registry-activate.test.mjs` with injectable filesystem operations or boundary callbacks before `activate.mjs`. [VERIFIED: no current activation suite]
- Create `tests/router.control-cli.test.mjs` with subprocess fixtures for text, JSON, exit codes, interactive exact-id input, non-interactive confirmation, and mutation-free read commands. [VERIFIED: no current control CLI suite]
- Add fixture helpers for complete immutable bundles, corrupt manifests/pointers, operation references, deterministic clocks, and crash injection. [ASSUMED]
- Extend `calibration-tasks.json` only with Phase 14 mapping/activation gates required by the approved contract; preserve all existing fixtures and thresholds. [VERIFIED: approved implementation contract]

### Required Test Matrix

1. Input-order permutations across records, aliases, evidence, route families, and advisory results. [VERIFIED: D-08]
2. Explicit-vs-identity conflict, identity-vs-inheritance conflict, lexical near tie, and unsafe winning target. [VERIFIED: D-03, D-05, D-06]
3. Active-but-unmapped publication without dispatch mapping. [VERIFIED: D-04]
4. Candidate validation/calibration failure before any version or pointer mutation. [VERIFIED: D-10]
5. Crash at each durability boundary, including after pointer rename but before directory sync, with deterministic recovery classification. [CITED: POSIX durability guidance]
6. Startup with malformed pointer, missing version, incomplete manifest, mismatched fingerprint, and no valid history. [VERIFIED: D-12]
7. Preview and execution diff equality; exact typed/non-interactive confirmation; stale preview; invalid historical version. [VERIFIED: D-16–D-18]
8. Retention under count/age limits with active, fallback, previous, and in-progress protected. [VERIFIED: D-13, D-14]
9. Human and JSON CLI output stability, structured reason codes, nonzero unsafe/error statuses, and no absolute path/prompt/secret leakage. [VERIFIED: D-15, D-19]

## Security Domain

`security_enforcement: true` because Phase 14 creates a local integrity and authorization boundary around dispatchable registry state. [VERIFIED: phase requirements]

### Applicable ASVS Categories

| ASVS area | Phase application |
|---|---|
| V1 Architecture | Separate candidate, verified immutable version, and active pointer authorities; one module owns pointer mutation. [ASSUMED mapping of ASVS area] |
| V4 Access Control | Rollback requires exact destination confirmation; mappings cannot expand scope/permission/dependency authority. [VERIFIED: D-06, D-18] |
| V5 Validation | Validate canonical mapping inputs, manifests, pointer schemas, ids, relative paths, fingerprints, and CLI arguments before use. [VERIFIED: context and codebase pattern] |
| V6 Cryptography | SHA-256 provides content integrity fingerprints, not authenticity; do not describe local hashes as signatures. [VERIFIED: codebase; security interpretation ASSUMED] |
| V7 Logging | Audit activation/rollback outcomes without raw prompts, secrets, or absolute-path leakage. [VERIFIED: D-19] |
| V12 Files/Resources | Contain every version and pointer path under the owned root; reject symlinks/path traversal; use exclusive creation and immutable verification. [VERIFIED: Phase 13 containment pattern; Phase 14 application ASSUMED] |
| V14 Configuration | Version mapping policy and schemas; fail closed on unsupported or stale versions. [VERIFIED: D-01, D-09, D-10] |

### Threats the Plan Must Test

- TOCTOU replacement of a version or pointer between preview, verification, and activation. [ASSUMED]
- Symlink/path traversal escaping the router-owned version root. [VERIFIED: inherited Phase 13 threat pattern]
- Hash/manifest mismatch, duplicate version id with different bytes, pointer downgrade, stale confirmation replay, and audit injection through unbounded reason text. [ASSUMED]
- Advisory resolver evidence attempting to override explicit authority or reference an absent target. [VERIFIED: D-09]

## Package Legitimacy Audit

No external package is proposed; no package-legitimacy gate is required. [VERIFIED: recommended standard stack]

## Environment Availability

- Repository runtime is Node.js `v22.22.3`. [VERIFIED: `node --version`]
- Node built-in test runner and required filesystem/crypto APIs are available. [VERIFIED: current tests and runtime]
- Context7 MCP and `ctx7` CLI were unavailable in this research session; current official Node documentation was consulted directly instead. [VERIFIED: tool inspection]

## Open Questions (RESOLVED)

### Directory synchronization and unsupported platforms

**Resolution:** Phase 14 supports automatic activation only when the version-store filesystem can complete the full durability protocol: synchronize every payload file, synchronize the completed immutable version directory, synchronize the temporary pointer file, atomically replace `active.json` within the same directory/filesystem, and synchronize the pointer directory. Node documents that `fsync` behavior is operating-system and device specific, while POSIX warns that directory-entry changes can be only partly transferred across a crash. [CITED: https://nodejs.org/api/fs.html] [CITED: https://pubs.opengroup.org/onlinepubs/9799919799/basedefs/V1_chap04.html]

Before any pointer publication, activation must perform a non-mutating capability check plus a disposable same-filesystem durability probe under the owned version root. If opening or synchronizing directories is unsupported, denied, or returns an unsupported-operation error, the candidate may remain fully written and diagnostically inspectable but receives `activation_status: blocked`, reason code `durability_unsupported`, and **`active.json` must not be created, replaced, or otherwise published**. The current active version remains byte-for-byte authoritative; automatic retry is allowed only after the durability capability changes or an operator repairs the filesystem/runtime. [VERIFIED: D-10 and D-11 require complete durable synchronization before activation; exact status and reason code are selected Phase 14 contract]

If a durability operation fails before pointer rename, activation returns `activation_status: failed`, reason code `durability_failed`, removes or quarantines only the incomplete staging artifact, and preserves the prior pointer exactly. [VERIFIED: D-10, D-11] If the final pointer-directory synchronization fails **after** `renameSync` succeeds, the process must not claim success or attempt another pointer mutation: record `activation_status: recovery_required`, reason code `pointer_durability_uncertain`, stop activation/rollback/pruning, and require recovery verification on the next controller start or explicit `registry verify`. [VERIFIED: POSIX permits incomplete persistence across crashes; recovery behavior selected to satisfy D-12] Recovery rereads `active.json`, verifies its referenced immutable version and full manifest, and then: (a) accepts it as active only when complete and valid, emitting a recovered-but-previously-uncertain audit verdict; or (b) atomically restores the most recent verified known-good version through the same durability-capable pointer protocol. If directory synchronization is still unsupported during recovery, recovery remains `blocked`, routing continues from the last in-memory or previously verified readable known-good snapshot, and no pointer is published. [VERIFIED: D-12, D-19; fallback routing status selected Phase 14 contract]

This contract applies equally to forward activation and rollback. There is no `--force`, `--yes`, platform exemption, or reduced-durability mode in Phase 14. A platform/filesystem without working directory synchronization remains supported for read-only status, diff, explain, and verification, but not for activation or rollback pointer publication. [VERIFIED: D-10, D-15, D-17; explicit resolution selected for planner]

### Remaining discretion

**Resolution:** No user decision remains open. The planner must lock the discretionary confidence thresholds, version naming, retention defaults, CLI formatting, and audit schema in versioned policy/schema tasks; those choices may evolve prospectively but may never reinterpret an immutable historical version. [VERIFIED: D-01, D-13, D-14 and the agent's Discretion]

## Sources

### Primary (HIGH confidence)

- `.planning/phases/14-deterministic-mapping-activation-and-rollback/14-CONTEXT.md` — locked behavior and discretion.
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/PROJECT.md` — MAP-01/ACT-01 and system constraints.
- `docs/superpowers/specs/2026-07-14-dual-runtime-auto-updating-router-design.md` — approved lifecycle and failure contract.
- `docs/superpowers/plans/2026-07-14-dual-runtime-auto-updating-router-implementation.md` — module/test/CLI decomposition.
- `src/registry/reconcile.mjs`, `diff.mjs`, `schema.mjs`, `identity.mjs`, `src/lifecycle/router-lifecycle.mjs`, `src/registry/controller.mjs` and relevant tests — current seams and invariants.
- POSIX `rename`: https://pubs.opengroup.org/onlinepubs/9799919799/functions/rename.html
- POSIX filesystem synchronization/crash model: https://pubs.opengroup.org/onlinepubs/9799919799/basedefs/V1_chap04.html

### Secondary (MEDIUM confidence)

- Node.js filesystem API: https://nodejs.org/api/fs.html
- POSIX `fsync`: https://pubs.opengroup.org/onlinepubs/009695399/functions/fsync.html

### Tertiary (LOW confidence)

- Discretionary exact defaults and illustrative internal APIs marked `[ASSUMED]` above.

## Metadata

- Research mode: codebase-first with official filesystem documentation cross-check.
- External packages proposed: none.
- Nyquist validation: enabled; Wave 0 gaps and requirement matrix included.
- Runtime-state inventory: complete across all five categories.
- Security domain: included; applicable ASVS categories reviewed.
