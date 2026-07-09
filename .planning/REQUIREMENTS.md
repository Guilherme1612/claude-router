# Requirements: Claude Router v1.1

**Defined:** 2026-07-09
**Core Value:** Every user prompt gets routed to the right workflow mode + skills + agents automatically, in <100ms with no external API call.

## v1.1 Requirements

### Route Coverage

- [x] **COV-01**: Operator can audit the full inventory manifest across skills, plugin skills, agents, commands, hooks, and MCP servers.
- [x] **COV-02**: Operator can compare inventory entries against `mode-map.json` and identify high-value unmapped skills, agents, and commands.
- [x] **COV-03**: Router has route clusters for debugging and bugfix work.
- [x] **COV-04**: Router has route clusters for tests and test-generation work.
- [x] **COV-05**: Router has route clusters for code review and audit work.
- [x] **COV-06**: Router has route clusters for UI and design work.
- [x] **COV-07**: Router has route clusters for GitHub, PR, and CI workflows.
- [x] **COV-08**: Router has route clusters for Graphify and codebase-understanding work.
- [x] **COV-09**: Router has route clusters for docs, spec, and planning workflows.
- [x] **COV-10**: Router has route clusters for agent-dispatch workflows.
- [x] **COV-11**: Router has missing-MCP warning flows that use `warn` route entries rather than auto-dispatching blocked agents.
- [x] **COV-12**: Router supports direct `agent` and `warn` route entries where those targets are the correct execution channel.

### Operator Inspection

- [ ] **INS-01**: Operator can run `router inspect "<prompt>"` or an equivalent script to see the normalized prompt, top candidates, raw scores, normalized scores, margin, selected tier, selected route, guards fired, cache hit/miss, graphify status, final injected context, and pass-through reason.
- [ ] **INS-02**: Operator can run `router preview "<prompt>"` to dry-run routing without mutating cache or telemetry.
- [ ] **INS-03**: Operator can run `router explain-last` to explain the most recent recorded route decision from telemetry.
- [ ] **INS-04**: Inspect/preview output exposes enough detail to debug route score ties, threshold misses, guard demotions, cache effects, and graphify decisions without opening router source files.

### Health and Inventory Tools

- [ ] **HLT-01**: Operator can run `router doctor` or an equivalent script to report manifest age, mode-map route coverage, unmapped high-value inventory, missing MCP servers, blocked agents, invalid or stale route targets, installed hook status, cache status, telemetry status, weights status, and last evolution run status.
- [ ] **HLT-02**: Operator can run `router routes` to list all routeable entries with representative examples.
- [ ] **HLT-03**: Operator can run `router unmapped` to show useful inventory not covered by the mode map.
- [ ] **HLT-04**: Operator can run `router coverage` to summarize routeable versus discovered inventory by category.
- [ ] **HLT-05**: Health and coverage tools produce actionable next-fix output rather than only raw counts.

### Codebase Routing and Calibration

- [ ] **CAL-01**: Calibration fixtures include prompts for refactoring a component or module.
- [ ] **CAL-02**: Calibration fixtures include prompts for fixing a bug in a file or function.
- [ ] **CAL-03**: Calibration fixtures include prompts for adding tests.
- [ ] **CAL-04**: Calibration fixtures include prompts for reviewing changed code.
- [ ] **CAL-05**: Calibration fixtures include prompts for tracing data flow.
- [ ] **CAL-06**: Calibration fixtures include prompts for explaining architecture.
- [ ] **CAL-07**: Calibration fixtures include prompts for finding where a feature or behavior is implemented.
- [ ] **CAL-08**: Codebase calibration improves materially beyond the current 2/5 baseline while the original core calibration fixtures remain 10/10.
- [ ] **CAL-09**: Calibration failures are represented as first-class routing targets or fixture gaps, not treated as incidental test noise.

### Telemetry Evolution

- [ ] **EVO-01**: Operator can see why `weight_applied` is currently effectively 0.
- [ ] **EVO-02**: Evolution output is visible from doctor and inspect/preview-style tooling where relevant.
- [ ] **EVO-03**: Operator can run a proposal mode that summarizes recent telemetry misses and suggests mode-map changes without applying them automatically.
- [ ] **EVO-04**: Telemetry-derived proposals preserve privacy constraints and do not expose raw prompt text.

