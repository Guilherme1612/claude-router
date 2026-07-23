# Phase 18: Autonomous Lifecycle and Release Gates - Research

**Researched:** 2026-07-17
**Domain:** Hermetic dual-runtime lifecycle integration, crash-safe publication, installer coexistence, and executable release evidence
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
[--auto] Selected all gray areas: lifecycle event matrix, failure recovery, installer coexistence, release evidence.

#### Lifecycle event matrix
- **D-01:** Exercise add, edit, rename, move, disable, dependency-change, and delete as real filesystem events in isolated temporary Claude and Codex homes; assertions must observe watcher-to-registry-to-compiled-route propagation, not call internal helpers as a substitute.
- **D-02:** Use deterministic polling/event drains with bounded deadlines. Tests may explicitly flush a documented watcher seam, but must not depend on arbitrary sleeps or external network state.
- **D-03:** Require full-build-equivalent registry and routing output after every safe event, including scope, invocation, dependency, and dispatchability semantics. Claude and Codex cases share one scenario contract while retaining runtime-specific fixtures.

#### Failure recovery and release authority
- **D-04:** Unsafe candidates, schema corruption, controller interruption, and missed/coalesced events must fail closed: keep the verified active pointer or recover it from the durable journal, then reconcile from authoritative disk state.
- **D-05:** Last-known-good recovery is automatic and idempotent. Readers must never observe a partial candidate, mixed version tuple, or an unverified active index during crash injection.
- **D-06:** Recovery evidence must cover both startup repair and steady-state controller failure, and must prove that a later valid change can still advance after recovery.

#### Installer and coexistence contract
- **D-07:** Install, upgrade, reinstall, disable, and uninstall run against pre-populated temporary homes containing unrelated settings, hooks, plugins, skills, and user files. Only router-owned artifacts may change.
- **D-08:** Ownership is explicit and manifest-backed; reinstall is idempotent, upgrade is atomic, disable is reversible, and uninstall removes only owned artifacts while restoring any router-managed binding it replaced.
- **D-09:** Claude and Codex coexistence is verified independently and together. A lifecycle action for one runtime cannot mutate or invalidate the other runtime's unrelated or active state.

#### Final release matrix
- **D-10:** Maintain one machine-readable release matrix mapping every v1.2 requirement to concrete tests and evidence; duplicate primary ownership is rejected while cross-cutting secondary evidence is allowed.
- **D-11:** Release passes only when regression, calibration, privacy, coexistence, recovery, warm-latency, hard-route-latency, and context/token gates all pass in one reproducible command. Missing, skipped, stale, or non-executable evidence fails the gate.
- **D-12:** The release report records immutable registry/index/policy/corpus versions and the exact gate results. It must be deterministic, privacy-safe, and suitable for an independent verifier without trusting plan summaries.

### the agent's Discretion
- Exact fixture builders, scenario-table representation, bounded polling intervals, crash-injection mechanism, owned-artifact manifest format, and release-matrix serialization are planner discretion, provided the decisions and measurable roadmap criteria above remain enforced.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within the Phase 18 release boundary.
</user_constraints>

## Project Constraints (from AGENTS.md)

- `AGENTS.md` contains only `@RTK.md`; `RTK.md` is absent, so there are no additional readable project directives to apply or invent. [VERIFIED: `AGENTS.md` and filesystem inspection]
- Preserve the repository's Node.js standard-library-only, offline production lifecycle and built-in `node:test` test style. [VERIFIED: `tests/router.lifecycle.test.mjs`]
- Never mutate real Claude or Codex homes in Phase 18 tests; existing lifecycle tests establish temporary roots as the safe fixture pattern. [VERIFIED: `tests/router.lifecycle.test.mjs`]
- Planning artifacts are not force-staged because `.planning/config.json` sets `commit_docs: false`. [VERIFIED: `.planning/config.json`]

<phase_requirements>
## Phase Requirements

Phase 18 has cross-cutting secondary verification responsibility for all 20 v1.2 requirements and no new primary requirement assignment. [VERIFIED: `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`]

