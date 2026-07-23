#!/usr/bin/env node
// Zero-dependency lifecycle command for Claude Router.
//
//   node install-router.mjs             # install or safely repair
//   node install-router.mjs --uninstall # remove only proven owned state

import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { installRouter, restartController, uninstallRouter } from './src/lifecycle/router-lifecycle.mjs';

const args = process.argv.slice(2);
const repoRoot = path.dirname(fileURLToPath(import.meta.url));

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
  console.log(`Claude Router — lightweight local lifecycle

Usage:
  node install-router.mjs              # install
  node install-router.mjs --uninstall  # uninstall owned state
  node install-router.mjs --restart-controller # restart owned watcher
  node install-router.mjs --help       # show this help

Advanced path overrides:
  --claude-root <path>   Claude configuration root (default ~/.claude)
  --codex-root <path>    Codex configuration root (default ~/.codex)
  --source-router <path> bundled router source
  --settings <path>      Claude settings.json
  --router <path>        installed router hook
  --manifest <path>      ownership manifest
  --node-binary <path>   Node executable used by the hook
  --project-root <path>  Optional project capability root
  --dry-run              Validate and report candidate changes without writes
`);
}

if (has('help')) {
  help();
  process.exit(0);
}

try {
  const claudeRoot = path.resolve(arg('claude-root', path.join(os.homedir(), '.claude')));
  const codexRoot = path.resolve(arg('codex-root', path.join(os.homedir(), '.codex')));
  const options = {
    claudeRoot,
    codexRoot,
    sourceRouter: path.resolve(arg('source-router', path.join(repoRoot, 'tests', 'router.mjs.snapshot'))),
    sourceEvolve: path.resolve(arg('source-evolve', path.join(repoRoot, 'tests', 'router.evolve.mjs.snapshot'))),
    settingsPath: path.resolve(arg('settings', path.join(claudeRoot, 'settings.json'))),
    routerPath: path.resolve(arg('router', path.join(claudeRoot, 'hooks', 'router.mjs'))),
    manifestPath: path.resolve(arg('manifest', path.join(claudeRoot, 'router', 'install-manifest.json'))),
    nodeBinary: path.resolve(arg('node-binary', process.execPath)),
    dryRun: has('dry-run'),
    // Production first-reconcile scans the full ~/.claude tree and runs the 5
    // subprocess verify gates (10 `node --test` fixtures), which takes well
    // past the 5s default. Give the owned controller enough headroom to publish
    // its first `ready` status before the installer declares readiness failure
    // and rolls the deploy back.
    readinessTimeoutMs: 60_000,
    ...(args.includes('--project-root') ? { projectRoot: path.resolve(arg('project-root')) } : {}),
  };

  if (has('restart-controller')) {
    const result = await restartController(options);
    console.log(`CONTROLLER RESTART OK — ready instance ${result.instanceId}.`);
  } else if (has('uninstall')) {
    const result = await uninstallRouter(options);
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
    const result = await installRouter(options);
    if (result.status === 'dry-run') {
      console.log(`DRY RUN OK — ${result.changes.length} candidate change(s), no files written.`);
      process.exit(0);
    }
    if (result.status === 'already-installed') {
      console.log('ALREADY INSTALLED — verified and ready.');
    } else if (result.status === 'repaired') {
      console.log('INSTALL OK — repaired and verified.');
    } else {
      console.log('INSTALL OK — installed and verified.');
    }
    console.log(`Ownership manifest: ${result.manifestPath}`);
    console.log(`Inactive candidate: ${result.candidatePath}`);
    console.log(`Registry control: ${result.controlPaths.join(', ')}`);
  }
} catch (error) {
  console.error(`ROUTER LIFECYCLE FAILED: ${error.message}`);
  process.exitCode = 1;
}
