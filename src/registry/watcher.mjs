#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { watch } from 'node:fs';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { readFile, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanFingerprintTree, loadFingerprintState, saveFingerprintState } from './fingerprint.mjs';
import { diffFingerprintTrees } from './diff.mjs';
import { acquireRegistry, assembleRegistry, refreshIncrementalAcquisition } from './build.mjs';
import { reconcileCandidate as reconcileRegistryCandidate } from './reconcile.mjs';
import { mapCandidateRegistry } from './map.mjs';
import { isCanonicalMappingSafe, produceActivationVerification, createTestActivationVerifier } from './validate.mjs';
import { activateCandidate, recoverActiveVersion, rollbackActivation as rollbackActivationExport } from './activate.mjs';
import { stableStringify } from './schema.mjs';
import { publishCompiledIndex } from '../prompt/publish-index.mjs';
import { compatible, COMPILED_INDEX_COMPATIBILITY, loadCompiledIndex } from '../prompt/compile-index.mjs';
import { proposeCandidate, evaluateCandidate, applyCanaryDecision, isSafetyFix, deriveDemonstratedBenefit } from '../evolution/canary-controller.mjs';
import { createPersistentEvidenceStore } from '../evolution/evidence.mjs';
import { assessCalibration, evaluateCalibrationCorpus, measureRoutes, CALIBRATION_CORPUS } from '../evolution/perf-measure.mjs';
import { buildCandidateCalibrationRoute, buildKnownGoodCalibrationRoute } from '../evolution/candidate-calibration-route.mjs';
import { telemetryRecordToEvidence } from '../evolution/telemetry-bridge.mjs';

function hash(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function defaultScheduler() {
  return { now: Date.now, setTimeout, clearTimeout };
}

const INVALIDATION_TUPLE_MEMBER = Object.freeze({
  node: 'registry',
  edge: 'relationships',
  dependency: 'registry',
  adapter: 'contracts',
  'inference-rule': 'intent_policy',
  manifest: 'workflows',
  correction: 'contracts',
  'negative-evidence': 'health_policy',
});

export function deriveInvalidationInput(built, lifecycle = {}) {
  const events = (lifecycle.events || []).map(event => ({
    ...event,
    ...(event.change_class && !event.affected_tuple_member
      ? { affected_tuple_member: INVALIDATION_TUPLE_MEMBER[event.change_class] }
      : {}),
  }));
  const edges = [];
  for (const record of built.registry?.records || []) {
    for (const dependency of record.dependencies?.items || []) {
      edges.push({
        id: `dependency:${record.id}:${dependency.id}`,
        type: 'dependency',
        from_id: record.id,
        to_id: dependency.id,
      });
    }
  }
  for (const event of events) edges.push(...(event.references || []));
  edges.sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)));
  return {
    lifecycle: { ...lifecycle, events },
    references: { schema_version: 1, edges },
    relationships: built.relationships,
    overlays: built.overlays,
  };
}