| ID | Description | Research Support |
|---|---|---|
| REG-01 | One canonical schema represents Claude and Codex capabilities with stable identities. | Registry schema/identity plus dual-runtime lifecycle byte comparisons. |
| REG-02 | Full rebuilds discover supported inventory kinds. | Full-build oracle after every scenario. |
| REG-03 | Incremental and full rebuilds are identical. | Compare canonical bytes after every event, not only final state. |
| ADP-01 | Claude adapter covers all declared scopes and kinds. | Claude fixture column in the shared scenario table. |
| ADP-02 | Codex adapter covers all declared scopes and kinds. | Codex fixture column in the same table. |
| CHG-01 | Seven required filesystem event classes are correct. | Real filesystem mutation matrix through the installed watcher. |
| CHG-02 | Normal and missed events meet repair bounds. | Bounded polling plus stopped-controller/startup repair scenarios. |
| SAF-09 | Removed targets cannot remain activatable. | Delete/rename/disable route assertions against active and compiled authority. |
| SAF-10 | Hook file/binding pairs reconcile safely. | Unsafe hook fixture in lifecycle and coexistence matrix. |
| MAP-01 | Deterministic mapping precedes ambiguity resolution. | Active-version evidence and watcher pipeline ordering assertions. |
| MAP-02 | Unsafe candidates preserve active authority. | Quarantine, corrupt-schema, and ambiguous mapping crash cases. |
| ACT-01 | Atomic pointer activation and rollback. | Pointer/journal crash injection and reader sampling. |
| CTX-01 | Capsules are bounded and privacy-safe. | Release privacy/token gates and immutable version report. |
| CTX-02 | Minimal prompts resume unique work. | Real compiled-route calibration corpus. |
| ORC-01 | Workflow selection precedes capability selection. | Existing orchestrator suite as primary executable evidence. |
| ORC-02 | Explicit instructions override stale context. | Existing resume and compiled-route integration suites. |
| TOK-01 | Default route avoids broad context loads. | Compiled-index forbidden-read and context-budget suites. |
| TOK-02 | Declared budgets and summary reuse are enforced. | Context-budget and emitted UTF-8 byte gates. |
| EVO-05 | Privacy-safe canary evolution rolls back regressions. | Existing real promotion/rollback integration plus release report binding. |
| REL-01 | Warm p95 under 25 ms and all routes under 100 ms. | Isolated real-route performance gate; do not run under parallel test contention. |
</phase_requirements>

## Summary

Phase 18 should be planned as three integration/release slices matching the fixed roadmap decomposition: (18-01) a shared Claude/Codex filesystem scenario harness that drives the installed watcher and proves registry **and compiled route** propagation, (18-02) crash/recovery plus installer ownership/coexistence lifecycle, and (18-03) a machine-readable 20-requirement release matrix and deterministic report. [VERIFIED: `.planning/ROADMAP.md`, `18-CONTEXT.md`]

Most underlying mechanics already exist and have focused tests: adapter discovery, fingerprint diffing, watcher drains, fail-closed reconciliation, deterministic mapping, trusted verification, immutable registry activation, journal recovery, compiled-index validation, real prompt routing, canary rollback, budgets, and latency measurement. [VERIFIED: `src/` and `tests/` inventory] The integration gap is that `createRegistryReconciler` publishes and activates registry versions, while `compile-index.mjs` only **loads** already-published compiled indexes; no production source currently compiles/publishes a prompt index after watcher activation. [VERIFIED: `src/registry/watcher.mjs`, `src/prompt/compile-index.mjs`] Phase 18 must close this seam rather than claim end-to-end propagation from fixture-only compiled publication.

A fresh focused run passed 79/80 tests; the real-route latency test failed at warm p95 28.49 ms when run concurrently with six other files, then passed immediately when rerun alone by test name, consistent with its prior isolated Phase 17 verification. [VERIFIED: fresh `node --test` runs on 2026-07-17 and `17-VERIFICATION.md`] Therefore the final release command must isolate performance measurement from parallel contention (for example, an orchestrator that runs correctness groups first and the latency gate in a dedicated child process) while still returning one aggregate command/result.

