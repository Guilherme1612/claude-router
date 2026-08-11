# Claude Router

Claude Router is a zero-dependency local prompt router for Claude Code and Codex.

It exists because local skills, commands, agents, and runtime integrations change over time. A stale or guessed route is worse than no route. Claude Router keeps an inventory of what is actually available, resolves prompts against that inventory, and repairs its local routing state when the workspace changes.

## What it does

- Discovers local Claude Code and Codex capabilities.
- Resolves prompts only to targets that exist in the active runtime.
- Adds bounded route suggestions through the runtime prompt hook.
- Watches relevant capability and configuration paths.
- Rebuilds manifests and coverage when those paths change.
- Keeps calibration tied to the current inventory fingerprint.
- Quarantines unsafe or incomplete candidates instead of activating them.

It does not install plugins, MCP servers, tools, or models. It does not silently dispatch work; the runtime keeps its normal approval flow.

## How it works

```text
local Claude/Codex capabilities
            |
            v
inventory manifest + fingerprint
            |
            v
debounced watcher and reconciliation
            |
            v
runtime-local prompt hook
            |
            v
resolve-first route suggestion
```

1. The manifest builder scans the configured local capability roots.
2. The registry builds candidate routes from the current inventory.
3. The watcher debounces changes and reconciles candidates before activation.
4. The prompt hook reads runtime-local artifacts and suggests only resolvable targets.
5. Missing, stale, malformed, or unsafe state fails open or remains inactive.

Everything runs locally with Node's standard library. There is no package manager, hosted service, database, container, or external control plane.

## Requirements

- Node.js with ES module support; a current LTS release is recommended.
- Claude Code and/or Codex installed locally for live routing.

There is no `npm install` step.

## Install

Clone the repository and run the bundled lifecycle entry point:

```bash
git clone https://github.com/Guilherme1612/claude-router.git
cd claude-router
node install-router.mjs
```

The installer is idempotent. It installs or repairs only Claude Router-owned state, hooks, manifests, controller files, and runtime modules. Existing unrelated user configuration is preserved.

For a project-specific capability root:

```bash
node install-router.mjs --project-root /path/to/project
```

Preview changes without writing:

```bash
node install-router.mjs --dry-run
```

## Use and lifecycle commands

After installation, use Claude Code or Codex normally. The prompt hook runs automatically.

```bash
node install-router.mjs --help
node install-router.mjs --restart-controller
node install-router.mjs --uninstall
```

- `--help` prints all supported options.
- `--restart-controller` restarts the owned watcher after a recoverable controller issue.
- `--uninstall` removes only files and hook entries proven to be owned by Claude Router. Modified or ambiguous state is retained and reported.

The default install roots are `~/.claude` and `~/.codex`. Advanced path overrides are available through `--claude-root`, `--codex-root`, `--source-router`, `--settings`, `--router`, `--manifest`, and `--node-binary`.

## Repository contents

The public tree keeps only what is needed to install, operate, and verify the router:

- `install-router.mjs`: the install, restart, dry-run, help, and uninstall entry point.
- `src/`: the lifecycle, watcher, registry, prompt-routing, safety, and runtime modules.
- `build-manifest.mjs`, `router.calibrate.mjs`, and the calibration/coverage inputs: runtime build and verification support.
- `mode-map.json`: the bundled cold-start route seed; user-owned runtime maps are not overwritten.
- `tests/`: the small verification fixtures embedded by the installer for production checks.
- `README.md`: this operating guide.

Do not copy individual files out of `src/`; the modules import one another. Clone the repository and run the entry point from its root.

The public branch intentionally excludes .planning/, .claude/, .cline/, and .agents/ (including Excalidraw skills), generated graph or inventory output, release history, and unused evaluation or release modules.

## Development check

Run the retained verification fixtures serially:

```bash
node --test --test-concurrency=1 tests/*.test.mjs
```

Serial execution avoids controller and temporary-runtime races.

## Safety model

- Prompt-time routing is bounded and read-only.
- Claude and Codex artifacts are kept runtime-local.
- Routes are resolve-first and existence-checked.
- File changes are debounced and reconciled before activation.
- Invalid or untrusted candidates remain quarantined.
- Uninstall is ownership-aware and refuses to delete ambiguous state.