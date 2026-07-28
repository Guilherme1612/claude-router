<!-- GSD:project-start source:PROJECT.md -->

## Project

**Claude Router — Always-On, Self-Evolving Orchestration Layer**

A global, self-contained `~/.claude` framework that reads the local Claude inventory manifest, classifies each user prompt + goal, and automatically attaches the most efficient gsd workflow mode + skills + agents — then evolves over time to route faster, better, and cheaper. Active in every project; no per-project install. Built as a thin `UserPromptSubmit` hook layer that unifies existing dispatch primitives rather than a new orchestration engine.

**Core Value:** Every user prompt gets routed to the right workflow mode + skills + agents automatically, in <100ms with no external API call — so the dominant cost (rework from mis-routed tasks) drops without paying a per-prompt LLM tax.

### Constraints

- **Performance**: Router hook must return within the `UserPromptSubmit` timeout and never delay prompt handling beyond ~100ms. — fail-open, never block.
- **Coexistence**: Must not break existing `~/.claude/settings.json` hook bindings (gsd + context-mode + caveman) or ralph-loop's Stop-hook. Router's `UserPromptSubmit` binding coexists with caveman's plugin-scoped `caveman-mode-tracker.js` (sentinel marker, no mode-tracking duplication). — the user's setup keeps working.
- **Manifest freshness**: Manifest is a static snapshot of `~/.claude` + `~/.agents/skills` + known project `.claude/skills` dirs; `build-manifest.mjs` must be re-run when the setup changes. Router detects staleness gracefully (mtime / builder-changed-since-build) — pass through + one-line reminder, never auto-rebuild inside the hook. The builder also runs once at install time (post-readiness) so a fresh account is ready to route. — hook stays <100ms.
- **Scope filtering**: `impeccable` is project-scoped to AutomaticTrading (in `agents_store_skills[]` and `project_scoped_skills[]`) — router must NOT recommend it globally; filter on `scope != "project"`. — wrong project's skill leaking globally.
- **MCP guarding**: Do not auto-recommend agents whose `requires_mcp_not_in_manifest` is non-empty — demote to warn tier unless the MCP is wired first. — auto-dispatch would fail.
- **Authoring convention**: Build the router using the dev-tool skills so its own hook/skill/agent authoring matches setup conventions. — consistency with the framework it routes over.
- **File writes**: All file writes via native tools; the hook runs in a subprocess and must not persist edits to the host FS except its own data files (cache, telemetry, weights). — hook is read-only w.r.t. user code.
- **Deny rules**: Respect existing permissions/deny rules in settings (`.env`, secrets, etc.) — mode-map entries must not reference those paths. — no secret leakage via injection.
- **Fail-open**: On any exception, pass through the original prompt unchanged. — routing must never block a prompt.

<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

## Verified Hook Contract (the foundation everything sits on)

### `UserPromptSubmit` stdin payload (what the hook receives)

### `UserPromptSubmit` stdout contract (what the hook may return)

| Field | Effect | Router use |
|-------|--------|-----------|
| `decision: "block"` + `reason` | Rejects and **erases** the prompt. | NEVER used by router (fail-open). |
| `hookSpecificOutput.hookEventName` | Must be `"UserPromptSubmit"`. | Always set. |
| `hookSpecificOutput.additionalContext` | String injected as a `<system-reminder>` **alongside** the prompt. ≤10,000 chars; overflow spilled to a file + preview. | The single injection channel. This is where the route suggestion goes. |
| `hookSpecificOutput.sessionTitle` | Sets session title. | Optional, unused v1. |

### Exit codes

| Exit | Behavior | Router policy |
|------|----------|---------------|
| `0` | Success; stdout parsed for JSON. | Normal path. |
| `2` | Block; prompt erased; stderr shown to Claude. | NEVER — router must never erase a user prompt. |
| other non-zero | Non-blocking warning; first stderr line surfaced; prompt proceeds. | Use only for catastrophic internal failure (still prefer exit 0 + pass-through). |

