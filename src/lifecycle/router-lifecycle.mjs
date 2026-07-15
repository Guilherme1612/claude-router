import {
  copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync,
  rmdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFullRegistry } from '../registry/build.mjs';
import { reconcileCandidate } from '../registry/reconcile.mjs';
import { stableStringify } from '../registry/schema.mjs';

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
  const ownedRoot = resolve(options.ownedRoot || join(claudeRoot, 'router'));
  const codexOwnedRoot = resolve(options.codexOwnedRoot || join(codexRoot, 'router'));
  return {
    claudeRoot,
    codexRoot,
    sourceRouter: resolve(options.sourceRouter),
    settingsPath: resolve(options.settingsPath || join(claudeRoot, 'settings.json')),
    routerPath: resolve(options.routerPath || join(claudeRoot, 'hooks', 'router.mjs')),
    codexMarkerPath: resolve(options.codexMarkerPath || join(codexRoot, 'router', 'installed.json')),
    manifestPath: resolve(options.manifestPath || join(claudeRoot, 'router', 'install-manifest.json')),
    ownedRoot,
    codexOwnedRoot,
    candidatePath: resolve(options.candidatePath || join(ownedRoot, 'candidate', 'registry.json')),
    reportPath: resolve(options.reportPath || join(ownedRoot, 'candidate', 'report.json')),
    controllerConfigPath: resolve(options.controllerConfigPath || join(ownedRoot, 'controller', 'config.json')),
    controllerStatusPath: resolve(options.controllerStatusPath || join(ownedRoot, 'controller', 'status.json')),
    controllerControlPath: resolve(options.controllerControlPath || join(ownedRoot, 'controller', 'request.json')),
    scanStatePath: resolve(options.scanStatePath || join(ownedRoot, 'controller', 'scan-state.json')),
  };
}

function sleep(milliseconds) { return new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds)); }

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function controllerStatus(p) {
  try { return readJson(p.controllerStatusPath, null, 'controller status'); } catch { return null; }
}

function readyController(p, configurationFingerprint, staleMs) {
  const status = controllerStatus(p);
  return status?.state === 'ready'
    && status.configuration_fingerprint === configurationFingerprint
    && Number.isFinite(status.heartbeat) && Date.now() - status.heartbeat <= staleMs
    && processAlive(status.pid) ? status : null;
}

async function waitForController(p, configurationFingerprint, options = {}) {
  const deadline = Date.now() + (options.readinessTimeoutMs ?? 5_000);
  const staleMs = options.controllerStaleMs ?? 5_000;
  do {
    if (options.child?.exitCode !== null && options.child?.exitCode !== undefined) {
      throw new Error(`controller exited before readiness with code ${options.child.exitCode}`);
    }
    const status = readyController(p, configurationFingerprint, staleMs);
    if (status && (!options.previousInstanceId || status.instance_id !== options.previousInstanceId)) return status;
    await sleep(options.readinessPollMs ?? 20);
  } while (Date.now() <= deadline);
  const observed = controllerStatus(p);
  throw new Error(`controller readiness verification failed${observed ? `: ${JSON.stringify(observed)}` : ': no status record'}`);
}

function launchOwnedController(p, options) {
  const watcherPath = join(p.ownedRoot, 'modules', 'registry', 'watcher.mjs');
  const launch = options.launchController || ((binary, args, spawnOptions) => spawn(binary, args, spawnOptions));
  const child = launch(options.nodeBinary || process.execPath,
    [watcherPath, 'run', '--config', p.controllerConfigPath], {
      detached: true, stdio: options.controllerStdio || 'ignore',
    });
  child.unref?.();
  return child;
}

