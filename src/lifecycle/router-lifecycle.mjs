import {
  closeSync, copyFileSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync,
  rmdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFullRegistry } from '../registry/build.mjs';
import { reconcileCandidate } from '../registry/reconcile.mjs';
import { stableStringify } from '../registry/schema.mjs';
import { recoverReleaseTuple } from '../prompt/publish-index.mjs';

export const MANIFEST_SCHEMA_VERSION = 1;
export const RUNTIME_PROFILES = Object.freeze(['claude', 'codex', 'combined']);
export const RECOMMENDATION_KINDS = Object.freeze(['command', 'skill', 'agent', 'workflow', 'mcp', 'tool']);
export const ROUTE_COMPATIBILITY_MATRIX = Object.freeze(RUNTIME_PROFILES.flatMap(profile => (
  RECOMMENDATION_KINDS.map(kind => `${profile}:${kind}`)
)));

export function fingerprint(value) {
  return createHash('sha256').update(value).digest('hex');
}

function atomicWrite(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.tmp.${process.pid}`;
  writeFileSync(temporary, value);
  renameSync(temporary, file);
}

function durableAtomicWrite(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.tmp.${process.pid}.${Date.now()}`;
  const fd = openSync(temporary, 'wx', 0o600);
  try { writeFileSync(fd, value); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temporary, file);
  const directory = openSync(dirname(file), 'r');
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

function generationPaths(options) {
  const p = paths(options);
  const stateRoot = join(p.ownedRoot, 'install-state');
  return { ...p, stateRoot, generationsRoot: join(stateRoot, 'generations'),
    activeGenerationPath: join(stateRoot, 'active.json'), knownGoodGenerationPath: join(stateRoot, 'known-good.json'),
    lifecyclePath: join(stateRoot, 'lifecycle.json') };
}

function verifiedGeneration(p, pointer) {
  if (pointer?.schema_version !== 1 || !/^g1-[a-f0-9]{16}$/.test(pointer.generation_id || '')) return null;
  const root = join(p.generationsRoot, pointer.generation_id);
  const manifest = readJson(join(root, 'manifest.json'), null, 'generation manifest');
  if (manifest?.state !== 'complete' || manifest.generation_id !== pointer.generation_id || !Array.isArray(manifest.files)) return null;
  if (!manifest.files.every(entry => typeof entry.path === 'string' && !entry.path.includes('..')
    && fileMatches(join(root, entry.path), entry.fingerprint))) return null;
  return { generationId: pointer.generation_id, root, manifest };
}

export function resolveInstallGeneration(options, { repair = true } = {}) {
  const p = generationPaths(options);
  mkdirSync(p.generationsRoot, { recursive: true });
  for (const name of readdirSync(p.generationsRoot)) {
    if (name.endsWith('.staging')) rmSync(join(p.generationsRoot, name), { recursive: true, force: true });
  }
  let active = null;
  try { active = verifiedGeneration(p, readJson(p.activeGenerationPath, null)); } catch { active = null; }
  if (active) return active;
  let knownGood = null;
  try { knownGood = verifiedGeneration(p, readJson(p.knownGoodGenerationPath, null)); } catch { knownGood = null; }
  if (!knownGood) throw new Error('no verified installation generation');
  if (repair) durableAtomicWrite(p.activeGenerationPath, JSON.stringify({ schema_version: 1, generation_id: knownGood.generationId }) + '\n');
  return knownGood;
}

function updateManagedBinding(p, options, enabled) {
  updateBindingAt(p.settingsPath, 'UserPromptSubmit', p.routerPath, options, enabled, 5);
  updateBindingAt(p.settingsPath, 'UserPromptExpansion', p.routerPath, options, enabled, 5);
  updateBindingAt(p.settingsPath, 'PostToolUse', p.routerPath, options, enabled, 5, 'Skill|Agent|Task');
  updateBindingAt(p.settingsPath, 'PostToolUseFailure', p.routerPath, options, enabled, 5, 'Skill|Agent|Task');
  updateBindingAt(p.settingsPath, 'Stop', p.routerPath, options, enabled, 5);
}

function updateCodexBinding(p, options, enabled) {
  updateBindingAt(p.codexHooksPath, 'UserPromptSubmit', p.codexRouterPath, options, enabled, 10);
}

function updateBindingAt(settingsPath, event, routerPath, options, enabled, timeout, matcher = null) {
  const settings = validatedSettings(settingsPath);
  const groups = settings.hooks[event] || [];
  const filtered = groups.filter(group => !isRouterEntry(group, routerPath));
  if (enabled) filtered.push(routerEntry(options.nodeBinary || process.execPath, routerPath, timeout, matcher));
  if (filtered.length) settings.hooks[event] = filtered;
  else delete settings.hooks[event];
  durableAtomicWrite(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}

export async function upgradeRouter(options) {
  const p = generationPaths(options);
  if (!existsSync(p.sourceRouter)) throw new Error(`router source missing: ${p.sourceRouter}`);
  const routerBytes = readFileSync(p.sourceRouter);
  const generationId = `g1-${fingerprint(routerBytes).slice(0, 16)}`;
  const finalRoot = join(p.generationsRoot, generationId);
  const stagingRoot = `${finalRoot}.staging`;
  mkdirSync(p.generationsRoot, { recursive: true });
  if (!existsSync(finalRoot)) {
    rmSync(stagingRoot, { recursive: true, force: true });
    mkdirSync(stagingRoot, { recursive: true });
    durableAtomicWrite(join(stagingRoot, 'router.mjs'), routerBytes);
    durableAtomicWrite(join(stagingRoot, 'manifest.json'), JSON.stringify({ schema_version: 1, state: 'complete', generation_id: generationId,
      files: [{ path: 'router.mjs', fingerprint: fingerprint(routerBytes) }] }, null, 2) + '\n');
    if (options.crashAt === 'before-generation-rename') throw new Error('injected crash before generation rename');
    renameSync(stagingRoot, finalRoot);
    const directory = openSync(p.generationsRoot, 'r'); try { fsyncSync(directory); } finally { closeSync(directory); }
  }
  if (!verifiedGeneration(p, { schema_version: 1, generation_id: generationId })) throw new Error('generation verification failed');
  if (options.crashAt === 'before-active-pointer') throw new Error('injected crash before active pointer');
  durableAtomicWrite(p.activeGenerationPath, JSON.stringify({ schema_version: 1, generation_id: generationId }) + '\n');
  if (options.crashAt === 'after-active-pointer') throw new Error('injected crash after active pointer');
  durableAtomicWrite(p.knownGoodGenerationPath, JSON.stringify({ schema_version: 1, generation_id: generationId }) + '\n');
  mkdirSync(dirname(p.routerPath), { recursive: true });
  durableAtomicWrite(p.routerPath, `import ${JSON.stringify(new URL(`file://${join(finalRoot, 'router.mjs')}`).href)};\n`);
  mkdirSync(dirname(p.codexRouterPath), { recursive: true });
  durableAtomicWrite(p.codexRouterPath, `import ${JSON.stringify(new URL(`file://${join(finalRoot, 'router.mjs')}`).href)};\n`);
  updateManagedBinding(p, options, true);
  updateCodexBinding(p, options, true);
  durableAtomicWrite(p.lifecyclePath, JSON.stringify({ schema_version: 1, enabled: true, generation_id: generationId }) + '\n');
  return { status: 'upgraded', generationId, activePath: p.activeGenerationPath };
}

export async function disableRouter(options) {
  const p = generationPaths(options); const generation = resolveInstallGeneration(options);
  const lifecycle = readJson(p.lifecyclePath, { enabled: true });
  if (lifecycle.enabled === false) return { status: 'already-disabled', generationId: generation.generationId };
  updateManagedBinding(p, options, false);
  updateCodexBinding(p, options, false);
  durableAtomicWrite(p.lifecyclePath, JSON.stringify({ schema_version: 1, enabled: false, generation_id: generation.generationId }) + '\n');
  return { status: 'disabled', generationId: generation.generationId };
}

export async function enableRouter(options) {
  const p = generationPaths(options); const generation = resolveInstallGeneration(options);
  const lifecycle = readJson(p.lifecyclePath, { enabled: false });
  if (lifecycle.enabled === true) return { status: 'already-enabled', generationId: generation.generationId };
  updateManagedBinding(p, options, true);
  updateCodexBinding(p, options, true);
  durableAtomicWrite(p.lifecyclePath, JSON.stringify({ schema_version: 1, enabled: true, generation_id: generation.generationId }) + '\n');
  return { status: 'enabled', generationId: generation.generationId };
}

function readJson(file, fallback, label = file) {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is invalid JSON: ${error.message}`);
  }
}

function routerEntry(nodeBinary, routerPath, timeout = 5, matcher = null) {
  return {
    ...(matcher ? { matcher } : {}),
    hooks: [{ type: 'command', command: `"${nodeBinary}" "${routerPath}"`, timeout }],
  };
}

function isRouterEntry(group, routerPath) {
  return Array.isArray(group?.hooks) && group.hooks.some((hook) => (
    hook?.type === 'command'
    && typeof hook.command === 'string'
    && hook.command.includes(routerPath)
  ));
}

function noisePaths(extra = []) {
  return [
    'router', 'context-mode', 'plugins/plugin-catalog-cache.json', 'plugins/known_marketplaces.json',
    'plugins/cache', 'plugins/data', 'plugins/marketplaces', '*.sqlite', '*.sqlite-wal', '*.sqlite-shm',
    ...extra,
  ];
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
    sourceEvolve: options.sourceEvolve ? resolve(options.sourceEvolve) : '',
    settingsPath: resolve(options.settingsPath || join(claudeRoot, 'settings.json')),
    routerPath: resolve(options.routerPath || join(claudeRoot, 'hooks', 'router.mjs')),
    evolvePath: resolve(options.evolvePath || join(claudeRoot, 'hooks', 'router.evolve.mjs')),
    codexHooksPath: resolve(options.codexHooksPath || join(codexRoot, 'hooks.json')),
    codexRouterPath: resolve(options.codexRouterPath || join(codexRoot, 'hooks', 'router.mjs')),
    codexEvolvePath: resolve(options.codexEvolvePath || join(codexRoot, 'hooks', 'router.evolve.mjs')),
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
    const killDeadline = Date.now() + 1_000;
    while (Date.now() <= killDeadline && processAlive(status.pid)) await sleep(20);
  }
  if (processAlive(status.pid)) {
    try { process.kill(status.pid, 'SIGKILL'); } catch { /* process exited */ }
    const forceDeadline = Date.now() + 1_000;
    while (Date.now() <= forceDeadline && processAlive(status.pid)) await sleep(20);
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
  // router.mjs imports ./router.evolve.mjs (Phase-3 evolution primitives) as a hard
  // sibling dependency — the hook crashes at runtime without it. The installer deploys
  // this sibling to BOTH runtimes alongside router.mjs when a source is provided. It is
  // optional in the API so direct callers / unit fixtures that don't supply it skip
  // evolve deployment (backward compat); the production install-router.mjs entry point
  // always supplies it.
  const deployEvolve = !!(p.sourceEvolve && existsSync(p.sourceEvolve) && statSync(p.sourceEvolve).isFile());
  if (p.sourceEvolve && !deployEvolve) {
    throw new Error(`router evolve sibling source missing: ${p.sourceEvolve}`);
  }

  // Complete preflight before the first mutation.
  const sourceBytes = readFileSync(p.sourceRouter);
  const sourceFingerprint = fingerprint(sourceBytes);
  const evolveBytes = deployEvolve ? readFileSync(p.sourceEvolve) : null;
  const evolveFingerprint = deployEvolve ? fingerprint(evolveBytes) : null;
  const settings = validatedSettings(p.settingsPath);
  const codexSettings = validatedSettings(p.codexHooksPath);
  const existingManifest = readJson(p.manifestPath, null, 'ownership manifest');
  if (existingManifest && existingManifest.schema_version !== MANIFEST_SCHEMA_VERSION) {
    throw new Error('ownership manifest has an unsupported schema version');
  }
  if (!existingManifest && (existsSync(p.routerPath) || existsSync(p.codexRouterPath) || existsSync(p.codexMarkerPath)
      || (deployEvolve && (existsSync(p.evolvePath) || existsSync(p.codexEvolvePath))))) {
    throw new Error('existing router artifact is not owned by this installer; refusing to overwrite it');
  }
  const groups = settings.hooks.UserPromptSubmit || [];
  const bindingExists = groups.some((group) => isRouterEntry(group, p.routerPath));
  const codexGroups = codexSettings.hooks.UserPromptSubmit || [];
  const codexBindingExists = codexGroups.some((group) => isRouterEntry(group, p.codexRouterPath));
  const routerHealthy = fileMatches(p.routerPath, sourceFingerprint);
  const codexRouterHealthy = fileMatches(p.codexRouterPath, sourceFingerprint);
  const evolveHealthy = !deployEvolve || fileMatches(p.evolvePath, evolveFingerprint);
  const codexEvolveHealthy = !deployEvolve || fileMatches(p.codexEvolvePath, evolveFingerprint);
  const markerValue = JSON.stringify({ schema_version: 1, managed_by: 'claude-router' }, null, 2) + '\n';
  const markerFingerprint = fingerprint(markerValue);
  const markerHealthy = fileMatches(p.codexMarkerPath, markerFingerprint);
  const built = (options.buildRegistry || buildFullRegistry)({ claudeRoot: p.claudeRoot, codexRoot: p.codexRoot,
    ...(options.projectRoot ? { projectRoot: options.projectRoot, scopeId: options.scopeId } : {}),
    ...(options.contractOverlays ? { overlays: options.contractOverlays } : {}) });
  const emptyActiveRegistry = { schema_version: 1, records: [] };
  const activeBytes = stableStringify(emptyActiveRegistry) + '\n';
  const reconciliation = reconcileCandidate({
    candidate: built.registry,
    active: { registry: emptyActiveRegistry, bytes: activeBytes, fingerprint: fingerprint(activeBytes) },
    lifecycle: { events: [], diagnostics: [] },
    runtimeRoots: { claude: p.claudeRoot, codex: p.codexRoot },
  });
  const candidatePublication = reconciliation.disposition === 'eligible'
    ? { ...built.registry, disposition: 'eligible', activated: false, candidate_fingerprint: reconciliation.candidate_fingerprint }
    : { schema_version: 1, disposition: 'quarantined', activated: false, candidate_fingerprint: reconciliation.candidate_fingerprint, verdicts: reconciliation.verdicts };
  const candidateValue = stableStringify(candidatePublication) + '\n';
  const reportValue = stableStringify({ ...reconciliation, diagnostics: built.diagnostics, summary: { ...built.summary, activated: false } }) + '\n';
  const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const repoRoot = resolve(sourceRoot, '..');
  const moduleNames = [
    'registry/build.mjs', 'registry/schema.mjs', 'registry/identity.mjs',
    'registry/fingerprint.mjs', 'registry/diff.mjs', 'registry/watcher.mjs',
    'registry/map.mjs', 'registry/validate.mjs', 'registry/activate.mjs',
    'registry/reconcile.mjs', 'registry/hook-reconcile.mjs',
    'registry/contract.mjs', 'registry/eligibility.mjs', 'registry/relationships.mjs',
    'coverage/audit.mjs',
    'adapters/claude.mjs', 'adapters/codex.mjs',
    'cli/router-control.mjs',
    'context/capsule.mjs', 'context/resolve.mjs', 'context/sources.mjs',
    'context/prompt-route.mjs', 'prompt/compile-index.mjs', 'prompt/publish-index.mjs',
    'steward/startup-pointer.mjs', 'steward/startup-ack.mjs', 'steward/state.mjs',
    'steward/draft.mjs', 'steward/refresh.mjs', 'steward/suggestion.mjs',
    'health/thresholds.mjs', 'health/admin.mjs', 'health/catalog.mjs',
    'health/outcome-schema.mjs', 'health/score.mjs', 'health/store.mjs',
    'orchestrator/select.mjs', 'orchestrator/transitions.mjs', 'orchestrator/budget.mjs',
    'orchestrator/approval.mjs',
    'orchestrator/workflow-declarations.json',
    // Phase 20: evolution/* added to the deployed bundle so the watcher (Wave 2)
    // and CLI (Wave 3) canary triggers can import canary-controller / evidence /
    // perf-measure / telemetry-bridge at runtime. Closes audit line 165
    // ("Orphaned modules (test-only, not deployed)").
    'evolution/canary-controller.mjs', 'evolution/evidence.mjs',
    'evolution/perf-measure.mjs', 'evolution/telemetry-bridge.mjs',
    'evolution/candidate-calibration-route.mjs',
  ];
  const moduleValues = [p.ownedRoot, p.codexOwnedRoot].flatMap(runtimeRoot => (
    moduleNames.map(name => [join(runtimeRoot, 'modules', name), readFileSync(join(sourceRoot, name))])
  ));
  // Blocker-2 fix: deploy the production-verify gate fixtures so the 5 subprocess
  // gates in PRODUCTION_GATE_RUNNERS (validate.mjs) can run from ownedRoot in
  // production. The fixtures live in the dev repo under tests/ + repoRoot; the
  // installer previously deployed modules/ only, so `node --test tests/...` and
  // `node router.calibrate.mjs` ENOENT'd → verification_non_passing → activation
  // skipped. Two groups are deployed:
  //   1. gateEntryNames  — owned at <ownedRoot>/<name> (router.calibrate.mjs +
  //      calibration-tasks.json). calibrate is the calibration_quality gate
  //      entrypoint; calibration-tasks.json is read by calibrate AND by the
  //      registry-map fixture (repoRoot-relative).
  //   2. gateFixtureNames — owned at <ownedRoot>/tests/<name>. The 10 fixtures
  //      back the regression_suite (6), privacy (1), latency (1), and
  //      token_budget (2) gates.
  // A src/ mirror of modules/ is also deployed because 4 regression fixtures
  // (registry-schema/adapters/diff/reconcile/map) and router.calibrate.mjs
  // import `../src/registry/...` / `./src/registry/...` (dev-layout paths);
  // ownedRoot has modules/ not src/, so the mirror makes those imports resolve
  // without modifying the dev fixtures. validate.mjs subprocess env now
  // inherits the real HOME so fixtures find the deployed hook via homedir().
  const gateEntryNames = [
    'router.calibrate.mjs', 'calibration-tasks.json', 'build-manifest.mjs',
    'coverage-baseline.json', 'scripts/resolve-tie-lint.mjs',
  ];
  const gateFixtureNames = [
    'tests/router.registry-schema.test.mjs',
    'tests/router.adapters.test.mjs',
    'tests/router.registry-diff.test.mjs',
    'tests/router.registry-reconcile.test.mjs',
    'tests/router.route-targets.test.mjs',
    'tests/router.registry-map.test.mjs',
    'tests/router.privacy.test.mjs',
    'tests/router.perf-evolved.test.mjs',
    'tests/router-graphify-integration.test.mjs',
    'tests/router.inject.test.mjs',
    'tests/helpers/inventory-fixture.mjs',
    'tests/helpers/latency-isolated.mjs',
    'tests/helpers/test-mode-seam.mjs',
  ];
  const gateFixtureValues = [p.ownedRoot, p.codexOwnedRoot].flatMap(runtimeRoot => [
    ...gateEntryNames.map(name => [join(runtimeRoot, name), readFileSync(join(repoRoot, name))]),
    ...gateFixtureNames.map(name => [join(runtimeRoot, name), readFileSync(join(repoRoot, name))]),
    // src/ mirror of modules/ so `../src/...` / `./src/...` imports in the
    // fixtures and router.calibrate.mjs resolve in production.
    ...moduleNames.map(name => [join(runtimeRoot, 'src', name), readFileSync(join(sourceRoot, name))]),
  ]);
  // Seed the curated route map only when a runtime does not already have one.
  // Existing maps are user/runtime state and remain untouched; a fresh Claude or
  // Codex account still gets a routeable cold-start map in its local config root.
  const routingSeedValues = [p.ownedRoot, p.codexOwnedRoot]
    .map(runtimeRoot => [join(runtimeRoot, 'mode-map.json'), readFileSync(join(repoRoot, 'mode-map.json'))])
    .filter(([file]) => !existsSync(file));
  const controllerConfig = {
    schema_version: 1,
    claude_root: p.claudeRoot,
    codex_root: p.codexRoot,
    ...(options.projectRoot ? { project_root: resolve(options.projectRoot), scope_id: options.scopeId || 'project' } : {}),
    roots: [
      {
        logicalRoot: 'claude_global',
        path: p.claudeRoot,
        // Noise ignore prefixes (INVC-04): sqlite content/session DBs + WAL/SHM,
        // plugin-catalog/marketplace caches. Prefix-specific so
        // plugins/installed_plugins.json (the authoritative add/remove signal)
        // stays visible to the watcher — a bare 'plugins' prefix is never used.
        ignoredRelativePaths: noisePaths(),
      },
      {
        logicalRoot: 'codex_home',
        path: p.codexRoot,
        ignoredRelativePaths: noisePaths([
          'sessions', 'history.jsonl', 'session_index.jsonl', 'models_cache.json',
          'cache/codex_apps_tools', 'cache/codex_apps_server_info',
        ]),
      },
      ...(options.projectRoot ? [
        { logicalRoot: `project:${options.scopeId || 'project'}:claude`, path: join(resolve(options.projectRoot), '.claude'), watchPath: resolve(options.projectRoot), includeRelativePaths: ['.claude'] },
        { logicalRoot: `project:${options.scopeId || 'project'}:codex`, path: join(resolve(options.projectRoot), '.codex'), watchPath: resolve(options.projectRoot), includeRelativePaths: ['.codex'] },
      ] : []),
    ],
    state_path: p.scanStatePath,
    candidate_path: p.candidatePath,
    report_path: p.reportPath,
    activation_root: p.ownedRoot,
    active_path: join(p.ownedRoot, 'active.json'),
    // mode-map.json is the router's workflow brain (task-signal → mode/skills/agents).
    // The registry build stamps per-record `mapping.explicit_subjects` from it so
    // mapCandidateRegistry seeds dispatch subjects → publishCompiledIndex can emit
    // routes. Not in ownedValues (not deployed/overwritten): like telemetry.jsonl,
    // it is a user-reviewed/mutation data file that pre-exists at ownedRoot.
    mode_map_path: join(p.ownedRoot, 'mode-map.json'),
    // workflow-declarations.json is the orchestrator's declared-workflow contract
    // (deployed to modules/orchestrator/). The registry build stamps declared
    // workflow_ids onto matching records so the compiled index has routes for every
    // orchestrator-declared workflow (e.g. gsd-execute-phase), which the calibration
    // quality gate requires.
    workflow_declarations_path: join(p.ownedRoot, 'modules', 'orchestrator', 'workflow-declarations.json'),
    ...(options.contractOverlays ? { contract_overlays: options.contractOverlays } : {}),
    // EVO-05: the watcher ingests routing telemetry into the canary evidence
    // store. The hook appends to ~/.claude/router/telemetry.jsonl which equals
    // join(ownedRoot, 'telemetry.jsonl') for a global install.
    telemetry_path: join(p.ownedRoot, 'telemetry.jsonl'),
    runtime_artifacts: [
      { runtime: 'claude', builder_path: join(p.ownedRoot, 'build-manifest.mjs'), manifest_path: join(p.ownedRoot, 'claude-inventory-manifest.json'), mode_map_path: join(p.ownedRoot, 'mode-map.json'), coverage_report_path: join(p.ownedRoot, 'coverage-report.json'), hook_path: p.routerPath },
      { runtime: 'codex', builder_path: join(p.codexOwnedRoot, 'build-manifest.mjs'), manifest_path: join(p.codexOwnedRoot, 'claude-inventory-manifest.json'), mode_map_path: join(p.codexOwnedRoot, 'mode-map.json'), coverage_report_path: join(p.codexOwnedRoot, 'coverage-report.json'), hook_path: p.codexRouterPath },
    ],
    status_path: p.controllerStatusPath,
    control_path: p.controllerControlPath,
    debounce_ms: options.debounceMs ?? 250,
    max_latency_ms: options.maxLatencyMs ?? 1_500,
    repair_ms: options.repairMs ?? 300_000,
    heartbeat_ms: options.heartbeatMs ?? 1_000,
    control_poll_ms: options.controlPollMs ?? 100,
    // Opt-in testability seam (defaults to absent for production installs):
    // test_mode === true lets the reconciler use createTestActivationVerifier with injected
    // verification_runners and lets trusted() accept test_only:true verifications. Production
    // installer entry points never set options.testMode, so real installs are unchanged.
    // verification_runners holds function-valued runner objects that cannot survive JSON
    // serialization; it is therefore stripped before the config is written to disk or
    // fingerprinted. Test harnesses reattach runners in-process via launchController.
    ...(options.testMode === true ? { test_mode: true, ...(options.verificationRunners ? { verification_runners: options.verificationRunners } : {}) } : {}),
  };
  // Serialize and fingerprint the config WITHOUT verification_runners (functions are not
  // JSON-serializable and must not perturb the configuration fingerprint). Production
  // configs never set test_mode, so this strip is a no-op there.
  const { verification_runners: _strippedRunners, ...serializableConfig } = controllerConfig;
  const controllerConfigValue = stableStringify(serializableConfig) + '\n';
  const configurationFingerprint = fingerprint(stableStringify(serializableConfig));
  const existingControllerConfig = readJson(p.controllerConfigPath, null, 'controller config');
  const existingControllerFingerprint = existingControllerConfig
    ? fingerprint(stableStringify(existingControllerConfig)) : null;
  const existingControllerStatus = controllerStatus(p);
  if (existingControllerFingerprint && existingControllerStatus && processAlive(existingControllerStatus.pid)
    && (existingControllerFingerprint !== configurationFingerprint || existingControllerStatus.state !== 'ready')) {
    await stopController(p, existingControllerFingerprint, options);
  }
  const readinessValues = [
    ...moduleValues, ...gateFixtureValues, [p.controllerConfigPath, controllerConfigValue],
  ];
  const ownedValues = [
    ...readinessValues, [p.candidatePath, candidateValue], [p.reportPath, reportValue], ...routingSeedValues,
  ];
  for (const [file] of ownedValues) {
    const owned = existingManifest?.files?.some(entry => entry.path === file);
    if (existsSync(file) && !owned) throw new Error(`existing candidate artifact is not owned by this installer: ${file}`);
  }
  if (options.dryRun) return { status: 'dry-run', ready: false, manifestPath: p.manifestPath,
    changes: ownedValues.filter(([file, value]) => !fileMatches(file, fingerprint(value))).map(([file]) => file) };
  const created = [];
  const transactionFiles = [p.settingsPath, p.routerPath, p.evolvePath, p.codexHooksPath, p.codexRouterPath, p.codexEvolvePath, p.codexMarkerPath, ...ownedValues.map(([file]) => file),
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
    if (!codexRouterHealthy) {
      mkdirSync(dirname(p.codexRouterPath), { recursive: true });
      const codexTemporary = `${p.codexRouterPath}.tmp.${process.pid}`;
      copyFileSync(p.sourceRouter, codexTemporary);
      renameSync(codexTemporary, p.codexRouterPath);
      created.push(p.codexRouterPath);
    }
    if (!evolveHealthy) {
      mkdirSync(dirname(p.evolvePath), { recursive: true });
      const evolveTemporary = `${p.evolvePath}.tmp.${process.pid}`;
      copyFileSync(p.sourceEvolve, evolveTemporary);
      renameSync(evolveTemporary, p.evolvePath);
      created.push(p.evolvePath);
    }
    if (!codexEvolveHealthy) {
      mkdirSync(dirname(p.codexEvolvePath), { recursive: true });
      const codexEvolveTemporary = `${p.codexEvolvePath}.tmp.${process.pid}`;
      copyFileSync(p.sourceEvolve, codexEvolveTemporary);
      renameSync(codexEvolveTemporary, p.codexEvolvePath);
      created.push(p.codexEvolvePath);
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
    if (!codexBindingExists) {
      codexSettings.hooks.UserPromptSubmit = [
        ...codexGroups,
        routerEntry(options.nodeBinary || process.execPath, p.codexRouterPath, 10),
      ];
      atomicWrite(p.codexHooksPath, JSON.stringify(codexSettings, null, 2) + '\n');
    }
    // Keep the existing Claude prompt binding path above for compatibility,
    // then reconcile the observer events additively. Each pass removes only
    // groups owned by this router path and preserves every other hook group.
    updateManagedBinding(p, options, true);
    for (const [file, value] of ownedValues) {
      if (!fileMatches(file, fingerprint(value))) { atomicWrite(file, value); created.push(file); }
    }

    const manifest = {
      schema_version: MANIFEST_SCHEMA_VERSION,
      state: 'complete',
      runtime_profiles: RUNTIME_PROFILES,
      recommendation_kinds: RECOMMENDATION_KINDS,
      route_matrix: ROUTE_COMPATIBILITY_MATRIX,
      roots: { claude: p.claudeRoot, codex: p.codexRoot },
      files: [
        { path: p.routerPath, fingerprint: sourceFingerprint },
        ...(deployEvolve ? [{ path: p.evolvePath, fingerprint: evolveFingerprint }] : []),
        { path: p.codexRouterPath, fingerprint: sourceFingerprint },
        ...(deployEvolve ? [{ path: p.codexEvolvePath, fingerprint: evolveFingerprint }] : []),
        { path: p.codexMarkerPath, fingerprint: markerFingerprint },
        ...ownedValues.map(([file, value]) => ({ path: file, fingerprint: fingerprint(value) })),
        { path: p.controllerStatusPath, fingerprint: 'mutable', mutable: true },
        { path: p.controllerControlPath, fingerprint: 'mutable', mutable: true },
        { path: p.scanStatePath, fingerprint: 'mutable', mutable: true },
      ],
      directories: [
        // The owned roots come FIRST in the list so that after the uninstaller's
        // `[...directories].reverse()` (which makes the list deepest-first), the roots are
        // processed LAST — after every subdir they contain has been pruned. Listing a root
        // after its subdirs (the prior layout) left the root non-empty when it was checked, so
        // it was never removed even after its subdirs were pruned.
        p.ownedRoot, p.codexOwnedRoot,
        dirname(p.routerPath), dirname(p.codexRouterPath), dirname(p.codexMarkerPath), dirname(p.candidatePath),
        dirname(p.controllerConfigPath), dirname(p.manifestPath),
        // The `modules` parents come before their subdirs in the list so that after reverse,
        // the subdirs are pruned before their parents. Listing only `modules/cli` left
        // `modules/registry`, `modules/adapters`, `modules/context`, and `modules/prompt`
        // behind, leaving the owned root non-empty after uninstall.
        join(p.ownedRoot, 'modules'), join(p.codexOwnedRoot, 'modules'),
        ...[...new Set(moduleNames.map(name => dirname(join(p.ownedRoot, 'modules', name))))],
        ...[...new Set(moduleNames.map(name => dirname(join(p.codexOwnedRoot, 'modules', name))))],
        ...[...new Set(gateEntryNames.map(name => dirname(join(p.ownedRoot, name))))],
        ...[...new Set(gateEntryNames.map(name => dirname(join(p.codexOwnedRoot, name))))],
        ...[...new Set(gateFixtureNames.map(name => dirname(join(p.ownedRoot, name))))],
        ...[...new Set(gateFixtureNames.map(name => dirname(join(p.codexOwnedRoot, name))))],
        // Blocker-2: prune the deployed gate-fixture trees. `src` mirrors
        // modules/ (isomorphic subdir layout) and `tests` holds the 10 gate
        // fixtures; both must be empty before the owned root can be removed.
        join(p.ownedRoot, 'src'), join(p.codexOwnedRoot, 'src'),
        join(p.ownedRoot, 'tests'), join(p.codexOwnedRoot, 'tests'),
        ...[...new Set(moduleNames.map(name => dirname(join(p.ownedRoot, 'src', name))))],
        ...[...new Set(moduleNames.map(name => dirname(join(p.codexOwnedRoot, 'src', name))))]],
      runtime_state_inventory: {
        immutable: { path: join(p.ownedRoot, 'versions'), owned_by_version_manifests: true },
        mutable: [p.candidatePath, p.reportPath, join(p.ownedRoot, 'active.json'), join(p.ownedRoot, 'audit.jsonl'), p.controllerStatusPath, p.controllerControlPath, p.scanStatePath],
      },
      bindings: [
        { settings_path: p.settingsPath, event: 'UserPromptSubmit', router_path: p.routerPath },
        { settings_path: p.settingsPath, event: 'UserPromptExpansion', router_path: p.routerPath },
        { settings_path: p.settingsPath, event: 'PostToolUse', router_path: p.routerPath },
        { settings_path: p.settingsPath, event: 'PostToolUseFailure', router_path: p.routerPath },
        { settings_path: p.settingsPath, event: 'Stop', router_path: p.routerPath },
        { settings_path: p.codexHooksPath, event: 'UserPromptSubmit', router_path: p.codexRouterPath },
      ],
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
      && (!deployEvolve || fileMatches(p.evolvePath, evolveFingerprint))
      && fileMatches(p.codexRouterPath, sourceFingerprint)
      && (!deployEvolve || fileMatches(p.codexEvolvePath, evolveFingerprint))
      && fileMatches(p.codexMarkerPath, markerFingerprint)
      // candidate/report are controller-owned mutable state after startup. The first
      // reconcile can legitimately replace their installer seed bytes before the
      // controller publishes `ready`; only immutable deployment inputs belong here.
      && readinessValues.every(([file, value]) => fileMatches(file, fingerprint(value)))
      && existsSync(p.manifestPath);
    if (!ready) throw new Error('readiness verification failed');
    // Fresh-account onboarding: run the inventory manifest builder for each runtime
    // after a verified deploy. Warn-and-continue on failure (the hook fail-opens on
    // a missing manifest), but never report success unless both runtime outputs build.
    let manifestBuilt = true;
    try {
      const defaultManifestBuilder = (nodeBinary, scriptPath, env) =>
        spawnSync(nodeBinary, [scriptPath], { env, encoding: 'utf8', timeout: 30_000 });
      const runtimeBuilds = [
        { runtime: 'claude', ownedRoot: p.ownedRoot, hookPath: p.routerPath },
        { runtime: 'codex', ownedRoot: p.codexOwnedRoot, hookPath: p.codexRouterPath },
      ];
      for (const runtimeBuild of runtimeBuilds) {
        const build = (options.manifestBuilder || defaultManifestBuilder)(
          options.nodeBinary || process.execPath,
          join(runtimeBuild.ownedRoot, 'build-manifest.mjs'),
          { ...process.env,
            ROUTER_RUNTIME: runtimeBuild.runtime,
            ROUTER_CODEX_HOME: p.codexRoot,
            ROUTER_CLAUDE_HOME: p.claudeRoot,
            ROUTER_AGENTS_SKILLS_DIR: join(dirname(p.claudeRoot), '.agents', 'skills'),
            ROUTER_CLAUDE_JSON: join(dirname(p.claudeRoot), '.claude.json'),
            ROUTER_MANIFEST_OUT: join(runtimeBuild.ownedRoot, 'claude-inventory-manifest.json'),
            ROUTER_MODE_MAP_PATH: join(runtimeBuild.ownedRoot, 'mode-map.json'),
            ROUTER_COVERAGE_REPORT_PATH: join(runtimeBuild.ownedRoot, 'coverage-report.json'),
            ROUTER_HOOK_PATH: runtimeBuild.hookPath,
            ROUTER_PROJECT_SKILL_DIRS: '', ROUTER_PROJECT_MCP_JSON: '', ROUTER_PROJECT_CONFIG_PATH: '' });
        const passed = !(build && (build.status !== 0 || build.error));
        manifestBuilt = manifestBuilt && passed;
        if (!passed) console.warn(`router: ${runtimeBuild.runtime} manifest builder failed — run: node ~/.claude/router/build-manifest.mjs (status=${build?.status ?? 'no-exit'})${build?.stderr?.trim() ? `: ${build.stderr.trim()}` : ''}`);
      }
    } catch (buildError) {
      manifestBuilt = false;
      console.warn(`router: manifest builder errored — ${buildError.message}`);
    }
    return {
      status: existingManifest && routerHealthy && (!deployEvolve || evolveHealthy) && codexRouterHealthy && (!deployEvolve || codexEvolveHealthy) && markerHealthy && bindingExists && codexBindingExists && created.length === 0
        ? 'already-installed'
        : existingManifest ? 'repaired' : 'installed',
      ready,
      manifestBuilt,
      manifestPath: p.manifestPath,
      routerPath: p.routerPath,
      candidatePath: p.candidatePath,
      reportPath: p.reportPath,
      controllerConfigPath: p.controllerConfigPath,
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

  // upgradeRouter legitimately rewrites router.mjs as a pointer to the active generation, so its
  // bytes diverge from the manifest's source fingerprint. The fingerprint retention guard is for
  // files the USER might have modified; an installer-generated pointer file is not user content.
  // Detect pointer files (the upgradeRouter format) and remove them despite the fingerprint
  // mismatch so uninstall completes and reinstall can proceed after an upgrade.
  const isPointerFile = (filePath) => {
    if (filePath !== p.routerPath && filePath !== p.codexRouterPath) return false;
    try {
      const content = readFileSync(filePath, 'utf8');
      return /^import "file:\/\/[^"]*\/generations\/g1-[a-f0-9]+\/router\.mjs";\n$/.test(content);
    } catch { return false; }
  };

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
    if (!mutableOwned && !isPointerFile(file.path) && !fileMatches(file.path, file.fingerprint)) {
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
  // The install manifest tracks installer-owned files, but upgradeRouter writes a separate
  // install-state tree (generations, active.json, known-good.json, lifecycle.json) that is
  // lifecycle-owned rather than installer-owned. The plan requires uninstall to remove the
  // owned root completely; prune the lifecycle-owned install-state and versions trees here so
  // they do not keep the owned root on disk after uninstall. Both are inside the owned root
  // and are exclusively written by this installer's lifecycle verbs.
  for (const lifecycleRoot of [join(p.ownedRoot, 'install-state'), join(p.ownedRoot, 'versions')]) {
    if (existsSync(lifecycleRoot)) rmSync(lifecycleRoot, { recursive: true, force: true });
  }
  // Fresh-account onboarding: the inventory manifest builder writes a runtime asset
  // (claude-inventory-manifest.json) at install time. It is intentionally outside the
  // ownership manifest (rebuilt, not installed), so prune it here so uninstall removes
  // the owned root completely instead of leaving the runtime manifest as an orphan.
  for (const generatedAsset of [
    join(p.ownedRoot, 'claude-inventory-manifest.json'),
    join(p.codexOwnedRoot, 'claude-inventory-manifest.json'),
    join(p.ownedRoot, 'coverage-report.json'),
    join(p.codexOwnedRoot, 'coverage-report.json'),
  ]) {
    if (existsSync(generatedAsset)) rmSync(generatedAsset, { force: true });
  }
  // Re-prune the owned roots now that lifecycle state is gone so they are removed when empty.
  for (const directory of [p.ownedRoot, p.codexOwnedRoot]) {
    removeEmptyDirectory(directory);
  }
  return { status: 'uninstalled', removed, retained };
}

export async function restartController(options) {
  const p = paths(options);
  const config = readJson(p.controllerConfigPath, null, 'controller config');
  if (!config) throw new Error('controller config is missing; install the router first');
  if (existsSync(join(p.ownedRoot, 'release-tuples'))) {
    recoverReleaseTuple({ ownedRoot: p.ownedRoot, now: options.now ?? Date.now() });
  }
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