**Primary recommendation:** Build one hermetic release harness around production entry points, add the missing compiled publication seam after verified registry activation, and make every release assertion derive from immutable artifacts and executable test results.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Filesystem lifecycle observation | Background control plane | Runtime adapters | Watcher owns event drains; adapters own native fixture interpretation. |
| Canonical reconciliation and safety | Registry control plane | Activation storage | Candidate validation precedes authority mutation. |
| Immutable registry/index publication | Activation storage | Background control plane | Version directories and atomic pointers are authority; controller initiates publication. |
| Prompt dispatch verification | Prompt hot path | Compiled-index storage | Reader consumes only verified bounded compiled state. |
| Installer coexistence | Lifecycle installer | Claude/Codex runtime config | Manifest-backed ownership controls mutations in each home. |
| Release authority | Test/release orchestrator | All focused suites | Matrix aggregates evidence but does not replace behavioral tests. |

All tier assignments follow the production module boundaries rather than introducing a server, database, or external service. [VERIFIED: `src/` module graph]

## Standard Stack

### Core

| Library/runtime | Version | Purpose | Why Standard Here |
|---|---:|---|---|
| Node.js | v22.22.3 | Production lifecycle, watcher, atomic filesystem operations, CLI, tests | Already installed and all production lifecycle imports are `node:` or local. [VERIFIED: environment and lifecycle test] |
| `node:test` | bundled | Hermetic scenario, crash, release-matrix tests | Existing repository framework; no package installation needed. [VERIFIED: all `tests/*.test.mjs`] |
| Node filesystem/crypto/child_process APIs | bundled | Temp homes, fingerprints, atomic rename, controller isolation | Existing implementation primitives. [VERIFIED: lifecycle/watcher/activation sources] |

### Supporting

| Existing module | Purpose | Reuse rule |
|---|---|---|
| `src/lifecycle/router-lifecycle.mjs` | Install/reinstall/uninstall/controller lifecycle | Extend for explicit upgrade/disable; do not create a second installer. |
| `src/registry/watcher.mjs` | Debounce, drain, repair, reconcile/map/verify/activate | Drive through installed controller for E2E; use `flush()` only in focused deterministic tests. |
| `src/registry/activate.mjs` | Immutable versions, active pointer, recovery/journal/rollback | Reuse as sole registry authority. |
| `src/prompt/compile-index.mjs` | Strict compiled-index reader and LKG fallback | Add a separate control-plane publisher/compiler; keep this hot-path reader read-only. |
| `src/context/prompt-route.mjs` | Real route observation | Use for final dispatchability/route assertions. |
| `src/evolution/perf-measure.mjs` | Fixed corpus, UTF-8 bytes, latency gates | Reuse; run latency in isolated child process. |

**Installation:** None. This phase should add no external packages. [VERIFIED: phase constraints and existing standard-library stack]

## Package Legitimacy Audit

Not applicable: no external package installation is recommended.

## Architecture Patterns

### System Architecture Diagram

```text
real filesystem event in temp .claude/.codex
        -> installed watcher (bounded drain / repair)
        -> fingerprint diff + runtime adapter refresh
        -> canonical registry + reconciliation
            -> unsafe: quarantine + preserve verified pointers
            -> safe: deterministic mapping + trusted gates
                    -> immutable registry version -> atomic registry pointer
                    -> compile route projection -> immutable compiled version
                    -> atomic compiled pointer / known-good update
        -> routeContextPrompt reads verified compiled pointer + capsule
        -> scenario compares observed registry/route semantics with clean full-build oracle

crash/corruption at any publication boundary
        -> journal / pointer validation -> verified LKG recovery
        -> authoritative disk rescan -> later valid event advances

release CLI
        -> validate matrix schema/unique primary ownership/evidence freshness
        -> execute correctness groups
        -> execute isolated latency group
        -> emit deterministic privacy-safe report with exact versions and gate outcomes
```

