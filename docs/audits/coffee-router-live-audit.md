# Coffee Router Live Audit

> Router-only conclusions and improvement priorities are maintained in
> `docs/audits/coffee-router-system-audit.md`. Website implementation evidence
> below is retained only as historical outcome evidence and is not the audit
> subject.

Status: live checkpoint; the Coffee autonomous session is still running.
Checkpoint: 2026-08-02T18:49:33+01:00
Coffee root session: `019fc33c-b359-77f1-b2f5-f8e235765ad5`
Coffee project: `/Users/guilherme/Desktop/ClaudeCode/Coffee`

## Scope

Audit the observable behavior of the Router-enabled Codex/GSD run: user prompts,
Router recommendations, skills and agents used, command correctness, token and
tool efficiency, implementation quality, safety, and verification evidence.
Private chain-of-thought is not available and is not part of this audit.

## Current project state

- Phase 1, Static Foundation & Content Truth, is complete and independently
  rechecked with 6/6 Node tests passing.
- Phase 2, Mobile Visitor Information Flow, is planned and still in progress.
- Live Astro server returns HTTP 200 with one `h1`, one `main`, four sections,
  six explicit placeholders, no actionable phone/map links, and no images yet.
- Missing business facts remain non-actionable instead of being fabricated.
- Current worktree activity is limited to GSD state plus untracked research and
  brainstorming caches at this checkpoint.
- Browser control was unavailable to this auditor, so visual quality remains
  unscored. CSS/static contracts are evidence, not a substitute for a rendered
  responsive and accessibility pass.

## Prompt assessment

The main build prompt is strong: it names the business, page purpose, section
structure, mobile actions, palette, accessibility basics, restraint, and the
critical rule not to invent missing facts. This directly produced safe
placeholders and a small static architecture.

The prompt omits the real address/contact/hours/images, target language,
deployment target, and measurable performance/accessibility thresholds. Those
omissions explain why the current page is a placeholder foundation rather than
a complete visitor experience. Repeated replies of `1` also provide little
routing signal, although the surrounding GSD workflow preserved context.

An earlier Coffee session did not follow the request precisely: the user asked
only for a reusable prompt, but the agent entered brainstorming and created
project artifacts before being corrected. That is prompt-execution overhead,
not a Router success.

## Router contribution

- The user explicitly invoked `$gsd-new-project`; Router-build did not need to
  discover the primary workflow.
- One actual Router recommendation was observed: high-confidence
  `gsd-resume-work` after a resumed/compacted turn. The session loaded that
  skill and continued successfully. This was relevant and useful.
- Router-build did not select the downstream agents. GSD orchestration did.
- No evidence shows Router selecting `frontend-design`, `impeccable`,
  `ui-ux-pro-max`, or another taste skill. Their names appearing in the
  available-skills catalog do not count as use.
- Current evidence therefore proves useful resume routing, but not broad skill
  optimization or material savings across the website build.

## Efficiency snapshot

| Metric | Live value | Assessment |
|---|---:|---|
| Root session plus direct child sessions | 24 | Heavy for a simple single-page site |
| Direct child agents | 23 | Broad GSD coverage; substantial orchestration overhead |
| Observable tool calls | 541 | High; final output may justify only part of this cost |
| Detectable failed tool outputs | 18 | Avoidable retry waste plus two useful test-driven failures |
| Detectable `exec_command` calls | 373 | Large command surface |
| Commands beginning with required `rtk` | 107 (28.7%) | Poor AGENTS.md/RTK compliance |
| Root input tokens | 49,158,511 | 98.6% cached; 664,431 uncached |
| Child input tokens | 26,395,144 | 93.9% cached; 1,601,288 uncached |
| Root + child output tokens | 251,492 | High for current implementation scope |

Token totals are cumulative runtime counters. Cached tokens still represent
processed context but should not be treated as equivalent to uncached billing.

The 18 failures include five invalid `tools.send_message` calls from inside the
code-mode wrapper, several JavaScript quoting/syntax errors, multiple stale
`apply_patch` contexts, and two test failures that were subsequently fixed.
The test failures are productive; the tool-schema, quoting, and patch failures
are efficiency defects.

## Agent and quality assessment

