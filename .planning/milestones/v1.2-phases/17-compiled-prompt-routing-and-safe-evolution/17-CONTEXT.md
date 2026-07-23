# Phase 17: Compiled Prompt Routing and Safe Evolution - Context

**Gathered:** 2026-07-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Connect compact, versioned router state and fresh workflow capsules to the live prompt hot path, then improve routing through privacy-safe telemetry, bounded canaries, automatic promotion, and rollback. The phase must preserve deterministic workflow-first behavior, avoid prompt-time inventory or registry work, and meet the declared routing-quality, context-budget, privacy, and latency gates.

</domain>

<decisions>
## Implementation Decisions

### Compiled-index failure behavior

- **D-01:** The prompt hot path reads only a compact, immutable, versioned index selected by an atomic active pointer plus the bounded fresh capsule required for the selected workflow. It must not scan inventories, compile registries, replay history, or call an external model.
- **D-02:** Missing, stale, corrupt, incomplete, or schema-incompatible active indexes fail closed to the most recent verified compatible known-good index. Candidate or quarantined indexes are never eligible fallback targets.
- **D-03:** If no verified compatible index exists, return a bounded, structured, non-dispatchable result: one focused clarification when user input can resolve the ambiguity, otherwise an actionable diagnostic. Do not silently route through an uncompiled slow path.
- **D-04:** Index freshness and compatibility are proven by bounded metadata and fingerprints. Validation must not require loading the full canonical registry or rebuilding state on the prompt path.

### Telemetry learning boundaries

- **D-05:** Evolution may consume only structured, content-free signals needed to assess routing outcomes: canonical route identity, confidence band, guard and reason codes, fixture class, bounded latency, candidate/policy version, and success/regression verdicts.
- **D-06:** Never persist raw prompts, recovered context bodies, conversation history, secrets, capability payloads, or reversible prompt text. Prompt signatures must be non-reversible and omitted when deny/privacy guards fire.
- **D-07:** Learning is project-scoped by default so local vocabulary and workflows cannot contaminate unrelated projects. A global baseline may evolve separately only from explicitly eligible aggregate signals and must pass the same validation and canary gates before use.
- **D-08:** Signals have bounded retention and decay. Exact windows and minimum sample counts are planner discretion, but stale evidence cannot indefinitely dominate new verified outcomes and low-volume data cannot independently authorize promotion.

### Canary promotion and rollback

- **D-09:** Every signal or weight change produces an immutable candidate tied to its source evidence, policy version, compiled-index version, and reproducible evaluation inputs. Candidates never mutate the active version in place.
- **D-10:** Promotion requires all deterministic safety, privacy, quality, context-budget, compatibility, and latency gates to pass plus a bounded canary evidence window sufficient to distinguish improvement from noise.
- **D-11:** Any hard safety, privacy, corruption, compatibility, or latency-ceiling failure triggers immediate candidate rejection or rollback. Quality regression across the evidence window also rolls back automatically; uncertainty preserves the current known-good version.
- **D-12:** Promotion and rollback reuse the existing durable journal, immutable-version, atomic-pointer, last-known-good, and recovery mechanisms. Readers must never observe a partially published candidate.

### Quality versus latency gates

- **D-13:** Safety and semantic correctness are hard gates, not terms in a weighted score. Minimal-prompt, explicit-override, stale-context, ambiguity, terminal-state, dependency, and context-budget fixtures must preserve their required outcome and dispatch eligibility.
- **D-14:** Latency is an independent hard gate: warm routing p95 must remain below 25 ms and every measured route must remain below 100 ms. Passing quality cannot excuse a latency regression, and lower latency cannot excuse a quality regression.
- **D-15:** Candidate comparisons use a fixed, versioned calibration corpus with deterministic expected outcomes and representative cold/warm measurement protocol. Results record baseline deltas and the exact candidate/index/policy versions evaluated.
- **D-16:** Improvements may reduce context bytes, allocations, or median latency only after all hard correctness gates remain satisfied. Neutral candidates do not auto-promote merely because they are faster; promotion requires demonstrated benefit or a separately justified safety/reliability correction.

### the agent's Discretion

