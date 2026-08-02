# Claude Router

Claude Router is a zero-dependency, dual-runtime prompt router for Claude Code and Codex. It keeps local capabilities discoverable, routes prompts to capabilities that actually exist, and continuously repairs its local routing state as the workspace changes.

## What it does

- Builds an inventory of locally available skills, commands, agents, and runtime integrations.
- Resolves intent to current Claude Code or Codex targets instead of guessing at missing capabilities.
- Injects bounded route suggestions through the runtime hook at prompt time.
- Watches relevant configuration and capability directories, then refreshes manifests and coverage after changes.
- Keeps caches and adaptive calibration tied to the current inventory fingerprint.
- Exposes lifecycle and diagnostic commands for status, coverage, health, and reconciliation.

Claude Router does not install missing plugins, MCP servers, tools, or models, and it does not silently dispatch work without the runtime's normal approval flow.

## How it works

```text
Claude Code / Codex configuration and skills
                    |
                    v
        inventory manifest + fingerprint
                    |
                    v
       debounced watcher and reconciliation
                    |
                    v
          runtime-local prompt-time hook
                    |
                    v
          bounded, resolve-first suggestion
```

1. The manifest builder scans the configured local capability roots and writes a deterministic inventory plus a coverage report.
2. The prompt hook reads the active runtime's local artifacts and resolves only targets present in that runtime.
3. The watcher debounces file changes, rebuilds the relevant artifacts, and reconciles candidate state before it becomes active.
4. Calibration is epoch-gated by the inventory fingerprint, so stale routing data falls back to safe defaults.
5. Unsafe, malformed, or incomplete candidates remain quarantined or inactive; prompt-time routing can fail open.

The design is local-first: it needs no package manager, hosted service, database, container, or external control plane to run.

## Requirements

- Node.js with ES module support (a current LTS release is recommended).
- Claude Code and/or Codex installed locally for live routing.

There is no `npm install` step. The project uses Node's standard library and the bundled lifecycle command.

## Install

Clone the repository and run the installer:

```bash
git clone https://github.com/Guilherme1612/claude-router.git
cd claude-router
node install-router.mjs
```

The installer is idempotent. It installs or safely repairs the owned Claude and Codex router state, hooks, manifests, and controller. Unrelated user configuration is left alone.

For a project-specific capability root:

```bash
node install-router.mjs --project-root /path/to/project
```

Preview candidate changes without writing anything:

```bash
node install-router.mjs --dry-run
```

## Use

After installation, use Claude Code or Codex normally. The hook runs at prompt time and can suggest the locally available capability that best matches the request. For example:

```text
Continue with the current task.
/gsd-plan-phase 37.1
Finish the implementation and verify it.
```

Short prompts can still carry intent because routing is based on the current local inventory and runtime context. If a capability is not installed or no safe route exists, Claude Router leaves it unresolved instead of fabricating a target.

Useful lifecycle commands:

```bash
node install-router.mjs --help
node install-router.mjs --restart-controller
node install-router.mjs --uninstall
```

`--uninstall` removes only state proven to be owned by Claude Router. The installer prints the active ownership and diagnostic paths when it runs.

## Safety model

- Prompt-time routing is fast and read-only.
- Claude and Codex maintain separate runtime-local artifacts.
- Routes are resolve-first: only current, enabled targets can be suggested.
- File changes are debounced and reconciled before activation.
- Missing optional state and malformed candidates fail open or remain quarantined.
- The router never automatically installs external capabilities.

## Development

The test suite uses Node's built-in test runner:

```bash
node --test tests/*.test.mjs
```

The main implementation areas are under `src/`, while `install-router.mjs` is the zero-dependency lifecycle entry point.