Observed roles include project researchers, research synthesizer, roadmapper,
phase researchers, UI researchers/checkers, pattern mappers, planners/checkers,
executors, and a verifier. Role selection is coherent with GSD configuration,
and agents found real issues: an initial UI spec was blocked then corrected,
plans were tightened, generated binding/test bugs were fixed, and Phase 1 was
verified.

The breadth is stronger than necessary for the current one-page result. A final
audit should judge whether later phases turn that up-front cost into a polished,
tested site. At this checkpoint, correctness and safety are strong; delivery
efficiency and Router-specific attribution are weak.

## Preliminary verdict

- Prompt fidelity: good in the main build run; poor in the earlier prompt-only run.
- Routing: correct but mostly user-directed; one useful resume recommendation.
- Agents: capable and well matched, but over-provisioned for current scope.
- Commands: outcomes are mostly productive, but RTK compliance is poor and
  avoidable tool errors are material.
- Safety: strong so far; no invented business facts or unsafe placeholder links.
- Website: structurally sound Phase 1 foundation; visual quality and completed
  visitor actions cannot yet be certified.
- Router-build usefulness: positive but limited evidence; GSD currently deserves
  most of the credit for orchestration and quality gates.

## Final refresh checklist

When the Coffee session finishes, update this file with:

1. Final session/agent/tool/token/failure totals and RTK compliance.
2. Final Router recommendations versus skills actually invoked.
3. Completed Git/GSD state and clean-worktree check.
4. Full tests, build, lint/security evidence, and unresolved defects.
5. Browser checks at mobile/desktop widths, keyboard/focus, console/network,
   accessibility, and screenshots.
6. Prompt requirement traceability and a final Router usefulness/efficiency score.

## Final checkpoint — original autonomous run

Finalized: 2026-08-02
Authoritative baseline: Coffee tag `v1.0`, commit `ca09318`
Excluded comparison work: later direct-skill redesign commit `c5f92e8`

The runtime trace spans 2h31m from the build prompt to the completion message,
or 2h13m from `continue autonomous` to completion. The completed run used 40
direct child-agent sessions across 12 role types, 936 observable tool calls,
693 detectable shell commands, and 24 detectable failed tool outputs. Only 209
commands (30.2%) began with the required `rtk` prefix.

Final cumulative token counters were 117,140,753 input tokens, of which
113,458,944 were cached and 3,681,809 uncached, plus 401,055 output tokens.
Caching was strong, but the overall work/cost ratio was poor for a small static
landing page.

Confirmed workflow skills included `gsd-new-project`, `gsd-resume-work`,
`gsd-plan-phase`, `gsd-ui-phase`, `gsd-execute-phase`, `gsd-verify-work`,
`gsd-audit-milestone`, `gsd-complete-milestone`, execution/branch/worktree
skills, context-mode, and browser control. No invocation of `impeccable`,
`design-taste-frontend`/`taste-skill`, `ui-ux-pro-max`, `frontend-design`, or
`imagegen-frontend-web` occurred during the original build.

The committed baseline builds reproducibly, passes 9/9 tests, has zero reported
npm vulnerabilities, ships no JavaScript, and safely avoids fabricated café
facts. Those are real strengths. They do not make it a finished café site.

Fresh-checkout verification exposed a pipeline defect: `npm test` fails with
`ENOENT dist/index.html` until `npm run build` is executed first. The intended
`npm run build && npm test` sequence passes 9/9, but the published standalone
`test` script is not self-contained and its name overstates what it can run on
a clean checkout.

The independent six-pillar audit scored the result 14/24 with a BLOCKER verdict:
copy 2/4, visuals 2/4, color 3/4, typography 3/4, spacing/responsiveness 3/4,
and experience design 1/4. Core call, WhatsApp, directions, content, and gallery
outcomes were unavailable, verified-value branches were not properly tested,
and no durable screenshot-backed or human design acceptance existed.

### Ranked system improvements

1. **Completion truth:** never count an unavailable fallback or conditional
   branch as a fulfilled visitor outcome. Block milestone archival when the
   requirement says the user *can* perform an action but production data does
   not permit it.
2. **Design-route composition:** a website workflow should combine one primary
   visual-direction skill, one UX/accessibility rubric, and one final polish
   audit. Explicit `$gsd-new-project` should not suppress useful downstream
   design routing.
3. **Complexity-adaptive execution:** route small landing pages through a much
   smaller agent budget. Forty child sessions and 936 tool calls are not
   proportionate to this artifact.