### Recommended Project Structure

```text
src/
├── lifecycle/router-lifecycle.mjs       # extend owned install/upgrade/disable lifecycle
├── registry/watcher.mjs                 # production event-to-activation orchestration
├── prompt/compile-index.mjs             # retain strict read-only hot-path loader
├── prompt/publish-index.mjs             # recommended control-plane compiler/publisher
└── release/run-release.mjs              # recommended one-command gate orchestrator
release/
└── v1.2-matrix.json                     # requirement ownership + executable evidence
tests/
├── router.autonomous-lifecycle.test.mjs # shared dual-runtime scenario table
├── router.lifecycle-recovery.test.mjs   # crash/LKG/later-advance cases
├── router.installer-coexistence.test.mjs# install/upgrade/reinstall/disable/uninstall
└── router.v12-release.test.mjs          # matrix/report contract
```

Names are recommendations within planner discretion; responsibilities and seams are the important constraint. [VERIFIED: existing project organization]

### Pattern 1: Shared scenario contract, runtime-specific fixture adapters

Represent the seven required operations once, with per-runtime builders/mutators and an expected semantic projection. Each case must mutate actual files, wait on a bounded observable generation/pointer change, read the installed active registry and compiled route, then build a clean full registry for comparison. [VERIFIED: `18-CONTEXT.md` D-01 through D-03]

```js
for (const runtime of ['claude', 'codex']) {
  for (const scenario of lifecycleScenarios) {
    await scenario.mutate(fixture[runtime]);
    await awaitGeneration({ statusPath, after: priorGeneration, deadlineMs: 2_000 });
    assertEquivalent(readActiveRegistry(), buildFullRegistry(fixture.options).registry);
    assert.deepEqual(routeContextPrompt(scenario.prompt), scenario.expectedRoute);
  }
}
```

The example is a prescriptive codebase pattern, not an external API claim. [VERIFIED: existing lifecycle/full-build/route APIs]

### Pattern 2: Two-artifact publication with an explicit version tuple

Registry and compiled-index publication are separate immutable stores today. The control plane should bind their versions in durable metadata and publish only verified complete components; readers continue to validate the component they consume. Release evidence must record registry, compiled-index, policy, and corpus versions together. [VERIFIED: activation metadata, compiled-index metadata, performance exact-version contract]

Avoid a mixed tuple by ordering durable writes before pointer changes and by crash-testing every boundary. If a single atomic pointer cannot cover both stores, a small immutable release/version manifest should identify the verified tuple and recovery should restore a tuple known to be mutually compatible. [VERIFIED: `18-CONTEXT.md` D-05/D-12; implementation recommendation based on current split stores]

### Pattern 3: One command, staged child processes

The release runner should validate the matrix first, run deterministic correctness groups, then launch latency/calibration in a dedicated child to avoid scheduler contention, and finally atomically write a canonical report. A failure, skip, timeout, stale evidence file, missing test, or version mismatch returns nonzero. [VERIFIED: fresh contention failure and D-11]

### Anti-Patterns to Avoid

