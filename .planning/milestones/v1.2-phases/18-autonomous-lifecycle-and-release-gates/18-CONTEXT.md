# Phase 18: Autonomous Lifecycle and Release Gates - Context

**Gathered:** 2026-07-17
**Status:** Ready for planning
**Mode:** Auto-selected recommended defaults

<domain>
## Phase Boundary

Prove the v1.2 router as an autonomous, dual-runtime lifecycle: safe Claude and Codex capability changes propagate without intervention, failures preserve or recover verified last-known-good state, installer operations coexist with unrelated runtime state, and one executable release matrix closes every milestone requirement. New routing features and broader learning behavior are out of scope.

</domain>

<decisions>
## Implementation Decisions

[--auto] Selected all gray areas: lifecycle event matrix, failure recovery, installer coexistence, release evidence.

### Lifecycle event matrix
- **D-01:** Exercise add, edit, rename, move, disable, dependency-change, and delete as real filesystem events in isolated temporary Claude and Codex homes; assertions must observe watcher-to-registry-to-compiled-route propagation, not call internal helpers as a substitute.
- **D-02:** Use deterministic polling/event drains with bounded deadlines. Tests may explicitly flush a documented watcher seam, but must not depend on arbitrary sleeps or external network state.
- **D-03:** Require full-build-equivalent registry and routing output after every safe event, including scope, invocation, dependency, and dispatchability semantics. Claude and Codex cases share one scenario contract while retaining runtime-specific fixtures.

### Failure recovery and release authority
- **D-04:** Unsafe candidates, schema corruption, controller interruption, and missed/coalesced events must fail closed: keep the verified active pointer or recover it from the durable journal, then reconcile from authoritative disk state.
- **D-05:** Last-known-good recovery is automatic and idempotent. Readers must never observe a partial candidate, mixed version tuple, or an unverified active index during crash injection.
- **D-06:** Recovery evidence must cover both startup repair and steady-state controller failure, and must prove that a later valid change can still advance after recovery.

### Installer and coexistence contract
- **D-07:** Install, upgrade, reinstall, disable, and uninstall run against pre-populated temporary homes containing unrelated settings, hooks, plugins, skills, and user files. Only router-owned artifacts may change.
- **D-08:** Ownership is explicit and manifest-backed; reinstall is idempotent, upgrade is atomic, disable is reversible, and uninstall removes only owned artifacts while restoring any router-managed binding it replaced.
- **D-09:** Claude and Codex coexistence is verified independently and together. A lifecycle action for one runtime cannot mutate or invalidate the other runtime's unrelated or active state.

### Final release matrix
- **D-10:** Maintain one machine-readable release matrix mapping every v1.2 requirement to concrete tests and evidence; duplicate primary ownership is rejected while cross-cutting secondary evidence is allowed.
- **D-11:** Release passes only when regression, calibration, privacy, coexistence, recovery, warm-latency, hard-route-latency, and context/token gates all pass in one reproducible command. Missing, skipped, stale, or non-executable evidence fails the gate.
- **D-12:** The release report records immutable registry/index/policy/corpus versions and the exact gate results. It must be deterministic, privacy-safe, and suitable for an independent verifier without trusting plan summaries.

### the agent's Discretion
- Exact fixture builders, scenario-table representation, bounded polling intervals, crash-injection mechanism, owned-artifact manifest format, and release-matrix serialization are planner discretion, provided the decisions and measurable roadmap criteria above remain enforced.

</decisions>

<specifics>
## Specific Ideas

- Treat Phase 18 as integration and release proof over the Phase 11-17 production seams, not as a parallel implementation of registry, routing, canary, or recovery logic.
- Prefer compact table-driven fixtures so every lifecycle operation is visibly covered for both runtimes and missing matrix cells fail loudly.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone contract
- `.planning/ROADMAP.md` — Phase 18 goal, four success criteria, and fixed three-plan decomposition.
- `.planning/REQUIREMENTS.md` — authoritative v1.2 requirement inventory and traceability that the release matrix must close.
- `.planning/PROJECT.md` — product scope, core value, constraints, and milestone decisions.

### Inherited safety and evolution decisions
- `.planning/phases/17-compiled-prompt-routing-and-safe-evolution/17-CONTEXT.md` — compiled routing, canary promotion, rollback, version binding, privacy, quality, and latency contracts.
- `.planning/phases/17-compiled-prompt-routing-and-safe-evolution/17-VERIFICATION.md` — independently verified Phase 17 evidence and the real-route gates Phase 18 must preserve.
- `.planning/phases/14-deterministic-mapping-activation-and-rollback/14-CONTEXT.md` — atomic activation, journal, last-known-good, and rollback decisions.
- `.planning/phases/13-target-safety-hook-reconciliation-and-quarantine/13-CONTEXT.md` — fail-closed target safety, hook reconciliation, and quarantine rules.
- `.planning/phases/12-incremental-change-detection-and-watcher/12-CONTEXT.md` — watcher and full-build-equivalence decisions for filesystem changes.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lifecycle/router-lifecycle.mjs`: existing lifecycle/controller seam to drive autonomous propagation and recovery scenarios.
- `src/registry/watcher.mjs`, `src/registry/reconcile.mjs`, `src/registry/activate.mjs`: incremental detection, authoritative reconciliation, immutable activation, journal, and last-known-good mechanics.
- `src/adapters/claude.mjs` and the Codex registry adapter path: runtime-specific discovery/normalization fixtures behind a shared canonical registry contract.
- `src/prompt/compile-index.mjs`, `src/evolution/canary-controller.mjs`, `src/evolution/perf-measure.mjs`: compiled-index publication, promotion/rollback, and release-quality/latency gates.

### Established Patterns
- Hermetic tests use temporary runtime roots and deterministic fixtures; production or real user homes must never be mutated.
- Safe publication is immutable-version plus atomic-pointer based, with strict schema/provenance validation and automatic last-known-good recovery.
- Verification is goal-backward and executable: summaries are not evidence, and test shortcuts cannot stand in for the live routing or lifecycle seam.

### Integration Points
- Lifecycle E2E: filesystem event -> watcher -> canonical registry/reconciliation -> activation -> compiled prompt route.
- Recovery E2E: candidate/controller failure -> journal or active-pointer validation -> last-known-good restore -> authoritative rescan.
- Release gate: requirement traceability -> existing focused suites -> calibration/privacy/coexistence/recovery/latency/token assessments -> deterministic report.

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within the Phase 18 release boundary.

</deferred>

---

*Phase: 18-autonomous-lifecycle-and-release-gates*
*Context gathered: 2026-07-17*
