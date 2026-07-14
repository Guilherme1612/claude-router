# One-Command Router Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `node install-router.mjs` perform a complete, idempotent, verified local install and make `node install-router.mjs --uninstall` safely remove only proven router-owned state.

**Architecture:** Keep `install-router.mjs` as the single public command and move filesystem/configuration mechanics into a focused standard-library lifecycle module. Installation computes desired state, applies atomic changes, and writes a versioned ownership manifest; uninstall uses that manifest and content fingerprints as positive deletion evidence. Tests use only temporary home/runtime roots and never mutate live Claude or Codex state.

**Tech Stack:** Node.js ESM, Node standard library, `node:test`, JSON ownership manifest, SHA-256 fingerprints.

---

## File Structure

- Create `src/lifecycle/router-lifecycle.mjs` — environment resolution, install planning, atomic writes, ownership manifest, readiness verification, and owned uninstall.
- Rewrite `install-router.mjs` — thin argument parser and lifecycle command renderer; retain compatible advanced path flags.
- Create `tests/router.lifecycle.test.mjs` — isolated install, repair, uninstall, preservation, failure, and help behavior.
- Modify `tests/router.settings-diff.test.mjs` — route the legacy settings-diff coverage through explicit temporary lifecycle paths and assert the new ownership behavior.

### Task 1: Define the lifecycle contract with failing tests

**Files:**
- Create: `tests/router.lifecycle.test.mjs`
- Test: `tests/router.lifecycle.test.mjs`

- [ ] **Step 1: Add a temporary-runtime fixture and install contract test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installRouter } from '../src/lifecycle/router-lifecycle.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'router-lifecycle-'));
  const sourceRouter = join(root, 'source-router.mjs');
  const claudeRoot = join(root, '.claude');
  const codexRoot = join(root, '.codex');
  writeFileSync(sourceRouter, 'export const router = true;\n');
  mkdirSync(claudeRoot, { recursive: true });
  writeFileSync(join(claudeRoot, 'settings.json'), '{\n  "hooks": {},\n  "theme": "dark"\n}\n');
  return {
    root,
    options: {
      claudeRoot,
      codexRoot,
      sourceRouter,
      nodeBinary: process.execPath,
      manifestPath: join(claudeRoot, 'router', 'install-manifest.json'),
    },
  };
}

