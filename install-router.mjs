#!/usr/bin/env node
// Zero-dependency lifecycle command for Claude Router.
//
//   node install-router.mjs             # install or safely repair
//   node install-router.mjs --uninstall # remove only proven owned state

import path from 'node:path';
import { installNeutralRouter, uninstallNeutralRouter } from './src/lifecycle/neutral-lifecycle.mjs';

const args = process.argv.slice(2);

function has(name) {
  return args.includes(`--${name}`);
}

function arg(name, fallback) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return fallback;
  if (args[index + 1] === undefined || args[index + 1].startsWith('--')) {
    throw new Error(`--${name} requires a value`);
  }
  return args[index + 1];
}

function help() {
  console.log(`Claude Router — framework-neutral local lifecycle

Usage:
  node install-router.mjs              # install after supplying explicit roots
  node install-router.mjs --state-root <path> [runtime root]
  node install-router.mjs --uninstall --state-root <path> [runtime root]
  node install-router.mjs --dry-run --state-root <path> [runtime root]
  node install-router.mjs --help

Explicit paths (there are no home-directory defaults):
  --claude-root <path>   Claude configuration root
  --codex-root <path>    Codex configuration root
  --state-root <path>    neutral Router state, logs, and ownership manifest
  --claude-settings <path> Claude settings.json
  --codex-hooks <path>  Codex hooks.json
  --claude-hook <path>  installed Claude hook
  --codex-hook <path>   installed Codex hook
  --manifest <path>     neutral ownership manifest
  --node-binary <path>   Node executable used by the hook
  --dry-run              Validate and report candidate changes without writes

Equivalent environment inputs: CLAUDE_CONFIG_ROOT, CODEX_CONFIG_ROOT,
ROUTER_STATE_ROOT.
`);
}

if (has('help')) {
  help();
  process.exit(0);
}

try {
  const optionalPath = (name, environment) => {
    const value = arg(name, process.env[environment] || null);
    return value ? path.resolve(value) : null;
  };
  const options = {
    claudeRoot: optionalPath('claude-root', 'CLAUDE_CONFIG_ROOT'),
    codexRoot: optionalPath('codex-root', 'CODEX_CONFIG_ROOT'),
    stateRoot: optionalPath('state-root', 'ROUTER_STATE_ROOT'),
    claudeSettingsPath: optionalPath('claude-settings', 'CLAUDE_SETTINGS_PATH'),
    codexHooksPath: optionalPath('codex-hooks', 'CODEX_HOOKS_PATH'),
    claudeHookPath: optionalPath('claude-hook', 'CLAUDE_ROUTER_HOOK_PATH'),
    codexHookPath: optionalPath('codex-hook', 'CODEX_ROUTER_HOOK_PATH'),
    manifestPath: optionalPath('manifest', 'ROUTER_MANIFEST_PATH'),
    nodeBinary: path.resolve(arg('node-binary', process.execPath)),
    dryRun: has('dry-run'),
  };

  if (has('restart-controller')) throw new Error('the neutral installer has no background controller; rerun install to reconcile state');
  if (has('uninstall')) {
    const result = await uninstallNeutralRouter(options);
    if (result.status === 'already-uninstalled') {
      console.log('ALREADY UNINSTALLED — no router-owned state found.');
    } else {
      console.log(`UNINSTALL OK — removed ${result.removed.length} owned file(s).`);
      if (result.retained.length) {
        console.error(`RETAINED ${result.retained.length} modified or ambiguous file(s):`);
        for (const file of result.retained) console.error(`  ${file}`);
        process.exitCode = 2;
      }
    }
  } else {
    const result = await installNeutralRouter(options);
    if (result.status === 'dry-run') {
      console.log(`DRY RUN OK — ${result.changes.length} candidate change(s), no files written.`);
      process.exit(0);
    }
    console.log('INSTALL OK — neutral runtime hook installed and verified.');
    console.log(`Ownership manifest: ${result.manifestPath}`);
    console.log(`Neutral state root: ${result.stateRoot}`);
  }
} catch (error) {
  console.error(`ROUTER LIFECYCLE FAILED: ${error.message}`);
  process.exitCode = 1;
}
