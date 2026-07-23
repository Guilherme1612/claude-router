<planning_context>
**Phase:** 18 — Autonomous Lifecycle and Release Gates
**Mode:** gap_closure

You are replanning Phase 18 in GAP-CLOSURE mode. The phase was executed and independently verified; the verifier returned status=gaps_found, 0/4 must-haves verified. Your job: produce NEW plan(s) (or amend existing 18-01/02/03) that close the 4 verification gaps. Do NOT replan the whole phase from scratch — read the existing 3 plans first, then add targeted gap-closure plan(s) (suggest 18-04, 18-05 ... as needed) whose tasks make the 4 gaps pass on re-verification.

<files_to_read>
- .planning/phases/18-autonomous-lifecycle-and-release-gates/18-VERIFICATION.md (VERIFICATION GAPS - THE TARGET. Read every gap, status, reason, artifacts, missing list. Close all 4.)
- .planning/phases/18-autonomous-lifecycle-and-release-gates/18-01-PLAN.md (existing plan 01)
- .planning/phases/18-autonomous-lifecycle-and-release-gates/18-02-PLAN.md (existing plan 02)
- .planning/phases/18-autonomous-lifecycle-and-release-gates/18-03-PLAN.md (existing plan 03)
- .planning/phases/18-autonomous-lifecycle-and-release-gates/18-CONTEXT.md (USER DECISIONS)
- .planning/phases/18-autonomous-lifecycle-and-release-gates/18-RESEARCH.md (Technical Research)
- .planning/phases/18-autonomous-lifecycle-and-release-gates/18-VALIDATION.md (Validation Strategy - Dimension 8)
- .planning/STATE.md (Project State)
- .planning/ROADMAP.md (Roadmap)
- .planning/REQUIREMENTS.md (Requirements)
- ./CLAUDE.md or ./.claude/CLAUDE.md (project instructions)
</files_to_read>

**Phase requirement IDs:** Cross-cutting verification of all v1.2 requirements; no duplicate primary assignment. (Phase 18 is a cross-cutting verification phase — the verification gaps ARE the requirements to close.)

**Security:** ASVS Level 1 enforcement; block on high-severity threats. Each PLAN.md must include a <threat_model> block. Gap-closure plans that only add/extend tests introduce no new attack surface — state that explicitly in the threat model (e.g. "no new attack surface: test-only additions") rather than omitting the block.

**Project instructions:** Read ./CLAUDE.md or ./.claude/CLAUDE.md if either exists — follow project-specific guidelines.
**Project skills:** Check .claude/skills/ or .agents/skills/ directory — read SKILL.md files.

<planner_contributions>
### contribution: ai-integration
# API Coverage Decision Checkpoint

> Full API Coverage by Default — Opt Out, Never Opt In. Fires when a phase
> integrates an external API / SDK / service. Most non-API phases will not fire
> it — that is the point.

## Why this exists

"We integrated the API" too often silently means "we integrated whatever the
first use case exercised." Every un-built capability is then an invisible hole,
discovered later by a user who reasonably expected it to work. The phase sealed
green because its tasks completed; nobody decided the gaps were acceptable,
because nobody enumerated them. This checkpoint makes the surface **visible and
decided** before the phase can seal.

## Detect whether this phase integrates an external API