test('one command installs files, binding, and ownership manifest', () => {
  const f = fixture();
  try {
    const result = installRouter(f.options);
    assert.equal(result.status, 'installed');
    assert.equal(result.ready, true);
    assert.equal(existsSync(join(f.options.claudeRoot, 'hooks', 'router.mjs')), true);
    const settings = JSON.parse(readFileSync(join(f.options.claudeRoot, 'settings.json'), 'utf8'));
    assert.equal(settings.theme, 'dark');
    assert.equal(settings.hooks.UserPromptSubmit.length, 1);
    const manifest = JSON.parse(readFileSync(f.options.manifestPath, 'utf8'));
    assert.equal(manifest.schema_version, 1);
    assert.equal(manifest.state, 'complete');
    assert.equal(manifest.files.length, 1);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the focused test and verify the expected red state**

Run: `node --test tests/router.lifecycle.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/lifecycle/router-lifecycle.mjs`.

- [ ] **Step 3: Add failing idempotent repair and settings-preservation tests**

```js
test('reinstall is a no-op and repairs a missing owned router file', () => {
  const f = fixture();
  try {
    installRouter(f.options);
    assert.equal(installRouter(f.options).status, 'already-installed');
    rmSync(join(f.options.claudeRoot, 'hooks', 'router.mjs'));
    const repaired = installRouter(f.options);
    assert.equal(repaired.status, 'repaired');
    assert.equal(repaired.ready, true);
    const settings = JSON.parse(readFileSync(join(f.options.claudeRoot, 'settings.json'), 'utf8'));
    assert.equal(settings.hooks.UserPromptSubmit.length, 1);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 4: Commit the red contract tests**

```bash
git add tests/router.lifecycle.test.mjs
git commit -m "test: define router lifecycle contract"
```

### Task 2: Implement atomic install and ownership tracking

**Files:**
- Create: `src/lifecycle/router-lifecycle.mjs`
- Test: `tests/router.lifecycle.test.mjs`

- [ ] **Step 1: Implement the lifecycle primitives and install path**

Create the module with this public API and data contract:

```js
import {
  copyFileSync, existsSync, mkdirSync, readFileSync, renameSync,
  rmSync, statSync, writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve } from 'node:path';

export const MANIFEST_SCHEMA_VERSION = 1;

export function fingerprint(data) {
  return createHash('sha256').update(data).digest('hex');
}

function atomicWrite(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function routerEntry(nodeBinary, routerPath) {
  return { hooks: [{ type: 'command', command: `"${nodeBinary}" "${routerPath}"`, timeout: 5 }] };
}

function isRouterEntry(group, routerPath) {
  return Array.isArray(group?.hooks) && group.hooks.some(
    (hook) => hook?.type === 'command' && typeof hook.command === 'string' && hook.command.includes(routerPath),
  );
}

export function installRouter(options) {
  const claudeRoot = resolve(options.claudeRoot);
  const codexRoot = resolve(options.codexRoot);
  const sourceRouter = resolve(options.sourceRouter);
  const routerPath = resolve(options.routerPath || join(claudeRoot, 'hooks', 'router.mjs'));
  const settingsPath = resolve(options.settingsPath || join(claudeRoot, 'settings.json'));
  const manifestPath = resolve(options.manifestPath || join(claudeRoot, 'router', 'install-manifest.json'));
  if (!existsSync(sourceRouter) || !statSync(sourceRouter).isFile()) throw new Error(`router source missing: ${sourceRouter}`);

  const sourceBytes = readFileSync(sourceRouter);
  const desiredFingerprint = fingerprint(sourceBytes);
  const priorManifest = readJson(manifestPath, null);
  const priorFileHealthy = existsSync(routerPath)
    && fingerprint(readFileSync(routerPath)) === desiredFingerprint;
  const settings = readJson(settingsPath, { hooks: {} });
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('settings must be a JSON object');
  if (settings.hooks === undefined) settings.hooks = {};
  if (!settings.hooks || typeof settings.hooks !== 'object' || Array.isArray(settings.hooks)) throw new Error('settings.hooks must be an object');

  const groups = Array.isArray(settings.hooks.UserPromptSubmit) ? settings.hooks.UserPromptSubmit : [];
  const bindingExists = groups.some((group) => isRouterEntry(group, routerPath));
  if (!priorFileHealthy) {
    mkdirSync(dirname(routerPath), { recursive: true });
    const tmp = `${routerPath}.tmp.${process.pid}`;
    copyFileSync(sourceRouter, tmp);
    renameSync(tmp, routerPath);
  }
  if (!bindingExists) {
    settings.hooks.UserPromptSubmit = [...groups, routerEntry(options.nodeBinary || process.execPath, routerPath)];
    atomicWrite(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  }

  mkdirSync(codexRoot, { recursive: true });
  const manifest = {
    schema_version: MANIFEST_SCHEMA_VERSION,
    state: 'complete',
    roots: { claude: claudeRoot, codex: codexRoot },
    files: [{ path: routerPath, fingerprint: desiredFingerprint }],
    directories: [dirname(routerPath), dirname(manifestPath)],
    bindings: [{ settings_path: settingsPath, event: 'UserPromptSubmit', router_path: routerPath }],
  };
  atomicWrite(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  const ready = existsSync(routerPath) && existsSync(manifestPath);
  return {
    status: priorManifest && priorFileHealthy && bindingExists ? 'already-installed'
      : priorManifest ? 'repaired' : 'installed',
    ready,
    manifestPath,
    routerPath,
  };
}
```

- [ ] **Step 2: Run the focused lifecycle tests**

Run: `node --test tests/router.lifecycle.test.mjs`

Expected: PASS for fresh install, no-op reinstall, repair, and preservation assertions.

- [ ] **Step 3: Add a failing rollback test, then implement transaction cleanup**

Add a test that supplies an invalid settings shape and asserts source settings and the destination router path remain unchanged. Update `installRouter` to complete all parsing and source validation before writing, track paths created in the current run, and on an exception remove only those paths before rethrowing. Never restore a whole user settings backup over newer state.

Run: `node --test tests/router.lifecycle.test.mjs`

Expected: PASS, including `install preflight failure leaves no partial state`.

- [ ] **Step 4: Commit the install engine**

```bash
git add src/lifecycle/router-lifecycle.mjs tests/router.lifecycle.test.mjs
git commit -m "feat: add owned router installation lifecycle"
```

### Task 3: Implement ownership-safe uninstall

**Files:**
- Modify: `src/lifecycle/router-lifecycle.mjs`
- Modify: `tests/router.lifecycle.test.mjs`

- [ ] **Step 1: Write failing uninstall and preservation tests**

```js
import { installRouter, uninstallRouter } from '../src/lifecycle/router-lifecycle.mjs';

test('uninstall removes owned state and preserves later user settings', () => {
  const f = fixture();
  try {
    installRouter(f.options);
    const settingsPath = join(f.options.claudeRoot, 'settings.json');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    settings.afterInstall = { keep: true };
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
    const result = uninstallRouter(f.options);
    assert.equal(result.status, 'uninstalled');
    assert.equal(existsSync(join(f.options.claudeRoot, 'hooks', 'router.mjs')), false);
    assert.equal(existsSync(f.options.manifestPath), false);
    const post = JSON.parse(readFileSync(settingsPath, 'utf8'));
    assert.deepEqual(post.afterInstall, { keep: true });
    assert.equal(post.hooks.UserPromptSubmit, undefined);
    assert.equal(uninstallRouter(f.options).status, 'already-uninstalled');
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('uninstall retains a modified owned file', () => {
  const f = fixture();
  try {
    installRouter(f.options);
    const routerPath = join(f.options.claudeRoot, 'hooks', 'router.mjs');
    writeFileSync(routerPath, 'user changed this\n');
    const result = uninstallRouter(f.options);
    assert.equal(existsSync(routerPath), true);
    assert.deepEqual(result.retained, [routerPath]);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run tests and verify they fail because uninstall is absent**

Run: `node --test tests/router.lifecycle.test.mjs`

Expected: FAIL because `uninstallRouter` is not exported.

- [ ] **Step 3: Implement manifest-validated uninstall**

```js
export function uninstallRouter(options) {
  const manifestPath = resolve(options.manifestPath || join(resolve(options.claudeRoot), 'router', 'install-manifest.json'));
  if (!existsSync(manifestPath)) return { status: 'already-uninstalled', removed: [], retained: [] };
  const manifest = readJson(manifestPath, null);
  if (!manifest || manifest.schema_version !== MANIFEST_SCHEMA_VERSION || manifest.state !== 'complete') {
    throw new Error('ownership manifest is invalid; no files were removed');
  }

  const removed = [];
  const retained = [];
  for (const binding of manifest.bindings) {
    const settings = readJson(binding.settings_path, null);
    if (!settings?.hooks || !Array.isArray(settings.hooks[binding.event])) continue;
    const before = settings.hooks[binding.event];
    const after = before.filter((group) => !isRouterEntry(group, binding.router_path));
    if (after.length === before.length) continue;
    if (after.length) settings.hooks[binding.event] = after;
    else delete settings.hooks[binding.event];
    atomicWrite(binding.settings_path, JSON.stringify(settings, null, 2) + '\n');
  }

  for (const file of manifest.files) {
    if (!existsSync(file.path)) continue;
    if (fingerprint(readFileSync(file.path)) !== file.fingerprint) {
      retained.push(file.path);
      continue;
    }
    rmSync(file.path);
    removed.push(file.path);
  }
  rmSync(manifestPath);
  for (const directory of [...manifest.directories].reverse()) {
    try { rmSync(directory); } catch (error) {
      if (error.code !== 'ENOTEMPTY' && error.code !== 'ENOENT') throw error;
    }
  }
  return { status: 'uninstalled', removed, retained };
}
```

- [ ] **Step 4: Add and pass malformed-manifest fail-closed test**

Write invalid JSON to the manifest, call `uninstallRouter`, assert it throws, and assert the router file and settings bytes are unchanged.

Run: `node --test tests/router.lifecycle.test.mjs`

Expected: PASS for clean uninstall, repeated uninstall, modified-file retention, later-setting preservation, and malformed-manifest fail-closed behavior.

- [ ] **Step 5: Commit uninstall support**

```bash
git add src/lifecycle/router-lifecycle.mjs tests/router.lifecycle.test.mjs
git commit -m "feat: add ownership-safe router uninstall"
```

### Task 4: Turn the existing installer into the one-command CLI

**Files:**
- Modify: `install-router.mjs`
- Modify: `tests/router.lifecycle.test.mjs`
- Modify: `tests/router.settings-diff.test.mjs`

- [ ] **Step 1: Add failing CLI tests**

Use `spawnSync(process.execPath, [INSTALLER, ...flags])` with explicit temporary `--claude-root`, `--codex-root`, `--source-router`, and `--manifest` values. Assert:

```js
assert.match(install.stdout, /INSTALL OK/);
assert.match(reinstall.stdout, /ALREADY INSTALLED/);
assert.match(uninstall.stdout, /UNINSTALL OK/);
assert.match(secondUninstall.stdout, /ALREADY UNINSTALLED/);
assert.match(help.stdout, /node install-router\.mjs --uninstall/);
```

Run: `node --test tests/router.lifecycle.test.mjs`

Expected: FAIL because the current CLI has no `--uninstall`, lifecycle-root flags, or help output.

- [ ] **Step 2: Replace top-level mutation logic with lifecycle dispatch**

`install-router.mjs` must import `installRouter` and `uninstallRouter`, recognize `--uninstall` and `--help`, retain `--settings`, `--router`, and `--node-binary`, and add `--claude-root`, `--codex-root`, `--source-router`, and `--manifest`. Defaults are:

```js
const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const claudeRoot = arg('claude-root', path.join(os.homedir(), '.claude'));
const codexRoot = arg('codex-root', path.join(os.homedir(), '.codex'));
const options = {
  claudeRoot,
  codexRoot,
  sourceRouter: arg('source-router', path.join(repoRoot, 'tests', 'router.mjs.snapshot')),
  settingsPath: arg('settings', path.join(claudeRoot, 'settings.json')),
  routerPath: arg('router', path.join(claudeRoot, 'hooks', 'router.mjs')),
  manifestPath: arg('manifest', path.join(claudeRoot, 'router', 'install-manifest.json')),
  nodeBinary: arg('node-binary', process.execPath),
};
```

Print concise status, owned paths, retained paths, and a nonzero actionable error on failure. Do not print manual rollback commands as the normal recovery mechanism.

- [ ] **Step 3: Adapt the legacy settings-diff test to explicit temporary roots**

Stop copying live settings. Build the complete fixture inside `mkdtempSync`, pass all lifecycle paths explicitly, and keep assertions that non-router keys and hook events are deep-equal. Replace backup restoration assertions with install-followed-by-uninstall assertions.

- [ ] **Step 4: Run focused CLI and settings tests**

Run: `node --test tests/router.lifecycle.test.mjs tests/router.settings-diff.test.mjs`

Expected: PASS with no read or write under the live home directory.

- [ ] **Step 5: Commit the CLI integration**

```bash
git add install-router.mjs tests/router.lifecycle.test.mjs tests/router.settings-diff.test.mjs
git commit -m "feat: expose one-command install and uninstall"
```

### Task 5: Verify lightweight distribution and full compatibility

**Files:**
- Modify: `tests/router.lifecycle.test.mjs`
- Modify: `docs/superpowers/specs/2026-07-14-one-command-router-lifecycle-design.md` only if verified behavior requires a factual clarification

- [ ] **Step 1: Add static lightweight-boundary assertions**

Assert the lifecycle and CLI import only `node:` modules or local files, contain no network client calls, and require no package manifest dependency:

```js
for (const file of ['install-router.mjs', 'src/lifecycle/router-lifecycle.mjs']) {
  const source = readFileSync(join(REPO_ROOT, file), 'utf8');
  assert.doesNotMatch(source, /from ['"](?!node:|\.)/);
  assert.doesNotMatch(source, /https?:\/\/|\bfetch\s*\(/);
}
```

- [ ] **Step 2: Run focused lifecycle verification**

Run: `node --test tests/router.lifecycle.test.mjs tests/router.settings-diff.test.mjs`

Expected: all lifecycle and settings tests pass with zero failures.

- [ ] **Step 3: Run the complete regression suite**

Run: `node --test tests/*.test.mjs`

Expected: all existing and new tests pass with zero failures.

- [ ] **Step 4: Run syntax and whitespace verification**

Run: `node --check install-router.mjs && node --check src/lifecycle/router-lifecycle.mjs && git diff --check`

Expected: all commands exit 0 with no output from `git diff --check`.

- [ ] **Step 5: Exercise a temporary-home CLI lifecycle**

Create a temporary Claude/Codex root, run install twice and uninstall twice with explicit path flags, and verify the four statuses are `INSTALL OK`, `ALREADY INSTALLED`, `UNINSTALL OK`, and `ALREADY UNINSTALLED`. Confirm unrelated fixture settings remain byte-equivalent semantically.

- [ ] **Step 6: Commit final verification adjustments**

```bash
git add tests/router.lifecycle.test.mjs tests/router.settings-diff.test.mjs install-router.mjs src/lifecycle/router-lifecycle.mjs
git commit -m "test: verify lightweight router lifecycle"
```
