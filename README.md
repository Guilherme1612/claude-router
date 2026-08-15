# Claude Router

Claude Router is a zero-dependency, framework-neutral local routing layer for Claude Code and Codex. It discovers and maps available local capabilities—hooks, commands, agents, skills, tools, and integrations—and only resolves targets that are valid in the active runtime.

The focus is practical autonomy: less prompt overhead, lower token use, fast routing, better workflow selection, and reliable continuity across session start, stop, compaction, and restart. It is intended for anyone using Claude Code or Codex, from users who describe an outcome in plain language to experts who want to inspect or override a route.

## What it does

- Keeps Claude and Codex runtime capabilities separate and locally grounded.
- Maps available capabilities instead of assuming a particular framework or plugin set.
- Resolves only current, enabled, locally valid targets.
- Preserves continuity with compact lifecycle status and bounded evidence.
- Supports bounded autonomous work with explicit authority, target, receipt, verification, and release gates.
- Keeps unmapped but valid local capabilities recommendation-only instead of inventing a route.
- Keeps prompt-time behavior deterministic, fast, privacy-safe, and fail-open.

It does not silently install missing plugins, MCP servers, tools, models, or frameworks. It does not execute a guessed target. Missing, malformed, or unavailable capabilities remain inactive, quarantined, or recommendation-only until the owner supplies valid local state.

## Install

Requirements: Node.js 20+ and at least one installed Claude Code or Codex runtime. There is no `npm install` step; the project uses Node's standard library.

Clone the repository and provide one or both runtime roots plus an external neutral state root. Omit the runtime option for a runtime that is not installed:

```bash
git clone https://github.com/Guilherme1612/claude-router.git
cd claude-router

node install-router.mjs \
  --claude-root /path/to/claude-runtime \
  --codex-root /path/to/codex-runtime \
  --state-root /path/to/router-state
```

Use only the runtime root that exists. The state root must be explicit, outside this repository and the runtime roots, and must not be named `.router`.

Equivalent environment variables are `CLAUDE_CONFIG_ROOT`, `CODEX_CONFIG_ROOT`, and `ROUTER_STATE_ROOT`.

Preview without writing:

```bash
node install-router.mjs --dry-run \
  --claude-root /path/to/claude-runtime \
  --state-root /path/to/router-state
```

Remove only Router-owned bindings and files:

```bash
node install-router.mjs --uninstall \
  --claude-root /path/to/claude-runtime \
  --codex-root /path/to/codex-runtime \
  --state-root /path/to/router-state
```

## Runtime behavior

The default route is safe pass-through. `UserPromptSubmit` remains untouched unless the owner has supplied an explicit neutral capability manifest. `SessionStart`, `Stop`, and `PreCompact` can receive a short status containing what is done, current, blocked, next, route, and owner action.

For explicit neutral selection, create `capabilities.json` under the state root:

```json
{
  "schema_version": 1,
  "capabilities": [
    {
      "id": "data-inspector",
      "keywords": ["data", "relationship"],
      "runtimes": ["claude", "codex"],
      "enabled": true,
      "state": "dispatchable",
      "dispatchable": true,
      "invocation": { "method": "native", "target": "data-inspector" },
      "authority": { "kind": "owner-controlled" }
    }
  ]
}
```

Selection is deterministic and owner-controlled; it provides a route signal and does not execute a command. Metadata-only or malformed entries remain pass-through or recommendation-only. The manifest may also use the normalized `records` root and `stable_id` identifiers. The event log stores lifecycle type, runtime, hashes, timestamps, route state, and bounded counts. It does not store raw prompts, working-directory paths, or downstream output.

## Safety and portability

- No home-directory discovery or personal framework assumptions.
- No dependency on GSD, Superpowers, GStack, Graphify, or any other plugin collection.
- Claude and Codex keep separate runtime-local hook bindings.
- Existing unrelated hooks and settings are preserved.
- Installation records ownership and fingerprints so uninstall removes only Router-owned state.
- Prompt-time work is read-only; mutations fail closed and preserve last-known-good state.

The adaptive registry, continuity, health, orchestration, and bounded-autonomy implementation lives under `src/`. The public installer deliberately keeps the installed bridge neutral and explicit so it can run on arbitrary Claude/Codex layouts.

## Development

Run the tests with Node's built-in runner:

```bash
node --test --test-concurrency=1 tests/*.test.mjs
```

The public entry point is `install-router.mjs`. No package manager or hosted control plane is required.

Verify both runtime paths locally:

```bash
node scripts/v18-evaluate.mjs
ROUTER_EVAL_RUNTIME=codex node scripts/v18-evaluate.mjs
```