### Runtime Safety

- [ ] **SAF-01**: Hot-path routing remains fail-open on any exception.
- [ ] **SAF-02**: Hot-path routing remains under the existing <100ms target.
- [ ] **SAF-03**: Router does not add a per-prompt external LLM or API classifier.
- [ ] **SAF-04**: Router does not auto-dispatch missing-MCP agents.
- [ ] **SAF-05**: Router changes do not break existing hooks, caveman coexistence, GSD hooks, context-mode hooks, or ralph-loop.
- [ ] **SAF-06**: Operator tools stay outside the hot path.
- [ ] **SAF-07**: Every new command and routing behavior has focused tests.
- [ ] **SAF-08**: Calibration gates remain enforced and include the expanded coverage fixtures.

## Future Requirements

- **FUT-01**: Operator can interactively approve and apply safe mode-map proposals after reviewing diffs.
- **FUT-02**: Router can export coverage and decision reports to a richer dashboard or HTML report.
- **FUT-03**: Router can maintain multiple named routing profiles for different work contexts beyond the current `gsd-surface` reuse.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Per-prompt external LLM/API classifier | Violates the core no-API-call and <100ms hot-path constraint. |
| Auto-dispatch of missing-MCP agents | Known unavailable dependencies should warn and diagnose, not fail at dispatch time. |
| Automatic application of telemetry mode-map mutations | v1.1 proposal mode is advisory; operator approval remains required. |
| New autonomous orchestration loop | Existing GSD, ralph-loop, and agent dispatch primitives remain the execution layer. |
| Hook-side deep inventory scans | Operator diagnostics can be slower; prompt routing cannot. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| COV-01 | Phase 5 | Complete |
| COV-02 | Phase 5 | Complete |
| COV-03 | Phase 5 | Complete |
| COV-04 | Phase 5 | Complete |
| COV-05 | Phase 5 | Complete |
| COV-06 | Phase 5 | Complete |
| COV-07 | Phase 5 | Complete |
| COV-08 | Phase 5 | Complete |
| COV-09 | Phase 5 | Complete |
| COV-10 | Phase 5 | Complete |
| COV-11 | Phase 5 | Complete |
| COV-12 | Phase 5 | Complete |
| INS-01 | Phase 6 | Pending |
| INS-02 | Phase 6 | Pending |
| INS-03 | Phase 6 | Pending |
| INS-04 | Phase 6 | Pending |
| HLT-01 | Phase 7 | Pending |
| HLT-02 | Phase 7 | Pending |
| HLT-03 | Phase 7 | Pending |
| HLT-04 | Phase 7 | Pending |
| HLT-05 | Phase 7 | Pending |
| CAL-01 | Phase 8 | Pending |
| CAL-02 | Phase 8 | Pending |
| CAL-03 | Phase 8 | Pending |
| CAL-04 | Phase 8 | Pending |
| CAL-05 | Phase 8 | Pending |
| CAL-06 | Phase 8 | Pending |
| CAL-07 | Phase 8 | Pending |
| CAL-08 | Phase 8 | Pending |
| CAL-09 | Phase 8 | Pending |
| EVO-01 | Phase 9 | Pending |
| EVO-02 | Phase 9 | Pending |
| EVO-03 | Phase 9 | Pending |
| EVO-04 | Phase 9 | Pending |
| SAF-01 | Phase 10 | Pending |
| SAF-02 | Phase 10 | Pending |
| SAF-03 | Phase 10 | Pending |
| SAF-04 | Phase 10 | Pending |
| SAF-05 | Phase 10 | Pending |
| SAF-06 | Phase 10 | Pending |
| SAF-07 | Phase 10 | Pending |
| SAF-08 | Phase 10 | Pending |

**Coverage:**
- v1.1 requirements: 42 total
- Mapped to phases: 42
- Unmapped: 0

---
*Requirements defined: 2026-07-09*
*Last updated: 2026-07-09 after starting v1.1 milestone*
