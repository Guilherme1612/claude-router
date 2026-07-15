#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { watch } from 'node:fs';
import { readFile, mkdir, rename, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanFingerprintTree, loadFingerprintState, saveFingerprintState } from './fingerprint.mjs';
import { diffFingerprintTrees } from './diff.mjs';
import { acquireRegistry, assembleRegistry, refreshIncrementalAcquisition } from './build.mjs';
import { stableStringify } from './schema.mjs';

function hash(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function defaultScheduler() {
  return { now: Date.now, setTimeout, clearTimeout };
}

export function createRegistryWatcher(options) {
  if (!Array.isArray(options?.roots) || options.roots.length === 0) {
    throw new TypeError('roots must be a non-empty array');
  }
  const roots = [...options.roots].sort((a, b) => a.logicalRoot.localeCompare(b.logicalRoot));
  const rootNames = roots.map(item => item.logicalRoot);
  const scheduler = options.scheduler || defaultScheduler();
  const debounceMs = options.debounceMs ?? 250;
  const maxLatencyMs = options.maxLatencyMs ?? 1_500;
  const repairMs = options.repairMs ?? 300_000;
  const watchFactory = options.watchFactory || ((path, watchOptions, callback) => watch(path, watchOptions, callback));
  const readState = options.readState || (() => loadFingerprintState(options.statePath, rootNames));
  const scan = options.scan || scanFingerprintTree;
  const diff = options.diff || diffFingerprintTrees;
  const reconcile = options.reconcile || (async () => {});
  const writeState = options.writeState || (state => saveFingerprintState(options.statePath, state));
  const onError = options.onError || (() => {});
  const watchers = [];
  const dirty = new Set();
  let closed = false, timer = null, repairTimer = null, firstDirtyAt = null;
  let inFlight = null, rerun = false, baseline = null;

  function clearTimer(name) {
    const value = name === 'work' ? timer : repairTimer;
    if (value !== null) scheduler.clearTimeout(value);
    if (name === 'work') timer = null;
    else repairTimer = null;
  }

  function report(error) {
    if (!closed) onError(error instanceof Error ? error : new Error(String(error)));
  }

  function scheduleRepair() {
    clearTimer('repair');
    if (closed) return;
    repairTimer = scheduler.setTimeout(() => {
      repairTimer = null;
      markDirty(rootNames, true);
      scheduleRepair();
    }, repairMs);
  }

  async function reconcileDirty(names) {
    const current = await scan(roots);
    const lifecycle = diff(baseline, current);
    await reconcile({ roots: names, previous: baseline, current, diff: lifecycle });
    await writeState(current);
    baseline = current;
  }

  function startWork() {
    if (closed || dirty.size === 0) return inFlight || Promise.resolve();
    if (inFlight) { rerun = true; return inFlight; }
    clearTimer('work');
    const names = [...dirty].sort();
    dirty.clear(); firstDirtyAt = null;
    inFlight = reconcileDirty(names).catch(report).finally(() => {
      inFlight = null;
      if (closed) return;
      if (rerun || dirty.size) {
        rerun = false;
        startWork();
      }
    });
    return inFlight;
  }

  function markDirty(names, immediate = false) {
    if (closed) return;
    for (const name of names) dirty.add(name);
    const now = scheduler.now();
    if (firstDirtyAt === null) firstDirtyAt = now;
    if (inFlight) { rerun = true; return; }
    clearTimer('work');
    const delay = immediate ? 0 : Math.max(0, Math.min(debounceMs, firstDirtyAt + maxLatencyMs - now));
    timer = scheduler.setTimeout(() => { timer = null; startWork(); }, delay);
  }

  const ready = (async () => {
    const loaded = await readState();
    baseline = loaded?.clean_scan_required ? null : loaded?.state || null;
    const watchGroups = new Map();
    for (const root of roots) {
      const watchPath = root.watchPath || root.path;
      if (!watchGroups.has(watchPath)) watchGroups.set(watchPath, []);
      watchGroups.get(watchPath).push(root);
    }
    for (const [watchPath, watchedRoots] of watchGroups) {
      try {
        const handle = watchFactory(watchPath, { recursive: true }, (_event, filename) => {
          const relative = filename === undefined || filename === null ? null : String(filename).replaceAll('\\', '/');
          const matched = watchedRoots.filter(root => {
            if (relative === null) return true;
            const included = !(root.includeRelativePaths || []).length
              || root.includeRelativePaths.some(prefix => relative === prefix || relative.startsWith(`${prefix}/`));
            const ignored = (root.ignoredRelativePaths || []).some(prefix => (
              relative === prefix || relative.startsWith(`${prefix}/`)
            ));
            return included && !ignored;
          }).map(root => root.logicalRoot);
          if (matched.length) markDirty(matched);
        });
        handle.on?.('error', report);
        watchers.push(handle);
      } catch (error) { report(error); }
    }
    scheduleRepair();
    await reconcileDirty(rootNames);
  })().catch(error => {
    report(error);
    throw error;
  });

  return {
    ready,
    notify(logicalRoot) { markDirty([logicalRoot]); },
    async repair() { markDirty(rootNames, true); clearTimer('work'); return startWork(); },
    async flush() {
      do {
        const current = inFlight;
        if (current) await current;
        else await Promise.resolve();
      } while (inFlight || dirty.size || rerun);
    },
    async close() {
      if (closed) return;
      closed = true; dirty.clear(); rerun = false;
      clearTimer('work'); clearTimer('repair');
      for (const watcher of watchers.splice(0)) {
        try { watcher.close(); } catch { /* resource already closed */ }
      }
      await inFlight;
    },
  };
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp.${process.pid}.${randomUUID()}`;
  await writeFile(temporary, `${stableStringify(value)}\n`, 'utf8');
  await rename(temporary, path);
}

async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; }
}

export async function runRegistryWatcher(options) {
  const configPath = resolve(options.configPath);
  const config = options.config || JSON.parse(await readFile(configPath, 'utf8'));
  const configurationFingerprint = hash(config);
  const instanceId = randomUUID();
  const heartbeatMs = config.heartbeat_ms ?? 1_000;
  const controlPollMs = config.control_poll_ms ?? 250;
  let stopping = false;
  const publish = state => atomicJson(config.status_path, {
    schema_version: 1, state, instance_id: instanceId, pid: process.pid,
    heartbeat: Date.now(), configuration_fingerprint: configurationFingerprint,
    ...(reconcile.lastReconciliation ? { reconciliation: reconcile.lastReconciliation } : {}),
  });
  const reconcile = createRegistryReconciler(config);
  const controller = createRegistryWatcher({
    roots: config.roots,
    statePath: config.state_path,
    debounceMs: config.debounce_ms,
    maxLatencyMs: config.max_latency_ms,
    repairMs: config.repair_ms,
    reconcile,
    onError: async error => {
      await atomicJson(config.status_path, {
        schema_version: 1, state: 'error', instance_id: instanceId, pid: process.pid,
        heartbeat: Date.now(), configuration_fingerprint: configurationFingerprint, error: error.message,
      });
    },
  });
  await controller.ready;
  await publish('ready');
  const heartbeat = setInterval(() => { publish('ready').catch(() => {}); }, heartbeatMs);
  const control = setInterval(async () => {
    const request = await readJson(config.control_path);
    if (!request || request.instance_id !== instanceId || request.configuration_fingerprint !== configurationFingerprint) return;
    if (request.action === 'shutdown' || request.action === 'restart') {
      clearInterval(control); clearInterval(heartbeat); stopping = true;
      await controller.close();
      await publish('stopped');
      if (request.action === 'restart') {
        spawn(process.execPath, [fileURLToPath(import.meta.url), 'run', '--config', configPath], {
          detached: true, stdio: 'ignore',
        }).unref();
      }
    }
  }, controlPollMs);
  const close = async () => {
    if (stopping) return;
    stopping = true; clearInterval(control); clearInterval(heartbeat);
    await controller.close(); await publish('stopped');
  };
  process.once('SIGTERM', close);
  process.once('SIGINT', close);
  return { controller, instanceId, configurationFingerprint, close };
}

export function createRegistryReconciler(config, dependencies = {}) {
  const acquisitionOptions = {
    claudeRoot: config.claude_root,
    codexRoot: config.codex_root,
    ...(config.project_root ? { projectRoot: config.project_root, scopeId: config.scope_id } : {}),
  };
  const acquire = dependencies.acquireRegistry || acquireRegistry;
  const refresh = dependencies.refreshIncrementalAcquisition || refreshIncrementalAcquisition;
  const assemble = dependencies.assembleRegistry || assembleRegistry;
  const writeJson = dependencies.writeJson || atomicJson;
  let baseline = acquire(acquisitionOptions);

  const reconcile = async ({ diff }) => {
    const next = refresh(baseline, diff, acquisitionOptions);
    const built = assemble(next);
    await writeJson(config.candidate_path, built.registry);
    await writeJson(config.report_path, { diagnostics: built.diagnostics, summary: built.summary });
    baseline = next;
    reconcile.lastReconciliation = { strategy: 'incremental', lifecycle_hash: diff.hash || hash(diff) };
  };
  return reconcile;
}

function cliArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

if (process.argv[2] === 'run' && process.argv.includes('--config')) {
  const configPath = cliArgument('--config');
  if (!configPath) throw new Error('run requires --config');
  await runRegistryWatcher({ configPath });
}
