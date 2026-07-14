#!/usr/bin/env node
// Zero-dependency lifecycle command for Claude Router.
//
//   node install-router.mjs             # install or safely repair
//   node install-router.mjs --uninstall # remove only proven owned state

import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { installRouter, uninstallRouter } from './src/lifecycle/router-lifecycle.mjs';

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
  node install-router.mjs --help       # show this help

Advanced path overrides:
  --claude-root <path>   Claude configuration root (default ~/.claude)
  --codex-root <path>    Codex configuration root (default ~/.codex)
  --source-router <path> bundled router source
  --settings <path>      Claude settings.json
  --router <path>        installed router hook
  --manifest <path>      ownership manifest
  --node-binary <path>   Node executable used by the hook
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
    settingsPath: path.resolve(arg('settings', path.join(claudeRoot, 'settings.json'))),
    routerPath: path.resolve(arg('router', path.join(claudeRoot, 'hooks', 'router.mjs'))),
    manifestPath: path.resolve(arg('manifest', path.join(claudeRoot, 'router', 'install-manifest.json'))),
    nodeBinary: path.resolve(arg('node-binary', process.execPath)),
  };

  if (has('uninstall')) {
    const result = uninstallRouter(options);
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
    const result = installRouter(options);
    if (result.status === 'already-installed') {
      console.log('ALREADY INSTALLED — verified and ready.');
    } else if (result.status === 'repaired') {
      console.log('INSTALL OK — repaired and verified.');
    } else {
      console.log('INSTALL OK — installed and verified.');
    }
    console.log(`Ownership manifest: ${result.manifestPath}`);
  }
} catch (error) {
  console.error(`ROUTER LIFECYCLE FAILED: ${error.message}`);
  process.exitCode = 1;
}