async function stopController(p, configurationFingerprint, options = {}) {
  const status = controllerStatus(p);
  if (!status || status.configuration_fingerprint !== configurationFingerprint || !processAlive(status.pid)) return;
  atomicWrite(p.controllerControlPath, JSON.stringify({
    schema_version: 1, action: 'shutdown', instance_id: status.instance_id,
    configuration_fingerprint: configurationFingerprint,
  }) + '\n');
  const deadline = Date.now() + (options.shutdownTimeoutMs ?? 2_000);
  while (Date.now() <= deadline && processAlive(status.pid)) await sleep(20);
  if (processAlive(status.pid)) {
    try { process.kill(status.pid, 'SIGTERM'); } catch { /* process exited */ }
  }
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

function transactionSnapshot(files, directories) {
  return {
    files: files.map(file => ({ file, exists: existsSync(file), bytes: existsSync(file) ? readFileSync(file) : null })),
    directories: [...new Set(directories)].map(directory => ({ directory, exists: existsSync(directory) })),
  };
}

function restoreTransaction(snapshot) {
  for (const entry of snapshot.files) {
    if (entry.exists) atomicWrite(entry.file, entry.bytes);
    else rmSync(entry.file, { force: true });
  }
  for (const entry of snapshot.directories.sort((a, b) => b.directory.length - a.directory.length)) {
    if (!entry.exists) removeEmptyDirectory(entry.directory);
  }
}

export async function installRouter(options) {
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
  const built = (options.buildRegistry || buildFullRegistry)({ claudeRoot: p.claudeRoot, codexRoot: p.codexRoot,
    ...(options.projectRoot ? { projectRoot: options.projectRoot, scopeId: options.scopeId } : {}) });
  const emptyActiveRegistry = { schema_version: 1, records: [] };
  const activeBytes = stableStringify(emptyActiveRegistry) + '\n';
  const reconciliation = reconcileCandidate({
    candidate: built.registry,
    active: { registry: emptyActiveRegistry, bytes: activeBytes, fingerprint: fingerprint(activeBytes) },
    lifecycle: { events: [], diagnostics: [] },
  });
  const candidatePublication = reconciliation.disposition === 'eligible'
    ? { ...built.registry, disposition: 'eligible', activated: false, candidate_fingerprint: reconciliation.candidate_fingerprint }
    : { schema_version: 1, disposition: 'quarantined', activated: false, candidate_fingerprint: reconciliation.candidate_fingerprint, verdicts: reconciliation.verdicts };
  const candidateValue = stableStringify(candidatePublication) + '\n';
  const reportValue = stableStringify({ ...reconciliation, diagnostics: built.diagnostics, summary: { ...built.summary, activated: false } }) + '\n';
  const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const moduleNames = [
    'registry/build.mjs', 'registry/schema.mjs', 'registry/identity.mjs',
    'registry/fingerprint.mjs', 'registry/diff.mjs', 'registry/watcher.mjs',
    'registry/map.mjs', 'registry/validate.mjs', 'registry/activate.mjs',
    'registry/reconcile.mjs', 'registry/hook-reconcile.mjs',
    'adapters/claude.mjs', 'adapters/codex.mjs',
    'cli/router-control.mjs',
  ];
  const moduleValues = [p.ownedRoot, p.codexOwnedRoot].flatMap(runtimeRoot => (
    moduleNames.map(name => [join(runtimeRoot, 'modules', name), readFileSync(join(sourceRoot, name))])
  ));
  const controllerConfig = {
    schema_version: 1,
    claude_root: p.claudeRoot,
    codex_root: p.codexRoot,
    ...(options.projectRoot ? { project_root: resolve(options.projectRoot), scope_id: options.scopeId || 'project' } : {}),
    roots: [
      { logicalRoot: 'claude_global', path: p.claudeRoot, ignoredRelativePaths: ['router'] },
      { logicalRoot: 'codex_home', path: p.codexRoot, ignoredRelativePaths: ['router'] },
      ...(options.projectRoot ? [
        { logicalRoot: `project:${options.scopeId || 'project'}:claude`, path: join(resolve(options.projectRoot), '.claude'), watchPath: resolve(options.projectRoot), includeRelativePaths: ['.claude'] },
        { logicalRoot: `project:${options.scopeId || 'project'}:codex`, path: join(resolve(options.projectRoot), '.codex'), watchPath: resolve(options.projectRoot), includeRelativePaths: ['.codex'] },
      ] : []),
    ],
    state_path: p.scanStatePath,
    candidate_path: p.candidatePath,
    report_path: p.reportPath,
    status_path: p.controllerStatusPath,
    control_path: p.controllerControlPath,
    debounce_ms: options.debounceMs ?? 250,
    max_latency_ms: options.maxLatencyMs ?? 1_500,
    repair_ms: options.repairMs ?? 300_000,
    heartbeat_ms: options.heartbeatMs ?? 1_000,
    control_poll_ms: options.controlPollMs ?? 100,
  };
  const controllerConfigValue = stableStringify(controllerConfig) + '\n';
  const configurationFingerprint = fingerprint(stableStringify(controllerConfig));
  const ownedValues = [
    ...moduleValues, [p.candidatePath, candidateValue], [p.reportPath, reportValue],
    [p.controllerConfigPath, controllerConfigValue],
  ];
  for (const [file] of ownedValues) {
    const owned = existingManifest?.files?.some(entry => entry.path === file);
    if (existsSync(file) && !owned) throw new Error(`existing candidate artifact is not owned by this installer: ${file}`);
  }
  if (options.dryRun) return { status: 'dry-run', ready: false, manifestPath: p.manifestPath,
    changes: ownedValues.filter(([file, value]) => !fileMatches(file, fingerprint(value))).map(([file]) => file) };
  const created = [];
  const transactionFiles = [p.settingsPath, p.routerPath, p.codexMarkerPath, ...ownedValues.map(([file]) => file),
    p.controllerStatusPath, p.controllerControlPath, p.scanStatePath, p.manifestPath];
  const transactionDirectories = transactionFiles.flatMap(file => {
    const entries = []; let directory = dirname(file);
    while (directory.startsWith(p.claudeRoot) || directory.startsWith(p.codexRoot)) {
      entries.push(directory);
      if (directory === p.claudeRoot || directory === p.codexRoot) break;
      directory = dirname(directory);
    }
    return entries;
  });
  const beforeMutation = transactionSnapshot(transactionFiles, transactionDirectories);

  try {
    if (!routerHealthy) {
      const wasPresent = existsSync(p.routerPath);
      mkdirSync(dirname(p.routerPath), { recursive: true });
      const temporary = `${p.routerPath}.tmp.${process.pid}`;
      copyFileSync(p.sourceRouter, temporary);
      renameSync(temporary, p.routerPath);
      created.push(p.routerPath);
    }
    if (!markerHealthy) {
      const wasPresent = existsSync(p.codexMarkerPath);
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
    for (const [file, value] of ownedValues) {
      if (!fileMatches(file, fingerprint(value))) { atomicWrite(file, value); created.push(file); }
    }

    const manifest = {
      schema_version: MANIFEST_SCHEMA_VERSION,
      state: 'complete',
      roots: { claude: p.claudeRoot, codex: p.codexRoot },
      files: [
        { path: p.routerPath, fingerprint: sourceFingerprint },
        { path: p.codexMarkerPath, fingerprint: markerFingerprint },
        ...ownedValues.map(([file, value]) => ({ path: file, fingerprint: fingerprint(value) })),
        { path: p.controllerStatusPath, fingerprint: 'mutable', mutable: true },
        { path: p.controllerControlPath, fingerprint: 'mutable', mutable: true },
        { path: p.scanStatePath, fingerprint: 'mutable', mutable: true },
      ],
      directories: [dirname(p.routerPath), dirname(p.codexMarkerPath), dirname(p.candidatePath),
        dirname(p.controllerConfigPath), dirname(p.manifestPath),
        join(p.ownedRoot, 'modules', 'cli'), join(p.codexOwnedRoot, 'modules', 'cli')],
      runtime_state_inventory: {
        immutable: { path: join(p.ownedRoot, 'versions'), owned_by_version_manifests: true },
        mutable: [p.candidatePath, p.reportPath, join(p.ownedRoot, 'active.json'), join(p.ownedRoot, 'audit.jsonl'), p.controllerStatusPath, p.controllerControlPath, p.scanStatePath],
      },
      bindings: [{ settings_path: p.settingsPath, event: 'UserPromptSubmit', router_path: p.routerPath }],
    };
    atomicWrite(p.manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    if (typeof options.afterMutation === 'function') options.afterMutation();
    let status = readyController(p, configurationFingerprint, options.controllerStaleMs ?? 5_000);
    let child = null;
    if (!status) {
      child = launchOwnedController(p, options);
      try { status = await waitForController(p, configurationFingerprint, { ...options, child }); }
      catch (error) { child.kill?.('SIGTERM'); throw error; }
    }
    const ready = fileMatches(p.routerPath, sourceFingerprint)
      && fileMatches(p.codexMarkerPath, markerFingerprint)
      && ownedValues.every(([file, value]) => fileMatches(file, fingerprint(value)))
      && existsSync(p.manifestPath);
    if (!ready) throw new Error('readiness verification failed');
    return {
      status: existingManifest && routerHealthy && markerHealthy && bindingExists && created.length === 0
        ? 'already-installed'
        : existingManifest ? 'repaired' : 'installed',
      ready,
      manifestPath: p.manifestPath,
      routerPath: p.routerPath,
      candidatePath: p.candidatePath,
      reportPath: p.reportPath,
      controllerStatusPath: p.controllerStatusPath,
      controllerInstanceId: status.instance_id,
      configurationFingerprint,
      controlPaths: [join(p.ownedRoot, 'modules', 'cli', 'router-control.mjs'), join(p.codexOwnedRoot, 'modules', 'cli', 'router-control.mjs')],
      changes: created,
    };
  } catch (error) {
    const status = controllerStatus(p);
    if (status?.configuration_fingerprint === configurationFingerprint && processAlive(status.pid)) {
      try { process.kill(status.pid, 'SIGTERM'); } catch { /* process exited */ }
    }
    restoreTransaction(beforeMutation);
    throw error;
  }
}

function removeEmptyDirectory(directory) {
  if (!existsSync(directory)) return;
  if (readdirSync(directory).length === 0) rmdirSync(directory);
}

export async function uninstallRouter(options) {
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

  const config = readJson(p.controllerConfigPath, null, 'controller config');
  if (config) await stopController(p, fingerprint(stableStringify(config)), options);

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
    const mutableOwned = file.mutable === true
      && (file.path === p.controllerStatusPath || file.path === p.controllerControlPath || file.path === p.scanStatePath)
      && (file.path === p.ownedRoot || file.path.startsWith(`${p.ownedRoot}/`));
    if (!mutableOwned && !fileMatches(file.path, file.fingerprint)) {
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

export async function restartController(options) {
  const p = paths(options);
  const config = readJson(p.controllerConfigPath, null, 'controller config');
  if (!config) throw new Error('controller config is missing; install the router first');
  const configurationFingerprint = fingerprint(stableStringify(config));
  const current = readyController(p, configurationFingerprint, options.controllerStaleMs ?? 5_000);
  if (current) {
    atomicWrite(p.controllerControlPath, JSON.stringify({
      schema_version: 1, action: 'restart', instance_id: current.instance_id,
      configuration_fingerprint: configurationFingerprint,
    }) + '\n');
  } else {
    launchOwnedController(p, options);
  }
  const status = await waitForController(p, configurationFingerprint, {
    ...options, previousInstanceId: current?.instance_id,
  });
  return { ready: true, instanceId: status.instance_id, pid: status.pid, configurationFingerprint };
}