- **Helper-only lifecycle tests:** Calling `diffFingerprintTrees`, `reconcileCandidate`, or `activateCandidate` directly cannot prove installed watcher propagation. Use those only for focused unit coverage. [VERIFIED: D-01]
- **Fixture-published compiled state as E2E evidence:** Phase 17 fixtures prove the reader but not watcher-to-compiler publication. [VERIFIED: `tests/router.compiled-evolution.test.mjs`]
- **Arbitrary sleeps:** Wait for a generation, lifecycle hash, version id, or controller status with a hard deadline. [VERIFIED: D-02 and existing `waitUntil` pattern]
- **Snapshotting only file names:** Coexistence needs byte/semantic snapshots of unrelated files and active state in both homes. [VERIFIED: D-07 through D-09]
- **One giant parallel `node --test` invocation for latency:** It can create a false REL-01 failure from host contention. [VERIFIED: fresh 28.49 ms p95 result]
- **Markdown verification as release authority:** Reports must be generated from current executable results and immutable versions. [VERIFIED: D-11/D-12]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Registry identity/equivalence | New Phase 18 registry model | `buildFullRegistry`, stable schema/identity | Existing canonical bytes are the requirement oracle. |
| Event coalescing | Sleep-based queue | `createRegistryWatcher` drain/flush/max-latency seam | Existing single-flight and repair behavior is tested. |
| Safety verdicts | Scenario-specific booleans | `reconcileCandidate` and mapping safety | Preserves structured fail-closed reasons. |
| Atomic activation/recovery | Copy-over files | `activate.mjs` immutable versions, pointer CAS, journal | Existing crash and integrity invariants. |
| Prompt route simulation | Expected-value callback | `routeContextPrompt` with a verified compiled index | Avoids tautological quality evidence. |
| Latency math | New percentile implementation | `measureRoutes` / `assessCalibration` | Existing exact versions and strict ceilings. |
| Installer ownership | Path-prefix deletion | Existing manifest fingerprints/bindings | Prevents removal of unrelated or user-modified files. |
| Release traceability | Hard-coded prose table | Machine-readable matrix validated by executable code | Enables uniqueness, freshness, and missing-evidence failures. |

## Common Pitfalls

### Pitfall 1: Registry activation is mistaken for prompt-route propagation
**What goes wrong:** A watcher test observes a new `active.json` registry version and declares the route updated, although prompt routing reads `compiled-index/active.json`.  
**How to avoid:** Add/control a compiler-publisher after registry activation and assert via `routeContextPrompt`.  
**Warning sign:** The E2E test imports no prompt route or only writes compiled fixtures itself. [VERIFIED: current source seam]

### Pitfall 2: Baseline advances after partial publication failure
**What goes wrong:** Later incremental work is computed from state that was never fully published.  
**How to avoid:** Advance the watcher baseline only after candidate/report plus registry/index authority reach their committed state; inject failures at each write/rename.  
**Warning sign:** A failed compiler still changes lifecycle generation or active tuple. [VERIFIED: watcher currently protects paired candidate/report baseline; compiled publication is not yet integrated]

### Pitfall 3: Recovery proves fallback but not continued autonomy
**What goes wrong:** A test restores LKG and stops.  
**How to avoid:** Every recovery scenario ends with a later valid filesystem change and a strictly newer verified tuple. [VERIFIED: D-06]

### Pitfall 4: “Disable” is conflated across capability and installer lifecycle
**What goes wrong:** Capability metadata disable covers CHG-01, but no reversible router installation disable exists for D-07/D-08.  
**How to avoid:** Plan separate fixture operations and explicit installer disable/enable behavior. [VERIFIED: installer CLI exposes install, uninstall, restart; no disable command exists]

### Pitfall 5: Upgrade is treated as ordinary reinstall without version evidence
**What goes wrong:** Repaired files are updated, but atomic upgrade, manifest transition, previous binding restoration, and rollback evidence are not proven.  
**How to avoid:** Seed a vN owned manifest/binding, upgrade to vN+1 with injected failures, assert exact rollback on failure and no duplicate bindings on success. [VERIFIED: current `installRouter` supports repair/idempotency but has no explicit upgrade contract]

### Pitfall 6: Release matrix allows circular or duplicate authority
**What goes wrong:** Multiple rows claim primary ownership or a test only checks that the matrix says it passed.  
**How to avoid:** Exactly one primary phase/evidence group per requirement; secondary evidence is labeled; every command is executed and its current result captured. [VERIFIED: D-10/D-11]

### Pitfall 7: Privacy-safe source code but leaky report
**What goes wrong:** Temp absolute paths, prompts, environment values, or raw failures enter the release artifact.  
**How to avoid:** Allowlist report fields and normalize evidence to test ids, hashes, versions, durations, counts, and reason codes. [VERIFIED: project privacy constraints and D-12]