4. **Evidence-backed visual gates:** require mobile/desktop screenshots,
   browser interaction, accessibility checks, and human visual approval before
   claiming polished design or public-launch readiness.
5. **Actual-use observability:** record recommended, invoked, completed, and
   outcome states for every skill/command/agent, with tokens, duration, retries,
   and rejection reason. Recommendation telemetry alone is insufficient.
6. **Command/tool discipline:** enforce `rtk` at the execution boundary and
   prevent unavailable collaboration calls, quoting errors, and stale patch
   retries before they consume a model turn.
7. **Input-provenance checkpoint:** when an image may contain real business
   facts, extract candidates and ask for one owner confirmation. Do not silently
   discard them, but do not treat them as verified either.
8. **Self-contained verification commands:** make `npm test` build its required
   artifact or split source tests from generated-artifact tests explicitly.

Full UI findings: `docs/audits/coffee-final-ui-audit.md`.

## Controlled comparison — direct design skills

Comparison commit: `c5f92e8` (`feat(ui): redesign cafe landing page`)

The direct redesign took 11m52s and used no child agents. It made 56 tool calls,
including 30 shell commands; all 30 used the required `rtk` prefix. Its token
counters were 5,604,652 input (5,438,208 cached and 166,444 uncached) plus
26,160 output. Six detectable tool failures occurred.

Against the original autonomous run, this was approximately 12.7x faster, used
16.7x fewer tool calls, 22.1x fewer uncached input tokens, and 15.3x fewer
output tokens. The independent six-pillar score rose from 14/24 to 17/24:
copy, visuals, and experience each improved by one point; color, typography,
and spacing/responsiveness did not improve.

`impeccable` and `ui-ux-pro-max` were substantively invoked. `taste-skill` was
only partially followed: 420 of 1,207 instruction lines were read and its final
pre-flight was not completed. This means the run demonstrates the value of
targeted design routing, but not a clean test of full compliance with all three
skills.

Independent verification of exact commit `c5f92e8` confirmed a successful
production build, 9/9 passing tests after the build, zero reported npm
vulnerabilities, and a clean Impeccable detector result. The generated page is
3,874 bytes and still contains no JavaScript, images, telephone link, WhatsApp
link, or map link. It therefore remains blocked as a launch-ready café site by
missing verified business content/assets and by the absence of durable,
independently reviewable browser evidence.

The comparison supports the user's efficiency judgment: the original workflow
spent far more time, agents, calls, and tokens for a materially worse UI. It
does not prove a comparison against an unseen ten-minute no-skill artifact, but
the observed 11m52s direct-skill run is a close controlled proxy and produced a
measurable three-point improvement.

Full comparison findings: `docs/audits/coffee-direct-skills-comparison.md`.

## Autonomy extension — two follow-up prompts

Added: 2026-08-02
Latest verified Coffee commit: `5302b34`

This extension separates two concepts that the current Router trace conflates:

- **Autonomy recognition:** did the system understand that the user authorized
  work, rather than asking only for advice?
- **Autonomous execution:** after choosing a route, did the system actually
  invoke the fitting skill/command and finish the safe local work without
  requiring another user prompt?

### Prompt A — content, localization, and supplied image

Prompt timestamp: `2026-08-02T19:07:41.717Z`
Completion: `2026-08-02T19:15:46.082Z` (8m04s)
Commit: `fb52b9c`

The prompt explicitly authorized action: use the supplied image and address,
set hours to 07:00–20:00, remove WhatsApp/social media, wire directions, and
translate the page to Portuguese.

Router recorded a low-confidence pass-through with no suggested mode, skill, or
agent. The working agent nevertheless acted autonomously, read
`design-taste-frontend` and `gsd-quick`, made 39 tool calls, ran 25 shell
commands with 100% RTK compliance, used no child agents, and committed the
requested result. Four detectable tool failures occurred. Token deltas were
4,381,789 input (4,240,384 cached) and 19,686 output.

Result: autonomy recognition by Router **failed**, while autonomous execution by
the host agent **passed**. Router contributed no useful route to this outcome.

The implementation added the supplied 238,938-byte image, Portuguese copy,
address, hours, clickable phone, and Google Maps directions, while removing
WhatsApp/social fields and updating tests. This was a material product
improvement and a proportionate zero-agent execution path.

### Prompt B — identity refinement