- Exact compiled-index binary or JSON representation, file naming, cache layout, retention/decay durations, minimum canary sample sizes, statistical comparison method, and diagnostic formatting are left to research and planning.
- These choices must preserve D-01 through D-16, reuse existing atomic activation and rollback primitives, remain lightweight Node.js, and keep the prompt hot path deterministic and locally bounded.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Approved architecture and milestone contract

- `.planning/PROJECT.md` — Defines local-first operation, privacy boundaries, prompt-path separation, deterministic behavior, automatic guarded activation, and rollback expectations.
- `.planning/ROADMAP.md` §Phase 17 — Defines the phase goal, Phase 16 dependency, success criteria, and three planned slices.
- `.planning/REQUIREMENTS.md` §Evolution and Reliability — Defines EVO-05 privacy-safe canary evolution and REL-01 routing latency gates; also records prohibited prompt-time classification and unbounded self-modification.

### Inherited phase decisions

- `.planning/phases/14-deterministic-mapping-activation-and-rollback/14-CONTEXT.md` — Locks deterministic mapping precedence, ambiguity behavior, immutable versions, atomic activation, known-good retention, and rollback safety.
- `.planning/phases/15-context-capsules-and-workflow-state-recovery/15-CONTEXT.md` — Locks privacy-safe capsule recovery, explicit override precedence, freshness validation, bounded prompt-path reads, and focused clarification behavior.
- `.planning/phases/16-workflow-first-orchestration-and-context-budgets/16-CONTEXT.md` — Locks workflow-first selection, dependency closure, dispatch eligibility, and least-sufficient context budgets that compiled routing must preserve.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `src/context/prompt-route.mjs`: Existing live seam for referential and explicit prompt routing, capsule loading/refresh, bounded context injection, and structured dispatch eligibility.
- `src/registry/build.mjs`: Existing deterministic canonical build/version primitives that can feed compact compiled-index generation outside the hot path.
- `src/registry/activate.mjs`: Existing immutable-version activation, atomic active-pointer replacement, durable mutation journal, verified known-good fallback, and rollback implementation.
- `router.calibrate.mjs`: Existing deterministic fixture evaluation and evolution-weight calibration seam suitable for candidate and baseline comparisons.
- `tests/router.telemetry.test.mjs`, `tests/router.perf-evolved.test.mjs`, and `tests/router.context-budget.test.mjs`: Existing privacy, telemetry-schema, evolution performance, and bounded-context test patterns.

### Established Patterns

- State-changing publication is staged into immutable candidate versions and exposed through one atomic pointer only after required gates pass.
- Ambiguous, unsafe, stale, incomplete, or unavailable evidence remains non-dispatchable with stable reason codes; lexical or adaptive signals cannot override stronger authoritative evidence.
- Prompt-time context is bounded, structured, and privacy-safe; broad source classes and raw content are rejected before inspection.
- Calibration and evolution are dry-run capable and compare candidates against fixed fixtures without mutating live routing state.

### Integration Points

- Compile a prompt-optimized projection from verified registry and workflow state during build/activation, then load it before or within the live `main(payload) -> inspectDecision()` / `UserPromptSubmit` routing seam.
- Feed fresh capsule identity and workflow facts through `src/context/prompt-route.mjs` without reintroducing planning-directory scans or full registry loads.
- Route approved evolution candidates through the existing registry validation, activation, journal, and rollback pipeline instead of maintaining a second publication mechanism.
- Extend focused telemetry, privacy, calibration, context-budget, prompt-integration, registry-activation, and performance suites with versioned candidate/baseline and automatic rollback coverage.

</code_context>

<specifics>
## Specific Ideas

- Safety-first defaults were approved for all discussion areas.
- Prefer a verified compatible index over any opportunistic slow-path rebuild.
- Use project-scoped adaptive learning with a separately validated global baseline.
- Require an evidence window for normal promotion while rolling back immediately on hard safety, privacy, compatibility, corruption, or latency failures.
- Treat routing quality and latency as independent hard gates rather than one compensating score.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 17-compiled-prompt-routing-and-safe-evolution*
*Context gathered: 2026-07-16*