## Existing Reuse Points and Concrete Gaps

| Area | Reuse now | Gap Phase 18 must plan |
|---|---|---|
| Watcher lifecycle | Real installed controller, bounded debounce/repair, status lifecycle hash | Seven operations × two runtimes through one table; current lifecycle E2E covers only additions. |
| Full-build equivalence | `buildFullRegistry` and existing mutation unit matrix | Assert after every installed-controller event, including route semantics. |
| Registry safety | Reconcile/map/verify/activate pipeline | Crash/corrupt/missed-event integration and later valid advance. |
| Compiled routing | Strict loader and real `routeContextPrompt` calibration | Production compiler/publisher from activated registry is absent. |
| Registry recovery | LKG selection, pointer CAS, rollback journal | Sample readers during injected failures and bind recovery to compiled tuple. |
| Installer | Manifest, idempotent reinstall, transactional rollback, conservative uninstall | Explicit upgrade and reversible disable; independent/together runtime coexistence matrix. |
| Release evidence | Phase 10 static release map and Phase 17 verification commands | v1.2 JSON matrix, unique ownership validation, executable aggregate runner, deterministic report. |

All gap statements were established by source/test inspection rather than inferred from planning summaries. [VERIFIED: codebase grep and focused reads]

## Code Examples

### Observable bounded polling

```js
async function waitForVersion(readVersion, previous, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const current = readVersion();
    if (current && current !== previous) return current;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`version did not advance within ${timeoutMs} ms`);
}
```

Use polling only around externally running installed controllers; focused watcher unit tests should prefer the existing controllable scheduler and `flush()` seam. [VERIFIED: lifecycle and watcher tests]

### Matrix ownership validation

```js
const required = new Set(requirementInventory.map(item => item.id));
for (const id of required) {
  const entries = matrix.filter(entry => entry.requirement === id);
  assert.equal(entries.filter(entry => entry.ownership === 'primary').length, 1);
  assert.ok(entries.every(entry => existsSync(entry.test_file)));
}
assert.deepEqual(new Set(matrix.map(entry => entry.requirement)), required);
```

The runner must additionally execute each evidence command; file existence alone is insufficient. [VERIFIED: D-10/D-11]

## State of the Art

| Existing approach | Phase 18 approach | Impact |
|---|---|---|
| Focused component/unit evidence | Installed dual-runtime lifecycle scenarios | Proves autonomous composition. |
| Registry active pointer and separate compiled fixture publication | Bound registry/index publication tuple | Prevents mixed authority. |
| Install/reinstall/uninstall tests | Full install/upgrade/reinstall/disable/uninstall coexistence matrix | Closes ownership lifecycle. |
| Per-phase markdown verification | Executable machine-readable milestone matrix/report | Independent reproducible release authority. |
| Latency within broad parallel suite | Isolated latency child within one release command | Reduces contention-induced false failure. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| — | None. Recommendations are derived from locked decisions and inspected repository state. | — | — |

## Open Questions (RESOLVED)

All planning-relevant questions are resolved:

1. **Where should compiled publication occur?**
   - What we know: watcher activation is the production safe-change authority; compiled loader is read-only. [VERIFIED: source]
   - Recommendation: add an explicit control-plane compiler/publisher immediately after verified registry activation, with injected dependencies for focused tests and immutable tuple metadata for recovery.
2. **How should “one command” coexist with isolated latency?**
   - What we know: a parallel focused run produced a 28.49 ms p95 false gate, and the same named test passed immediately when rerun alone. [VERIFIED: fresh runs and Phase 17 verification]
   - Recommendation: one release CLI orchestrates multiple child stages; latency runs alone, and the CLI aggregates all results.
3. **Does current installer cover every Phase 18 lifecycle verb?**
   - What we know: install/reinstall repair/uninstall/restart exist; explicit disable and upgrade contracts do not. [VERIFIED: installer source/CLI]
   - Recommendation: Plan 18-02 adds explicit atomic upgrade and reversible disable/enable using the existing manifest and transaction snapshot.
