# Phase 24: Privacy-Safe Outcomes and Capability Health - Validation

**Authored:** 2026-07-27
**Source:** `24-RESEARCH.md` "Validation Architecture" section
**Purpose:** Dimension 8e (nyquist) gate artifact — maps every HLTH-01..HLTH-11 requirement to its test file(s) + verification command, organized by plan/wave. The Phase 24 nyquist gate is green when every row's automated command passes.

## Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` (built-in) |
| Config file | none — tests are `tests/*.test.mjs` auto-discovered |
| Quick run command | `rtk node --test tests/router.health.*.test.mjs` |
| Full suite command | `rtk node --test tests/*.test.mjs` |

No framework install needed — `node:test` is built-in (Node ≥18 at `/Users/guilherme/.hermes/node/bin/node`).

## Requirements → Test Map (organized by Plan / Wave)

### Plan 24-01 (Wave 1) — HLTH-01, HLTH-02, HLTH-03, HLTH-04

| Req ID | Behavior | Test Type | Test File | Automated Command |
|--------|----------|-----------|----------|-------------------|
| HLTH-01 | Outcome records contain no raw prompts/secrets/outputs/source docs/unbounded arguments | unit | `tests/router.health.outcome-schema.test.mjs` | `rtk node --test tests/router.health.outcome-schema.test.mjs -t "HLTH-01"` |
| HLTH-01 | validateOutcomeEnvelope rejects every forbidden field name (prompt, prompt_text, transcript, output, content, source, argument) with `forbidden_outcome_field` | unit | `tests/router.health.outcome-schema.test.mjs` | `rtk node --test tests/router.health.outcome-schema.test.mjs -t "forbidden_outcome_field"` |
| HLTH-02 | No prompt data/telemetry/health evidence leaves the local machine — no src/health/* module imports node:http/https/net/dns or fetch | unit | `tests/router.health.privacy.test.mjs` | `rtk node --test tests/router.health.privacy.test.mjs -t "HLTH-02"` |
| HLTH-02 | store.createHealthStore sets 0700 on dir + 0600 on every file it creates | unit | `tests/router.health.privacy.test.mjs` | `rtk node --test tests/router.health.privacy.test.mjs -t "0600"` |
| HLTH-02 (W4) | Hot-path isolation test-enforced: `~/.claude/hooks/router.mjs` has NO import statement matching `src/health/` | unit | `tests/router.health.privacy.test.mjs` | `rtk node --test tests/router.health.privacy.test.mjs -t "hot_path_isolation"` |
| HLTH-03 | outcome_kind enum covers exactly 9 dispositions (selected, actually_used, completed, corrected, retried, replaced, abandoned, overridden, helpful_reuse) | unit | `tests/router.health.outcome-schema.test.mjs` + `tests/router.health.tracer.test.mjs` | `rtk node --test tests/router.health.outcome-schema.test.mjs tests/router.health.tracer.test.mjs -t "HLTH-03"` |
| HLTH-03 | validateOutcomeEnvelope rejects invalid outcome_kind with `invalid_outcome_kind` | unit | `tests/router.health.outcome-schema.test.mjs` | `rtk node --test tests/router.health.outcome-schema.test.mjs -t "invalid_outcome_kind"` |
| HLTH-03 | validateOutcomeEnvelope rejects framework-prefixed capability_id (gsd-/gstack-/codex-) with `invalid_capability_id` (Pitfall 3) | unit | `tests/router.health.tracer.test.mjs` | `rtk node --test tests/router.health.tracer.test.mjs -t "invalid_capability_id"` |
| HLTH-04 | Allowlist + retention + decay + perms + corruption checks + bounded compaction | unit | `tests/router.health.outcome-schema.test.mjs` + `tests/router.health.privacy.test.mjs` | `rtk node --test tests/router.health.outcome-schema.test.mjs tests/router.health.privacy.test.mjs -t "HLTH-04"` |
| HLTH-04 | Records older than MAX_RETENTION_MS (7d) filtered out of readWindow, not counted | unit | `tests/router.health.outcome-schema.test.mjs` | `rtk node --test tests/router.health.outcome-schema.test.mjs -t "MAX_RETENTION_MS"` |
| HLTH-04 | state.json writes are atomic (temp+rename+fsync, 0600); outcomes.jsonl is appendFileSync | unit | `tests/router.health.privacy.test.mjs` | `rtk node --test tests/router.health.privacy.test.mjs -t "atomic"` |
| HLTH-04 | Corrupted outcomes.jsonl line is skipped during readWindow with `corrupt_line_skipped` counter, never thrown | unit | `tests/router.health.outcome-schema.test.mjs` | `rtk node --test tests/router.health.outcome-schema.test.mjs -t "corrupt_line_skipped"` |
| HLTH-04 | Bounded compaction drops stale records + appends compaction marker line when outcomes.jsonl exceeds maxBytes | unit | `tests/router.health.outcome-schema.test.mjs` | `rtk node --test tests/router.health.outcome-schema.test.mjs -t "compaction"` |
| Tracer | End-to-end telemetry → observe('selected') → validateOutcomeEnvelope → store.append → admin.inspect with 0600 perms + no raw prompt | integration | `tests/router.health.tracer.test.mjs` | `rtk node --test tests/router.health.tracer.test.mjs` |
| Tracer | privacy_signature_forbidden: deny_filtered record with non-null prompt_signature rejected | unit | `tests/router.health.tracer.test.mjs` | `rtk node --test tests/router.health.tracer.test.mjs -t "privacy_signature_forbidden"` |

### Plan 24-02 (Wave 2) — HLTH-03 (full), HLTH-06, HLTH-07

| Req ID | Behavior | Test Type | Test File | Automated Command |
|--------|----------|-----------|----------|-------------------|
| HLTH-03 (full) | All 9 outcome_kind values derivable from telemetry + workflow-state diff + downstream-invocation signals | unit | `tests/router.health.observe.test.mjs` | `rtk node --test tests/router.health.observe.test.mjs -t "HLTH-03"` |
| HLTH-03 (full) | Cursor incremental ingest idempotent across two unchanged calls (ingested:0, skipped:'unchanged') | unit | `tests/router.health.observe.test.mjs` | `rtk node --test tests/router.health.observe.test.mjs -t "idempotent"` |
| HLTH-03 (full) | Rotated telemetry.jsonl (size shrank) resets cursor, re-ingests from line 0 | unit | `tests/router.health.observe.test.mjs` | `rtk node --test tests/router.health.observe.test.mjs -t "rotation"` |
| HLTH-06 | A capability with 5 'completed' + high reversibility + recent timestamps outscores 50 'abandoned' + low reversibility | unit | `tests/router.health.score.test.mjs` | `rtk node --test tests/router.health.score.test.mjs -t "HLTH-06"` |
| HLTH-06 | signal_breakdown reports recency/reversibility/confidence/opportunity weights + raw outcome_kind counts | unit | `tests/router.health.score.test.mjs` | `rtk node --test tests/router.health.score.test.mjs -t "signal_breakdown"` |
| HLTH-06 | usefulness_basis_points bounded 0..10000 (mirrors confidence_basis_points convention) | unit | `tests/router.health.score.test.mjs` | `rtk node --test tests/router.health.score.test.mjs -t "bounded"` |
| HLTH-06 | Recency uses computeWeightedSamples (exponential half-life): 1h record ~2x weight of 25h record | unit | `tests/router.health.score.test.mjs` | `rtk node --test tests/router.health.score.test.mjs -t "recency"` |
| HLTH-06 (W7) | actually_used outcomes contribute to sample_count and recency; helpful_reuse outcomes are also captured as 'completed' when the workflow advanced, contributing to completion_rate | unit | `tests/router.health.score.test.mjs` | `rtk node --test tests/router.health.score.test.mjs -t "actually_used"` |
| HLTH-07 (D-1) | sample_count < MINIMUM_SAMPLES (30) → tier='unjudged', never 'long_unused'/'ineffective' | unit | `tests/router.health.score.test.mjs` | `rtk node --test tests/router.health.score.test.mjs -t "HLTH-07"` |
| HLTH-07 (D-1) | sample_count=29 → unjudged; sample_count=30 → judged (boundary test) | unit | `tests/router.health.score.test.mjs` | `rtk node --test tests/router.health.score.test.mjs -t "boundary"` |
| HLTH-07 (D-1) | Scorer does NOT read a `rare_role` or extended `lifecycle_role` enum — unjudged tier is the only HLTH-07 protection | unit | `tests/router.health.score.test.mjs` | `rtk node --test tests/router.health.score.test.mjs -t "no_rare_role"` |

### Plan 24-03 (Wave 3) — HLTH-05, HLTH-08, HLTH-09, HLTH-10

| Req ID | Behavior | Test Type | Test File | Automated Command |
|--------|----------|-----------|----------|-------------------|
| HLTH-05 | `router health reset` writes state.json to '{}' atomically (0600) → canonical('health', true, 'reset_ok') | integration | `tests/router.health.admin.test.mjs` | `rtk node --test tests/router.health.admin.test.mjs -t "HLTH-05"` |
| HLTH-05 | `router health dispose` renames state.json → state.disposed.json (recoverable, not deleted) → canonical('health', true, 'dispose_ok') | integration | `tests/router.health.admin.test.mjs` | `rtk node --test tests/router.health.admin.test.mjs -t "dispose"` |
| HLTH-05 | `router health recover` renames state.disposed.json → state.json OR rebuilds from outcomes.jsonl → canonical('health', true, 'recover_rebuilt') | integration | `tests/router.health.admin.test.mjs` | `rtk node --test tests/router.health.admin.test.mjs -t "recover"` |
| HLTH-05 | `router health inspect` still works after reset/dispose/recover cycles | integration | `tests/router.health.admin.test.mjs` | `rtk node --test tests/router.health.admin.test.mjs -t "inspect"` |
| HLTH-05 (W3) | Content-hash regression: SHA-256 of release-tuples/active.json, mode-map.json, registry/registry.json, AND weights.json is byte-identical before/after every admin command | integration | `tests/router.health.admin.test.mjs` | `rtk node --test tests/router.health.admin.test.mjs -t "isolation"` |
| HLTH-05 (W3) | Import gate: no import of src/registry/activate.mjs, src/prompt/publish-index.mjs, src/registry/registry.mjs, or any weights.json write path in src/health/admin.mjs | integration | `tests/router.health.admin.test.mjs` | `rtk node --test tests/router.health.admin.test.mjs -t "import_gate"` |
| HLTH-05 | `router health bogus` → canonical('health', false, 'invalid_subcommand') with exitCode EXIT.usage | integration | `tests/router.health.admin.test.mjs` | `rtk node --test tests/router.health.admin.test.mjs -t "invalid_subcommand"` |
| HLTH-08 | Catalog emits missing_category when registry lacks a capability for a contract-referenced semantic_type | unit | `tests/router.health.catalog.test.mjs` | `rtk node --test tests/router.health.catalog.test.mjs -t "HLTH-08"` |
| HLTH-08 | Catalog emits missing_dependency when contract.dependencies reference unstableCapabilityId not in registry | unit | `tests/router.health.catalog.test.mjs` | `rtk node --test tests/router.health.catalog.test.mjs -t "missing_dependency"` |
| HLTH-08 | Catalog emits unmapped when a capability is in registry but has zero outcome records (never dispatched) | unit | `tests/router.health.catalog.test.mjs` | `rtk node --test tests/router.health.catalog.test.mjs -t "unmapped"` |
| HLTH-08 | Catalog emits stale when contract.freshness === 'stale' | unit | `tests/router.health.catalog.test.mjs` | `rtk node --test tests/router.health.catalog.test.mjs -t "stale"` |
| HLTH-08 | Catalog emits long_unused when sample_count >= MINIMUM_SAMPLES AND newest outcome older than (now - 3*HALF_LIFE_MS) | unit | `tests/router.health.catalog.test.mjs` | `rtk node --test tests/router.health.catalog.test.mjs -t "long_unused"` |
| HLTH-08 (D-2) | duplicate from relationship edge of type 'substitute' with confidence >= MIN_CONFIDENCE (8500) | unit | `tests/router.health.catalog.test.mjs` | `rtk node --test tests/router.health.catalog.test.mjs -t "duplicate"` |
| HLTH-08 (D-2) | overlap from relationship edge of type 'variant' | unit | `tests/router.health.catalog.test.mjs` | `rtk node --test tests/router.health.catalog.test.mjs -t "overlap"` |
| HLTH-08 (D-2) | complementary from relationship edge of type 'composition' | unit | `tests/router.health.catalog.test.mjs` | `rtk node --test tests/router.health.catalog.test.mjs -t "complementary"` |
| HLTH-08 | ineffective: >= 3 consecutive 'corrected'/'retried'/'replaced' + sample_count >= MINIMUM_SAMPLES | unit | `tests/router.health.catalog.test.mjs` | `rtk node --test tests/router.health.catalog.test.mjs -t "ineffective"` |
| HLTH-09 | reusable_workflow: >= 5 consecutive 'completed' outcomes (healthy repetition) + chain length >= floor | unit | `tests/router.health.catalog.test.mjs` | `rtk node --test tests/router.health.catalog.test.mjs -t "HLTH-09"` |
| HLTH-09 | Does NOT emit reusable_workflow when repetition is 'corrected'/'retried' (failure-driven) | unit | `tests/router.health.catalog.test.mjs` | `rtk node --test tests/router.health.catalog.test.mjs -t "failure_repetition"` |
| HLTH-10 | Every observation carries observation_kind, reason_code, evidence_window_ms, sample_size OR opportunity_count, freshness, affected_capability_ids[] (non-empty), confidence_basis_points (0..10000), and remedy | unit | `tests/router.health.catalog.test.mjs` | `rtk node --test tests/router.health.catalog.test.mjs -t "HLTH-10"` |
| HLTH-10 | Every observation's remedy is one of a frozen REMEDIES allowlist (review_contract, reassess_mapping, consider_deprecation, propose_reusable_skill, no_action); never delete/disable/merge/publish | unit | `tests/router.health.catalog.test.mjs` | `rtk node --test tests/router.health.catalog.test.mjs -t "remedy"` |

### Plan 24-04 (Wave 4) — HLTH-11

| Req ID | Behavior | Test Type | Test File | Automated Command |
|--------|----------|-----------|----------|-------------------|
| HLTH-11 | thresholds.mjs exports POLICY_VERSION='health-policy-v1', COOLDOWN_MS, CALIBRATION_CORPUS_VERSION, VERSIONED_WEIGHTS (5 weights), TIER_BOUNDARIES (4 boundaries) | unit | `tests/router.health.canary.test.mjs` | `rtk node --test tests/router.health.canary.test.mjs -t "HLTH-11"` |
| HLTH-11 | thresholds.mjs re-exports HALF_LIFE_MS/MAX_RETENTION_MS/MINIMUM_SAMPLES from evidence.mjs (no redefinition — import-source test) | unit | `tests/router.health.canary.test.mjs` | `rtk node --test tests/router.health.canary.test.mjs -t "import_source"` |
| HLTH-11 | loadThresholds(policy_version) reads versions/<policy_version>/thresholds.json (atomic, 0600); returns null on missing/corrupt | unit | `tests/router.health.canary.test.mjs` | `rtk node --test tests/router.health.canary.test.mjs -t "loadThresholds"` |
| HLTH-11 | loadCalibrationCorpus returns { corpus_version, languages: ['en'] } for v1 (broader multilingual corpus deferred per D-calibration) | unit | `tests/router.health.canary.test.mjs` | `rtk node --test tests/router.health.canary.test.mjs -t "loadCalibrationCorpus"` |
| HLTH-11 (D-canary) | promoteThresholdCandidate with evidence_window.sufficient === false → { status: 'rejected', reason_code: 'insufficient_evidence_samples' }, no write to versions/<policy_version>/ | unit | `tests/router.health.canary.test.mjs` | `rtk node --test tests/router.health.canary.test.mjs -t "insufficient"` |
| HLTH-11 (D-canary) | promoteThresholdCandidate with validated+ sufficient evidence AND all 6 REQUIRED_GATES passing → { status: 'promoted', policy_version, fingerprint }, atomic 0600 write to versions/<policy_version>/ | unit | `tests/router.health.canary.test.mjs` | `rtk node --test tests/router.health.canary.test.mjs -t "promoted"` |
| HLTH-11 (D-canary) | A candidate failing any of the 6 gates (safety, privacy, quality, context_budget, compatibility, latency) is rejected with that gate's reason_code | unit | `tests/router.health.canary.test.mjs` | `rtk node --test tests/router.health.canary.test.mjs -t "gate_rejection"` |
| HLTH-11 (D-canary) | Bridge imports evaluateCandidate + applyCanaryDecision + REQUIRED_GATES from canary-controller.mjs (no parallel gate suite in src/health/canary-bridge.mjs) | unit | `tests/router.health.canary.test.mjs` | `rtk node --test tests/router.health.canary.test.mjs -t "no_parallel_gates"` |
| HLTH-11 | score.mjs imports VERSIONED_WEIGHTS from thresholds.mjs (no inline weight numbers — grep for literal 0.30/0.25/0.20/0.15/0.10 → no matches) | unit | `tests/router.health.canary.test.mjs` + `tests/router.health.score.test.mjs` | `rtk node --test tests/router.health.canary.test.mjs tests/router.health.score.test.mjs -t "no_inline_weights"` |
| HLTH-11 | versions/active.json pointer lives under ~/.claude/router/health/versions/, isolated from release-tuples/active.json (D-5) | unit | `tests/router.health.canary.test.mjs` | `rtk node --test tests/router.health.canary.test.mjs -t "isolated"` |

## Sampling Rate

- **Per task commit:** `rtk node --test tests/router.health.*.test.mjs`
- **Per wave merge:** `rtk node --test tests/*.test.mjs`
- **Phase gate (Dimension 8e nyquist):** full suite green before `/gsd-verify-work`

## Wave 0 Test Scaffolding Gaps

All test files are created by the plans themselves (TDD: tests written before/alongside implementation). No Wave 0 scaffolding needed beyond what each plan's `<tasks>` already specify:

- [ ] `tests/router.health.outcome-schema.test.mjs` — covers HLTH-01/03/04 (created by Plan 24-01 Task 2)
- [ ] `tests/router.health.privacy.test.mjs` — covers HLTH-02 + W4 hot-path isolation (created by Plan 24-01 Task 2)
- [ ] `tests/router.health.tracer.test.mjs` — end-to-end tracer (created by Plan 24-01 Task 1)
- [ ] `tests/router.health.observe.test.mjs` — covers full HLTH-03 observation capture (created by Plan 24-02 Task 1)
- [ ] `tests/router.health.score.test.mjs` — covers HLTH-06/07 (created by Plan 24-02 Task 2)
- [ ] `tests/router.health.catalog.test.mjs` — covers HLTH-08/09/10 (created by Plan 24-03 Task 1)
- [ ] `tests/router.health.admin.test.mjs` — covers HLTH-05 + W3 content-hash isolation (created by Plan 24-03 Task 2)
- [ ] `tests/router.health.canary.test.mjs` — covers HLTH-11 (created by Plan 24-04 Task 1, extended by Task 2)
- [ ] No framework install needed — `node:test` is built-in.

## Phase Gate Verification Commands

Run in order; all must be green before `/gsd-verify-work`.

```bash
# 1. Full Phase 24 suite (all 8 test files across Plans 24-01..04)
rtk node --test tests/router.health.tracer.test.mjs tests/router.health.outcome-schema.test.mjs tests/router.health.privacy.test.mjs tests/router.health.observe.test.mjs tests/router.health.score.test.mjs tests/router.health.catalog.test.mjs tests/router.health.admin.test.mjs tests/router.health.canary.test.mjs

# 2. HLTH-02 invariant: no network primitives in src/health/*
grep -rE "import.*(node:http|node:https|node:net|node:dns|fetch)" src/health/ | grep -v '^#' | grep -c .   # must be 0

# 3. D-5 scope isolation: no admin/publish-index/registry.mjs/weights.json imports in src/health/admin.mjs
#    (scoped to admin.mjs + escaped dot so legitimate src/registry/identity.mjs imports elsewhere in src/health/ do not false-positive)
grep -nE "import.*(activate|publish-index|registry\.mjs|weights\.json)" src/health/admin.mjs | grep -v '^#' | grep -c .   # must be 0

# 4. D-canary: no parallel gate suite in canary-bridge.mjs
grep -nE "REQUIRED_GATES\s*=" src/health/canary-bridge.mjs | grep -v '^#' | grep -c .   # must be 0

# 5. W4 hot-path isolation: router hook does not import src/health/
grep -nE "import.*src/health/" ~/.claude/hooks/router.mjs | grep -v '^#' | grep -c .   # must be 0

# 6. W3 isolation: no import of registry.mjs or weights.json write path in src/health/admin.mjs
grep -nE "import.*registry\.mjs|weights\.json" src/health/admin.mjs | grep -v '^#' | grep -c .   # must be 0

# 7. D-6 name collision: no bare `outcome` persisted field
grep -nE "\boutcome\b(?!_kind)" src/health/observe.mjs src/health/score.mjs src/health/catalog.mjs src/health/admin.mjs | grep -v '^#' | grep -c .   # must be 0

# 8. Perms: outcomes.jsonl is 0600 after a tracer run
ls -l ~/.claude/router/health/outcomes.jsonl   # mode must be -rw------- (0600)
```

## Cross-Plan Invariants (verified across all 4 plans)

| Invariant | Source | Verified By |
|-----------|--------|-------------|
| Field name is `outcome_kind`, never bare `outcome` (D-6, Pitfall 2) | 24-01..04 | Phase gate command #7 |
| No src/health/* module imports a network primitive (HLTH-02) | 24-01..04 | Phase gate command #2 |
| admin.mjs does NOT import activate.mjs / publish-index.mjs / registry.mjs (D-5) | 24-03 | Phase gate commands #3 + #6 |
| No parallel gate suite in canary-bridge.mjs (D-canary) | 24-04 | Phase gate command #4 |
| Router hook does NOT import src/health/ (Pitfall 1, W4) | 24-01 | Phase gate command #5 |
| Content hash of 4 protected artifacts unchanged by every admin command (W3, Pitfall 6) | 24-03 | `tests/router.health.admin.test.mjs -t "isolation"` |
| Thresholds re-export (not redefine) evidence.mjs decay constants | 24-04 | `tests/router.health.canary.test.mjs -t "import_source"` |