### Critical contract limitation (corrects a PROJECT-IDEA assumption)

### Timeout

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Node.js (ESM `.mjs`)** | whatever `/Users/guilherme/.hermes/node/bin/node` reports (≥18) | Hook runtime | Same runtime every other `~/.claude/hooks/*.mjs` and `*.js` hook already uses — `gsd-context-monitor.js`, `context-mode-cache-heal.mjs`, `gsd-prompt-guard.js`, etc. all invoke `/Users/guilherme/.hermes/node/bin/node`. Using the same absolute binary guarantees the hook works wherever the user's setup works. ESM (`.mjs`) is the modern module format and matches `context-mode-cache-heal.mjs`; top-level `import`/`await` available if needed. **No separate node install, no nvm coupling.** |
| **Node.js stdlib only** | built-in | All I/O, hashing, JSON, BM25 | Zero dependencies. The hook is a single file copied into `~/.claude/hooks/router.mjs` with no `node_modules`, no install step, no supply-chain surface. This is the right call for a global personal framework: `fs`, `crypto`, `path`, `os`, `url` cover everything. |
| **`UserPromptSubmit` hook binding in `~/.claude/settings.json`** | n/a | Event binding | The only event that fires on every user prompt. Verified non-breaking: current `settings.json` has **no top-level `UserPromptSubmit` entry** (caveman binds it via plugin scope), so adding one is purely additive. See "Coexistence" below. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **`node:crypto`** | built-in | `createHash('sha256')` for prompt signatures in telemetry + cache keys | Always. Stdlib, synchronous, sub-ms. Never log raw prompt text — hash a normalized (lowercased, whitespace-collapsed, stop-word-stripped) prompt + extracted intent keywords. |
| **`node:fs`** | built-in | Read manifest + mode-map; append telemetry; read/write LRU cache | `readFileSync` for the ~208KB manifest and the small `mode-map.json`; `appendFileSync` for `telemetry.jsonl`; manual `writeFileSync` (atomic via temp+rename) for `cache.json`. |
| **`node:path` / `node:os`** | built-in | Resolve `~/.claude/router/` paths portably | `os.homedir()` — do not hardcode `/Users/guilherme`. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **Existing dev-tool skills** (`skill-development`, `hook-development`, `agent-development`, `command-development`, `plugin-structure`, `plugin-settings`) | Author `router.mjs` + `mode-map.json` + the `settings.json` binding per setup conventions | Use during the build phases — these encode the correct frontmatter/YAML/JSON authoring patterns for this exact `~/.claude` setup. |
| **`context-mode` MCP tools** | Analyze manifest + telemetry without bloating the build session's context | Use during Phase 1 mode-map drafting (FTS5 over manifest entries) and Phase 3 telemetry analysis. Not used inside the hook. |
| **A 10-task calibration set** | Calibrate `T_high`/`T_low`/`M` thresholds | Not a library; a Phase 1 deliverable. Drive threshold defaults from this, not from guesses. |

## The BM25 Layer (concrete, stdlib-only)

### Why BM25 and not something else

- **~186 short text descriptions** (skills + plugin skills + agents-store skills + project-scoped + agents + commands; hooks are excluded — event-bound, not invokable, and carry no `description` in the manifest).
- BM25 is the right tool for short-text lexical ranking over a small closed corpus. It is pure arithmetic, has no native deps, no model download, and runs in microseconds for this scale.
- Embeddings/vector stores are explicitly out of scope (PROJECT-IDEA non-goal) and would add a runtime dependency, a model file, and 50–200ms of latency — violating the <100ms / no-API-call constraints.

### Tokenizer (concrete)

### Index construction (per invocation, in-memory)

- `df[t]` = number of entries containing term `t`
- `avgdl` = average token count per entry
- per-entry `tf[t]` and `dl`

### Scoring formula (Okapi BM25, standard)