The detector is a deterministic scan over the phase scope. It strips fenced
code blocks first, so a trigger term inside a code snippet does not fire. It
returns a typed result: `{ detected, signals[], terms }`. Run it on the phase
scope (the concatenation of this phase's ROADMAP section + the PLAN body):

```bash
SCOPE="$(cat "${PHASE_DIR}"/*-PLAN.md 2>/dev/null) $(gsd_run query roadmap.get-phase "${PHASE}" 2>/dev/null || true)"
API_COVERAGE_JSON=$(printf '%s' "$SCOPE" | node gsd-core/bin/lib/api-coverage.cjs --json 2>/dev/null || echo '{"detected":false,"signals":[]}')
```

Read `API_COVERAGE_JSON.detected`. Act on it only — do **not** pattern-match the
prose yourself.

**If `detected` is `false`:** this phase does not integrate an external API. Skip
the checkpoint entirely and continue planning. Do not raise it with the user.

**If `detected` is `true`:** an external-API integration is in scope. You MUST
produce a **coverage matrix** before the plan is finalized.

## Produce the coverage matrix

Enumerate the external API's full **capability surface** — the verb/endpoint/method
list (e.g. for a music service: `search`, `play`, `pause`, `skip`, `set_volume`,
`get_playlist`, `create_playlist`, `add_to_playlist`, …). For each capability
record a decision, starting from **full coverage** as the default:

| capability | decision | reason |
|---|---|---|
| `<capability-id>` | `INTEGRATE` \| `OPT-OUT` | `<one-line reason if OPT-OUT>` |

Rules:

- **`INTEGRATE` is the default.** Every capability starts as INTEGRATE; the
  matrix is the *subtraction record*.
- **Every `OPT-OUT` MUST carry a one-line reason** (`not needed`, `not needed
  yet`, `explicitly out of scope`, …). An opt-out without a reason is an
  un-decided hole — the exact failure mode this gate exists to close.
- **A second integration against the same need** (e.g. a second platform for the
  same capability) starts from the **same full-coverage baseline** as the first.
  Do not carry over the first integration's opt-outs silently — re-decide each
  capability for the new surface, so a first-class/fallback asymmetry cannot
  accumulate.

Write the matrix to `${PHASE_DIR}/COVERAGE.md` (canonical markdown-table form):

```markdown
# API Coverage — <service>

> Full coverage by default. Opt-outs are explicit, reasoned decisions.

| capability | decision | reason |
|---|---|---|
| search | INTEGRATE | |
| playlists | INTEGRATE | |
| skip | OPT-OUT | not needed yet — tracked for follow-up phase |
```

A fenced ` ```coverage ` JSON block is also accepted for machine-generated
matrices; the markdown table is preferred (human-editable, diff-friendly).

## The seal-time gate

This checkpoint is enforced. At `verify:pre` the `api-coverage.verify-pre` gate
runs `check api-coverage.verify-pre <phase-dir>`:

- If `COVERAGE.md` exists, it is validated — every row needs a valid decision and
  every `OPT-OUT` a reason. A malformed/partial matrix **blocks the seal**.
- If `COVERAGE.md` is absent, the detector runs again over the phase scope. If a
  strong external-API-integration signal is found, the seal is **blocked** until a
  matrix is produced. If no signal is found, the phase is treated as a non-API
  phase and the seal proceeds.

So: an API-integrating phase cannot seal without a decided matrix. Produce it at
plan time; do not leave it for seal time.

## Tuning the vocabulary (optional)

The trigger vocabulary is a curated, additive-only set in
`gsd-core/bin/lib/api-coverage.cjs` (`DEFAULT_API_COVERAGE_TERMS`). To widen it
for a project, override at the call site:

```bash
printf '%s' "$SCOPE" | node gsd-core/bin/lib/api-coverage.cjs --json \
  --verbs integrate,wrap,connect,embed --nouns api,sdk,rest,grpc,webhook,plugin
```

The whole checkpoint is toggleable via `workflow.api_coverage_gate` in
`.planning/config.json`.


### contribution: assumption-delta
# Assumption-Delta Architecture Checkpoint

> Advisory, non-blocking. Fires **only** when the phase scope shows a singular→plural / required→optional / derived→chosen transition. When it fires, it surfaces ONE identity-model question before the plan is finalized. Most phases will not fire it — that is the point.

## Why this exists

Most quietly-imported architectural debt does not come from a missing upfront design phase. It comes at the *seam*: a later phase introduces a second case (a second platform, auth method, tenant, region, source of truth) and nobody re-asks whether the original abstraction still names the right thing. The phase that adds the second case is exactly the 20-minute conversation that prevents an afternoon of later cleanup.

## Run the detector

The detector is a deterministic scan over the phase scope text. It strips fenced code blocks first, so a trigger word that appears only inside a code snippet does not fire. It returns a typed result: `{ detected, signals[], terms }`. Resolve it through the `assumption-delta scan` query (same phase-section resolver as `roadmap.get-phase`):

```bash
ASSUMPTION_DELTA_JSON=$(gsd_run query assumption-delta scan "${PHASE}" --json 2>/dev/null || echo '{"detected":false,"signals":[],"terms":{}}')
```

> If the phase section cannot be resolved (no `ROADMAP.md` / unknown phase), the query emits `{ "detected": false, ... }` — the checkpoint does not fire. Do not block on it.
>
> Optional tuning — pass `--terms <comma-list>` to replace the curated pluralization cues for this project (the `optional`/`chosen` cues keep their defaults): `gsd_run query assumption-delta scan "${PHASE}" --json --terms second,alternative,fallback`.

## Decision branch

Read `ASSUMPTION_DELTA_JSON`. Act on `detected` only — do **not** pattern-match the human prose.

**If `detected` is `false`:** this phase does not change a core assumption. Skip the checkpoint entirely and continue planning. Do not raise it with the user.

**If `detected` is `true`:** a core assumption may have lost its monopoly. The `signals[]` array tells you which family fired:

| `kind` | What changed | The question to answer |
|---|---|---|
| `pluralization` | A second X was introduced where there was one (second platform / auth method / tenant / region / source of truth) | Does the current primary key / identity model still name the right noun? |
| `optional` | A required / `only` field became optional | Is the field still the right anchor, or has the anchor moved? |
| `chosen` | A derived value became chosen, or a constant became a parameter | Has a configuration decision become a modeling decision? |

Before finalizing the plan, answer this for the user and record the decision explicitly:

> **Promote vs. add-alongside.** The usual correct move when a generalization occurs is to **promote** the new general representation to the primary and **demote** the old specific one to a detail of one variant — *not* to add the new one alongside the still-required old one. Adding alongside silently contradicts the generalized intent (a later variant that does not fit the old primary can be stored but never confirmed as a default).

Record the outcome in the PLAN.md front matter / a `<assumption_delta_decision>` block:

- The **noun** that is now primary (the generalized identity).
- The **decision**: `promote` | `add-alongside` | `no-change`, with a one-line rationale.
- If `add-alongside`: call it out as accepted debt and note what would force a later promote.

## Optional companion: an invariant test

When `detected` is `true`, suggest (do not require) a contract/invariant test that encodes the now-generalized intent — e.g. *"every confirmed default round-trips through the primary use-path, for every supported variant."* That test goes red the instant a future phase reintroduces the singular assumption, so the regression cannot land silently. If the user accepts, add the test as a task in the plan.

## Tuning the vocabulary (optional)

The trigger vocabulary is a curated, additive-only set in `gsd-core/bin/lib/assumption-delta.cjs` (`DEFAULT_ASSUMPTION_DELTA_TERMS`). Bare "or" is intentionally excluded — it is too common in prose and would make the gate fire constantly. To widen or narrow the cues for a project, override at the call site with `--terms <comma-list>` (replaces the pluralization cues; `optional`/`chosen` keep defaults). The whole checkpoint is toggleable via `workflow.assumption_delta` in `.planning/config.json`.

This checkpoint is advisory: it informs and records; it never blocks the phase.


### contribution: schema-gate
# Schema Push Detection Gate

> Detects schema-relevant files in the phase scope and injects a mandatory `[BLOCKING]` schema push task into the plan. Prevents false-positive verification where build/types pass because TypeScript types come from config, not the live database.

Check if any files in the phase scope match schema patterns:

```bash
PHASE_SECTION=$(gsd_run query roadmap.get-phase "${PHASE}" --pick section 2>/dev/null)
```

Scan `PHASE_SECTION`, `CONTEXT.md` (if loaded), and `RESEARCH.md` (if exists) for file paths matching these ORM patterns:

| ORM | File Patterns |
|-----|--------------|
| Payload CMS | `src/collections/**/*.ts`, `src/globals/**/*.ts` |
| Prisma | `prisma/schema.prisma`, `prisma/schema/*.prisma` |
| Drizzle | `drizzle/schema.ts`, `src/db/schema.ts`, `drizzle/*.ts` |
| Supabase | `supabase/migrations/*.sql` |
| TypeORM | `src/entities/**/*.ts`, `src/migrations/**/*.ts` |

Also check if any existing PLAN.md files for this phase already reference these file patterns in `files_modified`.

**If schema-relevant files detected:**

Set `SCHEMA_PUSH_REQUIRED=true` and `SCHEMA_ORM={detected_orm}`.

Determine the push command for the detected ORM:

| ORM | Push Command | Non-TTY Workaround |
|-----|-------------|-------------------|
| Payload CMS | `npx payload migrate` | `CI=true PAYLOAD_MIGRATING=true npx payload migrate` |
| Prisma | `npx prisma db push` | `npx prisma db push --accept-data-loss` (if destructive) |
| Drizzle | `npx drizzle-kit push` | `npx drizzle-kit push` |
| Supabase | `supabase db push` | Set `SUPABASE_ACCESS_TOKEN` env var |
| TypeORM | `npx typeorm migration:run` | `npx typeorm migration:run -d src/data-source.ts` |

Inject the following into the planner prompt (step 8) as an additional constraint:

```markdown
<schema_push_requirement>
**[BLOCKING] Schema Push Required**

This phase modifies schema-relevant files ({detected_files}). The planner MUST include
a `[BLOCKING]` task that runs the database schema push command AFTER all schema file
modifications are complete but BEFORE verification.

- ORM detected: {SCHEMA_ORM}
- Push command: {push_command}
- Non-TTY workaround: {env_hint}
- If push requires interactive prompts that cannot be suppressed, flag the task for
  manual intervention with `autonomous: false`

This task is mandatory — the phase CANNOT pass verification without it. Build and
type checks will pass without the push (types come from config, not the live database),
creating a false-positive verification state.
</schema_push_requirement>
```

Display: `Schema files detected ({SCHEMA_ORM}) — [BLOCKING] push task will be injected into plans`

**If no schema-relevant files detected:** Skip silently.


### contribution: security
Each PLAN.md must include a <threat_model> block when security enforcement is active. Use the configured ASVS level and blocking threshold from workflow.security_asvs_level and workflow.security_block_on.
</planner_contributions>

<agent_skills_planner>

</agent_skills_planner>

<downstream_consumer>
Output consumed by /gsd-execute-phase. Plans need:
- Frontmatter (wave, depends_on, files_modified, autonomous)
- Tasks in XML format with read_first and acceptance_criteria fields (MANDATORY on every task)
- Verification criteria
- must_haves for goal-backward verification (each gap you close becomes a must_have truth with explicit, checkable verification)
- If the SPEC has an ## Edge Coverage section, lift covered edges into must_haves.truths as plain strings and backstop edges as { statement, verification: backstop } flat-scalar markers.
- "Artifacts this phase produces" section (MANDATORY) — list every symbol/file this gap-closure creates (test file paths, new test cases, helper functions).
</downstream_consumer>

<deep_work_rules>
Every task MUST include:
1. <read_first> — files executor must read first (always include the file being modified, e.g. tests/router.autonomous-lifecycle.test.mjs, tests/router.lifecycle-recovery.test.mjs, and the source under test).
2. <acceptance_criteria> — verifiable, NEVER subjective. Use test-command assertions ("test file exits 0", "node --test tests/router.autonomous-lifecycle.test.mjs exits 0"), source assertions ("tests/router.autonomous-lifecycle.test.mjs contains ..."), behavior assertions. Exact strings/patterns/commands.
3. <action> — concrete identifiers, not references. Name the exact test file, the exact seam to drive (installed watcher→controller→publishCompiledIndex, NOT manual publishCompiledIndex calls), the exact recovery variant (D-04/D-05/D-06), the exact coexistence verb (install/upgrade/reinstall/disable/uninstall). No fenced code blocks or full implementations in <action>.

Why: executor works from plan text. Vague "improve test coverage" produces shallow work. Concrete "drive installed watcher→controller seam for all 7 ops across both runtimes, assert tuple+route advance, remove manual publishCompiledIndex calls at lines 65-74" produces complete work.
</deep_work_rules>

<gap_closure_specifics>
The 4 gaps to close (read VERIFICATION.md for full detail):
1. Watch→compiled publication seam: tests manually call publishCompiledIndex for every safe event instead of observing watcher-to-compiled publication through the public installed dispatch seam. Fix: remove fixture-side compiled publication; assert installed controller advances tuple+public route after all 7 ops for both runtimes; assert scope/invocation/dependency/target/dispatchability semantics from controller-published tuple.
2. Recovery matrix incomplete: only corrupt-active-pointer + before/after-active-pointer-crash. Fix: add D-04/D-05/D-06 recovery matrix through installed watcher/controller + public registry + prompt readers; inject every publication boundary; prove later valid advancement after each recovery class (unsafe candidate, corrupt registry/index/schema/hash, missed/coalesced events, startup+steady-state repair, all-reader old-or-new tuple sampling).
3. Coexistence 5-verb matrix incomplete: missing install/reinstall/uninstall with unrelated plugins/skills/user files + binding restoration + together-mode isolation + complete unrelated-state byte snapshots + post-pointer crash sampling. Fix: execute all 5 verbs independently and together.
4. Full workspace 1/607 failing + gate synthesis masks missing coverage (lines 96-108 synthesize passing gate_results from child exit success). Fix: make the 1 failing test pass AND ensure gate results reflect real behavioral coverage, not synthesized child-exit success.

Map each gap to a must_haves.truths entry with explicit verification (test command + assertion). The verifier will re-run goal-backward analysis against these truths.
</gap_closure_specifics>

<quality_gate>
- [ ] PLAN.md files created/appended in phase directory (18-04+ or amended 18-01/02/03)
- [ ] Each plan has valid frontmatter (wave, depends_on, files_modified, autonomous, requirements)
- [ ] Every task has <read_first> with at least the file being modified
- [ ] Every task has <acceptance_criteria> with test-command/source/behavior assertions (NEVER subjective)
- [ ] Every <action> contains concrete identifiers (test file paths, seam names, variant IDs, verb names) without fenced code blocks
- [ ] Dependencies/waves assigned
- [ ] must_haves derived from the 4 verification gaps (each gap → a truth with explicit verification)
- [ ] Each PLAN.md includes "Artifacts this phase produces" section
- [ ] Each PLAN.md includes <threat_model> block (note no-new-attack-surface for test-only plans)
- [ ] No requirement/decision silently dropped
</quality_gate>
</planning_context>

Execute gap-closure planning now. Read the brief files above, then write the gap-closure PLAN.md file(s) into the phase directory. Return ## PLANNING COMPLETE with the plan count and which gaps each plan closes, or ## PLANNING INCONCLUSIVE if blocked.