4. **What is authoritative release evidence?**
   - Recommendation: current test process results plus immutable version hashes recorded in a canonical generated report; prior summaries are inputs for test selection only, never pass evidence.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---:|---:|---|
| Node.js | Runtime and tests | ✓ | v22.22.3 | None needed |
| npm | Environment tooling only | ✓ | 10.9.8 | Not used by Phase 18 |
| Network | None | Not required | — | All scenarios are offline |
| External database/service | None | Not required | — | Temp filesystem fixtures |

**Missing dependencies with no fallback:** None. [VERIFIED: environment probes and standard-library implementation]

## Validation Architecture

### Test Framework

| Property | Value |
|---|---|
| Framework | Node built-in `node:test`, Node v22.22.3 |
| Config file | none |
| Quick run command | `node --test tests/router.autonomous-lifecycle.test.mjs tests/router.lifecycle-recovery.test.mjs tests/router.installer-coexistence.test.mjs tests/router.v12-release.test.mjs` |
| Full suite command | `node src/release/run-release.mjs` (recommended single release entry point) |

### Phase Requirements → Test Map

| Requirement group | Behaviors | Existing primary evidence | Phase 18 evidence gap |
|---|---|---|---|
| REG-01/02/03, ADP-01/02, CHG-01/02 | dual-runtime discovery, seven events, timing, equivalence | adapters/build/diff/watcher suites | installed controller matrix and compiled-route observation |
| SAF-09/10, MAP-01/02, ACT-01 | deletion/hook safety, mapping, quarantine, atomic authority | reconcile/map/activate/watcher suites | corrupt/crash/missed-event E2E and later advance |
| CTX-01/02, ORC-01/02 | bounded capsule, resume/override, workflow-first | capsule/resume/orchestrator/compiled suites | include as executable release evidence |
| TOK-01/02 | forbidden broad reads, budgets, reuse, exact bytes | compiled-index/context-budget/compiled-evolution | aggregate current version-bound results |
| EVO-05 | canary promotion and rollback | evolution-canary/compiled-evolution | bind result to release report tuple |
| REL-01 | warm p95 and route max | compiled-evolution/perf-calibration | isolated execution under aggregate command |

### Sampling Rate

- **Per task commit:** run the new focused file plus the closest existing suite.
- **Per wave merge:** run all Phase 18 focused files and all directly reused suites.
- **Phase gate:** run the single release CLI, then `node --test tests/*.test.mjs` as regression evidence; the release CLI should stage latency separately.

### Wave 0 Gaps

- [ ] `tests/router.autonomous-lifecycle.test.mjs` — shared real-filesystem Claude/Codex seven-event contract.
- [ ] `tests/router.lifecycle-recovery.test.mjs` — corruption/interruption/journal/missed-event/continued-advance contract.
- [ ] `tests/router.installer-coexistence.test.mjs` — pre-populated independent/together homes and five lifecycle verbs.
- [ ] `tests/router.v12-release.test.mjs` — 20-requirement matrix/report schema, unique primary ownership, missing/stale/skipped evidence failures.
- [ ] `release/v1.2-matrix.json` (or equivalent) — machine-readable evidence inventory.
- [ ] `src/release/run-release.mjs` (or equivalent) — one aggregate command with isolated latency stage.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---:|---|
| V2 Authentication | no | Local single-user filesystem control plane; no authentication surface added. |
| V3 Session Management | no | No web/session state. |
| V4 Access Control | yes | Manifest-backed ownership, contained roots, exact binding identity, fail-closed authority changes. |
| V5 Input Validation | yes | Existing strict schemas, bounded JSON readers, path containment, version/fingerprint validation. |
| V6 Cryptography | yes | Node `crypto` SHA-256 for integrity fingerprints; do not invent cryptographic primitives. |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| Path traversal/symlink substitution | Tampering | Resolved-root containment, no-follow bounded reads, temp-root tests. |
| Partial/mixed publication | Tampering | Immutable complete versions, atomic pointers, tuple validation, crash injection. |
| Unowned file overwrite/removal | Tampering/Denial | Manifest fingerprints, preflight, transactional rollback, conservative retain. |
| Stale/forged evidence | Spoofing | Candidate/mapping/policy fingerprints, expiry, trusted gate runner ids, exact report versions. |
| Prompt/path leakage in report | Information disclosure | Allowlisted canonical fields and privacy tests. |
| Controller event flood | Denial | Existing debounce, maximum latency, single-flight, periodic repair. |