Prompt timestamp: `2026-08-02T20:03:24.071Z`
Completion: `2026-08-02T20:07:00.525Z` (3m36s)
Commit: `5302b34`

The prompt asked to remove the empty “Sobre nós” section, try a smaller
image-led identity, approximate the supplied artwork's typography/colors, and
test visual alternatives.

Router injected a medium-confidence recommendation for `/gsd-add-tests` with
`test-driven-development`. This was a semantic false positive: “test different
things” meant visually explore alternatives, not generate automated test
coverage. The agent correctly ignored the route, read `design-taste-frontend`,
made 23 tool calls, ran 10 shell commands with 100% RTK compliance, used no
child agents, and committed the refinement. Three detectable tool failures
occurred. Token deltas were 3,813,409 input (3,602,432 cached) and 9,173 output.

Result: autonomy recognition **passed at the host-agent level**, autonomous
execution **passed**, but Router routing **failed**. The successful outcome is
evidence of model recovery from a bad route, not evidence that Router helped.

### Latest implementation verification

Fresh verification of exact commit `5302b34` confirmed:

- production build succeeds;
- 9/9 tests pass after building;
- npm audit reports zero vulnerabilities;
- Impeccable detector returns no findings;
- generated output contains pt-PT markup, the supplied image, verified address,
  hours, phone link, and Google Maps directions;
- WhatsApp and “Sobre nós” remain absent;
- the page still ships no JavaScript.

The gallery remains intentionally empty, so this is a stronger practical café
page but still not a complete photography/gallery experience.

## Deeper Router autonomy finding

The live hook is architecturally a **prompt recommender**, not an executor.
`formatInjection()` writes model-readable context; its own contract states that
the harness never auto-runs slash commands. Low confidence emits nothing,
medium confidence emits `Recommended: ... Run if fit`, and high confidence
emits an imperative that the model may act on. Actual execution is therefore
delegated to the host model in every tier.

The central defect is that **route confidence** and **execution authority** are
treated as one decision. Confidence answers “how sure are we which capability
fits?” Authority answers “did the user ask us to act, and is the action safe to
perform automatically?” The two follow-up prompts had clear action authority,
but Prompt A produced silence and Prompt B produced an irrelevant suggestion.

Telemetry makes this harder to improve automatically. Both records have
`downstream_invocations: null` and `outcome: null`; the Router cannot tell that
Prompt A used different skills successfully or that Prompt B's recommendation
was ignored as incorrect. The records also report `surface_status:
unconfigured`, with three disabled surface entries.

### Required autonomy policy

| User intent and risk | Router behavior |
|---|---|
| Advice, comparison, explanation, or status | Recommend only; do not mutate |
| Explicit implementation request, safe and reversible local work | Select and invoke automatically |
| Correction during an already authorized autonomous task | Preserve action authority and continue automatically |
| Medium-confidence route for safe local work | Tell the agent to validate fit, then invoke automatically if fit; do not make the user re-prompt |
| Explicitly named skill/command | Invoke it directly or pass through to the platform's native invocation; do not add a competing route |
| Destructive, irreversible, privileged, external publication, credentials, or materially ambiguous scope | Preview or request confirmation |

### Revised ranked improvements

1. **Separate intent, authority, and confidence.** Add independent fields such
   as `intent_mode: act|advise|inspect`, `authority_source:
   explicit|session_autonomous|none`, and `action_policy:
   auto_if_safe|recommend_only|confirm`.
2. **Preserve autonomous-session continuity.** “Continue autonomous” should
   remain valid for later safe corrections until revoked, completed, or blocked
   by a real safety boundary.
3. **Use semantic verb sense and domain context.** Distinguish “test visual
   alternatives” from “add automated tests”; do not route from a shared token
   when the surrounding object and task domain contradict it.
4. **Make medium confidence actionable.** For authorized, reversible local
   work, medium confidence should produce “validate fit and execute,” not a
   passive recommendation that may be ignored.
5. **Close the observability loop.** Record recommendation → invocation or
   rejection → completion → outcome, including the capability actually used,
   reason for divergence, tokens, duration, retries, and user acceptance.
6. **Route continuations compositionally.** A design correction should reuse
   the active design context and primary visual skill instead of starting a
   fresh global BM25 contest across unrelated GSD commands.
7. **Keep safety gates independent.** Automatic safe local execution must not
   weaken confirmation requirements for destructive or externally visible
   actions.