### Normalization to tier thresholds

### Field weighting (the "weighted" in "weighted keyword")

### Performance budget (<100ms)

| Step | Est. cost | Notes |
|------|-----------|-------|
| Read + parse manifest (208KB) | 5–10ms | `readFileSync` + `JSON.parse`. Largest single cost. |
| Read + parse `mode-map.json` (~few KB) | <1ms | |
| Tokenize 186 entries | 1–2ms | |
| Build `df`/`avgdl`/`tf` | <1ms | |
| Tokenize prompt + score all entries | <1ms | 186 × ~5 query terms |
| Apply mode-map patterns + tier decision | <1ms | |
| Cache lookup (LRU in-memory + optional disk read) | 1–3ms | `cache.json` read if cold; in-memory Map if warm |
| Build `additionalContext` string | <1ms | |
| `JSON.stringify` + stdout write | <1ms | |
| Telemetry append (`appendFileSync`) | 1–2ms | |
| **Total** | **~15–20ms** | Well under 100ms; ~5× headroom. |

## Coexistence with the existing caveman `UserPromptSubmit` hook

### Verified behavior (not hand-waved)

- The caveman `UserPromptSubmit` hook (`caveman-mode-tracker.js`, bound via the caveman plugin scope) and the router hook (bound at top-level `~/.claude/settings.json`) **both fire in parallel** on every prompt.
- Their `additionalContext` strings **both accumulate** — Claude receives both. There is no ordering guarantee, and none is needed: the two hooks have disjoint concerns (caveman does mode tracking; router does route suggestion).
- Dedup is by **command string + args** — since the two hooks have different command paths, they are never deduplicated against each other.

### The sentinel marker (real purpose, corrected)

### settings.json binding (non-breaking)

- `matcher` is omitted/ignored for `UserPromptSubmit` (always fires) — omit it for clarity.
- Use the **same absolute node binary** (`/Users/guilherme/.hermes/node/bin/node`) every other hook uses — not `node` from `PATH`, which may resolve to a different/absent node in some project shells.
- `timeout: 5` (seconds) is far above the ~20ms actual cost but fails fast on a pathological stall. The harness default is 30s; 5s is a deliberate tightening.
- This is **additive** — it does not touch any existing binding. gsd/context-mode/caveman/ralph-loop hooks are untouched.
- The caveman plugin's own `UserPromptSubmit` binding continues to fire independently (plugin-scoped hooks are merged with top-level hooks by the harness).

## Data Files (all under `~/.claude/router/`)

| File | Format | Purpose | Write path |
|------|--------|---------|-----------|
| `claude-inventory-manifest.json` | JSON (208KB) | The registry. Pre-existing. | Rebuilt by `build-manifest.mjs` (at install time post-readiness, manual, or staleness-reminder), **never** inside the hook. |
| `mode-map.json` | JSON (few KB) | Task signal → workflow mode + skills + agents, each entry with `invoke_kind: slash\|skill\|agent\|warn`. The router's brain. | User-reviewed Phase 1 deliverable; mutated by evolution in v2/v3. |
| `cache.json` | JSON (LRU map) | prompt-signature → route. Speeds repeated/similar prompts. | Hook writes (atomic temp+rename). |
| `telemetry.jsonl` | JSONL append-only | timestamp, prompt signature, suggested mode/skills/agents, tier, graphify-queried flag, downstream invocations, outcome. **No raw prompt text.** | Hook appends. |
| `weights.json` | JSON | Evolving BM25 weights. v2. | Evolution writes. |
| `index.json` (optional, deferred) | JSON | Precomputed inverted index. | Builder writes when manifest rebuilds. Skip in v1. |

## Installation

# No npm install. There are no dependencies.

# Deliverables are plain files installed into ~/.claude/:

# 1. The hook (single .mjs, stdlib-only):

#    ~/.claude/hooks/router.mjs

# 2. Data dir (already exists for manifest + builder + docs):

