import {
  copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync,
  rmdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';

export const MANIFEST_SCHEMA_VERSION = 1;

export function fingerprint(value) {
  return createHash('sha256').update(value).digest('hex');
}

function atomicWrite(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.tmp.${process.pid}`;
  writeFileSync(temporary, value);
  renameSync(temporary, file);
}

function readJson(file, fallback, label = file) {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is invalid JSON: ${error.message}`);
  }
}

function routerEntry(nodeBinary, routerPath) {
  return {
    hooks: [{ type: 'command', command: `"${nodeBinary}" "${routerPath}"`, timeout: 5 }],
  };
}

function isRouterEntry(group, routerPath) {
  return Array.isArray(group?.hooks) && group.hooks.some((hook) => (
    hook?.type === 'command'
    && typeof hook.command === 'string'
    && hook.command.includes(routerPath)
  ));
}

function paths(options) {
  const claudeRoot = resolve(options.claudeRoot);
  const codexRoot = resolve(options.codexRoot);
  return {
    claudeRoot,
    codexRoot,
    sourceRouter: resolve(options.sourceRouter),
    settingsPath: resolve(options.settingsPath || join(claudeRoot, 'settings.json')),
    routerPath: resolve(options.routerPath || join(claudeRoot, 'hooks', 'router.mjs')),
    codexMarkerPath: resolve(options.codexMarkerPath || join(codexRoot, 'router', 'installed.json')),
    manifestPath: resolve(options.manifestPath || join(claudeRoot, 'router', 'install-manifest.json')),
  };
}

function validatedSettings(settingsPath) {
  const settings = readJson(settingsPath, { hooks: {} }, 'settings');
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('settings must be a JSON object');
  }
  if (settings.hooks === undefined) settings.hooks = {};
  if (!settings.hooks || typeof settings.hooks !== 'object' || Array.isArray(settings.hooks)) {
    throw new Error('settings.hooks must be an object');
  }
  if (settings.hooks.UserPromptSubmit !== undefined && !Array.isArray(settings.hooks.UserPromptSubmit)) {
    throw new Error('settings.hooks.UserPromptSubmit must be an array');
  }
  return settings;
}

function fileMatches(file, expectedFingerprint) {
  return existsSync(file) && fingerprint(readFileSync(file)) === expectedFingerprint;
}