Security applicability and controls are derived from this local filesystem stack and current enforcement configuration. [VERIFIED: `.planning/config.json`, implementation]

## Plan Recommendations

### Plan 18-01 — Dual-runtime lifecycle E2E

1. Add the control-plane compiled-index publisher and bind it to successful registry activation.
2. Build one table of seven operations with Claude/Codex fixture adapters.
3. Drive installed controllers with real files; wait on observable generations/pointers.
4. After each event, compare active canonical semantics to a clean full build and route a prompt through `routeContextPrompt`.
5. Include unsafe delete/disable/dependency variants that preserve prior dispatch authority.

### Plan 18-02 — Installer, coexistence, and recovery gates

1. Extend the existing lifecycle module with explicit atomic upgrade and reversible disable/enable.
2. Seed unrelated settings, hooks, plugins, skills, arbitrary files, and active state in both homes.
3. Snapshot unrelated bytes/semantics across install, upgrade, reinstall, disable, uninstall independently and together.
4. Inject crashes/corruption before and after registry/index pointer publication, controller interruption, and missed/coalesced events.
5. Assert LKG recovery, no partial reader observation, idempotent repeated recovery, and later valid advancement.

### Plan 18-03 — Final autonomous release matrix

1. Create a canonical 20-requirement matrix with one primary owner and optional secondary evidence.
2. Validate file/command existence, executability, freshness/version binding, no skips, and complete coverage.
3. Run correctness groups, regression, calibration, privacy, coexistence, recovery, context/token gates, then isolated latency.
4. Emit an atomically written deterministic report containing registry/index/policy/corpus versions, matrix hash, exact commands, exit/results, thresholds, measurements, and privacy-safe reason codes.
5. Add negative tests for missing, stale, skipped, duplicate-primary, non-executable, version-mismatched, and nondeterministic evidence.

## Sources

### Primary (HIGH confidence)

- `.planning/phases/18-autonomous-lifecycle-and-release-gates/18-CONTEXT.md` — locked phase decisions and integration boundary.
- `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/PROJECT.md`, `.planning/STATE.md` — milestone scope, 20-requirement inventory, constraints, current status.
- Canonical Phase 12, 13, 14, and 17 context/verification files named by Phase 18.
- `src/lifecycle/router-lifecycle.mjs`, `src/registry/watcher.mjs`, `src/registry/activate.mjs`, `src/prompt/compile-index.mjs`, `src/context/prompt-route.mjs`, `src/evolution/canary-controller.mjs`, `src/evolution/perf-measure.mjs` — current production seams.
- Existing focused tests under `tests/`, especially lifecycle, watcher, activation, compiled index/evolution, context budget, privacy, and Phase 10 release matrix.
- Fresh focused test execution on 2026-07-17: 79 passed, 1 REL-01 latency failure under concurrent file load (p95 28.49 ms); the isolated named latency test then passed.

### Secondary / Tertiary

None. This is codebase-only research; no external documentation or package claims were needed.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — directly inspected runtime, imports, and tests.
- Architecture: HIGH — traced production imports, publication APIs, and real test seams.
- Pitfalls: HIGH — derived from locked decisions, observed implementation gaps, and a fresh test failure.

**Research date:** 2026-07-17  
**Valid until:** End of Phase 18 implementation; refresh if lifecycle, watcher, activation, or compiled publication sources change.