#    ~/.claude/router/{mode-map.json, cache.json, telemetry.jsonl, weights.json}

# 3. settings.json binding (additive UserPromptSubmit entry — see above)

# 4. Verify node binary path matches the one used by existing hooks:

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **Hand-rolled BM25, stdlib only** | `wink-bm25-text-search` (npm) | Never for v1. Only if v2/v3 needs BM25F field weighting or persistence and the stdlib version becomes painful. Adds a dependency + install step to a global framework — not worth it at 186 docs. |
| **Hand-rolled BM25** | `fast-bm25` (npm, TypeScript) | Same — only if field-boost ergonomics outweigh the dependency cost. |
| **In-memory index rebuild per call** | Persisted `index.json` precomputed by `build-manifest.mjs` | Only if profiling shows manifest parse + tokenize exceeds ~50ms. At 186 docs it does not. Persisting adds a freshness-coupling risk. |
| **`additionalContext` (structured JSON stdout)** | Plain stdout text | Stick with `additionalContext` — it composes correctly with caveman's output and keeps block/decision semantics available. Plain stdout works but is less hygienic for coexistence. |
| **Flat BM25 v1** | Weighted BM25 + outcome feedback (v2/v3) | Per PROJECT-IDEA locked decision. v1 ships flat; evolution needs telemetry data that does not exist yet. |
| **Top-level settings.json `UserPromptSubmit` binding** | Plugin-scoped binding (like caveman) | Top-level is correct for a personal global framework that is not a distributable plugin. Plugin-scoping is appropriate if the router is ever published as a marketplace plugin. |
| **Sha256 prompt signature for telemetry** | Raw prompt logging | Never. Telemetry privacy is a hard constraint; secrets/PII must not land in `telemetry.jsonl`. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Per-prompt LLM API call** (LLM-judge router) | Violates the no-API-call + <100ms constraints; the routing cost would exceed the rework it avoids. | In-process BM25 + `additionalContext` injection; the main session model is the judge. |
| **Embedding/vector store** (e.g. `chromadb`, `lancedb`, `hnswlib`, `@xenova/transformers`) | Adds native deps or a model download; 50–200ms latency; overkill for 186 short docs. Violates "no native deps" and the <100ms budget. | Flat BM25 over the manifest. |
| **Native Node modules** (`node-gyp`-built, `.node` binaries) | Breaks portability across the user's machines and node upgrades; install friction. | Stdlib only. |
| **Any npm dependency at all in v1** | Global framework → install surface + supply chain. Not justified at this scale. | Stdlib. Revisit only if a concrete need (BM25F, Porter stemmer) emerges in v2. |
| **`updatedPrompt` field** (modify the prompt) | Undocumented / non-functional (GitHub issue #20833). `UserPromptSubmit` cannot replace the prompt. | `additionalContext` injection only. |
| **`decision: "block"`** | Erases the user's prompt — the router must never destroy user input. | Always exit 0; fail-open with no `additionalContext` on low-confidence/error. |
| **Auto-rebuilding the manifest inside the hook** | Spawns `node ~/.claude/router/build-manifest.mjs` — a blocking subprocess that blows the <100ms budget. | Pass-through + one-line staleness reminder; rebuild is at install time, manual, or scheduled. |
| **Selecting hooks mid-task** | Hooks are event-bound, not invokable. The manifest's `hooks[]` carry no `description` — not matchable. | Route only over skills/agents/commands. Hooks stay always-on side effects. |
| **Globally recommending `impeccable`** | It is `scope: "project"` (AutomaticTrading) in the manifest. | Filter on `scope != "project"` before scoring. |
| **Auto-recommending MCP-backed agents** (context7/exa/firecrawl/jina/perplexity/ref/tavily refs) | `requires_mcp_not_in_manifest` non-empty → auto-dispatch would fail. | Demote to `warn` tier; inject "wire MCP X first" instead. |
| **Parsing/altering caveman's `additionalContext`** | Different hook process, parallel execution, no shared state. Coupling breaks coexistence. | Emit the router's own `additionalContext` with its own sentinel; never touch caveman's. |

## Stack Patterns by Variant

- Emit no `additionalContext`, log `tier=low reason=trivial`, exit 0.
- Because injection noise on non-tasks is worse than no routing.
- Emit no `additionalContext`, log `outcome=user_explicit`, exit 0.
- Because overriding an explicit user choice defeats the purpose.
- Emit a single-line `additionalContext` reminder `"Manifest may be stale — run node ~/.claude/router/build-manifest.mjs"`, log, do NOT route, exit 0.
- Because the hook must stay <100ms — no subprocess rebuild.
- `additionalContext` = `<!-- router-inject mode=... tier=high sig=... -->\nRun /gsd-<mode> <args>\nUse skill <name> because <reason>\nDispatch agent <name> for <subtask>\n<!-- /router-inject -->`.
- Because the model reads the reminder and acts; the sentinel makes the block attributable.
- `additionalContext` = text suggestion only (`Recommended: /gsd-<mode>. Skills: X, Y. Agents: Z. Run if fit.`) + reasoning line. No slash imperative.
- Because the user keeps final control on ambiguous prompts.
- Demote to `warn` tier: `Agent <name> needs MCP <x> which is not in manifest — wire it first`. No auto-dispatch.
- Because auto-dispatch of an unwired-MCP agent would fail.

## Version Compatibility

| Component | Compatible With | Notes |
|-----------|-----------------|-------|
| Node ESM (`.mjs`) | `/Users/guilherme/.hermes/node/bin/node` (≥18) | All existing `~/.claude/hooks/*.mjs` already run on this binary. `import` + top-level `await` supported. |
| `router.mjs` stdlib APIs | Node ≥18 | `node:crypto`, `node:fs`, `node:path`, `node:os` — all stable since Node 14/18. |
| settings.json `UserPromptSubmit` binding | Current `~/.claude/settings.json` schema | Additive entry; does not alter existing bindings. `timeout` field is standard. |
| `additionalContext` injection | Claude Code v2.1.196+ | `prompt_id` field is v2.1.196+; `additionalContext` itself is older and stable. |
| Parallel-hook accumulation | Current harness | Verified via official docs; caveman + router coexist without configuration. |

## Sources

- Official Claude Code hooks reference — `https://code.claude.com/docs/en/hooks` [HIGH]
- Empirical hook schema notes — `https://docs.rhi.zone/claude-code-hooks` [HIGH, corroborates official]
- `UserPromptSubmit` engineering playbook — `https://engineering-playbook.vercel.app/claude-code/userpromptsubmit-hooks` [MEDIUM]
- GitHub issue #20833 (`updatedPrompt` is undocumented/non-functional) — `https://github.com/anthropics/claude-code/issues/20833` [HIGH]
- Existing `~/.claude/settings.json` (read directly) [HIGH] — confirms no top-level `UserPromptSubmit` binding, confirms node binary path, confirms hook schema shape used by all other hooks.
- `build-manifest.mjs` (repoRoot, read directly) [HIGH] — Node stdlib port of the former `~/.claude/router/build_manifest.py`; confirms manifest field schema (`name`/`description`/`summary` present on skills/agents/commands; `hooks[]` lack `description`; `scope` field; `requires_mcp_not_in_manifest`).
- `~/.claude/router/claude-inventory-manifest.json` counts (read directly) [HIGH] — 83 skills + 54 plugin + 9 agents-store + 2 project-scoped + 61 agents + 35 commands = ~244 candidate entries (hooks excluded), well within BM25's sub-millisecond envelope.
- BM25 algorithm references — `https://burakkanber.com/blog/machine-learning-full-text-search-in-javascript-relevance-scoring/` [MEDIUM, algorithm only; implementation is hand-rolled stdlib].

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
