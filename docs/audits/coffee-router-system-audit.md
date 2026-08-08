# Router-build System Audit — Coffee Workload

**Scope:** Router-build only  
**Workload:** Café o Alexandre website session  
**Excluded:** visual-design scoring, page content quality, and implementation
details except where they prove whether a route produced a useful outcome

## Executive verdict

The Coffee workload does not demonstrate an effective autonomous router. It
demonstrates a capable host model that often succeeds despite missing or wrong
Router guidance.

Router's strongest property is safety through non-execution. Its weakest
properties are capability selection, autonomous-action recognition, execution
continuity, proportionality, and outcome observability. The current hook is a
prompt recommender: it writes additional context but never invokes a skill,
command, or agent itself.

## Route-only scorecard

Scores are evidence-based judgments from the observed Coffee prompts. A score
of 5 means the Router consistently produced the correct, proportionate,
observable behavior without user recovery.

| Dimension | Score | Evidence |
|---|---:|---|
| Route correctness | 1/5 | One useful resume recommendation; one low-confidence silence on a clear implementation correction; wrong `gsd-add-tests` and `impeccable` recommendations |
| Skill selection | 1/5 | Original website route omitted the relevant design skills; later successful skills were selected by the user or host model |
| Autonomy recognition | 1/5 | Explicit safe action prompts were treated as pass-through or passive recommendations |
| Autonomous execution | 0/5 | Hook contract says the harness never auto-runs slash commands; execution always depends on the host model |
| Agent proportionality | 1/5 | Original workload used 40 child-agent sessions for a small static page; later effective corrections used zero |
| Command/tool discipline | 2/5 | Original RTK compliance was 30.2%; later host-agent corrections reached 100%, but Router did not enforce it |
| Efficiency | 1/5 | Original: 936 calls and 3.68M uncached input tokens; targeted correction: 56 calls and 166K uncached input tokens |
| Outcome observability | 1/5 | Telemetry records `downstream_invocations: null` and `outcome: null`, even when a route was ignored or replaced |
| Safety boundaries | 4/5 | Recommendation-only design avoids unsafe mutation, but it over-corrects by preventing useful automatic safe execution |
| Context continuity | 1/5 | Follow-up design corrections were reclassified globally instead of inheriting the active design task and autonomous authority |
| **Total** | **13/50** | **Useful recommender prototype; ineffective autonomous router** |

## Prompt-level routing evidence

| Prompt/event | Correct route | Router result | Actual successful path | Verdict |
|---|---|---|---|---|
| Initial website creation | Project workflow plus downstream design specialization | User explicitly supplied `gsd-new-project`; Router did not discover the primary workflow or add design specialization | GSD orchestration | Router contribution minimal |
| Continue autonomously | Preserve action authority and continue current workflow | Recommended `gsd-resume-work` | Recommendation was used | Correct but narrow success |
| Direct design correction | Invoke named design skills directly | User explicitly named the skills | Host invoked them | User routing, not Router routing |
| Add image/address/hours/localization | Continue active design task; use visual/content skill; execute automatically | Low-confidence silence | Host selected Design Taste and GSD Quick | Router miss; host recovery |
| “Test different things” visually | Continue design refinement | Recommended `gsd-add-tests` and TDD | Host ignored it and used Design Taste | Semantic false positive |
| Audit Router-build behavior | Systems/codebase audit capability | Recommended `impeccable` | Audit performed without it | Domain false positive |

## Root causes

### 1. Confidence is incorrectly used as an execution policy

The hook has three confidence behaviors:

- low: no route;
- medium: passive `Recommended ... Run if fit` text;
- high: imperative model instruction.

Confidence answers which capability probably fits. It does not answer whether
the user authorized execution. A medium-confidence route for a clearly
authorized, safe, local task should cause the host to validate the fit and then
act—not require a new user prompt.

### 2. Router has no real dispatch layer

The hook emits text into model context. It does not call the skill, command, or
agent. Even high-confidence “Run” output is a request to the host model, not an
executed route. Router therefore cannot honestly claim autonomous execution.