// EVO-05: ingest telemetry.jsonl into the persistent evidence store before
// reading the canary window. Cursor-based incremental append avoids duplicate
// evidence on every reconcile (the watcher reconciles every few seconds; the
// telemetry file grows monotonically between rotations). The cursor records the
// last complete byte offset plus file identity; if the file is unchanged since
// the last ingest the call is a no-op. Rotation (file shrank) resets and
// re-ingests from the start — safe because a rotated file no longer contains
// the pre-rotation records already stored. Privacy-denied and non-canary-
// relevant records are skipped by telemetryRecordToEvidence before any append.
export function ingestTelemetryEvidence({
  store, telemetryPath, outcomePath, cursorPath, projectId,
  candidateVersion = null, epoch = null,
}) {
  let stat;
  try {
    stat = statSync(telemetryPath);
  } catch {
    return { ingested: 0, skipped: 'no_telemetry_file' };
  }
  let cursor = null;
  try {
    cursor = JSON.parse(readFileSync(cursorPath, 'utf8'));
  } catch {
    cursor = null;
  }
  const size = stat.size;
  const mtimeMs = stat.mtimeMs;
  if (cursor && cursor.size === size && cursor.mtimeMs === mtimeMs) {
    return { ingested: 0, skipped: 'unchanged' };
  }
  const sameFile = cursor
    && cursor.dev === stat.dev
    && cursor.ino === stat.ino
    && Number.isSafeInteger(cursor.offset)
    && cursor.offset >= 0
    && cursor.offset <= size;
  const startOffset = sameFile ? cursor.offset : 0;
  const remaining = readFileSync(telemetryPath).subarray(startOffset);
  const lastNewline = remaining.lastIndexOf(0x0a);
  const complete = lastNewline >= 0 ? remaining.subarray(0, lastNewline + 1) : Buffer.alloc(0);
  const lines = complete.toString('utf8').split('\n');
  const outcomes = new Map();
  try {
    for (const line of readFileSync(outcomePath, 'utf8').split('\n')) {
      if (!line) continue;
      try {
        const value = JSON.parse(line);
        if (/^[a-f0-9]{64}$/.test(value?.prompt_signature || '')) {
          outcomes.set(`${value.prompt_signature}:${value.runtime || ''}`, value.outcome || value.outcome_kind);
        }
      } catch { /* skip malformed outcome lines */ }
    }
  } catch { /* no correlated outcome file means no canary evidence */ }
  let ingested = 0;
  for (const line of lines) {
    if (line.length === 0) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    const outcome = outcomes.get(`${record.prompt_signature}:${record.runtime || ''}`) || null;
    const result = telemetryRecordToEvidence(record, {
      candidate_version: candidateVersion,
      epoch,
      outcome,
    });
    if (result.status !== 'accepted') continue;
    const appended = store.append(result.signal, { project_id: projectId });
    if (appended.status === 'stored') ingested += 1;
  }
  try {
    mkdirSync(dirname(cursorPath), { recursive: true, mode: 0o700 });
    writeFileSync(cursorPath, JSON.stringify({
      size,
      mtimeMs,
      dev: stat.dev,
      ino: stat.ino,
      offset: startOffset + complete.length,
    }), { mode: 0o600 });
  } catch {
    // Cursor persistence is best-effort; a failed write only risks re-ingesting
    // duplicates next reconcile (bounded by the 7d retention window filter).
  }
  return { ingested, skipped: startOffset > 0 ? 'incremental' : 'full' };
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
  const fallbackPollMs = options.fallbackPollMs ?? 250;
  const watchFactory = options.watchFactory || ((path, watchOptions, callback) => watch(path, watchOptions, callback));
  const readState = options.readState || (() => loadFingerprintState(options.statePath, rootNames));
  const scan = options.scan || scanFingerprintTree;
  const diff = options.diff || diffFingerprintTrees;
  const reconcile = options.reconcile || (async () => {});
  const writeState = options.writeState || (state => saveFingerprintState(options.statePath, state));
  const onReconciled = options.onReconciled;
  const onDirty = options.onDirty;
  const onError = options.onError || (() => {});
  const watchers = [];
  const dirty = new Set();
  let closed = false, timer = null, repairTimer = null, pollTimer = null, firstDirtyAt = null;
  let inFlight = null, rerun = false, baseline = null;
  let fallbackPolling = false;
  let pendingTrigger = 'filesystem-event';
  let generation = 0;
  let operational = {
    state: 'reconciling',
    reason_code: 'startup_reconciliation',
    active_generation_id: null,
    candidate_generation_id: 'generation-1',
    last_complete_reconciliation: null,
    trigger: 'startup',
    watcher_mode: 'native',
    pending_changes: [...rootNames],
    stale_roots: [],
    unreadable_roots: [],
    next_recovery_action: null,
    last_complete_fingerprint_state: null,
    last_complete_semantic_snapshot: null,
  };

  const AUTHORITATIVE_TRIGGERS = new Set([
    'startup', 'periodic-repair', 'dropped-events', 'ambiguous-event',
    'watcher-restart', 'root-replacement', 'fingerprint-mismatch',
  ]);

  function snapshotOperational() {
    return structuredClone(operational);
  }

  function setOperational(state, values = {}) {
    operational = { ...operational, state, ...values };
  }

  function clearTimer(name) {
    const value = name === 'work' ? timer : name === 'repair' ? repairTimer : pollTimer;
    if (value !== null) scheduler.clearTimeout(value);
    if (name === 'work') timer = null;
    else if (name === 'repair') repairTimer = null;
    else pollTimer = null;
  }

  function report(error) {
    if (!closed) onError(error instanceof Error ? error : new Error(String(error)));
  }

  function scheduleFallbackPoll() {
    // ponytail: rescan all roots only while native watching is unavailable; move
    // to per-root polling if resource-exhaustion recovery becomes measurable.
    if (closed || !fallbackPolling || pollTimer !== null) return;
    pollTimer = scheduler.setTimeout(async () => {
      pollTimer = null;
      if (closed) return;
      try {
        const current = await scan(roots);
        if (baseline && current.hash !== baseline.hash) markDirty(rootNames, true, 'ambiguous-event');
      } catch (error) {
        report(error);
      } finally {
        scheduleFallbackPoll();
      }
    }, fallbackPollMs);
  }

  function startFallbackPolling(error) {
    if (closed || fallbackPolling || !['EMFILE', 'ENOSPC'].includes(error?.code)) return;
    fallbackPolling = true;
    operational = { ...operational, watcher_mode: 'polling-fallback', reason_code: 'native_watcher_unavailable' };
    scheduleFallbackPoll();
  }

  function scheduleRepair() {
    clearTimer('repair');
    if (closed) return;
    repairTimer = scheduler.setTimeout(() => {
      repairTimer = null;
      markDirty(rootNames, true, 'periodic-repair');
      scheduleRepair();
    }, repairMs);
  }

  async function reconcileDirty(names, trigger) {
    const candidateGenerationId = `generation-${generation + 1}`;
    setOperational('reconciling', {
      reason_code: 'reconciliation_in_progress',
      candidate_generation_id: candidateGenerationId,
      trigger,
      pending_changes: [...names].sort(),
      stale_roots: [],
      unreadable_roots: [],
      next_recovery_action: null,
    });
    try {
      const current = await scan(roots);
      const incompleteRoots = (current.logicalRoots || []).filter(root => root.complete === false);
      if (incompleteRoots.length) {
        const unreadableRoots = incompleteRoots
          .filter(root => (root.diagnosticCodes || []).some(code => ['access_denied', 'read_error', 'scan_error'].includes(code)))
          .map(root => root.logicalRoot).sort();
        const staleRoots = incompleteRoots.map(root => root.logicalRoot).sort();
        setOperational('degraded', {
          reason_code: 'incomplete_scan',
          candidate_generation_id: candidateGenerationId,
          pending_changes: [...names].sort(),
          stale_roots: staleRoots,
          unreadable_roots: unreadableRoots,
          next_recovery_action: 'authoritative-repair',
        });
        return;
      }
      const lifecycle = diff(baseline, current);
      const derivedTrigger = (current.logicalRoots || []).some(root => (root.diagnosticCodes || []).includes('root_replaced'))
        ? 'root-replacement'
        : (lifecycle.diagnostics || []).some(item => item.code === 'fingerprint_mismatch')
          ? 'fingerprint-mismatch'
          : trigger;
      const result = await reconcile({ roots: names, previous: baseline, current, diff: lifecycle, trigger: derivedTrigger });
      await writeState(current);
      baseline = current;
      generation += 1;
      setOperational('current', {
        reason_code: 'reconciliation_complete',
        active_generation_id: candidateGenerationId,
        candidate_generation_id: null,
        last_complete_reconciliation: scheduler.now(),
        trigger: derivedTrigger,
        pending_changes: [],
        stale_roots: [],
        unreadable_roots: [],
        next_recovery_action: null,
        last_complete_fingerprint_state: structuredClone(current),
        last_complete_semantic_snapshot: result?.semanticSnapshot
          ? structuredClone(result.semanticSnapshot)
          : operational.last_complete_semantic_snapshot,
      });
      if (onReconciled) await onReconciled(snapshotOperational());
    } catch (error) {
      setOperational('failed', {
        reason_code: error?.code || 'reconciliation_failed',
        candidate_generation_id: candidateGenerationId,
        pending_changes: [...names].sort(),
        stale_roots: [...names].sort(),
        next_recovery_action: 'authoritative-repair',
      });
      throw error;
    }
  }

  function startWork() {
    if (closed || dirty.size === 0) return inFlight || Promise.resolve();
    if (inFlight) { rerun = true; return inFlight; }
    clearTimer('work');
    const names = [...dirty].sort();
    const trigger = pendingTrigger;
    pendingTrigger = 'filesystem-event';
    dirty.clear(); firstDirtyAt = null;
    inFlight = reconcileDirty(names, trigger).catch(report).finally(() => {
      inFlight = null;
      if (closed) return;
      if (rerun || dirty.size) {
        rerun = false;
        startWork();
      }
    });
    return inFlight;
  }

  function markDirty(names, immediate = false, trigger = 'filesystem-event') {
    if (closed) return;
    for (const name of names) dirty.add(name);
    if (AUTHORITATIVE_TRIGGERS.has(trigger) || pendingTrigger === 'filesystem-event') pendingTrigger = trigger;
    const now = scheduler.now();
    if (firstDirtyAt === null) firstDirtyAt = now;
    setOperational('reconciling', {
      reason_code: 'event_accepted',
      trigger: pendingTrigger,
      pending_changes: [...dirty].sort(),
    });
    if (onDirty) Promise.resolve(onDirty(snapshotOperational())).catch(report);
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
              prefix.startsWith('*.')
                ? relative.endsWith(prefix.slice(1))
                : relative === prefix || relative.startsWith(`${prefix}/`)
            ));
            return included && !ignored;
          }).map(root => root.logicalRoot);
          if (matched.length) markDirty(matched, relative === null, relative === null ? 'ambiguous-event' : 'filesystem-event');
        });
        handle.on?.('error', error => {
          report(error);
          startFallbackPolling(error);
        });
        watchers.push(handle);
      } catch (error) {
        report(error);
        startFallbackPolling(error);
      }
    }
    scheduleRepair();
    await reconcileDirty(rootNames, 'startup');
  })().catch(error => {
    report(error);
    throw error;
  });

  return {
    ready,
    notify(logicalRoot) { markDirty([logicalRoot]); },
    inspect: snapshotOperational,
    async authoritative(trigger = 'dropped-events') {
      if (!AUTHORITATIVE_TRIGGERS.has(trigger)) throw new TypeError(`unsupported authoritative trigger: ${trigger}`);
      markDirty(rootNames, true, trigger);
      clearTimer('work');
      return startWork();
    },
    async repair() { markDirty(rootNames, true, 'periodic-repair'); clearTimer('work'); return startWork(); },
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
      clearTimer('work'); clearTimer('repair'); clearTimer('poll');
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

export function rebuildRuntimeArtifacts(config, { run = null } = {}) {
  const artifacts = Array.isArray(config?.runtime_artifacts) ? config.runtime_artifacts : [];
  if (artifacts.length === 0) return { status: 'skipped', builds: [] };
  const runner = run || ((artifact, env) => spawnSync(process.execPath, [artifact.builder_path], {
    env, encoding: 'utf8', timeout: config.runtime_artifact_timeout_ms ?? 30_000,
  }));
  const builds = artifacts.map((artifact) => {
    const env = {
      ...process.env,
      ROUTER_RUNTIME: artifact.runtime,
      ROUTER_CLAUDE_HOME: config.claude_root,
      ROUTER_CODEX_HOME: config.codex_root,
      ROUTER_AGENTS_SKILLS_DIR: join(dirname(config.claude_root), '.agents', 'skills'),
      ROUTER_CLAUDE_JSON: join(dirname(config.claude_root), '.claude.json'),
      ROUTER_MANIFEST_OUT: artifact.manifest_path,
      ROUTER_MODE_MAP_PATH: artifact.mode_map_path,
      ROUTER_COVERAGE_REPORT_PATH: artifact.coverage_report_path,
      ROUTER_HOOK_PATH: artifact.hook_path,
      ROUTER_PROJECT_SKILL_DIRS: config.project_root || '',
      ROUTER_PROJECT_MCP_JSON: config.project_root ? join(config.project_root, '.mcp.json') : '',
      ROUTER_PROJECT_CONFIG_PATH: config.project_root || '',
    };
    let result;
    try { result = runner(artifact, env); }
    catch (error) { result = { status: null, error }; }
    return {
      runtime: artifact.runtime,
      status: result?.status ?? null,
      ok: result?.status === 0 && !result?.error,
      ...(result?.error ? { error: result.error.message || String(result.error) } : {}),
    };
  });
  return { status: builds.every(build => build.ok) ? 'built' : 'failed', builds };
}

export async function finishWatcherShutdown(controller, publish, removeSignalHandlers) {
  try {
    await controller.close();
    await publish('stopped');
  } finally {
    removeSignalHandlers();
  }
}

export async function runRegistryWatcher(options) {
  const configPath = options.configPath ? resolve(options.configPath) : null;
  const config = options.config || (configPath ? JSON.parse(await readFile(configPath, 'utf8')) : null);
  if (!config) throw new Error('runRegistryWatcher requires either options.config or options.configPath');
  // verification_runners may carry function-valued runner objects when test_mode is opted in
  // (an in-process test harness reattaches them after reading the on-disk config). They are
  // not part of the configuration fingerprint: strip them before hashing so the fingerprint
  // matches the one installRouter computed from the serialized (runner-free) config.
  const { verification_runners: _runners, ...fingerprintable } = config;
  const configurationFingerprint = hash(fingerprintable);
  const instanceId = randomUUID();
  const heartbeatMs = config.heartbeat_ms ?? 1_000;
  const controlPollMs = config.control_poll_ms ?? 250;
  let stopping = false;
  let controller;
  const publish = state => {
    const watcher = controller?.inspect();
    const publishedState = state === 'ready' && watcher?.state !== 'current' ? watcher?.state || state : state;
    return atomicJson(config.status_path, {
    schema_version: 1, state: publishedState, instance_id: instanceId, pid: process.pid,
    heartbeat: Date.now(), configuration_fingerprint: configurationFingerprint,
    ...(watcher ? { watcher: {
      state: watcher.state, trigger: watcher.trigger, pending_changes: watcher.pending_changes,
    } } : {}),
    ...(reconcile.lastReconciliation ? { reconciliation: reconcile.lastReconciliation } : {}),
  });
  };
  const reconcileDependencies = config.test_mode === true
    ? { produceActivationVerification: createTestActivationVerifier(config.verification_runners || {}),
        onPublished: () => publish('ready'),
      }
    : { onPublished: () => publish('ready') };
  reconcileDependencies.refreshRuntimeArtifacts = options.refreshRuntimeArtifacts
    || (context => rebuildRuntimeArtifacts(context.config));
  const reconcile = createRegistryReconciler(config, reconcileDependencies);
  controller = createRegistryWatcher({
    roots: config.roots,
    statePath: config.state_path,
    debounceMs: config.debounce_ms,
    maxLatencyMs: config.max_latency_ms,
    repairMs: config.repair_ms,
    reconcile,
    onDirty: () => publish('ready'),
    onReconciled: () => publish('ready'),
    onError: async error => {
      await atomicJson(config.status_path, {
        schema_version: 1, state: 'error', instance_id: instanceId, pid: process.pid,
        heartbeat: Date.now(), configuration_fingerprint: configurationFingerprint, error: error.message,
      });
    },
  });
  await controller.ready;
  await publish('ready');
  // If close() was called while we were awaiting controller.ready/publish('ready') (the
  // in-process test launcher can kill the child before runRegistryWatcher resolves), skip
  // interval/handler registration so nothing leaks past the close. stopping is set by close().
  if (stopping) return { controller, instanceId, configurationFingerprint, close: async () => {} };
  const heartbeat = setInterval(() => { publish('ready').catch(() => {}); }, heartbeatMs);
  let control = null;
  const onSigterm = () => { close().catch(() => {}); };
  const onSigint = () => { close().catch(() => {}); };
  const removeSignalHandlers = () => {
    process.off('SIGTERM', onSigterm);
    process.off('SIGINT', onSigint);
  };
  const pollControl = async () => {
    try {
      const request = await readJson(config.control_path);
      if (!request || request.instance_id !== instanceId || request.configuration_fingerprint !== configurationFingerprint) return;
      if (request.action === 'repair') {
        await controller.repair();
        await controller.flush();
        await publish('ready');
        await rm(config.control_path, { force: true });
        return;
      }
      if (request.action === 'shutdown' || request.action === 'restart') {
        clearInterval(heartbeat); stopping = true;
        await finishWatcherShutdown(controller, publish, removeSignalHandlers);
        await rm(config.control_path, { force: true });
        if (request.action === 'restart' && configPath) {
          spawn(process.execPath, [fileURLToPath(import.meta.url), 'run', '--config', configPath], {
            detached: true, stdio: 'ignore',
          }).unref();
        }
      }
    } catch (error) {
      await atomicJson(config.status_path, {
        schema_version: 1, state: 'error', instance_id: instanceId, pid: process.pid,
        heartbeat: Date.now(), configuration_fingerprint: configurationFingerprint, error: error.message,
      }).catch(() => {});
    } finally {
      if (!stopping) control = setTimeout(pollControl, controlPollMs);
    }
  };
  control = setTimeout(pollControl, controlPollMs);
  const close = async () => {
    if (stopping) return;
    stopping = true; clearTimeout(control); clearInterval(heartbeat);
    await finishWatcherShutdown(controller, publish, removeSignalHandlers);
  };
  process.once('SIGTERM', onSigterm);
  process.once('SIGINT', onSigint);
  return { controller, instanceId, configurationFingerprint, close };
}

export function createRegistryReconciler(config, dependencies = {}) {
  const acquisitionOptions = {
    claudeRoot: config.claude_root,
    codexRoot: config.codex_root,
    ...(config.project_root ? { projectRoot: config.project_root, scopeId: config.scope_id } : {}),
    // modeMapPath flows through to buildFullRegistry/buildIncrementalRegistry inside
    // the incremental_full_equivalence gate, so the gate's rebuilt registries get the
    // SAME mode-map stamping as the candidate. Without it the candidate (stamped) and
    // the rebuilt incremental/full (un-stamped) differ → bytes mismatch → gate fails.
    ...(config.mode_map_path ? { modeMapPath: config.mode_map_path } : {}),
    // workflowDeclarationsPath: the orchestrator's declared workflow_ids are stamped
    // onto matching records so the compiled index has routes for every declared
    // workflow (e.g. gsd-execute-phase). Without this the calibration quality gate
    // fails (the corpus routes through gsd-execute-phase) and the canary rolls back.
    ...(config.workflow_declarations_path ? { workflowDeclarationsPath: config.workflow_declarations_path } : {}),
    ...(config.contract_overlays ? { overlays: config.contract_overlays } : {}),
  };
  const acquire = dependencies.acquireRegistry || acquireRegistry;
  const refresh = dependencies.refreshIncrementalAcquisition || refreshIncrementalAcquisition;
  const assemble = dependencies.assembleRegistry || assembleRegistry;
  const evaluate = dependencies.reconcileCandidate || reconcileRegistryCandidate;
  const mapper = dependencies.mapCandidateRegistry || mapCandidateRegistry;
  const verifier = dependencies.produceActivationVerification || produceActivationVerification;
  const activator = dependencies.activateCandidate || activateCandidate;
  const rollbackActivation = dependencies.rollbackActivation || rollbackActivationExport;
  const recovery = dependencies.recoverActiveVersion || recoverActiveVersion;
  const publishIndex = dependencies.publishCompiledIndex || publishCompiledIndex;
  const canaryDecision = dependencies.applyCanaryDecision || applyCanaryDecision;
  const buildCandidateRoute = dependencies.buildCandidateCalibrationRoute || buildCandidateCalibrationRoute;
  const buildKnownGoodRoute = dependencies.buildKnownGoodCalibrationRoute || buildKnownGoodCalibrationRoute;
  const measure = dependencies.measureRoutes || measureRoutes;
  const assess = dependencies.assessCalibration || assessCalibration;
  const evaluateCorpus = dependencies.evaluateCalibrationCorpus || evaluateCalibrationCorpus;
  const createEvidenceStore = dependencies.createPersistentEvidenceStore || createPersistentEvidenceStore;
  const compatibleFn = dependencies.compatible || compatible;
  const onPublished = dependencies.onPublished;
  const refreshRuntimeArtifacts = dependencies.refreshRuntimeArtifacts;
  const writeJson = dependencies.writeJson || atomicJson;
  const readActive = dependencies.readActive || (async () => {
    const empty = () => {
      const registry = { schema_version: 1, records: [] };
      const bytes = `${stableStringify(registry)}\n`;
      return { registry, bytes, fingerprint: createHash('sha256').update(bytes).digest('hex'), authority_status: 'empty' };
    };
    if (!config.activation_root) {
      return empty();
    }
    try {
      const tuple = loadCompiledIndex({ ownedRoot: resolve(config.activation_root) });
      if (!tuple.dispatch_eligible || !tuple.registry) return empty();
      const bytes = `${stableStringify(tuple.registry)}\n`;
      return { registry: tuple.registry, bytes, fingerprint: createHash('sha256').update(bytes).digest('hex'), authority_status: 'active', tuple_version_id: tuple.tuple_version_id };
    } catch (error) {
      if (error?.code === 'ENOENT') return empty();
      throw error;
    }
  });
  let baseline = acquire(acquisitionOptions);
  // Blocker-1 fix: the registry baseline above is module-scope and was previously
  // NEVER re-acquired. `refreshIncrementalAcquisition` only replaces
  // dirty-root observations, so small errors accumulate over hours of ~/.claude
  // churn until hook observations are corrupted (stale file pairing) and the
  // reconciler quarantines the candidate with `hook_orphan_binding`. Bound the
  // drift by periodically re-acquiring the FULL registry: every
  // FULL_REACQUIRE_EVENT_THRESHOLD cumulative lifecycle events, drop the
  // incremental path and rebuild the baseline from a fresh `acquire()`. The
  // equivalence gate is fed an empty diff on that reconcile so
  // incremental(empty)===full===candidate stays coherent.
  let cumulativeEvents = 0;
  const FULL_REACQUIRE_EVENT_THRESHOLD = 500;

  const reconcile = async ({ diff, trigger }) => {
    // CR-01: reset `recovered` per reconcile call so the recovery block (and
    // thus the canary path with its 6 REQUIRED_GATES + evidence sufficiency
    // gate) runs on EVERY eligible reconcile, not just the first. Previously
    // declared at factory scope, the flag persisted across calls: after the
    // first successful recovery set recovered=true, every subsequent
    // reconcile skipped recovery, knownGood stayed null, and the bootstrap
    // path bypassed applyCanaryDecision.
    let recovered = false;
    cumulativeEvents += (diff?.events?.length || 0);
    const doFullAcquire = cumulativeEvents >= FULL_REACQUIRE_EVENT_THRESHOLD;
    let next;
    let equivalenceDiff;
    if (doFullAcquire) {
      baseline = acquire(acquisitionOptions);
      next = baseline;
      // Empty lifecycle for the equivalence gate: refresh(baseline, empty)
      // returns baseline unchanged, so incremental===full===candidate.
      equivalenceDiff = { events: [], diagnostics: [] };
      cumulativeEvents = 0;
    } else {
      next = refresh(baseline, diff, acquisitionOptions);
      equivalenceDiff = diff;
    }
    const built = assemble(next, acquisitionOptions);
    const active = await readActive();
    const invalidation = deriveInvalidationInput(built, diff);
    const report = evaluate({
      candidate: built.registry,
      active,
      ...invalidation,
      aliases: config.aliases || [],
      mappings: config.mappings || [],
      runtimeRoots: { claude: config.claude_root, codex: config.codex_root },
      ...(config.scope ? { scope: config.scope } : {}),
    });
    const candidatePublication = report.disposition === 'eligible'
      ? { ...built.registry, disposition: 'eligible', activated: false, candidate_fingerprint: report.candidate_fingerprint }
      : {
          schema_version: 1,
          disposition: 'quarantined',
          activated: false,
          candidate_fingerprint: report.candidate_fingerprint,
          verdicts: report.verdicts,
        };
    const reportPublication = {
      ...report,
      diagnostics: built.diagnostics,
      summary: { ...built.summary, activated: false },
    };
    await writeJson(config.candidate_path, candidatePublication);
    await writeJson(config.report_path, reportPublication);
    if (refreshRuntimeArtifacts) {
      const artifactResult = await refreshRuntimeArtifacts({ config, diff, trigger });
      if (artifactResult?.status === 'failed') {
        const error = new Error('runtime inventory artifact refresh failed');
        error.code = 'runtime_artifact_refresh_failed';
        error.builds = artifactResult.builds;
        throw error;
      }
    }
    reconcile.lastReconciliation = {
      strategy: 'incremental',
      ...(trigger ? { trigger } : {}),
      lifecycle_hash: diff.hash || hash(diff),
      disposition: report.disposition,
      active_bytes: report.active_bytes,
      active_fingerprint: report.active_fingerprint,
      publication_status: 'published',
    };
    if (onPublished) await onPublished(reconcile.lastReconciliation);
    let activation = { activation_status: 'preserved', reason_code: report.disposition };
    let verificationEvidence = null;
    if (config.activation_root) {
      let recoveryReady = recovered || active.authority_status === 'empty';
      let knownGood = null;
      if (!recovered && active.authority_status !== 'empty') {
        const recoveryResult = await recovery({ ownedRoot: config.activation_root, test_mode: config.test_mode === true });
        if (['healthy', 'recovered'].includes(recoveryResult.recovery_status)) {
          recovered = true;
          recoveryReady = true;
          knownGood = recoveryResult.version_id || null;
        } else if (recoveryResult.recovery_status === 'blocked' && recoveryResult.reason_code === 'no_valid_history') {
          if (active.tuple_version_id) {
            // A verified release tuple is already the authoritative route source.
            // The legacy registry version store may be absent after lifecycle
            // repair, so do not treat this as first-ever bootstrap or publish a
            // zero-route recommendation-only candidate over the known-good tuple.
            activation = { activation_status: 'preserved', reason_code: 'release_tuple_active' };
            recoveryReady = false;
          } else {
            // Bootstrap: first-ever activation (no valid history to roll back to).
            // Route through the existing activator path with reason:'watcher'.
            recoveryReady = true;
            knownGood = null;
          }
        } else if (recoveryResult.recovery_status === 'blocked') {
          activation = { activation_status: 'preserved', reason_code: recoveryResult.reason_code || 'recovery_blocked' };
          recoveryReady = false;
        } else {
          activation = { activation_status: 'recovery_required', reason_code: recoveryResult.reason_code };
          recoveryReady = false;
        }
      }
      // Test mode bypasses the canary evidence gate: the canary path is a production
      // safety mechanism that requires a sufficient evidence window (>=30 samples)
      // before promoting. test_mode already opts in to stub verification runners for
      // lifecycle/recovery tests that exercise the watcher→controller→compiled-index
      // seam without evidence infrastructure. Production never sets test_mode, so the
      // canary gate is fully active in production. (T-20-14: test_mode is not a trigger.)
      if (config.test_mode === true) knownGood = null;
      if (report.disposition === 'eligible' && recoveryReady) {
        const mapping = await mapper({ candidate: built.registry, reconciliation: report, lifecycle: diff, existingMappings: config.mappings || [], policy: config.mapping_policy });
        if (isCanonicalMappingSafe(mapping)) {
          const verification = await verifier({
            candidate: built.registry, reconciliation: report, mapping, policy: config.activation_policy || {},
            equivalence: { previous: baseline, diff: equivalenceDiff, options: acquisitionOptions },
          });
          verificationEvidence = {
            disposition: verification?.disposition || null,
            complete: verification?.complete === true,
            gate_count: Array.isArray(verification?.gates) ? verification.gates.length : 0,
            failed_gate_ids: (verification?.gates || []).filter(gate => gate?.passed !== true).map(gate => gate?.id).filter(Boolean).slice(0, 8),
            verification_fingerprint: verification?.verification_fingerprint || null,
          };
          if (verification.disposition === 'passing' && verification.complete === true) {
            if (knownGood === null) {
              // Bootstrap path: no known-good version exists to canary against.
              // Activate directly with reason:'watcher' (first activation becomes
              // the known-good; no canary rollback possible — RESEARCH.md:376).
              activation = await activator({ ownedRoot: config.activation_root, candidate: built.registry, reconciliation: report, mapping, policy: config.activation_policy || {}, verification, reason: 'watcher', test_mode: config.test_mode === true });
              if (activation.activation_status === 'activated' && activation.version_id) {
                // Publish can fail closed on a zero-route registry: publishIndex
                // enforces ORC-01 ('at least one dispatch route') and throws on
                // an empty mapping (D-06). On a fresh install with no inventory
                // the bootstrap mapping has zero mapped subjects, so publish
                // throws. An uncaught throw here propagates through the
                // controller's `ready` reconcile and crashes the watcher before
                // it ever publishes a `ready` status. Roll the activation back
                // to the pre-bootstrap state (no valid history → remove the
                // active pointer + the just-written orphan version) and report
                // `preserved` instead of crashing. The controller reaches
                // `ready`; a later reconcile after inventory appears activates
                // normally. Unit bootstrap tests stub publishCompiledIndex to
                // succeed, so this branch is a no-op for them.
                try {
                  const publication = await publishIndex({
                    ownedRoot: config.activation_root, registry: built.registry,
                    registryVersionId: activation.version_id, mapping,
                    policyFingerprint: verification.policy_fingerprint, now: verification.generated_at || Date.now(),
                    contracts: built.contracts, relationships: built.relationships,
                    intentPolicy: built.intent_policy, workflows: built.workflows,
                    healthPolicy: built.health_policy, suggestionReference: built.suggestion_reference,
                  });
                  if (publication.publication_status !== 'published') throw new Error('compiled_tuple_not_published');
                  activation = { ...activation, ...publication };
                } catch (error) {
                  await rollbackActivation({ ownedRoot: config.activation_root, versionId: activation.version_id });
                  activation = { activation_status: 'preserved', reason_code: 'bootstrap_publish_failed', ...(error?.message ? { publish_error: error.message } : {}) };
                }
              }
            } else {
              // Canary path: eligible + known-good present. Gate on evidence
              // sufficiency, construct the 6 REQUIRED_GATES, derive
              // demonstrated_benefit via D-05 (candidate vs known-good
              // measureRoutes), and delegate publication mutation exclusively
              // through applyCanaryDecision -> REGISTRY_PUBLICATION.
              const store = createEvidenceStore({ root: join(config.activation_root, 'evidence') });
              // EVO-05: populate the evidence store from telemetry.jsonl before
              // reading the window. Without this the store stays empty, window()
              // always returns sufficient:false, and the canary promote/rollback
              // branches are unreachable (the production trigger is starved of
              // data). Cursor-based ingest is a no-op when the file is unchanged.
              ingestTelemetryEvidence({
                store,
                telemetryPath: config.telemetry_path || join(config.activation_root, 'telemetry.jsonl'),
                outcomePath: config.outcome_path || join(config.activation_root, 'shadow-log.jsonl'),
                cursorPath: join(config.activation_root, 'evidence', 'ingest-cursor.json'),
                projectId: config.scope_id || config.scope || 'global',
                candidateVersion: report.candidate_fingerprint,
                epoch: report.candidate_fingerprint,
              });
              const window = store.window({
                project_id: config.scope_id || config.scope || 'global',
                candidate_version: report.candidate_fingerprint,
                epoch: report.candidate_fingerprint,
              });
              if (window.sufficient !== true) {
                activation = { activation_status: 'preserved', reason_code: 'insufficient_evidence_samples' };
              } else {
                let candidateCtx = null, knownGoodCtx = null;
                try {
                  const helperNow = verification.generated_at || Date.now();
                  candidateCtx = buildCandidateRoute({ registry: built.registry, mapping, policyFingerprint: verification.policy_fingerprint, now: helperNow, deps: dependencies.helperDeps });
                  knownGoodCtx = buildKnownGoodRoute({ ownedRoot: config.activation_root, now: helperNow, deps: dependencies.helperDeps });
                  const versionsBase = { policy: COMPILED_INDEX_COMPATIBILITY.policy_version, corpus: 'router-calibration-v1' };
                  const candidateEvaluation = evaluateCorpus({ corpus: CALIBRATION_CORPUS, route: candidateCtx.route, versions: { candidate: report.candidate_fingerprint, compiled_index: candidateCtx.versionId, ...versionsBase } });
                  const knownGoodEvaluation = evaluateCorpus({ corpus: CALIBRATION_CORPUS, route: knownGoodCtx.route, versions: { candidate: knownGood, compiled_index: knownGood, ...versionsBase } });
                  const candidatePerf = measure({ fixtures: CALIBRATION_CORPUS, route: candidateCtx.route, versions: { candidate: report.candidate_fingerprint, compiled_index: candidateCtx.versionId, ...versionsBase } });
                  const assessed = assess({ evaluation: candidateEvaluation, performance: candidatePerf });
                  const privacyPass = !(window.observations || []).some((r) => (
                    r?.signal?.confidence_band === 'deny_filtered'
                    || (r?.signal?.guard_codes || []).some((c) => ['privacy_guard', 'deny_filtered', 'secret_detected', 'content_detected'].includes(c))
                  ));
                  const gates = {
                    safety: { pass: report.disposition === 'eligible', reason_code: report.disposition === 'eligible' ? 'safety_passed' : 'safety_uncertain' },
                    privacy: { pass: privacyPass, reason_code: 'privacy_passed' },
                    quality: candidateEvaluation.quality,
                    context_budget: candidateEvaluation.context_budget,
                    latency: assessed.latency,
                    compatibility: { pass: compatibleFn(built.registry.compatibility || built.candidateMetadata?.compatibility) === true, reason_code: 'compatibility_passed' },
                  };
                  const proposed = proposeCandidate({
                    source_evidence_fingerprint: window.source_evidence_fingerprint,
                    policy_version: COMPILED_INDEX_COMPATIBILITY.policy_version,
                    compiled_index_version: candidateCtx.versionId || report.candidate_fingerprint,
                    evaluation_inputs: { corpus: CALIBRATION_CORPUS, gates },
                    proposal: { registry: built.registry, mapping, reconciliation: report },
                  });
                  const candidate = proposed.candidate;
                  const evaluation = evaluateCandidate({ candidate, evidence_window: window, gates, known_good_version: knownGood });
                  // D-05 demonstrated_benefit derivation is shared with the CLI
                  // promote path via deriveDemonstratedBenefit
                  // (evolution/canary-controller.mjs) so the watcher and CLI cannot
                  // diverge on the promotion predicate.
                  const demonstrated_benefit = deriveDemonstratedBenefit({ evaluation, candidateEvaluation, knownGoodEvaluation, assessed, reconciliation: report });
                  const decision = canaryDecision({
                    evaluation,
                    demonstrated_benefit,
                    activation: { ownedRoot: config.activation_root, candidate: built.registry, reconciliation: report, mapping, policy: config.activation_policy || {}, verification, reason: 'canary', test_mode: config.test_mode === true },
                    ownedRoot: config.activation_root,
                    known_good_version: knownGood,
                    published_version: active.tuple_version_id || active.version_id || null,
                    rollback_reason: 'canary_rollback',
                  });
                  if (decision.status === 'promoted') {
                    activation = { activation_status: 'activated', version_id: decision.active_version, ...decision };
                    if (decision.active_version) {
                      try {
                        const publication = await publishIndex({
                          ownedRoot: config.activation_root, registry: built.registry,
                          registryVersionId: decision.active_version, mapping,
                          policyFingerprint: verification.policy_fingerprint, now: verification.generated_at || Date.now(),
                          contracts: built.contracts, relationships: built.relationships,
                          intentPolicy: built.intent_policy, workflows: built.workflows,
                          healthPolicy: built.health_policy, suggestionReference: built.suggestion_reference,
                        });
                        if (publication.publication_status !== 'published') throw new Error('compiled_tuple_not_published');
                        activation = { ...activation, ...publication };
                      } catch (error) {
                        const restored = await rollbackActivation({
                          ownedRoot: config.activation_root,
                          versionId: decision.active_version,
                          previousVersionId: knownGood,
                          test_mode: config.test_mode === true,
                        });
                        activation = {
                          activation_status: restored.rollback_status === 'rolled_back' ? 'preserved' : 'recovery_required',
                          reason_code: restored.rollback_status === 'rolled_back' ? 'canary_publish_failed' : restored.reason_code,
                          ...(error?.message ? { publish_error: error.message } : {}),
                        };
                      }
                    }
                  } else if (decision.status === 'rolled_back') {
                    activation = { activation_status: 'rolled_back', reason_code: decision.reason_code };
                  } else if (decision.status === 'preserved') {
                    activation = { activation_status: 'preserved', reason_code: decision.reason_code || 'canary_preserved' };
                  } else if (decision.status === 'recovery_required') {
                    activation = { activation_status: 'recovery_required', reason_code: decision.reason_code };
                  } else {
                    activation = { activation_status: 'preserved', reason_code: decision.reason_code || 'canary_rejected' };
                  }
                } finally {
                  // Backstop (T-20-25): cleanup D-04 helper temp ownedRoots on
                  // every path including exceptions — no tempdir leak across
                  // reconciles.
                  candidateCtx?.cleanup?.();
                  knownGoodCtx?.cleanup?.();
                }
              }
            }
          } else activation = { activation_status: 'preserved', reason_code: 'verification_non_passing' };
        } else activation = { activation_status: 'preserved', reason_code: 'mapping_ambiguous' };
      }
    }
    baseline = next;
    reconcile.lastReconciliation = {
      ...reconcile.lastReconciliation,
      ...(config.activation_root ? {
        activation_status: activation.activation_status,
        activation_reason: activation.reason_code || null,
        ...(activation.tuple_version_id ? { tuple_version_id: activation.tuple_version_id } : {}),
      } : {}),
      ...(verificationEvidence ? { verification: verificationEvidence } : {}),
    };
  };
  return reconcile;
}

export function createTestRegistryReconciler(config, dependencies) {
  if (!dependencies || typeof dependencies !== 'object') throw new TypeError('test dependencies required');
  return createRegistryReconciler(config, dependencies);
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