export function installRouter(options) {
  const p = paths(options);
  if (!existsSync(p.sourceRouter) || !statSync(p.sourceRouter).isFile()) {
    throw new Error(`router source missing: ${p.sourceRouter}`);
  }

  // Complete preflight before the first mutation.
  const sourceBytes = readFileSync(p.sourceRouter);
  const sourceFingerprint = fingerprint(sourceBytes);
  const settings = validatedSettings(p.settingsPath);
  const existingManifest = readJson(p.manifestPath, null, 'ownership manifest');
  if (existingManifest && existingManifest.schema_version !== MANIFEST_SCHEMA_VERSION) {
    throw new Error('ownership manifest has an unsupported schema version');
  }
  if (!existingManifest && (existsSync(p.routerPath) || existsSync(p.codexMarkerPath))) {
    throw new Error('existing router artifact is not owned by this installer; refusing to overwrite it');
  }
  const groups = settings.hooks.UserPromptSubmit || [];
  const bindingExists = groups.some((group) => isRouterEntry(group, p.routerPath));
  const routerHealthy = fileMatches(p.routerPath, sourceFingerprint);
  const markerValue = JSON.stringify({ schema_version: 1, managed_by: 'claude-router' }, null, 2) + '\n';
  const markerFingerprint = fingerprint(markerValue);
  const markerHealthy = fileMatches(p.codexMarkerPath, markerFingerprint);
  const created = [];

  try {
    if (!routerHealthy) {
      mkdirSync(dirname(p.routerPath), { recursive: true });
      const temporary = `${p.routerPath}.tmp.${process.pid}`;
      copyFileSync(p.sourceRouter, temporary);
      renameSync(temporary, p.routerPath);
      created.push(p.routerPath);
    }
    if (!markerHealthy) {
      atomicWrite(p.codexMarkerPath, markerValue);
      created.push(p.codexMarkerPath);
    }
    if (!bindingExists) {
      settings.hooks.UserPromptSubmit = [
        ...groups,
        routerEntry(options.nodeBinary || process.execPath, p.routerPath),
      ];
      atomicWrite(p.settingsPath, JSON.stringify(settings, null, 2) + '\n');
    }

    const manifest = {
      schema_version: MANIFEST_SCHEMA_VERSION,
      state: 'complete',
      roots: { claude: p.claudeRoot, codex: p.codexRoot },
      files: [
        { path: p.routerPath, fingerprint: sourceFingerprint },
        { path: p.codexMarkerPath, fingerprint: markerFingerprint },
      ],
      directories: [dirname(p.routerPath), dirname(p.codexMarkerPath), dirname(p.manifestPath)],
      bindings: [{ settings_path: p.settingsPath, event: 'UserPromptSubmit', router_path: p.routerPath }],
    };
    atomicWrite(p.manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    const ready = fileMatches(p.routerPath, sourceFingerprint)
      && fileMatches(p.codexMarkerPath, markerFingerprint)
      && existsSync(p.manifestPath);
    if (!ready) throw new Error('readiness verification failed');
    return {
      status: existingManifest && routerHealthy && markerHealthy && bindingExists
        ? 'already-installed'
        : existingManifest ? 'repaired' : 'installed',
      ready,
      manifestPath: p.manifestPath,
      routerPath: p.routerPath,
    };
  } catch (error) {
    for (const file of created.reverse()) rmSync(file, { force: true });
    throw error;
  }
}

function removeEmptyDirectory(directory) {
  if (!existsSync(directory)) return;
  if (readdirSync(directory).length === 0) rmdirSync(directory);
}

export function uninstallRouter(options) {
  const p = paths(options);
  if (!existsSync(p.manifestPath)) {
    return { status: 'already-uninstalled', removed: [], retained: [] };
  }

  let manifest;
  try {
    manifest = readJson(p.manifestPath, null, 'ownership manifest');
  } catch (error) {
    throw new Error(`ownership manifest is invalid; no files were removed: ${error.message}`);
  }
  if (!manifest || manifest.schema_version !== MANIFEST_SCHEMA_VERSION || manifest.state !== 'complete'
    || !Array.isArray(manifest.files) || !Array.isArray(manifest.bindings)) {
    throw new Error('ownership manifest is invalid; no files were removed');
  }

  // Validate all ownership entries before the first mutation.
  for (const file of manifest.files) {
    if (!file || typeof file.path !== 'string' || typeof file.fingerprint !== 'string') {
      throw new Error('ownership manifest is invalid; no files were removed');
    }
  }

  for (const binding of manifest.bindings) {
    const settings = readJson(binding.settings_path, null, 'settings');
    if (!settings?.hooks || !Array.isArray(settings.hooks[binding.event])) continue;
    const before = settings.hooks[binding.event];
    const after = before.filter((group) => !isRouterEntry(group, binding.router_path));
    if (after.length === before.length) continue;
    if (after.length) settings.hooks[binding.event] = after;
    else delete settings.hooks[binding.event];
    atomicWrite(binding.settings_path, JSON.stringify(settings, null, 2) + '\n');
  }

  const removed = [];
  const retained = [];
  for (const file of manifest.files) {
    if (!existsSync(file.path)) continue;
    if (!fileMatches(file.path, file.fingerprint)) {
      retained.push(file.path);
      continue;
    }
    rmSync(file.path);
    removed.push(file.path);
  }
  rmSync(p.manifestPath);
  for (const directory of [...new Set(manifest.directories || [])].reverse()) {
    removeEmptyDirectory(directory);
  }
  return { status: 'uninstalled', removed, retained };
}