### 3. Global lexical retrieval overwhelms task continuity

“Test different things” matched testing capability vocabulary even though the
object was typography, colors, and identity. The current route did the same
with `impeccable`: it saw website/design history while the requested object was
Router-build auditing.

The classifier needs verb-object and domain interpretation, negative evidence,
and active-task continuity—not only global capability similarity.

### 4. Recommendation and outcome are disconnected

The Router records what it suggested but not reliably what the host invoked,
why the host rejected the route, whether the task completed, or whether the
user accepted the result. Its evolution loop therefore cannot distinguish a
useful recommendation from a model recovery after a bad one.

### 5. No proportionality budget controls orchestration

The system can select a valid large workflow without determining whether its
agent, token, and tool budget is reasonable for the task. Valid routing is not
efficient routing.

## Required architecture

Router decisions need independent axes:

```json
{
  "task_domain": "router_system_audit",
  "intent_mode": "act",
  "authority_source": "explicit_prompt",
  "route_confidence": "medium",
  "risk_class": "safe_local_read_write",
  "action_policy": "validate_then_auto_execute",
  "capability": "codebase_audit",
  "budget": {
    "max_agents": 1,
    "max_tool_calls_before_replan": 40
  }
}
```

The host adapter—not the prompt hook—should enforce `action_policy`:

- `auto_execute`: invoke immediately;
- `validate_then_auto_execute`: host checks fit, then invokes without another
  user prompt;
- `recommend_only`: describe the option;
- `confirm`: request approval before execution;
- `block`: refuse unsafe or unavailable execution.

## Ranked improvements

### P0 — required before calling Router autonomous

1. **Separate intent, authority, confidence, and risk.** Do not derive execution
   behavior from confidence alone.
2. **Add a real host dispatch contract.** Router should return structured action
   policy; the host should invoke the selected skill/command/agent within its
   normal permission boundary.
3. **Persist scoped autonomous authority.** `continue autonomously` should apply
   to safe continuations until task completion, explicit revocation, or a real
   safety checkpoint.
4. **Close recommendation-to-outcome telemetry.** Record selected, invoked,
   rejected, substituted, completed, failed, accepted, and corrected states.
5. **Add semantic negative routing.** Train/calibrate cases such as “test
   colors,” “audit the router using a website workload,” and “review skill
   routing”—where shared words must not select UI or test-generation skills.

### P1 — efficiency and route quality

6. **Use active-task continuity before global retrieval.** Follow-up corrections
   should prefer the current task domain and recently successful capability.
7. **Add complexity budgets.** Cap agents, calls, retries, and uncached tokens by
   task size; replan when the budget is exceeded.
8. **Compose capabilities deliberately.** Choose one primary execution skill,
   optional supporting rubric, and final verification skill instead of either
   omitting specialists or stacking every related skill.
9. **Enforce command policy at execution time.** RTK compliance and unavailable
   tool prevention should be mechanical, not dependent on model memory.
10. **Score route usefulness, not route emission.** A recommendation that the
    host correctly ignores is a Router failure, even when the final task passes.

### P2 — learning and reporting

11. **Attribute cost by route.** Track latency, agents, tool calls, failures,
    cached/uncached tokens, and outcome for each selected capability.
12. **Learn from user corrections.** “Looks awful,” direct skill overrides, and
    corrected requirements must become negative evidence for the preceding
    route—not generic downstream activity.
13. **Expose route explanations with alternatives.** Store top candidates,
    score margin, rejected candidates, and decisive positive/negative signals
    so a wrong route can be diagnosed without reconstructing session logs.

## Acceptance tests for the next Router version

1. A safe implementation correction during autonomous mode invokes the fitting
   capability without another user command.
2. “Test several color/font options” does not select automated-test generation.
3. “Audit Router-build using this website as evidence” does not select a UI
   polish skill.
4. A one-page correction routes with zero agents unless independent work exists.
5. Every emitted route ends with an invoked, rejected, substituted, or blocked
   telemetry state and a final outcome.
6. Destructive or externally visible actions still require the appropriate
   confirmation regardless of confidence.
